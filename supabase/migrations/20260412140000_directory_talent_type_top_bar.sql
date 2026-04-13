-- Public directory: optional horizontal "Talent type" pill row above results (admin-controlled).
ALTER TABLE public.directory_sidebar_layout
  ADD COLUMN IF NOT EXISTS talent_type_top_bar_visible BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.directory_sidebar_layout.talent_type_top_bar_visible IS
  'When true and the talent_type facet is enabled, show ALL + type pills above the directory; the talent_type block is omitted from the sidebar/mobile sheet.';
