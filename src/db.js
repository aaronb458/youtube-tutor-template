import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const CHANNEL_FILTER = process.env.CHANNEL_FILTER
  ? process.env.CHANNEL_FILTER.split(",").map((s) => s.trim()).filter(Boolean)
  : null;
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL — see .env.example");
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error("Missing SUPABASE_KEY — see .env.example");
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getQueryEmbedding(query) {
  if (!OPENROUTER_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for semantic search");
  }
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [query] }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Embedding API ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.data[0].embedding;
}

export async function searchKnowledge(query, channelName, limit = 10) {
  const queryEmbedding = await getQueryEmbedding(query);

  let filterChannelIds = CHANNEL_FILTER;
  let filterChannelId = null;
  if (!filterChannelIds && channelName) {
    const { data: ch } = await supabase
      .from("channels")
      .select("id")
      .ilike("channel_name", `%${channelName}%`)
      .limit(1)
      .single();
    if (ch) filterChannelId = ch.id;
  }

  const rpcParams = {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: limit,
  };
  if (filterChannelIds) rpcParams.filter_channel_ids = filterChannelIds;
  else if (filterChannelId) rpcParams.filter_channel_id = filterChannelId;

  const { data, error } = await supabase.rpc("search_chunks", rpcParams);
  if (error) throw new Error(`Vector search failed: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Pull metadata for the parent transcripts of each returned chunk
  const transcriptIds = [...new Set(data.map((d) => d.transcript_id))];
  const { data: transcripts } = await supabase
    .from("transcripts")
    .select(
      "id, video_id, video_url, title, published_at, duration_seconds, ai_summary, channels(channel_name, platform)"
    )
    .in("id", transcriptIds);

  // Total chunk count per transcript so we can proportionally estimate
  // a start-time for each returned chunk (chunk_index / total * duration).
  const { data: chunkCounts } = await supabase
    .from("chunks")
    .select("transcript_id, chunk_index")
    .in("transcript_id", transcriptIds);

  const totalChunksByTranscript = {};
  for (const c of chunkCounts || []) {
    totalChunksByTranscript[c.transcript_id] = Math.max(
      totalChunksByTranscript[c.transcript_id] || 0,
      c.chunk_index + 1
    );
  }

  const transcriptMap = {};
  for (const t of transcripts || []) transcriptMap[t.id] = t;

  return data.map((chunk) => {
    const t = transcriptMap[chunk.transcript_id] || {};
    const totalChunks = totalChunksByTranscript[chunk.transcript_id] || 1;
    const startSeconds =
      t.duration_seconds && totalChunks > 0
        ? Math.floor((t.duration_seconds * chunk.chunk_index) / totalChunks)
        : null;
    return {
      video_id: t.video_id,
      video_url: t.video_url,
      title: t.title,
      published_at: t.published_at,
      duration_seconds: t.duration_seconds,
      ai_summary: t.ai_summary,
      channel_name: t.channels?.channel_name || "Unknown",
      platform: t.channels?.platform || "youtube",
      snippet: chunk.chunk_text,
      similarity: chunk.similarity,
      chunk_index: chunk.chunk_index,
      start_seconds: startSeconds,
    };
  });
}

export async function getTranscript(videoId) {
  const { data, error } = await supabase
    .from("transcripts")
    .select(
      "id, video_id, video_url, title, published_at, transcript, duration_seconds, ai_summary, channels(channel_name, platform)"
    )
    .eq("video_id", videoId)
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get transcript: ${error.message}`);
  }
  return {
    id: data.id,
    video_id: data.video_id,
    video_url: data.video_url,
    title: data.title,
    published_at: data.published_at,
    duration_seconds: data.duration_seconds,
    ai_summary: data.ai_summary,
    channel_name: data.channels?.channel_name || "Unknown",
    platform: data.channels?.platform || "youtube",
    transcript: data.transcript,
  };
}

export async function listChannels() {
  let query = supabase
    .from("channels")
    .select("id, channel_id, channel_name, channel_url, description, is_active, last_checked_at, platform")
    .order("channel_name");
  if (CHANNEL_FILTER) query = query.in("id", CHANNEL_FILTER);

  const { data: channels, error } = await query;
  if (error) throw new Error(`Failed to list channels: ${error.message}`);
  if (!channels || channels.length === 0) return [];

  const results = [];
  for (const ch of channels) {
    const { count } = await supabase
      .from("transcripts")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", ch.id);
    results.push({ ...ch, video_count: count || 0 });
  }
  return results;
}

export async function getChannelVideos(channelName, limit = 50) {
  let query = supabase
    .from("transcripts")
    .select("video_id, video_url, title, published_at, duration_seconds, channels!inner(channel_name)")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (CHANNEL_FILTER) query = query.in("channel_id", CHANNEL_FILTER);
  else if (channelName) query = query.ilike("channels.channel_name", `%${channelName}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to get channel videos: ${error.message}`);
  if (!data || data.length === 0) return [];

  return data.map((row) => ({
    video_id: row.video_id,
    video_url: row.video_url,
    title: row.title,
    published_at: row.published_at,
    duration_seconds: row.duration_seconds,
    channel_name: row.channels?.channel_name || "Unknown",
  }));
}
