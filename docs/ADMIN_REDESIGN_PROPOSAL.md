# Admin redesign proposal — v2

**Status:** Proposal, not yet ratified.
**Date:** 2026-04-22 (revision)
**Context:** Supersedes v1 from earlier today. The v1 thesis stands. This revision sharpens the argument around a new framing the user surfaced: the builder is now credible; the shell around it has not risen to match. That gap is now the single biggest drag on perceived quality.

---

## 1. Brutally honest assessment

**The builder has risen. The shell hasn't. That gap is the problem.**

A user who opens the product today sees two products. One is the composer — which has drag-drop, live preview, undo/redo, publish-preflight, revisions, autosave, presets. It is genuinely good. The other is the chrome around it — `/admin` with a translation-health matrix, a flat 12-item sidebar, beige-on-beige cards, no command palette, no attention surfacing. **A user does not average the two.** The weakest surface anchors the whole impression. Until the shell rises, the builder's credibility is partially wasted — users conclude "this is an admin panel that happens to have a good page builder," not "this is a premium product."

Specific weaknesses:

- **The admin landing is an internal status board, not a dashboard.** The first thing `/admin` shows is Translation Health — a 7-card matrix of Spanish-bio gaps. This is interesting to a platform operator, not an agency admin. No agency owner starts their day thinking "first, let me check translation coverage." The landing serves the wrong reader.

- **13 flat items at the primary level, 12 more inside site-settings.** No grouping, no priority, no rhythm. Miller's 7±2 gets violated twice. The product reads as a bag of features, not a product with opinions.

- **The builder is the 10th item inside a nested sidebar.** The agency's storefront — the most visible artifact of their work — is buried. This is a structural statement that "the site" is an admin sub-concern. It isn't. It's the product.

- **Card-inside-card nesting, beige-on-beige contrast, typography that hedges.** `DashboardSectionCard` routinely wraps a container wrapping content — three borders for one thing. Titles don't commit. Uppercase micro-labels pad out the typography when a larger, confident title would do. Gold accent appears thinly enough to feel apologetic.

- **Passive, not active.** Every surface describes state. Almost none drive action. No "2 inquiries overdue," no "3 drafts, publish?", no first-run guidance. Everything is a counter to interpret. This alone is why the product reads as a CMS — a CMS is passive by nature.

- **Every click is a trust tax.** Publish lives 3 clicks from Home. Preview lives 4. Undo a section change lives inside a sub-editor. In a premium product, the high-frequency actions are 1 click and 1 shortcut. Currently they aren't.

- **The "blank page" problem goes unsolved.** A first-time admin lands on an empty Sections list, an empty Pages list, an empty Inquiries board. The empty states are functional at best, a plain outline button above a sentence. A first-time admin has no narrative. Starter recipes exist but only on Structure.

- **No return-user features.** Every session feels like the first session. No recents, no pinned, no saved filters, no "jump back to the draft you were editing." A 5th-session user navigates the same way as a 1st-session user, and that erodes habit.

- **Density is the wrong kind of sparse.** Premium admin tools (Linear, Stripe, Vercel, Shopify Home) are data-rich — a lot of information, organized. Ours has whitespace around low-information blocks. That's not minimalism; it's thin.

- **Color is decoration, not language.** Gold = "we're branded." But amber draft-state, emerald live-state, rose attention-state don't exist as a consistent vocabulary. State is told in text, not color. The eye can't scan.

- **Keyboard not respected.** No Cmd+K. No j/k navigation. No Cmd+Enter to publish. Power users have no handhold to accelerate; they plateau at mouse-speed forever.

- **The product feels slower than it is.** No skeleton loaders, no page-transition crossfade, no optimistic UI. A 200ms round trip feels like 2s when nothing moves on screen.

Taken together: the admin is *functional* but not *emotionally premium*. It doesn't tell you what to do, doesn't reward you for knowing your way around, and doesn't coordinate quality across surfaces. **The builder is credible. The shell must now become its equal, or the whole product reads as less than the sum of its parts.**

---

## 2. Product vision

