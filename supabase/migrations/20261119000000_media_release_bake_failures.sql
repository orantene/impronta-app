-- 20261119000000_media_release_bake_failures.sql
--
-- THE REPAIR QUEUE FOR WATERMARK BAKES THAT FAILED AT APPROVAL TIME.
--
-- Approving a release with "require watermark" writes the owner key and then
-- bakes a marked derivative per asset. A bake can fail (storage blip, sharp
-- OOM on a large original, a logo URL that 404s). #1139 made the approval roll
-- those assets back out of the release so the stored state matches what is
-- servable, and offered "Retry watermark" on the partial-success banner.
--
-- WHAT WAS MISSING. Which assets failed was never STORED. The rollback writes a
-- `grant.release_bake_failed` row into `media_asset_activity`, but that is an
-- append-only audit trail, not a queryable queue: it has no resolved state, so
-- nothing can ask "what still needs repairing?" without replaying history and
-- guessing. The only live copy of the failed ids was the approval response, so
-- the retry died the moment the tab was closed.
--
-- WHY NOT RE-DERIVE IT. "An approved asset with no live owner grant" also
-- describes every photo staff REVOKED on purpose, and a repair queue that
-- offers to re-release those would undo a deliberate takedown with one click.
-- The difference between "failed" and "revoked" is intent, and intent is not
-- recoverable from the grant rows. So it is recorded explicitly, by the one
-- code path that knows: the bake-failure rollback.
--
-- ONLY THE FAILURE PATH WRITES HERE. `rollBackFailedReleaseBakes` inserts, the
-- retry resolves ('repaired') or bumps `attempts`, and a staff revoke resolves
-- ('revoked') so an intentionally ended release can never come back through
-- the repair door. Nothing derives rows from grant state.
--
-- NOTE ON THE FILENAME TIMESTAMP
-- ──────────────────────────────
-- House rule is `date -u +%Y%m%d%H%M%S`, but this repo's migration sequence
-- runs AHEAD of the wall clock: the applied tip is 20261117000000. A wall-clock
-- name would sort behind ~40 already-applied migrations and trip `supabase db
-- push` history drift, so this file continues the sequence instead.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.media_release_bake_failures (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         UUID NOT NULL REFERENCES public.talent_agency_permission_requests(id) ON DELETE CASCADE,
  asset_id           UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  -- The OWNING workspace: the one whose staff can fix the cause and retry.
  -- Denormalised from the asset so the per-workspace queue read is one index
  -- hit and never a join through media_assets.
  tenant_id          UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id  UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  -- The hub the approval pointed at; NULL = the 'all_hubs' scope, matching the
  -- media_grants convention. Stored so a repair re-releases to exactly the
  -- surface the approval named and can never re-point the release.
  target_tenant_id   UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  attempts           INT NOT NULL DEFAULT 1 CHECK (attempts > 0),
  first_failed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ,
  resolution         TEXT CHECK (resolution IN ('repaired', 'revoked')),

  -- Resolved means BOTH columns are set. A half-resolved row would read as
  -- pending to the queue and as done to a human.
  CONSTRAINT media_release_bake_failures_resolution_chk
    CHECK ((resolved_at IS NULL) = (resolution IS NULL))
);

COMMENT ON TABLE public.media_release_bake_failures IS
  'Durable repair queue for watermark bakes that failed while approving a media release. One PENDING row per (request, asset); written only by the bake-failure rollback, cleared when a retry succeeds or when staff revoke the release. Deliberate revokes are recorded as resolution=''revoked'' so they can never resurface as repair candidates.';
COMMENT ON COLUMN public.media_release_bake_failures.tenant_id IS
  'The OWNING workspace (media_assets.owner_tenant_id at failure time) — the one whose staff see and retry this repair.';
COMMENT ON COLUMN public.media_release_bake_failures.target_tenant_id IS
  'The hub the release pointed at. NULL = scope all_hubs, same convention as media_grants.tenant_id.';
