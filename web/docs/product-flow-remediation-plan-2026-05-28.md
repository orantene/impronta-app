# Product-flow Remediation Plan — 2026-05-28

Tulala SaaS, written after an end-to-end browser audit of Platform Admin → Workspace Owner → Public Storefront → Client → Talent, exercising every nav surface against a brand-new Free-tier workspace (`hotels-express-lavanderia`, owner `orantene@gmail.com`) and against the established Agency workspace (`impronta`).

The audit found **27 distinct issues across 6 surfaces**. Roughly half are visible-but-cosmetic (fixture-data leaks); the other half block the agency-owner activation arc. Most of the wiring underneath is there — what's missing is the **last-mile binding of admin-shell internal state to the real workspace record**, plus a **default storefront homepage** and a **fix to the talent-draft persistence race**.

This plan is sequenced so each step unblocks the next. Phase 0 is a hard gate.

---

## 0  Baseline reality check — what works today

These were verified working in the audit and do NOT need rework. They are listed here so we don't accidentally regress them.

- [W1] Platform Admin → Tenants list (filters, badges, override chip, no-owner red)
- [W2] Platform Admin → + New workspace modal (Agency or Hub, owner email pre-assigns membership in one shot, drawer auto-opens)
- [W3] Platform Admin → Manage drawer (every section that was listed in QA #15: Summary, Links, Owner & billing, Members & roles, Plan override + history, Commission override, Domains, Settings & danger zone, Language & localization, Analytics, System & audit)
- [W4] Platform Admin → Domain management (add subdomain/custom, set primary, remove non-primary, auto-detect Tulala host, inline mismatch warning, refresh in-place)
- [W5] Platform Admin → Plan override apply/remove with audit history row, in-place drawer refresh, Summary chips, list-page filter dot
- [W6] Platform Admin → Settings/Status freeze + activate, slug-confirmation cancel-workspace
- [W7] Platform Admin → Assign owner by email, add staff, inline role-change with optimistic UI
- [W8] Middleware host resolution — `<slug>.tulala.digital` hits `agency_domains`, rewrites to internal tenant route, branded 404 fires correctly
- [W9] Workspace creation actually provisions a usable agency row + an owner membership for an existing Tulala account
- [W10] Workspace Settings tab (`/admin/settings`) — Account / Workspace / Domain / Branding / Media & watermark sections are wired to real workspace data
- [W11] Workspace creation, plan-override + status-change in-place refresh (REFRESHING… header chip)
- [W12] Auth gating — orantene logged in cannot access `/[other-tenant]/client` (gets branded 404)

---

## 1  Issues found, severity-tagged

Each row has a stable code (use it in commit messages). Severity legend:
**P0** = blocks owner from completing first booking. **P1** = visible falsehood that erodes trust. **P2** = polish/UX.

| # | Code | Severity | Surface | Issue |
|---|---|---|---|---|
| 1 | F1 | **P0** | Workspace admin | The admin shell at `web/src/components/admin/shell/internal/` runs on a **fixture/prototype state machine** with `PROTO_TENANT_ID = "tenant.acme-models"` and `acme-models.com` literals leaked across ~30 surfaces. Bookings, performance counts, calendar entries, storefront URL hint, top-performer tables, "SS27 capsule" copy — all are mock state, ignoring the real workspace the user is in. |
| 2 | F2 | **P0** | Workspace admin → Website | "Live URL" reads `https://acme-models.tulala.digital` for every workspace. The "+ Add page" button opens a tab at that hostname and 404s. The page-builder data layer is a fixture, not wired to a real `workspace_pages` table. |
| 3 | F3 | **P0** | Public storefront | `src/app/(workspace)/[tenantSlug]/page.tsx` does **not exist**. A workspace with no published pages shows the branded "Page not found" at its custom domain — no default landing page, no roster grid, no "Coming soon" surface. |
| 4 | F4 | **P0** | Roster | Add-talent draft is silently dropped when the editor drawer is dismissed (X / Escape / click-outside / "Save & exit") while validation is still pending. Two attempts to add a talent both lost the work and left the roster empty, with no recovery affordance and no toast. |
| 5 | F5 | **P0** | Workspace admin → Roster | Roster nav-tab **badge count is fixture-derived** (showed "2" while page body said 0 talent and the editor really hadn't persisted anything). |
| 6 | F6 | **P0** | Workspace admin → Messages | `/admin/messages` renders a **completely blank body** for the new workspace. No header, no empty state, no error toast. |
| 7 | F7 | **P0** | Workspace admin → Calendar | Shows 7 fixture bookings (Mango — Spring lookbook, Vogue Italia editorial, Bvlgari jewelry campaign, Estudio Roca brand gala…) on a workspace with zero real bookings. Counters claim "Confirmed 3 · In progress 4". |
| 8 | F8 | **P0** | Workspace admin → Overview | "Storefront page · Lives at acme-models.tulala.app" line on the activation arc — wrong domain in every workspace. |
| 9 | F9 | **P0** | Workspace admin → Overview | Activation arc step 3 (Copy your storefront link) and step 2 (Publish a profile) cannot be completed because step 1 (Add your first talent) is itself broken (see F4) and there is no real page to publish (F2/F3). |
| 10 | F10 | **P1** | Workspace admin (new) → Website | Performance row reads **VISITS 4,730 (+14%), INQUIRIES 23 (+27.8%), BOOKINGS 6, BOOKING REVENUE €14,500 (+32.7%)** for a workspace created today. |
| 11 | F11 | **P1** | Workspace admin → Website | TOP PERFORMERS table shows four rows with mock visit/inquiry/conversion data on a workspace with zero pages. |
| 12 | F12 | **P1** | Workspace admin → Website | "Casting open for the SS27 capsule — apply by May 30" banner is hard-coded fixture copy. |
| 13 | F13 | **P1** | Workspace admin → Pitches | Clicking Pitches tab does not navigate; URL stays on the previous tab. Tab is wired in nav but not in routing. |
| 14 | F14 | **P0** | Talent editor | Multi-step validation cascade ("Pick a primary talent type" → "Enter a home base") shows one error at a time without an obvious "what's missing" checklist. Combined with F4 this is the single biggest reason a new agency can't get its first talent live. |
| 15 | F15 | **P1** | Workspace admin → Roster | After picking "Concierge Host" the toolbar chip jumps from "Add 5 to publish" to "Add 4 to publish" but the red banner still says "Pick a primary talent type to continue" — stale validation message. |
| 16 | F16 | **P1** | Workspace admin → Roster (entire) | Talent profile editor is heavily oriented to **fashion / performer / DJ / chef** taxonomies. There is no real fit for service businesses (hotel, restaurant, cleaning, retail). For a "Hotels Express Lavanderia" the user has to bolt onto "Concierge Host" which is misleading. |
| 17 | F17 | **P1** | Workspace admin (new) → Overview | Workspaces that have NEVER had data show "What works right now" panel with "Public roster · Searchable across the Tulala network · **3 / 5 talent**" — fake. |
| 18 | F18 | **P1** | Workspace admin → Overview | "Set your workspace domain — Configure" button on the activation arc opens the Domain Drawer that is **gated by `meetsPlan(state.plan, "studio")`**. So on Free the activation step exists but isn't completable from the owner side — only Platform Admin can register the domain today. The CTA copy doesn't communicate that. |
| 19 | F19 | **P2** | Workspace switcher | Visiting `/[tenant]/talent` while signed in as the owner of a *different* workspace silently redirects to the user's primary workspace and shows the Agency-tier "4 things unlocked" celebration modal. Confusing — the user typed a URL for workspace A and got dropped into workspace B with a celebration. |
| 20 | F20 | **P2** | Workspace admin → Client surface | `/[tenant]/client` for the workspace owner returns a generic "Page not found" instead of "You're the owner here — open the admin dashboard" or "No client membership for this workspace yet." |
| 21 | F21 | **P2** | Workspace admin → Notifications | Bell icon shows "7" pending across workspaces, regardless of which workspace the user is currently in. Looks like cross-tenant notification count bleed. |
| 22 | F22 | **P2** | Workspace admin → Activation arc | "Walk through a demo inquiry · Auto-detected — already done" is checked off without the user ever doing it — gives a false sense of progress. |
| 23 | F23 | **P2** | Workspace admin → top header | Top bar shows `· LIVE` chip + tenant name + plan chip + email + counters — but counters appear to mix fixture and real data depending on the workspace ("0 open inquiries" for Hotels Express was real; the bell "7" was not). |
| 24 | F24 | **P1** | Workspace admin → Roster nav-tab | Nav-tab counter (`Roster 2`) and page body counter (`0 talent`) disagree at the same time. The two should read from the same source. |
| 25 | F25 | **P2** | Platform Admin → Manage drawer | On override remove, the list-page first-row plan-column dot persists briefly until next route navigation. Already partially fixed by the REFRESHING transition wrapper, but a row-level optimistic update would close the last ~300 ms gap. |
| 26 | F26 | **P2** | Workspace admin → Settings → "Want to take bookings yourself?" card | Owner gets "Create your talent page — becomes visible on your workspace roster." This is the workspace-talent hybrid CTA (canonical per `project_workspace_talent_hybrid.md`) — the flow is referenced but not yet QA'd end-to-end. Listed for tracking, not yet broken. |
| 27 | F27 | **P0** | Public storefront / Discover bridge | Even after a custom domain is connected and verified via Platform Admin, the workspace has no content to serve — no homepage, no roster page, no inquiry form. So the "domain test" (the very thing the user wants to do today) cannot complete. Connecting `hotels-express.tulala.digital` lands on the branded 404. |

---

## 2  Phased plan

### Phase A — Default storefront (unblocks the domain test)
**Goal:** every workspace with a registered domain serves *something* the moment a domain points at it.

1. **A1 — Create `src/app/(workspace)/[tenantSlug]/page.tsx`** that renders a Tulala-default homepage built from real workspace data:
   - Workspace display name as the hero title
   - 1-line tagline from `agencies.settings.tagline` (default copy if blank)
   - Roster grid (published talents only; "No talent yet — coming soon" if empty)
   - Single "Get in touch" inquiry CTA → existing `submitInquiry` path
2. **A2 — Reserve a workspace subdomain at creation time.** Inside `actionCreateTenant`, automatically insert an `agency_domains` row with `kind='subdomain'`, `hostname='<slug>.tulala.digital'`, `is_primary=true`. The platform admin Domains section can still demote / replace it.
3. **A3 — Storefront branding tokens.** Read `agencies.settings.branding` (logo, primary color, font family) and apply to the public homepage. Default Tulala neutral when blank.
4. **A4 — Acceptance test.** After creating a fresh workspace, hitting its assigned subdomain renders a styled homepage. Custom domains routed via DNS land on the same homepage.

*Effort: 1–2 days. Touches `(workspace)/[tenantSlug]/`, `actions-control.ts`, `tenant-management-data.ts`.*

### Phase B — De-fixture the admin shell (kills F1, F2, F7, F8, F10, F11, F12, F17, F22, F23)
**Goal:** the agency-owner dashboard reads from the real workspace.

1. **B1 — Replace `PROTO_TENANT_ID`** in `components/admin/shell/internal/field-catalog.ts` and every consumer. Pipe `effectiveTenant.id` down from the workspace layout to every panel via the existing `useAdminShell()` context.
2. **B2 — Replace the `WEBSITE_STATE` fixture object** with a real loader that reads `agency_domains` (for the LIVE URL), `workspace_pages` (for live/draft/scheduled counts — needs new table; see Phase C), and `agency_analytics_aggregates` (for VISITS/INQUIRIES/BOOKINGS/REVENUE — needs new view, OR show zeros until analytics ship).
3. **B3 — Replace the `MOCK_BOOKINGS` calendar fixture** with `inquiry_bookings` reads scoped to `tenant_id`.
4. **B4 — Replace the `TOP_PERFORMERS` table** with real per-page analytics OR hide the panel when there is no data ("Top pages will appear once you have visits.").
5. **B5 — Remove fixture banners** ("SS27 capsule", etc.). Render none, or render workspace-defined announcements only.
6. **B6 — Wire the Overview activation arc** to read **real** completion state:
   - Add-talent step: `talent_profiles.count > 0`
   - Publish-profile step: `talent_profiles.count_where(status='published') > 0`
   - Storefront-link step: `agency_domains.count > 0`
   - Demo-inquiry step: track via a `setting.activation_arc.demo_inquiry_done` boolean — only flip after a real demo flow completes (F22 fix)
   - Invite-teammate step: `agency_memberships.count > 1`
7. **B7 — Fix the Roster nav-tab badge** to read from the same query as the page body (F5, F24).
8. **B8 — Fix the bell badge** to scope notifications to current workspace, with a separate "all workspaces" affordance if needed (F21).

*Effort: 3–5 days. Touches `components/admin/shell/internal/*`, layout loaders, and adds 1–2 small Supabase views.*

### Phase C — Page builder backend (unblocks F2, F3 once paired with A1)
**Goal:** owners can actually publish pages.

1. **C1 — Schema migration `workspace_pages`** (`id, tenant_id, slug, title, status: draft|scheduled|published, blocks jsonb, theme jsonb, published_at, created_by, updated_at`). RLS: members read/write within their tenant.
2. **C2 — Schema migration `workspace_page_revisions`** for autosaved drafts and rollback.
3. **C3 — Server actions** `createPage / updatePageBlocks / publishPage / unpublishPage / deletePage / schedulePage`, all under `tenant_id` membership gating.
4. **C4 — Public route `[tenantSlug]/p/[[...slug]]`** (the rewrite target already exists per middleware §326). Renders blocks from the `workspace_pages` row.
5. **C5 — Builder UI in admin shell.** Stripped-down: hero, text, image, gallery, roster, CTA blocks. White-bg/blue-fonts is a 2-input setting in the theme panel — meets the user's day-1 ask without a full block editor.
6. **C6 — Publish → live within 1 second.** Server action sets `status='published'` and `revalidatePath` the public route.

*Effort: 4–6 days. Brings the user's end-to-end "build a page → publish → visit on custom domain" loop online.*

### Phase D — Roster persistence + talent editor UX (kills F4, F5, F14, F15, F16, F24)
**Goal:** talent never silently lost; owners can publish a real first talent in under 2 minutes.

1. **D1 — Persist on every blur.** Talent editor saves a `draft` row to `talent_profiles` on first keystroke. Closing the drawer never loses work; user always sees an empty-state ghost row in the roster they can finish later.
2. **D2 — Replace the cascade validation** with a single "What's left to publish" checklist panel at the top of the editor: Name, Talent type, Home base, At least 1 photo → each ticks off as done. "Publish" button enables only when all 4 green; otherwise saves as draft on close (D1).
3. **D3 — Talent-type taxonomy for service businesses.** Add a top-level category alongside Models / Hosts / Performers / Music / Wellness / Photo&Video / Creators called **"Services"** (hospitality, cleaning, transport, security, catering, retail, technical). Generic enough for Hotels Express Lavanderia, restaurants, transport providers, etc.
4. **D4 — Roster nav-tab badge and page body counts** read from the same `talent_profiles where tenant_id = current` query, scoped server-side.
5. **D5 — Save & exit semantics.** Always save (D1). The button label should be "Save draft & exit"; the publish CTA is the separate primary action.

*Effort: 3–4 days. The single highest-impact change for new-workspace activation.*

### Phase E — Tab-by-tab wiring (kills F6, F13, F18, F19, F20)
**Goal:** every nav-tab loads a real surface for the real workspace, not a fixture.

1. **E1 — Messages.** Render real `inquiry_threads where tenant_id`. Empty state: "No messages yet — they'll appear here as clients reach out via your storefront."
2. **E2 — Pitches.** Wire the route (URL was not changing — see F13). Use existing `inquiry_pitches` table.
3. **E3 — Operations / Production.** Audit current empty-state behavior; replicate the same de-fixturing pattern.
4. **E4 — Domain Drawer gating.** Drop the `meetsPlan(state.plan, "studio")` gate for the "Tulala subdomain" view (every workspace can see/copy their subdomain). Keep custom-domain entry gated on Studio+. Update activation-arc copy to say "Your storefront lives at `<slug>.tulala.digital`. Want a branded domain? Upgrade to Studio." (F18).
5. **E5 — `/[tenant]/talent` redirect.** If user is owner of the workspace, redirect to `/[tenant]/admin/roster` not to a different workspace. If user has no talent profile here, show "Create your talent profile here" CTA (already designed per `project_workspace_talent_hybrid.md`). Never silently switch workspaces (F19).
6. **E6 — `/[tenant]/client` for non-clients.** Render "You don't have a client account on this workspace. [Sign in as a client] · [Open admin dashboard]." instead of branded 404 (F20).

*Effort: 4–6 days, parallelizable across surfaces.*

### Phase F — Polish (kills F25, F26)
1. **F1-polish — Row-level optimistic update** for plan-override remove (close the 300ms list-row dot gap).
2. **F2-polish — End-to-end QA the workspace-talent hybrid flow** (the "Create your talent page" CTA in Settings → real talent provisioned + visible on workspace roster).

*Effort: 1–2 days.*

---

## 3  Acceptance test for the user's day-1 ask

After Phases A + C + D land, the following must all pass for a fresh workspace:

1. Owner creates workspace "Hotels Express Lavanderia" through Platform Admin → workspace exists with `hotels-express-lavanderia.tulala.digital` subdomain pre-registered (A2).
2. Owner visits `hotels-express-lavanderia.tulala.digital` → sees the default workspace homepage with workspace name, "No talent yet — coming soon" hero (A1).
3. Owner adds Maria Hernandez as Concierge Host → roster shows 1 (D1) → publish → talent appears on the public roster grid.
4. Owner opens Website tab → real "LIVE URL" reads `hotels-express-lavanderia.tulala.digital`. VISITS/INQUIRIES/BOOKINGS all `0` with helper copy (B2, B4).
5. Owner clicks "+ Add page" → builder opens for a new page on THIS workspace. Sets white background + blue fonts (C5). Publishes (C6). The published page is reachable at `hotels-express-lavanderia.tulala.digital/p/<slug>`.
6. Owner switches their DNS panel to point `hotels.tulala.app` at Vercel → existing platform-admin domain controls (W4) verify it → public storefront and the published page both serve at the new host.
7. Owner returns the next day, opens the workspace → all data reflects yesterday's actions; no fixture numbers visible anywhere.

---

## 4  Out-of-scope (intentionally deferred)

- Phase 8 (Stripe live-money testing) — already deferred per `pending_stripe_live_money_testing.md`.
- Phase X (Workspace × Talent hybrid mode full UI) — design exists per `project_workspace_talent_hybrid.md`; F26 is a single targeted polish, not the full feature.
- Discover surface end-to-end (`project_discover_unified.md` binding) — that is its own slice plan and intersects with C5 (roster block) only.
- Replacing the talent-editor's 15 sections with a leaner default. The current editor is opinionated for talent-agency workflows; service-business pivots are addressed by D3 (a new taxonomy) not a rewrite of the editor.

---

## 5  Suggested commit / branch plan

One branch per phase. Each commit references the F-codes it closes:

```
phase-a-default-storefront/
  feat(storefront): default homepage at /[tenantSlug]  [closes F3]
  feat(tenants): auto-provision <slug>.tulala.digital  [closes F27 setup]
  …

phase-b-defixture-shell/
  refactor(admin-shell): replace PROTO_TENANT_ID with effective tenant  [closes F1, F2 url, F8]
  refactor(admin-shell): replace WEBSITE_STATE with real loader  [closes F10, F11, F12, F17]
  …
```

A single integrator (per `project_multi_agent_integrator_protocol.md`) coordinates fast-forward merges into `main`.

---

## 6  Status of this plan

**Binding.** Adopted 2026-05-28 after the audit run reported in this session's transcript. Supersedes the "things missing" callout at the end of the QA run for Hotels Express Lavanderia.
