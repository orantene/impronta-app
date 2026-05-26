-- Talent personal sites: all tiers (Free/Pro/Max), plan-change flags, snapshot template fields.

BEGIN;

-- Plan-change metadata (does not mutate snapshots)
ALTER TABLE public.talent_sites
  ADD COLUMN IF NOT EXISTS plan_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_template_reset boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.talent_sites.plan_locked IS
  'True when tier no longer allows editing current composition (e.g. Max→Pro with custom mode).';

COMMENT ON COLUMN public.talent_sites.pending_template_reset IS
  'True when next publish must clamp to an allowed template for the current tier.';

-- Owner may manage personal site at any talent tier (not Max-only).
DROP POLICY IF EXISTS talent_sites_owner_insert ON public.talent_sites;
CREATE POLICY talent_sites_owner_insert ON public.talent_sites
  FOR INSERT
  WITH CHECK (public.is_talent_profile_owner(talent_profile_id));

DROP POLICY IF EXISTS talent_sites_owner_update ON public.talent_sites;
CREATE POLICY talent_sites_owner_update ON public.talent_sites
  FOR UPDATE
  USING (public.is_talent_profile_owner(talent_profile_id))
  WITH CHECK (public.is_talent_profile_owner(talent_profile_id));

DROP POLICY IF EXISTS talent_site_revisions_owner_insert ON public.talent_site_revisions;
CREATE POLICY talent_site_revisions_owner_insert ON public.talent_site_revisions
  FOR INSERT
  WITH CHECK (public.is_talent_profile_owner(talent_profile_id));

-- Backfill templateKey + compositionMode inside existing JSONB snapshots
UPDATE public.talent_sites
SET
  draft_snapshot = draft_snapshot
    || jsonb_build_object(
      'templateKey', COALESCE(draft_snapshot->>'templateKey', 'roster'),
      'compositionMode', COALESCE(draft_snapshot->>'compositionMode', 'template')
    ),
  published_snapshot = CASE
    WHEN published_snapshot IS NULL THEN NULL
    ELSE published_snapshot
      || jsonb_build_object(
        'templateKey', COALESCE(published_snapshot->>'templateKey', 'roster'),
        'compositionMode', COALESCE(published_snapshot->>'compositionMode', 'template')
      )
  END
WHERE draft_snapshot IS NOT NULL;

COMMIT;
