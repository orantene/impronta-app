# Admin Prototype — Dev Handoff

**Audience:** the engineer(s) translating the clickable prototype into production code.
**Prototype source:** `web/src/app/prototypes/admin-shell/` (code only — no docs)
**Handoff package:** `web/docs/admin-prototype/` (this folder — every doc related to the prototype)
**Live URL (dev):** `http://localhost:3000/prototypes/admin-shell?surface=workspace&plan=free&role=owner&alsoTalent=true&page=overview`
**Last updated:** 2026-05-02 — Master index expanded to 30 entries: linked `messaging-shells-handoff.md` (in-folder but unlinked until now), `MASTER_FIELD_CATALOG.md`, `PROFILE_FIELD_ENGINE.md`. Messaging-shells doc had two minor inconsistencies fixed (line count `12k` → `13.1k`, path-prefix consistency). §28 covers: Top Performers Talent ↔ Pages switcher on Website page, docs consolidated to single folder (`web/docs/admin-prototype/`), OVERVIEW_AUDIT_2026 spec doc added, duplicate Search ⌘K chip removed. Working tree, **uncommitted**, on top of committed `5e0ce66` · `553ef8f` · `0522f7d` · `11d8fa0` · `93b46c4`. Prior §27 (Website page + Performance dashboard + I1/I2/I3/I7/I8 closeouts) also still uncommitted.

This document explains every meaningful design decision, what the building blocks are, and what the production translation looks like. Read it once before touching the code. Cross-reference with `consolidation-map.md` (which surface lives where) and `architecture.md` (the prior strategic write-up).

> **2026-05-02 — Docs consolidated.** Every doc related to the admin prototype now lives in this single folder (`web/docs/admin-prototype/`). Previously they were scattered across `web/docs/admin-redesign/`, `web/src/app/prototypes/admin-shell/*.md`, and `web/src/app/prototypes/admin-shell/docs/`. The prototype source directory now contains code only. Internal links use relative paths within this folder. The duplicate STYLE / MOTION / A11Y / CONTENT / ICONS files are resolved — the newer (May 2) versions from the prototype `docs/` subdir are canonical.

## Master document index

The handoff isn't one file — it's a package. Read in this order. Every link is relative to this doc's location.

**Tier 1 — read first (required orientation, ~45 min):**
1. [`README.md`](./README.md) — entry point + navigation through the package.
2. **This file (`dev-handoff.md`)** — design decisions + production translation, end-to-end.
3. [`architecture.md`](./architecture.md) — high-level system architecture companion to README.
4. [`consolidation-map.md`](./consolidation-map.md) — which production surface maps to which prototype pages.
5. [`production-handoff.md`](./production-handoff.md) — the prototype → production handoff narrative.

**Tier 2 — reference docs (open as you need them):**
6. [`./ROADMAP.md`](./ROADMAP.md) — 32 workstreams, sequencing, dependencies. Tagged ✅/⚠️ per recent sprint.
7. [`./DRAWERS.md`](./DRAWERS.md) — every drawer (149+) with purpose + related drawers + audience.
8. [`./TRUST.md`](./TRUST.md) — Trust & Verification system in full (also summarized in §24 below).
9. [`./STYLE.md`](./STYLE.md) — visual tokens, do/don't list, color decision tree.
10. [`./MOTION.md`](./MOTION.md) — durations, easings, choreography rules.
11. [`./A11Y.md`](./A11Y.md) — keyboard map, ARIA conventions, screen-reader patterns.
12. [`./CONTENT.md`](./CONTENT.md) — voice, tone, capitalization, error/empty-state copy patterns.
13. [`./ICONS.md`](./ICONS.md) — icon registry + when-to-use guidance.
14. [`./DESIGN_HANDOFF_TEMPLATE.md`](./DESIGN_HANDOFF_TEMPLATE.md) — template designers fill out per feature.

**Tier 3 — track-specific deep-dives:**
15. [`talent-backend-handoff.md`](./talent-backend-handoff.md) — talent surface, backend/data-layer focus.
16. [`talent-roadmap.md`](./talent-roadmap.md) — talent surface roadmap (separate from main).
17. [`talent-execution-checklist.md`](./talent-execution-checklist.md) — talent execution master checklist.
18. [`talent-workspace-improvements.md`](./talent-workspace-improvements.md) — talent + workspace audit + recs.
19. [`dp-default-positions.md`](./dp-default-positions.md) — decision-point defaults (companion to talent-execution-checklist).
20. [`mobile-audit.md`](./mobile-audit.md) — 50-item mobile-only audit (real, from screenshots + DOM).
21. [`OVERVIEW_AUDIT_2026.md`](./OVERVIEW_AUDIT_2026.md) — Workspace Overview page 2026-readiness audit (10→5 section restructure, live activity feed, sparklines, Top Performers Talent↔Pages switcher, ~9.5d effort).
22. [`messaging-shells-handoff.md`](./messaging-shells-handoff.md) — Messaging surface across the 3 shells (Talent / Client / Admin) and 4 plan tiers; module-level stores, system-user (workspace-as-participant), tier-aware behavior matrix, recommended ship order.
23. [`MASTER_FIELD_CATALOG.md`](./MASTER_FIELD_CATALOG.md) — Phase D talent-field-catalog runbook (DB schema, 179 field defs, 171 recommendations).
24. [`PROFILE_FIELD_ENGINE.md`](./PROFILE_FIELD_ENGINE.md) — full profile field engine session handoff (744 lines; vocabulary / wiring map / migration map / taxonomy bridge / operational reference / gotchas).
25. [`qa-plan.md`](./qa-plan.md) — page-by-page design QA structure.
26. [`qa-tracker.md`](./qa-tracker.md) — live QA tracker.

**Tier 4 — embedded prototype docs (small but important):**
27. [`./PR_CHECKLIST.md`](./PR_CHECKLIST.md) — pre-merge gate (no gold/brass/rust accents, etc).
28. [`./MESSAGING_FLOW.md`](./MESSAGING_FLOW.md) — inquiry messaging flow detail.
29. [`./tokens.json`](./tokens.json) — Style Dictionary token export.
30. [`./canonical-flow.json`](./canonical-flow.json) — pipeline flow definition.

If a doc isn't on this list, it's either obsolete or out-of-scope for the dashboard implementation.

## Recent work timeline (last 14 days)

> Helps a dev opening the handoff cold understand WHEN each decision was made and which docs were updated alongside.

| Date | Commit | Highlight | What it touched |
|---|---|---|---|
| 2026-05-02 | _(uncommitted)_ | **Polish + Top Performers switcher + docs consolidation** — see §28 | Talent ↔ Pages switcher on Website page Performance section (`WebsiteTalentMetrics` type + seed + tab UI · ranks by attributed booking revenue); duplicate `Search ⌘K` chip removed from workspace topbar; all 26 admin-prototype docs consolidated into `web/docs/admin-prototype/` (was scattered across 3 dirs); new `OVERVIEW_AUDIT_2026.md` spec doc (5-issue audit + 4-section redesign + 9.5d effort estimate); `tokens.json` export script output path updated to new docs folder |
| 2026-05-02 | _(uncommitted)_ | **Website page + Performance dashboard + I-track closeouts** — see §27 | New top-nav `Website` surface (12 sections — pages / posts / 301 redirects / nav / custom CSS+JS / tracking / SEO / domain+SSL / maintenance / announcement); consolidated Performance section (visits / inquiries / bookings / revenue with 7d/30d toggle, indigo funnel strip, top-pages table); I1 page-builder routes via `useRouter`; I2 inline `AddRedirectModal`; I3 `DomainDrawer` rebuild reading `WEBSITE_STATE.domain`; I7 `catalogId` threaded on 4 IdentityEditor FieldRows; I8 publish gate honors catalog `requiredFor` for models |
| 2026-05-01 | `11d8fa0` | **Polish + bug-fix batch** — see §26 | Scroll-lock recovery (the "stuck Profile page" bug), PrimaryButton black-CTA leak fix (global), talent header compact, Preview-as-client drawer rewrite, MobileInboxTab redesigned, Atelier Roma seed cleanup, 3 pre-existing TS errors fixed |
| 2026-05-01 | `0522f7d` | Handoff master index + 14-day timeline | This timeline + tier-1/2/3/4 doc index |
| 2026-05-01 | `553ef8f` | Handoff prep — sprint changes documented | dev-handoff §25, DRAWERS.md additions, ROADMAP ✅/⚠️ tags |
| 2026-05-01 | `5e0ce66` | **Modernization sprint** — see §25 | 18 prototype files: WS-1.A wide layout, minor protections, WS-25.2 client CSV, WS-11 advanced, GuidedTour primitive, native popover migration, dead-code removal, WebAuthn + WebGPU + URL route shim |
| 2026-04-30 | `7570b87` | Master taxonomy + workspace enablement docs locked | docs/taxonomy/ — separate track, not admin-shell |
| 2026-04-30 | `bc57b56` | Page-builder invariants locked for SaaS refactor | docs/builder/ — separate track |
| 2026-04-30 | `2ca73bf` `15def15` | header-inspector tab IA + perf + nav rebuild | site-shell track, not admin-shell |
| 2026-04-29 | `461b0f7` `80fb09f` | header-inspector phase 1 + 2 (premium restraint, undo, validation) | site-shell |
| 2026-04-29 | `dbdd97f` `7c0f0d9` | edit-chrome Preview toggle into mobile/tablet iframe | edit-chrome (site-builder) |
| 2026-04-29 | `06d174e` `24a4a77` `9a32af1` | site-shell header drawer system, mobile header, hover-only logo | site-shell |
| 2026-04-29 | `1e25014` | CMS public-navigation read caching | cms / site-builder |
| 2026-04-29 | `f0fe619` | Warm-paper input system + indigo accent overhaul | edit-chrome |
| 2026-04-29 | `8165902` `3b5934a` | edit-chrome Sprint 5 — composition.* mutations through dispatch | edit-chrome |
| 2026-04-28 | `2da8fff` `c5d141b` | edit-chrome Sprint 5 dispatch foundation + perf | edit-chrome |
| 2026-04-28 | `903dde5` `13ccfd1` `cb274ee` | edit-chrome Sprint 4 — recommendations, multi-select, outline mode | edit-chrome |
| 2026-04-28 | `0e436f0` `71005c3` | QA-2 inspector title + content-derived names | edit-chrome |
| 2026-04-28 | `34355dd` | Big QA pass — broken /account, suffix leak, dup labels, drag/select state | edit-chrome |
| 2026-04-28 | `f0ced22` | edit-chrome Sprint 3 — iframe device preview replaces clip | edit-chrome **+ touched admin-shell docs** (A11Y/CONTENT/ICONS/MOTION/STYLE/tokens.json updated for parity) |
| 2026-04-28 | `9d95c77` | **Admin-shell comprehensive redesign batch** | admin-shell — DRAWERS, _drawers, _help, _pages, _primitives, _state, _talent, page.tsx |
| 2026-04-27 | `a8f73b8` | Mobile filter chip 56px regression + active-tab badge contrast | admin-shell mobile |
| 2026-04-27 | `219c80f` | **Mobile premium pass: J1–J8 critical + sections A–I** | admin-shell mobile (10 prototype files) |
| 2026-04-27 | `9367e22` `08b830a` `bacba2d` `6e1b766` `4c6ccc2` `f5ea049` `5d34f6f` | Mobile audit follow-ups — composer polish, identity bar, account menu, earnings ring, talent strips | admin-shell mobile |
| 2026-04-27 | `fc38708` | **50-item mobile audit doc added** + temp quarantine | mobile-audit.md, _*.tsx.quarantined (later un-quarantined) |
| 2026-04-27 | `398a645` | Quarantined admin-shell to unblock build | admin-shell page.tsx (later restored) |

**What this tells the dev:**
- Admin-shell prototype work landed in two big batches: `9d95c77` (2026-04-28 redesign batch) + `5e0ce66` (2026-05-01 modernization sprint). Read those commits' diffs for the full delta.
- The 2026-04-27 mobile premium pass + 50-item audit (`mobile-audit.md`) is the source of truth for mobile-specific decisions. Cross-reference §22 + §25.7 of this doc.
- Most last-week commits (edit-chrome, site-shell, header-inspector, page-builder) are for the **page builder / site-shell track**, NOT the admin dashboard. They're tracked in separate doc folders (`docs/builder/`, `docs/taxonomy/`). When implementing the dashboard, leave those alone.

---

## 1. What the prototype is — and isn't

**Is:**
- A high-fidelity, fully clickable React mock of the admin admin-shell.
- The single source of truth for layout, copy, density, hierarchy, locked-vs-unlocked behaviour, drawer patterns, plan ladder, role gating, and the `alsoTalent` dual-identity story.
- A simulator: switch Surface / Plan / Role / Page and the entire UI re-renders against the same data + access rules the production app should use.

**Isn't:**
- Wired to Supabase or any real API.
- Routed to real pages — every "navigation" is local state.
- Final visual polish — small spacing/weight tweaks should land during prod build.
- A component library — the primitives are co-located in the prototype to keep the file count small. They can be promoted to `web/src/components/admin/*` as part of the production port (see §13).

---

## 2. The four prototype dimensions

The prototype is parametric. The dark **ControlBar** at the top of the screen exposes four orthogonal dimensions, and changing any one re-renders the workspace below. URL state is bidirectionally synced (`replaceState`) so any scene is a shareable link.

| Dimension | Values | What it controls |
|---|---|---|
| **Surface** | `workspace` · `talent` · `client` · `platform` | Which audience is being shown. Workspace is the only fully-built surface; the other three are stubs documenting Phase 2 scope. |
| **Plan** | `free` · `studio` · `agency` · `network` | What the tenant has paid for. Cards switch between unlocked (interactive) and locked (upgrade-affordance) based on this. |
| **Role** | `viewer` · `editor` · `coordinator` · `admin` · `owner` | Additive permissions. A higher role meets every requirement of every lower role. |
| **alsoTalent** | `true` · `false` | Is the logged-in user also on the roster of this agency? When true, the avatar menu and parts of the topbar change to surface their talent identity. |

**Production translation:**
- Surface and the canonical scoping rules already exist in `web/src/lib/saas/`. Don't re-derive — read the existing scope/membership types.
- Plan comes from the tenant record (`agencies.plan` or wherever it ends up). The `meetsPlan` helper in `_state.tsx` is the same shape the production code should use.
- Role comes from the workspace membership (`agency_members.role`). The `meetsRole` helper is rank-based and additive — match it.
- alsoTalent is `EXISTS (roster.user_id = current_user.id)` for the current tenant.

---

## 3. Architecture — file split (current state)

The prototype has grown beyond the original 9 files. As of 2026-05-01 it spans the files below. The "don't grow past ~2,500 lines" rule has been broken in three places — split is on the roadmap (see §25.9). Numbers are approximate; check `wc -l` before believing them.

```
admin-shell/
├── page.tsx              ~2,250 lines  Entry. ProtoProvider tree. BottomActionFab (popover-based).
├── _state.tsx            ~7,400 lines  Types · mock data · RICH_INQUIRIES + threads · ProtoProvider · useProto · tokens · COLORS · trust verification model · minor protections · custom-fields registry.
├── _primitives.tsx       ~8,200 lines  Icon · atoms · typography (H1/H2/H3/Eyebrow/Caption) · Card · cards · drawer/modal shells (with size modes + drag-resize) · ToastHost · ConfirmDialog · Skeleton · EmptyState · Toggle · Bullet · Avatar · TrustBadgeGroup · ProfilePhotoBadgeOverlay · ProfileClaimStatusChip · RiskScorePill · PaymentStatusChip · PayoutStatusChip · BulkSelectBar · DrawerShell · useViewport · useFeatureFlag · scrollBehavior helper.
├── _pages.tsx            ~9,200 lines  ControlBar (surface-aware) · WorkspaceTopbar · WorkspaceSidebarShell · admin page renderers · SurfaceRouter · MobileBottomNav · AccountMenuTrigger · keyboard layer · roving tab-index helpers · tooltipped nav.
├── _drawers.tsx         ~21,500 lines  DrawerRoot dispatcher · 149+ drawer bodies · UpgradeModal · ProfileDiffModal · TemplatesPicker · CsvBulkAddPanel · ClientCsvBulkAddDrawer · NotificationPrefsDrawer · MinorAccountDrawer · ActivityLogPanel · 6 verification stub drawers.
├── _workspace.tsx        ~2,750 lines  InquiryWorkspaceDrawer — the POV-aware inquiry pane (admin/client/talent share one component) · WS-1.A wide 3-pane layout · MinorProtectionBanner.
├── _talent.tsx          ~13,000 lines  TalentSurface — Today / Messages / Profile / Calendar / Agencies / Public-page (with WebGPU + mobile preview) / Settings (with PasskeysCard) · 18+ talent drawers.
├── _talent_drawers.tsx   ~2,000 lines  Talent-drawer split-out (polaroids / availability / block-dates / hub-detail / message-detail / portfolio etc).
├── _client.tsx          ~12,000 lines  ClientSurface — Today / Discover / Shortlists / Inquiries / Bookings / Settings · 15 client drawers.
├── _platform.tsx         ~5,500 lines  PlatformSurface — dark "Tulala HQ" console with HQ role gating · 21 ops drawers.
├── _messages.tsx         ~5,500 lines  MessagesShell — extracted unified inbox + thread rendering (used by workspace + talent + client surfaces).
├── _wave2.tsx            ~3,200 lines  Phase 2 helpers — SavedViewsBar · MentionTypeahead · etc.
├── _help.tsx             ~3,500 lines  DRAWER_HELP registry — FAQs / how-to / shortcut keys per drawer ID.
├── _palette.tsx            ~600 lines  CommandPalette (⌘K) — searchable across drawers / inquiries / clients / talent / settings.
├── _notifications-hub.tsx  ~280 lines  NotificationsBell — bell + 3-bucket popover, reads pendingTalent.
├── _admin-tour.tsx          ~70 lines  Thin wrapper around <GuidedTour> with the 4 admin steps.
├── _guided-tour.tsx        ~230 lines  Reusable guided-tour primitive. Exported.
├── _modern-features.tsx    ~470 lines  PasskeysCard (WebAuthn) + GalleryFxCard (WebGPU). Exported.
├── _profile-store.ts       ~200 lines  Module-scoped subscribable store for shared profile drafts (useSyncExternalStore).
├── _csv-parser.ts          ~100 lines  Pure CSV parsing helpers (no React).
├── _csv-parser.test.ts     ~120 lines  14 unit tests via tsx --test.
├── _taxonomy-loader.ts     ~150 lines  Lazy-loaded Supabase taxonomy_terms + talent_languages reads.
└── talent/profile/edit/page.tsx        Real Next.js route — 308-redirects to the prototype with the right query params.
```

