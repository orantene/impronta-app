# Engine Cache Invalidation Audit — 2026-05-19

**Scope:** `web/src/lib/**` — every `unstable_cache` call and every server
action that writes to a cached table. Cross-checked against
`revalidateTag` busters.

**Branch:** `engine-cache-audit` (doc-only off `phase-1` tip @ `2280204c9`).

---

## TL;DR

- **18 `unstable_cache` call-sites** found in `web/src/lib/**`.
- **The field-catalog cache** (`getCachedTenantFieldCatalog`) is the only
  one whose 6 source tables include tenant-mutable overrides. Both of its
  writer files (`admin-workspace-field-settings.ts`) **bust both tags
  correctly**.
- **The taxonomy mutators** (`setTaxonomyEnabled`, `setTaxonomyFlags`,
  `addCustomSubType`, `removeCustomSubType`) write to
  `agency_taxonomy_settings` / `agency_taxonomy_terms`, which are **not**
  in any cache's source table set. They only `revalidatePath`. That is
  technically correct for the field-catalog cache, but creates a
  separate, lower-priority gap for the **directory filter caches**
  (`CACHE_TAG_TAXONOMY` / `CACHE_TAG_DIRECTORY`) — those caches read the
  GLOBAL `taxonomy_terms` table and do not honor the per-tenant overlay,
  so they would not surface the change anyway. Flagging as a latent
  data-model gap, not a cache-busting gap.
- **No platform-level (super-admin) writers** to
  `profile_field_definitions`, `profile_field_groups`,
  `parent_category_field_groups`, or `profile_field_recommendations`
  exist in the codebase. Those tables are read-only at runtime, written
  only by migrations / seed scripts — so they cannot create runtime
  staleness inside the field-catalog cache window.

**Top-3 fixes:** none HIGH severity. All cache busts that protect against
user-visible "I saved but I still see the old value" staleness are wired.
The three LOW items below are stylistic / defense-in-depth.

---

## 1. Inventory of `unstable_cache` calls in `web/src/lib/**`

