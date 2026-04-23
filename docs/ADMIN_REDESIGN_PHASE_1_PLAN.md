# Admin redesign — Phase 1 execution plan

**Status:** Proposed execution plan pending greenlight.
**Date:** 2026-04-22
**Scope anchor:** `docs/ADMIN_REDESIGN_PROPOSAL.md` v2 (direction approved).
**Frame:** Maximum UX lift, minimum destabilization. Ship additively. No route renames. No IA migration. Protect the builder.

---

## 1. The first redesign slice

Three surfaces, touched together, gated behind one feature flag.

**Surfaces:**
1. **Dashboard shell** — sidebar chrome + top bar. Frames every admin page.
2. **Home (`/admin`)** — full rewrite, from status board → operating surface.
3. **Cmd+K command palette** — global, available on every admin page.

**Why these three, why first:**
- The shell is non-skippable. Every tester sees it on every click. Fixing it once fixes perceived quality everywhere.
- Home is the first impression. Today it actively damages trust (translation-health matrix before any operational signal).
- Cmd+K is a single high-leverage power-user hook — flat effort, compounding return.
- Together they're the "frame of the builder." The builder's credibility stops being wasted the moment these three land.

**User pain each solves immediately:**

| Pain today | Fixed by |
| --- | --- |
| "I log in and see translation counters instead of my inquiries" | Home rewrite — attention strip + metrics + primary actions |
| "I can't find the builder" | "Your site" card on Home + sidebar Site-Settings visual promotion + Cmd+K "Open composer" |
| "Publish is buried 3 clicks deep" | Publish pill in top bar whenever drafts exist |
| "13 sidebar items, no priority" | Sidebar chrome refresh — primary 5 visually promoted, meta-admin 8 visually demoted |
| "No keyboard acceleration" | Cmd+K routes/entities/actions |
| "State is hidden behind text labels" | Status chip component (draft/live/attention/archived) reused on Home |
| "First impression says 'admin panel'" | Typography scale, card hierarchy, hover motion, page-transition crossfade |
| "I can't tell what I did last" | Recent activity tightened + Cmd+K recents |

---

## 2. Before-QA vs after-QA boundary

**Before QA (ship now, Phase 1):**
- Shell chrome refresh (visual only, no route change)
- Home rewrite
- Cmd+K palette
- Visual system primitives applied to these three surfaces
- Round 0 trust fixes folded in (auth wordmark, login copy/typo, storefront "Roster" fallback)
- Feature flag `admin_shell_v2` — default on for app.local.dev, default on for Round 1 testers once validated
- Old shell stays behind the flag for 2 weeks so any rollback is a config toggle, not a revert

**After QA (Phase 2, wait for signal):**
- Route rename: `/admin/site-settings/*` → `/admin/site/*` + redirects
- Primary nav reduction 13 → 5 (Home / Inquiries / Roster / Site / Settings)
- Talent → Roster rename
- Translations / Audit / System → Settings
- Clients merge evaluation (Inquiries/Contacts tab) based on Round 1 usage
- Visual system applied to every remaining surface (Sections list, Pages list, Design tokens, Inquiries, Roster, Settings)

**Why this boundary:**
- Everything in Phase 1 is additive. No deep-links break. No existing admin is forced to relearn routes mid-QA.
- Route renames during active tester sessions break shared links and muscle memory. That churn is worse than the IA gain, until we have tester signal confirming the IA direction.
- The visual system we ship in Phase 1 gets validated on three high-traffic surfaces before being applied broadly — we find out if the direction lands before scaling it.
- If Phase 1 tests poorly, Phase 2 gets re-scoped. If Phase 1 lands, Phase 2 is a mechanical extension.

---

## 3. Shell-first execution plan

### Phase 1 — Shell + Home + Cmd+K (before QA)

| Dimension | Detail |
| --- | --- |
| Scope | Dashboard layout shell, `/admin` page, new palette, visual-system primitives |
| User-visible | New top bar (breadcrumb + Cmd+K + notifications + publish pill); new Home; refreshed sidebar chrome; status chips visible on surfaces; Cmd+K everywhere |
| Architectural impact | New shell components, new Home route body, new palette component + keyboard hook. Existing route tree untouched. Existing page bodies untouched except Home. |
| Risk | Low — additive, flag-gated. Main risk: shell refactor accidentally breaks a `/admin/*` layout assumption. Mitigated by keeping old shell under flag for 2 weeks. |
| Dependencies | None external. Uses existing server reads (`loadAdminOverviewData`, `loadAdminTranslationHealth`, homepage identity, recent activity). Reuses existing Tailwind tokens. |
| Why first | Frames every other surface. Unlocks Phase 2 by settling the visual vocabulary. Highest leverage per week. |

