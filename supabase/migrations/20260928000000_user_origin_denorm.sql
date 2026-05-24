-- Platform Users Control Center — M0.4: user_origin_event (origin denorm).
--
-- Adds origin_kind / origin_workspace_id / origin_created_by_user_id columns
-- to both talent_profiles and profiles. These power the C.2 Origin &
-- Provenance drawer section in the Platform Users Control Center.
--
-- Ref: web/docs/platform-users-control-center-plan-2026-05-23.md §2 (M0.4),
--      §3 (A.2 origin resolver).
--
-- origin_kind values:
--   - agency_signup          — created by owner/admin of plan_tier ∈ {agency, network}
--   - studio_signup          — created by owner/admin of plan_tier = studio
--   - platform_admin_signup  — created by super_admin / agency_staff with no
--                              workspace context, OR talent with no provenance
--   - self_signup            — user created their own account (no creator)
--   - claim_invite           — talent row where user_id was set AFTER creation
--
-- IMPORTANT — NULL strategy:
--   The SQL backfill here is best-effort. Any row that cannot be cleanly
--   resolved keeps origin_kind = NULL; the TypeScript resolver
--   (web/src/lib/platform/origin-resolver.ts) computes the live value at
--   query time and uses denorm values only as a fast path when populated.
--
-- created_by_user_id_provenance on talent_profiles references public.profiles(id)
-- (which itself REFERENCES auth.users(id) ON DELETE CASCADE), so we mirror that
-- by referencing public.profiles(id) for consistency with existing provenance.

BEGIN;

-- ---------------------------------------------------------------------------
-- talent_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS origin_kind TEXT
    CHECK (origin_kind IS NULL OR origin_kind IN (
      'agency_signup',
      'studio_signup',
      'platform_admin_signup',
      'self_signup',
      'claim_invite'
    ));

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS origin_workspace_id UUID
    REFERENCES public.agencies(id) ON DELETE SET NULL;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS origin_created_by_user_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.talent_profiles.origin_kind IS
  'Denorm: how this talent row entered the platform. NULL means not-yet-resolved; the TS resolveOrigin() helper computes live and may backfill later.';
COMMENT ON COLUMN public.talent_profiles.origin_workspace_id IS
  'Denorm: workspace whose member created this talent (if any).';
