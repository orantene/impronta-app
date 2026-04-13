-- Per-facet default accordion state on the public directory sidebar (admin: "Start collapsed").
ALTER TABLE public.directory_sidebar_layout
  ADD COLUMN IF NOT EXISTS section_collapsed_defaults JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.directory_sidebar_layout.section_collapsed_defaults IS
  'Map of field_definitions.key -> true when that facet section should render collapsed by default. Omitted keys mean expanded.';
