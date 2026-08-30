-- Phase 2 (Tulala Agent): the Tulala Brief.
--
-- WHAT THIS IS
-- The persistent structured understanding of a user's business, built during
-- intake and read later by the Recommendation Engine and the builders. It is
-- the "understanding" layer between the conversation and the operational
-- tables; it is NOT a second copy of them. `talent_profiles`, `agencies` and
-- friends remain the operational source of truth. The Brief records what we
-- believe about someone and, critically, WHY we believe it.
--
-- WHY FOUR TABLES AND NOT ONE JSONB COLUMN
-- A single blob would be smaller and is the obvious first instinct. It is also
-- the reason "let the AI fill in every field it can" turns into "the AI quietly
-- invented my business and I cannot tell which parts". Provenance has to be
-- per-fact or it does not exist: one row per fact is what lets the UI show "you
-- told me this" next to "I guessed this from your Instagram", and lets a user
-- reject one inference without discarding the rest. A blob also cannot be
-- diffed, so versioning it produces snapshots nobody can read.
--
--   tulala_briefs                 container + ownership + lifecycle
--   tulala_brief_facts            one row per fact, with source and confidence
--   tulala_brief_versions         immutable snapshots (append-only)
--   tulala_brief_upgrade_triggers "fit, not force": the condition that would
--                                 make a paid plan correct LATER
--
-- THE CONVERSATION IS NOT STORED
-- Per docs/ai-data-retention.md: no prompt or completion bodies in Postgres.
-- Turns are evidence, not records. What survives a turn is the facts it
-- produced and their provenance. `source_excerpt` on a fact is a deliberate,
-- capped exception: without a short quote of the user's own words, "you told me
-- this" is unverifiable by the person it is about. It is length-limited, and
-- only ever the USER's words, never the model's.
--
-- ANONYMOUS FIRST
-- Intake starts before signup, so a brief is owned by a guest session and is
-- later claimed by a profile. Same stance as guest support: NO anon RLS policy
-- anywhere. Anonymous rows are service-role only, gated in app code on the
-- HMAC-signed `impronta_guest` cookie. Authenticated users get SELECT on their
-- own rows and nothing else; every write goes through the server.
--
-- Explicitly NOT written to `saas_marketing_signups` — the provisioner and the
-- founder digest read that table, and an unclaimed anonymous draft is not a
-- lead.
--
-- Rollback: drop the four tables and the two touch_updated_at functions.
-- Nothing else references them.

BEGIN;

-- ─── Container ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tulala_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership. Exactly one of these is set at any moment: a brief starts as a
  -- guest's and becomes a profile's on claim, which NULLs the guest link so a
  -- recycled cookie can never reach a claimed brief.
  guest_session_id UUID REFERENCES public.guest_sessions(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Where the intake landed, once it lands. All nullable: the whole point is
  -- that a brief exists before any of these objects do.
  signup_lead_id UUID REFERENCES public.saas_marketing_signups(id) ON DELETE SET NULL,
  talent_profile_id UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'discovering',
  locale TEXT NOT NULL DEFAULT 'en',

  -- Bumped on every accepted snapshot. Also the CAS token for edits, matching
  -- agency_business_identity.version.
  current_version INTEGER NOT NULL DEFAULT 0,

  -- Which Recommendation Engine produced the last recommendation. This single
  -- column is what makes the replay harness possible: without it, replaying a
  -- corpus against a new engine cannot tell a rule change from a data change.
  engine_version TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tulala_briefs_owner_present
    CHECK (guest_session_id IS NOT NULL OR profile_id IS NOT NULL),
  CONSTRAINT tulala_briefs_status_known
    CHECK (status IN ('discovering', 'ready_for_review', 'approved', 'provisioned', 'abandoned'))
);

COMMENT ON TABLE public.tulala_briefs IS
  'Container for one Tulala intake. Owned by a guest session before signup and by a profile after claim (claim NULLs the guest link). Writes are service-role only; authenticated users may SELECT their own. Never a marketing lead — see saas_marketing_signups.';
COMMENT ON COLUMN public.tulala_briefs.current_version IS
  'Count of accepted snapshots in tulala_brief_versions. Also the compare-and-set token for edits: an edit sends the version it read, and a mismatch is a conflict rather than a lost write. 0 = never snapshotted.';
