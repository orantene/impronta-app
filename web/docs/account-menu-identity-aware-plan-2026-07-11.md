# Identity-aware account menu — product plan (2026-07-11)

**Status: PLAN ONLY. Nothing in this doc is built. Do not execute without explicit go-ahead.**

Owner-hat: tulala.digital product. Scope: the signed-in account dropdown on the marketing
apex (`tulala.digital`), all marketing pages, and the platform-chrome talent page. Shipped
baseline today (PR #801): workspace list with role labels + "New workspace" + "Sign out".
Talent identity is invisible in that menu. `orantenemx` (talent on Impronta) sees only
"Dashboard / New workspace / Sign out" — none of it talent-relevant.

---

## 1. The core insight

The account menu is the platform's **identity switchboard**. A user opens it to answer one
question: *"where are my things, and how do I get to them in one click?"*

"My things" differs by who you are:

| Identity shape | "My things" |
|---|---|
| **Workspace-only** (owner/admin/staff) | My workspaces → their dashboards |
| **Talent-only** | My public pages (per tenant + own site), my talent dashboard, my visibility |
| **Hybrid** (talent + workspace roles) | Both of the above, without clutter |
| **Client-only** | My inquiries/messages, saved talent (lineup) |

We already detect all four server-side. The menu must render a different composition per
shape — not one generic menu with everything bolted on.

## 2. Data — everything already exists (no new tables, no migrations)

| Need | Existing source |
|---|---|
| Workspace memberships + roles | `resolveActorIdentity()` → `workspaces[{tenantSlug, tenantName, role}]` (`lib/identity/hybrid-mode.ts`) |
| Is user a talent | same call → `talent { profileId, displayName }` |
| Talent's per-tenant pages, with visibility + status + plan | `loadRepresentation(talentProfileId, profileCode)` → `entries[{kind: self_page \| agency \| hub, name, url, visibility, status, isPrimary, planTier}]` + `globalHidden` (`lib/talent/load-representation.ts`) |
| Public page URLs | `agencyRosterProfileUrl(slug, code, isHub)` / `platformSelfProfileUrl(code)` — already builds absolute `/t/[code]` URLs per host |
| Visibility semantics | `resolveEffectiveVisibility` (`lib/talent/representation.ts`): `site_visible` / `featured` / `roster_only`, plus `is_publicly_hidden` kill-switch |
| Talent subscription tier (Basic/Pro/Portfolio a.k.a. Max) | talent subscription fields already read by Max-site + monetization surfaces; Portfolio = own site/domain |
| Client identity | `profile.app_role === 'client'` from `getCachedActorSession()` |

One new server helper composes these into a single `AccountMenuModel` (mirrors
`loadMarketingWorkspaceLinks` shipped in #801). Cost: 1-2 extra reads on marketing shell
render for signed-in users only; cacheable per request via `react.cache`.

## 3. Proposed IA — one menu, up to two tabs

### 3.1 The tab rule (only show what exists)

- Hybrid user → **two tabs: "Workspaces" | "My pages"** (segmented control inside the
  dropdown header, exactly the EN|ES pill language we already use).
- Workspace-only → no tabs, workspaces list only (today's menu, unchanged).
- Talent-only → no tabs, talent composition only.
- Client-only → no tabs, client quick links.
- Default tab for hybrids: whichever side was used last (cookie), else Workspaces.

Tabs beat one long list: a hybrid with 6 workspaces + 3 talent pages is 9+ rows — scanning
dies. Tabs also give each side room for its own quick-links row.

### 3.2 Identity header (all shapes)

```
[profile icon]  Display Name          ← click → account/profile settings
                email@example.com
```

- Header block becomes a **link**: talent → `/talent/profile` (their editor); workspace-only
  → active workspace account settings; client → client account. (User asked: clicking
  name/photo goes to account/profile. Yes.)
- Avatar: real photo if talent has one, else person icon (per approved placeholder design).

### 3.3 Talent composition ("My pages" tab, or whole menu when talent-only)

```
MY PAGES
● Own site            tulala.digital/your-roster   [MAX]  [Live ●]
● Impronta Models     /t/abc on impronta host             [Live ●]
● Tulala Hub          hub listing                          [Hidden 👁]
─────────────────────────────
▸ Talent dashboard
▸ Edit my profile
▸ My bookings        (calendar)
▸ Messages           (unread badge later)
─────────────────────────────
+ Open a workspace          ← replaces "New workspace" wording for talent
Sign out
```

Row anatomy (per representation entry, straight from `loadRepresentation`):
- **Name** = tenant display name; `self_page` entry pinned first, labeled "Own site".
- **Badge (plan)**: `MAX` (Portfolio) / `PRO` on the self_page row only. Small uppercase
  chip, same style as role labels in the shipped workspace switcher.
- **Status (visibility)**: right-aligned. `Live` (green dot) when effectively visible;
  `Hidden` (eye-off icon) when `roster_only`, talent-hidden on that site, or
  `globalHidden`. `Featured` gets a star instead of the dot. Pending roster status →
  `Pending` in muted text, row not clickable.
- **Click** → opens the public page URL (new tab), exactly what the user asked: "clicking
  on them take him to see his profile page".
- If `globalHidden` is on, show a one-line notice at the top of the tab: "Your profile is
  hidden everywhere" + link to visibility settings. Individual rows then all read Hidden;
  the notice explains why (avoids "why is everything hidden" confusion).

Quick links (the 4 above) are the talent's daily loop: dashboard, edit profile, bookings,
messages. All routes exist today under `/talent/*` on the app host.

### 3.4 Workspace composition ("Workspaces" tab) — shipped #801, plus one addition

Keep: per-tenant rows with role chip → `/{slug}/admin`. Add one right-aligned affordance
per row (phase 2, optional): an "open storefront" glyph that links to the tenant's public
site — owners constantly bounce between admin and public site.

"New workspace" stays on this tab (it is a workspace action; talent-only users get
"Open a workspace" as an on-ramp instead — same target `/get-started`, different framing).

### 3.5 Client-only composition (smallest, phase 3)

```
▸ My inquiries / messages
▸ Saved talent (lineup)
▸ Account settings
Sign out
```
Never "cart", never "buyer" (binding language rule). Client-only users are the majority of
future signups; giving them a real menu prevents the "Dashboard → generic redirect" dead feel.

### 3.6 Support icon (from the approved placeholder)

Separate control, not inside the account menu (approved design). Phase 3; ships only with
real destinations (no dead CTAs rule): Help center → existing `/help/[role]`, Contact →
`mailto:hello@tulala.digital`, Docs + Status → only if/when real URLs exist.

## 4. What I am NOT proposing (and why)

- **No hybrid Talent⇄Client toggle** — binding rule: client is client, one-way.
- **No inline visibility toggling from the menu** (the eye is a *status*, not a switch).
  Flipping site visibility is a consequential publish action; it belongs in the talent
  dashboard with confirmation, not a hover-click in a dropdown. The eye links there.
- **No notification counts in v1** — needs an unread-aggregation query per tenant; defer.
- **No workspace switching context writes** — rows are plain links; no session mutation.

## 5. Visual system (continuity with what's shipped/approved)

- Same pill/hairline/hover language as the shipped switcher + approved support placeholder
  (34px controls, 10px radius, role/status chips in muted uppercase 10.5px).
- Tab segmented control reuses the EN|ES visual (active = forest bg, inactive = muted).
- Status colors: Live = existing success green token; Hidden = muted gray + `ti-eye-off`;
  Featured = existing gold-free accent (no gold — admin aesthetics rule); Pending = muted.
- Mobile sheet mirrors desktop: tabs become two stacked labeled sections (no horizontal
  tabs in the sheet; scanning a sheet is vertical anyway).
- ES localization from day one: all new strings through the marketing copy module
  (`copy.nav.*`), both locales in the same PR.

## 6. Build waves (each independently shippable, prod-verified per house rules)

| Wave | Scope | Size |
|---|---|---|
| **W1** | `loadAccountMenuModel()` server helper (compose identity + representation + workspaces) + talent-only menu composition + hybrid tabs. Desktop + mobile. ES strings. | M |
| **W2** | Status/visibility right-rail on talent rows (Live/Hidden/Featured/Pending + globalHidden notice) + plan badge (MAX/PRO) + storefront glyph on workspace rows. | S |
| **W3** | Client-only composition + support icon with real destinations + last-used-tab memory. | S |
| QA | Each wave: live-host verification with 3 real accounts — orantene (hybrid, 6 workspaces), orantenemx (talent-only on Impronta), a QA client. Cookie/host checks on apex + app host, both locales, mobile sheet. | — |

Risk: low. Read-only composition of existing loaders; no schema, no auth-path changes.
Main perf note: `loadRepresentation` uses the service-role client — keep it behind the
"user is talent" check so workspace-only/client users pay zero extra reads.

## 7. Open questions for Oran

1. Hybrid default tab: last-used (proposed) or always Workspaces?
2. Should the self_page row appear for Basic-tier talent as an upsell ("Own site — locked,
   upgrade") or only exist once Pro/Portfolio? (I lean upsell row with lock — it sells Max
   exactly where the desire occurs, and it is honest, not a dead CTA: it links to pricing.)
3. Row click for talent pages: public page in new tab (proposed) vs same tab?
4. Do we want "My bookings"/"Messages" quick links in W1 or keep W1 to pages+dashboard?