### Phase 2 — IA migration (after Round 1 signal)

| Dimension | Detail |
| --- | --- |
| Scope | Route renames, primary nav reduction, translations/audit/system → Settings, Talent → Roster |
| User-visible | New primary nav (5 items). Fewer top-level destinations. New route structure with redirects. |
| Architectural impact | Route renames + redirects. No data model changes. Settings page consolidation. |
| Risk | Medium — deep-link breakage window. Redirects for 2 weeks. Shared links from Round 1 still work. |
| Dependencies | Phase 1 shipped and validated. Round 1 signal indicating the direction lands. |
| Why second | IA work is risky; we only pay that cost if Phase 1 proves the direction resonates. |

### Phase 3 — Productivity layer (post-Round 1 polish)

| Dimension | Detail |
| --- | --- |
| Scope | Skeleton loaders everywhere, page-transition motion parity, inline editing, wizards, optimistic UI + undo-toast, keyboard shortcut parity, recents/pinned/saved filters |
| User-visible | Product feels noticeably faster, mutations feel reversible, power users can move at keyboard speed |
| Architectural impact | Incremental — each polish item is opt-in per surface |
| Risk | Low — all additive, per-surface |
| Dependencies | Phase 1 visual system + Phase 2 IA |
| Why third | Polish is wasted if the IA isn't right. Calibrate to what Round 1 testers actually wanted fast. |

---

## 4. Phase 1 exact deliverables

### 4.1 New primitives — the visual system, scoped to Phase 1 surfaces

- **`<StatusChip state="draft|live|attention|archived">`** — one component, used on Home attention strip, Home "Your site" card, sidebar badges. Amber / emerald / rose / neutral-500. Consistent sizing (22px height, 11px text).
- **`<Card variant="info|action|object">`** — one component, three variants. Removes the `DashboardSectionCard`-wrapping-card pattern on Home. One container per card.
- **`<MetricCard>`** — dense, numeric-forward (32px number, 11px label, optional trend arrow). Used on Home metric strip.
- **Typography classes** — `text-display-*`, `text-title-*`, `text-meta-*`, added to Tailwind config or `dashboard-shell-classes.ts`. Use scale 32 / 24 / 18 / 16 / 14 / 13 / 11.
- **Hover primitives** — `.card-interactive` class: 1px lift, 100ms, subtle shadow shift. Applied to every clickable card on Home.

### 4.2 New top bar — `<AdminTopBar>`

Injected into `(dashboard)/layout.tsx`.

- **Left:** `<Breadcrumb>` derived from pathname ("Site / Structure / Homepage"). Every segment clickable.
- **Middle:** `<CmdKTrigger>` — button-styled search ("Search or jump to… ⌘K"). Opens palette.
- **Right, in order:** `<NotificationBell>` (count derived from attention items — stub if no notification service yet), `<ViewAsVisitorToggle>` (renders only when pathname matches `/admin/site*`), `<UserMenu>` (existing, restyled).
- **Publish pill** — `<PublishPendingPill>` renders when the tenant has pending drafts on the current locale's homepage. Shows "N changes pending — Publish". Links to `/admin/site-settings/structure?publish=1`. Renders on all `/admin/site*` routes.

### 4.3 New Home — `/admin/page.tsx`

Full rewrite. Existing server reads stay; composition changes.

- **Section 1 — Greeting:** `<HomeGreeting>` — "Good morning, {firstName} — {tenantName} is live on {primaryDomain}." Single line, calm.
- **Section 2 — Attention strip:** `<AttentionStrip items={...}>` — amber cards, 0–4 items. Types: `inquiry_overdue`, `drafts_pending`, `talent_pending`, `translation_gaps_blocking`, `revision_needs_attention`. Hidden when empty. Each card has a primary link to the relevant surface.
- **Section 3 — Metric strip:** 4 cards via `<MetricCard>`:
  - Pipeline value ($ this week)
  - Inquiries this week (count, trend vs last week)
  - Talents on roster (count)
  - Drafts pending (site + sections combined)
