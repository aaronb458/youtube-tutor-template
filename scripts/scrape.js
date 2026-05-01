#!/usr/bin/env node
/**
 * PAID PATH — full pipeline: scrape → transcribe → chunk → embed → upload.
 *
 * Runs locally on your laptop. For each video on a YouTube channel:
 *   1. Try free YouTube auto-captions first (via yt-dlp)
 *   2. If captions are missing or too short, fall back to Deepgram (paid)
 *   3. Chunk the transcript into ~500-word pieces
 *   4. Generate embeddings via OpenRouter (text-embedding-3-small)
 *   5. Upload everything to Supabase
 *
 * Required env vars (see .env.example):
 *   SUPABASE_URL, SUPABASE_KEY, OPENROUTER_API_KEY
 *   DEEPGRAM_API_KEY (optional — if missing, videos without captions are skipped)
 *
 * Usage:
 *   node scripts/scrape.js --channel <YOUTUBE_CHANNEL_URL>
 *   node scripts/scrape.js --channel <URL> --limit 20
 *   node scripts/scrape.js --channel <URL> --captions-only   (never call Deepgram)
 *   node scripts/scrape.js --channel <URL> --skip-existing
 */

import { createClient } from "@supabase/supabase-js";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

// ─── env ────────────────────────────────────────────────────────────────────
loadDotEnv();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;

const args = process.argv.slice(2);
const channelUrl = args.includes("--channel") ? args[args.indexOf("--channel") + 1] : null;
const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1], 10) : null;
const skipExisting = args.includes("--skip-existing");
const captionsOnly = args.includes("--captions-only");

if (!channelUrl) {
  console.error("Usage: node scripts/scrape.js --channel <YOUTUBE_CHANNEL_URL>");
  process.exit(1);
}
for (const [name, val] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_KEY", SUPABASE_KEY],
  ["OPENROUTER_API_KEY", OPENROUTER_KEY],
]) {
  if (!val) {
    console.error(`Missing ${name} — copy .env.example to .env and fill in values.`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── constants ──────────────────────────────────────────────────────────────
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const EMBED_BATCH_SIZE = 20;
const INSERT_BATCH_SIZE = 5;
const POSTGREST_INSERT_TIMEOUT_S = 30;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "yt-tutor-"));

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadDotEnv() {
  // Tiny .env loader so we don't need a dependency. Format: KEY=VALUE per line.
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
    // .env is optional — env vars may already be set by Railway etc.
  }
}

// ─── yt-dlp helpers ─────────────────────────────────────────────────────────

async function checkYtDlp() {
  try {
    await execFileAsync("yt-dlp", ["--version"]);
  } catch {
    console.error("yt-dlp not installed. See: https://github.com/yt-dlp/yt-dlp#installation");
    process.exit(1);
  }
}

async function fetchChannelMeta(url) {
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [
      "--skip-download",
      "--playlist-end", "1",
      "--no-warnings",
      "--extractor-args", "youtube:player_client=web,android",
      "--print", "%(channel)s|%(channel_id)s|%(channel_url)s",
      url + (url.endsWith("/videos") ? "" : "/videos"),
    ],
    { timeout: 60_000 }
  );
  const line = stdout.split("\n").filter(Boolean)[0] || "";
  const [name, channelId, channelUrlOut] = line.split("|");
  return { name, channelId, channelUrl: channelUrlOut || url };
}

async function listVideos(url) {
  const args = [
    "--flat-playlist",
    "--print", "%(id)s|%(title)s",
    "--no-warnings",
    "--extractor-args", "youtube:player_client=web,android",
  ];
  if (limit) args.push("--playlist-end", String(limit));
  args.push(url + (url.endsWith("/videos") ? "" : "/videos"));
  const { stdout } = await execFileAsync("yt-dlp", args, {
    timeout: 300_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, ...t] = line.split("|");
      return { id, title: t.join("|") };
    });
}

async function fetchVideoMeta(videoId) {
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [
      "--dump-json",
      "--skip-download",
      "--no-warnings",
      "--no-playlist",
      "--extractor-args", "youtube:player_client=web,android",
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
  );
  const data = JSON.parse(stdout);
  let publishedAt = null;
  if (data.upload_date && data.upload_date.length === 8) {
    publishedAt = `${data.upload_date.slice(0, 4)}-${data.upload_date.slice(4, 6)}-${data.upload_date.slice(6, 8)}T00:00:00Z`;
  } else if (data.timestamp) {
    publishedAt = new Date(data.timestamp * 1000).toISOString();
  }
  return {
    title: data.title,
    publishedAt,
    durationSeconds: typeof data.duration === "number" ? Math.round(data.duration) : null,
  };
}

