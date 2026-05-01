# YouTube Tutor Template

**Build an AI tutor from any YouTube channel.** Pick a creator. The tutor reads every video on their channel and can answer questions like the creator themselves would. Want to ask "Hormozi-bot" about pricing? "MrBeast-bot" about thumbnails? "Your-favorite-teacher-bot" about anything? That's what this builds.

This repo is a complete template. Clone it, open Claude Code in the folder, and follow the prompts below. Claude Code does the technical work — installing tools, deploying to the cloud, fixing errors. You do the clicking and copying.

---

## Two paths — pick one

| | **Free Path** | **Paid Path** |
|---|---|---|
| **Monthly cost** | $0 | ~$15-30 |
| **Setup time** | 30-60 min | 1-3 hours |
| **What you get** | A folder of transcripts; chat with Claude Code about them | A 24/7 cloud tutor connected to Claude.ai as a custom tool |
| **Best for** | Personal use, one channel, just want to chat with the content | Sharing with others, multiple channels, professional use |
| **Limitations** | Only works while Claude Code is open on your laptop | None — runs 24/7 in the cloud |

If you're not sure, **start with the Free Path**. The work transfers if you upgrade later.

---

## Before you start (5 min)

You need three things regardless of path:

### 1. Claude.ai account
Go to [claude.ai](https://claude.ai) and sign up. Free plan is fine.

### 2. Claude Code on your computer
Claude Code is a free tool that lets Claude run commands on your computer for you. Install it:

- **Mac**: open Terminal (`Cmd+Space`, type "Terminal", Enter), paste:
  ```
  curl -fsSL https://claude.com/install.sh | bash
  ```
- **Windows**: install [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) first, then run the command above inside WSL.
- More info: [claude.com/claude-code](https://claude.com/claude-code)

After it installs, run `claude` in your terminal and log in with your Claude.ai account.

### 3. yt-dlp
Free YouTube download tool. Either path needs it. You can install it yourself or just let Claude Code do it (the setup-check script tells you the exact command).

```bash
# Mac:
brew install yt-dlp
# Linux / WSL:
sudo pip install yt-dlp
```

Pick a YouTube channel URL you want to "tutor"-ify. Examples:
- `https://www.youtube.com/@hormoziHighlight`
- `https://www.youtube.com/@MrBeast`

---

## Get this template

In your terminal:

```bash
git clone https://github.com/YOUR-FORK/youtube-tutor-template.git
cd youtube-tutor-template
npm install
```

Then start Claude Code in this folder:
```bash
claude
```

You're now in Claude Code, in this folder. Anything you type asks Claude to act inside this folder.

---

## PATH 1 — The Free Way (30-60 min, $0)

You'll download every transcript from a YouTube channel as plain `.txt` files. Then chat with Claude Code about them. Claude Code reads files natively — that becomes your tutor.

### Step 1: Run the local tutor script

Tell Claude Code:

> Run `npm run local -- --channel https://www.youtube.com/@CHANNEL_HERE` for me. Show me the output so I can see progress. Tell me when it's done.

Replace the URL with your channel. Claude Code will:
1. Check that yt-dlp is installed (and tell you how to install it if not)
2. Fetch the list of all videos on that channel
3. Download YouTube's auto-generated captions for each one
4. Save each as a `.txt` file in `transcripts/`

Takes 5-30 min depending on channel size. You can leave it running. If you see "rate limit" errors, just tell Claude Code "wait a couple minutes and keep going."

### Step 2: Chat with your tutor

Same Claude Code session, ask anything:

> Based on the transcripts in `transcripts/`, what does this creator say about [TOPIC]?

Examples:
- "What does Hormozi say about pricing high-ticket offers? Quote him directly."
- "Pretend you're MrBeast and walk me through how you'd plan a thumbnail."
- "What are the three biggest pieces of advice this creator gives to beginners?"

Done. You have a tutor.

### Step 3 (optional): Use it inside Claude.ai

If you want the tutor accessible without opening Claude Code:

1. Go to [claude.ai](https://claude.ai)
2. Click "Projects" → "New Project"
3. Name it (e.g., "Hormozi Tutor")
4. Drag the contents of your `transcripts/` folder into the Project's knowledge area
5. Project instructions: *"You are an AI tutor that has read every video transcript from this YouTube channel. When asked questions, draw from the knowledge base. Quote the creator directly when you can."*

**Limit**: Claude.ai Projects has a knowledge cap (~200K tokens — roughly 30-50 short videos or 10-15 long ones). For a giant channel, stick with Step 2 in Claude Code, or upgrade to the Paid Path.

**That's the Free Path.** $0 cost. Works as long as your laptop and Claude Code are running.

---

## PATH 2 — The Paid Way (1-3 hours, ~$15-30/mo)

This puts your tutor in the cloud. It's connected to Claude.ai as a custom tool, uses semantic search (understands meaning, not just keywords), and includes deep-link timestamps back to the source video.

### Step 1: Sign up for the services

Open these in your browser, sign up for each:

1. **Supabase** — [supabase.com](https://supabase.com) → "Start your project" → sign in with GitHub or email. Free tier is enough.
2. **Railway** — [railway.app](https://railway.app) → sign in with GitHub. ~$5-10/mo for the MCP server.
3. **OpenRouter** — [openrouter.ai](https://openrouter.ai) → sign up. Embeddings cost ~$1-5/mo for hobby use.
4. **Deepgram** — [deepgram.com](https://deepgram.com) → sign up. **You get $200 in free credits** which covers ~33,000 minutes of audio. Optional but recommended (only needed for videos that don't have YouTube captions).

### Step 2: Set up the database

Tell Claude Code:

> Walk me through creating a new Supabase project. Tell me each click. After it's created, give me the SQL command from `sql/schema.sql` to paste into the Supabase SQL Editor. Wait for me to confirm it ran successfully.

Claude Code will:
- Tell you to create a Supabase project (any name; pick the free tier; SAVE the database password to your password manager)
- Tell you to open the SQL Editor in Supabase
- Tell you to paste the contents of `sql/schema.sql` and click "Run"
- Verify the tables exist

After the schema runs, get your `SUPABASE_URL` and `SUPABASE_KEY`:
- In Supabase: Settings → API
- Copy "Project URL" — that's `SUPABASE_URL`
- Copy "anon public" key — that's `SUPABASE_KEY`

### Step 3: Fill in your .env

Tell Claude Code:

> Copy `.env.example` to `.env`. Then walk me through filling in each value. Tell me where to find each API key. After I paste each key, run `npm run check` to verify it's working.

Claude Code will guide you through:
- Pasting your `SUPABASE_URL` and `SUPABASE_KEY`
- Getting an OpenRouter API key
- (Optional) Getting a Deepgram API key
- Running `npm run check` to make sure everything connects

### Step 4: Scrape your first channel

Once `npm run check` shows all green, tell Claude Code:

> Run `npm run scrape -- --channel https://www.youtube.com/@CHANNEL_HERE`. Show me the output. Tell me when it's done.

This will:
1. Fetch the list of videos on the channel
2. For each video: try free YouTube captions first, fall back to Deepgram if missing
3. Chunk each transcript into ~500-word pieces
4. Generate embeddings (the "search brain" math)
5. Upload everything to your Supabase

For a 100-video channel, takes 30-90 minutes depending on average video length. Leave it running. If something breaks, paste the error to Claude Code — it'll fix it for you.

### Step 5: Deploy the MCP server to Railway

Tell Claude Code:

> Help me deploy this repo to Railway as a new project named "my-yt-tutor". Use the railway CLI. After it deploys, give me the public URL and tell me what env vars I need to set in Railway.

Claude Code will:
- Install the Railway CLI if needed
- Create a new Railway project linked to this folder
- Run `railway up` to build and deploy
- Show you the URL where the MCP is live
- Tell you to copy the same env vars from your `.env` into Railway's dashboard (Settings → Variables)

After Railway shows the deployment as "Active", note the URL. It looks like:
`https://my-yt-tutor-production.up.railway.app`

### Step 6: Connect to Claude.ai

1. Open [claude.ai](https://claude.ai)
2. Click your profile (bottom left) → "Settings" → "Connectors" (or "MCP servers")
3. Click "Add custom connector"
4. Name: "My YouTube Tutor"
5. URL: paste your Railway URL with `/sse` on the end. Example: `https://my-yt-tutor-production.up.railway.app/sse`
6. Save

Start a new chat in Claude.ai. Your tutor is in the tools list. Try:

> Use My YouTube Tutor to find what this creator says about [topic]. Include video URLs.

You'll get back snippets pulled from the transcripts, with clickable links and similarity scores.

**That's the Paid Path.** You now have a 24/7 cloud tutor.

---

## How to use your tutor well

Good prompts:
- *"Find what [creator] says about [specific topic]. Quote them directly. Include video URLs."*
- *"Pretend you're [creator]. Based on their content, how would they answer: [your question]"*
- *"What are the most repeated themes across this creator's videos? List the top 5 with examples."*
- *"I'm trying to [goal]. Based on this creator's advice, what would they tell me to do?"*

Bad prompts:
- *"Tell me everything about [creator]"* (too broad)
- *"What did they say last week?"* (the system only knows what's been scraped)

Be specific. Ask like you'd ask the creator if you bumped into them at a coffee shop.

---

## Adding more channels

Run `npm run scrape -- --channel <NEW_CHANNEL_URL>` again with a different URL. The scrape script handles deduplication — if you re-run it on the same channel later, only new videos will be processed.

For the cloud (Paid Path), the new videos appear in your tutor immediately. No restart needed.

---

## Common issues

### "yt-dlp says rate limit / sign in to confirm / 403 forbidden"
Tell Claude Code: *"Wait 2 minutes, then try again with `--extractor-args 'youtube:player_client=web,android'`."* This is a known YouTube quirk; the script already uses this flag but sometimes needs a retry.

### "Some videos have no captions"
Some videos legitimately don't have captions (silent videos, music videos, brand-new uploads). On the Free Path, those are skipped. On the Paid Path with `DEEPGRAM_API_KEY` set, those get transcribed via Deepgram automatically.

### "I want to start over with a clean slate"
Tell Claude Code: *"Delete everything in the channels, transcripts, and chunks tables in Supabase, then re-run the scrape for [CHANNEL]."*

### "Setup-check says my Supabase connection failed"
Most likely you forgot to run the SQL schema. Open Supabase → SQL Editor → paste contents of `sql/schema.sql` → Run.

### "Railway deploy failed"
Paste the error to Claude Code: *"This Railway deploy failed with [error]. What does it mean and how do I fix it?"*

### "How much am I spending?"
- **Supabase**: dashboard at supabase.com — free tier covers most personal use
- **Railway**: dashboard at railway.app — set spending caps in Settings
- **OpenRouter**: openrouter.ai/credits — fractions of a cent per query
- **Deepgram**: console.deepgram.com — $200 free credits cover ~33,000 minutes
- Set spending alerts on each.

---

## What it actually costs (real numbers)

For a channel with **100 videos at 10 min average**:

| Service | One-time setup | Ongoing/mo |
|---|---|---|
| Supabase | $0 (free tier) | $0 |
| Railway | $0 | $5-10 |
| OpenRouter (embeddings) | $0.05-$0.50 | <$0.50 |
| Deepgram (only if needed) | $5-10 | $1-3 |
| **TOTAL** | **$5-10** | **$6-14** |

For **1,000 videos at 10 min average**:

| Service | One-time setup | Ongoing/mo |
|---|---|---|
| Supabase | $0-25 (may outgrow free tier) | $0-25 |
| Railway | $0 | $5-10 |
| OpenRouter | $0.50-$5 | <$1 |
| Deepgram (if needed) | $50-100 | $5-15 |
| **TOTAL** | **$50-130** | **$10-50** |

If cost is a concern, run `npm run scrape -- --channel <URL> --captions-only` — that completely skips Deepgram and uses free YouTube captions only. You give up some quality for videos with bad captions, but most channels are fine.

---

## What's in this repo

```
.
├── README.md              ← this file
├── .env.example           ← copy to .env and fill in
├── package.json           ← npm scripts
├── Dockerfile             ← for Railway deploy
├── railway.json           ← Railway build config
├── sql/
│   └── schema.sql         ← run this in Supabase SQL Editor
├── src/
│   ├── mcp-server.js      ← the MCP server (runs on Railway)
│   └── db.js              ← Supabase client + search
└── scripts/
    ├── local-tutor.js     ← FREE path: download captions to local files
    ├── scrape.js          ← PAID path: scrape + transcribe + embed + upload
    └── setup-check.js     ← run before scraping to verify .env
```

---

## When you get stuck

The most powerful sentence right now is:

> Claude Code, I'm stuck. Here's what I tried and here's what happened: [paste error]. What do I do?

Claude Code is patient. It will not judge you. Most issues are fixable in one or two follow-ups.

---

## License

MIT. Use it, fork it, modify it, share it. Just don't blame me if your tutor gets weird ideas.
