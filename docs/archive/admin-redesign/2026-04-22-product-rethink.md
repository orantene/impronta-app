# Admin redesign — product rethink, not a polish pass

**Status:** plan, not implementation.
**Author:** Claude (internal).
**Date:** 2026-04-22.
**Scope:** the entire admin / dashboard experience, not just Site Settings.
**Standard:** does this feel like a premium modern SaaS app that real admins want to spend time in? "Technically works" is not the bar anymore.

This document is deliberately opinionated. I push back where the current structure is holding the product back, and I make specific recommendations with reasoning. The execution plan in §8 is phased and reversible — we do not have to buy the whole vision to start.

---

## 1. Diagnosis — what the admin is right now, and what's wrong with it

I walked the admin surfaces live this session (login, `/admin`, site-settings overview + structure + sections + branding + design + identity, plus the tenant storefront). Observations below are tied to concrete files so the rebuild has a map.

### 1.1 It reads as "a CMS with an overview page bolted on"

The `/admin` landing is currently a **count-card dashboard**: 7 translation-health cards, a Control Center of 3 operational shortcuts, a Recent Activity log, an Inquiry Engine health banner, and now (after this session) a Your Public Site band. That's 10+ things competing for the eye on one page. ([admin/page.tsx](web/src/app/(dashboard)/admin/page.tsx))

What an agency owner actually needs to know on opening the admin:
- Is anything on fire? (failed payment, stuck inquiry, expired media)
- What did my team do since I last looked?
- Do I have unpublished work?
- What's the one thing I should do next?

The current page answers *none of those four* directly. It answers "how many translation gaps exist" — a maintenance concern that should live on its own tab.

### 1.2 Information architecture is fragmented across two axes

**Axis 1 — sidebar (12 groups):** Dashboard, Operations, Talent, Clients, Media, Website, Directory, Docs, AI, Analytics, System. Each expands into 3–8 children. Total discoverable leaf nodes: probably 50+.

**Axis 2 — horizontal tabs under Site Settings (12 tabs):** Overview, Identity, Branding, Design, Navigation, Pages, Sections, Content, SEO & indexing, Structure, System, Audit. ([site-settings-section-nav.tsx](web/src/components/admin/site-settings-section-nav.tsx))

The composer ("Structure") is tab #10 of 12. Identity and Branding are separate tabs even though a tenant cannot distinguish them without reading both. Pages and Content are both about pages. Audit and System and SEO are rare-access, yet they sit as siblings to the daily-use composer.

This is CMS-plugin-style IA: every *data table* gets a tab. A product IA would be: every *user goal* gets a surface.

### 1.3 The form aesthetic dominates

Almost every admin page is structured the same way:
`<AdminPageHeader>` → `<DashboardSectionCard title="…" description="…">` → form fields → buttons.

The section-card-wrapping-form pattern appears on Identity, Branding, Design, Pages, Sections, Audit, SEO, System. It's a layout mixin that imposes sameness on surfaces that should have very different affordances. Editing a *brand* shouldn't feel like editing a Django admin row.

### 1.4 Visual language reads dusty

The chrome is beige + muted gold: `--impronta-surface`, `--impronta-gold`, `--impronta-muted`. It's deliberately editorial — which is great for a wedding-talent *storefront*. It is wrong for the *product*:
- The admin SHELL is platform-branded (Rostra now, post-this-session).
- A platform shell themed to match one vertical (editorial wedding) is a category error. A roster-management SaaS used by a photography agency, a modeling agency, and a voice-over roster should not feel like a bridal boutique on the back-end.
- Low-contrast muted foreground text on beige reads as "old enterprise pastel" rather than "modern editorial calm."

Screenshots from this session (dashboard with translation health; site-settings with preset tiles; identity form) consistently look like *a well-intentioned WordPress admin*, not like Linear / Vercel / Stripe / Figma.

### 1.5 There's no sense of state