COMMENT ON COLUMN public.tulala_briefs.engine_version IS
  'Recommendation Engine version that produced the stored recommendation. Required for the replay harness to distinguish a rule change from a data change.';

CREATE INDEX IF NOT EXISTS idx_tulala_briefs_guest
  ON public.tulala_briefs (guest_session_id)
  WHERE guest_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tulala_briefs_profile
  ON public.tulala_briefs (profile_id, updated_at DESC)
  WHERE profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tulala_briefs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tulala_briefs_touch_updated_at ON public.tulala_briefs;
CREATE TRIGGER trg_tulala_briefs_touch_updated_at
  BEFORE UPDATE ON public.tulala_briefs
  FOR EACH ROW EXECUTE FUNCTION public.tulala_briefs_touch_updated_at();

-- ─── Facts ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tulala_brief_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID NOT NULL REFERENCES public.tulala_briefs(id) ON DELETE CASCADE,

  -- Deliberately TEXT with no CHECK. The fact vocabulary is versioned data in
  -- the app (`@/lib/tulala/fact-keys.ts`), because a CHECK constraint would
  -- mean a migration every time intake learns to ask about one more thing, and
  -- the industry packs in Phase 6 exist precisely to add fact keys.
  fact_key TEXT NOT NULL,

  -- jsonb so a fact can be a string, a number, a boolean or a list without a
  -- column per shape. Readers validate against the key's declared type.
  fact_value JSONB NOT NULL,

  source TEXT NOT NULL,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
  status TEXT NOT NULL DEFAULT 'confirmed',

  -- A SHORT quote of the user's own words that produced this fact. Not the
  -- conversation, and never model output: it exists so "you told me this" can
  -- be checked by the person it is about. Capped by CHECK, not by convention.
  source_excerpt TEXT,
  -- For url_import: which URL. Lets "update from my website" show its work.
  source_url TEXT,

  -- Which question produced it, for the yield-per-question metric. Versioned
  -- question ids, not prose.
  question_id TEXT,
  question_version INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tulala_brief_facts_source_known
    CHECK (source IN ('user_stated', 'url_import', 'ai_inference', 'system_derived')),
  CONSTRAINT tulala_brief_facts_status_known
    CHECK (status IN ('confirmed', 'needs_approval', 'suggested', 'rejected')),
  CONSTRAINT tulala_brief_facts_confidence_range
    CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT tulala_brief_facts_excerpt_capped
    CHECK (source_excerpt IS NULL OR char_length(source_excerpt) <= 500),
  CONSTRAINT tulala_brief_facts_key_nonempty
    CHECK (char_length(trim(fact_key)) > 0),
  -- An AI inference may never arrive pre-confirmed. This is decision L20 as a
  -- database constraint rather than a code convention: the one rule that keeps
  -- "fill every field you can" honest is exactly the rule a future caller is
  -- most likely to bypass by passing status='confirmed' for convenience.
  CONSTRAINT tulala_brief_facts_inference_needs_approval
    CHECK (source <> 'ai_inference' OR status <> 'confirmed')
);

COMMENT ON TABLE public.tulala_brief_facts IS
  'One row per fact, carrying its provenance. The per-fact source/confidence/status is what lets the UI distinguish what the user said from what the model guessed, and lets a user reject one inference without discarding the rest.';
COMMENT ON COLUMN public.tulala_brief_facts.fact_key IS
  'Stable key from the app-side versioned vocabulary (@/lib/tulala/fact-keys.ts). Intentionally unconstrained in SQL: industry packs add keys, and a CHECK would make that a migration.';
COMMENT ON COLUMN public.tulala_brief_facts.source_excerpt IS
  'Short quote of the USER''S OWN WORDS behind this fact, capped at 500 chars. Never model output, and never the conversation: see docs/ai-data-retention.md.';
COMMENT ON CONSTRAINT tulala_brief_facts_inference_needs_approval ON public.tulala_brief_facts IS
  'Decision L20 in the schema: AI-inferred facts are drafts. A model may propose (suggested / needs_approval); only a human action may confirm.';

