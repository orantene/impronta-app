---
title: Canonical Impronta Admin — Migration Manifest
status: read-only inventory (no implementation yet)
created: 2026-05-11
working_dir: /Users/oranpersonal/Desktop/impronta-app
git_branch: stable-work
git_status_at_capture: clean
---

# Canonical Impronta Admin — Migration Manifest

This document is a **read-only inventory** to support migrating the production admin out of the `prototype` namespaces into the canonical `[tenantSlug]/admin/` home. Nothing in here is a code change — every recommendation is staged for a follow-up plan.

The goal of the migration: **make `web/src/app/(workspace)/[tenantSlug]/admin/` the canonical admin home**, with no production code importing from `app/prototypes/`, `components/prototype/`, or `lib/prototype/`. Production behavior moves out by **ownership**, not by filename. Demo/mock content stays under `/prototypes/`. No duplicate v2 or parallel shell.

---

## 0. Headline findings (read first)

1. **There are 4 admin/dashboard surfaces in the app, all reachable from a tenant slug.** They divide cleanly by whether they're coupled to the prototype shell:

   | Surface | Route | Audience | Shell | Migration scope |
   |---|---|---|---|---|
   | **Tenant admin** | `[tenantSlug]/admin/*` | agency staff (owner/admin/coordinator/editor/viewer) | Prototype shell (`AdminShellPrototypePageClient`) | **IN scope** — primary migration target |
   | **Talent admin** | `[tenantSlug]/talent/*` | rostered talent self-surface | Prototype shell (`TalentShellPrototypePageClient`) | **IN scope** — migrates in the same wedge cut as tenant admin |
   | **Client admin** | `[tenantSlug]/client/*` | client self-dashboard | Standalone (`ClientTopbar`, custom layout) | **OUT of scope** — already prototype-clean |
   | **Platform admin** | `platform/admin/*` | HQ super-admin / impronta staff | Standalone HQ shell | **OUT of scope** — already prototype-clean |

   Two of four surfaces still run through `prototypes/admin-shell/`. The wedge unblocks both in one cut. Two are already standalone and not affected.

2. **The "prototype" shell IS the production admin (for tenant + talent surfaces).** `[tenantSlug]/admin/layout.tsx:33` mounts `AdminShellPrototypePageClient`; `[tenantSlug]/talent/layout.tsx:29` mounts `TalentShellPrototypePageClient`. Both come from `app/prototypes/admin-shell/_shell-client.tsx`. So `prototypes/admin-shell/` is not a sandbox — it's the live shell for two surfaces.

3. **The wedge is small: exactly 5 prototype modules are imported by production code**, across 10 production files (17 import statements). Everything else under the prototype namespaces is either (a) internal to the shell tree, reachable only through these 5 modules, or (b) actual demo/mock content (`drawer-preview`, `audit-phase-e`, `plan-viewbar`).

4. **The cutover is already mid-flight.** Most `[tenantSlug]/admin/*/page.tsx` files are `PageRouteSyncer` stubs — they exist only to call `setPage("messages")` etc. on the prototype shell's internal state. The Next.js URL is real; the page-switch is SPA-internal. The talent surface mirrors this with `TalentPageRouteSyncer`. The canonical structure is already the right structure for production.

5. **`admin-preview/` is now redundant.** It was the staging route for the cutover (per its own comment block). The canonical `admin/` layout has since absorbed the same behavior. Recommend retiring it after migration.

6. **Active work is landing on prototype-named files daily.** Today's commit (`6ef7f2ce`) touches `_drawers.tsx`. Yesterday's (`0d18b54c`) touched `_drawers.tsx`, `_state.tsx`, `_shell-client.tsx`, and 9 others. **The migration must coordinate with in-flight work or it will lose changes.**

7. **The prototype `_state.tsx` carries enums for all 4 surfaces** (`WorkspacePage`, `TalentPage`, `ClientPage`, `PlatformPage`) and 4 `setPage*` variants, but only the first two are used by real routes. The `ClientPage` / `PlatformPage` entries exist for in-shell demo/preview, not production — real client and platform surfaces have their own implementations and do not consult `_state.tsx`.

---

## 1. Migration "wedge" — the only files that block decoupling

These are the **direct production → prototype edges**. Cut them by promoting these 5 prototype modules out and rewriting these 10 import sites, and the prototype namespace stops being load-bearing.

### 1a. Prototype modules that production depends on (5)

| Prototype module | Lines | Production-facing exports | Why it's load-bearing |
|---|---:|---|---|
| `app/prototypes/admin-shell/_shell-client.tsx` | 2,487 | `AdminShellPrototypePageClient`, `TalentShellPrototypePageClient` | The actual admin shell React tree. Rendered by admin/layout, talent/layout, admin-preview. |
| `app/prototypes/admin-shell/_state.tsx` | 9,433 | `useProto` hook, `WorkspacePage`/`TalentPage` types (+ many more) | Global admin state context. Hook used by route-syncers; types used by routing helpers. |
| `app/prototypes/admin-shell/_data-bridge.ts` | 600 | 14+ Supabase loaders (`loadInquiriesForMessages`, `loadWorkspaceRosterForCurrentTenant`, `createBridgeDataFromRoster`, etc.) | Server-side data loading layer. Awaited by admin/layout's `Promise.all`. |
| `app/prototypes/admin-shell/_taxonomy-loader.ts` | 260 | `useLiveTaxonomy` hook | Used by one production component (`admin-new-inquiry-sheet`). |
| `lib/prototype/admin-prototype-nav.ts` | 267 | `ADMIN_NAV_LABEL_BY_SEGMENT`, `ADMIN_PROTOTYPE_NAV`, `flattenPrototypeNavWithOrder`, etc. | Used by `admin-shell-top-bar` for label resolution; also used internally to render the sidebar. |

