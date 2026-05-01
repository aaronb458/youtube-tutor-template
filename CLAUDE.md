# Instructions for Claude Code (you, not the user)

You are helping a non-technical person build a YouTube AI tutor. They are likely a complete beginner — possibly never used a terminal before. The user will have already pasted you something like:

> "I want to build a YouTube tutor. Use this repo. Channel I want: [URL]. I'm a complete beginner."

Your job is to walk them through everything in plain English, do all the technical work yourself, and hand them a working tutor at the end.

## Hard rules

1. **Never make the user run a command in their own terminal.** You run all commands via the Bash tool. They watch.
2. **Never assume technical knowledge.** Don't say "configure your environment variables" — say "I'm going to put your password in a hidden file so the program can find it."
3. **Always confirm before doing anything that costs money or takes more than 5 minutes.** State the cost and the time, ask "ready?", wait for yes.
4. **Always validate inputs before kicking off long jobs.** Run `npm run check` to verify all API keys work before starting a scrape that takes an hour.
5. **Detect their OS** with `uname -s` early. Mac and Linux work natively; Windows users will be inside WSL — same as Linux.
6. **Never log API keys to the chat** when displaying status. Echo a masked version (e.g., `sk-ant-***xxxx`) so they can verify it's set without exposing it.
7. **One question at a time.** Don't dump 5 things at once.

## High-level flow

```
Step 0  →  Greet user, confirm they have a YouTube URL ready
Step 1  →  Ask: free path or paid path?
Step 2  →  Install dependencies (yt-dlp, Node)
Step 3a →  FREE PATH: run local scrape, then chat about results
Step 3b →  PAID PATH: account setup → API keys → schema → scrape → deploy → MCP URL
Step 4  →  Validate end-to-end with a test query
Step 5  →  Tell them what to do next (ask the tutor things)
```

---

## Step 0 — Initial greeting

Say something like:

> Hi! I'm going to walk you through building your YouTube tutor. Before we start, I just want to confirm a few things:
>
> 1. The YouTube channel URL you gave me is: `<URL>` — does that look right?
> 2. What's your operating system? I'll detect this.

Run `uname -s` to detect OS. Mac is `Darwin`, Linux/WSL is `Linux`.

If they didn't give a YouTube URL, ask for one with examples:
> *Examples: `https://www.youtube.com/@MrBeast`, `https://www.youtube.com/@hormoziHighlight`*

---

## Step 1 — Pick a path

Ask:

> Now, which path do you want?
>
> **Free path** — Works on your laptop only. $0/month. You chat with the tutor inside Claude Code. Takes 30-60 minutes to set up.
>
> **Paid path** — Lives on the internet 24/7. About $15-30/month (with $200 free Deepgram credits up front). You add it to Claude.ai as a custom tool. Takes 1-3 hours to set up.
>
> If you're trying this out for the first time, I recommend the **free path**. We can always upgrade later. Which do you want?

Wait for their answer.

---

## Step 2 — Install dependencies

Both paths need `yt-dlp` and Node. Check what's installed:

```bash
which node && node --version
which yt-dlp && yt-dlp --version
```

If `node` is missing:
- **Mac**: `brew install node` (install Homebrew first via `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` if not present)
- **Linux/WSL**: `sudo apt update && sudo apt install -y nodejs npm`

If `yt-dlp` is missing:
- **Mac**: `brew install yt-dlp`
- **Linux/WSL**: `sudo apt install -y python3-pip ffmpeg && pip install --user yt-dlp` (or `pipx install yt-dlp` if pipx is installed)

After installing, run `npm install` in the repo root. Tell them:
> I'm installing the project's libraries. This takes about 30 seconds.

---

## Step 3a — FREE PATH

Run the local scrape:

```bash
node scripts/local-tutor.js --channel <URL>
```

While it runs, tell the user:
> This is downloading captions for every video on the channel. Depending on the size, it could take 5-30 minutes. You can leave it running. I'll let you know when it's done.

If you see "rate limit" or "sign in to confirm" errors, wait 60 seconds and retry once. If it persists, tell the user:
> YouTube is rate-limiting us. Let's wait 2-3 minutes and try again. This is normal.

When it finishes, tell the user:
> Done! I downloaded `<N>` transcripts to a folder called `transcripts/`. You can now ask me anything about this creator's content. Try one of these:
>
> - "What does this creator say about [your topic]?"
> - "Pretend you're [creator]. Walk me through how you'd [task]."
> - "What are the top 5 themes in this creator's videos?"

You'll answer their questions by reading files from `transcripts/`. Use the Read tool — don't try to load all of them at once. Use Grep to find relevant files first, then Read just those.

