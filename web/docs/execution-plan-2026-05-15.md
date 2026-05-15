# Tulala Execution Plan — 2026-05-15

Synthesis of remaining work after the 2026-05-14/15 push that shipped D9 (Discover map view), D10 (shortlist sharing), Step 13 auto-ack UI, the D0 cross-tenant owning-party resolver, multi-tier coordinator UI, offer auto-seed, and triage queue.

**Status snapshot (head of `phase-1` at write time):**

- HEAD: `122039f6f` (D10 send-to-client shortlist sharing).
- Prod alias: `tulala-44l1mkxfr-` from earlier today — ~15 commits behind HEAD.
- Active blockers: `CRON_SECRET` missing in Vercel prod, `RESEND_API_KEY` missing, client subscription pricing TBD.
- Healthy: deploy:smoke passing, TS + lint clean, all session commits on `phase-1`.

---

## Phase 0 — Unblockers (today, ~1 hour total)

These have outsize impact-per-minute. Land them before anything else.

| # | Item | Owner | Effort | Notes |
|---|---|---|---|---|
| 0.1 | `npm run deploy:promote` | engineer | 5 min | Ships D9/D10/auto-ack/D0 live. Idempotent — re-aliases both custom domains. |
| 0.2 | `npm run deploy:smoke` | engineer | 2 min | Run after every promote. Catches alias drift, CSP, optimizer, Places key. |
| 0.3 | Provision `CRON_SECRET` in Vercel prod | user | 5 min | `vercel env add CRON_SECRET production <random-32-char-string>` then re-promote. Unblocks 3 cron jobs (cleanup-guest-cart, skill-metrics-refresh, refresh-discover-index). |
| 0.4 | Provision `RESEND_API_KEY` in Vercel prod | user | ~30 min | Sign up at Resend.com, verify a sending domain, `vercel env add RESEND_API_KEY production <key>`. Unblocks all 3 transactional emails on `submitInquiry` (client confirm, coordinator assignment, talent invite). |
| 0.5 | **Pricing decision** for client tiers — Standard / Pro / Enterprise | product | 1 product call | Placeholders are $0 / $49 / $500+. Need market comp (Bookagora / Cameo Pro / Toptal client-side). Hard gate for D6 — code is otherwise ready. |

**Definition of done:** prod aliases on HEAD, all 4 envs provisioned, pricing locked in `project_discover_unified.md` §12.1.

---

## Phase 1 — Big code lifts on unblocked rails (1–2 weeks)

Substantial product features that don't need Phase 0 to land in code, but most benefit from emails actually sending. Order optimized for parallelism + value-per-hour.

### 1.1 — Step 9: Hub cart routing (L, 8–12h)

**Goal:** client builds a cart with talent from multiple agencies on a hub site. At submit, force them to pick one OR split into N inquiries.

**Scope:**
- Hub-site `/hub/<slug>` surface or extend `/directory` with cart-aware UI.
- `saved_talent.in_cart` already exists (Step 5 shipped); use it.
- New cart-summary UI showing per-agency tally + "Split into N inquiries" CTA.
- Server-side fan-out via `submitInquiry` per agency (D0 already routes per-row).
- New admin triage queue badge: "Mixed-cart split" so workspace admin knows their inquiry was 1-of-N.
- Edge case: talent on multiple active rosters — pick primary, fall back to first active.

**Depends on:** Phase 0.1 (so the D0 resolver is actually live).

**Risk:** the agency-pick UX is novel — needs design pass before code starts.

**Model:** Opus, single session.

---

### 1.2 — Step 15: i18n form copy (M, 4–6h, mechanical)

**Goal:** Spanish-locale clients see Spanish in the inquiry funnel. Currently `InquiryCartForm` has ~40 hardcoded English strings.

**Scope:**
- Audit `<InquiryCartForm>` + sibling form components for hardcoded copy.
- Move to `messages/en.json` + `messages/es.json` keys under `public.forms.inquiry.*`.
- Wire `useTranslations()` / `createTranslator()` per component.
- Validate every key has a Spanish translation; flag untranslated for product.

**Depends on:** nothing.

**Model:** Sonnet, single session. Fully parallelizable with 1.1.

---

### 1.3 — D9 polish (S 1–2h each)

Three small slices independent of each other; pick any combination.

| Slice | Effort | Notes |
|---|---|---|
| Map clustering at country level when zoomed out | S 1-2h | Use `@vis.gl/react-google-maps` `<MarkerClusterer>` or render country-roll-up markers via the existing `country_id` join. |
| Keyboard shortcuts (`/` search, `?` help, `g d` discover) | S 1-2h | One global keydown listener on the client shell. Add `/help` overlay. |
| Saved searches | M 3-4h | Needs new `client_saved_searches` table. Two endpoints (save/list). UI: "Save this search" chip in DiscoverShell filter bar. |

