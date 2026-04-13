-- Directory public sidebar: per-field visibility + global order (managed at /admin/directory/filters).
-- Replaces use of field_definitions.filterable for which facets appear in the directory sidebar.

ALTER TABLE public.field_definitions
  ADD COLUMN IF NOT EXISTS directory_filter_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS directory_filter_sort_order INT NOT NULL DEFAULT 0;
-- Backfill from legacy filterable flag
UPDATE public.field_definitions
SET
  directory_filter_visible = filterable,
  directory_filter_sort_order = CASE
    WHEN filterable THEN sort_order * 10
    ELSE 0
  END
WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS public.directory_sidebar_layout (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  CONSTRAINT directory_sidebar_layout_singleton CHECK (id = 1),
  item_order TEXT[] NOT NULL DEFAULT ARRAY['__filter_search__']::TEXT[],
  filter_option_search_visible BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.directory_sidebar_layout (id, item_order, filter_option_search_visible)
VALUES (1, ARRAY['__filter_search__']::TEXT[], TRUE)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.directory_sidebar_layout ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS directory_sidebar_layout_staff ON public.directory_sidebar_layout;
DROP POLICY IF EXISTS directory_sidebar_layout_select ON public.directory_sidebar_layout;
DROP POLICY IF EXISTS directory_sidebar_layout_update_staff ON public.directory_sidebar_layout;
DROP POLICY IF EXISTS directory_sidebar_layout_insert_staff ON public.directory_sidebar_layout;
CREATE POLICY directory_sidebar_layout_select ON public.directory_sidebar_layout
  FOR SELECT USING (true);
CREATE POLICY directory_sidebar_layout_update_staff ON public.directory_sidebar_layout
  FOR UPDATE
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
CREATE POLICY directory_sidebar_layout_insert_staff ON public.directory_sidebar_layout
  FOR INSERT
  WITH CHECK (public.is_agency_staff());
COMMENT ON COLUMN public.field_definitions.directory_filter_visible IS
  'When true, this field may contribute a facet block to the public directory sidebar (if value type supports it).';
COMMENT ON COLUMN public.field_definitions.directory_filter_sort_order IS
  'Legacy tie-breaker; primary order is directory_sidebar_layout.item_order.';
COMMENT ON TABLE public.directory_sidebar_layout IS
  'Singleton row: ordered keys for directory filter sidebar (__filter_search__ + field_definitions.key values).';
