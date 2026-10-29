import "dotenv/config";
import OpenAI from "openai";
import readline from "node:readline/promises";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const MODEL = "openai/gpt-oss-20b";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log("Murmur is alive. Type a message, or type 'exit' to quit.");

  while (true) {
    const text = await rl.question("You: ");
    if (text.trim().toLowerCase() === "exit") break;

    const chat = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are Murmur, a friendly, concise voice assistant." },
        { role: "user", content: text },
      ],
    });

    console.log("Murmur:", chat.choices[0].message.content ?? "");
  }

  rl.close();
}

main();