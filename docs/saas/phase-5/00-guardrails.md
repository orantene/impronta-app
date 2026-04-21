# Phase 5 — Agency Site Admin · Guardrails

**Status: SHIPPED (M0 → M6).** Approved 2026-04-20. All milestones closed;
this document is now the **maintenance contract** for the Agency Site Admin
surface — any later change to identity, branding, navigation, pages,
sections, homepage composition, or design tokens must comply with the
sections below and the §-indexed specializations.

Milestone ledger:
- **M0** — Foundations (capabilities, cache tags, concurrency, audit, reserved routes, preview, registries).
- **M1** — Identity + Branding basics (direct-commit, cached public reads).
- **M2** — Navigation (draft tree + SECURITY DEFINER publish RPC).
- **M3** — Pages (template-driven, system-ownership trigger, preview).
- **M4** — Sections (reusable, per-type validators, SECTION_IN_USE gate).
- **M5** — Homepage composition (slot-typed, snapshot-frozen publish).
- **M6** — Governed design tokens (draft/live split, registry-locked, storefront CSS-var + data-attr projection).

**Single source of truth.** Every Phase 5 code change must comply with this
document. The constitution (Principles) is binding. Deviations require an
explicit architectural-change PR against this file.

Related:
- Plan (architect-locked, execution-ready):
  `/Users/oranpersonal/.cursor/plans/agency_site_admin_phase_cccd654c.plan.md`
- Future roadmap (M7+): `./future-roadmap.md`
- M0 readiness checklist: `./m0-readiness-checklist.md`

---

## 1. Principles — binding

1. **Tenant safety is not negotiable.** Every read, write, and cache entry is
   keyed by `tenant_id`. No tenant-blind `SELECT`, no shared in-memory cache.
2. **Registries are the source of truth.** Templates, sections, tokens,
   capabilities, reserved routes, and starter kits live in TypeScript
   registries. No ad-hoc feature code.
3. **No parallel systems.** One CMS table family, one revision pattern, one
   capability model, one cache tagging scheme, one preview mechanism.
4. **Bare strings banned.** Capability checks, cache tags, audit actions, and
   error codes pass through typed enums / helper functions.
5. **Optimistic concurrency everywhere.** Every editable row carries `version`;
   writes compare-and-set; stale writes return `VERSION_CONFLICT`.
6. **Every mutation emits an audit event.** No silent writes.
7. **Every mutation that affects a published surface revalidates its tag(s).**
   No stale public reads.
8. **Draft and live never interleave.** Public reads return only `status =
   'published'` (or `is_draft = FALSE`); draft rows are isolated by column or
   junction flag.
9. **Preview is staff-only, signed, short-TTL, tenant-scoped.** No URL-
   shareable preview tokens.
10. **System-owned surfaces cannot be deleted by tenants.** Database triggers
    enforce this; do not rely on UI alone.
11. **Reserved routes enforced in 3 layers:** Zod registry → DB trigger →
    middleware log. Any one layer missing is a bug.
12. **Media has one lifecycle:** soft-delete first; hard-delete via nightly GC
    after 30 days with no live reference. Consumer columns are
    `ON DELETE RESTRICT`.
13. **Junction rows are typed.** `cms_page_sections` joins pages → section
    instances; `ON DELETE CASCADE` on page side, `ON DELETE RESTRICT` on
    section side.
14. **Schema versions are explicit.** Pages carry `template_schema_version`;
    sections carry `schema_version`; editors migrate on load using the
    registry's per-version map.
15. **Role separation preserved.** Platform super-admin (Zone 1) ≠ agency
    admin (tenant-scoped). Phase 5 does not introduce new platform roles.
16. **No new architecture in mid-phase.** New tables, capabilities, cache
    tags, or concurrency patterns require a change to this doc first.

---

## 2. Non-goals (Phase 5)

- Multi-homepage per locale (one row per tenant per locale).
- Per-page theme overrides (theme is tenant-wide).
- Inline section editing on the homepage composer (editing in M4; composing
  in M5).
- Visual drag-and-drop canvas.
- Arbitrary HTML/CSS/JS injection.
- Font file upload (presets only).
- Page tree / hierarchical navigation.
- Redirects UI (separate future milestone).
- Branching / named revision histories.

---

## 3. Ownership levels (every object class)

| Object                              | Zone | Owner             | Who edits                              |
|-------------------------------------|------|-------------------|----------------------------------------|
| `platform_reserved_slugs`           | 1    | Platform admin    | Platform admin                         |
| Template registry (code)            | 1    | Platform          | Platform (PR)                          |
| Section type registry (code)        | 1    | Platform          | Platform (PR)                          |
| Token registry (code)               | 1    | Platform          | Platform (PR)                          |
| Capability registry (code)          | 1    | Platform          | Platform (PR)                          |
| Starter kit manifests               | 1    | Platform          | Platform (PR)                          |
| `agency_business_identity`          | 2    | Tenant            | `agency.site_admin.identity.edit`      |
| `agency_branding`                   | 2    | Tenant            | `agency.site_admin.branding.edit`      |
| `cms_navigation_items`              | 2    | Tenant            | `agency.site_admin.navigation.edit`    |
| `cms_pages` (non-system)            | 2    | Tenant            | `agency.site_admin.pages.edit/publish` |
| `cms_pages` (system-owned)          | 2    | Tenant (fields)   | edit only; cannot delete / retarget    |
| `cms_sections`                      | 2    | Tenant            | `agency.site_admin.sections.edit`      |
| `cms_page_sections` (homepage row)  | 2    | Tenant            | `agency.site_admin.homepage.compose`   |
| `agency_branding.theme_json`        | 2    | Tenant (allowlist)| `agency.site_admin.design.edit`        |
| `media_assets` (purpose <> talent)  | 2    | Tenant            | `agency.site_admin.media.*`            |

