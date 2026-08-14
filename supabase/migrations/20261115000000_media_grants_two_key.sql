-- 20261115000000_media_grants_two_key.sql
--
-- Phase 3 of web/docs/media-ownership-and-brand-library-plan-2026-08-10.md —
-- "two-key grants" (§P2, §5c, §7). THE fire-dancer milestone.
--
-- THE RULE (§P2)
-- ──────────────
--   An asset may appear on surface S of hub H only if the OWNER allows H
--   AND the SUBJECT (the person in the photo) allows H.
--
-- Both keys default ON for the context that created the asset, so nothing
-- breaks. This migration encodes those defaults as IMPLICIT grants inside one
-- SQL predicate; `media_grants` rows carry only the EXPLICIT extensions
-- (a release to a third hub) and revocations.
--
-- WHY A SQL FUNCTION AND NOT JUST TS
-- ──────────────────────────────────
-- §7: "one predicate, one place". RLS policies, matview refreshers and the TS
-- resolver must not re-derive visibility independently — that is precisely how
-- the 2026-08 `is_publicly_listed` incidents happened (migration 20260803203521
-- exists because three readers disagreed). The TS resolver in
-- web/src/lib/media/talent-media-for-hub.ts calls the batch function below.
--
-- NOTE ON THE FILENAME TIMESTAMP
-- ──────────────────────────────
-- House rule is `date -u +%Y%m%d%H%M%S` (would be 20260814232116 today), but
-- this repo's migration sequence runs AHEAD of the wall clock: the applied tip
-- is 20261114000000. A wall-clock name would sort behind ~40 already-applied
-- migrations and trip `supabase db push` history drift, so this file continues
-- the sequence instead. One migration this agent, no timestamp collision.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. media_grants — the explicit half of the two-key rule (plan §5c)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.media_grants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  grant_kind          TEXT NOT NULL CHECK (grant_kind IN ('owner','subject')),
  scope               TEXT NOT NULL CHECK (scope IN ('tenant','master','all_hubs')),
  tenant_id           UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  granted_by          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_request_id   UUID REFERENCES public.talent_agency_permission_requests(id) ON DELETE SET NULL,
  watermark_required  BOOLEAN NOT NULL DEFAULT false,
  expires_at          TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- scope='tenant' is meaningless without a target; the other two scopes must
  -- NOT carry one (a 'master'/'all_hubs' row with a tenant would read as if it
  -- were narrower than it is).
  CONSTRAINT media_grants_tenant_scope_chk CHECK (
    (scope = 'tenant' AND tenant_id IS NOT NULL)
    OR (scope <> 'tenant' AND tenant_id IS NULL)
  )
);

COMMENT ON TABLE public.media_grants IS
  'Explicit half of the two-key rule (plan §P2/§5c). An asset shows on hub H only if the OWNER allows H and the SUBJECT allows H. Defaults (owner home hub, managing-hub representation, the subject''s own master profile) are IMPLICIT and live in media_asset_presentable_on_tenant() — they are NOT rows here. Rows here are releases to third hubs plus their revocations.';
COMMENT ON COLUMN public.media_grants.grant_kind IS
  'owner = the asset owner releases it; subject = the person in the photo consents. A release to a third hub needs BOTH rows.';
COMMENT ON COLUMN public.media_grants.scope IS
  'tenant = one named hub (tenant_id); master = the talent''s Tulala Digital master profile; all_hubs = anywhere.';
COMMENT ON COLUMN public.media_grants.revoked_at IS
  'Set to un-publish. Revocation takes effect on the next resolve everywhere (single resolver + cache-tag busts), per plan §8 phase 3 risk note.';

CREATE INDEX IF NOT EXISTS media_grants_asset_active_idx
  ON public.media_grants (asset_id, grant_kind)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS media_grants_tenant_active_idx
  ON public.media_grants (tenant_id)
  WHERE revoked_at IS NULL AND tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_grants_source_request_idx
  ON public.media_grants (source_request_id)
  WHERE source_request_id IS NOT NULL;

