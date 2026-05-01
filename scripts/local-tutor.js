#!/usr/bin/env node
/**
 * FREE PATH — local-only YouTube channel tutor.
 *
 * Downloads YouTube auto-generated captions for every video on a channel
 * and saves them as plain .txt files in `transcripts/`. No database, no
 * cloud, no API keys required (just yt-dlp).
 *
 * After this runs, open Claude Code in the same folder and ask questions:
 *   "Based on the transcripts/ folder, what does this creator say about X?"
 *
 * Usage:
 *   node scripts/local-tutor.js --channel <YOUTUBE_CHANNEL_URL>
 *   node scripts/local-tutor.js --channel <URL> --limit 10
 *   node scripts/local-tutor.js --channel <URL> --skip-existing
 */

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const channelUrl = args.includes("--channel") ? args[args.indexOf("--channel") + 1] : null;
const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1], 10) : null;
const skipExisting = args.includes("--skip-existing");

if (!channelUrl) {
  console.error("Usage: node scripts/local-tutor.js --channel <YOUTUBE_CHANNEL_URL>");
  console.error("Example: node scripts/local-tutor.js --channel https://www.youtube.com/@MrBeast");
  process.exit(1);
}

const OUT_DIR = path.resolve("transcripts");
fs.mkdirSync(OUT_DIR, { recursive: true });

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sanitizeFilename(s) {
  return (s || "untitled")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

async function checkYtDlp() {
  try {
    const { stdout } = await execFileAsync("yt-dlp", ["--version"]);
    log(`yt-dlp ${stdout.trim()} found`);
  } catch {
    console.error("\nyt-dlp is not installed.");
    console.error("Install it with one of these:");
    console.error("  Mac:    brew install yt-dlp");
    console.error("  Linux:  sudo pip install yt-dlp");
    console.error("  Other:  https://github.com/yt-dlp/yt-dlp#installation\n");
    process.exit(1);
  }
}

async function listVideos(url) {
  log(`Listing videos on ${url} ...`);
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
  const lines = stdout.split("\n").filter(Boolean);
  return lines.map((line) => {
    const [id, ...titleParts] = line.split("|");
    return { id, title: titleParts.join("|") };
  });
}

function fetchCaptions(videoId) {
  // Use yt-dlp to download the auto-generated subtitle file, then strip
  // timestamps and merge into prose. Returns the cleaned transcript or null.
  return new Promise((resolve) => {
    const tmpDir = path.join(OUT_DIR, ".tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const args = [
      "--skip-download",
      "--write-auto-subs",
      "--sub-langs", "en.*",
      "--sub-format", "vtt",
      "--output", path.join(tmpDir, `${videoId}.%(ext)s`),
      "--no-warnings",
      "--extractor-args", "youtube:player_client=web,android",
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      // Find the subtitle file we just wrote
      const candidates = fs
        .readdirSync(tmpDir)
        .filter((f) => f.startsWith(videoId) && f.endsWith(".vtt"));
      if (code !== 0 || candidates.length === 0) {
        return resolve(null);
      }
      try {
        const vtt = fs.readFileSync(path.join(tmpDir, candidates[0]), "utf8");
        const cleaned = cleanVtt(vtt);
        // Clean up the .vtt file
        for (const f of candidates) fs.unlinkSync(path.join(tmpDir, f));
        resolve(cleaned);
      } catch (e) {
        resolve(null);
      }
    });
    proc.on("error", () => resolve(null));
  });
}

function cleanVtt(vtt) {
  // Remove WEBVTT header, NOTE lines, timestamps, alignment hints, and
  // collapse duplicate consecutive lines (auto-captions emit the same line
  // twice as it scrolls). Result: one clean prose blob.
  const lines = vtt.split("\n");
  const text = [];
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith("WEBVTT") || line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    if (line.startsWith("NOTE")) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^\d{2}:\d{2}/.test(line) && line.includes("-->")) continue;
    line = line.replace(/<[^>]+>/g, "");
    line = line.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    if (line) text.push(line);
  }
  // dedupe consecutive duplicates
  const dedup = [];
  for (const l of text) {
    if (dedup.length === 0 || dedup[dedup.length - 1] !== l) dedup.push(l);
  }
  return dedup.join(" ").replace(/\s+/g, " ").trim();
}

async function main() {
  await checkYtDlp();

  const videos = await listVideos(channelUrl);
  log(`Found ${videos.length} video(s)`);
  if (videos.length === 0) {
    log("Nothing to do.");
    return;
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const fname = `${sanitizeFilename(v.title)} [${v.id}].txt`;
    const fpath = path.join(OUT_DIR, fname);

    if (skipExisting && fs.existsSync(fpath)) {
      skipped++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${videos.length}] ${v.title.slice(0, 60)}... `);
    try {
      const text = await fetchCaptions(v.id);
      if (!text || text.length < 50) {
        console.log("no captions available");
        failed++;
        continue;
      }
      const header =
        `Title: ${v.title}\n` +
        `Video URL: https://www.youtube.com/watch?v=${v.id}\n` +
        `\n---\n\n`;
      fs.writeFileSync(fpath, header + text);
      success++;
      console.log(`saved (${text.length} chars)`);
    } catch (err) {
      failed++;
      console.log(`error: ${(err.message || "").slice(0, 80)}`);
    }

    // Tiny pause to be polite to YouTube
    await new Promise((r) => setTimeout(r, 500));
  }

  // Clean up temp dir
  const tmpDir = path.join(OUT_DIR, ".tmp");
  if (fs.existsSync(tmpDir)) {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {}
  }

  log(`\nDone. ${success} saved, ${skipped} skipped, ${failed} failed.`);
  log(`Transcripts in: ${OUT_DIR}`);
  log(`\nNext: open Claude Code in this folder and ask questions about transcripts/`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