**Platform may read everything.** Agency staff may read/write only their own
tenant. Editor/coordinator/admin/owner grants come from the Phase-5
capability registry.

---

## 4. Draft boundaries

- **`cms_pages`**: draft fields live on the same row. `status` values are
  `draft`, `published`, `archived`. A `cms_page_revisions` row captures each
  publish.
- **`cms_sections`**: `status` on the row. Editing from published → draft
  writes a new revision row; publishing promotes.
- **`cms_page_sections`**: `is_draft BOOLEAN`. Composition edits write
  `is_draft = TRUE` rows. Publish flips them to `is_draft = FALSE` in a
  single transaction + writes a snapshot into
  `cms_pages.published_homepage_snapshot`.
- **`agency_branding`**: single row; M6 design edits stage into `theme_json`
  draft fields. Publish promotes + writes `agency_branding_revisions`.
- **`agency_business_identity`**: immediate-live (no draft stage) — small
  surface, clear intent; version bump + revision row every save.

**Public reads never see draft rows.** RLS enforces this; do not bypass.

---

## 5. Rollback expectations

Every editable surface has a "restore revision" path. Rollback is a tenant
admin action that:

1. Reads the target revision's `snapshot`.
2. Writes a new row that matches the snapshot (not a direct-version swap).
3. Increments `version`.
4. Writes another revision row labeled `kind = 'rollback'` (homepage & page
   only for Phase 5; branding/identity rollbacks use `kind = 'published'`).

Retention (per tenant):
- 50 revisions per `cms_pages`
- 50 revisions per `cms_sections`
- 20 revisions per `agency_branding`
- 20 revisions per `agency_business_identity`
- None for `cms_navigation_items` (limitation; documented)

A nightly trim job enforces retention.

---

## 6. Reserved routes

See `web/src/lib/site-admin/reserved-routes.ts` (layer 1) and
`public.platform_reserved_slugs` (layer 2). Layer 3 is a middleware log
on any production request whose first path segment matches a reserved slug
on a tenant surface.

---

## 7. i18n rules

- Locale set is platform-level (`en`, `es` today). No tenant-declared locales
  in Phase 5.
- Each `cms_pages` row is locale-scoped (`locale` column).
- Homepage = one row per locale per tenant; enforced by the
  `cms_pages_system_lookup_idx` unique index.
- `agency_branding`, `agency_business_identity`: locale-agnostic (one row per
  tenant).
- Section instances (`cms_sections`): locale-agnostic by default; locale-
  specific variants wait for a future milestone.

### 7.1 Per-tenant locale allow-list (M1)

- `agency_business_identity.{default_locale, supported_locales}` holds the
  tenant's locale subset. Both columns are `NOT NULL`; `supported_locales` is
  non-empty and `default_locale` MUST be in the set (DB CHECK
  `agency_business_identity_default_in_supported`).
- `supported_locales` ⊆ `PLATFORM_LOCALES`. The allow-list lives in ONE FILE:
  `web/src/lib/site-admin/locales.ts`. Four dependents MUST stay aligned:
  1. DB CHECK `agency_business_identity_supported_locales_platform_allowed`
  2. `web/src/middleware.ts` locale canonicalization + redirect logic
  3. `web/src/lib/language-settings/*` public-locale exposure
  4. Any CMS Zod validator that accepts a locale code
  Adding a new locale is a 5-file PR — no exceptions.
- Middleware enforces tenant locale on agency hosts: if the URL carries a
  platform locale the tenant does NOT declare as supported, redirect (302)
  to the tenant's default locale URL BEFORE hitting CMS / auth / rate limits.
- Storefront reads use `resolveStorefrontLocale()` or `resolveTenantLocale()`;
  both return `{locale, isFallback}`. `isFallback: true` is TEMPORARY safety
  — missing-locale signals surface via the Site Health panel in M7+. Never
  500 on a missing locale; always render in the tenant's default.
- Locale settings cache is in-memory (not `unstable_cache`) because middleware
  runs on the edge. TTL is 60s. Identity saves call
  `invalidateTenantLocaleSettings(tenantId)` so the next request reads fresh.

### 7.2 Site defaults (M1)

- `agency_business_identity` carries per-tenant SEO fallbacks
  (`seo_default_title ≤ 120 chars`, `seo_default_description ≤ 320 chars`,
  `seo_default_share_image_media_asset_id` → `media_assets` with
  `ON DELETE SET NULL`) and a primary CTA pair
  (`primary_cta_label`, `primary_cta_href`).
- Primary CTA is paired: both columns set or both null. Enforced by DB CHECK
  `agency_business_identity_primary_cta_paired` AND the Zod
  `identityFormSchema.superRefine` pairing rule.

---

## 8. Media rules

- Everything goes through `public.media_assets` with `purpose` enum
  distinguishing `talent | branding | cms | starter_kit`.