| # | File:line | Key parts | Tags | `revalidate` |
|---|---|---|---|---|
| 1 | [admin-taxonomy.ts:189](web/src/lib/server-actions/admin-taxonomy.ts:189) (`getCachedTenantFieldCatalog`) | `["tenant-field-catalog", "v1", tenantId]` | `field-catalog`, `field-catalog:${tenantId}` | `120` |
| 2 | [directory/directory-card-display-catalog.ts:85](web/src/lib/directory/directory-card-display-catalog.ts:85) | `["directory-card-display-catalog-v3"]` | `directory` (`CACHE_TAG_DIRECTORY`) | `120` |
| 3 | [directory/field-driven-filters.ts:1219](web/src/lib/directory/field-driven-filters.ts:1219) | `["directory-filter-sidebar", "v14-tenant-scoped", locale, tenantKey, key]` | `directory`, `taxonomy` | `90` |
| 4 | [directory/cache.ts:58](web/src/lib/directory/cache.ts:58) (`getCachedDirectoryFirstPage`) | `["directory-first", tenantKey, key, limit, locale, query, locationSlug, sort, hMin, hMax, aMin, aMax, ffKey]` | `directory` | `120` |
| 5 | [directory/directory-filter-catalog.ts:97](web/src/lib/directory/directory-filter-catalog.ts:97) | `["directory-height-filter-catalog-v2"]` | `directory` | `120` |
| 6 | [directory/taxonomy-filters.ts:64](web/src/lib/directory/taxonomy-filters.ts:64) | `["taxonomy-filter-options", locale]` | `taxonomy` | `3600` |
| 7 | [site-admin/server/reads.ts:93](web/src/lib/site-admin/server/reads.ts:93) (`loadPublicIdentity`) | `["site-admin:identity:public", tenantId]` | `tagFor(tenantId,"identity")` | none (tag-only) |
| 8 | [site-admin/server/reads.ts:128](web/src/lib/site-admin/server/reads.ts:128) (`loadPublicBranding`) | `["site-admin:branding:public", tenantId]` | `tagFor(tenantId,"branding")` | none (tag-only) |
| 9 | [site-admin/server/shell-brand-tagline.ts:34](web/src/lib/site-admin/server/shell-brand-tagline.ts:34) | `["site-admin:shell-brand-tagline", tenantId]` | `tagFor(tenantId,"identity")`, `tagFor(tenantId,"storefront")` | `SHELL_TAGLINE_TTL_SECONDS` |
| 10 | [site-admin/server/sections-reads.ts:121](web/src/lib/site-admin/server/sections-reads.ts:121) (`loadSectionByIdForStaffCached`) | `["site-admin:section-draft", tenantId, sectionId]` | `tagFor(tenantId,"sections",{id:sectionId})` | `SECTION_DRAFT_REVALIDATE_SECONDS` |
| 11 | [site-admin/server/sections-reads.ts:416](web/src/lib/site-admin/server/sections-reads.ts:416) (`loadCachedSectionUsageEntries`) | `["site-admin:section-usage-map", tenantId]` | `tagFor(tenantId,"pages-all")`, `tagFor(tenantId,"sections-all")` | `CACHED_USAGE_REVALIDATE_SECONDS` |
| 12 | [site-admin/server/shell-reads.ts:57](web/src/lib/site-admin/server/shell-reads.ts:57) | `["site-admin:published-shell", tenantId, locale]` | `tagFor(tenantId,"pages-all")` | none (tag-only) |
| 13 | [site-admin/server/page-reads.ts:90](web/src/lib/site-admin/server/page-reads.ts:90) | `["site-admin:public-page", tenantId, locale, slug]` | `tagFor(tenantId,"pages-all")` | none (tag-only) |
| 14 | [site-admin/server/homepage-reads.ts:163](web/src/lib/site-admin/server/homepage-reads.ts:163) | `["site-admin:homepage:public", tenantId, locale]` | `tagFor(tenantId,"homepage",{locale})`, `tagFor(tenantId,"pages-all")` | `300` (safety-net) |
| 15 | [site-admin/server/shell-brand-logo.ts:51](web/src/lib/site-admin/server/shell-brand-logo.ts:51) | `["site-admin:shell-brand-logo", tenantId]` | `tagFor(tenantId,"branding")` | `SHELL_LOGO_TTL_SECONDS` |
| 16 | [site-admin/server/pages-reads.ts:90](web/src/lib/site-admin/server/pages-reads.ts:90) | `["site-admin:page:public", tenantId, locale, slug]` | `tagFor(tenantId,"pages-all")` | none (tag-only) |
| 17 | [site-admin/server/pages-reads.ts:134](web/src/lib/site-admin/server/pages-reads.ts:134) (`loadPublicPagesList`) | `["site-admin:pages:public-list", tenantId]` | `tagFor(tenantId,"pages-all")` | none (tag-only) |
| 18 | [site-admin/server/shell-social-contact.ts:69](web/src/lib/site-admin/server/shell-social-contact.ts:69) | `["site-admin:shell-social-contact:v2", tenantId]` | `tagFor(tenantId,"identity")`, `tagFor(tenantId,"storefront")` | `SHELL_SOCIAL_TTL_SECONDS` |
| 19 | [site-admin/server/navigation-reads.ts:65](web/src/lib/site-admin/server/navigation-reads.ts:65) | `["site-admin:navigation:public", tenantId, zone, locale]` | `tagFor(tenantId,"navigation")` | none (tag-only) |
| 20 | [cms/public-navigation.ts:49](web/src/lib/cms/public-navigation.ts:49) (`loadCachedNavigation`) | `["cms:public-navigation", tenantId, locale, zone]` | `tagFor(tenantId,"navigation")` | none (tag-only) |
| 21 | [dashboard/admin-dashboard-data.ts:270](web/src/lib/dashboard/admin-dashboard-data.ts:270) (`loadCachedTranslationBootstrap`) | `["admin:translation-health:v1"]` | (none — `revalidate`-only) | `300` |

