# Outline View Empty-State Bug — Root Cause Analysis

**Date:** 2026-05-13  
**Branch:** phase-1  
**Bug:** The Outline view in the Navigator Panel shows empty even though the Hero
section has "A house of curated talent." set in the Content inspector.  
**Status:** Root cause identified — two compounding failure modes found.

---

## Symptom recap

When the admin opens the Navigator and switches to the Outline tab, it shows
"No headings yet." The display-name fallback commit (b9efcd47e) papers over one
symptom: the Section list still shows "Hero — new" instead of using the headline
as the row label. The Outline view remains empty.

---

## Data-flow recap

```
Navigator client component
  └─ flatSectionIds (from slots in EditContext)
       └─ loadHeadingProbeForLint(flatSectionIds)   [server action]
            ├─ requireStaff()                        [auth gate]
            ├─ requireTenantScope()                  [tenant gate]
            ├─ listSectionsByIdsForStaff(supabase, tenantId, ids)
            │    └─ SELECT id, section_type_key, props_jsonb FROM cms_sections
            └─ for each row: props_jsonb["headline"] → headlineText
                 └─ returns { ok: true, sections: [{sectionId, headlineText}] }

Navigator client component
  └─ headingProbe: Record<sectionId, headlineText>
       └─ outlineNodes = buildHeadingOutline(flat.map(r => ({
            props: { headline: headingProbe?.[r.sectionId] ?? "" }
          })))
              └─ SKIPS sections where text is empty
```

---

## Failure Mode A — `requireTenantScope()` returns null (PROBABLE PRIMARY CAUSE)

### Mechanism

`requireTenantScope()` in `web/src/lib/saas/scope.ts` resolves tenant scope
from (in priority order):

1. `x-impronta-tenant-id` request header (set by `proxy.ts` middleware)
2. `impronta.active_tenant_id` cookie (set by workspace switcher)
3. First active membership (single-workspace users)

### What happens on `localhost:3000`

`proxy.ts` at line 418-430:

```ts
if (isTenantHostContext(effectiveHostContext)) {
  requestHeaders.set(TENANT_HEADER_NAME, effectiveHostContext.tenantId);
} else {
  // Strip any spoofed header on non-tenant contexts (marketing / app).
  requestHeaders.delete(TENANT_HEADER_NAME);
}
```

`isTenantHostContext` returns `true` only for `kind: "agency" | "hub"`. For
`localhost`, `resolveTenantContext` returns `kind: "app"` (fallback at
`host-context.ts` line 186). On `kind: "app"`, the middleware **deletes** the
`x-impronta-tenant-id` header.

### The path-based rescue (partial)

`proxy.ts` lines 257-271: when `hostContext.kind === "app"` AND
`isLocalhostHost(hostHeader)`, it resolves a path-based tenant context by
calling `resolveTenantContextFromPathSlug(request, hostHeader, "impronta")`.
This queries `agency_domains` for `tenant_slug = 'impronta'` (kind
subdomain/custom, status active). If that lookup succeeds, `effectiveHostContext`
becomes an `agency` context and the header IS set.

**Failure condition:** `resolveTenantContextFromPathSlug` returns `null` when:
- The `agency_domains` table doesn't have a row with `tenant_slug = 'impronta'`
  (e.g. the `tenant_slug` column backfill from migration
  `20260901130000_agency_domains_tenant_slug.sql` hasn't run, or the column is
  NULL on the impronta row).
- The Supabase anon key isn't configured in the dev environment.
- The `resolve_public_tenant_by_slug` RPC isn't deployed yet on the dev DB.

In those cases `effectiveHostContext` stays `kind: "app"` → header is deleted
→ `requireTenantScope()` falls through to the cookie fallback.

### Cookie fallback also fails when

The `impronta.active_tenant_id` cookie (`ACTIVE_TENANT_COOKIE`) is only written
by `switchActiveTenant` in `tenant-switch-action.ts`. On a fresh dev session
(or after clearing cookies), no tenant cookie exists. The cookie is also scoped
to `path="/"` with no domain restriction, so it persists across localhost
sessions, but only if the operator has previously navigated through the workspace
switcher. If they went directly to `localhost:3000/impronta/` without switching
via `/admin`, the cookie may never have been set.