- Non-talent rows set `tenant_id` and leave `owner_talent_profile_id` NULL.
- CHECK constraint: talent rows must have an owner; non-talent rows must
  have a tenant.
- Soft-delete only. Columns referencing `media_assets.id` use
  `ON DELETE RESTRICT`.
- Nightly `cron/media-gc` hard-deletes rows where
  `deleted_at < now() - interval '30 days'` AND no live reference exists.
  The GC scan is registry-aware: it walks `cms_sections.props_jsonb` for any
  key matching `mediaAssetId` and every known consumer column.
- Section-level media references are enforced live by the
  `cms_sections_props_media_ref_check` trigger.

---

## 9. Publication safety gates

Before a row moves to `status = 'published'` (pages, sections) or the
homepage composer commits:

1. Zod schema for the current `schema_version` / `template_schema_version`
   passes.
2. Template-declared required slots have rows in `cms_page_sections` (homepage
   only).
3. No referenced section is `archived`.
4. All referenced media assets exist (non-soft-deleted).
5. Reserved-slug check passes (for tenant-authored pages).
6. Capability check passes.
7. Optimistic concurrency passes.

If any gate fails, return `PUBLISH_NOT_READY` with a list of failed gates.

### 9.1 Navigation (M2)

- Navigation is split across three tables:
  - `cms_navigation_items` — draft working set per (tenant, zone, locale).
    `parent_id` self-FK builds hierarchy; `version` carries per-row CAS.
    Max depth 2 enforced by trigger
    `cms_navigation_items_enforce_depth` (DB) + Zod `navTreeSchema` (app).
  - `cms_navigation_menus` — atomic published snapshot per (tenant, zone,
    locale). `tree_json` holds the serialized tree; `version`,
    `published_at`, `published_by` make publish events queryable.
  - `cms_navigation_revisions` — append-only audit of every publish.
- **Draft edits never bust the `tenant:{id}:navigation` cache tag.** Only
  `publishNavigationMenu` calls `updateTag`. This preserves Principle 8
  (draft/live never interleave) — storefront only ever sees the most
  recently published snapshot.
- **Reserved-route discipline (3 layers, matching §6):**
  1. `navHrefSchema` (Zod) rejects any relative href whose first segment is
     a reserved slug (via `isReservedSlug`). Applies to both item upsert
     and tree snapshot.
  2. Page-reserved-slug DB trigger + `platform_reserved_slugs` covers page
     targets the nav might point to.
  3. Middleware log (§6 layer 3) catches any slip-through at request time.
- **Publication safety gates for navigation** (specialization of §9):
  1. Every node's `href` re-validates through `navHrefSchema` at publish.
  2. Tree depth ≤ `NAV_MAX_DEPTH` (2) after `buildTreeFromRows`.
  3. Total node count ≤ `NAV_MAX_ITEMS_PER_MENU` (100).
  4. No duplicate node ids across levels (`navTreeSchema` superRefine).
  5. Capability `agency.site_admin.navigation.publish` held by actor.
  6. Menu row CAS on `expectedMenuVersion` passes.
  On failure: error code `VALIDATION_FAILED` or `VERSION_CONFLICT` as
  appropriate — not `PUBLISH_NOT_READY` (nav publish is simpler; no
  template-slot / schema-version logic).
- **Capability split:**
  `agency.site_admin.navigation.edit` — editor, coordinator, admin, owner.
  `agency.site_admin.navigation.publish` — coordinator, admin, owner only.
  Viewer has neither.
- **Public RLS:** `cms_navigation_menus` public-SELECT requires
  `published_at IS NOT NULL` AND tenant scope via `current_tenant_id()`
  GUC. Draft items in `cms_navigation_items` are staff-only.
- **Reorder is non-transactional in M2.** `reorderNavItems` applies
  per-item CAS in a loop; first conflict short-circuits to
  `VERSION_CONFLICT` and the operator re-loads + retries. A future batched
  RPC can make it atomic.
- **Retention.** Nav revisions are uncapped in M2 (trim job deferred;
  noted alongside `cms_navigation_items` in §5). Storefront only reads the
  current snapshot row; revisions are forensic only.

### 9.2 Pages (M3)

- Pages live in a single table family:
  - `cms_pages` — one row per (tenant, locale, slug). Draft fields live
    on the row; `status ∈ {draft, published, archived}` controls lifecycle.
    `is_system_owned BOOLEAN` isolates platform-seeded rows (homepage);
    tenant mutations on system rows may touch editable columns only.
  - `cms_page_revisions` — append-only audit-and-rollback log.
    `kind ∈ {draft, published, rollback}`, with `version` and
    `template_schema_version` columns so every snapshot is self-describing.
- **Template scope.** `AGENCY_SELECTABLE_TEMPLATE_KEYS = ["standard_page"]`
  — the homepage template is reachable only through M5's Homepage composer.
  `pageUpsertSchema.templateKey` is an enum keyed off the agency-selectable
  list; attempts to create or retarget a page as `homepage` fail Zod before
  the DB is touched. The `/admin/site-settings/pages/[id]` route renders
  a locked read-only view when `is_system_owned = TRUE` so bookmarked
  homepage URLs don't drop operators onto a form that would reject every
  save.