*(Numbering shows the 21 unique `unstable_cache` invocations — the
`unstable_cache` import line in admin-taxonomy.ts was counted separately
in the initial grep but resolves to entry #1 above.)*

---

## 2. Field-catalog cache: writers to the 6 source tables

`loadTenantFieldCatalogUncached`
([admin-taxonomy.ts:123](web/src/lib/server-actions/admin-taxonomy.ts:123))
reads:

1. `profile_field_definitions`
2. `profile_field_groups`
3. `parent_category_field_groups`
4. `profile_field_recommendations`
5. `workspace_field_group_settings`
6. `workspace_profile_field_settings`

### 2.a — Runtime writers (server actions, app routes, RPC)

A repo-wide grep
(`grep -rn '.from("<table>")'` + `.insert|.update|.upsert|.delete` filter)
finds writers ONLY for the last two (per-tenant overlay) tables:

| Table | Writer file:line | Action | Op |
|---|---|---|---|
| `workspace_profile_field_settings` | [admin-workspace-field-settings.ts:236-249](web/src/lib/server-actions/admin-workspace-field-settings.ts:236) | `setWorkspaceFieldVisibility` | `upsert` |
| `workspace_profile_field_settings` | [admin-workspace-field-settings.ts:270-274](web/src/lib/server-actions/admin-workspace-field-settings.ts:270) | `resetWorkspaceFieldVisibility` | `delete` |
| `workspace_profile_field_settings` | [admin-workspace-field-settings.ts:443-445](web/src/lib/server-actions/admin-workspace-field-settings.ts:443) | `setWorkspaceFieldCatalog` | `upsert` |
| `workspace_field_group_settings` | [admin-workspace-field-settings.ts:476-478](web/src/lib/server-actions/admin-workspace-field-settings.ts:476) | `setWorkspaceFieldGroup` | `upsert` |

The four catalog tables `profile_field_definitions`, `profile_field_groups`,
`parent_category_field_groups`, `profile_field_recommendations` are
read-only at runtime — only migrations/seeds write to them. Catalog
edits therefore cannot create runtime staleness inside the 120 s
field-catalog cache window.

### 2.b — Are the busts wired?

All four runtime writers funnel through one helper:

```ts
// admin-workspace-field-settings.ts:44-48
function bustFieldCatalog(tenantId: string): void {
  revalidateTag(FIELD_CATALOG_TAG, "default");                  // "field-catalog"
  revalidateTag(`${FIELD_CATALOG_TAG}:${tenantId}`, "default"); // "field-catalog:<tid>"
}
```

The cache itself is tagged with both forms
([admin-taxonomy.ts:192](web/src/lib/server-actions/admin-taxonomy.ts:192)),
so each `bustFieldCatalog(tenantId)` invalidates this tenant's catalog
*and* the global tag (defensive double-bust).

Confirmed call-sites in each writer:

| Writer | Busts at line |
|---|---|
| `setWorkspaceFieldVisibility` | [admin-workspace-field-settings.ts:255](web/src/lib/server-actions/admin-workspace-field-settings.ts:255) |
| `resetWorkspaceFieldVisibility` | [admin-workspace-field-settings.ts:280](web/src/lib/server-actions/admin-workspace-field-settings.ts:280) |
| `setWorkspaceFieldCatalog` | [admin-workspace-field-settings.ts:450](web/src/lib/server-actions/admin-workspace-field-settings.ts:450) |
| `setWorkspaceFieldGroup` | [admin-workspace-field-settings.ts:483](web/src/lib/server-actions/admin-workspace-field-settings.ts:483) |

**Verdict: field-catalog cache invalidation is correctly wired. No HIGH
severity issues.**

---

## 3. Taxonomy mutators

| Action | File:line | Table | Cache bust |
|---|---|---|---|
| `setTaxonomyEnabled` | [admin-taxonomy.ts:577-612](web/src/lib/server-actions/admin-taxonomy.ts:577) | `agency_taxonomy_settings` upsert | `revalidatePath(...)` only — no `revalidateTag` |
| `setTaxonomyFlags` | [admin-taxonomy.ts:629-658](web/src/lib/server-actions/admin-taxonomy.ts:629) | `agency_taxonomy_settings` upsert | `revalidatePath(...)` only |
| `addCustomSubType` | [admin-taxonomy.ts:669-724](web/src/lib/server-actions/admin-taxonomy.ts:669) | `agency_taxonomy_terms` insert | `revalidatePath(...)` only |
| `removeCustomSubType` | [admin-taxonomy.ts:730-760](web/src/lib/server-actions/admin-taxonomy.ts:730) | `agency_taxonomy_terms` update (archive) | `revalidatePath(...)` only |

### Cross-check: do any cached functions read `agency_taxonomy_*`?

Grep `agency_taxonomy_settings|agency_taxonomy_terms` across
`web/src/lib/**` returns 14 hits in 5 files — **all of them are inside
non-cached server actions** (`admin-taxonomy.ts`,
`admin-talent-skills.ts`, `admin-talent-contexts.ts`). The directory
caches (#2–#6 above) read only the GLOBAL `taxonomy_terms` table; they
never join the per-tenant overlay. Therefore:

- The field-catalog cache (#1) does NOT need to be busted on a taxonomy
  mutation — the 6 read tables don't include `agency_taxonomy_*`.
- The directory/taxonomy caches don't honor per-tenant taxonomy overlay
  in the first place. That's a **data-model gap** (a tenant disabling a
  talent_type via Settings doesn't hide it from the directory filter
  sidebar), but a tag-bust here wouldn't fix it — the read would still
  return the same set.

Flag for follow-up, but **out of scope for cache invalidation**.

---

## 4. Recommendations (prioritized)

### HIGH — user-visible staleness after save
**None.** Every code path that mutates a table read by an `unstable_cache`
entry calls the matching `revalidateTag` (or the cache only reads
immutable-at-runtime catalog tables).

### MEDIUM — defense-in-depth

1. **Extract `FIELD_CATALOG_TAG` to a shared module.**
   [admin-workspace-field-settings.ts:28](web/src/lib/server-actions/admin-workspace-field-settings.ts:28)
   redefines the string literal `"field-catalog"` instead of importing
   `CACHE_TAG_FIELD_CATALOG` from
   [admin-taxonomy.ts:76](web/src/lib/server-actions/admin-taxonomy.ts:76).
   A drift here would silently break invalidation. The in-code comment
   already acknowledges this ("Phase 1b exports the canonical const";
   never landed). Move both to `web/src/lib/cache-tags.ts` next to
   `CACHE_TAG_DIRECTORY` / `CACHE_TAG_TAXONOMY`.

2. **Add a `revalidate` window to tag-only entries.** Five entries
   (#7, #8, #12, #13, #16, #17, #19, #20) have `tags` but no
   `revalidate` field. Vercel's Data Cache persists across deployments
   and `revalidateTag` only fires in the runtime that calls it — a row
   first cached by an older deployment can never receive a tag bust
   from the new runtime. The shell logo, homepage, and shell tagline
   readers all set a defensive 300 s TTL for exactly this reason
   ([homepage-reads.ts:192-203](web/src/lib/site-admin/server/homepage-reads.ts:192)).
   The same pattern would harden the identity/branding/page/navigation
   readers.

### LOW — natural-expiry only

3. **`taxonomy-filters.ts` (#6) has a 3600 s TTL.** It reads global
   `taxonomy_terms` (admin-mutated by migrations, not runtime). Stale
   for at most one hour after a catalog change ships. Not user-visible
   per-tenant; safe to leave as-is.

4. **Directory filter sidebar (#3) is keyed on `tenantKey` but the
   global `taxonomy_terms` source has no per-tenant overlay.** If/when
   `setTaxonomyEnabled` is meant to hide a term from the public filter
   sidebar, that read needs to join `agency_taxonomy_settings` AND the
   mutator needs to add `revalidateTag(CACHE_TAG_TAXONOMY, "default")`
   + `revalidateTag(CACHE_TAG_DIRECTORY, "default")`. As-is, the
   feature is non-functional on the public surface, not stale-cached.
   File against the data-model backlog, not this audit.

---

## Confirmed-wired summary

| Cache (key, tags) | Mutator(s) that bust it | Status |
|---|---|---|
| `tenant-field-catalog` (`field-catalog`, `field-catalog:<tid>`) | `setWorkspaceFieldVisibility`, `resetWorkspaceFieldVisibility`, `setWorkspaceFieldCatalog`, `setWorkspaceFieldGroup` — all via `bustFieldCatalog()` | ✅ Wired |
| Directory + taxonomy caches | `revalidatePublicData()` in [revalidate-public.ts:8-15](web/src/lib/revalidate-public.ts:8) (called from public-surface server actions) | ✅ Wired for content edits; gap on taxonomy overlay (see §3) |
| Site-admin storefront caches (identity / branding / pages / sections / navigation / homepage / shell) | `saveIdentity`, `publishPageSnapshot`, `publishHomepage`, `site-shell-backfill-action`, `page-composer-action`, `composition-actions`, `site-header/actions`, `homepage.ts`, `directory-catalogs.ts`, `onboard-directory-page.ts` (40 `revalidateTag` call-sites across site-admin) | ✅ Wired |

No fixes required for the field-catalog engine cache pipeline; the two
follow-ups are stylistic (consolidate the tag constant) and
defense-in-depth (TTL safety nets on tag-only entries).