**Depends on:** 0.1 for map to load on prod.

**Model:** Haiku for cluster + shortcuts; Sonnet for saved searches (schema work).

---

### 1.4 — Auto-ack i18n + per-locale templates (S 1–2h)

**Goal:** auto-ack message respects client locale. Currently fixed English ("Thanks — we'll get back…").

**Scope:**
- `agencies` table gets `auto_ack_message_es text` column (en stays canonical).
- `submitInquiry` reads the column matching `inquirer's locale` (`headers().get('accept-language')` fallback to en).
- `/admin/policy/auto-ack` page gets a Spanish textarea below English.

**Depends on:** 0.1, 0.4 (so real auto-ack messages actually post).

**Model:** Sonnet.

---

## Phase 2 — Mega-shell extraction (1–2 weeks, surgery)

This is the multiplier. ~11 audit-gap items currently mega-blocked because they live in `pages.tsx` / `state.tsx` / `drawers.tsx` / `messages.tsx`. Extracting these to focused server components unlocks all of them.

**Why now:** the prototype SPA shell pattern (one big React tree swapping panes by state) was right for the prototype but is now actively blocking parallel agent work and audit-gap surgical changes. Every commit on these files is a multi-agent collision risk.

**Strategy:** route-driven extraction, slice-by-slice, behind the existing `CANONICAL_ROUTE_MATCHERS` escape hatch in `admin-shell-client.tsx`. Each slice flips one route from "shell SPA renders" to "Next.js page renders". `discover-inquiries`, `triage`, `work/[id]`, and `policy/auto-ack` already work this way.

### 2.1 — Extract Admin Messages (XL, ~2 days)

The mega of megas. ~14,448 LOC across `messages.tsx` + state slices.

**Sub-slices:**
1. Move inbox list to `/admin/messages/page.tsx` (server-rendered list, uses existing `loadInquiriesForMessages` bridge).
2. Move thread detail to `/admin/messages/[inquiryId]/page.tsx`.
3. Wire `ReservationThread` adapter (already exists for client side).
4. Move composer + structured-card emit logic to focused server actions.
5. Add to `CANONICAL_ROUTE_MATCHERS`.
6. Delete the shell's old inbox panes.

**Unlocks:** A4 (cross-tenant source badge), A5 (filter chip), plus removes the source pill mega-blocker noted in the binding spec memory.

---

### 2.2 — Extract Roster (XL, ~1.5 days)

`drawers.tsx` + roster slices in `pages.tsx`.

**Sub-slices:**
1. List view to `/admin/roster/page.tsx` (real server component, paginated).
2. Edit drawer becomes a stacked route `/admin/roster/[id]/page.tsx` (already exists per `roster/[id]/page.tsx`).
3. The mega "EditorSections" + identity panels split into focused subcomponents.

**Unlocks:** A1 (already done — toggle is wired), A2 (already done — visibility field), A3 (analytics column), A8 (commission preview).

---

### 2.3 — Extract Settings (L, ~1 day)

`pages.tsx` settings + `state.tsx` settings model.

**Sub-slices:**
1. `/admin/settings/page.tsx` becomes a real page (currently a 7-line stub).
2. Each settings section is its own route under `/admin/settings/<section>/` — Workspace, Plan, Billing, Team, Policy, Tax, etc.
3. The auto-ack policy I shipped at `/admin/policy/auto-ack` folds in as `/admin/settings/policy/auto-ack`.

**Unlocks:** A7 (Discover plan-tier benefits panel).

---

### 2.4 — Extract Talent Profile (M, ~1 day)

Routed through `pages.tsx`. Talent's own profile editor.

**Sub-slices:**
1. `/talent/profile/page.tsx` becomes real (currently 7-line stub).
2. Editor sections split similarly to Roster edit.
3. Talent surfaces (Today, Calendar, Agencies, Public Page) follow the same pattern.

**Unlocks:** T2 (Discover card preview), T3 (Calendar block/unblock UI), T4 (travel radius input), T5 (Today analytics widget), T8 (Trust profile sub-tab).

**Risk:** the prototype talent shell has hybrid-mode logic (talent + workspace toggle); extraction must preserve it.

---

## Phase 3 — Audit gaps cascading from Phase 2 (1 week, parallelizable)

Once Phase 2 ships, these become small (S) instead of mega. Can run in parallel across multiple agents.