function fetchCaptions(videoId) {
  return new Promise((resolve) => {
    const out = path.join(TMP, `${videoId}.%(ext)s`);
    const args = [
      "--skip-download",
      "--write-auto-subs",
      "--sub-langs", "en.*",
      "--sub-format", "vtt",
      "--output", out,
      "--no-warnings",
      "--extractor-args", "youtube:player_client=web,android",
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
    proc.on("close", () => {
      const candidates = fs.readdirSync(TMP).filter((f) => f.startsWith(videoId) && f.endsWith(".vtt"));
      if (candidates.length === 0) return resolve(null);
      try {
        const vtt = fs.readFileSync(path.join(TMP, candidates[0]), "utf8");
        for (const f of candidates) fs.unlinkSync(path.join(TMP, f));
        resolve(cleanVtt(vtt));
      } catch {
        resolve(null);
      }
    });
    proc.on("error", () => resolve(null));
  });
}

function cleanVtt(vtt) {
  const text = [];
  for (let line of vtt.split("\n")) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith("WEBVTT") || line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    if (line.startsWith("NOTE")) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^\d{2}:\d{2}/.test(line) && line.includes("-->")) continue;
    line = line.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    if (line) text.push(line);
  }
  const dedup = [];
  for (const l of text) if (dedup.length === 0 || dedup[dedup.length - 1] !== l) dedup.push(l);
  return dedup.join(" ").replace(/\s+/g, " ").trim();
}

// ─── deepgram fallback ──────────────────────────────────────────────────────

function downloadAudio(videoId) {
  return new Promise((resolve, reject) => {
    const out = path.join(TMP, `${videoId}.%(ext)s`);
    const args = [
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "9",
      "--output", out,
      "--no-warnings",
      "--no-playlist",
      "--extractor-args", "youtube:player_client=web,android",
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      const f = fs.readdirSync(TMP).find((x) => x.startsWith(videoId) && x.endsWith(".mp3"));
      if (code !== 0 || !f) return reject(new Error(`audio download failed: ${stderr.slice(0, 200)}`));
      resolve(path.join(TMP, f));
    });
    proc.on("error", reject);
  });
}