**Mount tree** (in `page.tsx`):

```tsx
<Suspense>
  <ProtoProvider>
    <ControlBar />        {/* prototype-only; remove for prod */}
    <SurfaceRouter />     {/* renders the right surface */}
    <DrawerRoot />        {/* slide-in panel; reads state.drawer */}
    <UpgradeModal />      {/* center modal; reads state.upgrade */}
    <ToastBridge />       {/* bottom-right toast stack */}
  </ProtoProvider>
</Suspense>
```

**Why this split:** each file maps to one cognitive unit. State changes never need to cross-thread between two files. Drawers and pages each have one responsibility (dispatch by id) and one rendering convention (each drawer is its own component so it can call `useProto()` at the top level — see §6).

---

## 4. State model

Defined in `_state.tsx`. The provider is a single component holding nine pieces of state and exposing the `Ctx` shape via `useProto()`.

```ts
type ProtoState = {
  surface: Surface;
  plan: Plan;
  role: Role;
  alsoTalent: boolean;
  page: WorkspacePage;
  drawer: { drawerId: DrawerId | null; payload?: Record<string, unknown> };
  upgrade: { open: boolean; ...UpgradeOffer };
  toasts: { id: number; message: string }[];
  completedTasks: Set<string>;
};
```

**Conventions to keep when porting to prod:**
- `state.drawer` and `state.upgrade` are control-plane state — they live alongside the page state, not inside individual page components. This keeps drawer + modal logic *outside* the route tree, which matters because the drawer can outlive a page transition.
- `payload` on drawer state is how `talent-profile` knows *which* talent to render, etc. In prod, the payload should usually be an id (`{ talentId }` / `{ inquiryId }`) and the drawer body fetches the rest.
- `completedTasks: Set<string>` is the activation-checklist state. In prod this should be a server-derived set (which onboarding tasks the tenant has completed) — see `ACTIVATION_TASKS` for the current 4-task list.

**URL sync** lives in two `useEffect` blocks. Read on mount, write on every dimension change. `replaceState`, not `pushState`, because clicking through the prototype shouldn't pollute browser history.

---

## 5. Plan ladder — what each tier means

Four tiers, four narratives. Copy is in `PLAN_META`.

| Plan | Theme | One-liner | Unlocks |
|---|---|---|---|
| **Free** | Join the ecosystem | The agency is searchable on the Tulala network. Roster + inquiries + a default storefront on `<slug>.tulala.app`. | Roster, inquiries, branding (color/logo), basic activity feed |
| **Studio** | Gain control | The agency embeds anywhere and connects a domain. | Custom domain, widgets, API keys, posts |
| **Agency** | Branded operation | Full branded site with pages, navigation, theme system, SEO. | Homepage builder, pages, posts, navigation, theme & foundations, SEO |
| **Network** | Multi-brand hub | One owner organisation runs many agencies. | Multi-agency manager, hub publishing, cross-brand analytics |

`meetsPlan(current, required)` is rank-based — `agency` meets `free` and `studio` and `agency`. Use this everywhere in prod gates.

**Why this ladder shape:** every tier has a real user-facing reason to upgrade — not a feature paywall but a category shift in what the product *is*. "Gain control" and "Branded operation" are the words a salesperson would actually say.

---

## 6. Role gating

Five additive roles. `ROLE_META` ranks them; `meetsRole(current, required)` returns true if `current.rank >= required.rank`.

| Role | Rank | What they can do |
|---|---|---|
| **viewer** | 0 | Read-only. Sees the workspace shell, can't edit anything. |
| **editor** | 1 | Can edit talent profiles + drafts. Can't publish. |
| **coordinator** | 2 | Can publish, can run the work pipeline (offers, holds, confirmations). Cannot touch billing/team/danger-zone. |
| **admin** | 3 | Adds Workspace settings: team, billing, identity, branding, domain, theme. |
| **owner** | 4 | Adds Danger Zone: transfer ownership, delete workspace. |

**Production-side rule:** `meetsRole` should be the *only* role check in the UI. Any conditional that says "if role === 'admin'" is a code smell — it should be `if (meetsRole(role, 'admin'))` so a future "super-admin" role drops in without a hunt.

The capability matrix in `web/src/lib/access/roles.ts` already enforces this on the server. The UI shouldn't re-derive — it should call into that.

---

## 7. Card hierarchy

Six card variants in `_primitives.tsx`. Pick by purpose, not by aesthetics.

| Variant | When to use | Visual shape |
|---|---|---|
| **PrimaryCard** | The card *is* the action. "Today's pulse", "Inquiries pipeline". Bold display title + body content + footer affordance. | Large, white, bold serif title |
| **SecondaryCard** | Supporting card. Compact. Body font title + 1-line body. Opens a focused drawer. | Small, white, compact |
| **StatusCard** | Small read-only snapshot. "5 of 25 seats", "Domain verified", "84% translation coverage". | White, status dot or badge inline |
| **LockedCard** | The action exists on a higher plan. Same footprint as the unlocked variant — never collapses or hides. | Soft cream tint, "ON {PLAN}" eyebrow + "See what's included →" |
| **CompactLockedCard** | Used inside MoreWithSection (rarely now — tier sections largely replaced this). | Half-height locked variant |
| **StarterCard** | Activation walkthrough. Numbered steps, mark-as-done, progress bar. Cream tint. | Wide, cream, with step list |

**Locked-density rule:** never let locked cards exceed ~40% of the visible page. If a page is mostly locks, it reads as "you have nothing here" — exactly the wrong message. Use **TierSection** (see §8) to group locks under a clear heading instead.

---

## 8. Tier-section pattern

The Site page is the canonical example. Cards are grouped under tier-named bands, each with a tiny dot-icon, a title, and a one-line description:

```
● EVERY PLAN  Your core workspace      Free, Studio, Agency, Network — all plans share this.
   [ Roster ] [ Directory ] [ Inquiries ] [ Branding ] [ Activity ]

✦ STUDIO     Embed anywhere            Drop your roster into WordPress, Webflow, Shopify…
   [ Widgets ]  [ API keys ]  [ Custom domain & home ]

✦ AGENCY     Full branded site         Your site, your domain, your brand.
   [ Homepage ]  [ Pages ]  [ Posts ]  [ Navigation & footer ]
   [ Theme & foundations ]  [ SEO & defaults ]

● NETWORK    Multi-agency · hub        Operate multiple agencies and push talent…
   [ Hub publishing ]  [ Multi-agency manager ]
```

Each `TierCard` is a thin helper that picks **PrimaryCard** when the current plan meets the section's required plan, otherwise **LockedCard**. The headers use plain English ("Embed anywhere", not "Studio features") because the user feedback was clear: *opaque jargon kills trust*.

This pattern works because:
1. Locks are intentional — they live under a heading that says "this tier".
2. Density stays balanced — the unlocked top section and the locked bottom sections are equal-weight columns of cards, not a wasteland of greyed-out tiles.
3. Each lock can show *real* affordance copy ("See what's included →") rather than a generic "Upgrade" CTA.

---

## 9. Drawer system

`DrawerRoot` reads `state.drawer.drawerId` and dispatches to one of ~35 drawer-body components. Drawer ids are a closed type union (`DrawerId` in `_state.tsx`) — TypeScript catches typos.

**Conventions every drawer follows:**

| Convention | Why |
|---|---|
| Each drawer is its own component (`function FooDrawer()`) | So it can call `useProto()` at the top level. Don't inline drawer JSX into the dispatcher. |
| Right-slide, sticky footer, ESC-closes, body-scroll-lock | Built into `DrawerShell`. Don't reinvent. |
| Footer always has `Close` / `Cancel` *and* a primary action button | Drawers are commit-style. Closing without saving discards. |
| `onSave` calls `useSaveAndClose("Saved label")` | Helper: fires a toast then closes. Keeps drawers feeling responsive. |
| Drawer width is 520 (default), 560 for setup, 580 for talent profile, 720 for theme foundations | Wider only when the content earns it (multi-column theme preview, profile thumbnails). |
| Section headers use the `Section` helper, not raw `<h3>` | Locks visual rhythm. |

**The drawer registry — just so you know what's there.** Group them by what they touch:

| Group | Drawers |
|---|---|
| **Tenant chrome** | `tenant-summary` (the right-drawer plan summary), `plan-billing`, `team`, `branding`, `domain`, `identity`, `workspace-settings` |
| **Site building** | `site-setup` (walkthrough), `theme-foundations`, `homepage` (stub), `pages`, `posts`, `navigation`, `media`, `translations`, `seo` |
| **Talent** | `talent-profile`, `new-talent`, `my-profile`, `storefront-visibility`, `field-catalog`, `taxonomy` |
| **Work** | `inquiry-peek`, `new-inquiry`, `new-booking`, `today-pulse`, `pipeline`, `drafts-holds`, `awaiting-client`, `confirmed-bookings`, `archived-work`, `pipeline-filter`, `filter-config` |
| **Clients** | `client-profile` |
| **Activity / notifications** | `notifications`, `team-activity`, `talent-activity` |
| **Studio / Agency / Network** | `widgets`, `api-keys`, `site-health`, `hub-distribution` |
| **Owner-only** | `danger-zone` |

**Production translation:**
- Drawer ids stay the same. The TypeScript union *is* the registry.
- In prod, drawer state should be URL-synced too (`?drawer=talent-profile&id=abc`) so deep-linking works. The prototype skips this for clarity but the hooks are already in place.
- Drawer bodies that need server data should `useQuery` against the existing API. The mock data in `_state.tsx` (ROSTER_AGENCY, INQUIRIES_AGENCY, etc.) shows the shape each drawer expects.

---

## 10. Upgrade modal flow

Locked cards open `UpgradeModal`, not the drawer they "would" open. The modal is the *only* place users see plan pricing in the workspace shell.