COMMENT ON COLUMN public.media_release_bake_failures.resolution IS
  'repaired = a retry baked it and the owner key is live again; revoked = staff ended the release, so the repair is moot. NULL while pending.';

-- One OPEN repair per (request, asset). Resolved rows stay for audit, and a
-- later failure on the same pair inserts a fresh row.
CREATE UNIQUE INDEX IF NOT EXISTS media_release_bake_failures_open_uniq
  ON public.media_release_bake_failures (request_id, asset_id)
  WHERE resolved_at IS NULL;

-- The queue read: everything pending for one workspace, newest failure first.
CREATE INDEX IF NOT EXISTS media_release_bake_failures_pending_idx
  ON public.media_release_bake_failures (tenant_id, last_failed_at DESC)
  WHERE resolved_at IS NULL;

-- The revoke sweep looks pending rows up by asset.
CREATE INDEX IF NOT EXISTS media_release_bake_failures_asset_idx
  ON public.media_release_bake_failures (asset_id)
  WHERE resolved_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Record a batch of failures — insert new, bump the ones already open
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A function rather than a PostgREST upsert because the uniqueness is on a
-- PARTIAL index: ON CONFLICT can only infer it when the statement repeats the
-- index predicate, which PostgREST cannot express. Doing it here also keeps
-- "insert or bump" atomic for the whole batch instead of N round trips.

CREATE OR REPLACE FUNCTION public.record_media_release_bake_failures(
  p_request_id        UUID,
  p_asset_ids         UUID[],
  p_tenant_id         UUID,
  p_talent_profile_id UUID,
  p_target_tenant_id  UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  IF p_asset_ids IS NULL OR array_length(p_asset_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.media_release_bake_failures AS f (
    request_id, asset_id, tenant_id, talent_profile_id, target_tenant_id
  )
  SELECT p_request_id, a.asset_id, p_tenant_id, p_talent_profile_id, p_target_tenant_id
    FROM unnest(p_asset_ids) AS a(asset_id)
  ON CONFLICT (request_id, asset_id) WHERE resolved_at IS NULL
  DO UPDATE
    SET attempts       = f.attempts + 1,
        last_failed_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.record_media_release_bake_failures(UUID, UUID[], UUID, UUID, UUID) IS
  'Open (or re-stamp) the pending repair rows for assets whose watermark bake failed. Idempotent per (request, asset): a second failure bumps attempts and last_failed_at rather than piling up rows.';

GRANT EXECUTE ON FUNCTION public.record_media_release_bake_failures(UUID, UUID[], UUID, UUID, UUID)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS — mirrors the media_grants policy shape (20261115000000)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every app path reads and writes this table with the SERVICE ROLE (the release
-- rail runs behind `requireWorkspaceStaffAction`), so these policies are the
-- defence-in-depth layer for any direct client, not the primary gate.

ALTER TABLE public.media_release_bake_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mrbf_all_platform_admin ON public.media_release_bake_failures;
CREATE POLICY mrbf_all_platform_admin ON public.media_release_bake_failures
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- The owning workspace's staff. `tenant_id` IS the owner here, so this is the
-- direct form of the media_grants `mg_all_owner_tenant_staff` join.
DROP POLICY IF EXISTS mrbf_all_owner_tenant_staff ON public.media_release_bake_failures;
CREATE POLICY mrbf_all_owner_tenant_staff ON public.media_release_bake_failures
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- The SUBJECT may read failures on photos of themselves: "approved but not
-- showing" is their question too, and a silent absence is the thing the media
-- ownership plan bans. Read only — the fix is the owner's to make.
DROP POLICY IF EXISTS mrbf_select_own_subject ON public.media_release_bake_failures;
CREATE POLICY mrbf_select_own_subject ON public.media_release_bake_failures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.talent_profiles tp
       WHERE tp.id = media_release_bake_failures.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

COMMIT;
