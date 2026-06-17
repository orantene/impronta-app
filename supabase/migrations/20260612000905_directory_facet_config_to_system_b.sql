-- T3.1 — Move the directory FACET CONFIG + filter_options vocabulary off legacy
-- System A (`field_definitions.config`) onto canonical System B
-- (`profile_field_definitions`), a prerequisite to dropping `field_definitions`.
--
-- WHAT MOVES
--   The directory facet CONFIG that T2.1 deliberately left on System A:
--     - `config.filter_options`  — the facet's selectable vocab (gender today;
--        for the scalar `ff` text-enum facets the vocab lives in
--        `config.options[].value`, the option SLUGS the value store filters by).
--     - `config.min` / `config.max` — slider bounds (height_cm, years_experience).
--     - `config.filter_type`       — reserved facet UI hint (NULL everywhere today).
--     - `config.sort_order`        — reserved per-facet order (NULL everywhere
--        today; real ordering lives in the `directory_filter_sort_order` COLUMN).
--   Visibility (`directory_filter_visible`) + display order
--   (`directory_filter_sort_order`) already live on System B as the canonical
--   COLUMNS `show_in_directory_filter` + `display_order`, so they are NOT copied
--   into the new jsonb — the readers keep reading those columns.
--
-- THE B HOME (and why)
--   System B `profile_field_definitions` has NO generic `config` jsonb — only
--   `options` (the EDIT vocab, label-based), `validation_rules`, `show_when`.
--   The facet `filter_options` vocab is SLUG-based and semantically DISTINCT from
--   the label-based edit `options` (for the divergent keys the value store carries
--   slugs that are not B's labels), so overloading `options` would corrupt the
--   editor's select chips. Slider min/max have no existing home either. The clean
--   correct home is a NEW namespaced jsonb column `directory_filter_config` that
--   mirrors A's `config` shape 1:1 ({ filter_options?, min?, max?, filter_type?,
--   sort_order? }) — making the reader repoint a direct 1:1 read.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + per-key UPDATEs keyed by field_key.
-- Re-applies are safe (the contract for scripts/apply-migration.mjs).

-- 1) The B home for facet config.
ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS directory_filter_config jsonb;

COMMENT ON COLUMN public.profile_field_definitions.directory_filter_config IS
  'Directory facet config migrated from legacy System A field_definitions.config (T3.1). Shape: { filter_options?: string[] (selectable vocab — option SLUGS for scalar ff facets, bare labels for gender), min?: number, max?: number, filter_type?: string, sort_order?: number }. Visibility + order are the show_in_directory_filter + display_order COLUMNS, not this jsonb.';

-- 2) Populate per directory-filterable field. The vocab is taken from System A
--    (`field_definitions.config`) and pinned to the SLUG vocabulary the value
--    store actually carries — for the scalar text-enum facets that is A's
--    config.options[].value (== the stored vocab, verified read-only against
--    prod on 2026-06-11). The 3 keys whose B `options` (edit vocab) drifted from
--    the stored vocab (availability.status, experience.level, travel.scope) are
--    ALSO reconciled below (step 3) so editor + facet agree.

-- Slider-bound facets (number value_type). Bounds copied from A config.min/max.
UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object('min', 80, 'max', 230)
 WHERE field_key = 'physical.height_cm' AND deprecated_at IS NULL;

UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object('min', 0, 'max', 60)
 WHERE field_key = 'experience.years_total' AND deprecated_at IS NULL;

-- Gender — bare-label filter vocab (the canonical 14 options already on B
-- `options`; copied verbatim into directory_filter_config so the facet reader
-- has a single config home). KEEP this vocab authoritative (task §4).
UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options',
         '["Woman","Man","Non-binary","Trans woman","Trans man","Transgender","Genderfluid","Genderqueer","Agender","Bigender","Two-Spirit","Intersex","Prefer to self-describe","Prefer not to say"]'::jsonb
       )
 WHERE field_key = 'identity.gender' AND deprecated_at IS NULL;

-- Scalar text-enum facets — filter_options = A's option SLUGS (== the value the
-- value store filters by). These slugs match the real stored distribution.
UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options', '["slim","athletic","curvy","muscular","average","other"]'::jsonb)
 WHERE field_key = 'physical.body_type' AND deprecated_at IS NULL;

UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options', '["xs","s","m","l","xl","xxl"]'::jsonb)
 WHERE field_key = 'physical.dress_size' AND deprecated_at IS NULL;

UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options', '["brown","dark_brown","hazel","green","blue","gray","black","other","amber"]'::jsonb)
 WHERE field_key = 'physical.eye_color' AND deprecated_at IS NULL;

UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options', '["black","dark_brown","brown","light_brown","blonde","dark_blonde","red","auburn","gray","other"]'::jsonb)
 WHERE field_key = 'physical.hair_color' AND deprecated_at IS NULL;

UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options', '["shaved","very_short","short","medium","long","very_long","extra_long"]'::jsonb)
 WHERE field_key = 'physical.hair_length' AND deprecated_at IS NULL;

-- The 3 STALE keys — filter_options pinned to the REAL stored vocabulary (== A's
-- slugs == the value distribution). B's `options` (edit vocab) was junk; step 3
-- reconciles it.
UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options', '["available_now","available_this_week","available_this_month","limited","by_request","unavailable"]'::jsonb)
 WHERE field_key = 'availability.status' AND deprecated_at IS NULL;

UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options', '["beginner","intermediate","experienced","professional","highly_experienced"]'::jsonb)
 WHERE field_key = 'experience.level' AND deprecated_at IS NULL;

UPDATE public.profile_field_definitions
   SET directory_filter_config = jsonb_build_object(
         'filter_options', '["local","region","national","international"]'::jsonb)
 WHERE field_key = 'travel.scope' AND deprecated_at IS NULL;

-- 3) Reconcile the 3 stale `options` (edit vocab) to the ACTUAL stored vocab so
--    the editor select chips + the directory facet agree. The stored values are
--    the slugs in step 2 (verified against the live value distribution); we keep
--    the slug vocabulary as the edit vocab too (these never had human labels in B
--    — they carried mirror-copied slugs).
--
--    availability.status: junk was ["active","by_request","paused","not_available"]
UPDATE public.profile_field_definitions
   SET options = '["available_now","available_this_week","available_this_month","limited","by_request","unavailable"]'::jsonb
 WHERE field_key = 'availability.status' AND deprecated_at IS NULL;

--    experience.level: junk was ["junior","mid_level","senior","highly_experienced"]
UPDATE public.profile_field_definitions
   SET options = '["beginner","intermediate","experienced","professional","highly_experienced"]'::jsonb
 WHERE field_key = 'experience.level' AND deprecated_at IS NULL;

--    travel.scope: junk had "regional" but the stored value is "region"
UPDATE public.profile_field_definitions
   SET options = '["local","region","national","international"]'::jsonb
 WHERE field_key = 'travel.scope' AND deprecated_at IS NULL;
