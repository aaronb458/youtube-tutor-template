#!/usr/bin/env node
/**
 * MCP server — exposes your YouTube knowledge base as a Claude.ai connector.
 *
 * Runs on Railway (or anywhere that hosts a Node app). Connects over SSE.
 * Read-only: search, list, fetch. The scraping happens elsewhere (locally
 * via `npm run scrape`).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import express from "express";
import {
  searchKnowledge,
  getTranscript,
  listChannels,
  getChannelVideos,
} from "./db.js";

function createServer() {
  const server = new McpServer({
    name: "youtube-tutor",
    version: "1.0.0",
  });

  // ─── search_knowledge ─────────────────────────────────────────────────────
  server.registerTool(
    "search_knowledge",
    {
      description:
        "Search the YouTube tutor's knowledge base using semantic vector search " +
        "(text-embedding-3-small + pgvector cosine similarity). Returns ranked " +
        "results with similarity scores, transcript snippets, video URLs, " +
        "channel names, and (when available) AI summaries and deep-link timestamps. " +
        "Phrase queries naturally — meaning is matched, not just keywords.",
      inputSchema: {
        query: z
          .string()
          .describe("Search query — natural language or keywords to find in transcripts"),
        channel_name: z
          .string()
          .optional()
          .describe("Optional: filter to a specific channel name (partial match)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum results to return (default 10, max 50)"),
      },
    },
    async ({ query, channel_name, limit }) => {
      try {
        const results = await searchKnowledge(query, channel_name, limit);
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `No results found for "${query}"` +
                  (channel_name ? ` in channel "${channel_name}"` : "") +
                  `. Try different keywords or check available channels with list_channels.`,
              },
            ],
          };
        }

        const formatted = results
          .map((r, i) => {
            const platformLabel =
              r.platform && r.platform !== "youtube" ? ` (${r.platform})` : "";
            const score =
              typeof r.similarity === "number" ? r.similarity.toFixed(3) : "n/a";
            const durationStr = r.duration_seconds
              ? Math.round(r.duration_seconds / 60) + " min"
              : "Unknown";
            const deepLink =
              r.video_url && typeof r.start_seconds === "number"
                ? `${r.video_url}${r.video_url.includes("?") ? "&" : "?"}t=${r.start_seconds}s`
                : null;
            return (
              `### ${i + 1}. ${r.title}\n` +
              `**Similarity:** ${score}\n` +
              `**Channel:** ${r.channel_name}${platformLabel}\n` +
              `**Video:** ${r.video_url}\n` +
              (deepLink ? `**Deep link:** ${deepLink}\n` : "") +
              `**Published:** ${r.published_at || "Unknown"}\n` +
              `**Duration:** ${durationStr}\n` +
              (r.ai_summary ? `**Video summary:** ${r.ai_summary}\n` : "") +
              `**Snippet:**\n${r.snippet}\n`
            );
          })
          .join("\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} result(s) for "${query}":\n\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── get_transcript ───────────────────────────────────────────────────────
  server.registerTool(
    "get_transcript",
    {
      description:
        "Get the full transcript text for a specific YouTube video by its video ID. " +
        "Use after search_knowledge when you want the complete content of a relevant video. " +
        "video_id is the YouTube ID (e.g., 'dQw4w9WgXcQ' from youtube.com/watch?v=dQw4w9WgXcQ).",
      inputSchema: {
        video_id: z.string().describe("The YouTube video ID"),
      },
    },
    async ({ video_id }) => {
      try {
        const result = await getTranscript(video_id);
        if (!result) {
          return {
            content: [
              {
                type: "text",
                text: `No transcript found for video ID "${video_id}". It may not be in the knowledge base yet.`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text:
                `# ${result.title}\n` +
                `**Channel:** ${result.channel_name}${
                  result.platform && result.platform !== "youtube"
                    ? ` (${result.platform})`
                    : ""
                }\n` +
                `**Video:** ${result.video_url}\n` +
                `**Published:** ${result.published_at || "Unknown"}\n` +
                `**Duration:** ${
                  result.duration_seconds
                    ? Math.round(result.duration_seconds / 60) + " min"
                    : "Unknown"
                }\n` +
                (result.ai_summary ? `\n## Summary\n\n${result.ai_summary}\n` : "") +
                `\n## Transcript\n\n${result.transcript}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── list_channels ────────────────────────────────────────────────────────
  server.registerTool(
    "list_channels",
    {
      description:
        "List the YouTube channels available in this knowledge base, with video counts.",
    },
    async () => {
      try {
        const channels = await listChannels();
        if (channels.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No channels found. Run `npm run scrape -- --channel <URL>` locally to add one.",
              },
            ],
          };
        }
        const formatted = channels
          .map(
            (ch) =>
              `- **${ch.channel_name || "(unnamed)"}** — ${ch.video_count} video(s)\n` +
              `  URL: ${ch.channel_url}\n` +
              `  Active: ${ch.is_active ? "Yes" : "No"}`
          )
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `## Channels (${channels.length})\n\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── get_channel_videos ───────────────────────────────────────────────────
  server.registerTool(
    "get_channel_videos",
    {
      description:
        "List videos for a specific channel (newest first). Useful for browsing what's available.",
      inputSchema: {
        channel_name: z
          .string()
          .describe("Channel name to look up (partial match supported)"),
        limit: z.number().min(1).max(200).default(50),
      },
    },
    async ({ channel_name, limit }) => {
      try {
        const videos = await getChannelVideos(channel_name, limit);
        if (videos.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No videos found for channel "${channel_name}".`,
              },
            ],
          };
        }
        const formatted = videos
          .map(
            (v, i) =>
              `${i + 1}. **${v.title}**\n` +
              `   ${v.video_url} | ${v.published_at || "Unknown date"} | ${
                v.duration_seconds
                  ? Math.round(v.duration_seconds / 60) + " min"
                  : ""
              }`
          )
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `## Videos from ${videos[0].channel_name} (${videos.length})\n\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ─── HTTP / SSE wiring ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const app = express();

const sessions = {};

app.get("/sse", async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const server = createServer();
  sessions[transport.sessionId] = { transport, server };
  res.on("close", () => {
    server.close();
    delete sessions[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sessions[sessionId];
  if (!session) {
    return res.status(400).json({ error: "No transport found for session" });
  }
  await session.transport.handlePostMessage(req, res);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", sessions: Object.keys(sessions).length });
});

app.listen(PORT, () => {
  console.log(`youtube-tutor MCP server (SSE) running on port ${PORT}`);
});
