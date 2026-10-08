-- Talent content translations (plan PR 3, Migration B, 2026-09-29).
--
-- Per-locale maps next to the plain text columns a talent writes. Convention:
-- the plain column keeps the PRIMARY-language value; the `_i18n` map holds every
-- language, including the primary. Readers go through readI18n(map, plain,
-- locale, chain), so an empty map reads exactly like today (the plain column).
--
-- Additive only, no backfill. Version 20261231299520 is a reserved slot that
-- sorts after 20261231298000 (a `date -u` name would sort before the tables).

ALTER TABLE public.talent_faq_items
  ADD COLUMN IF NOT EXISTS question_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS answer_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.talent_offering_variants
  ADD COLUMN IF NOT EXISTS label_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.talent_offering_addons
  ADD COLUMN IF NOT EXISTS label_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.talent_addon_groups
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS category_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.talent_pages
  ADD COLUMN IF NOT EXISTS title_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS meta_title_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS meta_description_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.talent_faq_items.question_i18n IS
  'Per-locale question {es, en, ...}. Plain `question` holds the primary language.';
COMMENT ON COLUMN public.talent_faq_items.answer_i18n IS
  'Per-locale answer. Plain `answer` holds the primary language.';
COMMENT ON COLUMN public.talent_offering_variants.label_i18n IS
  'Per-locale option label. Plain `label` holds the primary language.';
COMMENT ON COLUMN public.talent_offering_addons.label_i18n IS
  'Per-locale extra label. Plain `label` holds the primary language.';
COMMENT ON COLUMN public.talent_addon_groups.name_i18n IS
  'Per-locale add-on group name. Plain `name` holds the primary language.';
COMMENT ON COLUMN public.talent_offerings.category_i18n IS
  'Per-locale category label. Plain `category` holds the primary language.';
COMMENT ON COLUMN public.talent_pages.title_i18n IS
  'Per-locale page title. Plain `title` holds the primary language.';
COMMENT ON COLUMN public.talent_pages.meta_title_i18n IS
  'Per-locale SEO title override. Plain `meta_title` holds the primary language.';
COMMENT ON COLUMN public.talent_pages.meta_description_i18n IS
  'Per-locale meta description. Plain `meta_description` holds the primary language.';
