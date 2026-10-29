import "dotenv/config";
import OpenAI from "openai";
import fs from "node:fs";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const CHAT_MODEL = "openai/gpt-oss-20b";
const EARS_MODEL = "whisper-large-v3";
const AUDIO_FILE = "input.mp3";

async function main() {
  console.log("Murmur is listening to", AUDIO_FILE);

  // The ears: speech to text
  const heard = await client.audio.transcriptions.create({
    file: fs.createReadStream(AUDIO_FILE),
    model: EARS_MODEL,
  });
  console.log("You said:", heard.text);

  // The brain: chat reply
  const chat = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: "You are Murmur, a friendly, concise voice assistant." },
      { role: "user", content: heard.text },
    ],
  });

  console.log("Murmur:", chat.choices[0].message.content ?? "");
}

main();