-- One live grant per (asset, kind, scope, tenant). Revoked rows stay for audit,
-- and re-granting after a revoke inserts a fresh row.
CREATE UNIQUE INDEX IF NOT EXISTS media_grants_live_uniq
  ON public.media_grants (asset_id, grant_kind, scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. THE PREDICATE — one place, shared by RLS, refreshers and the TS resolver
-- ═══════════════════════════════════════════════════════════════════════════

-- Does an ACTIVE explicit grant of this kind cover this surface?
-- p_tenant_id IS NULL means the master surface (Tulala Digital / Discover).
CREATE OR REPLACE FUNCTION public.media_grant_active(
  p_asset_id  UUID,
  p_tenant_id UUID,
  p_kind      TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.media_grants g
    WHERE g.asset_id   = p_asset_id
      AND g.grant_kind = p_kind
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND (
        g.scope = 'all_hubs'
        OR (g.scope = 'master' AND p_tenant_id IS NULL)
        OR (g.scope = 'tenant' AND p_tenant_id IS NOT NULL AND g.tenant_id = p_tenant_id)
      )
  );
$$;

COMMENT ON FUNCTION public.media_grant_active(UUID, UUID, TEXT) IS
  'Is there an unrevoked, unexpired media_grants row of this kind covering this surface? p_tenant_id NULL = master surface.';

-- ───────────────────────────────────────────────────────────────────────────
-- The two-key predicate. p_tenant_id IS NULL = master surface.
--
-- IMPLICIT GRANTS (plan §P2 "Both keys default ON for the context that created
-- the asset, so nothing breaks"). These are what keep the flag flip
-- non-breaking — today 100% of the ~2,334 live talent assets are
-- ownership_kind='talent' with zero grant rows, and every one of them must
-- keep rendering exactly where it renders now:
--
--   OWNER key
--     agency-owned  · its own hub                        → implicit
--                   · master                             → visible_on_master_profile (the owner already controls this bit, §2)
--                   · any other hub                      → explicit 'owner' grant required  ← the fire-dancer default (V1)
--     talent-owned  · master                             → implicit (master is talent-controlled, V4)
--                   · a hub that actively rosters them   → implicit (representation, §P2)
--                   · any other hub                      → explicit 'owner' grant required
--     platform      · anywhere                           → implicit (starter kits)
--
--   SUBJECT key
--     no subject (brand imagery)                         → n/a
--     subject owns the asset (talent-owned)              → trivially theirs
--     agency-owned, on the OWNING hub                    → implicit: representation implies consent.
--                                                          A takedown there is a human workflow, NOT an
--                                                          automatic hide (plan V3) — the agency curates its own site.
--     agency-owned, on master                            → implicit: master is the subject's own surface;
--                                                          placing it there is itself the consent act.
--     agency-owned, on any THIRD hub                     → explicit 'subject' grant required, defaults OFF (plan V3).
--                                                          In practice the talent's release REQUEST writes this row and
--                                                          the agency's approval writes the matching 'owner' row, so
--                                                          "defaults OFF outside the owning hub" holds without a
--                                                          separate opt-in that would blank master galleries.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.media_asset_presentable_on_tenant(
  p_asset_id  UUID,
  p_tenant_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.media_assets a
    WHERE a.id = p_asset_id
      AND a.deleted_at IS NULL
      -- ─── OWNER key ───
      AND (
        CASE a.ownership_kind
          WHEN 'agency' THEN
            (p_tenant_id IS NOT NULL AND a.owner_tenant_id = p_tenant_id)
            OR (p_tenant_id IS NULL AND a.visible_on_master_profile)
            OR public.media_grant_active(a.id, p_tenant_id, 'owner')
          WHEN 'talent' THEN
            p_tenant_id IS NULL
            OR (a.owner_talent_profile_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.agency_talent_roster r
                   WHERE r.talent_profile_id = a.owner_talent_profile_id
                     AND r.tenant_id = p_tenant_id
                     AND r.status = 'active'
               ))
            OR public.media_grant_active(a.id, p_tenant_id, 'owner')
          ELSE
            true  -- 'platform'
        END
      )
      -- ─── SUBJECT key ───
      AND (
        a.owner_talent_profile_id IS NULL
        OR a.ownership_kind <> 'agency'
        OR p_tenant_id IS NULL
        OR a.owner_tenant_id = p_tenant_id
        OR public.media_grant_active(a.id, p_tenant_id, 'subject')
      )
  );
$$;

COMMENT ON FUNCTION public.media_asset_presentable_on_tenant(UUID, UUID) IS
  'THE two-key predicate (plan §P2/§7): may this asset appear on this hub? p_tenant_id NULL = master surface. Implicit grants (owner home hub, managing-hub representation, subject''s own master profile) are baked in so enabling enforcement changes nothing for assets that have no grant rows. One predicate, one place — do not re-derive this anywhere else.';

-- Batch form for the resolver: hand it the candidate ids, get back the ones
-- that pass. One round trip instead of N, and the app never re-implements the
-- rule (plan §7 "there must be exactly one").
CREATE OR REPLACE FUNCTION public.media_assets_presentable_on_tenant(
  p_asset_ids UUID[],
  p_tenant_id UUID
)
RETURNS TABLE (asset_id UUID)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id
  FROM public.media_assets a
  WHERE a.id = ANY(p_asset_ids)
    AND public.media_asset_presentable_on_tenant(a.id, p_tenant_id);
$$;

COMMENT ON FUNCTION public.media_assets_presentable_on_tenant(UUID[], UUID) IS
  'Batch filter over media_asset_presentable_on_tenant(). Called by resolveTalentMediaForHub via RPC; keeps the two-key rule in exactly one place.';

GRANT EXECUTE ON FUNCTION public.media_grant_active(UUID, UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.media_asset_presentable_on_tenant(UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.media_assets_presentable_on_tenant(UUID[], UUID) TO authenticated, anon, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS — mirrors the agency_talent_media / talent_agency_data_grants shape
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.media_grants ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access (same arm every neighbouring table carries).
DROP POLICY IF EXISTS mg_all_platform_admin ON public.media_grants;
CREATE POLICY mg_all_platform_admin ON public.media_grants
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- The OWNER's staff write owner grants. "Owner" = the asset's owner_tenant_id
-- for agency-owned assets; that workspace decides releases of its own photos.
DROP POLICY IF EXISTS mg_all_owner_tenant_staff ON public.media_grants;
CREATE POLICY mg_all_owner_tenant_staff ON public.media_grants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.media_assets a
       WHERE a.id = media_grants.asset_id
         AND a.owner_tenant_id IS NOT NULL
         AND public.is_staff_of_tenant(a.owner_tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.media_assets a
       WHERE a.id = media_grants.asset_id
         AND a.owner_tenant_id IS NOT NULL
         AND public.is_staff_of_tenant(a.owner_tenant_id)
    )
  );

-- The RECEIVING hub's staff may read grants pointed at them (so their roster
-- drawer can explain "this photo is here because Impronta released it").
-- Read only: a hub cannot grant itself someone else's photo.
DROP POLICY IF EXISTS mg_select_target_tenant_staff ON public.media_grants;
CREATE POLICY mg_select_target_tenant_staff ON public.media_grants
  FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id));

