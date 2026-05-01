-- ─── ONE-TIME SETUP ─────────────────────────────────────────────────────────
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- This creates the tables, indexes, and search function your tutor needs.

-- pgvector lets us do "semantic search" — finding things by meaning, not keywords.
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── channels ────────────────────────────────────────────────────────────────
-- One row per YouTube channel you've added.
CREATE TABLE IF NOT EXISTS public.channels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_url     text NOT NULL UNIQUE,
  channel_id      text,
  channel_name    text,
  description     text,
  is_active       boolean DEFAULT true,
  last_checked_at timestamptz,
  platform        text DEFAULT 'youtube',
  created_at      timestamptz DEFAULT now()
);

-- ─── transcripts ────────────────────────────────────────────────────────────
-- One row per video. Stores the full transcript text and metadata.
CREATE TABLE IF NOT EXISTS public.transcripts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id       uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  video_id         text NOT NULL UNIQUE,
  video_url        text NOT NULL,
  title            text,
  published_at     timestamptz,
  duration_seconds integer,
  transcript       text NOT NULL,
  ai_summary       text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcripts_channel_id_idx ON public.transcripts(channel_id);
CREATE INDEX IF NOT EXISTS transcripts_video_id_idx ON public.transcripts(video_id);

-- ─── chunks ─────────────────────────────────────────────────────────────────
-- Each transcript gets sliced into ~500-word chunks. Each chunk has an
-- embedding (a vector that represents its meaning). This is what we search.
CREATE TABLE IF NOT EXISTS public.chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  channel_id    uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  chunk_index   integer NOT NULL,
  chunk_text    text NOT NULL,
  token_count   integer,
  embedding     vector(1536),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (transcript_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS chunks_channel_id_idx ON public.chunks(channel_id);
CREATE INDEX IF NOT EXISTS chunks_transcript_id_idx ON public.chunks(transcript_id);

-- HNSW index makes vector search fast even with millions of chunks.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON public.chunks USING hnsw (embedding vector_cosine_ops);

-- ─── search function ────────────────────────────────────────────────────────
-- This is what the MCP server calls. Cosine similarity between a query
-- embedding and every chunk's embedding, returning the closest matches.
CREATE OR REPLACE FUNCTION public.search_chunks(
  query_embedding    vector,
  filter_channel_id  uuid    DEFAULT NULL,
  filter_channel_ids uuid[]  DEFAULT NULL,
  match_count        integer DEFAULT 10
)
RETURNS TABLE(
  chunk_id      uuid,
  chunk_text    text,
  chunk_index   integer,
  transcript_id uuid,
  channel_id    uuid,
  similarity    double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.chunk_text,
    c.chunk_index,
    c.transcript_id,
    c.channel_id,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.chunks c
  WHERE (
    (filter_channel_id IS NULL AND filter_channel_ids IS NULL)
    OR c.channel_id = filter_channel_id
    OR c.channel_id = ANY(filter_channel_ids)
  )
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── row-level security ─────────────────────────────────────────────────────
-- Open policies for personal/single-user use. If you ever expose this to the
-- public internet beyond your own MCP, tighten these.
ALTER TABLE public.channels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open access" ON public.channels;
DROP POLICY IF EXISTS "open access" ON public.transcripts;
DROP POLICY IF EXISTS "open access" ON public.chunks;

CREATE POLICY "open access" ON public.channels    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open access" ON public.transcripts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open access" ON public.chunks      FOR ALL USING (true) WITH CHECK (true);