- **System-page immutability** (specialization of Principle 10):
  `upsertPage` reads the `before` row and rejects mutations to `slug`,
  `locale`, or `template_key` with `SYSTEM_PAGE_IMMUTABLE` when
  `is_system_owned = TRUE`. `deletePage` + `archivePage` reject outright
  with the same code. The DB trigger `cms_pages_system_ownership_guard`
  is the authoritative enforcer (SQLSTATE `42501`, message prefix
  `SYSTEM_PAGE_IMMUTABLE:…`); the lib-layer check is defence-in-depth and
  keeps the error path typed.
- **Reserved-route enforcement (3 layers, matching §6):**
  1. `pageSlugSchema` (Zod) via `tenantSlugRefinement` rejects reserved
     first segments pre-DB.
  2. `cms_pages_reserved_slug_guard` DB trigger cross-checks
     `public.platform_reserved_slugs`; trigger message prefix
     `RESERVED_SLUG:…` maps to error code `RESERVED_SLUG`.
  3. Middleware log (§6 layer 3) catches slip-through at request time.
- **Draft vs published discipline** (specialization of Principle 8):
  - `upsertPage` writes draft fields and a `kind='draft'` revision row.
    **It does NOT call `updateTag`.** Public cache continues serving the
    last published copy.
  - `publishPage` enforces §9 gates (Zod parse on the current
    `template_schema_version`, og-image live check), flips `status →
    published`, stamps `published_at/published_by`, writes a
    `kind='published'` revision, then `updateTag(tagFor(..., 'pages', id))`
    AND `updateTag(tagFor(..., 'pages-all'))`.
  - `archivePage` flips `status → archived` and busts both tags.
  - `restorePageRevision` always lands `status = 'draft'`, writes a
    `kind='rollback'` revision, and **does NOT bust cache** — the
    previously-published copy keeps serving until an explicit republish.
- **Publication safety gates for pages** (specialization of §9):
  1. Template registry lookup for `template_key` succeeds.
  2. `schemasByVersion[template_schema_version]` parses the current
     row's editable payload (`title`, `body`, `metaTitle`,
     `metaDescription`).
  3. Referenced og-image media asset (if set) exists and is not soft-
     deleted.
  4. Capability `agency.site_admin.pages.publish` held by actor.
  5. Row CAS on `expectedVersion` passes.
  On failure: error code `PUBLISH_NOT_READY` with the failing gate name
  surfaced in the result payload.
- **Capability split:**
  `agency.site_admin.pages.edit` — editor, coordinator, admin, owner.
  `agency.site_admin.pages.publish` — coordinator, admin, owner only.
  Viewer has neither. Editor can draft and save but not go live,
  matching the M2 navigation split.
- **Preview discipline.** `startPagePreviewAction` requires
  `agency.site_admin.pages.edit`, mints a `signPreviewJwt({ subject:
  'page:<id>', tenantId, ttl: PREVIEW_JWT_TTL_SECONDS })` HS256 token,
  and sets it on the `impronta_preview` httpOnly cookie
  (`PREVIEW_COOKIE_OPTIONS`). Preview is subject-scoped — a token for
  `page:X` authorizes draft reads of page X only; mismatch falls back to
  the published surface.
- **Revision retention.** `cms_page_revisions_trim(tenant_id, page_id,
  keep=50)` is the SECURITY DEFINER trim helper, gated by
  `is_platform_admin()`. Nightly cron (Phase 5 ops) walks tenants ×
  pages and calls it. Per §5 retention table, 50/page is the cap.
- **Public read path.** `loadPublicPageBySlug` / `loadPublicPagesList`
  go through `cms_public_pages_for_tenant(tenantId)` RPC wrapped in
  `unstable_cache` tagged `tenant:{id}:pages-all`. The RPC filters
  `status = 'published'` and `locale` server-side; client code adds
  `.eq('slug', slug).maybeSingle()`. No storefront code path selects
  `cms_pages` directly.
- **Admin list ordering contract.** `listPagesForStaff` sorts
  `updated_at DESC` — one canonical sort. Any admin dashboard, tile, or
  picker rendering tenant pages for staff should match; do not add a
  secondary sort unless the UI explicitly requires it.
- **Future optimization (not for M3).** Filtering the current `pages-all`
  RPC by slug in application code is fine at tenant-realistic page counts
  (dozens to low hundreds). If a tenant ever exceeds ~500 live pages,
  introduce `cms_public_page_by_slug_for_tenant(tenant, locale, slug)` as
  a SECURITY INVOKER RPC returning a single row, and switch
  `loadPublicPageBySlug` to call it directly. Until then the existing
  list-and-filter path keeps the surface minimal and reuses the same
  cache tag. **Do not implement preemptively** — ship only when a tenant
  crosses the threshold.

### 9.3 Sections (M4)

- Sections are the *reusable content block* surface. They live in:
  - `cms_sections` — one row per (tenant, name). `section_type_key` picks
    the registry entry; `schema_version` records the registry version
    the payload was authored against; `props_jsonb` holds the Zod-
    validated payload; `status ∈ {draft, published, archived}`;
    `version` is the CAS integer. The registry — not the DB — is the
    authoritative validator of `props_jsonb`; the DB carries only the
    shape-agnostic `cms_sections_props_media_ref_check` trigger.
  - `cms_section_revisions` — append-only snapshots.
    `kind ∈ {draft, published, rollback}`, each row self-describing
    via `version` + `schema_version` so a restore years later still
    validates against the registry entry that wrote it.
