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
  // Remove characters that could confuse PowerShell
  const clean = text.replace(/["'`$\n\r]/g, " ");
  const script =
    "Add-Type -AssemblyName System.Speech; " +
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
    "$s.Speak('" + clean + "')";
  spawnSync("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" });
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

    // The brain
    const chat = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "You are Murmur, a friendly voice assistant. Keep replies to one or two short sentences, in plain text with no lists or symbols." },
        { role: "user", content: heard.text },
      ],
    });

    const reply = chat.choices[0].message.content ?? "";
    console.log("Murmur:", reply);

    // The voice
    speak(reply);
  }
}

main();