### Membership fallback also fails when

If both header and cookie are missing, `getTenantScope` falls back to
`getCurrentUserTenants()` → `pickDefault(memberships)`. For
`app_role = 'super_admin'`, this fetches all agencies. But `pickDefault` only
returns a tenant if `memberships.length > 0`, i.e. the DB query succeeds. If
Supabase isn't reachable, or if the session cookie is missing/expired, the
membership list is empty → returns `null` → scope fails.

### Evidence

The `console.warn("[heading-probe] tenant scope unresolved...")` was added in
commit 170cd22bc specifically because this failure mode was observed. The
fallback display name ("Hero — new") was added at b9efcd47e because this log
was firing.

---

## Failure Mode B — `props_jsonb.headline` is empty / stored in wrong shape

Even if the scope resolves, the probe may return `headlineText: ""`.

### Sub-case B1: Hero uses `slides`-based format

The `heroSchemaV1` supports both:
- Top-level `headline: string` (the v1 flat format)
- `slides: [{headline: string, ...}]` (the slider extension)

If the Impronta Hero section was saved with the slider variant (slides array
instead of/alongside top-level headline), then `props_jsonb["headline"]` would
be `undefined` or `""` at the top level.

The Content inspector's `HeroContentInspector` reads `draftProps.headline` (top
level) for the visible field, which would show the saved value correctly. But
the probe loader at `heading-lint-action.ts` line 101-104 looks only at
`props_jsonb["headline"]` (top level), not `slides[0].headline`.

### Sub-case B2: Headline was never persisted

The Content inspector works with `draftProps` (in-memory working copy). If the
section was created from the library with the default content
(`"A house of curated talent."`) but the operator **never saved** (autosave
failed or the initial create didn't flush the headline), then `props_jsonb` in
the DB may be `{}` or `{"headline": ""}` while the inspector shows the
default-content string.

### Consequence in the Outline view

`buildHeadingOutline` (heading-hierarchy.ts line 119) explicitly skips sections
with empty text:

```ts
const text = String(props[cfg.propKey] ?? "").trim();
if (!text) continue;    // <-- sections with empty headlines are excluded
```

So any Hero section with `headlineText: ""` is silently dropped from the outline
tree, causing "No headings yet." even when the section exists.

---

## Failure Mode C — RLS denies `listSectionsByIdsForStaff`

`listSectionsByIdsForStaff` uses the **user's RLS-scoped Supabase client** (from
`requireStaff()`). The policy `cms_sections_staff_all` requires
`public.is_staff_of_tenant()` which checks if the caller is staff of the
tenant in the `.eq("tenant_id", tenantId)` filter row.

If `requireStaff()` returns an RLS client for user X, but `tenantId` is
resolved from a stale/incorrect scope, the RLS policy would deny the rows
→ returns empty array → all sections have `headlineText: ""` → outline empty.

This is less likely since the inspector (which uses the same auth client) loads
section data successfully. But it could occur if the **probe action's
`requireTenantScope()` resolves to a different tenant** than the one the editor
is editing.

---

## Most Likely Root Cause

**Failure Mode A** is the primary cause, specifically: on `localhost:3000`,
`resolveTenantContextFromPathSlug` is failing to resolve the `impronta` slug to a
tenant ID (most likely because the `tenant_slug` column is NULL or missing from
the impronta `agency_domains` row on the dev DB), causing `effectiveHostContext`
to remain `kind: "app"`, which causes the middleware to delete
`x-impronta-tenant-id`, and the cookie fallback isn't set because the operator
went directly to the edit URL without going through the workspace switcher.

**Failure Mode B** (empty `props_jsonb.headline`) is the secondary cause that
makes even a successful probe return empty text, and is why the Outline tab is
empty even in cases where the scope resolves but the section was saved with an
empty or slides-only format.

---

## Fix recipe

### Fix 1 — Make `loadHeadingProbeForLint` accept an explicit tenantId

