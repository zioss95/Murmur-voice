import "dotenv/config";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { EdgeTTS } from "node-edge-tts";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const CHAT_MODEL = "openai/gpt-oss-20b";
const EARS_MODEL = "whisper-large-v3";
const AUDIO_FILE = "recording.wav";
const REPLY_FILE = path.resolve("reply.mp3");
const MIC_DEVICE = "0";
const GITHUB_URL = "https://github.com/zioss95";

// The human voice. Other good choices:
// en-US-AvaNeural, en-US-EmmaNeural (women), en-US-AndrewNeural, en-US-GuyNeural (men)
const VOICE = "en-US-AriaNeural";

// Set to false if you want Murmur to react to everything again
const USE_WAKE_WORD = true;

// Apps Murmur is allowed to open. Add your own here.
const APPS: Record<string, string> = {
  chrome: "chrome",
  notepad: "notepad",
  calculator: "calc",
  "file explorer": "explorer",
};

// The wake phrase is "Wake up", optionally followed by "Murmur".
// Whisper sometimes spells things differently, so a few variants are accepted.
const WAKE_PATTERN =
  /^\W*(wake up|wake-up|wakeup|wait up|wake app)(\W+(murmur|murmer|mermaid|memory))?\b\W*/i;

// The sleep phrase is "Sleep now". "Goodbye" works too as a backup.
const GOODBYE_PATTERN =
  /^\W*(sleep now|sleep|goodbye|good bye|bye|bye bye|stop|quit|exit)\W*$/i;

// Returns null if there is no wake phrase, or the request after it (maybe empty)
function stripWakeWord(text: string): string | null {
  const match = text.match(WAKE_PATTERN);
  if (!match) return null;
  return text.slice(match[0].length).trim();
}

// The ears, hands-free: waits for speech, stops when you go quiet.
// Tuned for a soft, slow voice: starts at 1% volume, waits 1.5 seconds of quiet.
async function record(): Promise<boolean> {
  if (fs.existsSync(AUDIO_FILE)) fs.unlinkSync(AUDIO_FILE);

  const sox = spawn("sox", [
    "-t", "waveaudio", MIC_DEVICE,
    "-r", "16000",
    "-c", "1",
    "-b", "16",
    AUDIO_FILE,
    "silence", "1", "0.1", "1%", "1", "1.5", "3%",
  ]);

  // Safety net: never record longer than 30 seconds
  const limit = setTimeout(() => sox.kill(), 30000);

  await new Promise<void>((resolve) => sox.on("close", () => resolve()));
  clearTimeout(limit);

  // True only if we captured a real recording
  return fs.existsSync(AUDIO_FILE) && fs.statSync(AUDIO_FILE).size > 20000;
}

// Record once and turn it into text. Returns empty text if nothing was heard.
async function listen(): Promise<string> {
  const gotAudio = await record();
  if (!gotAudio) return "";
  const heard = await client.audio.transcriptions.create({
    file: fs.createReadStream(AUDIO_FILE),
    model: EARS_MODEL,
  });
  return heard.text.trim();
}

