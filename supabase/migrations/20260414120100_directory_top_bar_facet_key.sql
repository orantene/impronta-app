-- Public directory: configurable taxonomy facet for the horizontal pill row above results (replaces hard-coded talent type only).
ALTER TABLE public.directory_sidebar_layout
  ADD COLUMN IF NOT EXISTS top_bar_facet_key TEXT NULL;

COMMENT ON COLUMN public.directory_sidebar_layout.top_bar_facet_key IS
  'field_definitions.key for a taxonomy_single / taxonomy_multi facet. When set, ALL + term pills render above results and that facet is omitted from the sidebar. NULL = no top bar.';

-- Backfill from legacy boolean (column was NOT NULL default true).
UPDATE public.directory_sidebar_layout
SET top_bar_facet_key = CASE
  WHEN talent_type_top_bar_visible IS TRUE THEN 'talent_type'
  ELSE NULL
END
WHERE top_bar_facet_key IS NULL;