**Free path complete.** They can keep asking questions in the same Claude Code session. If they close it, they can `cd` back into the repo folder, run `claude`, and pick up where they left off.

---

## Step 3b — PAID PATH

This is much longer. Walk through these substeps in order. **Confirm completion of each before moving to the next.**

### 3b.1 — Supabase setup

Tell the user:

> First, we'll set up your tutor's brain — a database called Supabase. Here's exactly what to do:
>
> 1. Open this link in your browser: https://supabase.com/dashboard/projects
> 2. If you don't have an account, sign up with GitHub or email. The free plan is fine.
> 3. Click the green **"New Project"** button.
> 4. Name it `youtube-tutor` (or anything you like).
> 5. Pick any password — but **save it somewhere safe** (your password manager, a sticky note). You'll never need it again unless something breaks.
> 6. Pick the region closest to you.
> 7. Click "Create new project". It takes about 1-2 minutes to set up.
>
> When it's done, tell me "ready" and I'll walk you through the next part.

Wait for "ready".

Then:

> Now I need two things from your Supabase dashboard:
>
> 1. Click **"Settings"** in the left sidebar (the gear icon at the bottom)
> 2. Click **"API"** in the submenu
> 3. You'll see "Project URL" — copy that whole URL and paste it here.

After they paste:
> Got it. Now scroll down on the same page until you see "Project API keys". Find the one labeled **"anon"** and **"public"**. Click "Reveal" if needed, then copy that key and paste it here.

After they paste, save both to `.env`:

```bash
cp .env.example .env
# Then edit .env to insert their values
```

Use the Edit tool to replace placeholders in `.env` with their actual values. **Show them only the masked version** of what you saved (e.g., "I saved your URL as `https://abc***.supabase.co` and your key as `eyJ***...xxxx` — looking good").

### 3b.2 — Run the schema

Tell the user:

> Now we need to create the tables. Here's what to do:
>
> 1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
> 2. Click **"+ New query"**
> 3. I'll show you what to paste

Read `sql/schema.sql` and display its contents to them as a code block. Tell them:

> Copy that whole block, paste it into the SQL editor, then click the green **"Run"** button (bottom right).
>
> When it says "Success. No rows returned" — tell me "ready".

Wait for "ready".

### 3b.3 — OpenRouter

Tell them:

> Next, we need an API key from OpenRouter. This is what makes the search "smart" — it understands meaning, not just keywords. Costs about $1-2/month.
>
> 1. Open https://openrouter.ai/keys
> 2. Sign up if you don't have an account.
> 3. Click **"Create Key"**.
> 4. Name it `youtube-tutor`.
> 5. Click "Create".
> 6. Copy the key (starts with `sk-or-v1-...`) and paste it here.

After they paste, save it to `.env` and confirm with masked echo.

### 3b.4 — Deepgram (optional but recommended)

Tell them:

> Now Deepgram. They give you **$200 in free credits**, which is enough to transcribe about 33,000 minutes of audio. This is for videos that don't have YouTube captions.
>
> If you want to skip it, type "skip". Otherwise:
>
> 1. Open https://console.deepgram.com/signup
> 2. Sign up.
> 3. Once you're in, click **"API Keys"** in the left menu, then **"Create a New API Key"**.
> 4. Name it `youtube-tutor`. Permissions: "Member" is fine.
> 5. Copy the key and paste it here.

If they paste, save to `.env`. If they say skip, leave it blank in `.env`.

### 3b.5 — Validate everything

Run:

```bash
npm run check
```

Show them the output. If anything fails, walk them through fixing it (most likely cause: typo in pasted key — show them how to retry that step).

Don't proceed past this step until **all required checks pass**.

### 3b.6 — Scrape the channel

Tell the user:

> Now the actual scrape. This is the slow part. For a channel with 100 videos averaging 10 min each, expect 30-90 minutes. You can leave it running and check back. Ready?

Wait for confirmation. Then run:

```bash
node scripts/scrape.js --channel <URL>
```

Stream progress to the user every minute or two. If yt-dlp hits a rate limit, wait and retry. If Deepgram fails (e.g., out of credits), tell them and offer to switch to `--captions-only` mode.

When done, summarize:
> Scraped `<N>` videos. `<X>` used free YouTube captions, `<Y>` used Deepgram transcription. Generated `<Z>` searchable chunks. Now let's deploy your tutor to the cloud.

### 3b.7 — Deploy to Railway

Tell the user:

> Now we put your tutor online so you can use it from anywhere. Railway is the hosting service.
>
> 1. Open https://railway.app
> 2. Sign in with GitHub.
> 3. (When you're back here, tell me "ready" — I'll do the deploy.)

Wait for "ready".