| Code | Item | Effort post-extraction |
|---|---|---|
| A3 | Roster Discover analytics column | M (new aggregation query) |
| A4 | Admin Messages source badge + "1-of-N" lineup context | S |
| A5 | Admin Messages cross-tenant filter chip | S |
| A7 | Discover plan-tier benefits panel in Settings | S |
| A8 | Commission preview in roster edit | S |
| A9 | Discover performance dashboard (Operations) | M |
| T2 | "How my Discover card looks" preview on talent Profile | M |
| T3 | Calendar block/unblock UI + recurring unavailable | S |
| T4 | Travel radius input on talent Profile | S |
| T5 | Discover analytics widget on Today | M |
| T8 | Trust profile sub-tab | M |

**Definition of done per gap:** the binding spec memory `project_discover_unified.md` "Audit gap shipping log" gets a ✅ line with the commit hash.

---

## Phase 4 — Monetization (depends on Phase 0.5 pricing decision)

### 4.1 — D6: Stripe client subscription wiring (M, 4–6h)

**Goal:** clients can subscribe to Standard / Pro / Enterprise.

**Scope:**
- Stripe Products + Prices created in Dashboard (lives outside this repo).
- `client_subscriptions` table already exists.
- Server actions `startClientUpgrade(plan, tenantSlug)` + `openClientSubscriptionPortal(tenantSlug)` (mirror talent equivalents).
- Stripe webhook handler at `/api/stripe/webhook` already accepts `customer.subscription.*` events for talent — extend to client subscriptions.
- Settings page section: "Discover plan" with current tier + upgrade CTAs.
- Paywall placements: rate band, compare view, multi-talent inquiry, advanced filters (per binding spec §3).

**Blockers:**
- Phase 0.5 (pricing decided)
- Stripe Dashboard config (`pending_stripe_live_money_testing.md` — deferred until product ready per user)

**Model:** Opus.

---

### 4.2 — Trust × Plan orthogonality QA (S, 1-2h)

**Goal:** prove the "never pay to DM" rule survives D6. Pro client without verification CAN'T bypass talent contact controls.

**Scope:**
- Manual QA matrix: 4 trust tiers × 3 plan tiers = 12 cases.
- Document in `web/docs/qa-evidence/2026-05-DD/d6-trust-plan-matrix.md`.
- Fix any cases where Pro gates over-ride trust gates.

---

## Phase 5 — Pre-launch hardening (1 week, parallel with Phase 3/4)

Continuous; not a discrete phase. Items to track:

| Item | Cadence |
|---|---|
| `npm run deploy:smoke` after every promote | per-promote |
| Real-data QA matrix walk (5 roles × 4 viewports) | weekly |
| Spanish locale walkthrough by native speaker | one-time before launch |
| Image-optimizer cache hit-rate audit (Vercel billing) | weekly |
| Supabase free-tier limits — bandwidth, MAU, DB size | weekly |
| Stripe Connect platform profile filled out | once when D6 ships |
| `agency_domains` seeding contract documented for new tenants | one-time |
| RLS regression test suite (`web/scripts/qa-check-rls-migration.mjs`) on every migration | per-migration |

---

## Sequencing rationale

1. **Phase 0 first because the cost is minutes, the value compounds.** Every hour we delay the promote is an hour where 15 commits of work aren't earning anything. Every hour we delay `CRON_SECRET` is more `talent_discover_index` staleness.

2. **Phase 1 and Phase 2 run in parallel**, on separate branches if multiple agents. Phase 1 is shippable in small slices (1-3 days each); Phase 2 is one extraction per session.

3. **Phase 3 waits on Phase 2** by design — that's the leverage point. Trying to chip at A3/A4/A8 etc. on the mega shell directly is what we've been doing; it works but is slow.

4. **Phase 4 waits on Phase 0.5** (pricing).

5. **Phase 5 is continuous.**

---

## Open decisions (need product input)

- **0.5 pricing** (above)
- **D10 expansion** — does the shortlist share link allow inline inquiry creation, or always deep-link to /t/? Currently chose deep-link (simpler). Confirm before adding inquiry CTA.
- **Hub cart split-cart UX** — when client has 5 talents across 3 agencies, do we split into 3 inquiries silently or ask them to pick one agency? Spec leans on "force them to pick OR split". Need a wireframe before 1.1.
- **Mega-shell extraction velocity** — full extraction in one push (~5 days focused work) vs. slice-per-week with parallel feature work? Trade speed vs. risk.

---

## What I'd ship next if you said "go"

**Recommendation:** Phase 0 (15 min total) → Phase 1.2 (Step 15 i18n, 4–6h, fully unblocked, low risk) in parallel with Phase 2.1 sub-slice 1 (move admin Messages inbox list to a real page — 2–3h, contained, biggest leverage). If those land cleanly, follow with Phase 1.1 (Step 9 hub cart) since it's the headline product gap.

Reach back when you've made the pricing call and I'll wire D6.