### 1b. Production files that import from a prototype namespace (10 files, 17 imports)

| Importer (production) | Imports | Line(s) |
|---|---|---:|
| `app/(workspace)/[tenantSlug]/admin/layout.tsx` | 14 loaders from `_data-bridge` + `AdminShellPrototypePageClient` from `_shell-client` + `WorkspacePage` type from `_state` | 30, 33, 34 |
| `app/(workspace)/[tenantSlug]/admin/_page-route-syncer.tsx` | `useProto`, `WorkspacePage` from `_state` | 18, 19 |
| `app/(workspace)/[tenantSlug]/admin/workspace-page-routing.ts` | `WorkspacePage` type from `_state` | 1 |
| `app/(workspace)/[tenantSlug]/admin-preview/page.tsx` | `AdminShellPrototypePageClient`, `createBridgeDataFromRoster`, `loadWorkspaceRosterForCurrentTenant` | 31, 35 |
| `app/(workspace)/[tenantSlug]/talent/layout.tsx` | loaders from `_data-bridge`, `TalentShellPrototypePageClient` from `_shell-client`, `TalentPage` type from `_state` | 26, 29, 30 |
| `app/(workspace)/[tenantSlug]/talent/_talent-page-route-syncer.tsx` | `useProto`, `TalentPage` from `_state` | 18, 19 |
| `app/(workspace)/[tenantSlug]/_data-bridge.ts` | `TalentProfile` type from `_state` | 18 |
| `app/(workspace)/[tenantSlug]/_data-bridge/roster.ts` | `TalentProfile` type from `_state` | 8 |
| `components/admin/admin-new-inquiry-sheet.tsx` | `useLiveTaxonomy` from `_taxonomy-loader` | 19 |
| `components/admin/admin-shell-top-bar.tsx` | `ADMIN_NAV_LABEL_BY_SEGMENT` from `lib/prototype/admin-prototype-nav` | 45 |

> Three additional files contain the literal string `"prototype"` but **do not import** from prototype namespaces — they're comments/JSDoc references:
> - `components/edit-chrome/theme-drawer.tsx:84` (comment)
> - `lib/site-admin/sections/gallery_strip/Component.tsx:16` (comment)
> - `lib/talent/profile-shell-taxonomy-sync.ts:2` (JSDoc)
>
> These get a 1-line comment update during migration but don't change behavior.

---

## 2. Admin route inventory — surface by surface

Seven top-level admin/dashboard trees exist (4 user-facing surfaces + 3 auxiliary trees). Roles and verdicts below.

> **Quick map of the 4 user-facing surfaces:**
> - `[tenantSlug]/admin/*` — tenant admin (§2a) — **prototype shell, IN scope**
> - `[tenantSlug]/talent/*` — talent admin (§2f) — **prototype shell, IN scope**
> - `[tenantSlug]/client/*` — client admin (§2g) — standalone, OUT of scope
> - `platform/admin/*` — platform admin (§2c) — standalone, OUT of scope
>
> Auxiliary trees: `admin-preview/` (§2b), `app/admin/` (§2d), `api/admin/` (§2e), plus a final "missing surfaces" check (§2h).

### 2a. `app/(workspace)/[tenantSlug]/admin/` — the **canonical** target (34 files)

The structure is already correct. The cutover model in place: each top-level segment is either (a) a real Next.js page with its own server data + components, or (b) a `PageRouteSyncer` stub whose only job is to flip the shell's internal page state to match the URL.

| Segment | Files | Role | Notes |
|---|---|---|---|
| `/admin` | `layout.tsx` | **layout-with-chrome** — mounts the prototype shell + 14-loader `Promise.all` data bridge | The single largest migration site. Imports `_shell-client`, `_data-bridge`, `_state`. |
| `/admin` | `loading.tsx` | **layout-only** — skeleton placeholder | Keep. |
| `/admin/account` | `page.tsx` + `BillingActionButtons.tsx`, `CurrencyPicker.tsx` | **real-page** — standalone account + billing surface | Production code, no prototype imports. |
| `/admin/bookings` | `page.tsx` | **sync-stub** — `<PageRouteSyncer page="bookings" />` | URL exists; UI inside the shell. |
| `/admin/calendar` | `page.tsx` | **sync-stub** | Same pattern. |
| `/admin/clients` | `page.tsx` | **sync-stub** | Same. |
| `/admin/media` | `page.tsx`, `actions.ts`, `folder-actions.ts` | **mixed** — real server actions + sync-stub UI | Server actions live in canonical home; UI in shell. |
| `/admin/messages` | `page.tsx` | **sync-stub** | |
| `/admin/operations` | `page.tsx` | **sync-stub** | |
| `/admin/payouts` | `page.tsx`, `payouts-actions-client.tsx`, `/return/page.tsx` | **real-page** — Stripe Connect onboarding + return | Production. |
| `/admin/pitches` | `page.tsx` | **sync-stub** | Per commit `5515564f`, Pitches surface lives in shell. |
| `/admin/production` | `page.tsx` | **sync-stub** | |
| `/admin/roster` | `page.tsx`, `[id]/page.tsx` (+ `EditorSections`, `TalentEditForm`, `CompletenessDial`, `WorkflowPipe`, `actions.ts`, `extended-actions.ts`), `new/page.tsx` (+ `NewRosterTalentForm`) | **real-page** — full talent profile shell (recently completed per `0d18b54c`) | Production. The roster `[id]` detail page is a peer to the shell, NOT inside it. |
| `/admin/settings` | `page.tsx` | **sync-stub** | |
| `/admin/site` | `page.tsx` | **sync-stub** or real (verify before migration touch) | |
| `/admin/site-settings/*` (16 sub-pages: identity, branding, design, seo, navigation, system, audit, content/{pages,posts,navigation,redirects} including `[pageId]`/`[postId]`) | each = `page.tsx` calling `redirectLegacySiteSettingsToWorkspaceSettings()` or similar | **redirect** — legacy bookmark capture, recently expanded in `5e28e8ff`, `9fc1b3e2`, `3dab7fb8` | Keep until traffic drops; eventually delete. |
| `/admin/website` | `page.tsx` | **real-page** (or sync-stub — verify) | Recent commit `096bc784` added website-tab integration. |
| `/admin/work` | `page.tsx`, `[id]/page.tsx` | **real-page** — booking detail with peek-sheet drawer | Production. |
| `/admin/_page-route-syncer.tsx` | helper | **internal** — the sync-stub implementation | Imports `useProto`, `WorkspacePage` from `_state`. Moves with `_state`. |
| `/admin/workspace-page-routing.ts` | helper | **internal** — segment → `WorkspacePage` resolver | Imports `WorkspacePage` type from `_state`. Moves with `_state`. |
| `/admin/_real-identity-banner.tsx` | helper | **internal** — top banner showing real session above prototype chrome | Mentioned in comment as a "replacement plan" placeholder. |
| `/admin/_pipeline-actions.ts` | helper | **internal** — server actions for inquiry pipeline | Keep. |