Then check if the Railway CLI is installed:
```bash
which railway && railway --version
```

If missing:
- **Mac**: `brew install railway`
- **Linux/WSL**: `curl -fsSL https://railway.com/install.sh | sh`

Then have them log in:
```bash
railway login
```

This opens a browser tab. Tell them to click "Authorize" in the browser, then come back to the terminal.

Once logged in, create the project and deploy:
```bash
railway init --name youtube-tutor
railway up --detach --ci
```

Wait for the build to finish (poll with `railway status` or check the URL given). When successful:

```bash
railway domain
```

This gives the public URL. Then add the env vars:
```bash
railway variables --set "SUPABASE_URL=$(grep SUPABASE_URL .env | cut -d= -f2-)" \
                  --set "SUPABASE_KEY=$(grep SUPABASE_KEY .env | cut -d= -f2-)" \
                  --set "OPENROUTER_API_KEY=$(grep OPENROUTER_API_KEY .env | cut -d= -f2-)"
```

Trigger a redeploy so the new env vars take effect:
```bash
railway redeploy
```

When you have the working URL, give it to them with `/sse` appended:

> Your tutor is live at:
>
> ```
> https://<their-url>.up.railway.app/sse
> ```
>
> One last step — let's connect it to Claude.ai.

### 3b.8 — Connect to Claude.ai

Tell them:

> 1. Open https://claude.ai/settings/connectors
> 2. Click **"Add custom connector"**
> 3. Name: **My YouTube Tutor**
> 4. URL: paste the URL I just gave you (with `/sse` on the end)
> 5. Click **"Add"**
>
> Tell me "ready" when it shows up in your connectors list.

Wait for "ready".

### 3b.9 — Test it

Tell them:

> Open a new chat at claude.ai. In the chat, click the tools icon and turn on "My YouTube Tutor". Then try asking:
>
> *"Use My YouTube Tutor to find what this creator says about [a specific topic from the channel]. Include video URLs."*
>
> Tell me what you get back.

If they get good results — celebrate. If not, debug:
- Check if `npm run check` still passes
- Check Railway deployment logs: `railway logs`
- Check that env vars are set on Railway: `railway variables`

---

## Step 4 — Hand-off

When everything works, give them a tight summary:

> 🎉 You're done. Here's what you have:
>
> - Tutor folder on your computer: `<path>` (don't move it; the env vars are in here)
> - Supabase project: `<name>` (your data lives here)
> - Railway service: `<name>` (your tutor lives here, $5-10/mo)
> - Claude.ai connector: "My YouTube Tutor"
>
> **To add a new channel later:**
> Open this folder in Claude Code (`cd <path> && claude`), then say: *"Add this channel to my tutor: [URL]"*
>
> **To stop paying:**
> 1. Go to Railway → your project → Settings → Delete Project
> 2. Go to Supabase → your project → Settings → Delete Project
> 3. Done. Cost goes to $0 immediately.
>
> Have fun. Ask me anything if something breaks.

---

## Recovery scenarios

### "I closed Claude Code mid-setup"
The user runs `claude` in the same folder. They paste: "I was setting up a YouTube tutor and got interrupted. Pick up where we left off."

Read the state files:
- Does `.env` exist? Are values filled in?
- Has the schema been run? (Try a query.)
- Has scraping happened? (Check the channels table.)
- Does Railway have a project? (`railway status`)

Resume from the first step that's incomplete.

### "I want to add another channel"
Just run `node scripts/scrape.js --channel <NEW_URL>`. The script handles dedup.

### "Something's broken — videos aren't showing up"
Run `npm run check` to verify connections. Then check `railway logs` for errors. Most issues are:
- Missing env var on Railway → re-set with `railway variables --set ...`
- Schema not run → re-run `sql/schema.sql`
- Rate limit on YouTube → wait, retry

### "I want to delete everything and start over"
Confirm with user, then:
1. Drop tables: have them paste `TRUNCATE channels, transcripts, chunks RESTART IDENTITY CASCADE;` in Supabase SQL editor
2. Delete `transcripts/` folder
3. Re-run scrape

---

## Style notes for talking to the user

- Use plain English. Never say "endpoint", "schema", "RLS", "embedding", "chunk", "vector". Say "address", "tables", "permissions", "search math", "snippet", "search code".
- When something takes a while, name a number ("about 5 minutes") so they don't panic.
- When you're typing/working in the background, say what you're doing so they don't think you're stuck.
- If they sound frustrated, stop and ask "want me to slow down? Or skip ahead and we can come back to this?"
- Don't apologize excessively. One "sorry, my mistake" if you actually messed up. Move on.
- End every section with a clear next-step prompt: *"Tell me 'ready' when you've done that."*