async function transcribeWithDeepgram(audioPath) {
  const buf = fs.readFileSync(audioPath);
  const url =
    "https://api.deepgram.com/v1/listen?" +
    "model=nova-3&" +
    "smart_format=true&" +
    "punctuate=true&" +
    "language=en";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_KEY}`,
      "Content-Type": "audio/mp3",
    },
    body: buf,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Deepgram ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const transcript =
    json.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  return transcript.trim();
}

// ─── chunking + embedding ───────────────────────────────────────────────────

function chunkTranscript(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= chunkSize) return [words.join(" ")];
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(" "));
    start += chunkSize - overlap;
    if (end >= words.length) break;
  }
  return chunks;
}

async function getEmbeddings(texts) {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter embeddings ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function insertChunksWithTimeout(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/chunks`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: `timeout=${POSTGREST_INSERT_TIMEOUT_S},return=minimal`,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PostgREST insert ${res.status}: ${body.slice(0, 250)}`);
  }
}

// ─── DB upserts ─────────────────────────────────────────────────────────────

async function upsertChannel(meta, fallbackUrl) {
  const { data: existing } = await supabase
    .from("channels")
    .select("id, channel_name")
    .eq("channel_url", fallbackUrl)
    .limit(1)
    .single();
  if (existing) {
    if (meta.name && existing.channel_name !== meta.name) {
      await supabase.from("channels").update({ channel_name: meta.name, channel_id: meta.channelId }).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data, error } = await supabase
    .from("channels")
    .insert({
      channel_url: fallbackUrl,
      channel_id: meta.channelId,
      channel_name: meta.name || "(unnamed)",
      platform: "youtube",
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`channel upsert failed: ${error.message}`);
  return data.id;
}

async function findExistingTranscript(videoId) {
  const { data } = await supabase
    .from("transcripts")
    .select("id")
    .eq("video_id", videoId)
    .limit(1)
    .single();
  return data?.id || null;
}

async function upsertTranscript({ channelId, videoId, videoUrl, title, publishedAt, durationSeconds, transcript }) {
  const existing = await findExistingTranscript(videoId);
  if (existing) {
    await supabase
      .from("transcripts")
      .update({ title, published_at: publishedAt, duration_seconds: durationSeconds, transcript })
      .eq("id", existing);
    return existing;
  }
  const { data, error } = await supabase
    .from("transcripts")
    .insert({
      channel_id: channelId,
      video_id: videoId,
      video_url: videoUrl,
      title,
      published_at: publishedAt,
      duration_seconds: durationSeconds,
      transcript,
    })
    .select("id")
    .single();
  if (error) throw new Error(`transcript insert failed: ${error.message}`);
  return data.id;
}

async function transcriptHasChunks(transcriptId) {
  const { count } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .eq("transcript_id", transcriptId);
  return (count || 0) > 0;
}

async function embedAndStoreChunks(transcriptId, channelId, transcriptText) {
  const chunks = chunkTranscript(transcriptText);
  const rows = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await getEmbeddings(batch);
    for (let j = 0; j < batch.length; j++) {
      rows.push({
        transcript_id: transcriptId,
        channel_id: channelId,
        chunk_index: i + j,
        chunk_text: batch[j],
        token_count: batch[j].split(/\s+/).length,
        embedding: JSON.stringify(embeddings[j]),
      });
    }
  }
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    await insertChunksWithTimeout(rows.slice(i, i + INSERT_BATCH_SIZE));
  }
  return rows.length;
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  await checkYtDlp();
  log(`Channel: ${channelUrl}`);
  log(`Captions-only mode: ${captionsOnly ? "yes" : "no (Deepgram fallback enabled)"}`);

  const meta = await fetchChannelMeta(channelUrl);
  log(`Channel name: ${meta.name || "(unknown)"}`);
  const channelId = await upsertChannel(meta, channelUrl);
  log(`Supabase channel id: ${channelId}`);

  const videos = await listVideos(channelUrl);
  log(`Found ${videos.length} video(s) on channel`);

  let captioned = 0, deepgrammed = 0, skipped = 0, failed = 0, totalChunks = 0;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
    process.stdout.write(`[${i + 1}/${videos.length}] ${v.title.slice(0, 60)}... `);

    try {
      const existing = await findExistingTranscript(v.id);
      if (existing && skipExisting) {
        // Even if transcript exists, make sure chunks exist
        const hasChunks = await transcriptHasChunks(existing);
        if (hasChunks) {
          skipped++;
          console.log("already done");
          continue;
        }
      }

      // Try free captions first
      let transcript = await fetchCaptions(v.id);
      let usedDeepgram = false;
      if (!transcript || transcript.length < 100) {
        if (captionsOnly || !DEEPGRAM_KEY) {
          failed++;
          console.log(captionsOnly ? "no captions (captions-only mode)" : "no captions (Deepgram disabled)");
          continue;
        }
        // Fallback: download audio + Deepgram
        const audioPath = await downloadAudio(v.id);
        try {
          transcript = await transcribeWithDeepgram(audioPath);
        } finally {
          try { fs.unlinkSync(audioPath); } catch {}
        }
        if (!transcript || transcript.length < 50) {
          failed++;
          console.log("Deepgram returned empty");
          continue;
        }
        usedDeepgram = true;
      }

      // Get video metadata (title, publish date, duration)
      let videoMeta = { title: v.title, publishedAt: null, durationSeconds: null };
      try {
        videoMeta = await fetchVideoMeta(v.id);
      } catch {
        // metadata is nice-to-have but not blocking
      }

      const transcriptId = await upsertTranscript({
        channelId,
        videoId: v.id,
        videoUrl,
        title: videoMeta.title || v.title,
        publishedAt: videoMeta.publishedAt,
        durationSeconds: videoMeta.durationSeconds,
        transcript,
      });

      // Skip embedding if chunks already exist for this transcript
      const hasChunks = await transcriptHasChunks(transcriptId);
      if (hasChunks) {
        skipped++;
        console.log("transcript saved, chunks already exist");
        continue;
      }

      const n = await embedAndStoreChunks(transcriptId, channelId, transcript);
      totalChunks += n;
      if (usedDeepgram) deepgrammed++;
      else captioned++;
      console.log(`saved (${n} chunks${usedDeepgram ? ", via Deepgram" : ""})`);
    } catch (err) {
      failed++;
      console.log(`error: ${(err.message || "").slice(0, 100)}`);
    }

    await sleep(500);
  }

  // Cleanup
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

  log("");
  log(`Done.`);
  log(`  via free captions: ${captioned}`);
  log(`  via Deepgram:      ${deepgrammed}`);
  log(`  skipped:           ${skipped}`);
  log(`  failed:            ${failed}`);
  log(`  total chunks:      ${totalChunks}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