-- The SUBJECT sees every grant on a photo of themselves — the locked-tile UX
-- has to explain each lock, never a silent absence.
DROP POLICY IF EXISTS mg_select_own_subject ON public.media_grants;
CREATE POLICY mg_select_own_subject ON public.media_grants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.media_assets a
        JOIN public.talent_profiles tp ON tp.id = a.owner_talent_profile_id
       WHERE a.id = media_grants.asset_id
         AND tp.user_id = auth.uid()
    )
  );

-- The SUBJECT writes their OWN consent key (grant_kind='subject') and may
-- revoke it. They can never write an 'owner' row — that is the whole point of
-- two keys.
DROP POLICY IF EXISTS mg_insert_own_subject ON public.media_grants;
CREATE POLICY mg_insert_own_subject ON public.media_grants
  FOR INSERT
  WITH CHECK (
    grant_kind = 'subject'
    AND granted_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.media_assets a
        JOIN public.talent_profiles tp ON tp.id = a.owner_talent_profile_id
       WHERE a.id = media_grants.asset_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS mg_update_own_subject ON public.media_grants;
CREATE POLICY mg_update_own_subject ON public.media_grants
  FOR UPDATE
  USING (
    grant_kind = 'subject'
    AND EXISTS (
      SELECT 1
        FROM public.media_assets a
        JOIN public.talent_profiles tp ON tp.id = a.owner_talent_profile_id
       WHERE a.id = media_grants.asset_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (grant_kind = 'subject');

COMMIT;
