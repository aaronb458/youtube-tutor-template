#!/usr/bin/env node
/**
 * Run this BEFORE you start scraping. It pings every API and database to
 * confirm your .env is correctly filled in. If something's wrong, it prints
 * exactly what to fix.
 *
 * Usage:
 *   node scripts/setup-check.js
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

// Tiny .env loader (avoids a dotenv dependency)
try {
  const text = fs.readFileSync(".env", "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
} catch {
  console.log("(no .env file found — relying on shell env vars)");
}

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function checkYtDlp() {
  try {
    const { stdout } = await execFileAsync("yt-dlp", ["--version"]);
    record("yt-dlp installed", true, `version ${stdout.trim()}`);
  } catch {
    record("yt-dlp installed", false, "install with: brew install yt-dlp  (or: pip install yt-dlp)");
  }
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || url.includes("YOUR-PROJECT-ID")) {
    record("SUPABASE_URL set", false, "edit .env — paste your Project URL from supabase.com → Settings → API");
    return;
  }
  if (!key || key.includes("YOUR-SUPABASE")) {
    record("SUPABASE_KEY set", false, "edit .env — paste anon key from supabase.com → Settings → API");
    return;
  }
  record("SUPABASE_URL set", true, url);

  // Try a real query
  try {
    const res = await fetch(`${url}/rest/v1/channels?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      record("Supabase reachable + schema applied", false, `HTTP ${res.status}: ${body.slice(0, 120)}`);
      console.log("    → Did you run sql/schema.sql in the Supabase SQL editor?");
      return;
    }
    record("Supabase reachable + schema applied", true, "channels table exists");
  } catch (err) {
    record("Supabase reachable", false, err.message);
  }
}

async function checkOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.includes("YOUR-KEY")) {
    record("OPENROUTER_API_KEY set", false, "get a key at openrouter.ai → API Keys");
    return;
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: ["ping"] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      record("OpenRouter API works", false, `HTTP ${res.status}: ${body.slice(0, 120)}`);
      return;
    }
    record("OpenRouter API works", true, "embeddings endpoint responded");
  } catch (err) {
    record("OpenRouter API works", false, err.message);
  }
}

async function checkDeepgram() {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key || key.includes("YOUR-DEEPGRAM")) {
    record("DEEPGRAM_API_KEY set (optional)", false, "skip if you only want free YouTube captions; otherwise get a key at deepgram.com");
    return;
  }
  try {
    const res = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${key}` },
    });
    if (!res.ok) {
      record("Deepgram API works", false, `HTTP ${res.status}`);
      return;
    }
    record("Deepgram API works", true, "auth verified");
  } catch (err) {
    record("Deepgram API works", false, err.message);
  }
}

async function main() {
  console.log("\n──── Setup check ────\n");
  await checkYtDlp();
  await checkSupabase();
  await checkOpenRouter();
  await checkDeepgram();

  console.log("");
  const failed = checks.filter((c) => !c.ok && !c.name.includes("optional"));
  if (failed.length === 0) {
    console.log("All required checks passed. You're ready to scrape:");
    console.log("  node scripts/scrape.js --channel <YOUTUBE_CHANNEL_URL>\n");
  } else {
    console.log(`${failed.length} required check(s) failed. Fix the items marked ✗ above, then run this again.\n`);
    process.exit(1);
  }
}

main();