**Modal anatomy** (matches what's in the screenshot you took):
1. Cream eyebrow: `AVAILABLE ON {PLAN}`
2. Display-font title (the feature name)
3. One-line description
4. **What you'll unlock** — 3–5 checkmark bullets
5. **Pricing** — `$X / month` + plan chip + cancel-anytime line
6. Footer: `Not now` / `Upgrade to {Plan}` (or `Contact sales` for Network)

**`Upgrade to Studio`** in the prototype just calls `setPlan("studio")` — instant feedback, the page below re-renders with everything unlocked. **In prod**, that button kicks off Stripe checkout and the unlock happens on webhook. The modal stays open with a spinner; on success, fire a toast and close.

Pricing copy ($29/mo, $79/mo, $149/mo, "Contact sales") lives in `defaultUnlocks(plan)` in `_drawers.tsx`. This is placeholder — replace with the canonical price list when SKUs are confirmed.

---

## 11. alsoTalent dual identity

When a user is on the roster of the tenant they're administering, two things change:

1. **Avatar menu** opens `my-profile`, which has a different layout (live preview of the public profile, "edit my profile" CTA, talent-specific settings) versus the admin's own profile.
2. **Talent page** shows a banner at the top of the roster: *"You're also on this roster — your profile is published"* with a "View as visitor" button.

**Why this matters:** at small agencies, the founder *is* talent #1. Pretending otherwise creates an "are these my settings or theirs?" confusion every session. Surfacing it explicitly is one of the clearest UX wins in the whole shell.

**Production translation:** `alsoTalent` is just `EXISTS (roster.user_id = auth.uid)` for the current tenant. Cache it on the session.

---

## 12. Visual tokens

`COLORS` and `FONTS` exports in `_state.tsx` are the canonical token list. Don't fork.

```ts
COLORS.surface     #FAFAF7   // page background — off-white cream
COLORS.card        #FFFFFF   // raised surfaces
COLORS.ink         #0B0B0D   // primary text
COLORS.inkMuted    rgba(11,11,13,0.62)  // body
COLORS.inkDim     rgba(11,11,13,0.38)  // hint / disabled
COLORS.border     rgba(24,24,27,0.10)
COLORS.borderSoft rgba(24,24,27,0.06)
COLORS.cream      #F5F2EB   // setup walkthrough, locked-card tint
COLORS.gold       #B8860B   // accent — used SPARINGLY (sparkle icons, setup banner only)
COLORS.goldDeep   #8C660A
COLORS.green      #2E7D5B   // confirmed / success
COLORS.amber      #C68A1E   // pending / warning
COLORS.red        #B0303A   // danger
COLORS.navyBg     #0B0B0D   // ControlBar background

FONTS.display var(--font-geist-sans) + Inter + system-ui                // page titles, drawer titles, hero numbers
FONTS.body    "Inter" + system-ui + sans-serif                          // everything else
```

**The gold rule:** the user explicitly hated the previous "rust/gold accent everywhere" treatment. Gold appears now in *exactly two places*:
- The **Site setup walkthrough** banner (cream + gold, intentional cue this is your activation track).
- The sparkle icon next to the upgrade modal eyebrow.

If you find yourself adding gold elsewhere, stop. Use ink/neutral/green/amber/red instead.

**The display-font rule:** `FONTS.display` (Geist) is for page H1, drawer titles, modal titles, and hero numbers (StatusCard values, offer totals, pricing). Card titles are body font (Inter), weight 600, size 14. The prototype originally used Cormorant Garamond for display but the editorial serif was distracting in admin contexts — Geist is the canonical SaaS-dashboard sans. **Don't reintroduce Cormorant or any other serif in admin panels.** If a future surface needs editorial flair (e.g. the public storefront), add a separate `FONTS.editorial` token for that surface — don't fork `FONTS.display`.

---

## 13. Production port — what to do, in order

1. **Promote primitives first.** Move the contents of `_primitives.tsx` to `web/src/components/admin/` split by file:
   - `Icon.tsx`, `Card.tsx` (all six variants), `DrawerShell.tsx`, `ModalShell.tsx`, `Toast.tsx`, `Form.tsx` (FieldRow / TextInput / TextArea / Toggle / Divider).
   - Replace inline-style props with Tailwind classes against the existing token system. Match the COLOR / FONT values one-for-one.

2. **Move state to a real provider.** `ProtoProvider` becomes `AdminShellProvider`. Drawer + modal state stays in context. URL sync stays. **Drop** the `setPlan` / `setRole` / `setSurface` setters — those become read-only in prod (driven by the session).

3. **Replace mock data with queries.** Every `getRoster(plan)`, `getInquiries(plan)`, etc. becomes a `useQuery` against the existing API. The page renderers don't need to change shape — they just take server data.

4. **Wire drawer payloads to fetches.** When `talent-profile` opens with `{ talentId }`, the drawer body fetches that talent.

5. **Wire the upgrade modal to Stripe.** "Upgrade to Studio" → checkout → webhook → toast + close.

6. **Drop the ControlBar.** It's prototype-only. The production app has no surface picker — the user lands on the right surface based on session/role.

7. **Keep the `meetsPlan` / `meetsRole` helpers.** They are the right shape and already match `web/src/lib/access/roles.ts`. Don't fork.

8. **Activate the surface stubs.** Talent / Client / Platform surfaces are content-light placeholders. Each is a Phase-2 design exercise — that's a separate brief, not part of this port.

---

## 14. Open questions for the team

These are decisions I made and that production engineering may want to challenge:

1. **Page state vs route state.** The prototype keeps `page` (overview/work/talent/clients/site/workspace) in context. In prod, these are real routes. The provider can listen to the pathname instead of holding `page` itself — recommended.
2. **Drawer URL sync.** Prototype skips it. Strongly recommend prod adds `?drawer=talent-profile&id=abc` so support links work.
3. **Toast library.** I built a tiny `ToastHost` because I wanted total visual control. The prod app already has `sonner` (in package.json). If `sonner` matches the visual spec, use it; otherwise port `ToastHost` 1:1.
4. **Activation tasks source.** `ACTIVATION_TASKS` in `_state.tsx` is hard-coded. Prod should derive from server state (which onboarding steps a tenant has completed) and store completion in a `tenant_onboarding_state` row.
5. **Custom domain status.** The prototype shows "Live · Verified" or "acme-models.tulala.app" as a static status. Prod will have a richer state machine (DNS pending, SSL issuing, etc.) — that needs a separate spec before the Domain drawer ships.

---

## 15. Quick reference

**Want to find…**

| You want to find | Look in |
|---|---|
| Where a drawer body lives | `_drawers.tsx`, search for `function {Name}Drawer` |
| The card that's rendered for "Pages" on Site | `_pages.tsx`, function `SitePage` |
| What gets passed in `state.drawer.payload` | The function that calls `openDrawer(id, payload)` (search for `openDrawer("...")`) |
| Which plan unlocks something | `meetsPlan` calls in `_pages.tsx`, or check the section heading in TierSection |
| The exact pricing copy | `defaultUnlocks(plan)` in `_drawers.tsx` |
| Mock data for any entity | `_state.tsx`, search for `ROSTER_` / `INQUIRIES_` / `CLIENTS_` / `TEAM_` |
| The icon list | `Icon` component in `_primitives.tsx` (21 names) |
| Why the gold tint is restrained | This file, §12 |

---

## 16. Inquiry workspace — the messaging-first product core

> *"Our product is focus on the messages reservation inquiry → booking product. Please apply this across all dashboards."*

Everything else in the shell is plumbing. The **inquiry workspace** is the product. One drawer body — `InquiryWorkspaceDrawer` in `_workspace.tsx` — is rendered identically from admin, client, and talent surfaces, with **POV-aware** capabilities. It replaces every "open inquiry" navigation across all four surfaces.

**Where it lives.** `openDrawer("inquiry-workspace", { inquiryId, pov: "admin" | "client" | "talent" })`. The same component, three audiences. The POV decides which thread is visible, which side panels render, and which CTAs are wired.

### 16.1 Inquiry stages (one source of truth)

Every inquiry has a stage. Stages are a closed union in `_state.tsx`:

```ts
type InquiryStage =
  | "draft"           // Coordinator drafting — only admin sees it
  | "submitted"       // Client sent — appears in admin queue
  | "coordination"    // Coordinator gathering talent + rates
  | "offer_pending"   // Offer sent to client — awaiting approval
  | "approved"        // Client approved offer — talent confirmations pending
  | "booked"          // All confirmations in — calendar locked
  | "rejected"        // Client passed
  | "expired";        // Time-out without resolution
```

**Visible-to rule** in `INQUIRY_STAGE_META`:
- `draft` → admin only (talent + client never see)
- `submitted` / `coordination` → admin + client; talent sees only when their roster line opens
- `offer_pending` → admin + client; **talent sees only the line item that names them** (no other talent's rates)
- `approved` / `booked` → admin + client + booked talent (group thread opens)
- `rejected` / `expired` → admin only

**Production translation:** stages should be a Postgres enum on the `inquiries` table. Stage transitions need a server-side state machine with audit rows in `inquiry_events` (the prototype already shows the activity log shape).

### 16.2 Two-thread messaging

This is the design crux. Every inquiry has **two threads**, and the POV decides which are visible:

| Thread | Participants | Who sees it |
|---|---|---|
| **`private`** — "With your coordinator" | Client ↔ coordinator (admin) | Admin + client. **Talent never sees.** |
| **`group`** — "Talent group" | Coordinator + booked talent (multiple) | Admin + booked talent. **Client never sees.** |

Both threads live on the same inquiry record. Each `MessageThread` has `kind: "private" | "group"`, a `participants[]` list, and a flat `messages[]` array. Unread counts per POV are computed from `unreadPrivate` and `unreadGroup` flags on the rich inquiry.

**Why two threads, not one.** A single thread quickly becomes either:
- Coordinator paraphrasing client + talent at each other ("Sara wants to know if you can move to Tuesday" → "Tell her yes but I need a half-rate") — every nuance gets lost in transit, or
- All three on one thread, where the talent sees the rate the client is paying (which is none of their business, by industry norm) and the client sees talent grumbling about logistics.

Two threads with the coordinator as the only common node mirrors how booking actually works on WhatsApp today — but structured, role-bounded, and audit-logged. **This is the WhatsApp-replacement value prop.**

**Production translation:**
- `inquiry_messages` table with a `thread_kind` column (`private` | `group`).
- RLS: a user can read messages where `thread_kind = 'private'` if they are the client OR a member of the agency, OR `thread_kind = 'group'` if they are the agency OR a talent with a non-declined line item on that inquiry.
- The two-thread tab UI in `_workspace.tsx` (`Client thread` / `Talent group · N`) is the canonical layout.

### 16.3 Layout — the POV decides what renders

The drawer body is two columns inside the existing `DrawerShell`:

```
┌─────────────────────────────────┬──────────────────────────────┐
│ STAGE TIMELINE (full width)                                    │
├─────────────────────────────────┼──────────────────────────────┤
│ [Client thread] [Talent group N]│ SUMMARY  (brief / dates / …) │
│                                 │ COORDINATOR  (admin only)    │
│   message stream                │ ROSTER  (requirement groups) │
│   ↓                             │ OFFER  (line items + CTAs)   │
│                                 │ ACTIVITY  (audit log)        │
│ [composer @ bottom]             │                              │
└─────────────────────────────────┴──────────────────────────────┘
```

**What changes per POV:**

| Element | admin | client | talent |
|---|---|---|---|
| Tabs visible | both threads | private only | group only |
| Composer visibility line | "Visible to client + coordinator" / "Visible to talent group" | "Visible to client + coordinator" | "Visible to your coordinator + other booked talent" |
| Coordinator panel | shown with `Reassign` button | shown read-only | hidden |
| Roster panel — line items | full rates + status | full rates + status (their rates, after all) | only their own line, with `Accept` / `Decline` CTAs |
| Offer panel — CTA | `Send offer` / `Revise` / `Reassign` | `Approve offer` / `Decline` | `Accept my line` / `Decline` (only when their line is `pending`) |
| `Preview as client` button | shown | — | — |

The pattern: **one component, branching at the edges.** Don't fork into three drawers — keep the conditional rendering tight to the two or three places that actually differ. (See `RequirementGroupsPanel` and `OfferInner` in `_workspace.tsx`.)

### 16.4 Roster, requirement groups, and offer line items

A real inquiry isn't "1 talent for 1 day." Acme's brief is "6 hosts + 4 models + 2 promoters" — 12 people across three categories with three different rate tiers.

**`requirementGroups`** model this:

```ts
type RequirementGroup = {
  id: string;
  label: string;                      // "Hosts" / "Models" / "Promoters"
  needed: number;                     // how many to fill
  status: "open" | "filling" | "filled";
  talents: TalentSlot[];              // each slot is one human
};

type TalentSlot = {
  name: string;
  agency: string;
  status: "proposed" | "accepted" | "declined" | "pending";
  rateNote?: string;
};
```

**`offer.lineItems`** then maps actual money to actual humans:

```ts
type OfferLineItem = {
  id: string;
  talentName: string;
  amount: number;                     // €
  status: "pending" | "accepted" | "declined" | "superseded";
  note?: string;
};
```

The offer carries a version number — every `Revise` from the admin bumps the version. Past versions live in `offer.history[]` (renders as a tiny "v1 was €4,200, sent yesterday" trail under the current panel).

**Production translation:** `inquiry_requirement_groups` and `inquiry_offer_line_items` tables. Each line item references a `roster_talent_id` so when a talent accepts/declines, the database event rolls up into the parent inquiry's stage transition.

### 16.5 The single source of truth

`RICH_INQUIRIES` in `_state.tsx` is the canonical fixture. Five real-shape inquiries spanning every stage. Each one has:
- `clientName` / `brief` / `dates` / `location` / `currency` / `agency`
- `coordinatorId` (points into `COORDINATORS`)
- `requirementGroups` (1-3 of them per inquiry)
- `offer` (or null in `submitted` / `coordination` stages)
- `threads` (always 2 — `private` + `group`)
- `events[]` (the activity log)
- `unreadPrivate` / `unreadGroup` counts

**When an admin inquiry row is clicked**, `_pages.tsx` looks up the rich record by `clientName` (with brief as a tighter match). When a client offer card is clicked, it goes straight to `inquiry-workspace` with `pov: "client"`. When a talent inbox row is clicked, same drawer with `pov: "talent"`.

This is the single most important piece of the prototype. Everything else is supporting infrastructure for *this* drawer.

---

## 17. Talent surface — Marta Reyes's inbox

`_talent.tsx` is the talent-side dashboard for the agency's roster member. The hardcoded protagonist is `MY_TALENT_PROFILE` (Marta Reyes); `RICH_INQUIRIES` is filtered to the inquiries that actually involve her (either she's in a `requirementGroup`'s talents or she's a line item on an offer).

**Pages:** Today · Profile · Inbox · Calendar · Activity · Settings.

**Today.** Four status cards — `Awaiting your answer` / `Group threads` / `Upcoming` / `Profile views`. Below that:
- **Live inquiries** section (manual `<section>`, **not** SecondaryCard — see §16.5 nested-button note below). Shows the inquiries Marta is named on, with stage chip + "You're confirmed" / "Needs your answer" line + "1 new" badge if her group thread has unread messages. Clicking opens `inquiry-workspace` with `pov: "talent"`.
- **Holds & casting calls** — legacy quick-decision items (offer/hold pings that aren't worth a full inquiry yet).
- **Next on the calendar** — confirmed bookings.
- **Recent earnings** — 30-day paid bookings with totals.

**Inbox.** Re-uses the same RICH_INQUIRIES filter, but groups by stage (Pending offers / Active coordination / Confirmed) and lists raw `RequestRow` items below for the legacy quick-decision pings.

**Why the nested-button rewrite mattered.** Originally these sections wrapped clickable rows in a `SecondaryCard` (which renders `<button>` even when not interactive). React 19's stricter hydration treats `<button>` inside `<button>` as a hydration error and prints stack traces. Three sections were rewritten as plain `<section>` containers with the title/description rendered manually. **Rule for prod:** any list of clickable rows lives inside a plain container, never inside a Card primitive that may itself render a `<button>`.

**Production translation:**
- The current-talent identity is `roster.user_id = auth.uid` for the active tenant.
- "Marta's inquiries" is `RLS: line items where talent_id = my_roster_id` ∪ `requirement_group_talents where talent_id = my_roster_id`.
- The `pov: "talent"` on the workspace drawer becomes implicit on the server — no need to pass it; the RLS already scopes the response.

---

## 18. Client surface — Estudio Solé's offers

`_client.tsx` is the brand-side dashboard for a client tenant (e.g. Estudio Solé) with a Pro plan. The shape mirrors the admin workspace shell — same topbar pattern, same card hierarchy — but the data is **client-scoped**: their inquiries, their bookings, their shortlists.

**Pages:** Today · Discover · Shortlists · Inquiries · Bookings · Settings.

**Today.** Four status cards — `Need your decision` / `Working on it` / `Upcoming bookings` / `Saved shortlists`. Below that:
- **Offers waiting for your approval** (manual `<section>`, hydration-safe). Each row shows the inquiry title, line items by talent, total, version, and a stage chip. Clicks open `inquiry-workspace` with `pov: "client"` — which renders **only the private thread** (the client never sees the talent group) and **only `Approve offer` / `Decline` CTAs**.
- **Active conversations** + **Browse new talent** card pair.
- **Upcoming bookings** with date stack + amount + CONFIRMED chip.

**Discover.** Talent search across the network. (Reads the same `MASTER_ROSTER` as the admin's roster page.)

**Shortlists.** Saved talent groups the client has built for future briefs.

**Inquiries.** All RICH_INQUIRIES the client owns, grouped by stage.

**Bookings.** Confirmed work, with date stack + venue + cost + downloadable contract row.

**Critical UX point:** the client never sees the agency's internal coordination. They see a clean "your coordinator is replying" thread + structured offer cards. **The product is the discipline of keeping internal back-and-forth out of the client's view.**

**Production translation:**
- Client tenants live in a separate `client_workspaces` namespace from agency tenants but share user accounts (one user can be admin of an agency *and* admin of a client account).
- `pov: "client"` on the workspace drawer maps server-side to a client-scoped query that returns the inquiry + private thread only — never the group thread.
- `clientPlan` (free/pro/enterprise) is a separate ladder from agency plan — different feature gates (e.g. `enterprise` unlocks multi-brand + white-label widgets).

---

## 19. Platform / HQ surface — Tulala internal ops

`_platform.tsx` is the **internal Tulala** console — the dashboard the platform team uses to operate the SaaS itself. **Not** an agency or client surface; this is the SaaS operator's HQ.

**Visual departure from the rest of the app:** dark theme. `#0F0F11` page bg, `#16161A` cards, light text. The intent is unmistakable: *"You're inside the operator console. The actions you take here can affect every tenant."* HQ is also the only surface with a small "Tulala admin · v0.3 prototype" identity in the bottom-right and an "Everything. Read-mostly." motto in the topbar.

**HQ roles** (separate from agency roles): `support` / `ops` / `billing` / `exec`. Each role sees a different page set — the role chip selector on the topbar both changes the role and re-renders the visible nav.

| HQ Role | Sees pages |
|---|---|
| **support** | Today + Tickets only |
| **ops** | Today + Incidents + Jobs + Network signups + Hub queue |
| **billing** | Today + Subscriptions + Failed payments + Refunds |
| **exec** | Today + Everything (read-mostly) — the full set: Tenants / Users / Network / Billing / Operations / Settings |

**Today (HQ).** Status cards: `Open incidents` / `New tickets` / `Hub submissions` / `Failed jobs`. Below: live incidents panel + recent support tickets + recent signups + hub submissions queue.

**Tenants page.** Every agency + client workspace, searchable, with plan, MRR, last-active. Click a row → `tenant-detail` drawer (impersonate, suspend, plan-change history).

**Users page.** Every user account across all tenants. Filter by tenant.

**Network page.** Public-network curation: hub feed approvals, featured-talent picks.

**Billing page.** Stripe-side view: failed charges, refund queue, dunning state.

**Operations page.** Job queues, deploy log, feature flags, runbooks.

**Settings.** Platform config (rate limits, feature flag definitions, secrets reference).

**Impersonate banner.** When an HQ user clicks "Impersonate" on a tenant, the rest of the app renders for that tenant *with a persistent banner across the top* — never silent. The banner has a single `Exit impersonation` button.

**Production translation:**
- HQ is a separate app or a separate route group (`/hq/*`) with its own auth gate (Tulala employee email + 2FA, no SSO into customer tenants).
- `HqRole` lives on the `tulala_hq_users` table — completely separate from `agency_members`.
- Impersonation must write a row to `impersonation_audit` and surface in the customer's activity log retroactively.

---

## 20. DrawerShell upgrades — sizes + drag-resize

`DrawerShell` in `_primitives.tsx` was upgraded for the inquiry workspace. The base behavior (slide-in, ESC close, body scroll lock, sticky footer) is unchanged. Two new affordances:

### 20.1 Size modes

`drawer.size` is a closed union: `"compact" | "half" | "full"`.

| Size | Width | Used for |
|---|---|---|
| **compact** | ~520px | Most existing drawers (talent-profile, branding, etc.). Default. |
| **half** | 50vw | Inquiry workspace default — leaves the underlying page legible behind the drawer. |
| **full** | 92vw | When the user wants the workspace to take over (drag to expand, or click the "expand" icon in the header). |

A 3-button toolbar in the top-right of the drawer (compact / half / full pictograms) sets the size. State is per-drawer-open — closing and re-opening resets to the drawer's default.

### 20.2 Drag-resize on the left edge

The left edge of the drawer is a 6px-wide drag handle. Mouse down → drag → live resize. Releasing snaps to the nearest of the three size modes (so a drawer can't end up at an arbitrary 728px width that the next user wouldn't reproduce).

**Why the snap.** Free-form widths sounded right at first but produced an inconsistent scene every time someone screenshotted the drawer. Snapping to three named modes keeps the design system honest — every drawer is one of three widths, period.

**Production translation:**
- Size mode should persist per-drawer-id in localStorage so a user's preference for the inquiry workspace doesn't reset every page.
- The drag handle should debounce position updates to avoid layout thrash on slower hardware.

---

## 21. ControlBar — surface-aware

The dark `ControlBar` at the top of the prototype changed shape. It now switches its dimension list based on `state.surface`:

| Surface | Dimensions exposed |
|---|---|
| **workspace** | Surface · Plan · Role · alsoTalent · Page |
| **talent** | Surface · talentPage |
| **client** | Surface · clientPlan · clientPage |
| **platform** | Surface · hqRole · platformPage |

URL state syncs accordingly: `?surface=client&clientPlan=pro&clientPage=today` is a deep link to a specific scene.

The ControlBar is **prototype-only** and gets dropped in the production port (see §13 step 6). The surface a user lands on is determined by their session.

---

## 22. Where the work is in source

Quick lookup if you need to find a specific thing:

| Looking for | File · key symbols |
|---|---|
| The inquiry workspace drawer body | `_workspace.tsx` → `InquiryWorkspaceDrawer`, `RequirementGroupsPanel`, `OfferInner` |
| Two-thread messaging UI | `_workspace.tsx` → `MessageColumn`, `ThreadTabs`, `Composer` |
| Inquiry stage timeline pill row | `_workspace.tsx` → `StageStrip` |
| RICH_INQUIRIES fixture | `_state.tsx` → `RICH_INQUIRIES`, `INQUIRY_STAGES`, `INQUIRY_STAGE_META` |
| Talent identity + filter helpers | `_talent.tsx` → `MY_TALENT_PROFILE`, `myInquiries()`, `myStatusOn()` |
| Client today page + offer rows | `_client.tsx` → `ClientTodayPage`, `ClientInquiryRow` |
| HQ dark theme tokens | `_platform.tsx` → `HQ_COLORS` |
| Drawer size/drag logic | `_primitives.tsx` → `DrawerShell` (search `drag` and `size`) |
| All drawer ids (the registry) | `_state.tsx` → `DrawerId` union |

---

**Anything unclear?** The prototype itself is the source of truth. Open a scene, click around, then come back here. Don't reverse-engineer from screenshots — the live state-driven UI tells you more than any frame can.

---

## 23. Unified palette (BottomActionFab) — 2026-05-01

**One palette, three scopes (Create / Recent / Ask AI), two entry points (FAB + ⌘K), one mental model.** Replaces the legacy `EmbeddedCommandPalette` (deleted) and the standalone topbar Search modal. The mobile experience drove the redesign; the desktop ⌘K experience comes along for free.

### 23.1 What it is

A native HTML `popover="auto"` element rendered by `BottomActionFab` in [page.tsx](../../src/app/prototypes/admin-shell/page.tsx). The browser owns light-dismiss (outside-click + Escape + scroll-up dismiss on iOS) and top-layer promotion; React owns animation, focus, query state, keyboard nav, and AI seeding.

**Surface footprint:**

| Viewport | Layout | Trigger |
|---|---|---|
| ≥ 768px (desktop/tablet) | 340px popover anchored above the FAB; backdrop transparent | FAB · `⌘K` · topbar Search pill |
| < 768px (phone) | Full-width bottom sheet, 82vh max, top-rounded; backdrop dimmed; drag handle at top (tap to close); search input at bottom (thumb reach) — `flex-direction: column-reverse` flips internal order | FAB only (topbar pills hide) |

The same DOM element handles both — there is no separate mobile component. CSS media query `@media (max-width: 767px)` overrides position, dimensions, border radius, flex direction, and backdrop opacity.

### 23.2 The single input + scope tabs

```
┌─────────────────────────────────────┐
│ 🔍  Search, create, or ask Tulala…  esc │  ← input always visible at top of body
├─────────────────────────────────────┤
│ [Create]  [Recent · 2]  [Ask AI]    │  ← tabs are scopes for the input
├─────────────────────────────────────┤
│ ▶ New inquiry  · Capture a lead   ↵ │  ← selected row gets ↵ hint
│   New booking · Confirmed job   GB  │
│   Add talent  · Create a roster GT  │
│   …                                 │
│   Go to Roster · Workspace surface  │  ← navigate items inline (icon: arrow-right)
│   …                                 │
│   ✨ Ask AI: <query>             ↵  │  ← always-visible fallback row when query non-empty
└─────────────────────────────────────┘
```

- **Create scope** mixes create-actions (`New inquiry`, `Add talent`) with navigate-actions (`Go to Roster`) so a single keystroke can either create or jump.
- **Recent scope** shows drafts + last-created items; filters by the same query.
- **Ask AI scope** is a chat panel with FAQ-matched mock replies. Auto-sends when the user clicks the Ask AI fallback row (or hits Enter when no Create matches).

### 23.3 Surface-aware items

`BottomActionFab.items` is a per-surface array of `{ id, label, sub, icon, shortcut?, canDo, run }`. Navigate items are appended from `WORKSPACE_PAGES` / `TALENT_PAGE_META` / `CLIENT_PAGE_META` / `PLATFORM_PAGE_META`. The `canDo` predicate uses `meetsRole` and plan checks to filter what the current user can actually do — viewers don't see "Add talent," free plans don't see "Add client."

**Production translation:** swap the static Recent mock data for a query against the activity feed. Swap the Ask AI mock for the LLM endpoint. The Create/Navigate items can stay statically defined per surface; just respect the same `canDo` shape.

### 23.4 Keyboard contract

| Key | Behavior |
|---|---|
| `⌘K` / `Ctrl-K` | Open palette (registered globally by `useKeyboardLayer`) |
| `↑` / `↓` | Move selection within Create scope; wraps |
| `Enter` | Run selected item (or Ask AI with current query if no matches) |
| `Esc` | Clear query if non-empty, else close palette |
| Type | Filter Create + Navigate live; switches to Create scope automatically |

The `↵` hint pill replaces the row's normal shortcut indicator on the selected row to show *what Enter will do*. Mouse hover does NOT override keyboard selection — match Linear/Raycast UX.

### 23.5 Window-event API

Two events on `window`, declared in [_state.tsx](../../src/app/prototypes/admin-shell/_state.tsx) as constants — **never use raw strings**:

```ts
import { FAB_PALETTE_OPEN_EVENT, FAB_PALETTE_CHANGED_EVENT, type FabPaletteChangedDetail } from "./_state";

// Anyone can fire this to open the palette:
window.dispatchEvent(new Event(FAB_PALETTE_OPEN_EVENT));

// BottomActionFab broadcasts this on every open/close:
window.addEventListener(FAB_PALETTE_CHANGED_EVENT, (e) => {
  const detail = (e as CustomEvent<FabPaletteChangedDetail>).detail;
  // detail.open === true | false
});
```

**Producer:** `BottomActionFab` listens for `FAB_PALETTE_OPEN_EVENT` and broadcasts `FAB_PALETTE_CHANGED_EVENT` whenever its `open` state flips.
**Consumer:** `WorkspaceShell` listens for the changed event and folds `paletteOpen` into `useKeyboardLayer({ isModalOpen })` so global shortcuts (`G I`, `j/k`, etc.) suppress while the palette is up.

This decouples ⌘K wiring from the palette's lifecycle. Adding a third trigger (e.g., a help-page button) is one line.

### 23.6 Files touched (this session)

| File | Why |
|---|---|
| [page.tsx](../../src/app/prototypes/admin-shell/page.tsx) | `BottomActionFab` (the popover, search input, scope tabs, kbd nav, mobile sheet CSS), `FabRecentPanel` (now query-filtered), `FabAiPanel` (sendRef for stale-closure fix), event broadcast |
| [_pages.tsx](../../src/app/prototypes/admin-shell/_pages.tsx) | `WorkspaceShell` listens to `FAB_PALETTE_CHANGED_EVENT`, dispatches `FAB_PALETTE_OPEN_EVENT` from ⌘K + topbar pill; topbar Search pills get `data-tulala-topbar-search-right` for the mobile-hide rule |
| [_state.tsx](../../src/app/prototypes/admin-shell/_state.tsx) | `FAB_PALETTE_OPEN_EVENT`, `FAB_PALETTE_CHANGED_EVENT`, `FabPaletteChangedDetail` type |
| [_primitives.tsx](../../src/app/prototypes/admin-shell/_primitives.tsx) | `DrawerShell` hydration fix — gated `showSizeToolbar` behind a `mounted` flag so SSR and first CSR agree (see §23.8) |
| [_workspace.tsx](../../src/app/prototypes/admin-shell/_workspace.tsx) | **Deleted** the legacy `EmbeddedCommandPalette` + helpers (`CmdResult`, `CmdSection`, `filterCmd`, `flattenSections`) — ~444 lines |

### 23.7 Mobile sheet specifics

The mobile layout uses `flex-direction: column-reverse` so the LAST DOM child paints at the visual TOP. DOM order:

```
[search bar]  [scope tabs]  [body: Create/Recent/AI]  [drag handle]
```

Visual order on phone (column-reverse):

```
[drag handle]   ← top
[body]          ← middle (scrollable)
[scope tabs]
[search bar]    ← bottom (thumb reach)
```

The drag handle is a real `<button aria-label="Close palette">` with `cursor: pointer` and `onClick={hidePopover}`. Full drag-to-dismiss isn't wired (the popover API doesn't expose touch deltas) but tap-to-close gives the affordance honest feedback.

### 23.8 The DrawerShell hydration fix

`useViewport()` returns `"desktop"` on the server (no `window`) but the actual viewport on the client. Before the fix, `DrawerShell` rendered its size toolbar conditionally on `viewport !== "phone"`, so SSR rendered the toolbar but a phone client did not — React reported a hydration mismatch and the surrounding Suspense boundary stayed stuck in its hidden SSR shell. Symptom: the FAB had `width: 52px` in computed styles but a `0,0,0,0` bounding rect because its hidden ancestor never unmounted.

**Fix:** gate viewport-dependent rendering behind a `mounted` flag (false during SSR + first CSR, true after `useEffect`). Both renders agree; the toolbar appears on the next paint. Same pattern applies anywhere `useViewport()` drives conditional JSX. See [_primitives.tsx#L3919-3929](../../src/app/prototypes/admin-shell/_primitives.tsx#L3919).

### 23.9 What was removed

**Deleted:** `EmbeddedCommandPalette` and its helper types (`CmdResult`, `CmdSection`, `CmdResultType`, `filterCmd`, `flattenSections`) — ~444 lines from `_workspace.tsx`. The functionality folded into `BottomActionFab`:

- Quick actions → Create scope items (now also surface-aware for talent/client/platform).
- Page navigation → Navigate items appended to the Create scope.
- Inquiry/talent/setting search → not yet ported; Ask AI catches the residual queries today. Production should rebuild these as proper search providers backed by the database.

### 23.10 Coming up — known gaps + future ideas

A backlog of things this session intentionally didn't ship. Pick from the top down; the Now items are the closest to "should exist."

**Now (small, well-scoped):**
- **Keyboard nav inside Recent + Ask AI** — currently only Create scope responds to ↑/↓/Enter. Same `selIdx` pattern can extend.
- **`↑` clamp vs. wrap** — current behavior wraps from first → last. Linear-style clamp is more predictable. Either is fine; pick one and document.
- **Inquiry / talent / setting search** — three categories the legacy palette had that didn't get ported. Add as additional Create-list sections (with subheadings) or as separate scopes.
- **Telemetry** — wire the existing `track()` in `_state.tsx` into `runSelected()`, `goToAi()`, the open/close toggle, and Ask AI sends. Suggested events: `command_palette.opened`, `command_palette.action_run` `{ id, scope, queryLength }`, `command_palette.ask_ai` `{ queryLength, hadCreateMatches }`.

**Soon (replace mock data):**
- `FabRecentPanel.drafts` / `recent` are hardcoded. Should query the workspace activity feed for the current user, filtered to recent edits + draft profiles + recent inquiries.
- `FabAiPanel.send()` does FAQ substring matching. The `seedQuestion` prop + `sendRef` pattern is production-ready — swap the body for a streaming endpoint (Anthropic SDK, OpenAI, whatever).

**Later (real upgrades):**
- **Real drag-to-dismiss on the mobile sheet** — popover API doesn't expose touch deltas, so today the drag handle is tap-to-close. A custom touch handler on the handle that tracks `touchmove` deltaY and calls `hidePopover()` past a threshold gets you proper sheet behavior.
- **Voice input on Ask AI** — a mic button next to the AI input, MediaRecorder + Whisper or browser SpeechRecognition. Pairs nicely with the Ask AI tab being a peer of Create.
- **Contextual ranking of Create items** — surface the most relevant create-action by current page. On Roster → "Add talent" floats up; with unread inquiry → "Reply to <client>" surfaces. Re-rank the surface-specific items array based on `state.page` + recent activity.
- **Inline result types on the search results** — small `Inquiry` / `Talent` / `Setting` chip on the right of each result row so users can tell at a glance what they're about to open. Especially needed once inquiry/talent search lands.
- **Pinned actions** — let users pin the 1-3 actions they fire most. Fewer keystrokes to the common case.

**Won't fix (intentional choices):**
- Recent tab doesn't filter on Create's typed query unless the user switches to the Recent tab. By design — typing on Create filters Create; switching to Recent filters Recent. Keeping a single filter scope per tab matches Linear / Raycast behavior.
- Mouse hover does NOT steal keyboard selection. Verified intentional after testing — `onMouseMove` was removed because it fought with kbd nav.

### 23.11 Production translation checklist

When porting the palette from prototype to production:

1. Replace `useProto()` calls with the real session/permission hooks. `meetsRole` / `meetsPlan` shapes already match.
2. Replace `RICH_INQUIRIES` and `MOCK_*` mock data with real queries. Recent items: activity feed. Ask AI: LLM endpoint with streaming.
3. Move the popover element + its `<style>` block into a dedicated `CommandPalette` component under `web/src/components/admin/`. Keep the event-name constants colocated or in a shared `events.ts`.
4. Drop the `data-tulala-bottom-fab` data attribute or rename to `data-command-palette` to match production naming.
5. Wire telemetry: dispatch `track("command_palette.opened")` on toggle-open, `track("command_palette.action_run", { id, scope })` on `runSelected`.
6. Remove the prototype's mobile-hide CSS rule for topbar pills if production wants them visible across breakpoints; the rule is purely a prototype simplification.
7. Decide whether ⌘K opens this palette OR a more powerful global search (e.g., Algolia-backed). The current design assumes the palette IS the global search.

---

## 24. Trust & Verification system — 2026-05-01

**Phase 1 + Phase 2.1–2.4 shipped end-to-end in the prototype.** Three concerns separated cleanly (account / claim / trust), 8 verification types, platform-admin registry, risk score, contact gating, disputed-claim resolution. Out of scope: Phase 2.5 (real Instagram Graph API webhook) and the public storefront `/[profileCode]` route — both deferred until backend exists.

> **The full system handoff lives in [`./TRUST.md`](./TRUST.md)** — read that one first when migrating. This section summarizes what's there + how it ties into production migration.

### 24.1 The three concerns (load-bearing — don't conflate)

The trust system separates three concepts that conflict if mixed:

1. **Account verification** — security signal. Email, phone, ID. **Never a public badge.** Drives security flows + risk score.
2. **Profile claiming** — ownership signal. Says "this profile belongs to this user." Agency-created profiles need talent acceptance via emailed invite.
3. **Profile trust verification** — public credibility signal. Public-facing badges (Instagram / Tulala / Domain / Business / Agency Confirmed).

Hard rule: `account.emailVerified === true` does NOT produce a public badge. Encoded in `VERIFICATION_TYPE_META[type].publicEligible` + `ProfileVerification.publicBadgeEnabled`. Production must keep this separation.

### 24.2 The 8 verification types

| Type | Concern | Default review | Default visibility | Default tier gate | Evidence req? | Default expiry | Phase |
|---|---|---|---|---|---|---|---|
| `instagram_verified` | Trust | Manual (DM lookup) | `public_profile` | All | No | Never | 1 — enabled |
| `tulala_verified` | Trust | Manual (admin curates) | `public_profile` | All | No | Never | 1 — enabled |
| `agency_confirmed` | Trust | Automated (agency adds) | `public_profile` | All | No | Never | 1 — enabled |
| `phone_verified` | Account | Automated (OTP) | `admin_only` | All | No | 365d | 2 — disabled by default |
| `id_verified` | Account | Manual | `admin_only` | Pro / Portfolio | **Yes** | 730d | 2 — disabled by default |
| `business_verified` | Trust | Manual | `public_profile` | Pro / Portfolio | Yes | 365d | 2 — disabled by default |
| `domain_verified` | Trust | Automated (DNS TXT) | `public_profile` | Portfolio only | No | 90d | 2 — disabled by default |
| `payment_verified` | Account | Automated (Stripe ping) | `admin_only` | All | No | 365d | 2 — disabled by default |

Defaults baked into `SEED_VERIFICATION_METHOD_CONFIG` (`_state.tsx`). Platform admin overrides every column at runtime via the `platform-verification-methods` console.

### 24.3 New drawers added (10 total)

All routed in `_drawers.tsx` `DrawerRoot` switch, all with `_help.tsx` entries, all in `DRAWERS.md` under the "Trust & Verification" section.

| DrawerId | Audience | Purpose |
|---|---|---|
| `trust-verification-queue` | W-admin | Review queue: tabs, method filter, search, bulk-approve, detail with evidence + activity log + risk score + decision buttons |
| `trust-disputed-claims` | W-admin | Dispute resolution: release / uphold / remove |
| `platform-verification-methods` | HQ | Registry console: per-method enable / review-mode / visibility / tier-gate / evidence / expiry + audit log |
| `talent-trust-detail` | Talent | Dashboard: Trust Health panel + IG / Tulala flows + per-method CTAs + contact gate |
| `talent-claim-invite` | Talent | Claim / dispute / report an agency-created profile |
| `talent-phone-verify` | Talent | OTP flow (auto-approve) |
| `talent-id-verify` | Talent | ID upload (manual review) |
| `talent-business-verify` | Talent | VAT + registry URL (manual review, evidence-required-aware) |
| `talent-domain-verify` | Talent | DNS TXT verification (auto-approve, simulated) |
| `talent-payment-verify` | Talent | Stripe authorization-then-refund (auto-approve, simulated) |

### 24.4 New state model (in `_state.tsx`)

```ts
// Phase 1
VerificationSubjectType   = "talent_profile" | "client_profile" | "brand_profile" | "agency_profile" | "user_account"
VerificationContext       = "hub" | "agency" | "studio" | "client" | "platform"
VerificationMethod        = "instagram_dm" | "manual_review" | "agency_confirmation" | "domain" | "payment" | "phone" | "email"
VerificationType          = (the 8 above)
VerificationRequestStatus = "draft" | "pending_user_action" | "submitted" | "in_review" | "approved" | "rejected" | "expired" | "cancelled" | "needs_more_info"
VerificationActiveStatus  = "active" | "revoked" | "expired"
ProfileClaimStatus        = "unclaimed" | "invite_sent" | "claimed" | "disputed" | "released"

VerificationRequest      = { id, subjectType, subjectId, requestedByUserId, context, agencyId?, hubId?, clientId?,
                             method, verificationType, status, verificationCode?, claimedIdentifier?, targetUrl?,
                             evidenceUrl?, evidenceNote?,            // ← Phase 1 final
                             publicMessage?, adminNotes?, rejectionReason?,
                             reviewedByUserId?, reviewedAt?, expiresAt?, createdAt, updatedAt }

ProfileVerification      = { id, subjectType, subjectId, verificationType, identifier?, publicBadgeEnabled,
                             verifiedByUserId?, verifiedAt, status, expiresAt?, metadata? }

ProfileClaimInvitation   = { id, profileId, profileType, email?, phone?, invitedByUserId, invitedByAgencyId?,
                             tokenHash, status, acceptedByUserId?, acceptedAt?, expiresAt, createdAt, updatedAt }

// Phase 2
VerificationReviewMode    = "automated" | "manual" | "hybrid"
VerificationVisibility    = "public_profile" | "admin_only" | "internal"
VerificationTierGate      = "basic" | "pro" | "portfolio" | "all"

VerificationMethodConfig  = { type, enabled, reviewMode, visibleOn[], availableToTiers[],
                              evidenceRequired, expiresAfterDays? }
VerificationMethodAuditEntry = { id, methodType, changedByUserId, changeKind, before, after, at }

TalentContactGate         = "open" | "verified_only" | "trusted_only"
```

### 24.5 New context API (`useProto()`)

Reads:
- `verificationRequests`, `profileVerifications`, `profileClaims`, `claimStatusByTalent`
- `verificationMethodConfigs`, `verificationMethodAudit`
- `getTrustSummary(subjectType, subjectId)` — **single source of truth** for every trust UI surface
- `getRiskScore(subjectType, subjectId)` — 0–100 heuristic
- `isVerificationMethodEnabled(type)`, `getVerificationMethodConfig(type)`, `listEnabledMethods()`
- `getTalentContactGate(talentId)`, `canClientContactTalent(talentId, clientId)`

Writes:
- `createVerificationRequest`, `updateVerificationRequest`, `approveVerificationRequest`, `rejectVerificationRequest`
- `revokeProfileVerification`, `revokeInstagramOnHandleChange`
- `sendProfileClaimInvite`, `resolveProfileClaimDispute(claimId, "release"|"uphold"|"remove", adminNotes?)`
- `updateVerificationMethod(type, patch)` — emits one audit entry per modified key
- `setTalentContactGate(talentId, gate)`

### 24.6 New primitives (`_primitives.tsx`)

- **`TrustBadgeGroup`** — pill-style badge row. Surface-aware: public surfaces hide admin-only methods + filter out badges of disabled methods; admin surfaces show disabled-method badges with a grey-dot annotation + hover tooltip.
- **`ProfilePhotoBadgeOverlay`** — photo-corner badge stack. Instagram uses authentic gradient `linear-gradient(135deg, #F09433 0%, #E6683C 25%, #DC2743 50%, #CC2366 75%, #BC1888 100%)`; Tulala is forest-green `#0F4F3E` with white checkmark. White ring + soft shadow. Stack-overlap rendering.
- **`ProfileClaimStatusChip`** — claim status pill (Unclaimed / Invite sent / Claimed / Disputed / Released).
- **`RiskScorePill`** — 0–100 score, color-coded (≥70 healthy green / ≥40 watchful amber / <40 review red). Admin surfaces only — never publicly visible.

### 24.7 Where badges + risk scores appear

| Surface | Component | File | Variant |
|---|---|---|---|
| Roster cell | `RosterTrustCell` | `_pages.tsx` | `surface="admin_roster"` + Disputed/Invite-sent claim chips |
| Roster card photo | `RosterPhotoBadgeOverlay` | `_pages.tsx` | corner overlay |
| Public profile preview | `TalentPublicPreviewDrawer` | `_talent_drawers.tsx` | corner overlay + `surface="public_profile"` strip |
| Discover card | `ClientDiscoverPhotoBadge` + `ClientDiscoverTrustRow` | `_client.tsx` | corner overlay + public strip |
| Discover detail sheet | `ClientTalentDetailSheet` hero | `_client.tsx` | corner overlay + public strip + Send-inquiry gate |
| Chat header (3 POVs) | `ParticipantTrustStrip` | `_messages.tsx` | `surface="chat_header"` |
| Inquiry workspace peek | `InquiryTrustPanel` | `_drawers.tsx` | client + talent two-column with `RiskScorePill` |
| Trust queue detail | inline | `_drawers.tsx` | full timeline + evidence + `RiskScorePill` |
| Disputed claim detail | inline | `_drawers.tsx` | risk score + dispute reason + 3 resolutions |
| Talent Trust dashboard | `TalentTrustHealthPanel` | `_drawers.tsx` | own `RiskScorePill` + earn-+X suggestions |

### 24.8 Critical wiring rules

These rules are load-bearing. Production must reproduce them.

**24.8.1 Email-verified ≠ public badge.** `account.emailVerified` flows into the risk score (+5) but never produces a `ProfileVerification` row. Don't auto-issue public badges from account-security signals.

**24.8.2 Method-disable cascade.** When platform admin flips `enabled: true → false`:
- Confirm-disable modal warns about active badges.
- `getTrustSummary` resolves each badge with `methodEnabled = isVerificationMethodEnabled(type)`.
- Public surfaces filter out badges where `methodEnabled === false` — they disappear instantly.
- Admin surfaces show them with a grey-dot annotation + tooltip explaining they survive until expiry.
- Talent-side per-method drawers short-circuit to `MethodDisabledNotice` so new requests can't start.

**24.8.3 Required-evidence gate.** `cfg.evidenceRequired` is descriptive metadata at the platform-admin level. ID + Business drawers read it and gate submission. Phone / Domain / Payment ignore it because their flow is itself evidence (OTP, DNS lookup, payment hold). Mirror the ID/Business pattern if a future method needs to honor it.

**24.8.4 Risk score formula.** Lives in `getRiskScore`:
- Baseline 50
- +12 per active badge
- +10 if `claimStatus === "claimed"`, −25 if `"disputed"`
- +5 if `account.emailVerified`, +5 if `account.phoneVerified`
- −8 per recent rejected/expired request
- Clamped 0–100

Heuristic only. Never expose to public users. Production should rebase to a real risk engine.

**24.8.5 Contact gate enforcement.** `canClientContactTalent(talentId, clientId)`:
- `"open"` → always true
- `"verified_only"` → client must have at least one active `ProfileVerification`
- `"trusted_only"` → client's score must be ≥ 60

Currently enforced at one call site: `ClientTalentDetailSheet` Send-inquiry button. Add more enforcement points by calling the helper and gating the button.

**24.8.6 Activity log derivation.** The Trust queue detail timeline is synthesized from `request.createdAt` / `updatedAt` / `reviewedAt` + current status — there is **no separate event-log table**. Production must replace this with an event-sourced log so multi-hop transitions preserve all timestamps.

**24.8.7 Audit log for the registry.** Every `updateVerificationMethod(type, patch)` emits one `VerificationMethodAuditEntry` per modified key. Detail panel shows the last 8 entries scoped to selected method. Production wires to a real audit table.

### 24.9 Production-port checklist (trust-specific)

Migration-time TODOs. Each is a backend-shaped task:

1. **Schema.** Create three tables: `verification_requests`, `profile_verifications`, `profile_claim_invitations`. Match the type shapes in §24.4 verbatim. Add a fourth `verification_method_configs` table seeded from `SEED_VERIFICATION_METHOD_CONFIG`. Fifth: `verification_method_audit` for the registry trail.
2. **`getTrustSummary` RPC.** This single function feeds every UI surface — must land as a low-latency endpoint or denormalized read model. Cache aggressively (badges + claim status change rarely; pending requests change per-action). Output shape is fixed: don't drift it.
3. **Platform-admin registry endpoint.** `updateVerificationMethod` is the only write path; gated to platform-admin role. Audit entry persisted as a side effect, never as a separate call from the client.
4. **Method-disable cascade is a read-time filter, not a write-time mutation.** Don't touch active `ProfileVerification` rows when a method is disabled — the cascade lives in `getTrustSummary` (sets `methodEnabled` per badge) and in the surface-aware filters in `TrustBadgeGroup` / `ProfilePhotoBadgeOverlay`. This means re-enabling a method instantly restores the badges. Production should preserve this property.
5. **IG verification (real).** Replace manual DM-lookup. Webhook receiver at `/api/verify/instagram/webhook`, validate the signature with the Graph API secret, parse the inbound DM body, match against pending `verification_requests` where `verificationCode === code AND status === "submitted"`, auto-approve on match. Falls back to manual review on no-match within 72h.
6. **DNS resolution (real).** `talent-domain-verify` simulates a 1.5s lookup. Replace with `/api/verify/domain` calling a real DNS resolver, with retry semantics for propagation lag (typically 5–30 min). Auto-approve on match.
7. **Stripe payment ping (real).** `talent-payment-verify` simulates auto-approve. Wire to `PaymentIntent` (`capture_method: manual` then `payment_intents.cancel`). Treat the authorization as verification proof; never capture the funds.
8. **OTP via Twilio Verify (real).** `talent-phone-verify` shows the code inline for the demo. Replace with real SMS dispatch + server-side code validation. Rate-limit per phone number.
9. **Secure ID upload.** `talent-id-verify` accepts a URL. Replace with direct upload via signed URL to S3/R2, virus scan, optional Persona/Onfido integration for OCR + face match, auto-redact PII at rest. **Never** allow the document URL to leak to client-facing surfaces — admin-review only.
10. **Notifications.** When a badge is approved / rejected / expires / revoked, the talent must be notified (email + in-app). Currently the prototype only renders state changes inline.
11. **Activity log persistence.** Move from synthesized timeline to event-sourced records. Append-only table with `subject_type`, `subject_id`, `kind`, `actor_id`, `payload`, `at`.
12. **Public storefront badges.** The real `/[profileCode]` route doesn't render trust badges yet — only the in-prototype preview drawer does. Wire `getTrustSummary("talent_profile", profileCode)` into the SSR data layer + render `ProfilePhotoBadgeOverlay` + `TrustBadgeGroup` at `surface="public_profile"`.
13. **Telemetry.** `track("trust.request_created", { type, method })` on submit; `track("trust.approved" | "trust.rejected", { type, days_to_decision })` on admin action; `track("trust.method_toggled", { type, enabled })` on platform-admin change; `track("trust.contact_gate_set", { gate })` on talent gate change.

### 24.10 Where the Trust work is in source

| Looking for | File · key symbols |
|---|---|
| Schema, types, seeds, all context fns | `_state.tsx` → `VerificationType` (~5410), `VerificationRequest` (~5440), `VerificationMethodConfig` (~5450), `SEED_VERIFICATION_METHOD_CONFIG` (~5790), `getTrustSummary` (~6927), `getRiskScore` (~7012), `canClientContactTalent` (~7045) |
| Admin queue + detail panel + activity log | `_drawers.tsx` → `TrustVerificationQueueDrawer` (~12894), `ActivityLogPanel` (~12816), `SubjectRiskScoreRow` (~12805) |
| Disputed-claim resolution | `_drawers.tsx` → `DisputedClaimsDrawer` (~13409) |
| Platform-admin registry console | `_drawers.tsx` → `PlatformVerificationMethodsDrawer` (~14290), `ConfigRow` / `vmSelectStyle` / `vmChipStyle` |
| Talent dashboard + Trust Health panel + contact gate | `_drawers.tsx` → `TalentTrustDetailDrawer` (~13684), `TalentTrustHealthPanel` (~13614) |
| Per-method talent drawers | `_drawers.tsx` → `TalentPhoneVerifyDrawer`, `TalentIdVerifyDrawer`, `TalentBusinessVerifyDrawer`, `TalentDomainVerifyDrawer`, `TalentPaymentVerifyDrawer` (~14633–14945) |
| IG DM modal | `_drawers.tsx` → `InstagramVerificationInstructions` |
| Inquiry trust panel (client + talent + risk score) | `_drawers.tsx` → `InquiryTrustPanel` (~10537) |
| Chat header strip (admin / talent / client POVs) | `_messages.tsx` → `ParticipantTrustStrip` |
| Discover trust filter chips + Send-inquiry gate | `_client.tsx` → `ClientDiscoverPage` filter row (~1330), `ClientTalentDetailSheet` Send button (~1818) |
| Roster trust cell + photo overlay | `_pages.tsx` → `RosterTrustCell` (~6003), `RosterPhotoBadgeOverlay` (~6010) |
| Topbar split nav badge + settings count badges | `_pages.tsx` → `WorkspaceTopbar` (~542), `WorkspacePageView` settings rows (~8378) |
| Talent public preview with badges | `_talent_drawers.tsx` → `TalentPublicPreviewDrawer` (~5766) |
| Badge primitives | `_primitives.tsx` → `TrustBadgeGroup` (~2540), `ProfilePhotoBadgeOverlay` (~2321), `ProfileClaimStatusChip` (~2267), `RiskScorePill` (~2517) |
| Help registry entries (10 trust drawers) | `_help.tsx` → "Trust & Verification" block at end |
| Drawer-by-drawer reference | `./DRAWERS.md` → "Trust & Verification" section |
| Roadmap status (WS-5) | `./ROADMAP.md` → §3.5 audit findings + §4 WS-5 sub-tasks 5.9–5.23 |
| Full handoff (read first) | `./TRUST.md` |

### 24.11 Out of scope (deferred until backend)

- **Phase 2.5 — Real Instagram Graph API webhook** (ROADMAP 5.22). Needs API credentials + signature validation + a webhook endpoint.
- **Public storefront badges on `/[profileCode]`** (ROADMAP 5.23). Needs SSR data wiring.
- **Real risk engine.** Heuristic in `getRiskScore` is a stand-in. Production should plug in a real signals platform (account age, behavior fingerprints, fraud patterns).
- **Notifications on badge state changes.** Talent should be told when something is approved, rejected, expired, revoked.
- **Photo badge overlay on the actual public route.** Currently only renders inside the prototype's preview drawer.

---

## 25. Sprint 2026-05-01 — Modernization + safety + handoff prep

This section captures the state of the prototype as of the live-handoff cut (commit `5e0ce66`). Read it alongside §3 for the file map and §13 for the production-port plan.

### 25.1 New files added in this sprint

| File | Purpose | Notes for prod port |
|---|---|---|
| `_admin-tour.tsx` | First-time admin tour, now a thin wrapper around `<GuidedTour>` | Steps array + storage key only — actual tour logic lives in `_guided-tour.tsx` |
| `_guided-tour.tsx` | Reusable WS-9.7 guided-tour primitive — SVG mask spotlight, tooltip card, `getBoundingClientRect`-based anchoring | Promote to `web/src/components/admin/GuidedTour/*`. API: `<GuidedTour storageKey steps sessionKey? durationLabel? kickoffDelayMs? />` |
| `_csv-parser.ts` | Pure CSV parsing helpers (`parseTalentCsv`, `parseClientCsv`, `findColumn`, `isValid*Row`) | Promote to `web/src/lib/admin/csv/*`. Production should swap naive comma-split for `papaparse` |
| `_csv-parser.test.ts` | 14 unit tests via `tsx --test` | Wire into `npm run ci` once the prototype CSV path ships in prod |
| `_modern-features.tsx` | `<PasskeysCard>` (WebAuthn) + `<GalleryFxCard>` (WebGPU) | Both real-API. Passkey flow needs server-side challenge issuance + credential storage. WebGPU gallery is pure-frontend, ship as-is |
| `_notifications-hub.tsx` | `<NotificationsBell>` — bell icon + 3-bucket popover (Action Needed / Updates / System) | Reads `pendingTalent` from ctx + localStorage for read/dismiss state. Replace localStorage with backend-derived state in prod |
| `_profile-store.ts` | Module-scoped subscribable store (`useSyncExternalStore`) for shared profile draft across QuickAdd/Wizard/Shell | Mirror the contract in prod: `useProfileDraft(key)`, `patchProfileDraft`, `readProfileDraft`, `clearProfileDraft`. SW IndexedDB mirror is optional |
| `talent/profile/edit/page.tsx` | URL-route shim — 308-redirects to the prototype with `?surface=talent&drawer=talent-profile-edit` | Canonical entrypoint for deep-links into the talent edit-profile drawer. Production keeps this URL stable; the redirect target may differ once routes are split |
| `public/tulala-prototype-sw.js` | Service Worker — IndexedDB-backed offline drafts | Prototype-only. Production SW should only register if PWA install is desired |

### 25.2 Updated `_state.tsx` shape

New types and ctx members added on top of the existing model:

| New | Where | What |
|---|---|---|
| `bulkAddClient` | ctx | WS-25.2 — append client rows from CSV. Validation: name + (contact OR email) |
| `importedClients: Client[]` | ctx | Append-only list of CSV-imported clients |
| `TalentProfile.isMinor / birthYear / guardian / minorProtections` | type extension | WS-31.6 / WS-34.8 — minor-protection model. Hard defaults: 9–17 working hours, 6h/day, chaperone, school 25h/wk |
| `"client-csv-bulk-add"` | DrawerId union | Routes to `<ClientCsvBulkAddDrawer>` |

**Demo seed:** Lina Park (`ROSTER_AGENCY` t4) is the test minor. Guardian Min-Jun Park, consent verified, full protection block. Added to inquiry RI-201 talents so the banner surfaces immediately.

### 25.3 Updated workspace surface

`_workspace.tsx`:
- `WorkspaceBody` now branches on viewport: phone / tablet+desktop (2-col tabs+rail) / wide (3-pane: private | group | rail). Wide is admin-only; client/talent POVs see one thread anyway so they keep 2-col regardless of width.
- `<MinorProtectionBanner>` mounts immediately under `<StatusStrip>` whenever any inquiry talent is flagged as a minor. **Non-dismissible by design** — protections are a legal obligation, not a UX preference. Cross-references inquiry talent names against `ROSTER_AGENCY`.

### 25.4 Native popover migrations

Three components migrated from custom outside-click + escape handlers to native `popover="auto"` + `popoverTarget`:

| Component | File | Anchor strategy |
|---|---|---|
| `BottomActionFab` panel | `page.tsx` | `position: fixed; inset: auto; bottom; right` — fixed coords because anchor is also fixed |
| `ProfileShellMobileMenu` | `_drawers.tsx` | `getBoundingClientRect()` on toggle event — top-layer kills containing-block math |
| `NotificationsBell` | `_notifications-hub.tsx` | Same `getBoundingClientRect()` pattern, with edge-clamping when bell is near viewport right |

**Watch out:** UA stylesheet sets `inset: 0; margin: auto` on `[popover]`. Must explicitly set `inset: auto` (or compute top/left/right) in the inline style or the popover renders centered. This bug was caught and fixed during browser verification — see `page.tsx:493`.

### 25.5 Notification preferences (WS-11) advanced controls

`NotificationPrefsDrawer` (`_drawers.tsx`) gains:
- Per-channel toggle matrix (already shipped — email / push / SMS for 8 notification types)
- **Batching toggle** — collapses "3 from Casa Pero" instead of 3 entries
- **DND / quiet-hours window** — `<input type="time">` start + end pickers. Workspace timezone
- **Lock-screen privacy** — three modes: Full content / Sender only / Hidden

Production maps these to a `notification_preferences` table per user with a `quiet_hours` JSONB and an enum for preview mode.

### 25.6 Dead code removed

| Component | File | Why dropped |
|---|---|---|
| `AIHelpBot` (~240 lines) | `page.tsx` | Free-floating sparkle FAB retired. Chat panel logic extracted into `BottomActionFab`'s "Ask AI" tab |
| `FeedbackButton` (~268 lines) | `_primitives.tsx` | Was creating a second FAB stack at bottom-right. Feedback is reachable via the FAB's Ask AI tab |
| `TalentProfileEditDrawer` (~40 lines) | `_talent_drawers.tsx` | `talent-profile-edit` drawer ID now routes to `TalentProfileShellDrawer` in `mode="edit-self"` |
| `<TalentMessagesFab />` mount | `_talent.tsx` | Dormant comment-only — function deleted in prior pass; mount left commented |
| `<ClientConciergeButton />` mount | `_client.tsx` | Dormant comment-only — `BottomActionFab` now serves the client surface |

### 25.7 Verification status

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:prototype-csv` | 14/14 pass |
| Browser walkthrough at desktop (1316×922) | ✓ FAB popover anchored, ✓ Notifications bell anchored, ✓ URL redirect to edit-profile drawer works, ✓ PasskeysCard renders, ✓ GalleryFxCard shows status `LIVE`, ✓ Wide layout 3-pane on RI-201, ✓ MinorProtectionBanner surfaces with all guardian/protection fields |
| Mobile viewport (375pt) | **NOT verified in-browser this sprint.** `useViewport()` returns "phone" at <768; `PhoneWorkspaceLayout` already shipped + worked previously. Re-verify before live handoff |

### 25.8 Memory file updates

`feedback_admin_aesthetics.md` was 8 days stale at sprint start. Updated 2026-05-01 with the resolution status of the three original complaints:
1. **Gold/rust accents — RESOLVED.** `COLORS.accent` migrated to `#0F4F3E` (deep forest). Guardrails in `docs/PR_CHECKLIST.md` line 11 + `docs/STYLE.md` line 182.
2. **Dead space on list surfaces — PARTIAL.** Original specific surface no longer has the offending status-tabs+filter-card pair. Treat as case-by-case when touching list pages.
3. **Opaque jargon labels — ADDRESSED for workspace nav.** Sidebar + topbar nav buttons now expose `PAGE_META[p].description` via `title=` and `aria-label=`. First-time admin tour also covers the 4 most-opaque DOM nodes.

### 25.9 Cross-track context (last 14 days, NOT admin-shell)

These tracks shipped major work in the same week and a dev implementing the dashboard will see commits from them in the log. They are **separate** systems — leave their docs alone unless integration touches them:

- **Edit-chrome / site-builder** (~25 commits 2026-04-28 → 2026-04-29). Sprint 3–5 work: iframe device preview, dispatch-routed composition mutations, contextual SectionPickerPopover, multi-select + auto-scroll, smart section recommendations, Preview toggle bridge, warm-paper input system. Lives in `web/src/app/(dashboard)/admin/site-settings/` + `web/src/app/site-builder/` (out of admin-shell scope). Tracked in `docs/builder/`.
- **Site-shell header system** (~10 commits 2026-04-29 → 2026-04-30). SiteHeaderInspector drawer + 4 operator-controllable tokens + real mobile header system + token wiring. Lives in `web/src/lib/site-shell/` + `web/src/components/site-shell/`. Out of admin-shell scope.
- **Header-inspector polish** (~6 commits 2026-04-29 → 2026-04-30). Tab IA reduction, premium restraint pass, undo, validation, Navigation row rebuild, hover-only logo edit. Same site-shell track.
- **Taxonomy + workspace enablement** (`7570b87` 2026-04-30). Master vocabulary + adaptive registration locked. Lives in `docs/taxonomy/`. Cross-references the prototype's `_taxonomy-loader.ts` but the runtime impl is server-side.

If a commit message starts with `(edit-chrome)`, `(site-shell)`, `(site-builder)`, `(header-inspector)`, `(cms)`, `(saas)`, `(builder)`, or `(taxonomy)` — it's NOT admin-shell. Don't include it in the dashboard rollout.

### 25.10 What's still open at handoff

Tracked in `ROADMAP.md` § 4. Highest-leverage remaining items:

- **WS-1.B-G chat redesign** — date dividers, system-event grouping, real-time presence, smart replies, optimistic send + retry, draft auto-save (file already partially landed), participant filters, inline thread search
- **WS-5 money & trust** — escrow visualization, multi-currency, refund flow, milestone payments, dispute UX, KYC flow, proof-of-funds. Existential-risk-flagged
- **WS-22 email + transactional comms** — entirely missing in code; 30+ template inventory needed
- **WS-12 i18n + a11y** — strings extraction, RTL audit, screen-reader pass, high-contrast mode
- **WS-13 performance** — code-split per surface, virtualize lists, vanilla-extract style extraction
- **WS-28–WS-34** — round-4 industry-depth additions (casting director surface, production team, image rights, account lifecycle, discovery, on-set live, safety/disputes)
- Mobile-viewport popover re-verify (item 25.7 above)
- `_state.tsx` context split — file is now ~7,400 lines with a single Context provider holding ~50 cb refs. Splitting into PageContext / DrawerContext / DataContext would reduce re-render cost. Not on the roadmap; recommend adding to WS-13


---

## 26. Post-sprint polish + bug-fix batch — 2026-05-01 (commit `11d8fa0`)

A short follow-up landing one infrastructure bug, three design fixes the
user flagged in QA, and a seed-data cleanup. Read this if you're touching
overlays, primary CTAs, the talent profile header, or the talent
preview/inbox surfaces.

### 26.1 Scroll-lock recovery — the "stuck page" bug

**Symptom:** users reported the talent Profile page (and occasionally
other surfaces) becoming impossible to scroll. Programmatic scroll worked
fine; only user input was blocked.

**Root cause:** `lockScroll()` / `unlockScroll()` in `_primitives.tsx` use
a ref-counted `_overlayDepth` to track open drawers/modals/dialogs and
only release `body.style.overflow` when the count hits zero. Under HMR,
unmount races, or React strict-mode double-invocation, the counter could
drift and leave the body locked while no overlay was actually rendered.

**Fix (two layers):**

1. **`unlockScroll()` is now self-healing** — defers a frame and probes
   the DOM for any `[data-tulala-drawer-panel]`,
   `[data-tulala-modal-overlay]`, or `[data-tulala-confirm-dialog]`
   markers. If none are present, force-clears `body.style.overflow`
   regardless of what the counter thinks. A new `reconcileScrollLock()`
   helper does the probe.
2. **`PrototypeRoot` runs a one-shot recovery effect on mount** in
   `page.tsx`. Same DOM probe; clears the lock if no overlay exists.
   Catches HMR-leaked locks from prior dev sessions on first paint.

**Pattern to copy:** any future scroll-lock primitive should follow the
"probe-on-release" model, not just trust the counter. The DOM is the
source of truth for overlay presence.

### 26.2 PrimaryButton bug — global black-CTA leak

**Symptom:** every primary button across every surface (workspace, talent,
client, platform, drawer footers) was permanently darkening to pure black
on first hover and never returning to slate.

**Root cause:** `PrimaryButton`'s `onMouseLeave` handler reset
`background` to `COLORS.ink` (`#0B0B0D` — pure black) instead of
`COLORS.fill` (`#4D4855` — slate). The `onMouseEnter` was also using a
hardcoded `"#1d1d20"` (near-black) instead of the proper `COLORS.fillDeep`.

**Fix (`_primitives.tsx:3739`):**
- Hover-in now uses `COLORS.fillDeep` (slate-darker, intentional)
- Mouse-leave resets to `COLORS.fill` (slate, the original idle state)

This silently affected ~100+ buttons app-wide. Verified across workspace
overview: every primary button now reports `rgb(77, 72, 85)` (= slate)
post-hover.

The earlier `feedback_admin_aesthetics.md` complaint of "buttons keep
turning black" was misattributed to color-token drift — the actual
technical cause was this hover handler bug.

### 26.3 Talent profile header — compact + slate

**`_talent.tsx` MyProfilePage:**
- Both header buttons (`Preview as client` + `Edit profile`) now
  `size="sm"` so they read as header actions, not body-level CTAs
  alongside the h1
- `Edit profile` gains a `pencil` icon to match `Preview as client`'s
  external-link icon — visually balanced, both have icon+label

**`_primitives.tsx`:**
- `Icon` primitive gains `pencil` variant. Path: `M16 3l5 5L8 21H3v-5L16 3z`

### 26.4 Preview-as-client drawer rewritten

**Why:** the previous design tried to fake-render a public-page mockup
inside a 720px drawer. That broke down — image-URL strings rendered as
plain text at 56px font (the giant `pravatar.cc/300?...` text the user
saw). Beyond the bug, a faked mockup never matches the real surface and
the talent doesn't need a copy — they need links to the actual pages.

**`_talent_drawers.tsx` `TalentPublicPreviewDrawer`:**

The new body has three sections:

1. **Where you appear · {tier}** — list of real distribution surfaces.
   Each row: surface name + URL one-liner + Copy + Open buttons. Tier-aware:
   - Basic / Pro: `tulala.digital/t/<slug>` (canonical)
   - Portfolio: custom domain when verified, OR fallback row that says
     "active until you connect a custom domain"
   - Agency roster + hub feeds always shown (distribution is independent
     of the personal-page subscription per `project_talent_subscriptions`)

2. **What this tier unlocks** — concrete bullet list per tier:
   - Basic: canonical URL, identity, trust badges, agency+hub distribution
   - Pro: 3 premium templates, 6 video embeds, press section, no Tulala
     branding, hub priority
   - Portfolio: custom domain, all Pro features, Story/About, tour dates,
     calendar, EPK, FAQ, unlimited embeds, visitor analytics

   Card flips between **ACTIVE** (neutral) and **UPGRADE REQUIRED**
   (accent badge + soft accent background) based on whether the previewed
   tier matches `currentTier`.

3. **Hidden until they inquire** — quiet panel listing the data clients
   never see (full measurements, rate ranges, limits, documents, emergency
   contact).

**Footer:**
- `Close` always present
- `Upgrade to {tier}` only when previewed tier > current (opens
  `talent-tier-compare`)

The old "Copy public URL" footer button is gone — every distribution
row has its own Copy now.

**Custom domain = Portfolio.** Per `project_talent_subscriptions.md`
binding source-of-truth + the `TalentSubscription.customDomain`
typing comment in `_state.tsx:3567`. Pro adds premium templates
+ featured media but stays on the canonical `tulala.digital/t/<slug>`.

### 26.5 MobileInboxTab redesigned

The pull-tab on the left edge of the talent thread mode (mobile only).
Iterations during this session:

| Stage | Treatment | Why retired |
|---|---|---|
| Original | 32vh slate→black gradient pill with pulse | "Horrible" — too aggressive, dominated viewport |
| Pure white | 26vh thin pill, white surface, faint border | "Even uglier" — invisible blob |
| Two-bar handle | 56×28 surfaceAlt, vertical drawer-handle marks | Wrong shape, not handle-like |
| Final | **16×104 solid slate, white chevron, inset highlights** ✓ | Reads as a physical drawer pull |

**`_messages.tsx`** `MobileInboxTab`:
- `width: 16, height: 104` — proper drawer-handle ratio (~6.5:1)
- `background: COLORS.fill` (`#4D4855`, same as primary CTAs — consistent
  language with the rest of the action surfaces)
- Inset highlights on the right + top edges (`rgba(255,255,255,0.12 / 0.08)`)
  give a 3D handle feel (catches light from above-right)
- Drop shadow `3px 5px 16px -4px rgba(11,11,13,0.30)` suggests the panel
  hides off-screen behind it
- Chevron-right SVG (9×15, 1.7 stroke) at center
- Forest accent dot above the chevron when unread, ringed in slate

### 26.6 Talent seed cleanup

- Renamed `"Acme Models"` → `"Atelier Roma"` to match `TENANT.name`. 67
  occurrences across `_state.tsx` (62), `_talent.tsx` (4), `_wave2.tsx` (1).
  Was a stale leftover from the original placeholder name. Now every
  `primaryAgency`, `agencyName` (on inquiries), and `representation.agencyName`
  reads consistently.
- `MOCK_TENANTS` first entry: `id: "acme"` → `id: "atelier-roma"` to
  match `TENANT.slug`.
- Profile completeness banner copy `"Set polaroids set (5 naturals)"` →
  `"Polaroids set (5 naturals)"` (duplicate "set" removed).

### 26.7 Pre-existing TS errors fixed (unblocks `_messages.tsx` commit)

`_messages.tsx` had been sitting untracked in the working tree with 3
pre-existing type errors blocking commit:

1. **L864-865** — `RichInquiry.location` and `.date` are `string | null`
   but `ShellHeaderInput` expects `string | undefined`. Coerced via
   `?? undefined`.
2. **L3284** — `derivedTalent.state` was `"accepted" as const`, but the
   canonical `InquiryTalentInvite["state"]` union doesn't include that.
   Changed to `"confirmed"` (closest semantic for on-lineup talent).

After these fixes the file compiles clean and is now in git as part of
this commit.

### 26.8 Verification

- `npx tsc --noEmit` → exit 0 (was 3 pre-existing)
- Browser walkthrough at desktop (1456×821):
  - Workspace overview: all primary buttons report `rgb(77, 72, 85)`
    post-hover ✓
  - Talent profile: header buttons compact + slate ✓
  - Preview-as-client: tier-aware distribution links + ACTIVE / UPGRADE
    REQUIRED feature card + working upgrade footer ✓
  - Profile page scrolls normally ✓

## 27. Website page + Performance dashboard + audit closeouts — 2026-05-02

This session adds a brand-new top-level workspace surface (**Website**),
extends it with a consolidated business-funnel dashboard
(**Performance**), and closes five backlog items (I1, I2, I3, I7, I8)
from the Phase G/H pickup paths in `PROFILE_FIELD_ENGINE.md`.

Cross-reference: [`PROFILE_FIELD_ENGINE.md`](./PROFILE_FIELD_ENGINE.md)
holds the authoritative narrative and per-field production wiring map.
This section is the engineer-facing summary — what was built, where it
lives, and what production needs.

### 27.1 New surface — Website page

A new **Website** entry in the workspace top-nav (between Production
and Settings). Premium 2026 design language (gradient hero band,
indigo accents on metrics, monospace URLs). Consolidates everything an
agency website admin needs on one operations console — eleven sections:

1. **Hero band** — primary domain URL with copy-to-clipboard, status
   indicator (Live / Maintenance / Setting up), 4-stat row (pages live,
   posts, redirects, scheduled), banner-active marker.
2. **Performance** — see §27.2 below.
3. **Pages** — full table with title/slug, last-edited timestamp +
   author, hits 7d, status chip (Live / Draft / Scheduled), per-row
   Edit + Publish/Unpublish actions, "+ New page" button.
4. **Posts / blog** — same shape as Pages, scheduled per-post; tier-
   gated to Agency plan with upgrade chip if not on tier.
5. **301 Redirects** — full table with from/to (monospace + arrow),
   status code chip (301/302/307/308 in distinct colors), match mode
   (exact/prefix/regex), hits 7d, pause/resume + delete actions.
6. **Navigation & footer** — header menu summary + footer column
   summary, edit affordance per.
7. **Custom code** — CSS textarea (injected `<head>`) + JS block list
   with per-block label, placement picker (`<head>` / `<body>` start /
   `<body>` end), enabled toggle, "Add script" button. Tier-gated to
   Agency. Warning chip "Care required — broken code breaks the live
   site".
8. **Tracking & analytics** — input cards for GA4, Plausible, Meta
   Pixel, GTM, Hotjar, LinkedIn Insight; each becomes "ACTIVE" when
   filled. Plus cookie consent radio (off / essential / geo-aware
   EU+UK).
9. **SEO defaults** — site title, title template (`%s — Atelier Roma`),
   meta description, OG image, Twitter handle, canonical domain,
   robots mode (indexable / noindex-nofollow / private), sitemap toggle.
10. **Domain & SSL** — primary domain + SSL status + renewal countdown,
    DNS records table (A / CNAME / TXT) with matched/mismatch
    indicators, alternate domains chip strip, www-redirect toggle,
    "Manage domain" button → opens DomainDrawer (see §27.5).
11. **Maintenance mode** — toggle + custom message + bypass token
    (admin shares the URL to preview while public is in maintenance),
    copy-token button. Border + textarea tint amber when enabled.
12. **Site-wide announcement banner** — toggle + live preview + text +
    CTA label/href + audience filter (all / clients / talent) + tone
    palette (neutral / info / success / warning) — visual swatch picker
    for tone.

#### State model (`_state.tsx`)

12 new types plus `WEBSITE_STATE` fixture seeded for Atelier Roma:

```ts
WebsitePageRow         // pages list
WebsitePost            // blog posts list
WebsiteRedirect        // 301/302/307/308 rules
WebsiteCustomCode      // CSS + JS block array
WebsiteTrackingCodes   // GA4 / Plausible / Meta / GTM / Hotjar / LinkedIn / cookie consent
WebsiteSeoDefaults     // title / template / description / OG / robots / sitemap
WebsiteDomainStatus    // primaryDomain / status / sslStatus / dnsRecords[] / alternateDomains[]
WebsiteMaintenance     // enabled / message / scheduled / bypassToken
WebsiteAnnouncement    // enabled / text / cta / audience / tone
WebsitePeriodMetrics   // visits / inquiries / bookings / revenue + prior-window baselines
WebsitePageMetrics     // pageId / visits / inquiries / bookings (per-page rollup)
WebsiteAnalytics       // refreshedAt / last7d / last30d / byPage7d / byPage30d
WebsiteState           // aggregate of all of the above
```

Fixture seeded for `Atelier Roma` (matches `TENANT.name` after the §26.6
rename): 6 pages, 5 posts, 5 redirects, 2 JS blocks, 6 tracking IDs, 3
DNS records, active announcement, 7d + 30d analytics with prior-period
baselines, per-page conversion attribution.

#### Production wiring map

| Prototype field | Production source |
|---|---|
| `WEBSITE_STATE.pages` | `agency_pages` table (per-tenant) — already exists at `web/src/app/(dashboard)/admin/site-settings/pages/`. Page row click routes to `/admin/site-settings/pages/[id]`. |
| `WEBSITE_STATE.posts` | New `agency_blog_posts` table — not yet built. `published_at`, `slug`, `author_id`, `tags`. |
| `WEBSITE_STATE.redirects` | New `agency_redirect_rules` table — `from_path`, `to_path`, `status_code`, `match_mode`, `hits_7d` (rolled up from `agency_event_log` where `event = 'redirect.fired'`), `active`. Production reads this in `web/src/middleware.ts` and rewrites before route matching. |
| `WEBSITE_STATE.customCode` | New `agency_website_settings.custom_css` (text), `agency_website_custom_js` (table — id / label / code / placement / enabled). Injected via the public layout's `<head>` and `<body>` slots. |
| `WEBSITE_STATE.tracking` | New `agency_website_settings.tracking_*` columns. Each ID slots into a known integration boilerplate at render time. |
| `WEBSITE_STATE.seo` | New `agency_website_settings.seo_*` columns. Already partially modeled in `agency_workspaces` — consolidate. |
| `WEBSITE_STATE.domain` | `agency_domains` table (live, drives middleware host check) + new `agency_website_settings.ssl_*` + `agency_website_settings.dns_records` (jsonb). |
| `WEBSITE_STATE.maintenance` | New `agency_website_settings.maintenance_*` columns. Middleware checks before route matching; bypass token stored as a hashed value, presented unhashed only on first generation. |
| `WEBSITE_STATE.announcement` | New `agency_website_settings.announcement_*` columns. Public layout reads and renders site-wide. |
| `WEBSITE_STATE.analytics` | See §27.2 — rolled up hourly from event/inquiry/booking tables. |

#### Where in source

- **State + fixture:** `web/src/app/prototypes/admin-shell/_state.tsx` —
  search for `Website ────────` block (added 12 types + `WEBSITE_STATE`
  + `"website"` added to `WorkspacePage` union and `WORKSPACE_PAGES`
  array; `PAGE_META.website` for nav label).
- **Page component + sub-components:**
  `web/src/app/prototypes/admin-shell/_pages.tsx` — `WebsitePage()` at
  the dispatcher's `case "website"` (legacy `case "site"` aliases
  here). Sub-components: `WebsiteHero`, `WebsitePerformance`,
  `PeriodToggle`, `KpiTile`, `FunnelStep`, `FunnelArrow`,
  `WebsiteSection`, `WebsitePagesList`, `WebsitePostsList`,
  `PageStatusChip`, `WebsiteRedirectsTable`, `AddRedirectModal`,
  `WebsiteNavSummary`, `WebsiteCustomCodePanel`, `WebsiteTrackingPanel`,
  `WebsiteSeoPanel`, `SeoInput`, `WebsiteDomainPanel`,
  `WebsiteMaintenancePanel`, `WebsiteAnnouncementPanel` (16 components
  total).

### 27.2 Performance section — consolidated funnel dashboard

Right below the Website hero, a new section consolidates traffic +
inquiries + bookings + revenue into one premium dashboard. Engineers
porting this to production should replicate the **shape of the data
contract** even if the visual treatment changes — the contract is what
matters for the rollup queries.

#### Period toggle

A pill toggle (7 days / 30 days). All numbers downstream — KPI tiles,
funnel %s, top-page table — re-compute against the selected window.

#### Four KPI tiles

Each tile shows: label, current value, ↑/↓/— delta vs prior period,
and the prior-period absolute number. Tone shifts to green/red/dim by
sign and magnitude (flat threshold = 0.5%). Revenue tile uses the
forest accent; the others use the warm-gray surface.

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ VISITS          │ │ INQUIRIES       │ │ BOOKINGS        │ │ BOOKING REVENUE │
│ 4,730           │ │ 23              │ │ 6               │ │ €14,500         │
│ ↑ 14.0% vs 4,148│ │ ↑ 27.8% vs 18   │ │ ↑ 50.0% vs 4    │ │ ↑ 32.1% vs €10,980│
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### Funnel strip (indigo)

```
   4,730           23           6
  Visits  →0.49%→  Inquiries  →26.09%→  Bookings
                                                Overall conversion: 0.13%
```

The overall-conversion footer is `bookings / visits`.

#### Top performing pages table

```
PAGE         VISITS     INQUIRIES     BOOKINGS     CONV. RATE
Roster       1,216      11            4            0.33%       ← green (above site avg)
About us       412      4             1            0.24%       ← green (above site avg)
Home         1,842      6             1            0.05%       ← indigo (below avg)
Contact        287      2             0            0.00%       ← dim (zero)
```

Conversion-rate is colored **relative to the site's overall conversion
rate**, not a hardcoded threshold — pages above the site average go
green, pages with traffic but below average go indigo, pages with zero
bookings go dim. The site average is computed from the same selected
window so the coloring stays consistent across 7d / 30d toggles.

#### Production rollup map

| Field | Source query (production) |
|---|---|
| `analytics.last7d.visits` | `count(*) from agency_event_log where event = 'page.view' and tenant_id = ? and ts > now() - interval '7d'` |
| `analytics.last30d.visits` | Same, 30d |
| `analytics.last7d.prior.visits` | Same, but `ts between now() - interval '14d' and now() - interval '7d'` |
| `analytics.last7d.inquiries` | `count(*) from inquiries where workspace_id = ? and created_at > now() - interval '7d'` |
| `analytics.last7d.bookings` | `count(*) from bookings where workspace_id = ? and created_at > now() - interval '7d'` |
| `analytics.last7d.revenue` | `sum(total_amount) from bookings where workspace_id = ? and confirmed_at > now() - interval '7d'` (currency = workspace's billing currency) |
| `analytics.byPage7d[]` | `agency_event_log` joined to `inquiries.source_page_id` and `bookings.inquiry_id`, grouped by `pageId`. **Last-touch attribution** — the page that owned the visit when the inquiry was created gets the credit. |
| `analytics.refreshedAt` | Last successful rollup timestamp. Drive a cron at hourly cadence; UI shows `relativeTime(refreshedAt)` in the section header. |

**Schema dependency:** `inquiries.source_page_id` must be added — it's
the linkage between visit attribution and inquiry creation. Today the
inquiry record has no source-page pointer.

### 27.3 I1 closeout — Page-builder routes

The Website page no longer toasts when admins click a page row or "+
New page". `useRouter` from `next/navigation` is wired in
`WebsitePage()` and the actions push to the existing real CMS routes:

| Trigger | Route |
|---|---|
| Page row click (`onOpen` in `WebsitePagesList`) | `/admin/site-settings/pages/${id}` |
| "+ New page" header button | `/admin/site-settings/pages/new` |
| "Open page builder" hero button | `/admin/site-settings/pages` (list) |

**Posts** still toast — there's no real `/admin/site-settings/posts/`
route yet. When that ships, mirror the same `useRouter` pattern.

The real CMS already exists at
`web/src/app/(dashboard)/admin/site-settings/pages/` with `page.tsx`,
`page-editor.tsx`, `actions.ts`, `[id]/`, and `new/`. Engineers don't
need to build new routes — just wire data through.

### 27.4 I2 closeout — Add-redirect modal

The Redirects section's "+ Add redirect" header button now opens an
inline modal panel (rendered below the table, not a portal). Component:
`AddRedirectModal` in `_pages.tsx`.

**Inputs:**
- **From** — must start with `/`. Monospace text input. Border tints
  red on invalid.
- **To** — must be a path (`/foo`) or absolute URL (`http(s)://…`).
  Same red-border treatment.
- **Status code** — pill toggle: 301 / 302 / 307 / 308. Each shows a
  one-line caption explaining the semantic difference (permanent vs
  temporary, method-preservation).
- **Match mode** — pill toggle: exact / prefix / regex. Caption per
  mode ("Path must equal From" / "Match if path starts with From" /
  "Treat From as a regex (use $1 in To for capture)").

**Validation:**
- `from` must start with `/`
- `to` must be a path or absolute URL
- No collision with an existing rule of the same `(from, match)`
- Validation hints render inline in a coral/red callout when the user
  has entered something but it's invalid

**Save handler:**

```ts
{
  id: `r-${Date.now()}`,
  from: fromTrim,
  to: toTrim,
  statusCode,                 // 301 | 302 | 307 | 308
  match,                      // "exact" | "prefix" | "regex"
  hits7d: 0,
  createdAt: new Date().toISOString(),
  createdBy: "You",
  active: true,
}
```

Appended to `w.redirects`, modal closes, toast confirms (`Redirect
${from} → ${to} added`).

**Production translation:** wire to `agency_redirect_rules` insert.
Same shape. The middleware (`web/src/middleware.ts`) reads this table
and rewrites before route matching.

### 27.5 I3 closeout — Domain management drawer

`DomainDrawer` in `_drawers.tsx` rebuilt to read live state from
`WEBSITE_STATE.domain` instead of the stale hardcoded `TENANT.customDomain`.
Wired from the Website page's `WebsiteDomainPanel` "Manage domain"
button via `openDrawer("domain")`.

**Sections:**

1. **Public URL** — Tulala fallback subdomain + custom domain input +
   "Redirect bare → www" toggle.
2. **Verification & SSL** (when on Studio+ plan):
   - Status row: green/amber dot for domain verified + green/amber dot
     for SSL active. SSL row shows `renews in N days` countdown
     computed from `domain.sslExpiresOn`.
   - DNS records table — per-row type / host / value / COPY button +
     ✓/! match indicator. Background tints green-soft when matched,
     amber-soft when not.
   - "Re-check DNS" CTA (toasts in prototype; production hits the
     verify endpoint).
3. **Alternate domains** (when Studio+ and `domain.alternateDomains`
   has entries):
   - Per-row pill: VERIFIED (green) / PENDING DNS (amber).
   - "+ Add alternate domain" dashed-border button (toasts in
     prototype; production opens an inline form).
4. **Why upgrade** — only on Free / pre-Studio plans. Bullet list of
   what Studio unlocks.

**Production translation:** wire to `agency_domains` (already lives —
drives the host-based middleware in production) plus the new
`agency_website_settings.dns_records` jsonb column. The "Re-check DNS"
CTA hits an API route that performs DNS lookups (CNAME, TXT) and
updates `domain.dnsRecords[].matched`.

### 27.6 I7 closeout — `catalogId` threading on FieldRow (partial)

Phase E added `catalogId` as an optional prop on `FieldRow` in
`_primitives.tsx`. When provided, the row resolves workspace overrides
(`customLabel` / `customHelper` / `enabled`) from
`applyWorkspaceFieldOverride()` and lets them win over the explicit
`label` / `hint` props. This is how workspaces customize the talent
edit experience without forking the field catalog.

This session threaded `catalogId` on **four** highest-confidence
callsites in the talent edit drawer (`IdentityEditor` flow):

| Label | catalogId | Field | Where (in `_drawers.tsx`) |
|---|---|---|---|
| "Tagline" | `identity.tagline` | `state.tagline` | `IdentityEditor` services section |
| "Home base" | `serviceArea.homeBase` | `state.serviceArea.homeBase` | location section |
| "Owns a vehicle" | `serviceArea.ownsVehicle` | `state.serviceArea.ownsVehicle` | location section |
| "Video / social links" | `links` | `state.videoLinks` | media section |

Workspace `customLabel` / `customHelper` overrides on those four
fields now flow through the edit drawer.

**Remaining ~134 FieldRow callsites in `_drawers.tsx` are not yet
threaded.** Most are UI-only (Heading font, Pricing mode, Travel fee,
etc.) or have no clear catalog match. This is incremental work —
engineers picking it up should:

1. Run `grep -n "<FieldRow\b" web/src/app/prototypes/admin-shell/_drawers.tsx`
   to enumerate.
2. For each, check `FIELD_CATALOG` (in `_field-catalog.ts`) for a
   matching `id`.
3. Thread `catalogId="<matching.id>"` and verify a workspace override
   on that field flows through.

Don't force matches. UI-only fields (typography, billing, internal
notes) intentionally don't have catalog entries — they're not part of
the talent profile shape.

### 27.7 I8 closeout — Catalog-driven fields in publish gate

The talent edit drawer's `required[]` array drives three things:
- **`missing[]`** — what `RequiredCoach` displays
- **`completeness`** — the % bar
- **`canPublish`** — whether the Publish CTA is enabled

Previously `required[]` was a hand-rolled array of 6 universal items
(stage name, talent type, home base, ≥3 photos, bio ≥30 chars, ≥1
language). The catalog declares additional type-specific required
fields via `requiredFor: ["models"]` etc., but those weren't honored
by the publish gate.

This session augments `required[]` with catalog-driven type-specific
required fields. Today only `models` has type-specific requireds — the
catalog declares: `measurements.heightMetric`, `measurements.bust`,
`measurements.waist`, `measurements.hips`, `measurements.hairColor`.

**Implementation:**

```ts
const isModel = state.primaryType === "models" || state.secondaryTypes.includes("models");
const dynStr = (k: string) => {
  const v = state.dynFields[k];
  return Array.isArray(v) ? v.length > 0 : !!String(v ?? "").trim();
};
const catalogRequired = isModel ? [
  { id: "measurements.heightMetric", label: "height",     met: dynStr("height") || dynStr("heightMetric"), sectionId: "physical" },
  { id: "measurements.bust",         label: "bust",       met: dynStr("bust"),                            sectionId: "physical" },
  { id: "measurements.waist",        label: "waist",      met: dynStr("waist"),                           sectionId: "physical" },
  { id: "measurements.hips",         label: "hips",       met: dynStr("hips"),                            sectionId: "physical" },
  { id: "measurements.hairColor",    label: "hair color", met: dynStr("hair") || dynStr("hairColor"),     sectionId: "physical" },
] : [];
const required = [
  // ... existing universal 6 ...
  ...catalogRequired,
];
```

**Storage-key ↔ catalog-id drift:**
The dyn-field storage uses short keys (`height`, `bust`, …) while the
catalog uses dotted ids (`measurements.heightMetric`, …). The mapping
is documented inline. **Production should unify storage keys to
catalog ids and call `validateProfile()` directly** instead of the
hand-rolled mapping. The unification is worth it for two reasons:

1. New `requiredFor` entries flow through automatically.
2. The same `validateField()` runs in the wizard, the add-new drawer,
   and the edit drawer — single source of truth.

### 27.8 Files changed this session

| File | What changed |
|---|---|
| `web/src/app/prototypes/admin-shell/_state.tsx` | +12 types (`WebsitePageRow`, `WebsitePost`, `WebsiteRedirect`, `WebsiteCustomCode`, `WebsiteTrackingCodes`, `WebsiteSeoDefaults`, `WebsiteDomainStatus`, `WebsiteMaintenance`, `WebsiteAnnouncement`, `WebsitePeriodMetrics`, `WebsitePageMetrics`, `WebsiteAnalytics`, `WebsiteState`); `WEBSITE_STATE` fixture for Atelier Roma; `"website"` added to `WorkspacePage` union and `WORKSPACE_PAGES`; `PAGE_META.website` nav entry. |
| `web/src/app/prototypes/admin-shell/_pages.tsx` | `WebsitePage()` (+ ~400 lines) + 16 sub-components; `WebsitePerformance` section with `PeriodToggle` / `KpiTile` / `FunnelStep` / `FunnelArrow`; `AddRedirectModal` (~165 lines); `useRouter` from `next/navigation` wired for I1; `WebsiteDomainPanel` "Manage domain" button → `openDrawer("domain")`. |
| `web/src/app/prototypes/admin-shell/_drawers.tsx` | `WEBSITE_STATE` import; `DomainDrawer` rebuilt (+ ~115 lines net) — DNS records table, SSL countdown, alternates, www-redirect toggle; 4 `catalogId` threads in IdentityEditor (I7); `catalogRequired[]` augmenting publish gate (I8). |
| `web/docs/admin-prototype/PROFILE_FIELD_ENGINE.md` | Phase H section (+~150 lines): 12 sections, production wiring map, sub-component list, acceptance bullets. I1/I2/I3/I8 marked DONE in pickup-paths section, I7 marked PARTIAL with details. |
| `web/docs/admin-prototype/dev-handoff.md` | This §27 (you are here). |

### 27.9 Verification

- `cd web && npx tsc --noEmit` → exit 0, 0 lines of output.
- All numbers in the Performance fixture reconcile:
  - Per-page byPage7d sum: 1216 + 1842 + 412 + 287 = 3,757 visits;
    11 + 6 + 4 + 2 = 23 inquiries; 4 + 1 + 1 + 0 = 6 bookings.
    Matches `last7d` totals: visits 4,730 (some untracked traffic),
    inquiries 23 ✓, bookings 6 ✓.
  - Visit→inquiry: 23 / 4,730 = 0.486% → renders 0.49% ✓
  - Inquiry→booking: 6 / 23 = 26.087% → renders 26.09% ✓
  - Overall: 6 / 4,730 = 0.127% → renders 0.13% ✓
  - Δ visits: (4,730 − 4,148) / 4,148 = +14.03% → renders ↑ 14.0% ✓
  - Δ inquiries: (23 − 18) / 18 = +27.78% → renders ↑ 27.8% ✓
  - Δ bookings: (6 − 4) / 4 = +50.00% → renders ↑ 50.0% ✓
  - Δ revenue: (€14,500 − €10,980) / €10,980 = +32.06% → renders ↑ 32.1% ✓
- I1 verified: page-row click in the Website page Pages section
  navigates to `/admin/site-settings/pages/p1` (etc.) instead of
  toasting.
- I2 verified: "+ Add redirect" opens the inline modal; entering an
  invalid `from` (no `/` prefix) red-borders the input + shows the
  validation callout; valid entries append to `w.redirects` and the
  table re-renders with the new row at top.
- I3 verified: "Manage domain" on `WebsiteDomainPanel` opens
  `DomainDrawer` with DNS records, SSL countdown ("renews in 60 days"
  given `sslExpiresOn` 60 days out), and alternate-domain pills.
- I7 verified: workspace override of `identity.tagline.customLabel`
  (set via Settings → Workspace field settings drawer) renders in the
  edit drawer's Tagline row.
- I8 verified: switching a talent's `primaryType` to `models` adds
  height / bust / waist / hips / hair color to the publish-gate
  `required[]`; the % bar reflects the new denominator (11 instead
  of 6); RequiredCoach lists the additions; canPublish gates on them.

### 27.10 Known production gaps

For engineers picking this up:

- **No `agency_blog_posts` table** — Posts section has no production
  destination yet.
- **No `agency_redirect_rules` table** — Redirects section has no
  production destination yet. Middleware also doesn't read redirects.
- **No `inquiries.source_page_id`** — Performance section's per-page
  attribution can't roll up until this column is added.
- **No analytics rollup cron** — `analytics.refreshedAt` and
  `byPage*` need an hourly job. Suggest scheduling via Supabase
  pg_cron or a Vercel cron.
- **`/admin/site-settings/posts/`** — no real route exists; Posts
  section toasts on "+ New post" for now.
- **DNS verify endpoint** — "Re-check DNS" toasts in prototype;
  production needs an API route doing real CNAME/TXT lookups.
- **Bypass-token flow** — `WebsiteMaintenance.bypassToken` is shown
  in plaintext in the fixture. Production hashes at rest, shows
  unhashed only on first generation, then shares via copy-button.

### 27.11 Trust-verification queue — moved from workspace to platform layer

A small architectural cleanup landed in the same session. The Roster
nav badge in `WorkspaceTopbar` (`_pages.tsx`) used to show **three**
sub-pills:

1. Slate — pending self-registrations (count of `pendingTalent`)
2. Indigo — pending IG/Tulala verifications (count of
   `verificationRequests` with status submitted / in_review /
   pending_user_action)
3. Blue — pending profile-edit reviews (count of `listPendingReviews()`)

The **indigo verifications pill was wrong on workspace.** Verification
review is a platform-level function — Tulala staff act as a neutral
arbiter so the badge means the same thing across every agency, and
agency admins can't be allowed to self-issue trust signals on their
own talent. The queue itself has always been a platform-only surface
(`TrustVerificationQueueDrawer`, dispatched at
`case "trust-verification-queue"`), but the count was leaking onto
agency nav as a "you have work to do" signal that wasn't theirs.

**The cleanup (3 small edits):**

1. **Workspace topbar** (`WorkspaceTopbar` in
   `_pages.tsx:520`) — dropped the indigo pill. Now only the slate
   (self-registrations) and blue (profile-edit reviews) pills render.
   Workspace admin still sees the two queues that ARE theirs.
   `verificationRequests` is no longer destructured in this component.
2. **Platform topbar** (`PlatformTopbar` in `_platform.tsx:112`) —
   added the indigo pill on the **Operations** tab (which is where
   the verification queue lives in the platform router at
   `case "operations"` → `<PlatformOperationsPage />`). Tulala staff
   now see their queue count from anywhere in HQ.
3. **Roster row** (`RosterTrustCell` in `_pages.tsx:6707`) — added a
   per-talent **"⏳ In review by Tulala"** informational chip that
   appears next to the trust-badge group whenever
   `verificationRequests.filter(r => r.subjectId === talentId &&
   <open status>)` is non-empty. Indigo-soft fill, indigoDeep ink,
   uppercase. Tooltip: *"N verifications in review by Tulala —
   typically 1–2 business days."* The agency admin still sees the
   in-flight status on **their** talent, framed as informational
   ("here's what's happening") not actionable ("you have work").

**Charter alignment:** this lines up with the Trust Badges + Talent
Contact Controls direction (`project_client_trust_badges.md` in the
master memory) — verification is a platform-corporate trust signal,
not an agency feature. An agency selling clients on "we have N
IG-verified talent" needs that to be a Tulala-issued claim, not a
self-issued one.

**Production wiring map (no schema change required):**

- The `verification_requests` table already lives at the platform
  level (no `tenant_id` foreign key — it's per-talent-claim, not
  per-tenant). The reviewer endpoint
  (`POST /api/platform/verification-requests/:id/approve`) checks
  `getRequestUser().is_platform_staff`, NOT tenant membership.
- Workspace admins who try to call the approve endpoint should get
  a 403. RLS on `verification_requests` writes should already
  restrict to platform-staff; verify before launch.
- `TrustVerificationQueueDrawer` should be unreachable from the
  workspace surface drawer dispatcher (it's currently only
  registered for platform). No code change needed — just keep the
  invariant.

**Files touched in this cleanup:**

- `web/src/app/prototypes/admin-shell/_pages.tsx` — drop indigo
  pill + comment block explaining the rationale + add per-talent
  "In review by Tulala" chip in `RosterTrustCell`
- `web/src/app/prototypes/admin-shell/_platform.tsx` — add indigo
  pill on Operations tab + `verificationRequests` consumed in
  `PlatformTopbar`

**Verification:**

- `cd web && npx tsc --noEmit` → exit 0, 0 lines of output
- Workspace surface: Roster nav now shows only slate + blue pills
  (verifications no longer leak onto workspace)
- Platform surface: Operations tab shows indigo pill with
  pending-verifications count
- Roster row in workspace: any talent with an open verification
  request shows the **⏳ In review by Tulala** chip alongside their
  trust badges

---

## 28. Polish + Top Performers switcher + docs consolidation — 2026-05-02 (uncommitted)

A short follow-up after §27 closing four discrete items: a duplicate-control fix, the docs consolidation, a new audit doc, and the **Talent ↔ Pages switcher** for the Website Performance section. **Sitting in the working tree, not yet committed** as of this writing — engineers picking this up should commit alongside §26's working-tree changes (scroll-lock, PrimaryButton, etc.) since none of that is committed yet either.

### 28.1 Duplicate "Search ⌘K" chip removed

**Symptom:** the workspace topbar rendered TWO `Search ⌘K` controls side-by-side at narrow widths — one between the nav and the right-side action group (`aria-label="Search (⌘K)"`), one inside the right-side group (`aria-label="Search anything (⌘K)"`).

**Root cause:** the right-side action group was unified at some point and added its own search chip, but the older standalone chip was never removed. Both wired to the same `onOpenSearch` callback (CommandPalette).

**Fix (`_pages.tsx:693`):** deleted the older standalone chip block (~40 lines). The remaining chip is the canonical one — the same one `AdminTour` targets via `[aria-label='Search anything (⌘K)']` (so the first-time tour still works).

### 28.2 Docs consolidation — single canonical folder

**Before:** admin-prototype docs were scattered across THREE locations:
- `web/docs/admin-redesign/` — 13 files (this dev-handoff lived here)
- `web/src/app/prototypes/admin-shell/*.md` — 11 files (ROADMAP, DRAWERS, TRUST, STYLE etc.)
- `web/src/app/prototypes/admin-shell/docs/` — 7 files (some duplicates of the above)

**After:** all 26 docs consolidated into `web/docs/admin-prototype/`. The prototype source directory now contains code only.

**Duplicate resolution:** STYLE / MOTION / A11Y / CONTENT / ICONS existed in both `prototypes/admin-shell/*.md` (April 28 versions) and `prototypes/admin-shell/docs/*.md` (May 02 versions). The May 02 versions won as canonical (newer); the April 28 root copies were removed.

**Path-reference updates:**
- `scripts/export-prototype-tokens.mjs` — output path moved from `prototypes/admin-shell/tokens.json` to `docs/admin-prototype/tokens.json`. Updated the script.
- Code comments referencing `docs/admin-redesign/` or `admin-shell/docs/` paths in `_state.tsx`, `_primitives.tsx`, `page.tsx` — updated.
- All internal cross-references in moved docs normalized to `./X.md` relative paths (regex pass).
- Master document index in this file updated; all 25 links verified to resolve via filesystem check.

### 28.3 New doc — `OVERVIEW_AUDIT_2026.md`

Full 2026-readiness audit of the Workspace Overview page. **Spec only — not implemented.** Linked from this file's master index as Tier 3 entry #21.

**What it covers:**
- 5 architectural issues (section sprawl, cards duplicating sidebar nav, no real-time signal, no sparklines, layout bug)
- 11 specific gaps (no since-you-were-here, no SLA breach surfacing, no quick-filter, etc.)
- 9 polish nits (pluralization choppy, `oldestWaitDays` calc bug at line 2662, hardcoded margin drift)
- Proposed 4-section redesign with full ASCII mockup
- 7-phase effort estimate (~9.5 days total; first 3 days carry ~70% of the visible quality lift)
- Acceptance-criteria checklist

**One real bug surfaced (worth a separate fix):**
- `OverviewPage` line 2662 reads `i.ageDays` for `oldestWaitDays`, but `RichInquiry` doesn't have `ageDays` — it has `lastActivityHrs`. Probably renders `NaN d` in the focus-card hint when `awaiting.length > 0`. Trivial one-line fix.

### 28.4 **Top Performers — Pages ↔ Talent switcher** (Website Performance section)

The headline addition. Extends §27.2's "Top performing pages" table on the Website page with a tabbed switcher so the same section can show **Pages** OR **Talent**, both ranked by website-side analytics.

#### Why on the Website page (and not Overview)

The Overview audit (§28.3) initially proposed a Top Performers section there. **Re-scoped:** the Website page already has the analytics infrastructure (`WebsitePerformance` + `byPage7d/30d` data shape) — extending that surface keeps related signal together. The Overview audit was updated to reflect this (now a 4-section proposal, not 5).

#### State model — new `WebsiteTalentMetrics` type

Added in `_state.tsx`:

```ts
export type WebsiteTalentMetrics = {
  talentId: string;        // roster id (matches ROSTER_AGENCY entries)
  talentName: string;      // denormalized for prototype simplicity
  visits: number;          // visits to pages where the talent was featured
  inquiries: number;       // inquiries that named this talent
  bookings: number;        // bookings that resulted
  revenue: number;         // booking revenue attributed (workspace currency)
  topPageId?: string;      // page that drove the most visits for this talent
};
```

`WebsiteAnalytics` extended with `byTalent7d: WebsiteTalentMetrics[]` and `byTalent30d: WebsiteTalentMetrics[]` (sibling to existing `byPage7d` / `byPage30d`).

`WEBSITE_STATE.analytics` seeded with 5 talent for both windows: Marta Reyes, Tomás Navarro, Lina Park (the seeded minor — see §25), Amelia Dorsey, Kai Lin. Numbers tuned so Marta dominates revenue (€18,400 / 7d), Kai has visits but no bookings yet (realistic edge case).

#### UI — segmented tab strip in the section header

`WebsitePerformance` (`_pages.tsx:8219`) gains a `topView: "pages" | "talent"` state. The "Top performing pages" header row was replaced with a flex-justify-between layout:

```
┌────────────────────────────────────────────────────────────────┐
│ TOP PERFORMERS                              [ Pages | Talent ] │
└────────────────────────────────────────────────────────────────┘
```

Pill toggle, same pattern as the section's existing 7d/30d `PeriodToggle` for visual consistency. Active tab gets `COLORS.card` background + 1px shadow; inactive is transparent slate.

#### Pages tab (default)

Unchanged from §27.2 — same 5-column table (Page · Visits · Inquiries · Bookings · Conv. rate), conv-rate colored relative to site overall (green if beats site avg, indigo if has bookings but below avg, dim if zero).

#### Talent tab

New 6-column table:

| Column | Source | Format |
|---|---|---|
| Talent | `t.talentName` + computed conv `t.bookings / t.visits` as a sub-line | bold name, dim sub |
| Visits | `t.visits` | tabular numerals |
| Inquiries | `t.inquiries` | tabular numerals |
| Bookings | `t.bookings` | tabular numerals |
| Revenue | `t.revenue` via `fmtMoney()` | tone-colored: green if conv beats site avg, indigo if revenue > 0, dim if zero |
| Top page | `t.topPageTitle` (resolved from `t.topPageId` against `pages[]`) | muted, single-line truncate |

Top 4 talent shown, ranked by **revenue** (not visits — for talent the commercial signal matters more than vanity views).

#### Production wiring map

| Field | Source query (production) |
|---|---|
| `byTalent7d[].visits` | `count(distinct visitor_id) from agency_event_log where event = 'page.view' and tenant_id = ? and ts > now() - interval '7d' and page_id in (select page_id from agency_pages_talent_appearances where talent_id = ?)`. **Last-touch attribution** — the talent gets credit if they appeared on the page during the visit. |
| `byTalent7d[].inquiries` | `count(*) from inquiries i join inquiry_talents it on i.id = it.inquiry_id where it.talent_id = ? and i.created_at > now() - interval '7d'` |
| `byTalent7d[].bookings` | Same but `bookings` table |
| `byTalent7d[].revenue` | `sum(b.total_amount) from bookings b join booking_talents bt on b.id = bt.booking_id where bt.talent_id = ? and b.confirmed_at > now() - interval '7d'`. If multi-talent bookings need to split revenue, divide by `bt.split_share` (per-talent percentage of the booking total). |
| `byTalent7d[].topPageId` | The page_id that ranked highest in the `byPage7d` rollup but ALSO appeared with this talent. Subquery against `agency_pages_talent_appearances`. |
| `byTalent30d` | Same queries with 30d window |

**Schema dependencies (NEW for production):**
- `agency_pages_talent_appearances(page_id, talent_id, position, since)` — many-to-many, tracks which talent appears on which page (roster page = all roster talent; storefront feature = featured talent).
- `inquiry_talents(inquiry_id, talent_id, role)` — already exists per the inquiry workspace data model. Production reads this to attribute inquiries.
- `booking_talents(booking_id, talent_id, split_share)` — many-to-many, with `split_share` if revenue needs to be split across multi-talent bookings.

#### Where the work is in source

- **Type:** `_state.tsx` — `WebsiteTalentMetrics` (new) + `byTalent7d` / `byTalent30d` added to `WebsiteAnalytics`
- **Seed:** `_state.tsx` `WEBSITE_STATE.analytics` — `byTalent7d` and `byTalent30d` arrays seeded
- **UI:** `_pages.tsx` `WebsitePerformance()` — added `topView` state, `topTalent` computed value, replaced the Top performing pages block with a tab-switched compound block

### 28.5 Files changed this session

| File | Change |
|---|---|
| `_state.tsx` | `WebsiteTalentMetrics` type + `byTalent7d/30d` on `WebsiteAnalytics` + seed data |
| `_pages.tsx` | `topView` state + `topTalent` computed + tab switcher header + new Talent table block (replaced single-table block) · removed duplicate `Search ⌘K` chip from `WorkspaceTopbar` |
| `OVERVIEW_AUDIT_2026.md` | New audit doc (Tier 3, linked from master index) |
| `dev-handoff.md` | Master index #21 added; this §28 section |
| Various memory files | (No changes this session.) |

### 28.6 Verification

- `npx tsc --noEmit` → exit 0 (only the 3 pre-existing `_messages.tsx` errors remain — unchanged from §26)
- DOM probe via preview tools confirms:
  - Workspace topbar now has ONE search chip (`aria-label="Search anything (⌘K)"`)
  - Website page renders the new "Top performers" header with Pages | Talent tab strip
  - Pages tab is active on first paint (default)
  - Clicking Talent switches active state; talent table renders with 5 rows
  - First Talent row reads: "Marta Reyes / 0.48% conv / 624 / 7 / 3 / €18,400 / Roster" (matches seed)
- All 25 links in this doc's master index resolve to real files (filesystem check).

### 28.7 Working-tree state at handoff

Nothing in §26, §27, or §28 has been committed yet. The cumulative working-tree state when the dev picks this up:

- All §26 fixes (scroll-lock, PrimaryButton black-CTA, talent header, preview drawer rewrite, MobileInboxTab, Atelier Roma rename, polaroids copy fix, the 3 _messages.tsx TS error fixes)
- All §27 work (Website page + Performance dashboard + I1/I2/I3/I7/I8 closeouts)
- All §28 work above

Suggested commit grouping when ready:
1. `feat(prototype-shell): admin-shell modernization sprint` — §25 (already committed: `5e0ce66`)
2. `fix(prototype): scroll-lock recovery + black-CTA leak + talent profile polish` — §26 (already committed: `11d8fa0`)
3. `docs(prototype): consolidate admin-prototype docs into single folder` — §28.2 only (most invasive, but mechanical)
4. `feat(website): consolidated business-funnel dashboard + Performance section` — §27.1 + §27.2
5. `feat(website): Top performers Talent ↔ Pages switcher` — §28.4
6. `fix(website): wire I1/I2/I3 closeouts (page-builder routes / add-redirect / domain drawer)` — §27.3 + §27.4 + §27.5
7. `feat(field-engine): I7/I8 closeouts (catalogId threading + publish gate)` — §27.6 + §27.7
8. `chore(prototype): topbar duplicate Search chip removed + Overview audit + handoff §28` — §28.1 + §28.3 + this section

Or one giant `feat(prototype-shell): post-sprint polish + Website page + audit closeouts` if commit-grouping is overkill for the team's cadence.