- **Reusable vs inline.** M4 is reusable-only. Sections are addressable
  entities edited in isolation; composition of sections onto a page lives
  in M5 (`cms_page_sections`). A section row never carries a page FK.
  This keeps the lifecycle clean: sections publish on their own cadence,
  and a single published section can appear on many pages.
- **Registry-governed props discipline** (the critical M4 gate):
  - `sectionUpsertSchema.props` is `z.record(z.string(), z.unknown())`
    at the outer layer. The `superRefine` hands off to
    `validateSectionProps(typeKey, schemaVersion, props)` which looks
    up `SECTION_REGISTRY[typeKey].schemasByVersion[schemaVersion]` and
    Zod-parses the payload. Failure surfaces one of three discriminants
    on `issue.params.code`: `UNKNOWN_SECTION_TYPE`,
    `UNKNOWN_SCHEMA_VERSION`, or `PROPS_INVALID`.
  - Server ops (`upsertSection`, `publishSection`) re-run
    `validateSectionProps` belt-and-braces — the form layer can never
    be the sole validator.
  - `props_jsonb` is **never** accepted as untyped JSON at any layer.
    Rows that somehow reached the DB with a mismatched shape would
    fail the next publish's re-validation; draft rendering in the
    editor also runs through the registry.
- **Schema versioning** (specialization of §11):
  - Every row persists `schema_version` alongside `props_jsonb`. The
    registry entry carries `currentVersion` and `schemasByVersion :
    Record<number, ZodType>` plus a migration map. If the platform
    bumps `currentVersion` between edits, the admin editor surfaces a
    "platform v{N} available" chip; saving migrates the payload
    forward; **publishing re-validates against `currentVersion`** and
    stamps `schema_version = currentVersion` onto the row. Archived
    payloads may keep older schema versions — migration happens on
    next edit or publish, not retroactively.
- **Section type lock.** `section_type_key` is **immutable after
  create**. `upsertSection` rejects any change; to switch types, create
  a new section. The form UI locks the field and explains the rule.
  This mirrors the template-key lock on pages.
- **Type-key enum is registry-derived.** `ALL_SECTION_TYPE_KEYS` is
  computed from `SECTION_REGISTRY` at module load; adding a type
  anywhere else in the codebase is a bug. M4 ships `hero` only; M5+
  fans out to the full set.
- **Draft vs published discipline** (specialization of Principle 8):
  - `upsertSection` writes `props_jsonb` + `name` to the row at
    `status = 'draft'`, inserts a `kind='draft'` revision, and **does
    NOT call `updateTag`**. Public surfaces continue serving the
    previously published payload (via the composer in M5).
  - `publishSection` enforces §9 gates (see below), flips `status →
    published`, stamps `published_at/published_by`, writes a
    `kind='published'` revision, then busts tags.
  - `archiveSection` flips `status → archived` and busts tags.
    No system-owned guard — sections are never platform-seeded.
  - `restoreSectionRevision` always lands `status = 'draft'`, writes
    a `kind='rollback'` revision, and **does NOT bust cache** — the
    previously-published snapshot keeps serving until an explicit
    republish. Same semantics as pages.
- **Publication safety gates for sections** (specialization of §9):
  1. Registry entry for `section_type_key` exists.
  2. `schemasByVersion[entry.currentVersion]` parses the current
     row's `props_jsonb`. Note this targets `currentVersion`, not the
     stored `schema_version` — a platform schema bump enforces a
     re-author on the next publish.
  3. Media references in the payload resolve (DB trigger is the
     authoritative check; app pre-check avoids a DB round-trip on the
     hot path).
  4. Capability `agency.site_admin.sections.publish` held by actor.
  5. Row CAS on `expectedVersion` passes.
  On failure: error code `PUBLISH_NOT_READY` for gate 2, `FORBIDDEN`
  for gate 4, `VERSION_CONFLICT` for gate 5, `MEDIA_REF_BROKEN` for
  gate 3. All mirror the Phase 5 error code set.
- **Delete discipline — RESTRICT-FK as the in-use guard.** Sections
  are referenced from `cms_page_sections.section_id` via `ON DELETE
  RESTRICT`. `deleteSection` does NOT pre-count page uses; it issues
  the DELETE and lets the DB surface the FK violation. Postgrest
  SQLSTATE `23503` maps to error code `SECTION_IN_USE` — operators
  see *"Remove it from those pages before deleting (or archive
  instead)"* in the UI. Archive is the reversible default and is
  explicitly surfaced in the delete confirm copy.
- **Name uniqueness.** DB index `cms_sections_tenant_name_key` enforces
  `(tenant_id, name)` uniqueness. SQLSTATE `23505` maps to
  `VALIDATION_FAILED` with a field-level error pointing at `name`.
  Section names never become public URLs (those live on pages), so no
  reserved-name layer is required.
- **Cache tagging.** `cache-tags.ts` exposes the `sections-all` surface
  (mirror of `pages-all`). `bustSectionTags(tenantId, sectionId)` calls
  `updateTag(tagFor(..., 'sections', id))` AND
  `updateTag(tagFor(..., 'sections-all'))` — the id-scoped tag
  invalidates a single section's detail views (future composer reads);
  the all-scoped tag invalidates tenant-wide listings. Only
  `publishSection`, `archiveSection`, and `deleteSection` bust.
  `upsertSection` and `restoreSectionRevision` never bust.
