# Build Your Own YouTube AI Tutor

**You don't need to know how to code.** You'll talk to Claude in plain English. Claude does the work. You just click links and paste things when asked.

End result: an AI assistant that has read every video on a YouTube channel and can answer questions like the creator. Pick MrBeast, Hormozi, your favorite teacher — anyone with a public channel.

---

## How to use this (3 steps)

### Step 1 — Install Claude Code (5 minutes, one time only)

Claude Code is a free app from Anthropic that lets Claude do tasks on your computer.

**On a Mac:**
1. Open the **Terminal** app (press `Cmd+Space`, type "Terminal", press Enter)
2. Copy this whole line, paste into Terminal, press Enter:
   ```
   curl -fsSL https://claude.com/install.sh | bash
   ```
3. When it finishes, type `claude` and press Enter. It'll ask you to log in. Use the same email as your Claude.ai account.

**On a Windows PC:**
1. Install **WSL** first (this lets Mac-style apps run on Windows). Open PowerShell as Administrator and paste:
   ```
   wsl --install
   ```
   Then restart your PC.
2. After restart, search for **Ubuntu** in the Start menu and open it.
3. In that Ubuntu window, paste:
   ```
   curl -fsSL https://claude.com/install.sh | bash
   ```
4. When it finishes, type `claude` and press Enter, then log in.

> Stuck? Full install help: https://claude.com/claude-code

### Step 2 — Open Claude Code

In your terminal (Mac) or Ubuntu window (Windows), type:
```
claude
```

You're now talking to Claude. The screen looks like a chat.

### Step 3 — Paste this exactly

Copy this whole message. Replace `PASTE-YOUTUBE-URL-HERE` with the YouTube channel URL you want to turn into a tutor (like `https://www.youtube.com/@MrBeast`). 

**(IF CLAUDE SHOWS [PASTED 10 LINES] etc, go to [docs.new](url) which opens a new google doc, paste the prompt then replace the PASTE-YOUTUBE-URL-HERE with the actual url)**

Then paste it into Claude Code and press Enter:

```
I want to build a YouTube tutor. Please clone this repo, then follow the
CLAUDE.md instructions inside it to walk me through everything step by step:

   https://github.com/aaronb458/youtube-tutor-template

The YouTube channel I want to turn into a tutor is:
   PASTE-YOUTUBE-URL-HERE

I'm a complete beginner — please ask me yes/no questions when you can,
explain everything in plain language, and tell me exactly what to click
and where to paste things. I'll handle the clicking; you handle the typing.
```

That's it. From here on, Claude tells you what to do.

---

## What Claude will do for you

Once you paste the message above, Claude Code will:

1. **Ask you which path** — free (works on your laptop, $0) or paid (lives in the cloud, ~$15-30/mo, can be added to Claude.ai as a permanent tool)
2. **Open browser tabs for you** — Supabase, Railway, etc. — and tell you exactly which buttons to click
3. **Wait** while you sign up for free accounts
4. **Ask you to paste each API key** back into the chat when you're ready
5. **Test that everything works** before scraping (so you don't waste an hour and find out at the end)
6. **Run the scrape** — downloading captions, transcribing audio, building the search brain
7. **Deploy your tutor to the internet** (paid path) or set it up locally (free path)
8. **Hand you a working tutor** — either talk to it right there in Claude Code, or get a connector URL to add to Claude.ai

If anything breaks, you say *"Claude, that didn't work. Here's the error."* and Claude fixes it. You don't need to know what the error means.

---

## What it'll cost you

**Free Path** — $0/month. Works while Claude Code is running on your laptop. Best for trying it out, one channel, personal use.

**Paid Path** — about $15-30/month after free credits are used up:
- Supabase (database) — free tier covers most personal use
- Railway (where the tutor lives) — $5-10/mo
- OpenRouter (the search brain math) — ~$1/mo
- Deepgram (transcribes videos that don't have captions) — **$200 free credits when you sign up**, then $5-15/mo

Total first-month cost is usually $0-5 because of the free credits.

---

## Frequently asked

**Do I need to know what an API key is?**
No. Claude tells you which website to go to, what button to click to get the key, and where to paste it. You just copy and paste.

**What if my computer crashes mid-setup?**
Run `claude` again, and paste: *"I was setting up a YouTube tutor and got interrupted. Pick up where we left off."* Claude will look at the partial state and continue.

**Can I add more channels later?**
Yes. Open Claude Code in the same folder and paste: *"Add this YouTube channel to my tutor: [URL]"*. That's it.

**Can I share this tutor with friends?**
Only on the Paid Path. The free path runs only on your laptop. The paid path gives you a public URL anyone can connect to.

**What if I don't see Claude Code in my terminal?**
After you ran the install command, close and reopen your terminal. Then type `claude` again. Still doesn't work? Paste the error into ChatGPT or Claude and ask "How do I fix this?"

---

## What's in this repo (you don't need to read these)

| File | Purpose |
|---|---|
| `CLAUDE.md` | The instruction manual Claude Code follows |
| `sql/schema.sql` | The database setup (Claude pastes this for you) |
| `src/` | The MCP server code (Claude deploys this for you) |
| `scripts/` | The scraping logic (Claude runs these for you) |

You should never need to open these files yourself. Claude handles everything.

---

## License

MIT. Use it, share it, fork it. Don't blame us if your tutor develops opinions.
