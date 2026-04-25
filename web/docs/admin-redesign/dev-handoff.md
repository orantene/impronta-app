# Admin Redesign — Dev Handoff

**Audience:** the engineer(s) translating the clickable prototype into production code.
**Prototype path:** `web/src/app/prototypes/admin-shell/`
**Live URL (dev):** `http://localhost:3000/prototypes/admin-shell?surface=workspace&plan=free&role=owner&alsoTalent=true&page=overview`

This document explains every meaningful design decision, what the building blocks are, and what the production translation looks like. Read it once before touching the code. Cross-reference with `consolidation-map.md` (which surface lives where) and `admin-ux-architecture.md` (the prior strategic write-up).

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

## 3. Architecture — 9-file split

The prototype now spans nine files. The original 5-file admin shell stayed put; the messaging-first inquiry core and the three sibling surfaces each got their own file. Don't grow files past ~2,500 lines — split when one crosses that line.

```
admin-shell/
├── page.tsx          ~70 lines   Entry. Mounts the provider tree.
├── _state.tsx       ~1700 lines  Types · mock data · RICH_INQUIRIES + threads · ProtoProvider · useProto · tokens.
├── _primitives.tsx  ~1700 lines  Icon · atoms · cards · drawer/modal shells (with size modes + drag-resize) · ToastHost.
├── _pages.tsx       ~3000 lines  ControlBar (surface-aware) · WorkspaceTopbar · admin page renderers · SurfaceRouter.
├── _drawers.tsx     ~3300 lines  DrawerRoot dispatcher · 60+ drawer bodies · UpgradeModal.
├── _workspace.tsx   ~1100 lines  InquiryWorkspaceDrawer — the POV-aware inquiry pane (admin/client/talent share one component).
├── _talent.tsx      ~1500 lines  TalentSurface — Today / Inbox / Calendar / Activity / Profile / Settings, plus 14 talent drawers.
├── _client.tsx      ~1700 lines  ClientSurface — Today / Discover / Shortlists / Inquiries / Bookings, plus 15 client drawers.
└── _platform.tsx    ~1700 lines  PlatformSurface — dark "Tulala HQ" console with HQ role gating + 21 ops drawers.
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
