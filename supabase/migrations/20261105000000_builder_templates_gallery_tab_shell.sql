-- Builder Lab Playground "shell header / shell footer" drafts write a
-- builder_templates row with gallery_tab='shell'
-- (web/src/components/builder-lab/catalog-playground.tsx — kinds shell_header /
-- shell_footer, gallery_tab 'shell'), and 'shell' is a first-class value of the
-- BuilderGalleryTab TS type (registry-rows.ts).
--
-- But builder_templates_gallery_tab_check (defined in
-- 20260611034138_builder_templates.sql) only allowed
-- ('sections','elements','connected','page_templates'). The shell-kinds
-- migration (20260616033557_wsa_a7_shell_template_kinds.sql) added the
-- shell_header / shell_footer ENUM values but explicitly left the gallery_tab
-- CHECK untouched — so createTemplateDraft for a shell header/footer failed
-- with a raw CHECK violation (builder_templates_gallery_tab_check) and no shell
-- draft could ever be created.
--
-- Widen the CHECK to include 'shell'. Idempotent (DROP IF EXISTS + re-ADD).
-- Additive only — every previously-valid value is preserved.

ALTER TABLE public.builder_templates
  DROP CONSTRAINT IF EXISTS builder_templates_gallery_tab_check;

ALTER TABLE public.builder_templates
  ADD CONSTRAINT builder_templates_gallery_tab_check
  CHECK (gallery_tab IN ('sections', 'elements', 'connected', 'page_templates', 'shell'));

COMMENT ON COLUMN public.builder_templates.gallery_tab
  IS 'Which Add Gallery tab this template appears on: sections|elements|connected|page_templates|shell.';
