-- ============================================================================
-- Multi-Language Platform — WS3: fields / sections / groups → per-locale JSONB.
--
-- AGGRESSIVE pre-launch transform (execution plan §0.3): for each translatable
-- column pair `<base>` (+ `<base>_es`) we ADD one `<base>_i18n jsonb NOT NULL
-- DEFAULT '{}'::jsonb` shaped `{ "en": "…", "es": "…" }`, backfill it with
-- jsonb_strip_nulls(jsonb_build_object('en', base, 'es', base_es)), then DROP
-- the old columns. No dual-read window — every reader is swapped to the
-- universal resolver (`resolveLocalized`) in the same PR.
--
-- Tables (WS3 scope — disjoint from WS4's taxonomy/location/bio/services):
--   • profile_field_definitions : label/label_es, helper/helper_es,
--     placeholder (en-only), options_es (per-option ES map).
--   • profile_editor_sections   : label_en/label_es.
--   • profile_field_groups      : name_en/name_es.
--
-- OUT OF SCOPE (left for the coordinator / another WS — NOT named in WS3):
--   • profile_field_groups.description_en / description_es
--   • profile_editor_section_groups.label_en_alt / label_es_alt
--     (these live on profile_editor_section_groups, a DIFFERENT table than
--      profile_editor_sections; the WS3 mandate scoped sections to label_en/_es).
--
-- OPTIONS NOTE — `profile_field_definitions.options` stays a plain string[] of
-- option VALUES (the value == its English label; not translatable). The old
-- `options_es jsonb` was a flat { "<value>": "<es label>" } map. We fold it into
-- `option_labels_i18n jsonb` shaped per value:
--     { "<value>": { "en": "<value>", "es": "<es label>" }, … }
-- en is seeded from the option value itself (there is no separate English
-- option-label source — the value IS the English label). Render layers look up
-- option_labels_i18n[value] and run it through resolveLocalized.
-- ============================================================================

BEGIN;

-- ─── 1. profile_field_definitions ───────────────────────────────────────────

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS label_i18n         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS helper_i18n        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS placeholder_i18n   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS option_labels_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

-- label: NOT NULL base + nullable ES.
UPDATE public.profile_field_definitions
SET label_i18n = jsonb_strip_nulls(jsonb_build_object('en', label, 'es', label_es));

-- helper: both nullable.
UPDATE public.profile_field_definitions
SET helper_i18n = jsonb_strip_nulls(jsonb_build_object('en', helper, 'es', helper_es));

-- placeholder: English only today (no placeholder_es column exists).
UPDATE public.profile_field_definitions
SET placeholder_i18n = jsonb_strip_nulls(jsonb_build_object('en', placeholder));

-- option_labels_i18n: one entry per option VALUE, seeding en from the value and
-- es from the old options_es map (when present). Fields with no options
-- (`options` null or not a JSON array) keep the default '{}'.
UPDATE public.profile_field_definitions AS d
SET option_labels_i18n = sub.map
FROM (
  SELECT
    pfd.id,
    jsonb_object_agg(
      opt.value,
      jsonb_strip_nulls(
        jsonb_build_object(
          'en', opt.value,
          'es', NULLIF(btrim(coalesce(pfd.options_es ->> opt.value, '')), '')
        )
      )
    ) AS map
  FROM public.profile_field_definitions pfd
  CROSS JOIN LATERAL jsonb_array_elements_text(pfd.options) AS opt(value)
  WHERE jsonb_typeof(pfd.options) = 'array'
  GROUP BY pfd.id
) AS sub
WHERE d.id = sub.id;

COMMENT ON COLUMN public.profile_field_definitions.label_i18n IS
  'Per-locale label map { "en": …, "es": … }. Read via resolveLocalized(label_i18n, locale, chain).';
COMMENT ON COLUMN public.profile_field_definitions.helper_i18n IS
  'Per-locale helper/guidance map. Read via resolveLocalized.';
COMMENT ON COLUMN public.profile_field_definitions.placeholder_i18n IS
  'Per-locale placeholder map (en only at launch). Read via resolveLocalized.';
COMMENT ON COLUMN public.profile_field_definitions.option_labels_i18n IS
  'Per-option per-locale label map { "<value>": { "en": "<value>", "es": "<es label>" } }. `options` stays the string[] of values; look up option_labels_i18n[value] then resolveLocalized.';

ALTER TABLE public.profile_field_definitions
  DROP COLUMN label,
  DROP COLUMN label_es,
  DROP COLUMN helper,
  DROP COLUMN helper_es,
  DROP COLUMN placeholder,
  DROP COLUMN options_es;

-- ─── 2. profile_editor_sections ─────────────────────────────────────────────

ALTER TABLE public.profile_editor_sections
  ADD COLUMN IF NOT EXISTS label_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.profile_editor_sections
SET label_i18n = jsonb_strip_nulls(jsonb_build_object('en', label_en, 'es', label_es));

COMMENT ON COLUMN public.profile_editor_sections.label_i18n IS
  'Per-locale section label map { "en": …, "es": … }. Read via resolveLocalized.';

ALTER TABLE public.profile_editor_sections
  DROP COLUMN label_en,
  DROP COLUMN label_es;

-- ─── 3. profile_field_groups ────────────────────────────────────────────────

ALTER TABLE public.profile_field_groups
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.profile_field_groups
SET name_i18n = jsonb_strip_nulls(jsonb_build_object('en', name_en, 'es', name_es));

COMMENT ON COLUMN public.profile_field_groups.name_i18n IS
  'Per-locale group name map { "en": …, "es": … }. Read via resolveLocalized.';

ALTER TABLE public.profile_field_groups
  DROP COLUMN name_en,
  DROP COLUMN name_es;

COMMIT;