- **Capability split:**
  `agency.site_admin.sections.edit` — editor, coordinator, admin, owner.
  `agency.site_admin.sections.publish` — coordinator, admin, owner only.
  Viewer has neither. Same ladder as navigation + pages, by design.
- **Revision retention.** `cms_section_revisions_trim(tenant_id,
  section_id, keep=50)` is the SECURITY DEFINER trim helper, gated by
  `is_platform_admin()`. Supporting index
  `idx_cms_section_revisions_tenant_section_created` on `(tenant_id,
  section_id, created_at DESC)` keeps the trim cheap. Nightly cron
  (Phase 5 ops) walks tenants × sections and calls it. Per §5 retention
  table, 50/section is the cap.
- **Admin list ordering contract.** `listSectionsForStaff` sorts
  `updated_at DESC` — one canonical sort, matching pages. Any admin
  tile, picker, or future composer surface rendering tenant sections
  for staff should match; do not add a secondary sort unless the UI
  explicitly requires it.
- **Public read path is deferred to M5.** Sections are not
  independently routable; the storefront reaches them only through the
  homepage composer's joined read. No public RPC ships in M4. When M5
  lands, that RPC will filter `status = 'published'` server-side and
  project only the fields the storefront renderer needs.
- **Usage visibility (M4.7 carry-forward).**
  `loadSectionUsageForStaff` (single section) + `loadSectionUsageMapForStaff`
  (tenant-wide) join `cms_page_sections` to `cms_pages` and return a
  typed `SectionUsage` record: `{ usedByHomepage, pageRefs[], totalReferences }`.
  Draft AND live composition rows are both returned — the RESTRICT FK does
  not care about `is_draft`, so neither does the UI. Homepage is detected
  via `cms_pages.is_system_owned = TRUE AND system_template_key = 'homepage'`;
  this is the platform contract, not the slug. The list view renders a
  "Used by" column ("Not in use" / "Homepage" / "Homepage + N pages" /
  "N pages") with a tooltip listing up to 4 referencing pages. The editor
  page renders an "In use" block at the top enumerating distinct pages
  with draft/live markers, and the delete button text flips to
  "Delete section (blocked — in use)" with a sharpened confirm dialog
  when any reference exists. The DB remains the authoritative gate (the
  UI never skips the DELETE attempt); these reads are operator clarity,
  not enforcement. The usage queries are uncached — staff views only,
  always fresh.
- **Duplicate action (M4.7 carry-forward).** `duplicateSection` clones a
  source row to a fresh draft with a new UUID and an operator-supplied
  name. Inherited verbatim: `section_type_key`, `schema_version`,
  `props_jsonb`. Forced: `status='draft'`, `version=1`. Name uniqueness
  is enforced by the existing `cms_sections_tenant_name_key` DB index;
  23505 → `VALIDATION_FAILED` with a field-level error. Props are
  re-validated against the registry at the source's stored schema
  version (belt + braces — catches a retired schema). Audit action key
  is `agency.site_admin.sections.edit` (same as upsert; diff summary
  says "duplicated from <source>"). An initial `kind='draft'` revision
  is written. Does NOT bust cache — a brand-new draft has no public
  effect. The Action redirects to the new draft's editor on success,
  matching the agency workflow of "duplicate → immediately refine."
  Default name fallback (`"<source.name> (copy)"`) is resolved
  server-side so the client doesn't carry the source row.

### 9.4 Homepage (M5)

The homepage composer is the only path that mutates a SYSTEM-OWNED
`cms_pages` row. Every rule below is enforced in `server/homepage.ts`; the
client composer only surfaces pre-flight hints — never bypasses a gate.

- **Ownership is seeded, not created.** `ensureHomepageRow` inserts with
  `is_system_owned = TRUE`, `system_template_key = 'homepage'`, `slug = ''`,
  and `template_key = 'homepage'`. The DB trigger
  `cms_pages_system_ownership_guard` blocks DELETE on the row and blocks
  mutations of `slug / locale / template_key / is_system_owned /
  system_template_key`. We never attempt those mutations; if the trigger
  raises, we surface `SYSTEM_PAGE_IMMUTABLE`. Operators cannot "delete the
  homepage" — at worst they can leave required slots empty, which only
  blocks publish.
- **Capability split.** Save draft + restore-revision require
  `agency.site_admin.homepage.compose` (editor role and above). Publish
  requires `agency.site_admin.homepage.publish` (coordinator and above —
  same ladder as pages / sections).
- **Draft/live isolation — the M4 carry-forward rule.** `cms_page_sections`
  rows are split on `is_draft`. Save draft only writes `is_draft = TRUE`
  rows; publish only writes `is_draft = FALSE` rows. A draft edit of a
  referenced section (even a section publish) has ZERO effect on the live
  homepage. The live homepage remains frozen until the operator re-runs
  `publishHomepage`, which is when the section's current published props
  get baked back into the snapshot.
- **Snapshot-authoritative public reads.** `loadPublicHomepage` reads
  `cms_pages.published_homepage_snapshot` — never the junction rows. The
  snapshot is a versioned JSONB envelope (`v:1`) carrying each slot entry's
  `{ sectionId, sectionTypeKey, schemaVersion, name, props }` frozen at
  publish time. The junction rows stay in sync for audit / fallback only.