- Is my site currently serving a draft or a published composition? Nothing in chrome tells me.
- When was the last publish? Nothing in chrome tells me.
- Am I in a workspace that has 5 talents or 500? Nothing in chrome tells me.
- Has any teammate made changes since I last looked? Nothing in chrome tells me.

Premium SaaS wears its state on its sleeve (Vercel's deploy status dot, Linear's last-updated, Figma's multiplayer avatars). Rostra currently exposes all of this through click-through, not ambient display.

### 1.6 Dev / milestone language leaks, even after this session

Already scrubbed surface-level strings ("M5", "Phase 8.6A"), but there remains:
- "Control center" (ops-y)
- "Translation Center registry"
- "Inquiry engine v2 (Phase 2)" in admin settings
- "Translation health" as a top-of-landing headline
- "CMS hub" in the site-settings layout (fixed this session but more instances elsewhere)

These read as "built by engineers, never rewritten by a product writer."

### 1.7 Every page is destination-only

To do *anything*, an admin has to navigate to *the page for that thing*. There's no universal quick action. The `AdminCommandPalette` exists (⌘K) but:
- It's discoverable only by keyboard
- It's search-only, not action-first
- It doesn't execute things; it navigates to them

Compare with Linear: `⌘K` → "new issue" → opens the create form right there, no nav. Or "change status to Done" → fires the action. Rostra's `⌘K` is "go to thing," not "do thing."

### 1.8 Empty states are inconsistent

Some are excellent (Sections list has a proper empty state with two CTAs, good copy). Some are placeholder text ("No recent activity yet"). Some are bare tables. The audit + SEO + sparse-use pages I rewrote this session were literal "Placeholder for Phase 8.6B" strings until a few hours ago. Empty states are a product surface, not a gap.

### 1.9 Summary of the diagnosis

The admin is in a specific phase of product evolution: **the engineering got ahead of the product voice.** Everything works, the data model is solid, RLS and CAS and revision are in place — and the UX is still expressing that data model directly to the user, rather than translating it into a product. The fixes are not more forms. The fixes are taking a product-design scalpel to the IA, the dashboard, the site-settings model, and the visual language, in that order.

---

## 2. New admin product vision

### 2.1 The one-line

> **Rostra's admin is a *studio* for running a roster-based business — the place where an agency composes their public identity, operates their inquiry pipeline, and manages their roster, all inside one calm, confident workspace.**

Three keywords do the work: **studio**, **compose**, **operate**.

### 2.2 Three modes, one surface

Every admin task falls into one of three modes, and the chrome should make the mode obvious:

1. **Operate** (daily) — inquiries, messaging, bookings, offers. This is the *pulse* of the business. It's time-sensitive, notifies, has inboxes, and rewards a fast feedback loop. Model: Linear, Front, Pylon.
2. **Compose** (periodic) — the site, the roster presentation, the content. This is *creative work*. It rewards space, drafts, preview, undo, sharing. Model: Figma, Framer, Webflow, Notion.
3. **Configure** (rare) — identity, integrations, users, billing, audit. This is *settings*. It should be correct, searchable, and out of the way. Model: Stripe's account → settings, Vercel team settings.

The current admin treats all three as the same kind of surface (tabs + forms + cards). A studio separates them.

### 2.3 Product feel — five adjectives, each with a test

1. **Fast** — every primary action is ≤1 click or ⌘K-reachable from any page. Test: time a real admin from landing to "composition published." Target: under 20 seconds for a small edit.
2. **Calm** — no more than 2 primary foci per surface. No cards-inside-cards-inside-cards. Generous whitespace. Test: can you describe what the current surface is for in under 8 words?
3. **Confident** — state is ambient, not buried. Draft/published badge in chrome, last-publish stamp visible on hero, teammate activity visible without clicking. Test: can you answer "is my site live" without leaving the page you're on? Today: no.
4. **Opinionated** — starter flows, sensible defaults, a "next best action" prompt. Don't ask admins to build from a blank page unless they want to. Test: a fresh tenant should reach a live homepage in under 5 minutes without reading docs.
5. **Premium** — the chrome itself is a statement. Typography is intentional, palette is restrained, motion is purposeful, no page feels like a settings dumping ground. Test: screenshot any admin surface and drop it into a Linear/Vercel/Stripe side-by-side. Does it belong in the category? Today: no.

### 2.4 What it is NOT

- Not a Linear clone. Rostra has creative surfaces (composer, branding) that Linear doesn't.
- Not a Webflow clone. Rostra has operational pipelines (inquiries, bookings) that Webflow doesn't.
- Not a Shopify clone. The IA is roster-centric, not commerce-centric.

The right mental reference is **Framer (composer) + Linear (operate) + Vercel (configure)**, unified under one shell with one consistent design language.

---

## 3. Information architecture — challenge the current structure

### 3.1 Rule I'm applying

> **Every top-level navigation item must answer "what am I doing here?" in a verb, not a noun.** "Compose", "Operate", "Configure" — verbs. Not "Sections", "Pages", "Settings."

### 3.2 Proposed top-level sidebar (5 items, not 12)

| Current (12 groups) | Proposed (5 items) | What lives here |
| --- | --- | --- |
| Dashboard | **Home** | Command center — state, activity, next best action. §4 covers this. |
| Operations, Clients | **Pipeline** | Inquiries, offers, bookings, client messaging. One workspace, three tabs inside. |
| Talent, Media | **Roster** | Talent profiles, media, submissions, approvals, profile health. Media is not a top-level concern; it's a tool inside roster. |
| Website, Directory, Docs | **Studio** | Site composition, brand, pages, sections, directory config. This is the ex-"Site Settings" area, elevated and rethought. See §5. |
| AI, Analytics, System, Settings | **Workspace** | Team, integrations, billing, analytics, AI tuning, audit, data. The rare-access drawer. |

Docs (the current sidebar group) moves out of the chrome entirely — it belongs as an `?` help launcher in the top-right corner, not a navigation peer to the daily-work surfaces.

This is not a rename. It's **collapsing sibling concepts that admin brains already associate.** Today, "Talent" and "Media" are peers even though Media only exists to serve Talent. "Website" and "Directory" are peers even though Directory IS a website surface.

### 3.3 Within Studio — collapse 12 tabs to 4

Today's Site Settings has 12 horizontal tabs. Proposal:

| Today (12 tabs) | Proposed (4 tabs + advanced drawer) |
| --- | --- |
| Overview | (gone — Home covers it) |
| Identity, Branding, Design | **Brand** — one unified surface: name, logo, palette, typography, tokens. With a "basics" view and an "advanced" view. |
| Structure, Sections, Pages | **Compose** — the builder. Structure is the primary composer; Sections is the library (side panel); Pages is the list of pages being composed. |
| Content | **Content** — posts, navigation, redirects. Separate from Compose because it's text-oriented, not layout-oriented. |
| Navigation | (moved into Content) |
| SEO & indexing | (moved into per-page SEO + a Publishing drawer) |
| System, Audit | **Advanced ▸** drawer — rare-access: audit log, system toggles, data export, danger zone. |

4 tabs + advanced drawer. Today: 12 tabs, all equally weighted.

### 3.4 Pipeline re-think

Pipeline currently lives under "Operations" with Inquiries / Bookings / Clients as siblings. Proposal: one **Pipeline** surface with a single timeline view (inquiry → offer → booking → complete) as the primary, and Bookings / Clients as *lenses* on the same underlying data, not separate destinations.

The WhatsApp-replacement thesis (from the product memory: "Rostra replaces WhatsApp chaos with structured coordination") is the product promise. The IA should make "handle an inquiry end-to-end" the most obvious path in the product, not a thing scattered across 3 sibling pages.

### 3.5 Roster re-think

Roster combines Talent + Media. Within Roster:
- **Talent directory** (list / grid / table — pick a view, don't force one)
- **Submissions queue** (review / approve — today it's a Media child page)
- **Field & taxonomy** (directory schema — move here from the current Settings)
- **Roster health** (one health tab showing bio completion, ES translation, media approval status, profile visibility — replaces the 7-card translation-health grid on the landing)

### 3.6 Workspace (rare-access)

Everything that is "configure once" goes here: team & invites, integrations, plan & billing, AI tuning, audit, data tools, feature flags, environment. This is the drawer you open twice a month.

### 3.7 What goes away from primary navigation

- Translation health on the landing (moves to Roster → health)
- Docs as a sidebar group (moves to top-right ?)
- Audit as a Site Settings tab (moves to Workspace)
- System as a Site Settings tab (moves to Workspace)
- SEO as a Site Settings tab (becomes a per-page concern + a Publishing drawer)
- Analytics as a top-level item (moves to Workspace — it's "look at the numbers," not "do work")

### 3.8 Why this works

A first-time admin lands with 5 choices instead of 12 and a working mental model in 30 seconds ("Home is my cockpit, Pipeline is my inbox, Roster is my team, Studio is my site, Workspace is my settings"). A daily admin lives in 2–3 surfaces all day (Home + Pipeline + Studio) without tab-hunting.

---

## 4. Dashboard redesign — the command center

### 4.1 What it is today

`/admin` is a count-card grid with translation health as the visual headline, followed by a 3-card operations band, plus banners and a recent-activity list. It's a summary of *system state*, not a workspace for *doing work*.

### 4.2 What it should be

A **command center**: one hero, three situational modules, one ambient activity stream, and a quiet site-status strip. No more count-card sprawl.

### 4.3 Layout proposal (desktop, top to bottom)

#### 4.3.1 — Chrome-adjacent: site status strip (persistent, not just on Home)

Always visible in the top bar, right of the workspace switcher:

```
● Published 2h ago  ·  2 draft sections  ·  [ Preview draft ]
```

- Green dot + "Published Xh ago" if no pending draft
- Amber dot + "N draft sections" if there's an unpublished change
- The strip is click-through to the composer

This single element answers "is my site in a known state" ambiently. It's not on Home only — it lives in the top bar on every admin page.

#### 4.3.2 — Hero: "Next best action" card

One card. One action. Stateful.

- **Fresh tenant, no homepage composition yet:**
  Hero is "Go live — pick a starter" with the 3 preset tiles (Editorial Bridal / Classic / Studio Minimal) already inlined. Today these tiles are buried on the Structure page. On Home, for a fresh tenant, they're the only thing that matters.
- **Has draft waiting to publish:**
  Hero is "You have 2 draft sections" → [Review diff and publish].
- **Has inquiries waiting on coordinator:**
  Hero is "3 inquiries need a coordinator response" → [Open pipeline].
- **All clear:**
  Hero is a quieter "Your site is live and running" card with preview link and "add a new page" / "add talent" secondary actions.

This is "next-best-action UI." It replaces the current "overview everything at once" pattern with "here's the one thing to do right now."

#### 4.3.3 — Three situational modules (never more than three)

Situational because what's shown depends on the tenant's state. Examples:

- **Pipeline pulse** — 3 numbers (new / offered / this week's bookings), each a link. Shown always.
- **Roster health** — one sparkline card: "12 talents, 3 pending bio approval, 1 missing ES." Links into Roster. Shown when anything needs attention.
- **Site changes** — "Your team made 4 edits in the last 7 days" with avatar dots. Shown when there's team activity.
- **Revenue snapshot** (if a plan/billing surface lights up later).

Never more than three. Never all at once.

#### 4.3.4 — Activity stream (quiet, right rail or bottom)

A single column of the 10 most recent events: "Maria published the homepage," "New inquiry from Laura C. (Amalfi Coast wedding)," "Sofia's profile was approved." Each with a timestamp and a click-through. Not a Recent Activity section card — just a list with generous whitespace.

### 4.4 What's removed from Home

- The 7-card translation health grid (moves to Roster → health)
- The 3-card Control Center (replaced by the Pipeline pulse + surface-specific next-best-action)
- "Your public site" 3-card band (added this session — retained as a row, but becomes the next-best-action hero for fresh tenants; for established tenants it fades into the secondary modules)

### 4.5 What's added

- Ambient site-status strip (chrome-level, always on)
- One hero next-best-action card
- At most three situational modules
- A real, readable activity stream (not a buried section)

### 4.6 Why this works

The current Home answers "what is everything." The proposed Home answers "what now." The difference is the product shift from "dashboard" (passive) to "command center" (active).

---

## 5. Site builder / site settings rethink

### 5.1 Current reality

12 tabs. Each a destination. Each a form. The composer is tab 10. Brand is split across 3 tabs (Identity, Branding, Design). Navigation has its own tab. Audit and System are siblings to the composer.

### 5.2 Proposed model: a **Studio workspace**, not a settings area

The mental model shift: stop thinking "Settings → sub-settings." Start thinking "a studio with 4 rooms."

The 4 rooms:

#### Room 1 — **Compose** (primary, 80% of time spent here)

The homepage composer, extended. Left rail: section library (filtered by type, with real thumbnails per Polish Queue #2). Canvas: the composition. Right rail: a contextual inspector that changes based on selection (section meta, page meta, whole-composition meta). Top: mode toggle (Build / Preview). Bottom: publish bar showing draft/live delta.

This is **one unified workspace**, not separate Structure, Sections, Pages tabs. "Which page am I composing?" is a dropdown in the top bar. "Which section am I editing?" is selection on the canvas. The section editor opens as a right-rail inspector, not a new page.

#### Room 2 — **Brand** (frequent but not daily)

One page, three sub-regions:
- **Identity** — agency name, tagline, legal name, localization (compact)
- **Look** — logo mark, favicon, colors, type, radii (unified — no separate Branding vs Design distinction for basic use)
- **Advanced tokens** — full token registry behind "Advanced" disclosure

Today, the split between Identity and Branding and Design is arbitrary from the user's POV. A tenant thinks "my brand" — it's one thing.

#### Room 3 — **Content** (occasional)

Pages (non-homepage), posts, navigation menus, redirects, SEO defaults. Keep as separate list destinations within this room, but de-emphasize — this is text-editor work, not builder work.

#### Room 4 — **Publishing** (advanced, right-rail or drawer)

Publish history, revision restore, audit log, SEO rules, indexing toggles. Accessible from a top-right "Publishing ▸" button on every Studio surface, not from a sibling tab.

### 5.3 Dropped / demoted

- "Audit" as a top-level Site Settings tab → moves to Workspace → Advanced
- "System" as a top-level tab → Workspace → Advanced
- "SEO & indexing" as a tab → split: page-level overrides live in page editor; site-wide defaults live in Brand → Identity; indexing rules live in Publishing drawer
- "Overview" tab → gone. The Studio *is* the overview.

### 5.4 Visual model

Not a row of tabs. A left rail with the 4 rooms as modes. Like Figma's Design / Prototype / Inspect mode toggle, but vertical. Each room is a distinct surface with its own affordances — not a `<DashboardSectionCard title="…" description="…">` wrapping yet another form.

### 5.5 Why this works

The current model asks "where does this setting live?" and has 12 answers. The new model asks "what am I doing right now?" and has 4 answers, one of which (Compose) is the answer 80% of the time.

---

## 6. Visual design direction

### 6.1 The hard call: drop the beige chrome

The beige / gold palette is beautiful on the Midnight Muse Collective storefront. It is wrong for the platform shell. A roster-management SaaS used by a photography studio, a modeling agency, and a voice-over roster can't be themed like a wedding agency on its back end.

Recommendation: **split the palette into two layers.**

- **Chrome (admin shell)** — a platform-neutral, modern palette. Restrained. Works in both light and dark. Accents are tenant-configurable (so tenants who *want* a warm admin get it, but it's opt-in).
- **Storefront (public-facing)** — the tenant's own brand, as configured via Brand.

Today both run the same `--impronta-*` CSS variables. That's the root of the "dusty" feel in admin.

### 6.2 Proposed chrome palette

Dark-mode-first (with a polished light mode as peer, not afterthought):

- **Surface stack** — near-black surface (`oklch(0.15 0 0)`), one step lighter for elevated cards (`oklch(0.18 0 0)`), borders as 10-15% lighter still. Current beige `oklch(0.93 0.03 85)` does not belong here.
- **Foreground hierarchy** — pure white for primary text, ~70% opacity for secondary, ~45% for tertiary. Today's muted foreground is too muted; primary text should feel primary.
- **Accent** — one accent color, tenant-configurable. Default: a confident gold (keep the brand DNA) but a high-saturation version, not the muted current one. `oklch(0.78 0.18 85)`-ish for dark mode.
- **Semantic colors** — unambiguous: emerald for success/published, amber for draft, rose for error/danger. Today's "amber-300" is fine; applying it consistently is the gap.

### 6.3 Typography

- **Chrome** — one sans (Inter, Geist, or similar neutral grotesque). Not the editorial display font the storefront uses.
- **Display** — reserve display font for story-telling surfaces (storefront, publish confirmations, empty-state illustrations). Not for every section title.
- **Size scale** — collapse to 5 steps: 11, 13, 15, 18, 24. Today's mix of `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl` without clear rules is part of why it feels inconsistent.
- **Weight** — 400/500/600 only. Avoid 700 (too heavy for the modern-product feel we want).

### 6.4 Spacing + density

- **Density** — less dense than today on primary surfaces (command center, composer, brand). More dense OK on list/table surfaces (Roster list, Pipeline). Today it's uniformly medium-dense, which is why no surface reads as "important."
- **Card system** — radius 12–16px (today's 2xl = 16px is fine), shadow is softer, borders are 1px with low-opacity. Remove card-inside-card nesting wherever possible.
- **Section headers** — an uppercase tracking-wide label (current "translation health" style) is fine once per section. Not stacked with title + subtitle + description on every card.

### 6.5 CTA emphasis

Today: Button components are muted and similar-weight across the app. Proposal:
- **Primary action** — one per surface. Solid, filled, accent color, clear weight.
- **Secondary action** — outline. Neutral border.
- **Tertiary / inline** — text link with underline offset.
- **Destructive** — outline + rose text on hover fill.

The current "everything is a rounded-xl outline button" doesn't signal what's primary.

### 6.6 Empty states

Replace text placeholders with intentional empty states that have:
- A one-line title in display voice
- Two-line product explanation
- A primary CTA and at most one secondary
- Optional: a small illustration or pattern (eventually)

The Sections list empty state already models this. Propagate everywhere.

### 6.7 Motion

- 150ms default for micro-transitions (hover, focus, dropdown)
- 250ms for state transitions (modal, drawer)
- Spring, not linear, for drag-drop in composer
- Zero motion on reload / first render — don't fade-in content

### 6.8 A test for "premium"

Screenshot any admin surface. Put it side-by-side with Linear, Stripe Dashboard, Vercel, Framer. Do your eyes go to Rostra first, or do they go somewhere else? Today: somewhere else. After this redesign: Rostra should hold its own.

---

## 7. Interaction quality — make it feel fast and engaging

### 7.1 Command palette that actually does things

Today's `⌘K` opens a search-only palette that navigates. Expand it to an **action palette**:

- `⌘K` → "new inquiry" → opens the inquiry create form inline (modal, not page)
- `⌘K` → "publish" → opens the publish pre-flight modal from any page
- `⌘K` → "preview site" → opens the storefront in a new tab
- `⌘K` → "switch to Nova Crew" → workspace switcher fires
- `⌘K` → "mark as paid" (on a booking) → fires the action

Every action in the product should be ⌘K-reachable with a verb. That is the keyboard-first mental model premium SaaS products use.

### 7.2 Inspector pattern everywhere

Stop navigating to edit. Adopt a right-rail inspector for object editing:
- Click a talent card in Roster → opens talent detail in right rail
- Click a section in the composer → opens section editor in right rail
- Click an inquiry row → opens inquiry detail in right rail
- Click a page in the Pages list → opens page settings in right rail

The composer already half-models this (draft preview alongside). Extend it.

### 7.3 Universal undo

Add a universal "Undo" toast on every mutating action, with a 10-second window:
- Archived a section → toast with undo
- Published a composition → toast with undo (= restore previous revision)
- Deleted a page → toast with undo
- Approved a media submission → toast with undo

The revision/CAS infrastructure is already there. This is a UI layer.

### 7.4 Keyboard shortcuts, visible

Every primary action has a shortcut (`⌘S` save, `⌘P` publish, `⌘K` palette, `⌘/` help, `⌘B` toggle sidebar, `⌘\` toggle inspector). Shortcuts are visible on hover tooltips and in the palette.

### 7.5 Status badges, everywhere

Every entity that has a draft/live concept wears a badge:
- Sections list → draft / live / outdated-schema
- Pages list → draft / live / scheduled (future)
- Composition → draft / live / publishing-now
- Talent profiles → draft / approved / archived

The `SectionStatusBadge` component exists — propagate.

### 7.6 Live state in chrome

Already covered in §4.3.1 — the site status strip lives in the top bar on every admin page. Also:
- Teammate avatars appear in chrome when another admin is active in the same workspace (future, but a visual placeholder can exist today)
- Last-saved stamp on every editor (`Saved 3s ago` → `Saved 1m ago`)

### 7.7 Contextual toasts with action

Toasts today are pass/fail. Upgrade to action toasts:
- "Section 'Hero' published. [Undo] [View live]"
- "3 sections failed to migrate. [Review]"
- "Invite sent to maria@… [Resend] [Copy link]"

---

## 8. Execution plan — phased, reversible, signal-driven

### Phase 0 — pre-flight (done)

✅ Round 0 stabilization pass (brand consistency, builder CTA, orientation copy, CI smoke). Current state is the floor we're building on.

### Phase 1 — "confident Home + collapsed Studio tabs" (≈3 days, highest leverage)

Goal: fix the two worst first impressions (dashboard + site-settings tab overload) without touching any data model.

- **Home redesign** — replace translation-health grid as the headline. Ship the command-center pattern: site status strip in chrome, hero "next best action" card, three situational modules (Pipeline pulse, Roster health, Site changes), quiet activity stream.
- **Site Settings → Studio (tab collapse)** — merge Identity + Branding + Design into one **Brand** surface with basic / advanced split. Merge Structure + Sections + Pages UX into one **Compose** workspace (routes stay, UX unifies). Keep **Content** as a slim tab. Move Audit + System + SEO behind an "Advanced" drawer.
- **Sidebar prune** — collapse 12 groups to 5 (Home, Pipeline, Roster, Studio, Workspace). This is a rename + regroup, not a route-kill.
- **Docs group** → top-right help launcher.

Measurable: a first-time admin reaches "homepage draft with 3 sections" in under 5 minutes with no docs. Today it requires knowing to click past translations into site-settings → structure.

**Risk:** every linked route from another module. Mitigation: keep old routes alive, redirect to new canonical routes, ship the IA change as a redirect layer + sidebar change in one PR.

### Phase 2 — "real chrome palette" (≈2 days)

Goal: fix the visual "dusty" feel.

- Introduce a second set of CSS variables for admin chrome (`--rostra-admin-*`). Current `--impronta-*` variables stay for storefront / tenant-themed surfaces.
- Dark mode as the default for admin. Light mode as polished peer.
- Typography collapse to 5-size scale, weights 400/500/600.
- Button hierarchy clear (primary / secondary / tertiary / destructive).
- Empty-state pattern standardized.

Measurable: put current admin and redesigned admin side-by-side with Linear/Vercel/Stripe. Do the new screens hold up? Internal review first, then selected users.

**Risk:** the cross-team surfaces that use `--impronta-*` tokens (dashboard client, talent). Mitigation: those surfaces stay on `--impronta-*` (tenant-themed); only the admin-specific shells adopt the new `--rostra-admin-*` tokens.

### Phase 3 — "action palette + inspector" (≈3 days)

Goal: move from "navigate to edit" to "act in place."

- Upgrade `⌘K` from search to action palette. Register action handlers for the top 20 admin actions.
- Right-rail inspector component (reusable). Wire Section editor + Talent detail + Inquiry detail into it.
- Universal undo toast (ties into existing revision infra).
- Status badges propagated.

Measurable: tester can publish a change using only keyboard. Tester never opens a second tab because the inspector shows what they need.

**Risk:** inspector state management complexity. Mitigation: ship inspector for ONE entity first (sections), prove the pattern, then expand.

### Phase 4 — "Pipeline and Roster workspaces" (≈5 days, post-signal)

Hold until Round 1 shows what's worst. If Round 1 says "Pipeline is scattered," then Pipeline unification ships. If Round 1 says "Roster is what needs love," then Roster. Don't pre-empt signal.

### Phase 5 — "polish + motion + craft" (ongoing)

- Illustrations for empty states
- Motion / micro-interactions per §6.7
- Keyboard-first audit (every action has a shortcut)
- Teammate presence in chrome
- Storefront preset thumbnail art (Polish Queue #2)

### Ordering rationale

Phase 1 gives the highest product-perception delta per hour of work, because it changes the two surfaces every admin sees first (Home + sidebar) and kills the tab sprawl that's the loudest cognitive cost. Phase 2 fixes the visual "dusty" impression, which you can't fix with IA alone. Phase 3 introduces the premium interaction primitives once the IA is stable enough to hang actions off. Phase 4 waits for Round 1 signal because we don't know yet which of Pipeline vs Roster is the bigger lift.

### What NOT to do in Round 1 window

- Don't rip out data models.
- Don't change Server Action contracts.
- Don't touch the CAS / revision layer.
- Don't force-add features that aren't in this plan.
- Don't move to a component library until Phase 2 has settled the design system.

### Signal loops

After each phase, a single walkthrough with a real admin (or me in QA mode if no admin is available). If the phase didn't make the product feel better, we don't ship the next phase of the same shape — we regroup. No cascading commitments.

---

## Appendix — references worth studying (not copying)

- **Linear** — command palette, sidebar rhythm, draft/live state visibility, subtle presence indicators, dark-mode-first chrome
- **Vercel Dashboard** — project cards, deploy status strip, clean typography, restrained accent palette
- **Stripe Dashboard** — settings organization (look at how rarely "Settings" is mentioned despite an enormous configuration surface), empty states with intentional copy
- **Framer / Webflow** — composer workspace model, right-rail inspector, mode toggle
- **Figma** — multi-mode single surface (Design / Prototype / Inspect), keyboard-first interaction, file-level vs instance-level inspection
- **Notion** — calm density, minimal chrome, structured IA that hides complexity behind predictable disclosure

What Rostra is not:
- Not a generic CMS admin — Rostra orchestrates a business, not just content
- Not a ticket system — Rostra has creative surfaces (composer, brand) that exceed any linear / task tool
- Not Shopify — the roster is not a product catalog; it's a team

That specificity is what the redesign should amplify. Right now, the admin doesn't show who Rostra is. After this redesign, it should be unmistakable.