The cleanest fix: the navigator already knows which tenant it's editing (the
edit context has it). Pass `tenantId` explicitly to the server action and skip
the `requireTenantScope()` call for scope resolution. `requireStaff()` still
validates auth; the explicit tenantId is validated against the user's
memberships inside the action.

```ts
// heading-lint-action.ts
export async function loadHeadingProbeForLint(
  sectionIds: ReadonlyArray<string>,
  tenantId: string,  // <-- add explicit parameter
): Promise<HeadingProbeResult> {
  const auth = await requireStaff();
  if (!auth.ok) { ... return ...; }
  // Validate caller is staff of the passed tenant
  const memberships = await getCurrentUserTenants();
  const match = memberships.find(m => m.tenant_id === tenantId);
  if (!match) return { ok: false, error: "Not staff of tenant." };
  // use tenantId directly — no requireTenantScope() needed
  ...
}
```

The navigator panel already has `tenantId` from `useEditContext().tenantId` (the
edit mode always knows the tenant it's editing). This bypasses the header/cookie
resolution chain entirely.

### Fix 2 — Cookie fallback: set tenant cookie during edit-mode mount

If Fix 1 isn't taken, a simpler mitigation: ensure `impronta.active_tenant_id`
is written during the initial edit-mode mount by calling `switchActiveTenant`
client-side when the edit chrome mounts. This would persist the cookie for all
subsequent server actions.

### Fix 3 — Probe `slides[0].headline` as fallback

If the primary headline is empty, fall back to `slides[0]?.headline` for hero
sections. This covers Sub-case B1.

```ts
// in loadHeadingProbeForLint, after the existing propKey lookup:
if (!text && r.section_type_key === "hero") {
  const slides = props.slides as Array<{headline?: string}> | null;
  const firstSlideHeadline = slides?.[0]?.headline;
  if (typeof firstSlideHeadline === "string") text = firstSlideHeadline.trim();
}
```

---

## Verification steps

1. **Check server console on `localhost:3000`** when the navigator opens:
   - `[heading-probe] auth gate failed` → Fix 1 path (requireStaff failing)
   - `[heading-probe] tenant scope unresolved` → Fix 1 or Fix 2 path
   - No warning but Outline is empty → the probe returned ok+empty → Failure B

2. **Check `agency_domains` for impronta tenant_slug:**
   ```sql
   SELECT hostname, kind, tenant_slug, status
   FROM public.agency_domains
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
   ```
   If `tenant_slug` is NULL → run the backfill migration or set it manually.

3. **Check actual Hero `props_jsonb`:**
   ```sql
   SELECT id, name, props_jsonb->>'headline' as headline,
          jsonb_array_length(COALESCE(props_jsonb->'slides', '[]'::jsonb)) as slide_count
   FROM public.cms_sections
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
     AND section_type_key = 'hero';
   ```
   If `headline` is NULL or empty and `slide_count > 0` → Failure Mode B1.
   If `headline` is set → the issue is purely scope resolution (Failure A).

---

## Files examined

- `web/src/lib/site-admin/edit-mode/heading-lint-action.ts` — the probe loader
- `web/src/lib/site-admin/server/sections-reads.ts` — DB query
- `web/src/lib/server/action-guards.ts` — `requireStaff()`
- `web/src/lib/saas/scope.ts` — `requireTenantScope()`, `getTenantScope()`
- `web/src/lib/saas/host-context.ts` — `resolveTenantContextFromPathSlug()`
- `web/src/proxy.ts` — middleware; header injection at line 418-430
- `web/src/lib/site-admin/a11y/heading-hierarchy.ts` — `buildHeadingOutline()`,
  skips empty headlines at line 119
- `web/src/lib/site-admin/sections/hero/schema.ts` — heroSchemaV1 (flat vs slides)
- `web/src/components/edit-chrome/navigator-panel.tsx` — outline computation at lines 687-699
- `supabase/migrations/20260922100000_agency_domains_localhost_app_dev.sql`
- `supabase/migrations/20260901130000_agency_domains_tenant_slug.sql`