-- One current row per key. Multi-valued facts ("services offered") live in a
-- jsonb array inside one row, which keeps "what do we currently believe about
-- X" a single lookup rather than a reduction over history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tulala_brief_facts_brief_key
  ON public.tulala_brief_facts (brief_id, fact_key);

CREATE INDEX IF NOT EXISTS idx_tulala_brief_facts_needs_approval
  ON public.tulala_brief_facts (brief_id)
  WHERE status IN ('needs_approval', 'suggested');

CREATE OR REPLACE FUNCTION public.tulala_brief_facts_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tulala_brief_facts_touch_updated_at ON public.tulala_brief_facts;
CREATE TRIGGER trg_tulala_brief_facts_touch_updated_at
  BEFORE UPDATE ON public.tulala_brief_facts
  FOR EACH ROW EXECUTE FUNCTION public.tulala_brief_facts_touch_updated_at();

-- ─── Versions ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tulala_brief_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID NOT NULL REFERENCES public.tulala_briefs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- The full fact set as of this version, plus the recommendation that was
  -- shown. Self-contained on purpose: restoring v2 must not depend on the
  -- current fact rows, or "restore" would be a no-op.
  snapshot JSONB NOT NULL,

  -- Why this version exists. Repositioning a business creates v3; it never
  -- overwrites v2.
  reason TEXT NOT NULL DEFAULT 'intake',
  engine_version TEXT,

  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tulala_brief_versions_reason_known
    CHECK (reason IN ('intake', 'user_edit', 'reimport', 'repositioning', 'restore', 'reset'))
);

COMMENT ON TABLE public.tulala_brief_versions IS
  'Append-only snapshots of a brief, following the agency_business_identity_revisions precedent. Self-contained: a snapshot carries the whole fact set so restoring an old version does not depend on current rows. Never updated, never deleted except by cascade.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tulala_brief_versions_brief_version
  ON public.tulala_brief_versions (brief_id, version);
CREATE INDEX IF NOT EXISTS idx_tulala_brief_versions_brief_created
  ON public.tulala_brief_versions (brief_id, created_at DESC);

-- ─── Upgrade triggers ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tulala_brief_upgrade_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID NOT NULL REFERENCES public.tulala_briefs(id) ON DELETE CASCADE,

  -- The machine-checkable condition, from the app-side catalog. Not prose: the
  -- Account Strategist has to be able to EVALUATE it, so "she might grow" is
  -- not a trigger and 'roster_seat_needed' is.
  trigger_key TEXT NOT NULL,
  -- What becomes correct when it fires.
  target_package TEXT NOT NULL,
  target_tier TEXT NOT NULL,

  -- The user-facing sentence, stored per brief because it quotes their own
  -- situation back at them ("when you start booking for someone other than
  -- yourself"). Generated at write time from their facts, not at read time.
  rationale TEXT,

  fired_at TIMESTAMPTZ,
  -- Set when the user was told and said no. A declined upsell must be
  -- remembered, or the only remaining tactic is asking again.
  dismissed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tulala_brief_upgrade_triggers_key_nonempty
    CHECK (char_length(trim(trigger_key)) > 0)
);

COMMENT ON TABLE public.tulala_brief_upgrade_triggers IS
  '"Fit, not force": written when the engine''s honest answer is Free, recording the observable condition that would make a paid plan genuinely correct later. Read by the Account Strategist. Gives a declined upsell a durable home so upselling becomes timing rather than repetition.';
COMMENT ON COLUMN public.tulala_brief_upgrade_triggers.trigger_key IS
  'Machine-checkable condition key from the app-side catalog. Must be evaluable against real account state; a trigger that can only be judged by a human is not a trigger.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tulala_brief_upgrade_triggers_brief_key
  ON public.tulala_brief_upgrade_triggers (brief_id, trigger_key);
CREATE INDEX IF NOT EXISTS idx_tulala_brief_upgrade_triggers_pending
  ON public.tulala_brief_upgrade_triggers (trigger_key)
  WHERE fired_at IS NULL AND dismissed_at IS NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