COMMENT ON COLUMN public.talent_profiles.origin_created_by_user_id IS
  'Denorm: profile id of the creator (mirrors created_by_user_id_provenance once resolved).';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS origin_kind TEXT
    CHECK (origin_kind IS NULL OR origin_kind IN (
      'agency_signup',
      'studio_signup',
      'platform_admin_signup',
      'self_signup',
      'claim_invite'
    ));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS origin_workspace_id UUID
    REFERENCES public.agencies(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS origin_created_by_user_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.origin_kind IS
  'Denorm: how this human ended up on the platform. NULL means not-yet-resolved.';

-- ---------------------------------------------------------------------------
-- Indexes (filter performance for the Platform Users Control Center grid)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS talent_profiles_origin_kind_idx
  ON public.talent_profiles (origin_kind)
  WHERE origin_kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS talent_profiles_origin_workspace_idx
  ON public.talent_profiles (origin_workspace_id)
  WHERE origin_workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_origin_kind_idx
  ON public.profiles (origin_kind)
  WHERE origin_kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_origin_workspace_idx
  ON public.profiles (origin_workspace_id)
  WHERE origin_workspace_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Best-effort backfill (talent_profiles)
-- ---------------------------------------------------------------------------
--
-- Strategy:
--   1. Mirror created_by_user_id_provenance → origin_created_by_user_id.
--   2. Set origin_workspace_id from the creator's earliest active membership
--      (one row per creator — pick first by accepted_at then created_at).
--   3. origin_kind:
--      - If user_id IS NOT NULL AND created_by_user_id_provenance IS NOT NULL
--        AND user_id <> created_by_user_id_provenance → 'claim_invite'.
--      - Else if creator's chosen workspace has plan_tier IN ('agency','network')
--        → 'agency_signup'.
--      - Else if plan_tier = 'studio' → 'studio_signup'.
--      - Else if creator exists but no workspace context found
--        → 'platform_admin_signup'.
--      - Else (no creator, no user_id) → leave NULL (resolver computes).
--      - source_type = 'freelancer_signup' AND user_id IS NOT NULL with no
--        provenance creator → 'self_signup'.

UPDATE public.talent_profiles t
   SET origin_created_by_user_id = t.created_by_user_id_provenance
 WHERE t.created_by_user_id_provenance IS NOT NULL
   AND t.origin_created_by_user_id IS NULL;

-- Pick the creator's primary workspace (earliest active membership where they
-- own/admin — falls back to any active row). LATERAL subquery so each talent
-- row resolves its own creator membership independently.
WITH creator_workspace AS (
  SELECT
    t.id AS talent_id,
    (
      SELECT am.tenant_id
        FROM public.agency_memberships am
       WHERE am.profile_id = t.created_by_user_id_provenance
         AND am.status = 'active'
       ORDER BY
         CASE WHEN am.role IN ('owner','admin') THEN 0 ELSE 1 END,
         am.accepted_at NULLS LAST,
         am.created_at
       LIMIT 1
    ) AS tenant_id
    FROM public.talent_profiles t
   WHERE t.created_by_user_id_provenance IS NOT NULL
     AND t.origin_workspace_id IS NULL
)
UPDATE public.talent_profiles t
   SET origin_workspace_id = cw.tenant_id
  FROM creator_workspace cw
 WHERE cw.talent_id = t.id
   AND cw.tenant_id IS NOT NULL;

-- claim_invite: user_id and provenance differ.
UPDATE public.talent_profiles t
   SET origin_kind = 'claim_invite'
 WHERE t.origin_kind IS NULL
   AND t.user_id IS NOT NULL
   AND t.created_by_user_id_provenance IS NOT NULL
   AND t.user_id <> t.created_by_user_id_provenance;

-- agency_signup / studio_signup based on origin_workspace plan_tier.
UPDATE public.talent_profiles t
   SET origin_kind = CASE a.plan_tier
                       WHEN 'agency'  THEN 'agency_signup'
                       WHEN 'network' THEN 'agency_signup'
                       WHEN 'studio'  THEN 'studio_signup'
                       ELSE 'platform_admin_signup'
                     END
  FROM public.agencies a
 WHERE t.origin_kind IS NULL
   AND t.origin_workspace_id = a.id;

-- Has provenance creator but no workspace resolved → platform_admin_signup.
UPDATE public.talent_profiles t
   SET origin_kind = 'platform_admin_signup'
 WHERE t.origin_kind IS NULL
   AND t.created_by_user_id_provenance IS NOT NULL;

-- Freelancer self-signup pattern: user_id set, no provenance creator.
UPDATE public.talent_profiles t
   SET origin_kind = 'self_signup'
 WHERE t.origin_kind IS NULL
   AND t.created_by_user_id_provenance IS NULL
   AND t.user_id IS NOT NULL
   AND COALESCE(t.source_type, '') IN ('freelancer_signup', 'legacy');

-- ---------------------------------------------------------------------------
-- Best-effort backfill (profiles)
-- ---------------------------------------------------------------------------
--
-- For human accounts we don't have a 'created_by' analog, so we only resolve
-- the unambiguous case: profile linked to a talent_profiles row that has
-- already been resolved above. Everyone else stays NULL.

UPDATE public.profiles p
   SET origin_kind = t.origin_kind,
       origin_workspace_id = t.origin_workspace_id,
       origin_created_by_user_id = t.origin_created_by_user_id
  FROM public.talent_profiles t
 WHERE t.user_id = p.id
   AND p.origin_kind IS NULL
   AND t.origin_kind IS NOT NULL;

COMMIT;
