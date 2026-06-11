-- GAP B — per-component-type default-style cascade storage.
--
-- The page builder gains a real design-token cascade: per-element override →
-- per-component-type default → global theme token. The middle layer (the
-- per-component-type defaults) is stored per-tenant, alongside the existing
-- theme tokens on agency_branding, sharing the same `version` CAS and the same
-- draft → publish lifecycle as `theme_json` / `theme_json_draft`:
--
--   component_styles_json        — LIVE (published) component-type defaults.
--   component_styles_json_draft  — draft working copy (no storefront effect
--                                  until Publish copies draft → live).
--
-- Shape (validated in app code against the builder-node style schema + the
-- closed BuilderNodeKind set):
--   { "<nodeKind>": { "<styleProp>": "<raw value | token:<key>>", ... }, ... }
--   e.g. { "heading": { "textColor": "token:color.ink" },
--          "button":  { "backgroundColor": "token:color.primary",
--                       "borderRadius": "token:radius.base" } }
--
-- Default '{}'::jsonb so every existing tenant is a no-op on deploy — an empty
-- map means "no component defaults", and the renderer cascade is purely
-- additive (a node with no override and no component default renders exactly as
-- before, falling through to the global token / CSS as today).

ALTER TABLE public.agency_branding
  ADD COLUMN IF NOT EXISTS component_styles_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS component_styles_json_draft jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.agency_branding.component_styles_json IS
  'LIVE per-component-type default styles (cascade middle layer). Map of BuilderNodeKind → partial builder-node style. Published copy; mirrors theme_json.';
COMMENT ON COLUMN public.agency_branding.component_styles_json_draft IS
  'Draft per-component-type default styles. Mirrors theme_json_draft; copied → component_styles_json on Publish.';
