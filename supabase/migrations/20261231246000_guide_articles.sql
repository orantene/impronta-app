-- Support Guide P0 — content model for the in-app Guide (drawer tab, (i)
-- icons, Helper mode). See docs/plans/support-guide-knowledge-plan-2026-09-17.md.
--
-- Two tables:
--   guide_nodes    — the map. One row per explainable thing (a page, a tab, a
--                    control), keyed by a stable dotted id ("messages",
--                    "messages.escrow-chip"). Built by scanning
--                    `data-guide-id` in the app plus the existing 137
--                    DrawerId entries in help-registry.ts.
--   guide_articles — the content. One row per (node, locale). Written only by
--                    the guide-sync pipeline (scripts/guide/generate-guide-articles.mjs),
--                    which drafts with one model call and verifies with a
--                    second, adversarial one before publishing — there is no
--                    human reviewer (owner ruling 2026-09-17).
--
-- Writes are service-role only (the generation script), same posture as
-- support_tickets. Authenticated users may SELECT published content; a
-- 'draft' row (mid-pipeline, not yet critic-checked) is never exposed.
--
-- Rollback: drop both tables.

BEGIN;

-- ── guide_nodes ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guide_nodes (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$'),
  kind TEXT NOT NULL CHECK (kind IN ('area', 'page', 'section', 'control')),
  parent_id TEXT REFERENCES public.guide_nodes(id) ON DELETE SET NULL,
  label_key TEXT,
  since_release TEXT,
  source_hash TEXT,
  surfaces JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.guide_nodes IS
  'One row per explainable thing in the product (page, tab, control). Dotted id is the stable key the (i) icon, Helper mode and the Guide tab all address. Populated by scripts/guide/scan-guide-nodes.mjs.';
COMMENT ON COLUMN public.guide_nodes.source_hash IS
  'Hash of the component + labels this node describes. Changed hash marks every article on this node stale for the next guide-sync run.';

CREATE INDEX IF NOT EXISTS guide_nodes_parent_id_idx ON public.guide_nodes(parent_id);

-- ── guide_articles ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guide_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id TEXT NOT NULL REFERENCES public.guide_nodes(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'es')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ai-checked', 'published', 'short-version')),
  body_md TEXT NOT NULL DEFAULT '',
  source_hash TEXT,
  critic_unsupported_count INTEGER,
  critic_contradiction_count INTEGER,
  critic_structural_pass BOOLEAN,
  critic_notes TEXT,
  critic_ran_at TIMESTAMPTZ,
  audio_url TEXT,
  audio_voice TEXT,
  audio_text_hash TEXT,
  audio_duration_sec NUMERIC,
  release TEXT,
  helpful_yes INTEGER NOT NULL DEFAULT 0,
  helpful_no INTEGER NOT NULL DEFAULT 0,
  search_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (node_id, locale)
);

COMMENT ON TABLE public.guide_articles IS
  'Guide content, one row per (node, locale). status="draft" is mid-pipeline and never shown to users; "published"/"ai-checked"/"short-version" are the three states a passed article can end in. No human reviewer — see plan §3b.';
COMMENT ON COLUMN public.guide_articles.critic_notes IS
  'Free text from the verify pass when it demoted an article to short-version, for the weekly owner exception digest.';

CREATE INDEX IF NOT EXISTS guide_articles_node_id_idx ON public.guide_articles(node_id);
CREATE INDEX IF NOT EXISTS guide_articles_status_idx ON public.guide_articles(status);

CREATE OR REPLACE FUNCTION public.guide_articles_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guide_articles_touch_updated_at ON public.guide_articles;
CREATE TRIGGER guide_articles_touch_updated_at
  BEFORE UPDATE ON public.guide_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.guide_articles_touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
-- No INSERT/UPDATE/DELETE policy on either table: only the service-role
-- pipeline writes (it bypasses RLS). Authenticated users may read the node
-- map and any article that finished the pipeline; 'draft' rows stay hidden.

ALTER TABLE public.guide_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY guide_nodes_select_authenticated ON public.guide_nodes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY guide_articles_select_authenticated ON public.guide_articles
  FOR SELECT TO authenticated
  USING (status <> 'draft');

COMMIT;
