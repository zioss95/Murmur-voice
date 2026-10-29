notepad index.ts, delete everything, and paste this:
import "dotenv/config";
import OpenAI from "openai";
import fs from "node:fs";
import readline from "node:readline/promises";
import * as recorder from "node-record-lpcm16";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const CHAT_MODEL = "openai/gpt-oss-20b";
const EARS_MODEL = "whisper-large-v3";
const AUDIO_FILE = "recording.wav";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function record(): Promise<void> {
  await rl.question("Press Enter to start recording...");
  const file = fs.createWriteStream(AUDIO_FILE);
  const rec = recorder.record({ recorder: "sox", sampleRate: 16000 });
  rec.stream().pipe(file);
  await rl.question("Recording... press Enter to stop.");
  rec.stop();
  await new Promise((resolve) => file.on("close", resolve));
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
        { role: "system", content: "You are Murmur, a friendly, concise voice assistant." },
        { role: "user", content: heard.text },
      ],
    });
    console.log("Murmur:", chat.choices[0].message.content ?? "");
  }
}

main();