// Run a PowerShell script and wait until it finishes
function runPowerShell(script: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn("powershell", ["-NoProfile", "-Command", script], {
      stdio: "ignore",
    });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

// The old robotic Windows voice, kept as a backup
async function speakWindows(text: string) {
  const clean = text.replace(/["'`$\n\r]/g, " ");
  await runPowerShell(
    "Add-Type -AssemblyName System.Speech; " +
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
      "$s.Speak('" + clean + "')"
  );
}

// The voice: a human-sounding neural voice, with the Windows voice as backup
async function speak(text: string) {
  try {
    const tts = new EdgeTTS({
      voice: VOICE,
      lang: "en-US",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      timeout: 15000,
    });
    await tts.ttsPromise(text, REPLY_FILE);

    const file = REPLY_FILE.replace(/'/g, "''");
    await runPowerShell(
      "Add-Type -AssemblyName presentationCore; " +
        "$p = New-Object System.Windows.Media.MediaPlayer; " +
        "$p.Open([uri]'" + file + "'); " +
        "$tries = 0; " +
        "while (-not $p.NaturalDuration.HasTimeSpan -and $tries -lt 50) { Start-Sleep -Milliseconds 100; $tries++ }; " +
        "$p.Play(); " +
        "Start-Sleep -Seconds ([math]::Ceiling($p.NaturalDuration.TimeSpan.TotalSeconds) + 1); " +
        "$p.Close()"
    );
  } catch (err) {
    console.log("(Human voice unavailable, using the Windows voice instead)");
    await speakWindows(text);
  }
}

// Open a link in Chrome, or in the default browser if Chrome is missing
function openInBrowser(url: string) {
  const child = spawn("cmd", ["/c", "start", "", "chrome", url], { stdio: "ignore" });
  child.on("close", (code) => {
    if (code !== 0) {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    }
  });
}

// Turn spoken text like "youtube dot com" into a safe https link
function toSafeUrl(input: string): string | null {
  let text = input.trim().toLowerCase().replace(/\s+dot\s+/g, ".");
  text = text.replace(/\s+/g, "");
  if (!/^https?:\/\//.test(text)) text = "https://" + text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// The actions Murmur is allowed to run
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Get the current local time and date.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "open_github",
      description: "Open the user's GitHub page in the web browser.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_timer",
      description: "Set a timer. Murmur speaks when the time is up.",
      parameters: {
        type: "object",
        properties: {
          seconds: { type: "number", description: "Timer length in seconds." },
        },
        required: ["seconds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_app",
      description:
        "Open an application on the user's PC. Allowed apps: chrome, notepad, calculator, file explorer.",
      parameters: {
        type: "object",
        properties: {
          app: { type: "string", description: "The app name, such as chrome." },
        },
        required: ["app"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_website",
      description: "Open a website in Chrome, such as youtube.com.",
      parameters: {
        type: "object",
        properties: {
          site: { type: "string", description: "The website address." },
        },
        required: ["site"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search Google for something and show the results in Chrome.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for." },
        },
        required: ["query"],
      },
    },
  },
];

function runTool(name: string, args: any): string {
  if (name === "get_time") {
    return new Date().toLocaleString();
  }
  if (name === "open_github") {
    spawn("cmd", ["/c", "start", "", GITHUB_URL], { stdio: "ignore" });
    return "Opened GitHub in the browser.";
  }
  if (name === "set_timer") {
    const seconds = Math.min(Math.max(Number(args.seconds) || 0, 1), 3600);
    setTimeout(() => {
      console.log("Timer finished!");
      void speak("Your timer is finished.");
    }, seconds * 1000);
    return "Timer set for " + seconds + " seconds.";
  }
  if (name === "open_app") {
    const key = String(args.app || "").trim().toLowerCase();
    const command = APPS[key];
    if (!command) {
      return "Sorry, that app is not on the allowed list. Allowed apps: " + Object.keys(APPS).join(", ") + ".";
    }
    spawn("cmd", ["/c", "start", "", command], { stdio: "ignore" });
    return "Opened " + key + ".";
  }
  if (name === "open_website") {
    const url = toSafeUrl(String(args.site || ""));
    if (!url) return "Sorry, that does not look like a valid website.";
    openInBrowser(url);
    return "Opened " + url;
  }
  if (name === "web_search") {
    const query = String(args.query || "").trim();
    if (!query) return "I did not catch what to search for.";
    openInBrowser("https://www.google.com/search?q=" + encodeURIComponent(query));
    return "Searching Google for " + query + ".";
  }
  return "Unknown action.";
}

// The brain, with actions
async function think(userText: string): Promise<string> {
  const messages: any[] = [
    {
      role: "system",
      content:
        "You are Murmur, a warm, friendly hands-free voice assistant. Use your tools when the user asks for an action. Speak naturally and conversationally, like a helpful friend. Keep replies to one or two short sentences, in plain text with no lists or symbols.",
    },
    { role: "user", content: userText },
  ];

  const first = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    tools,
  });

  const message = first.choices[0].message;

  // No action needed, just answer
  if (!message.tool_calls || message.tool_calls.length === 0) {
    return message.content ?? "";
  }

  // Run each requested action, then let the AI explain what happened
  messages.push(message);
  for (const call of message.tool_calls) {
    if (call.type !== "function") continue;
    const args = JSON.parse(call.function.arguments || "{}");
    console.log("Action:", call.function.name, args);
    const result = runTool(call.function.name, args);
    messages.push({ role: "tool", tool_call_id: call.id, content: result });
  }

  const second = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    tools,
  });
  return second.choices[0].message.content ?? "";
}

// Say goodbye out loud and quit the whole program
async function sayGoodbye() {
  console.log("Murmur: Goodbye!");
  await speak("Goodbye!");
  process.exit(0);
}

// Handle one request: think, print, speak
async function handleRequest(request: string) {
  console.log("You said:", request);
  const reply = await think(request);
  console.log("Murmur:", reply);
  await speak(reply);
}

async function main() {
  console.log("Murmur is listening.");
  console.log("Say 'Wake up' to start, and 'Sleep now' to end.");

  // true once the wake phrase has been heard. After that, no wake phrase is needed.
  let awake = !USE_WAKE_WORD;

  while (true) {
    console.log(awake ? "\nListening (conversation is on)..." : "\nListening for 'Wake up'...");
    const text = await listen();
    if (text.length < 2) continue;

    // ---- Sleeping: wait for the wake phrase ----
    if (!awake) {
      const afterWake = stripWakeWord(text);
      if (afterWake === null) {
        console.log("(ignored) " + text);
        continue;
      }

      awake = true;
      console.log("Wake phrase heard. Conversation started.");

      // Wake phrase plus a request in one go, like "Wake up, what time is it"
      if (afterWake.length >= 2) {
        if (GOODBYE_PATTERN.test(afterWake)) await sayGoodbye();
        await handleRequest(afterWake);
        continue;
      }

      // Only the wake phrase was said: greet, then listen for the task right away
      await speak("Yes?");
      console.log("\nListening for your task...");
      const task = await listen();
      if (task.length < 2) continue;
      if (GOODBYE_PATTERN.test(task)) await sayGoodbye();
      await handleRequest(task);
      continue;
    }

    // ---- Awake: every sentence is a request, no wake phrase needed ----
    if (GOODBYE_PATTERN.test(text)) await sayGoodbye();
    await handleRequest(text);
  }
}

main();