**Verdict:** This tree is the correct home. Routes are right. The work is to (a) move the 5 wedge modules into admin-owned locations, (b) rewrite the 5 import sites under this tree, (c) optionally collapse `PageRouteSyncer` once the shell's internal page-routing is replaced with real Next.js navigation. Step (c) is OUT OF SCOPE for the wedge cut.

### 2b. `app/(workspace)/[tenantSlug]/admin-preview/` — **retire**

Single file: `page.tsx` (64 lines). Comment block explains its role: "staging ground for replacing the legacy workspace admin route-by-route." It mounts the same `AdminShellPrototypePageClient` with a slimmer data bridge (just `createBridgeDataFromRoster(roster)`). The canonical `admin/layout.tsx` has since absorbed and exceeded this.

**Verdict: obsolete after migration.** Imports same three modules as `admin/layout.tsx`, so it gets rewritten in the same pass. After the wedge cut, the route serves no purpose. **Recommend deletion** as the final migration step (or leave one minimal smoke-test mount that doesn't double-fetch — your call).

### 2c. `app/(workspace)/platform/admin/` — **leave alone** (different audience)

Platform-level / HQ admin for super_admin role: `today`, `tenants`, `tenants/[id]`, `users`, `billing`, `billing/discount-codes`, `network`, `operations`, `settings` plus a layout. **It has its own custom HQ shell** — does NOT import the prototype shell.

**Verdict:** Out of scope for this migration. Different audience, different chrome, no prototype dependencies. Don't touch.

### 2d. `app/admin/` — **already deprecation shim** (keep)

| Route | Role |
|---|---|
| `/admin/page.tsx` | Tenant resolver — redirects authenticated staff to `/{slug}/admin`. Real production glue, not legacy. |
| `/admin/site-settings/*` (20 files) | **redirects** — call `redirectLegacySiteSettingsToWorkspaceSettings()` and bounce to canonical `/{slug}/admin/...` paths. Each file is 5-10 lines. |

**Verdict:** Already correctly playing a redirect/glue role. **Leave it.** Don't move the tenant-resolver — it's the canonical entry point for `app.tulala.digital/admin`. Eventually delete site-settings/* once 404 logs go quiet.

### 2e. `app/api/admin/` — **leave alone**

17 backend route handlers (`ai/search-debug`, `clients`, `clients/[id]`, `clients/[id]/snapshot`, `dev-revalidate`, `homepage-revision`, `homepage-revision/[id]`, `inquiries`, `inquiries/roster-peek`, `inspector/{booking,cms,inquiry,talent}`, `media/library`, `media/upload`, `places-city-global`, `places-client-location`, `places-client-location-details`, `search`, `translations`, `translations/export`, `users`, `users/global-search`).

**Verdict:** These are real production API endpoints. No prototype imports. Out of scope.

### 2f. `app/(workspace)/[tenantSlug]/talent/` — **IN migration scope** (the second prototype-shell consumer)

Talent self-surface. Layout at `talent/layout.tsx` mirrors the admin layout pattern: server component does auth (`loadTalentSelfProfile` + `agency_talent_roster` membership check) + 7-loader `Promise.all` data pre-fetch, then mounts `TalentShellPrototypePageClient` (same component module as admin, different export). Children are sync-stubs that flip the shell's internal `TalentPage` state.

| Segment | Files | Role | Notes |
|---|---|---|---|
| `/talent` | `layout.tsx` | **layout-with-chrome** — mounts the prototype shell with talent-side bridge data | Imports `_shell-client`, `_data-bridge`, `_state`. Same wedge as `admin/layout.tsx`. |
| `/talent` | `loading.tsx`, `page.tsx` | real entry + skeleton | |
| `/talent` | `_talent-page-route-syncer.tsx` | internal — TalentPageRouteSyncer that calls `useProto().setTalentPage(page)` | Imports `useProto`, `TalentPage` from `_state`. Moves with `_state`. |
| `/talent` | `talent-topbar.tsx` | local UI helper (talent surface secondary nav) | No prototype imports — standalone. |
| `/talent/today` | `page.tsx` | **sync-stub** — `<TalentPageRouteSyncer page="today" />` | URL real, UI in shell. |
| `/talent/inbox` + `/talent/inbox/[id]` | `page.tsx` (each) | **sync-stub** — segment maps to `messages` in `TALENT_SEGMENT_MAP` | |
| `/talent/profile` | `page.tsx` | **sync-stub** | Profile editor is the largest single workflow on the talent surface; lives in `_drawers.tsx` + `_talent_drawers.tsx`. Recent commit `0d18b54c` shipped DB persistence here. |
| `/talent/calendar` | `page.tsx` | **sync-stub** | |
| `/talent/agencies` + `/talent/reach` (alias) | `page.tsx` | **sync-stub** — agency relationships UI; `reach` is a legacy alias mapped to `agencies` in segment map | Recent commit `7edef065` shipped agency-drawer + contact policy + notification prefs here. |
| `/talent/public-page` | `page.tsx` | **sync-stub** — talent's public/Portfolio page editor (Talent Subscriptions feature) | |
| `/talent/settings` | `page.tsx` | **sync-stub** | |
| `/talent/activity` | `page.tsx` | **sync-stub** — recent talent activity log | |

**Verdict:** Migrates in the same wedge cut as tenant admin. The talent layout uses the EXACT same three modules (`_shell-client`, `_data-bridge`, `_state`) — renaming them in lockstep also fixes talent. No talent-specific work needed beyond updating the same 3 import statements in `talent/layout.tsx` and 2 in `_talent-page-route-syncer.tsx`. Hybrid-mode detection (workspace member + talent on roster) cross-cuts both layouts — preserve via §6.

### 2g. `app/(workspace)/[tenantSlug]/client/` — **OUT of scope** (already standalone)

Client self-dashboard. Layout at `client/layout.tsx` is **fully production** — no prototype imports anywhere. Custom two-bar shell (56px identity bar + 52px nav `ClientTopbar`) with its own design system. Auth gate: `loadClientSelfProfile` + relationship-to-tenant check.

| Segment | Files | Role |
|---|---|---|
| `/client` | `layout.tsx` | **layout-with-chrome** — custom production layout, NO prototype imports |
| `/client` | `page.tsx` | **real-page** — client home/today |
| `/client` | `client-topbar.tsx` | local nav UI |
| `/client/today` | `page.tsx` | **real-page** — Today view |
| `/client/discover` | `page.tsx` | **real-page** — talent discovery |
| `/client/inquiries` + `/client/inquiries/new` + `/client/inquiries/[id]` | `page.tsx` | **real-page** — inquiry list, create, detail |
| `/client/bookings` | `page.tsx` | **real-page** — bookings list |
| `/client/shortlists` | `page.tsx` | **real-page** — saved talent shortlists |
| `/client/settings` | `page.tsx` | **real-page** — client account settings |

**Verdict:** Already prototype-clean. **Out of migration scope.** This is a model of what the admin and talent surfaces should look like after the migration completes — real Next.js pages with their own server data, no SPA shell, no `setPage` indirection. May serve as the architectural reference for any post-migration consolidation pass.

> Note: the prototype `_state.tsx` does export a `ClientPage` enum + `setClientPage` + `CLIENT_PAGE_META` — but these are unused by the real client surface. They exist for the shell's internal demo/preview mode (e.g. an agency staffer "previewing" the client view from inside the workspace shell). Real `/client/*` routes do not consult `_state.tsx`.

### 2h. Missing surfaces

None across the 4 user-facing dashboards. Every segment that exists in `admin-preview/` is covered by canonical `[tenantSlug]/admin/`. Talent and client surfaces are complete per the segment lists above. No gap to fill before migration.

---

## 3. Prototype namespace audit — file by file

### 3a. `lib/prototype/` (3 files)

| File | Lines | Classification | Importers | Disposition |
|---|---:|---|---|---|
| `admin-prototype-nav.ts` | 267 | **production-behavior (wedge)** | `components/admin/admin-shell-top-bar.tsx` + internal | **Promote** → `lib/admin/admin-nav.ts`. Rename `ADMIN_PROTOTYPE_NAV` → `ADMIN_NAV`, `ADMIN_PROTOTYPE_BASE` → `ADMIN_NAV_BASE`, etc. |
| `admin-prototype-nav-match.ts` | 42 | **shared-helper (internal)** | Only `components/prototype/admin-prototype-shell.tsx` | **Promote** alongside its consumer when the shell-component renames. Could live at `lib/admin/admin-nav-match.ts`. |
| `admin-prototype-prefs.ts` | 64 | **mock-or-demo** | Only `components/prototype/admin-prototype-shell.tsx` (localStorage prefs for pinned items / shortcuts — prototype-only UI) | **Move to internal** when its consumer moves, OR delete if pin/shortcut customization isn't shipping. |

### 3b. `components/prototype/` (2 files)

| File | Lines | Classification | Importers | Disposition |
|---|---:|---|---|---|
| `admin-prototype-shell.tsx` | 932 | **internal to shell tree** — NOT directly imported by production | Only `_shell-client.tsx` (which IS production-imported) | **Promote** with the shell. Becomes a component inside the new admin shell module. |
| `plan-viewbar.tsx` | 156 | **mock-or-demo** | No callers found | **Stays under `/prototypes/` or delete.** Plan-tier simulator for prototype-only QA. |

### 3c. `app/prototypes/admin-shell/` (the body of the shell — many files)

**Total: ~108,000 lines across ~50 files.** This is huge, but the migration treats it as a single unit because everything inside is reachable only through the 5 wedge modules in §1a.

#### Wedge modules (directly imported by production — these MUST move)

| File | Lines | Role |
|---|---:|---|
| `_shell-client.tsx` | 2,487 | Canonical admin shell component (renders `<AdminShellPrototypePageClient>` and `<TalentShellPrototypePageClient>`) |
| `_state.tsx` | 9,433 | `ProtoProvider`, `useProto`, page enums (`WorkspacePage`, `TalentPage`, `PlatformPage`, `ClientPage`), surface enums, role/plan types |
| `_data-bridge.ts` | 600 | Server-side loaders that re-export from `lib/saas/*` and add admin-shell-specific shaping |
| `_taxonomy-loader.ts` | 260 | `useLiveTaxonomy` hook |
| `page.tsx` | 52 | The `/prototypes/admin-shell/` route entry — orchestrator only; can stay as a demo route OR be deleted |

#### Shell-internal tree (imported only by the wedge modules — these move WITH the wedge)

These are de facto production UI but reachable only through `_shell-client.tsx`. Most are massive. Migration treats them as the **shell's internal body** — they move into the new admin shell module as-is, even if their filenames change.

| File | Lines | Role |
|---|---:|---|
| `_drawers.tsx` | **29,820** | All workspace drawer/modal UI (new-talent, edit-talent, skill-editor, identity, notes…) |
| `_talent.tsx` | 15,308 | Roster page UI (cards, filters, bulk actions) |
| `_messages.tsx` | 14,611 | Inbox UI |
| `_pages.tsx` | 11,800 | Top-level page router/composer for the shell |
| `_primitives.tsx` | 8,805 | Shared UI building blocks (cards, modals, skeletons, `data-tulala-*` selectors) |
| `_talent_drawers.tsx` | 7,553 | Talent-surface drawers |
| `_wave2.tsx` | 4,926 | Phase 5+ feature components |
| `_workspace.tsx` | 4,067 | Workspace settings/admin page UI |
| `_help.tsx` | ~3,180 | In-shell help system |
| `_media-page.tsx` | 2,364 | Workspace Media page |
| `_platform.tsx` | 2,236 | (Stub) platform admin page UI |
| `_pitch-compose.tsx` | ~1,482 | Pitch composition drawer |
| `_phase7-drawers.tsx` | ~686 | Phase 7 drawer scaffolding |
| `_skill-add-search.tsx` | ~709 | Skill search/add form |
| `_skill-overrides-panel.tsx` | ~677 | Per-agency skill override editor |
| `_palette.tsx` | ~579 | Admin design tokens |
| `_dashboard-i18n.ts` | ~557 | Admin shell i18n strings (EN; ES likely lives elsewhere) |
| `_skill-freshness-banner.tsx` | ~531 | Re-verify prompts |
| `_skill-discover-panel.tsx` | ~476 | Skill suggestions |
| `_skill-aspirations.tsx` | ~467 | Career interests UI |
| `_modern-features.tsx` | ~456 | Phase-gated UI scaffold |
| `_skill-slot-panel.tsx` | ~541 | Multi-skill editor |
| `_notifications-hub.tsx` | ~399 | Notifications/toasts |
| `_skill-row.tsx` | ~354 | Skill row UI |
| `_actions.ts` | 309 | Server actions (talent add/update/delete/verify) |
| `_skill-hints-banner.tsx` | ~359 | Booking-history proficiency hints |
| `_skill-verify-dialog.tsx` | ~264 | Skill verification modal |
| `_guided-tour.tsx` | ~248 | Onboarding tour UI |
| `_profile-store.ts` | ~230 | Client-side talent-profile store |
| `_skill-proficiency.tsx` | ~208 | Proficiency picker |
| `_metrics-ribbon.tsx` | ~185 | Trust-metrics ribbon |
| `_admin-tour.tsx` | ~72 | Tour config |
| `_skill-helpers.ts` | ~65 | Pure skill utility functions |
| `_skill-tokens.ts` | ~58 | Local design tokens for skill UI |
| `_field-catalog.ts` | ~944 | Master catalog of admin-editable fields |
| `_csv-parser.ts` | ~126 | CSV import/export logic |
| `_skill-helpers.test.ts` | ~111 | Test file — likely promote with helpers |
| `_csv-parser.test.ts` | ~125 | Test file — likely promote with parser |

**Disposition for the shell-internal tree:** moves as one unit with `_shell-client.tsx`. The classification "production-behavior" applies transitively — these files render real data, call real actions, and are the live admin UI. But because they're reached only through the wedge, the migration doesn't need to rewrite their internal imports — just move them en bloc.

> **Sanity flag:** `_drawers.tsx` at 29,820 lines, `_pages.tsx` at 11,800, `_state.tsx` at 9,433 — these are monolithic files. They MUST be moved together to preserve functionality, but they're refactor candidates AFTER the migration. The manifest captures this as "Phase 2 / refactor" work, not part of the wedge cut.

#### Talent profile subtree

| File | Lines | Role | Disposition |
|---|---:|---|---|
| `app/prototypes/admin-shell/talent/profile/edit/page.tsx` | ~26 | URL-compat shim that redirects to the SPA query-based URL | **Mock/demo** — keep under prototypes or delete with the route. |

### 3d. `app/prototypes/` other subtrees (truly mock/demo — keep as-is)

| Subtree | Files | Role | Disposition |
|---|---|---|---|
| `app/prototypes/audit-phase-e/page.tsx` | 1 file, ~450 lines | Phase E visual audit, noindex'd, side-by-side section gallery | **Stays under `/prototypes/`.** Delete after Phase E closes. |
| `app/prototypes/drawer-preview/page.tsx` | 1 file, ~1,093 lines | Drawer/storybook showcase | **Stays under `/prototypes/`.** Move to a Storybook setup eventually, but not part of this migration. |

**Confirmed:** zero production importers for either subtree.

---

## 4. Git history review — what's at risk

Working tree is **clean** as of capture. Last 30+ admin-related commits below — note how nearly every recent change touches BOTH a `[tenantSlug]/admin/*` file AND a `prototypes/admin-shell/_*` file. **This means the migration window is sensitive: any in-flight branch from background agents could conflict.**

### 4a. Last 30 admin-relevant commits

| SHA | Message | Files touched (relevant) | Risk if migration runs |
|---|---|---|---|
| `6ef7f2ce` | admin/: self-edit saveAll persists albums and document metadata | `_drawers.tsx` | LOW — single file edit |
| `0d18b54c` | admin/: profile shell DB wrap-up | 12 files: `admin/_real-identity-banner.tsx`, `_admin-tour.tsx`, `_dashboard-i18n.ts`, `_drawers.tsx`, `_notifications-hub.tsx`, `_pages.tsx`, `_primitives.tsx`, `_shell-client.tsx`, `_skill-*`, `_state.tsx` | **HIGH** — touches 4 of 5 wedge modules |
| `c616003f` | feat(edit-chrome): P7A-3/4 test coverage | edit-chrome only | none |
| `fd3c3d73` | feat(edit-chrome): P7A-3 shared sibling drag index | edit-chrome only | none |
| `096bc784` | feat(edit-chrome): workspace Website links, admin shell tabs | `_pages.tsx`, `_state.tsx` | **MEDIUM** |
| `3dab7fb8` | admin: legacy content/posts/[id] redirects to workspace Website | redirect page only | LOW |
| `5e28e8ff` | admin: expand legacy site-settings redirects | 9 redirect pages | LOW |
| `9fc1b3e2` | admin: legacy identity/design redirects + account settings link | account + redirect pages | LOW |
| `145abaf9` | all updates before page builder massive update | `_pages.tsx`, `_wave2.tsx`, `_workspace.tsx` | MEDIUM |
| `c1c4b3bc` | page builder | `admin-command-palette.tsx` | LOW |
| `f4f1f8d5` | page builder work | `admin/layout.tsx`, `_data-bridge.ts`, `_pages.tsx`, `_state.tsx` | **HIGH** — touches admin layout + 3 wedge modules |
| `7ce7c0cf` | late morning updates | `_pages.tsx`, `_primitives.tsx`, `_skill-discovery-panel.tsx` | MEDIUM |
| `9a856425` | feat(i18n): wire EN/ES across admin canonical pages + locale middleware fix | 12+ files across canonical admin AND `_data-bridge.ts`, `_drawers.tsx`, `_pages.tsx`, etc. | **HIGH** — wide cross-cutting change |
| `7edef065` | feat(talent): wire agency drawer, contact policy, notification prefs | `admin/_pipeline-actions.ts`, `admin/layout.tsx`, `_data-bridge.ts`, `_drawers.tsx`, `_state.tsx` and others | **HIGH** |
| `4eeff71c` | fix(drawers): section-gate category fields | `_drawers.tsx`, `_primitives.tsx` | MEDIUM |
| `9e957a2d` | fix(drawers): media section bleed, album count flash | `_drawers.tsx`, `_media-page.tsx` | LOW |
| `319ec842` | feat(gallery+profile): compact gallery cards, cover rename | `roster/[id]/TalentEditForm.tsx`, `_drawers.tsx`, `_talent.tsx` | MEDIUM |
| `8244a5a2` | feat: strip lying buttons, fix unread fallback | 6 canonical admin files + `_actions.ts`, `_csv-parser.ts`, `_data-bridge.ts`, `_drawers.tsx`, `_pages.tsx`, `_pitch-compose.tsx` | **HIGH** |
| `5515564f` | refactor(pitches): integrate Pitches surface into prototype shell | `_pages.tsx`, `_state.tsx`, pitch-compose | MEDIUM |
| `1a9c6944` | feat(admin/media): wire real media_assets data bridge | `_data-bridge.ts`, `_media-page.tsx` | MEDIUM |
| `d0e9d855`, `165de48f`, `69d4b42d`, `cecefcf5` | merges from `claude/...` branches | varies | **agent work in flight** |

### 4b. Recent agent worktrees (parallel work in progress)

The orientation `find` surfaced 4 active worktrees:
- `.claude/worktrees/agent-a7910dac6cc963a2c/`
- `.claude/worktrees/agent-ad44e4fcdcd06b769/`
- `.claude/worktrees/competent-kapitsa-cb86e8/`
- `.claude/worktrees/great-ptolemy-1747d5/`

Each is a full clone with its own admin tree. **Before migration: drain these or confirm they don't have un-merged admin changes.** Otherwise a worktree's pending PR could land on files that no longer exist at the old paths.

### 4c. At-risk recent improvements (must be preserved)

The most recent improvements all live inside the prototype namespace:

1. **Profile shell DB wrap-up** (`0d18b54c`, 2026-05-10): home country, tier policies, taxonomy, workflow, dynamic fields. Cross-cut: `_state.tsx`, `_drawers.tsx`, `_pages.tsx`, `_shell-client.tsx`.
2. **Self-edit saveAll album persistence** (`6ef7f2ce`, today): persist albums + document metadata. In `_drawers.tsx`.
3. **i18n EN/ES wiring** (`9a856425`): admin canonical pages + locale middleware. Cross-cut across `_data-bridge.ts`, `_drawers.tsx`, `_pages.tsx`, plus canonical pages.
4. **Pitches surface integration** (`5515564f`): pitches now live in the shell.
5. **Real media_assets data bridge** (`1a9c6944`): `_data-bridge.ts` + `_media-page.tsx`.
6. **Agency drawer / contact policy / notification prefs** (`7edef065`): talent settings.
7. **Workflow pipe, completeness dial, talent edit form** (`319ec842`, `8244a5a2`): roster `[id]` detail page improvements.

**Preservation strategy:** the migration cannot be a "delete prototype and rebuild" — it must be a **rename-in-place + import rewrite**. Every line of working code stays; only paths and import specifiers change.

---

## 5. Promotion mapping (proposal — not yet executed)

The minimal cut to remove the `prototype` namespace from production dependencies.

### 5a. Move plan (filename → ownership)

| Current path (prototype) | Proposed canonical path | Rename symbols |
|---|---|---|
| `app/prototypes/admin-shell/_shell-client.tsx` | `components/admin/shell/admin-shell-client.tsx` (or `lib/admin/shell/shell-client.tsx`) | `AdminShellPrototypePageClient` → `AdminShellClient`; `TalentShellPrototypePageClient` → `TalentShellClient` |
| `app/prototypes/admin-shell/_state.tsx` | `lib/admin/shell/state.tsx` | `ProtoProvider` → `AdminShellProvider`; `useProto` → `useAdminShell`; type names keep their canonical-sounding forms (`WorkspacePage`, `TalentPage`) |
| `app/prototypes/admin-shell/_data-bridge.ts` | `lib/admin/shell/data-bridge.ts` | Function names stay (`loadInquiriesForMessages`, etc.) |
| `app/prototypes/admin-shell/_taxonomy-loader.ts` | `lib/admin/shell/use-taxonomy.ts` | `useLiveTaxonomy` keeps name |
| `lib/prototype/admin-prototype-nav.ts` | `lib/admin/admin-nav.ts` | `ADMIN_PROTOTYPE_NAV` → `ADMIN_NAV`; `ADMIN_PROTOTYPE_BASE` → `ADMIN_NAV_BASE`; `prototypeNavItemStableId` → `adminNavItemStableId`; `flattenPrototypeNavWithOrder` → `flattenAdminNavWithOrder`; `prototypeNavItemMap` → `adminNavItemMap` |
| `lib/prototype/admin-prototype-nav-match.ts` | `lib/admin/admin-nav-match.ts` | `prototypeNavPath` → `adminNavPath`; `isPrototypeNavActive` → `isAdminNavActive` |
| `lib/prototype/admin-prototype-prefs.ts` | `lib/admin/shell/prefs.ts` (or delete if unused going forward) | constants stay |
| `components/prototype/admin-prototype-shell.tsx` | `components/admin/shell/admin-shell.tsx` | `AdminPrototypeShell` → `AdminShell` |
| `app/prototypes/admin-shell/_drawers.tsx` + `_talent_drawers.tsx` + all other internal files | `components/admin/shell/internal/` (or similar) | Names stay; file paths change |

The exact target folder layout (`lib/admin/shell/` vs `components/admin/shell/internal/`) is a design choice for the follow-up plan — what matters for the manifest is that **nothing carries the word `prototype` in its name after migration**.

### 5b. Import rewrite plan (10 files)

Same 10 importers listed in §1b. Each gets its import paths updated to the new canonical locations, and (for the type imports) updated symbol names if any were renamed. No functional logic changes in any importer.

### 5c. The prototypes/ tree after migration

After the move, `app/prototypes/` contains only:
- `audit-phase-e/page.tsx` — Phase E visual audit
- `drawer-preview/page.tsx` — drawer storybook
- (optionally) `admin-shell/page.tsx` if you want to keep `/prototypes/admin-shell/` as a live demo of the shell — but it'd need its own import path to the canonical shell now, OR delete the route entirely.

`components/prototype/plan-viewbar.tsx` can stay if it's still useful as a plan-tier QA tool, or be deleted.

### 5d. Migration is NOT

- **Not a refactor of `_drawers.tsx` / `_pages.tsx` / `_state.tsx` internals.** Those are gigantic; touching them mid-migration would shred preservation. They move as-is. Internal refactor is Phase 2 (separate plan).
- **Not a replacement of `PageRouteSyncer` with native Next.js navigation.** The shell's internal SPA-state model is its current contract. Migrating off it is a separate, larger lift.
- **Not a teardown of `admin-preview/`.** That comes AFTER the canonical home is stable — recommend as a final cleanup commit, not a wedge step.

---

## 6. Preservation audit — what we must not break

A pre-flight checklist for the implementation plan:

- [ ] **`AdminShellPrototypePageClient` initial-page derivation** (`admin/layout.tsx:96`, `deriveInitialPage`) — preserves no-flash hard refresh. Must still work after rename.
- [ ] **Hybrid mode detection** (`admin/layout.tsx:142-153`) — `isHybrid` triggers talent-side pre-fetches only for admins who are also rostered. Touches `loadTalentSelfProfile`, `loadTalentInquiries`, `loadTalentUnreadCount`, `loadUserPrefs`. All must still resolve.
- [ ] **`getTenantPortalScopeBySlug` fallback** (`admin/layout.tsx:73-86`) — "Workspace not available" screen for pure-talent users on a tenant they're rostered on. Must not regress.
- [ ] **`RealIdentityBanner`** (`admin/layout.tsx:167-171`) — currently sits above the prototype chrome as a stopgap. Comment says "replacement plan." Note for future cleanup; preserve current behavior in migration.
- [ ] **14-loader `Promise.all`** (`admin/layout.tsx:101-134`) — must remain a single network wave; don't accidentally serialize.
- [ ] **`PageRouteSyncer` setPage contract** (`_page-route-syncer.tsx`) — relies on `useProto().setPage` updating without `router.push`. Preserve through the `useProto` → `useAdminShell` rename.
- [ ] **Server actions in `_actions.ts`** (309 lines) — talent add/update/delete/verify. Wire-tested at multiple commits. Don't break server action contracts.
- [ ] **`_data-bridge.ts` re-exports** — 14 named loaders; importers in `admin/layout.tsx` and `talent/layout.tsx` rely on exact names. Either rename all importers in lockstep, or keep export names.
- [ ] **Taxonomy live-subscription** in `_taxonomy-loader.ts` — Supabase realtime subscription. Don't break the subscription wiring.
- [ ] **Nav label resolution** in `admin-shell-top-bar.tsx` — uses `ADMIN_NAV_LABEL_BY_SEGMENT` for breadcrumbs/title. Must continue to resolve correctly for all segments.
- [ ] **Talent surface parity** — `talent/layout.tsx` mirrors `admin/layout.tsx` and uses `TalentShellPrototypePageClient`. Both branches of the rename must move together.
- [ ] **`admin-preview/page.tsx`** — once `_shell-client` and `_data-bridge` are renamed, this file's imports break. Rewrite it OR delete it in the same commit.
- [ ] **Worktrees** (`.claude/worktrees/agent-*`) — drain or merge any in-flight admin changes before renaming, otherwise their merges will fail spectacularly.
- [ ] **`_dashboard-i18n.ts` keys** — strings keyed by stable IDs. Preserve key names through any move; the EN/ES locale wiring (`9a856425`) depends on them.
- [ ] **Self-edit album persistence** (`6ef7f2ce`, today's commit) — preserve `_drawers.tsx` byte-for-byte through the move.
- [ ] **Roster `[id]` detail page** (`/admin/roster/[id]`, recently completed in `0d18b54c`) — already a real Next.js page, NOT inside the shell. Not affected by the wedge cut, but make sure no shared component gets accidentally re-pointed.
- [ ] **Service worker scope** referenced inside `_shell-client.tsx` (per Agent B note) — if it pins to `/prototypes/admin-shell/`, the URL doesn't change as long as the route file stays. If the route file is deleted, audit the SW registration.

---

## 7. Open questions (must answer before implementation)

1. **Target folder layout for the promoted shell.** Two options:
   - (A) `components/admin/shell/` for everything (UI + state + bridge + nav)
   - (B) Split: `lib/admin/shell/` for state + bridge + hooks; `components/admin/shell/` for UI; `lib/admin/admin-nav.ts` for nav data
   - Convention in the codebase (`components/admin/` vs `lib/admin/`) suggests (B). Pick one before starting.

2. **Symbol renaming aggressiveness.** Two options:
   - (A) Keep all exported names (`AdminShellPrototypePageClient`, `useProto`, etc.) — minimal diff, but the word "prototype" survives in symbols
   - (B) Full rename — consistent canonical names, but every callsite updates
   - Recommend (B) for cleanliness, since the importer list is small (10 files).

3. **`admin-preview/` disposition.** Three options:
   - (A) Delete in the same migration commit (cleanest)
   - (B) Update its imports to canonical and keep as a QA mount
   - (C) Replace with a single thin smoke-test page
   - Recommend (A) — it's redundant once canonical absorbs the role.

4. **`/prototypes/admin-shell/` route disposition.** Either delete the route or keep as a live demo of the canonical shell. Probably delete unless someone is using it.

5. **Worktree drainage.** Are the 4 `.claude/worktrees/` agent worktrees still active, abandoned, or already merged? Manifest can't tell — needs an operator check.

6. **Big-file refactor scheduling.** `_drawers.tsx` at 29,820 lines is unmaintainable. Migration moves it intact; a Phase 2 plan needs to break it up. Out of scope here but flag for the roadmap.

---

## 8. Suggested commit/PR shape (for the follow-up implementation plan)

This is NOT a plan to execute now — just an outline for the implementation-phase document.

1. **Pre-flight commit:** drain worktrees, confirm clean tree, ensure CI is green.
2. **Move commit (1 of 2):** `git mv` the 5 wedge modules + their internal tree into canonical paths. NO other edits. This commit will leave the codebase broken (imports point at old paths). Mark as `[migration]` not `[fix]`.
3. **Rewrite commit (2 of 2):** update the 10 importer files. Update any internal cross-references inside the moved tree. Rebuild green.
4. **Cleanup commit:** delete `admin-preview/page.tsx`. Update README/CLAUDE.md mentions of `prototypes/admin-shell`. Update `lib/talent/profile-shell-taxonomy-sync.ts` JSDoc and the two other comments referencing "prototype."
5. **Optional commit:** delete `/prototypes/admin-shell/` route file if unused; trim `components/prototype/plan-viewbar.tsx` if confirmed unused.

Two commits is the right wedge cut. Don't combine.

---

## 9. Inventory cross-references

For future readers — where the source numbers came from in this manifest:

- File line counts: `wc -l` direct on each file (§3a, §3c).
- Production importer list: `grep -rn "from .@/app/prototypes\|from .@/components/prototype\|from .@/lib/prototype" web/src` excluding self-imports.
- Route classification: `find` per tree + `head` of each `page.tsx`/`layout.tsx`.
- Commit risk table: `git log --oneline --name-only -- <admin paths>`.
- Working tree status: `git status --short` at start of session (clean).

---

*End of manifest. Implementation plan is a separate document.*
