# Builder Studio — Wave 0 interface contracts

The Wave 0 (Foundation) PR installs the shared seams the parallel workstreams
(WS-A Shell, WS-B Catalog Studio, WS-C Governance, WS-D Release) build on. Do
not re-introduce a local copy of any of these; consume the seam.

## DB (applied to remote; migrations `20261027000000`, `20261027000001`)

- `builder_catalog_overlay` (+cols): `default_props jsonb`, `locked_props text[]`,
  `default_variant text`, `data_source_defaults jsonb`. — WS-C writes via
  `setComponentOverlay`.
- `builder_templates` (+cols): `default_props`, `locked_props`,
  `data_source_defaults`, `rollout_percentage int (0-100)`, `tenant_allowlist
  uuid[]`, `tenant_denylist uuid[]`, `changelog text`. — WS-C/WS-D.
- `builder_catalog_structure` (new table, RLS = authenticated read + super_admin
  write via `is_super_admin()`): `ref` (`tab:`/`cat:`/`item:`), `kind`,
  `label_override`, `icon_override`, `parent_tab`, `sort_order`, `created`,
  `hidden`, `category_override`. — WS-B writes via a new
  `catalog-structure-actions.ts`; sync via `bumpCatalogVersion`.

## Per-prop locking (WS-C consumes; WS-A may set on shell nodes)

- `BuilderNodeBase.lockedProps?: string[]` (dot-paths, e.g. `"tone"`,
  `"style.textColor"`). Round-trips via the `BASE_NODE_FIELD_CARRIERS` carrier
  in `builder-node/validate.ts` exactly like `locked`.
- `builder-node/prop-lock.ts` (pure, client-safe):
  - `isPropLocked(node, key)` — for the inspector UI (disable/lock a field).
  - `stripLockedKeysFromPatch(patch, currentProps, lockedProps)` — already wired
    into `patchBuilderNodeProps` (operations.ts) as the **server-trusted
    chokepoint**. Every mutation flows through it; a disabled input cannot be
    bypassed. WS-C must NOT add a second enforcement path — extend this one.

## Catalog item / descriptor plumbing (already carried; consume, don't re-plumb)

- `AddGalleryItem` (+fields): `defaultProps?`, `lockedProps?`,
  `dataSourceDefaults?`. Carried from the overlay row in `applyCatalogOverlay`
  and from the template row in `builderTemplateRowToGalleryItem`
  (registry-db-merge.ts). WS-C reads `item.lockedProps`/`item.defaultProps`/
  `item.dataSourceDefaults` at `resolveAddGalleryInsertAction` (insert.ts).
- `GallerySurfaceDescriptor.tenantId: string | null` + `GalleryMergeContext.tenantId?`
  — threaded edit-context.tsx → `fetchSurfaceGalleryItems` → `listGalleryItems`.
  WS-D reads `ctx.tenantId` in `gateDbGalleryItems` for staged-rollout bucketing
  (null ⇒ show all; never hide from platform/lab authors).
- `CatalogOverlayRow` / `BuilderTemplateRow` types carry the new columns.

## Catalog structure resolver (WS-B consumes)

- `add-gallery/catalog-structure.ts` — THE single source for the tab list:
  `CODE_TAB_DEFS` (replaced both `TAB_DEFS` in add-gallery-panel.tsx and
  `TAB_LABEL`/`ALL_TABS` in component-catalog.tsx), `resolveTabs(structure)`,
  `resolveCategoriesForTab(tab, structure)`, `applyStructureToItems(items,
  structure)`. All pure; **empty structure ⇒ code defaults verbatim** (parity).
  WS-B: add `listCatalogStructure()`, thread it into `listGalleryItems` +
  `loadCatalogAdminView`, fold `resolveCategoriesForTab` into
  `listGalleryCategoriesForTabFrom`, run `applyStructureToItems` beside
  `applyCatalogOverlay`. Do NOT widen `AddGalleryTab` for new tabs in the first
  pass (rename/reorder/hide the 5 built-ins + categories + item moves only).

## Shared-file ownership (coordinate merges with the Lead)

- `insert.ts` — PRIMARY: WS-C (default_props/variant/data-defaults at insert).
  WS-A adds new node KINDS via registry/create/render, not insert logic.
- `registry-db-merge.ts` — WS-B (structure pass) + WS-D (rollout gate); add
  separate pure functions in distinct hunks.
- `config.ts` / `builder-node/types.ts` / `data-bindings.ts` — WS-A.

## Migration timestamp bands (forward-dated; remote convention)

Wave 0 used `20261027000000`/`20261027000001`. Reserved bands (apply via Supabase
MCP `execute_sql` + a matching `supabase_migrations.schema_migrations` row;
filename timestamp prefix MUST be recorded or `deploy:smoke` drift-check fails):
WS-A `2026102800xxxx`, WS-B `2026102801xxxx`, WS-C `2026102802xxxx`,
WS-D `2026102803xxxx`.