- **Section 4 — Primary action row:** 4 buttons, equal-weight. New inquiry / Add talent / Edit site / Open public site.
- **Section 5 — "Your site" card:** `<YourSiteCard>` — tenant's site name, published URL, preview thumbnail (from existing homepage render), status chip ("3 drafts" or "Live"), primary button "Open composer".
- **Section 6 — Recent activity:** existing `recentActivity` data, capped at 5, "View all" link.
- **Section 7 — Operational signals:** collapsed `<details>` containing the current translation-health matrix. Default closed. Chevron + count ("7 signals — expand").

### 4.4 Sidebar chrome refresh — no route changes, visual only

- Keep the existing 13 items, same hrefs.
- Visually promote these 5 (larger, clearer, active state): Home (/admin), Inquiries, Talent, Site-Settings, Clients.
- Visually demote these 8 (smaller, dimmer, below a divider): Media, Translations, Analytics, Audit, System, and the rest.
- Add dynamic badges: Inquiries carries "(N)" for unresponded items > 48h, Site-Settings carries "(N drafts)" for pending drafts. Rendered from existing reads.
- Tenant switcher polish: denser, with plan badge + environment (dev/prod).

### 4.5 Cmd+K command palette — new `<CommandPalette>` component

- Keyboard hook: `Cmd+K` / `Ctrl+K` anywhere in `(dashboard)/*`.
- Overlay with typeahead.
- **Indexed commands (Phase 1 minimum):**
  - **Routes:** all admin routes with labels ("Open composer" → /admin/site-settings/structure, "Open Sections" → /admin/site-settings/sections, etc.)
  - **Recent entities:** last 10 edited talents, last 10 inquiries, last 5 pages/sections (from existing server reads)
  - **Actions:** "New inquiry", "Add talent", "Open public site"
- **Out of Phase 1 scope (deferred):** full-text content search, cross-tenant search, multi-step commands (those come in Phase 3).
- Escape closes. Arrow keys navigate. Enter executes.

### 4.6 Round 0 trust fixes folded in

- `web/src/app/(auth)/layout.tsx:21` — wordmark becomes host-aware (platform brand on app host, tenant brand on agency host).
- `web/src/app/(auth)/login/login-form.tsx:67` — typo fix `text-smuted-foreground` → `text-muted-foreground`.
- `web/src/app/(auth)/login/page.tsx:17-20` — soften copy, drop "staff roles are never chosen here" clause.
- `web/src/components/home/agency-home-storefront.tsx:58` — fallback `|| "Roster"` → `|| PLATFORM_BRAND.name`.

### 4.7 Feature flag `admin_shell_v2`

- Default off in production.
- Default on in dev and for Round 1 tester seats.
- Rollback: toggle flag off; old `(dashboard)/layout.tsx` body stays intact behind the flag for 2 weeks.
- Instrumentation: log which shell renders per request, count Cmd+K open events, count primary-action clicks, count "Your site" card clicks.

---

## 5. Success criteria

**Quantitative (instrument before ship):**
- **Builder reach from Home ≤ 2 clicks.** Cmd+K → "Open composer" OR Home → "Your site" card → Open. Both should be present and < 2s to action.
- **Primary action row click-through ≥ 30% of new Round 1 testers.** Track click events on the 4 buttons.
- **Cmd+K discovery ≥ 20% of Round 1 testers.** Track first Cmd+K open event per tester.
- **Publish from any /site page = 1 click.** Publish pill visible, clicked = pre-flight modal.
- **Zero deep-link regressions.** All existing `/admin/*` routes resolve 200 with the new shell.
- **Home load time ≤ current Home + 200ms.** We're reusing server reads; no new queries.
- **Feature flag rollback is < 60s.** Toggle, no deploy, no revert.

**Qualitative (Round 1 debriefs):**
- Testers describe the admin using words like "clear," "modern," "easy," "fast" more often than "beige," "cluttered," "CMS," "admin panel." Use the `QA_FEEDBACK.md` category/severity framework — compare baseline-free vs Round 1.
- Testers can answer, unprompted, within 30s of landing: "What needs your attention right now?" / "How do you get to the site builder?" / "Where do you manage your roster?"
- No tester describes the landing as "a settings dashboard" or "translation gaps page."

