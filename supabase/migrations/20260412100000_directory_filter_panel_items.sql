-- Public directory filter sidebar order + visibility for synthetic controls (search/sort chips, sort dropdown).
-- Field-backed filters still use field_definitions.filterable; this table stores sort_order for all rows and
-- visible for __directory_search__ / __directory_sort__ only.

BEGIN;
CREATE TABLE public.directory_filter_panel_items (
  item_key text PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX directory_filter_panel_items_sort_idx
  ON public.directory_filter_panel_items (sort_order);
ALTER TABLE public.directory_filter_panel_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY directory_filter_panel_items_anon_select
  ON public.directory_filter_panel_items
  FOR SELECT
  TO anon
  USING (true);
CREATE POLICY directory_filter_panel_items_auth_select
  ON public.directory_filter_panel_items
  FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY directory_filter_panel_items_staff_all
  ON public.directory_filter_panel_items
  FOR ALL
  TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
COMMIT;
