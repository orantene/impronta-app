-- Stores per-field sidebar visibility as a layout override, separate from
-- field_definitions.directory_filter_visible (which controls whether a field
-- participates in filtering at all). This lets admins hide a filter from the
-- public directory without removing it from the admin Filters page.
ALTER TABLE directory_sidebar_layout
  ADD COLUMN IF NOT EXISTS field_visibility_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
