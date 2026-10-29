import "dotenv/config";
import OpenAI from "openai";
import fs from "node:fs";
import readline from "node:readline/promises";
import { spawn, spawnSync } from "node:child_process";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const CHAT_MODEL = "openai/gpt-oss-20b";
const EARS_MODEL = "whisper-large-v3";
const AUDIO_FILE = "recording.wav";
const MIC_DEVICE = "0";
const GITHUB_URL = "https://github.com/zioss95";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function record(): Promise<void> {
  await rl.question("Press Enter to start recording...");

  const sox = spawn("sox", [
    "-t", "waveaudio", MIC_DEVICE,
    "-r", "16000",
    "-c", "1",
    "-b", "16",
    AUDIO_FILE,
  ]);

  const closed = new Promise<void>((resolve) => sox.on("close", () => resolve()));

  await rl.question("Recording... press Enter to stop.");

  sox.kill();
  await closed;
}

// The voice: speak text out loud using the built-in Windows voice
function speak(text: string) {
  const clean = text.replace(/["'`$\n\r]/g, " ");
  const script =
    "Add-Type -AssemblyName System.Speech; " +
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
    "$s.Speak('" + clean + "')";
  spawnSync("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" });
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
      speak("Your timer is finished.");
    }, seconds * 1000);
    return "Timer set for " + seconds + " seconds.";
  }
  return "Unknown action.";
}

// The brain, now with actions
async function think(userText: string): Promise<string> {
  const messages: any[] = [
    {
      role: "system",
      content:
        "You are Murmur, a friendly hands-free voice assistant. Use your tools when the user asks for an action. Keep replies to one or two short sentences, in plain text with no lists or symbols.",
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

async function main() {
  console.log("Murmur is alive. Press Ctrl+C to quit.");

  while (true) {
    await record();

    // The ears
    const heard = await client.audio.transcriptions.create({
      file: fs.createReadStream(AUDIO_FILE),
      model: EARS_MODEL,
    });
    console.log("You said:", heard.text);

    // The brain, with actions
    const reply = await think(heard.text);
    console.log("Murmur:", reply);

    // The voice
    speak(reply);
  }
}

main();