**Pass condition for Phase 2:** ≥ 3 of 5 Round 1 testers hit the primary action row + ≥ 2 Cmd+K opens per tester + qualitative debriefs report "clear" / "modern" more than "cluttered." If yes → greenlight Phase 2. If no → re-scope.

---

## 6. Redesign constraints — what we will NOT touch in Phase 1

**Protect the credible builder at all costs:**
- `web/src/app/(dashboard)/admin/site-settings/structure/homepage-composer.tsx` — no changes
- `web/src/app/(dashboard)/admin/site-settings/structure/publish-preflight-modal.tsx` — no changes
- `web/src/app/(dashboard)/admin/site-settings/structure/revision-preview-modal.tsx` — no changes
- `web/src/app/(dashboard)/admin/site-settings/structure/live-preview-panel.tsx` — no changes
- `web/src/app/(dashboard)/admin/site-settings/sections/section-editor.tsx` — no changes
- Section registry — no changes
- Autosave / undo / redo — no changes

**Protect existing route tree:**
- No route rename in Phase 1 (that's Phase 2)
- No redirect added in Phase 1
- `/admin/site-settings/structure` stays as-is — the publish pill links to it unchanged

**Protect existing data model and server layer:**
- No schema changes
- No RLS changes
- No new server queries in Phase 1 — compose existing reads differently on Home
- No new permissions or capabilities

**Protect surfaces that work today:**
- Section editor
- Publish preflight modal
- Revision preview + restore
- Talent edit form (editorial and standard)
- Inquiry pipeline
- Storefront rendering
- Profile public page (including editorial M8 render)

**Explicitly out of scope:**
- Multi-step wizards (Phase 3)
- Inline editing on lists (Phase 3)
- Presence / collaboration (polish queue)
- Skeleton loaders everywhere (Phase 3)
- Motion polish beyond page-transition crossfade on the 3 Phase 1 surfaces (Phase 3)
- Full-text content search inside Cmd+K (Phase 3)
- Navigation tree editor (Phase 2+)
- Design tokens page redesign (Phase 2)
- Inquiries kanban (Phase 2+)

---

## 7. Recommended next move

**Greenlight Phase 1 as scoped above. Start this week.**

**Implementation order (7 working days):**

| Day | Deliverable |
| --- | --- |
| 1 | Visual-system primitives: `<StatusChip>`, `<Card>` (3 variants), `<MetricCard>`, typography classes, hover primitives. Unit-tested in isolation. |
| 2 | `<AdminTopBar>` with breadcrumb + Cmd+K trigger + notification stub + view-as toggle + publish pill. Wired into `(dashboard)/layout.tsx` behind `admin_shell_v2` flag. |
| 3–4 | Home rewrite: `<HomeGreeting>`, `<AttentionStrip>`, metric strip, primary action row, `<YourSiteCard>`, recent activity, operational signals collapsed. |
| 5 | Sidebar chrome refresh: primary/demoted visual distinction, badges, tenant switcher polish. |
| 6 | Cmd+K palette: keyboard hook, command list, route index + recent entities + action commands. |
| 7 | Round 0 trust fixes folded in. Instrumentation events wired. Test pass on every `/admin/*` route with flag on + flag off. Buffer for rework. |

**Deliverable at end of week:** a single branch, `admin-shell-v2`, behind flag, ready for you to preview on app.local.dev. Nothing in production has changed for users without the flag. Nothing about the builder, composer, or publish flow has changed.

**Post-flip validation (days 8–10):**
- You preview the new shell + Home on app.local.dev
- I instrument + verify success-criteria counters
- Flip the flag on for 2–3 internal tenants as a shadow Round 0.5
- If green → flip on for Round 1 tester seats before external QA opens

**Why this is the exact right first move:**
- Additive, flag-gated, zero production risk
- Landed before Round 1 opens — external testers see the uplifted product
- The builder remains untouched and protected
- Exits with a validated visual system ready to extend in Phase 2
- Rollback is a config toggle, not a revert

**Ask:** ratify this plan, confirm the flag name `admin_shell_v2`, and I'll open the branch tomorrow.