- **Publish gates (all-or-nothing).** Before snapshot + `status='published'`
  write: (a) CAS on `cms_pages.version`; (b) template-schema parse of the
  metadata at the template's current version — migrations run if the stored
  `template_schema_version` is older; (c) every required slot (currently
  just `hero`) has at least one entry; (d) every referenced section has
  `status = 'published'`; (e) `allowedSectionTypes` per slot matches the
  referenced section's `section_type_key`; (f) og-image media, if set, is
  live (not archived / deleted). Gate failure surfaces `PUBLISH_NOT_READY`
  with a human-readable `message`; no partial write.
- **Slot-type discipline.** Slots are a closed set declared by
  `homepageMeta.slots`. The form's `homepageSlotKeySchema` is built from
  that tuple at module load, so an unknown slot key in a payload fails Zod
  before reaching the server op. `allowedSectionTypes` is re-enforced
  server-side (Zod only sees section ids).
- **Rollback never publishes.** `restoreHomepageRevision` loads a
  `cms_page_revisions` row, filters out archived / missing sections (logs
  dropped), bumps version, replaces the `is_draft = TRUE` rows, and writes
  `kind = 'rollback'`. No cache bust; the storefront keeps serving the
  previous snapshot until the operator publishes. Same discipline as pages
  (M3) and sections (M4).
- **Revision history.** Every compose / publish / restore writes one
  `cms_page_revisions` row keyed to the homepage page_id. `kind` is
  `draft | published | rollback`. History is capped at 50 rows in the
  composer UI (the table itself is unbounded; retention policy is a Phase 7
  item).
- **Cache discipline.** Public read tags are `homepage:{locale}` +
  `pages-all` + `pages:{pageId}`. Publish busts all three. Save draft and
  restore do NOT bust (no public effect). `loadPublicHomepage` gates on
  `status = 'published'` — a homepage that has never been published
  returns `null`, and the storefront falls through to the template-driven
  landing (no "empty homepage" risk for first-run tenants).
- **Storefront render.** The public renderer (`HomepageCmsSections`)
  dispatches each snapshot slot entry through `SECTION_REGISTRY`. Unknown
  section types and migration failures render nothing + log in dev. Props
  are always migrated to the registry's current version via
  `migrateSectionPayload` before render, so a schema-version bump on a
  section type doesn't force re-publish of every homepage.
- **Usage visibility carry-forward (from M4 approval).** A homepage
  reference is the single "used by homepage" row in `SectionUsage` — the
  composer's delete/archive path on a section surfaces `SECTION_IN_USE`
  when the section is wired into either `is_draft=TRUE` or `is_draft=FALSE`
  homepage junction rows. Operators must swap the reference in the
  composer first. No way to silently break a live homepage by deleting its
  hero.
- **Metadata propagation.** `generateMetadata` on the storefront root
  prefers snapshot `title / metaTitle / metaDescription / ogTitle /
  ogDescription / ogImageUrl / noindex / canonicalUrl` when available,
  falling back to the locale-driven defaults. Hreflang alternates always
  come from the locale layer — the CMS canonical overlays but never
  deletes the hreflang set.

### 9.5 Design tokens (M6)

- **Storage-layout.** Design governs `agency_branding.theme_json` (LIVE)
  and `theme_json_draft` (DRAFT) on the existing M1 branding row. No new
  table. `theme_published_at` stamps the last successful publish.
  `agency_branding_revisions.kind` (`draft` | `published` | `rollback`)
  separates the design lifecycle from M1's direct-commit branding edits,
  while keeping one revision log per tenant.
- **Isolation from M1 branding basics.** The design pipeline never
  touches `primary_color`, `secondary_color`, `accent_color`,
  `neutral_color`, `logo_*_media_asset_id`, `favicon_media_asset_id`,
  `og_image_media_asset_id`, `font_preset`, `heading_font`, `body_font`.
  Those remain on the direct-commit `saveBranding` path. Design tokens
  layer on top via `theme_json`. Operators never hand-write CSS.
- **Registry-locked.** Every accepted token MUST appear in
  `web/src/lib/site-admin/tokens/registry.ts` with `agencyConfigurable:
  true` and a validator. Patches that include unknown keys, platform-only
  keys, or validator-failing values are rejected with
  `TOKEN_NOT_OVERRIDABLE`. Partial acceptance is banned: one bad key
  rejects the whole patch. The same `validateThemePatch` gate runs at
  form parse time, server save time, server publish time, AND restore
  time (defensive filter for retired keys).
- **Capability split.** `agency.site_admin.design.edit` governs draft
  saves + restores; `agency.site_admin.design.publish` governs the live
  promotion. Both are admin+ in the default matrix — coordinator and
  editor do NOT get design rights. Tests assert the matrix so a drift
  can't land silently.
- **Draft/live isolation.** `saveDesignDraft` writes only
  `theme_json_draft` and does NOT bust caches (draft has no public
  effect). `publishDesign` copies draft → live, stamps
  `theme_published_at`, writes a `kind='published'` revision, and busts
  BOTH `branding` and `storefront` tags. `restoreDesignRevision` lands
  snapshot → draft (`kind='rollback'`) and also does NOT bust.
- **Shared CAS target.** Design writes share `agency_branding.version`
  with M1 `saveBranding`. A branding edit between a design operator's
  save and publish surfaces as `VERSION_CONFLICT` at publish time and
  forces a re-read. This is intentional: one row, one version, one
  truth.