--
-- No anon policy on any of these tables, matching the guest-support stance:
-- anonymous rows are reachable only through the service role, and only after
-- the server has verified the HMAC-signed guest cookie. An anon SELECT policy
-- keyed on a cookie value would be a table-wide read to anyone who can forge
-- the cookie shape, and the cookie's signature cannot be checked in SQL.
--
-- Authenticated users get SELECT on their own brief and nothing more. Every
-- write is server-side, so REVOKE is the real gate and the SELECT policies are
-- there to let the Settings surface read without a service-role round-trip.

ALTER TABLE public.tulala_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tulala_brief_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tulala_brief_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tulala_brief_upgrade_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tulala_briefs_select_own ON public.tulala_briefs;
CREATE POLICY tulala_briefs_select_own ON public.tulala_briefs
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS tulala_brief_facts_select_own ON public.tulala_brief_facts;
CREATE POLICY tulala_brief_facts_select_own ON public.tulala_brief_facts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tulala_briefs b
      WHERE b.id = tulala_brief_facts.brief_id
        AND b.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tulala_brief_versions_select_own ON public.tulala_brief_versions;
CREATE POLICY tulala_brief_versions_select_own ON public.tulala_brief_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tulala_briefs b
      WHERE b.id = tulala_brief_versions.brief_id
        AND b.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tulala_brief_upgrade_triggers_select_own ON public.tulala_brief_upgrade_triggers;
CREATE POLICY tulala_brief_upgrade_triggers_select_own ON public.tulala_brief_upgrade_triggers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tulala_briefs b
      WHERE b.id = tulala_brief_upgrade_triggers.brief_id
        AND b.profile_id = (SELECT auth.uid())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.tulala_briefs FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.tulala_brief_facts FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.tulala_brief_versions FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.tulala_brief_upgrade_triggers FROM authenticated, anon;

REVOKE ALL ON public.tulala_briefs FROM anon;
REVOKE ALL ON public.tulala_brief_facts FROM anon;
REVOKE ALL ON public.tulala_brief_versions FROM anon;
REVOKE ALL ON public.tulala_brief_upgrade_triggers FROM anon;

GRANT SELECT ON public.tulala_briefs TO authenticated;
GRANT SELECT ON public.tulala_brief_facts TO authenticated;
GRANT SELECT ON public.tulala_brief_versions TO authenticated;
GRANT SELECT ON public.tulala_brief_upgrade_triggers TO authenticated;

-- ─── Claim ────────────────────────────────────────────────────────────────────
--
-- Guest brief becomes a profile's brief. SECURITY DEFINER and keyed on the
-- session key, mirroring merge_guest_session_to_client.
--
-- Clearing guest_session_id is not tidiness: cookies are recycled, and a
-- claimed brief that still answers to a cookie is a cross-account read waiting
-- to happen. The owner CHECK stays satisfied because profile_id is set in the
-- same statement.

CREATE OR REPLACE FUNCTION public.claim_tulala_brief_for_user(
  p_session_key TEXT,
  p_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
  claimed UUID;
BEGIN
  IF p_session_key IS NULL OR length(trim(p_session_key)) < 8 THEN
    RETURN NULL;
  END IF;
  IF p_profile_id IS NULL OR p_profile_id <> auth.uid() THEN
    RAISE EXCEPTION 'Can only claim a brief for yourself';
  END IF;

  SELECT id INTO gid FROM public.guest_sessions WHERE session_key = p_session_key;
  IF gid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Most recent unclaimed brief for this cookie. A guest with several abandoned
  -- attempts gets the one they were actually working on.
  UPDATE public.tulala_briefs
  SET profile_id = p_profile_id,
      guest_session_id = NULL,
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.tulala_briefs
    WHERE guest_session_id = gid
      AND profile_id IS NULL
      AND status <> 'abandoned'
    ORDER BY updated_at DESC
    LIMIT 1
  )
  RETURNING id INTO claimed;

  RETURN claimed;
END;
$$;

COMMENT ON FUNCTION public.claim_tulala_brief_for_user(TEXT, UUID) IS
  'Attach the most recent unclaimed guest brief to a profile. Refuses to claim on behalf of anyone but the caller. Clears guest_session_id so a recycled cookie cannot reach a claimed brief.';

REVOKE ALL ON FUNCTION public.claim_tulala_brief_for_user(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_tulala_brief_for_user(TEXT, UUID) TO authenticated;

COMMIT;
