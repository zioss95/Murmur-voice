Murmur
Build a voice assistant in minutes, not weeks.
Murmur is an open-source starter kit for voice AI apps. Speak into your microphone, and Murmur listens, thinks, and talks back. It runs on free tiers, so you can build and test without spending a cent.
How it works
1. Ears: your microphone is recorded with SoX and transcribed by Whisper on Groq.
2. Brain: a free Groq chat model writes the reply.
3. Voice: the reply is spoken aloud with the built-in Windows voice.
Requirements
• Windows 10 or 11 (macOS and Linux support coming)
• Node.js (LTS version)
• Git
• SoX for microphone recording
• A free Groq API key
Quick start
git clone https://github.com/zioss95/murmur-voice.git
cd murmur-voice
npm install
Install SoX (Windows):
winget install ChrisBagwell.SoX
Create a file named .env in the project folder with your key:
GROQ_API_KEY=your-groq-key-here
Run Murmur:
npx tsx index.ts
Press Enter to start recording, speak, then press Enter to stop. Murmur will answer out loud.
Troubleshooting
• sox not found: close and reopen your terminal after installing SoX, or restart your computer.
• No default audio device: some SoX versions on Windows cannot find the default microphone. Set MIC_DEVICE in index.ts to 0, 1, or 2 until it works.
• 429 error: you hit the free daily limit. Wait a bit and try again.
• Model not found: Groq retires models often. Check the current list at console.groq.com/docs/models and update the model names at the top of index.ts.
Roadmap
[x] Speech in with Whisper
[x] Chat brain on a free tier
[x] Spoken replies
   ] Choose from multiple voices
[ ] More natural free voice (Piper)
[ ] macOS and Linux support
[ ] Murmur Pro: login, billing, admin dashboard, conversation history, and deployment templates
Contributing
Ideas, bug reports, and pull requests are welcome. Open an issue to start a conversation.
License
MIT
Support the project
If Murmur saves you time, give it a star on GitHub. It helps more people find it.