**The shell is the frame of the builder. Today it fights it. Tomorrow it serves it.**

The admin is a **workspace, not a control panel.** The mental model the agency admin should form after 5 minutes of use: "This is the operating surface for my agency. I run my pipeline here, I curate my roster here, and I shape how my business appears to the world here."

**Three jobs, in order of daily frequency:**

1. **Operate** — inquiries, clients, talent, media. Multiple times per day.
2. **Curate** — the public site, roster editorial, branding. Weekly.
3. **Configure** — settings, audit, translations, integrations, plan. Rarely.

The current admin fans these into 13 flat siblings. They should be three distinct product areas with unambiguous visual weight.

**What the dashboard should feel like:**
A tenant-aware operating surface. First view: greeting + business state. Second view: what needs you right now. Third view: what changed recently. Primary action is always one click away. Translation gaps don't live here — they live as a chip in the attention rail and expand on demand.

**How the admin differs from a CMS:**
- CMS = content shape. Operating surface = outcomes (inquiries won, roster curated, brand delivered).
- CMS = passive (you navigate to it). OS = active (it surfaces what's off, invites next action).
- CMS = 20 menu items. OS = 4–5, with depth revealed on demand.
- CMS = forms. OS = wizards, inline edits, optimistic mutations, undo-everything.

**What a real agency admin should understand in the first 5 minutes:**
- "This is my workspace; my tenant is Impronta; my site is live at midnight.local."
- "Today I have 2 inquiries waiting, 3 section drafts ready to publish, 1 talent pending approval."
- "I can go to my site, my roster, my pipeline, or my settings — everything else lives under one of those."
- "I can hit Cmd+K to jump anywhere."
- "I can always get back to what I was last editing."

**What a premium SaaS operating surface feels like:**
- Dense, confident, opinionated.
- Keyboard-first, mouse-supported (not the other way round).
- Motion that confirms what happened, not motion for its own sake.
- A clear primary action on every surface — one thing the product wants you to do.
- State as a visual language (draft / live / attention / archived) not as text labels.
- Respect for the user's time: 1-click publish, undo in a toast, recents always available.

---

## 3. Information architecture rethink

**Current:** 13+ primary items + 12 inside site-settings. Flat, overexposed, meta-admin surfaces share sidebar weight with daily operations.

**Proposed primary nav — 5 items.**

1. **Home** — personalized, action-surfacing landing. Replaces `/admin`.
2. **Inquiries** — the pipeline. Highest-frequency op; earns primary.
3. **Roster** — talent list, detail, edit, media approval. Rename "Talent" → "Roster" (roster is the aggregate the agency owns).
4. **Site** — the builder. Structure is the default view; design, sections, pages, navigation, content, SEO, brand are sub-views.
5. **Settings** — workspace, team, plan, integrations, domains, audit, system, translations.

**What moves where:**

| Current | Destination | Reason |
| --- | --- | --- |
| `/admin/site-settings/structure` | `/admin/site` (default) | This IS the builder |
| `/admin/site-settings/*` (design, sections, pages, nav, content, SEO) | `/admin/site/*` sub-views | One product area |
| `/admin/site-settings/identity` + `/branding` | merged → `/admin/site/brand` | Same job |
| `/admin/site-settings/system`, `/audit` | `/admin/settings/*` | Meta-admin |
| `/admin/translations` | `/admin/settings/translations` + Home chip | Meta-admin, signal via chip |
| `/admin/talent` | `/admin/roster` | Rename |
| `/admin/media` | sub-view under Roster | Not a first-class destination |
| `/admin/clients` | keep standalone, evaluate as Inquiries/Contacts tab post-Round 1 | Watch usage |

**Site sub-views reordered by use-frequency, not alphabet:** Structure → Design → Sections → Pages → Content → Navigation → SEO → Brand.

**Global chrome (top bar or sidebar frame):** tenant switcher, Cmd+K, notifications, view-as-visitor toggle (when in /site), publish pill when pending drafts exist.

**Hidden / advanced-only:** audit log, system diagnostics, schema migrations, agency domains (until self-serve), full translation registry, platform operator tooling.

**Should site-settings become one clearer "Site" area?** Yes, unambiguously. `/admin/site` is a single product area. The current separation between `/admin/site-settings/structure` and `/admin/site-settings/design` is an accident of how we shipped the surfaces — not a product model.

**Are we overexposing configuration?** Yes. Every settings sub-page is currently a first-class route. In a premium product, settings is *one area*, organized internally. Linear puts 40+ settings under one `Settings` surface; ours has 12 at the top of the tree.

---

## 4. Navigation redesign

**The sidebar is for orientation. Cmd+K is the keyboard highway. The top bar carries state.**

**Sidebar:**
- Top: tenant switcher + workspace meta (name, plan, environment)
- Primary nav: 5 items (Home / Inquiries / Roster / Site / Settings)
- **No nested sidebar.** Secondary nav always in-page.
- Badges on primary items: "Inquiries (2)" when unresponded, "Site (3 drafts)" when pending, etc.

**Top bar:**
- **Left:** breadcrumb ("Site / Structure / Homepage") — always shows where you are, always clickable
- **Middle:** Cmd+K search (prominent, inviting — not a tiny icon) — searches talents, inquiries, pages, sections, settings, routes
- **Right:** notification bell with count, user menu, view-as-visitor toggle (when in /site)
- **Contextual action pill:** when a surface has pending drafts, a persistent pill: "3 changes pending — Publish" — visible anywhere inside /site. This replaces the need to navigate to a publish page.

**Secondary nav, per primary area:**
- Site: horizontal tab strip (Structure / Design / Sections / Pages / Content / Navigation / SEO / Brand)
- Roster: List / Detail is a drawer; Media / Editorial is a tab on the detail
- Inquiries: stage filter at top; opening an inquiry opens a drawer, not a route change
- Settings: left rail inside the Settings page only

**Tabs rule of thumb:**
- Use when sub-views share one object (a talent's Overview / Media / Settings are facets of one talent).
- Do not use to flatten an IA problem. 8 tabs = 8 destinations.

**Making the builder more prominent:**
- "Site" is a top-5 primary nav item.
- Home carries a "Your site" attention card that opens into the composer.
- The publish pill in the top bar is visible from anywhere in /site.
- Cmd+K has "Open composer" as a ranked suggestion.

**Making "needs attention" and "what's next" obvious:**
- Home opens with an attention strip — the N things that need the admin today.
- Primary nav items carry badge counts for pending items.
- Notification bell shows the same, expandable.
- Status chips (draft/live/attention) appear next to every object wherever it's listed — ambient state, not hidden.

---

## 5. Dashboard / home redesign

**Today's `/admin` is a status board for internal ops. Tomorrow's is the agency's operating surface.**

Proposed structure, top to bottom:

**1. Tenant-aware greeting (1 line)**
"Good morning, Ana — Impronta Models & Talent is live on midnight.local."

Personalized, calm, contextual. Sets the room.

**2. Attention strip (the "needs you now" row)**
Amber-accent cards, typically 1–4 of them based on current state:

- "2 inquiries waiting > 48h — open"
- "3 section drafts ready — review & publish"
- "1 talent pending bio approval — review"
- "3 Spanish translation gaps blocking ES site — review"

These are the dynamic signals. If nothing needs attention, this row hides entirely. That's the best outcome — a calm day.

**3. Metric strip (the "state of the business" row)**
4–6 cards, stable layout, the numbers that define an agency's health this week:

- Active pipeline value
- Inquiries this week (with trend arrow)
- Talents on roster
- Site views (once we wire analytics; placeholder card until then)
- Draft sections / pages pending
- Avg response time to inquiries

**4. Primary action row**
Four strong buttons, the actions an admin most often takes:

- New inquiry
- Add talent
- Edit site → opens the composer
- Open public site → opens midnight.local in a new tab

These are the "what should I do next?" anchors. No dropdowns. No disclosure. One click.

**5. "Your site" card**
Dedicated card showing site status, preview thumbnail, last published, and a primary "Open composer" button. This is what surfaces the builder without making it compete for sidebar position.

**6. Recent activity (capped, with view-all)**
Last 5 changes across talents, inquiries, publishes. The current recent-activity list is good; it just needs to cap and tighten.

**7. Operational signals (collapsed by default)**
Translation health, audit signals, system warnings — all folded into a single expandable card. Surfaces when the admin chooses. Does not dominate the landing.

This is the home a real agency admin will actually want to open every morning. It answers, in order:
- What's going on today? (greeting + attention strip)
- How's my business? (metrics)
- What do I want to do? (actions + Your site)
- What changed? (recent)
- Is anything off in the background? (operational signals, on demand)

---

## 6. Visual design direction

**Go harder than v1. The brief is: premium, earned density, opinionated, alive.**

**Typography — commit to choices:**
- Display serif for titles / brand flair (exists, use louder). Don't hedge.
- Body sans: 14px body, 13px meta. Tight line-height (1.4–1.5).
- Scale: 32 / 24 / 18 / 16 / 14 / 13 / 11. Use the scale — don't invent intermediate sizes.
- Reduce uppercase-micro-label usage. A clear larger title + optional tiny-gray meta line scans better.

**Color as meaning, not decoration:**
- Gold is the action color. Primary CTA, active nav, focus ring. Not text accents.
- Semantic system, one color per state: amber (draft), emerald (live), rose (attention), neutral-500 (archived). Used consistently everywhere — a draft anywhere looks the same.
- Reduce neutral shades from ~5 to 2 (page bg, card bg) + 1 elevation.
- Dark mode should feel actually dark — borders near-black, muted muddiness removed.

**Cards — three shapes only:**
- **Info:** data, no action. Metric cards, status tiles.
- **Action:** contains a primary CTA. Attention banners, guided flows.
- **Object:** represents a real thing (talent, section, inquiry) — clickable whole.
- One container per card. No nesting.
- Differentiate with elevation / subtle gradient, not more borders.

**Buttons — three weights, one primary per view:**
- Primary (gold, filled)
- Secondary (outline)
- Tertiary (ghost / link)
- If a page has two primaries today (Save + Publish), decide which matters more. Demote the other.

**Density — earned, not crowded:**
- Table rows 36–40px. Not 56.
- Metric cards dense; minimum surface area per unit of information.
- Whitespace is a tool, not a default. Use it around the ONE thing you want to emphasize, not between every block.

**Status badges — visual, consistent, everywhere:**
- Same draft chip on sections, pages, talents, inquiries.
- Same live chip, same attention chip.
- Chip language is the one thing that ties the whole shell together.

**Hover states — visible:**
- Cards: 1px lift + subtle shadow change, 100ms.
- Rows: background tint shift.
- Actions: color shift + cursor.
- Today hover is often invisible; users can't tell what's clickable.

**Motion — functional:**
- 200ms page-transition crossfade (no hard snap)
- Skeleton loaders on every data-dependent surface, not spinners
- Optimistic UI: type → autosave chip pulses → green check
- Live badge pulses on genuinely live surfaces
- Toast animations carry undo action for 4s

**Empty states — mini product pitches:**
- Title + 1-line reason + illustrative block or thumbnail + CTA
- Starter-recipes empty state on Structure is the benchmark. Every other empty state should meet it.

**References to calibrate against:**
- **Linear** — keyboard-first, density, motion quality, calm professional feel
- **Vercel Dashboard** — metric cards, card hierarchy, action affordance
- **Stripe Dashboard** — data density, status-as-language, command palette
- **Shopify Admin Home** — action-oriented opening, operational list density
- **Webflow / Framer** — builder-as-canvas, chrome that serves the canvas
- **Notion / Arc** — clean hierarchy, flexible IA, motion character
- **Raycast** — command-palette benchmark

Do not copy any of them. Calibrate against them.

---

## 7. Page-level redesign

**Home (`/admin`)** — see Section 5. The single biggest change.

**Site (`/admin/site`)** — default = Structure composer. Secondary nav as a horizontal tab strip (Structure / Design / Sections / Pages / Content / Navigation / SEO / Brand). Top bar shows "N changes pending — Publish" pill. Composer takes the full canvas; library + inspector dockable side panels. No nested sidebar.

**Design (sub-view)** — tokens grouped (Color / Type / Space / Motion), live-rendering preview iframe alongside, preset picker as horizontal gallery on top, sticky "Save draft / Publish theme" footer.

**Sections (sub-view)** — object-card gallery with preview thumbnail, name, type, usage ("Used on 3 pages"), status chip, quick actions (duplicate / edit / archive). Empty state = "Browse starter sections."

**Pages** — list with status, last-edited, used-by-nav badges. Click opens edit in a split with live preview.

**Navigation** — visual tree editor with drag-reorder. Not a flat list of links — navigation is inherently hierarchical, the UI should say so.

**Roster** — list with card/row toggle, sticky filter strip. Detail hero with brand + tabs (Overview / Media / Editorial / Settings). Edit with live preview of public profile (same split pattern as composer).

**Inquiries** — kanban by stage OR table with stage filter. Each card: client + talents + days-in-stage. Opening an inquiry opens a side drawer — keeps the admin in the pipeline view. Stage counts always visible at top ("Inquiry 4 → Offer 2 → Booked 1").

**Clients** — standalone for now. Evaluate merging as Inquiries/Contacts tab after Round 1.

**Analytics / Insights** — single page: pipeline, site, roster metrics. Saved views. Translation health lives here (off Home).

**Settings** — grouped: Workspace / Team / Plan / Integrations / Domains / Audit / System / Translations. Consistent layout. Each group is a section of the same page, not a standalone route.

**Audit** — timeline view (not a table). Filter by actor / action / date. Entries link back to the affected surface.

---

## 8. Faster engagement / reaction loop

**Every mutation feels instant, reversible, confirmed.**

- Optimistic state on every save
- Toast on success with "Undo" action for 4s
- Autosave chip in the surface header — "Saved 2s ago" with subtle pulse while saving, green check when saved
- Draft chip (amber) anywhere a draft object appears
- Attention chip (rose) on overdue items

**Stronger primary actions:**
- One primary per view
- Publish button always counts: "Publish 3 changes"
- Section list header: "3 drafts · 9 live · 1 archived"
- Pipeline header: stage counts
- Every list surface has result count + active-filter chips

**Smarter summaries everywhere:**
- Inquiry card: "Ana Hernández · Tulum wedding · 60 guests · 3 talents proposed · waiting 48h"
- Talent card: "Midnight R. · 12 bookings YTD · roster since 2024 · Spanish bio needs update"
- Draft card: "Homepage draft · 3 changes since last publish · (Hero headline, Process reorder, CTA new)"

These are richer than "Inquiry #123 · open." They give the admin what they need to act without clicking.

**Guided flows for first-time surfaces:**
- Home: 3-step "Set up your agency" progress (Identity → Starter site → Invite team). Dismiss on complete.
- Site (empty): Starter recipes as default-open state.
- Roster (empty): "Import your first 5 talents" with template.
- Inquiries (empty): "Create a test inquiry" demo action.

**Return-user features (absent today, critical):**
- Recents: last 5 surfaces edited, in a popover or Home card.
- Pinned: user can pin sections/pages to Home.
- Saved filters: per-list, user-scoped.
- "Resume" card on Home: "Continue editing Hero section (last edited 2h ago)."

**Keyboard-native:**
- Cmd+K everywhere — searches + jumps + actions
- Cmd+Enter to publish on /site
- Cmd+Z / Cmd+Shift+Z undo/redo on composer (exists, expand)
- j/k to move in list views
- / to focus search
- E to edit a selected section
- Esc to close any drawer

**Status feedback as language, not text:**
- Chips (draft / live / attention / archived) consistent across all surfaces
- Pulsing "live" indicator on published surfaces
- Progress bars on multi-step operations (publish, migration)

**Make the product feel alive:**
- Live preview iframe updates as the admin edits (exists; push harder — default-open)
- Real-time inquiry stage changes — if another admin moves an inquiry, yours updates
- Notifications as a popover, not a separate page
- Optimistic-UI + undo-toast everywhere

---

## 9. Reduce, merge, collapse, remove

**Remove from primary nav:**
- Translations → Settings, surfaced via Home chip
- Audit → Settings
- System → Settings
- Content → merge under Site or Pages

**Merge:**
- Identity + Branding → Brand
- All `/admin/site-settings/*` → sub-views of `/admin/site`
- Clients → Contacts tab under Inquiries (pending Round 1 usage signal)
- Media → sub-view under Roster or Site/Content

**Collapse:**
- Translation-health 7-card matrix on Home → one attention chip + full page in Settings
- "Control center" section on current Home → redundant with new primary nav, remove
- Recent activity → cap at 5 + "view all"
- Overview stat cards that duplicate nav items (pending talent count when Roster is in primary) → remove

**Advanced-only (hidden behind disclosure or in Settings → Advanced):**
- Schema migrations
- Domain management (until self-serve)
- RLS debugging / policy inspection
- Full audit log (most ops only need "recent 50")
- Cross-tenant operator tooling

**What's hurting clarity just by being visible:**
- Translation health on Home (implies agencies care about it first — they don't)
- Every settings sub-page as first-class route
- Meta-admin (system, audit) with sidebar parity to daily operations
- Nested sidebar in /admin/site-settings/* (forces "sidebar within sidebar" mental parsing)
- Inconsistent use of card / border / background layers (three levels of muted → visual noise)

**Principle:** if a surface is visited < once per week by the average admin, it does not belong in primary navigation. Everything else goes under Settings or becomes an advanced disclosure.

---

## 10. Proposed redesign phases

**Phase 1 — Before Round 1 (1 week, high visible impact, no IA migration):**

Ship the **shell + Home together**, as one coordinated move. This is the difference from v1. These three surfaces — sidebar, top bar, Home — frame every other screen. Redesigning them in isolation breaks; redesigning them together lets the shell quality immediately show up everywhere.

- **Sidebar chrome:** visual upgrade — typography, spacing, active state, tenant switcher polish. Keep current 13-item nav structure (no route rename), but treat the top 5 items (Home, Inquiries, Roster, Site-Settings, Clients) as visually primary; visually demote the rest.
- **Top bar:** add Cmd+K, notification bell, global publish pill. Breadcrumb always visible.
- **Home:** full rewrite per Section 5. Attention strip → metrics → primary actions → Your site card → recent → operational signals collapsed.
- **Visual system uplift** applied across these three surfaces: card hierarchy (no nesting), button weights, typography scale, muted shade reduction, hover states, status chip language.
- **Cmd+K command palette:** searches talents, inquiries, pages, sections, settings, routes. Jumps to composer.
- **Ship Round 0 trust fixes** (Roster brand fallback, auth-layout wordmark, login copy/typo, CTA-to-builder) — many subsumed into Home.

Rationale: Phase 1 delivers the premium-shell uplift where it matters most (first impression + the junction with the credible builder) without any route renames or migration risk. Round 1 testers see a different product immediately.

**Phase 2 — During / after Round 1 (IA migration, feature-flagged):**

- Collapse `/admin/site-settings/*` into `/admin/site/*` with in-page secondary nav, not nested sidebar. Redirects from old routes for 1–2 weeks.
- Primary nav becomes the 5-item set (Home / Inquiries / Roster / Site / Settings). Rename Talent → Roster.
- Translations / Audit / System → Settings.
- Clients evaluated for merger as Inquiries/Contacts tab based on Round 1 usage signal.
- Apply the new visual system to every remaining surface (Sections list, Pages list, Design tokens, Inquiries, Roster).

**Phase 3 — Post-Round 1 productivity layer:**

- Skeleton loaders everywhere, page-transition crossfade, hover motion parity
- Inline editing on lists (click-to-rename, click-to-restage)
- Multi-step wizards for new inquiry / new talent / new page
- Optimistic UI + undo-toast pattern everywhere
- Presence / collaboration (polish queue #6) if usage signal warrants
- Keyboard shortcut parity across editor surfaces (polish queue #3)
- Attention chips on secondary nav items ("Site (3 drafts)")
- Recents / pinned / saved filters

**Before QA:** Phase 1. Visible quality uplift, no structural risk, no deep-link breakage.
**After QA:** Phases 2 and 3. Route renames during active QA break deep-links; polish is better calibrated to tester feedback.

**Avoiding churn:** every phase is feature-flagged or opt-in where it touches routing. The visual system uplift can go live broadly because it's additive. IA migration in Phase 2 keeps redirects for 1–2 weeks so testers and existing admins don't lose deep-links.

---

## 11. Concrete next move

**Redesign the shell + Home together, as one coordinated Phase 1 delivery.**

This is the sharpened v2 recommendation — v1 said "Home first." That was too narrow. The shell (sidebar + top bar) frames Home; it also frames every other surface. Redesigning Home alone leaves the rest of the product feeling like a different company's software. Doing them together is *not* much more work (they share the visual system), and it delivers the premium feel uniformly on the surfaces a tester sees first.

**The delivery:**

- New Home per Section 5 (attention strip / metrics / primary actions / Your site card / recent / collapsed operational signals)
- New sidebar chrome — visual uplift, tenant switcher polish, primary item emphasis
- New top bar — Cmd+K, notifications, publish pill, breadcrumb
- Global Cmd+K command palette
- Visual system applied to these three surfaces: no card nesting, button weights, typography scale, status chip language, hover states, page-transition motion
- Round 0 trust fixes (Roster fallback, auth wordmark, login copy/typo) folded in

**Scope:** 1 week. Feature-flagged where sensible, but most of it is additive (new shell classes, new Home route body, new top bar, Cmd+K). No route rename. No IA migration yet.

**Why this is the right next move:**
- **Every tester sees it immediately.** The shell is non-skippable.
- **It fixes the builder-shell asymmetry.** Opening the composer now flows from a shell that matches its quality, not one that contrasts with it.
- **It's the highest-leverage decision per hour.** One week of focused work changes every subsequent surface's baseline.
- **It's the prerequisite for Phase 2.** Any IA migration is cleaner when the shell's visual vocabulary is settled.
- **It's the lowest-risk way to land a visible uplift before Round 1.** No deep-link breakage, no data migration, no schema changes.
- **It forces us to decide the visual system now.** Every downstream surface inherits from it. If we punt the visual decisions to Phase 3, the Phase 2 IA migration happens in an inconsistent visual language and we pay twice.

**What it unlocks:**
- Round 1 testers form a "this is a product" first impression, not a "this is an admin panel" one.
- Builder credibility is no longer wasted by a contrasting shell.
- The IA migration in Phase 2 becomes a cleaner execution, not a re-do.
- The visual system becomes a real system, tested on three high-traffic surfaces before being applied broadly.
- Cmd+K becomes available platform-wide on day one — a power-user hook that compounds habit.

---

## Appendix — what this proposal is NOT

- Not a color-palette refresh. The problem is structural and emotional, not cosmetic.
- Not a full rebuild. All proposed changes are incremental on the existing codebase. Home is the only all-new surface, and it reuses existing server reads (overview data, translation health, homepage identity, recent activity).
- Not a multi-month sprint. Phase 1 is one week. Phase 2 is feature-flagged. Phase 3 is opt-in polish calibrated to Round 1.
- Not a proposal to remove features. Everything stays. It moves, it hides behind appropriate disclosure, or it gets surfaced via attention signals instead of being a permanent sidebar item.
- Not a design-first proposal disconnected from engineering. Every recommendation has a clear implementation path on top of what we already have (server components, existing server reads, existing shell classes, existing composer and publish infrastructure).

The ask is to ratify Phase 1 and let me scope the shell + Home as the first implementation task — to deliver before Round 1 opens.
