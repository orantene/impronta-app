-- Public-read RLS for talent-OWNED data — follow-on to 20260522061318/61320.
--
-- 20260522061318 fixed the public gate on talent_profiles itself, but the
-- SELECT policies on every table that hangs off a talent (media, taxonomy,
-- field values, languages, service areas) still gated anon reads on the old
-- `workflow_status='approved' AND visibility='public'` lifecycle. Result: a
-- talent the agency has turned ON via the directory eye shows up as a card,
-- but their photos / attributes / city are blocked by RLS — a blank card.
--
-- Fix: swap the public branch of each policy to the new gate —
--   talent not globally hidden AND site_visible/featured on some roster —
-- reusing the recursion-safe SECURITY DEFINER helper
-- public.talent_is_site_visible_anywhere(uuid). Staff and talent-owner
-- branches are preserved unchanged.

BEGIN;

-- 1. media_assets — the directory card photo. ───────────────────────────────
DROP POLICY IF EXISTS media_select ON public.media_assets;
CREATE POLICY media_select ON public.media_assets
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      public.is_staff_of_tenant(tenant_id)
      OR EXISTS (
        SELECT 1 FROM public.talent_profiles t
         WHERE t.id = media_assets.owner_talent_profile_id
           AND t.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.talent_profiles t
         WHERE t.id = media_assets.owner_talent_profile_id
           AND t.deleted_at IS NULL
           AND t.is_publicly_hidden = false
           AND public.talent_is_site_visible_anywhere(t.id)
           AND media_assets.approval_state = 'approved'::media_approval_state
           AND media_assets.variant_kind <> 'original'::media_variant_kind
      )
    )
  );

-- 2. talent_profile_taxonomy — the role / talent-type chip. ──────────────────
DROP POLICY IF EXISTS talent_taxonomy_select ON public.talent_profile_taxonomy;
CREATE POLICY talent_taxonomy_select ON public.talent_profile_taxonomy
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
       WHERE t.id = talent_profile_taxonomy.talent_profile_id
         AND t.deleted_at IS NULL
         AND (
              (t.is_publicly_hidden = false
               AND public.talent_is_site_visible_anywhere(t.id))
           OR t.user_id = auth.uid()
           OR EXISTS (
                SELECT 1 FROM public.agency_talent_roster atr
                 WHERE atr.talent_profile_id = t.id
                   AND public.is_staff_of_tenant(atr.tenant_id)
              )
         )
    )
  );

-- 3. field_values — card attribute values (legacy field-value store). ────────
DROP POLICY IF EXISTS field_values_public_select ON public.field_values;
CREATE POLICY field_values_public_select ON public.field_values
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      JOIN public.field_definitions d ON d.id = field_values.field_definition_id
      WHERE t.id = field_values.talent_profile_id
        AND t.deleted_at IS NULL
        AND t.is_publicly_hidden = false
        AND public.talent_is_site_visible_anywhere(t.id)
        AND d.archived_at IS NULL
        AND d.active = true
        AND d.public_visible = true
        AND d.internal_only = false
        AND d.profile_visible = true
    )
  );

-- 4. talent_languages. ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS talent_languages_select_public ON public.talent_languages;
CREATE POLICY talent_languages_select_public ON public.talent_languages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_languages.talent_profile_id
         AND tp.deleted_at IS NULL
         AND tp.is_publicly_hidden = false
         AND public.talent_is_site_visible_anywhere(tp.id)
    )
  );

-- 5. talent_profile_field_values — canonical per-tenant field values. ────────
DROP POLICY IF EXISTS tpfv_select_public ON public.talent_profile_field_values;
CREATE POLICY tpfv_select_public ON public.talent_profile_field_values
  FOR SELECT
  USING (
    workflow_state = 'live'::text
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_field_values.talent_profile_id
         AND tp.deleted_at IS NULL
         AND tp.is_publicly_hidden = false
         AND public.talent_is_site_visible_anywhere(tp.id)
    )
    AND EXISTS (
      SELECT 1 FROM public.profile_field_definitions pfd
       WHERE pfd.id = talent_profile_field_values.field_definition_id
         AND 'public'::text = ANY (
           COALESCE(talent_profile_field_values.visibility_override, pfd.default_visibility)
         )
    )
  );

-- 6. talent_service_areas — card city / location. ───────────────────────────
DROP POLICY IF EXISTS talent_service_areas_select_public ON public.talent_service_areas;
CREATE POLICY talent_service_areas_select_public ON public.talent_service_areas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_service_areas.talent_profile_id
         AND tp.deleted_at IS NULL
         AND tp.is_publicly_hidden = false
         AND public.talent_is_site_visible_anywhere(tp.id)
    )
  );

COMMIT;