- **Publish gates.** `publishDesign` re-validates the current
  `theme_json_draft` against the CURRENT registry at publish time. A
  token retired or demoted to platform-only between draft save and
  publish blocks the publish (`PUBLISH_NOT_READY`) rather than leaking
  into the live row.
- **Storefront projection.** `resolveDesignTokens(branding)` merges
  registry defaults with the LIVE `theme_json` (never draft). The root
  layout spreads `designTokensToCssVars(...)` into `<html style>` for
  color tokens (namespaced `--token-color-*`) and
  `designTokensToDataAttrs(...)` for enum tokens (namespaced
  `data-token-*`). This preserves the existing shadcn `--primary` /
  `--background` variables — the governed tokens live in their own
  namespace so a later stylesheet migration can opt routes in without
  stomping either path.
- **Projection audit.** `listProjectedTokens()` must cover every
  `agencyConfigurable: true` token. Tests assert this so adding a new
  registry entry without wiring a CSS-var or data-attr mapping fails the
  suite (a new token with no projection is a silent no-op at render
  time).
- **Rollback never publishes.** `restoreDesignRevision` always lands as
  `kind='rollback'` into the draft. Publish is a separate click. Same
  rule as pages / sections / homepage.
- **Cache discipline.** Only `publishDesign` calls `updateTag(branding)`
  + `updateTag(storefront)`. Drafts and rollbacks bust nothing. The
  public read path (`loadPublicBranding` via `unstable_cache` +
  `tags: [tagFor(tenantId, 'branding')]`) picks up published tokens on
  the next storefront request without manual cache clears.

---

## 10. Cache keys + invalidation topology

Three layers:

1. **Next.js data cache.** `fetch({ next: { tags: [tagFor(...)] } })` on every
   tenant-scoped read. `revalidateTag(tagFor(...))` on every matching write.
2. **In-process host-context cache.** Cleared tenant-wide via `bustTenant()`
   (future integration point); must be called on every publish path.
3. **CDN edge cache.** Tied to route revalidation; invalidated by the Next.js
   layer automatically on `revalidateTag`.

Tag scheme: `tenant:{tenantId}:{surface}[:{id|locale}]`. The canonical
generator is `tagFor()` in `web/src/lib/site-admin/cache-tags.ts`. Bare
string tags are banned (ESLint rule).

---

## 11. Registry lifecycle

- Entries ship in the registry with a version (`currentVersion = 1` on
  introduction).
- Breaking changes to a registry entry bump its version AND ship a
  migration function from N → N+1.
- Deprecated entries keep their version and stop being listed in
  agency-facing pickers (`visibleToAgency = false`). Persisted instances
  continue to render.
- Removal requires a migration that rewrites persisted rows and zeroing
  confirmation across tenants.

---

## 12. Entitlement hooks

`agency_entitlements` (existing table; Phase 1) may restrict per-plan access:
- `agency.site_admin.design.publish` — gated by plan flag (future).
- Specific tokens — some platform-governed tokens may be disabled per plan
  via a follow-up entitlements column (reserved contract).

Phase 5 respects entitlements at the capability-check layer. No new
entitlement columns ship in M0.

---

## 13. Support / audit specifics

All Phase 5 mutations emit via the `record_phase5_audit(...)` SECURITY
DEFINER RPC, which writes to `public.platform_audit_log`:

- `action` starts with `agency.site_admin.` (RPC enforces).
- `target_type`, `target_id` identify the affected row.
- `metadata.diff_summary` (≤240 chars), `metadata.before_hash`,
  `metadata.after_hash`, `metadata.correlation_id` enable diff forensics
  without leaking full payloads.

Support mode (`support_mode` on the log) remains Zone 1 (platform admin
only).

---

## 14. Deferred roles

Phase 5 does NOT introduce new roles. The existing role → capability
mapping is extended; no new enum values on `agency_memberships.role`. A
future "content_editor" role is a separate milestone.

---

## 15. Starter kit registry contract

See `web/src/lib/site-admin/starter-kits/contract.ts`. Key rules:

- A starter kit is NOT a template. Templates describe page shape; kits
  materialize tenant-owned *copies*.
- No silent overwrite. The importer surfaces each collision (same slug,
  locale, section name) for confirmation unless the manifest's
  `overwriteBehavior` is `skip_existing`.
- Target modes: `empty_site` (reject if tenant has content), `additive`
  (merge), `reset` (wipe + seed after explicit confirmation).
- Every imported row gets `tenant_id` = target tenant and a fresh `id`.
  Kits ship with template/section-type keys from the platform registry.

M7 wires the importer; M0 ships the contract + Zod validator only.

---

## 16. Sources consumed by Phase 5 code

- `web/src/lib/site-admin/` — all registries, helpers, preview.
- `web/src/lib/saas/tenant.ts` — membership + tenant resolution.
- `web/src/lib/saas/capabilities.ts` — legacy capability system; bridged.
- `public.record_phase5_audit(...)` — audit RPC.
- `public.cms_pages_system_ownership_guard` — system-page trigger.
- `public.cms_pages_reserved_slug_guard` — reserved-route DB layer.
- `public.cms_sections_props_media_ref_check` — media referential trigger.
- `public.cms_section_revisions_trim(tenant_id, section_id, keep)` — M4 retention trim (SECURITY DEFINER; platform-admin gated).
