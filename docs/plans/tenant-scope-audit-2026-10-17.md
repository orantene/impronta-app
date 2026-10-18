# Tenant-scope audit: Concierge, template preview, directory (TUL-1068, 1070, 1246)

Date 2026-10-17. Branch `fix/p0-security-preview-concierge-redact` (PR #3983). Code is the source of truth; every claim below was read in the code on that branch. Nothing here touches real tenant data.

## 1. Paths behind the three leaks

| Leak | Path | Cause | State |
|---|---|---|---|
| TUL-1068 (TAL-93940 inside the qa-paid-owner inquiry) | cart (`saved_talent`, no tenant column) -> `useCartTalentPreload` -> `captureGuestChip` kind `talent` -> `interpreted_query.talent.selected_ids` | the chip wrote client-supplied ids with no roster check | fixed: `guest-chip-talent-scope.ts` + roster filter in the action |
| TUL-1068 (cart rail) | `(public)/layout.tsx` seeded an agency page's cart with every saved id | no tenant filter on the saved list | fixed: filtered through the roster for agency hosts |
| TUL-1070 (dock lists other tenants) | `loadTalentRows` (dock Talent tab), `loadOfferingRows`, `loadTalentProfileOfferingRows` | offerings already `tenant_id`-filtered (#3782/3789/3796); talent rows listed `status != removed`, ignoring visibility | fixed: dock rows use the shared roster scope |
| TUL-1246 (design picker previews real content) | `/template-preview/<design>?demo=` -> `resolveDemoPreviewHydration` -> stored profile + saved page + live widgets of an allow-listed profile code | the row behind the code was never checked to still be a seeded demo | fixed: `previewMayRenderDemoTalent` (registry + `is_demo` + demo account) |

## 2. ONE tenant-scoped data-access helper

`scopeToGuestVisibleRoster(query, tenantId)` in `web/src/lib/saas/talent-roster.ts`: `tenant_id = T`, `status = active`, `agency_visibility in (site_visible, featured)`, `talent_site_hidden = false`. Used by:

- `filterTalentIdsOnTenantRoster`, `listTalentIdsOnTenantRoster`, `isTalentOnTenantRoster` (chip check, directory id list, single-id check)
- `loadTalentRows` (Concierge dock Talent tab)
- `loadDefaultStorefrontRoster(tenantId, { guestVisibleOnly: true })` (Concierge talent picker, via `listGuestTenantRoster`)
- `loadRosterPortraitsByIds` (cart portraits)

Behaviour change to be aware of: the Concierge picker, dock rows and cart portraits now also hide `roster_only` and `talent_site_hidden` members. The default storefront body (no `guestVisibleOnly`) is unchanged.

## 3. Negative suite

`web/src/lib/saas/tenant-scope-negative.test.ts` (two synthetic tenants A and B, a talent on both rosters, hidden / roster-only / pending members): tenant A gets nothing of B from the shared scope, the directory id list, the chip check, the chip end to end, the dock Talent rows and the dock offerings. Companions: `items-catalog-tenant-scope.test.ts`, `guest-chip-talent-scope.test.ts`, `guest-roster-scope.static.test.ts`, `demo-preview-gate.test.ts` (template preview: a code whose row is not a demo is refused for maison-v2, folio, gridline).

## 4. Same pattern on the same table: every call site

`agency_talent_roster` is read in 142 files. The guest / public-facing ones:

| Site | Tenant filter | Verdict |
|---|---|---|
| `lib/saas/talent-roster.ts` (3 reads) | shared scope | fixed (one definition) |
| `lib/messages-v5/items-catalog.ts` `loadTalentRows` | shared scope | fixed |
| `lib/messages-v5/items-catalog.ts` `loadPersonSlots` (line ~433) | `tenant_id` + `talent_profile_id` + `neq removed` | justified: availability for one named talent, tenant-bound |
| `lib/home/default-storefront-roster.ts` (storefront body) | `tenant_id` + `active` | justified: public storefront, published-workflow filter in code; not the guest picker |
| same file, picker and cart portraits | shared scope | fixed |
| `lib/directory/directory-filter-sections.ts` | `tenant_id` | justified: facet counts for the tenant |
| `lib/field-engine/directory-facet-category-gate.ts` | `tenant_id` | justified |
| `lib/inquiry/new-inquiry-intake-data.ts` | `tenant_id` | justified |
| `app/t/[profileCode]/profile-view.tsx` 620, 1292 | by `talent_profile_id` only | justified: resolves WHICH tenant governs a talent (primary roster), the answer is a tenant, nothing is listed |
| `app/t/[profileCode]/profile-view.tsx` 1192 | `tenant_id` | justified |
| `lib/promos/public-promos.server.ts` | by `talent_profile_id` | justified: finds the talent's tenant for promo scoping (see the promos incident note) |
| `lib/messaging/talent-inquiry-tenant.server.ts` | by `talent_profile_id`, returns status/visibility | justified: tenant resolution |
| `lib/inquiry/owning-party-resolver.ts` (2), `picker-talent-guard.ts` | by `talent_profile_id(s)` | justified: ownership resolution, returns tenants, lists no talent |
| `lib/server-actions/search-talent.ts` | RLS client in a staff action, tenant branch below the query | justified: staff-only |
| `components/home/hub-landing.tsx` (2) | hub tenant + approved | justified: hub directory, exposure veto layered on |
| `(public)/_chat/AgencyChatLauncherMount.tsx` `activeRosterSize` | `tenant_id` | justified: count only |
| Hub / Discover index (`loadDiscoverTalents`) | cross-tenant by design | justified: a hub owns no roster of its own; only used when `agencies.kind = hub` |

Not changed, flagged: `loadOfferingRows` (dock services) does not filter `moderation_state` / `visibility` the way `loadTalentProfileOfferingRows` does. It is tenant-scoped, so not a cross-tenant leak, but guests may see unapproved or hidden services. Left alone because it could empty a live menu; needs a product call.

## 5. Cache keys

Only one `unstable_cache` sits on these paths: `storefront-talent-discovery` keyed `[..., tenantId]` with tag `tenant:<id>` (`lib/saas/storefront-discovery.ts`). The other caches are React `cache()` (per request, never shared). The saved-talent list (`getSavedTalentIds`) is per request and is now roster-filtered on agency hosts. No cache found that omits the tenant.

## 6. Service-role clients in page / component code

`createServiceRoleClient` appears in page or layout code of: `(public)/layout.tsx` (added by this branch, for the roster filter, a read keyed by the host's own tenant), `(public)/book/page.tsx`, `(public)/pay/[code]/pay-page.tsx`, `(public)/ticket`, `(public)/manage`, `(public)/visit`, `(public)/c/t/[token]`, `share/*`, `checkout/success`, `unsubscribe/*`, `t/[profileCode]/profile-view.tsx`, `_shared/TalentStorefront.tsx`, `_shared/ProfileInstantBookingMount.tsx`, `freeform-hub-book.tsx`, `%5Ftalent-site/TalentSiteMessagesDock.tsx`, `template-preview/[key]/theme-preview.tsx` and `live-site-preview.tsx`, `components/home/agency-home-storefront.tsx`, `components/home/hub-landing.tsx` (agency names), `(workspace)/talent/*` pages, `(workspace)/[tenantSlug]/admin/*` and `platform/admin/*` pages. Most are code-is-the-credential token pages (pay, ticket, manage, visit, share, unsubscribe) or staff pages behind a guard. Flagged for a human decision, none changed:

- `template-preview/[key]/theme-preview.tsx` and `live-site-preview.tsx`: service role plus a viewer-supplied `?talent=`; both are owner / demo gated (`resolvePreviewHydration`, `assertDemoTarget`, `isAdminViewingDemo`).
- `(public)/pay/[code]/pay-page.tsx`: code lookup is global; see the pay PR for the host-tenant check.
- `hub-landing.tsx` / `(public)/layout.tsx`: read only public names / the host tenant's own roster.
