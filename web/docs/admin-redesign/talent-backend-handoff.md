# Talent surface — backend handoff

> **For: backend / data-layer engineering**
>
> Comprehensive map of the schema additions, queries, mutations, real-time
> hooks, and product decision points needed to take the prototype at
> `/prototypes/admin-shell` into the production talent dashboard.
>
> **Companion docs:**
> - [`talent-roadmap.md`](./talent-roadmap.md) — design + sprint plan, all phases
> - Memory: `project_agency_exclusivity_model.md`, `project_talent_subscriptions.md`, `project_client_trust_badges.md` — binding product specs
>
> **Migration approach (recommended):** port surface by surface behind a
> feature flag. Don't "swipe" — A/B against the existing dashboard, kill
> old surface when parity confirmed. Estimated 3 weeks for one engineer,
> 1.5 weeks with two in parallel.

---

## 1. Schema additions

These tables don't exist yet (or need extension). Naming is suggested;
final naming up to backend.

### 1.1 `talent_distribution_channels` (NEW)

Backs the Reach surface. One row per (talent × channel) live state.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `talent_id` | uuid → `talents` | FK |
| `kind` | enum | `personal · tulala-hub · agency · external · studio` |
| `external_id` | text | For external/studio: the platform-side identifier (Models.com slug, etc.). Null for internal kinds. |
| `name` | text | Display name |
| `url` | text? | Public URL where the talent appears |
| `status` | enum | `live · off · pending · published · invited` |
| `verified` | boolean | Tulala has vetted this partner platform |
| `views_7d` | int | Cache, refreshed nightly from analytics |
| `views_7d_delta` | int | vs prior 7d |
| `inquiries_7d` | int | Cache |
| `inquiries_7d_delta` | int | vs prior 7d |
| `bookings_90d` | int | Cache |
| `earnings_90d` | numeric | Cache, sum of earnings attributed to this channel |
| `earnings_currency` | text | ISO 4217 |
| `description` | text | For hub-detail mini-drawer (terms, fee context) |
| `fee_rate` | numeric | Platform take rate (0 for personal/agency, 0.10-0.20 for marketplaces) |
| `joined_at` | timestamptz | When talent joined this channel |
| `agency_id` | uuid? | When `kind=agency` — links to `agencies` table |
| `created_at` / `updated_at` | timestamptz | Standard |

**Indexes**: `(talent_id, kind)`, `(talent_id, status)` for the Reach card filters.

**Counter cache freshness**: nightly job recomputes `*_7d` and `*_90d` from event logs. Real-time updates can debounce `inquiries_7d` per inquiry-create event.

### 1.2 `talent_manual_earnings` (NEW)

Backs the off-platform booking flow (Log work). Talent's self-reported income from bookings outside Tulala.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `talent_id` | uuid → `talents` | FK |
| `client_name` | text | Free text — these clients aren't Tulala identities |
| `brief` | text? | "Lookbook · spring capsule · 1 day" etc. |
| `work_date` | date | When the gig happened |
| `payout_date` | date? | When money landed (null if not yet paid) |
| `amount` | numeric | |
| `currency` | text | |
| `status` | enum | `paid · invoiced · pending` |
| `payment_method` | enum | `transfer · card · cash · in-kind · mixed` |
| `payment_note` | text? | For in-kind ("Bvlgari watch · est €1,200") or mixed split |
| `team` | text[] | Other talent on the booking (free text or talent_ids if found) |
| `brought_team` | boolean | True when talent acted as de-facto coordinator |
| `location` | text? | |
| `call_time` | text? | |
| `contact` | text? | Producer / photographer / who to message after |
| `delivered` | text[] | Deliverables list |
| `notes` | text? | |
| `created_at` / `updated_at` | timestamptz | |

**Tax / 1099 implication** — DECISION NEEDED: do off-platform earnings count toward Tulala-issued 1099s? Current spec says talent self-reports. If yes, this table feeds tax exports.

### 1.3 `talent_calendar_blocks` (extend existing `availability_blocks`)

Add fields to existing table:

| New column | Type | Notes |
|---|---|---|
| `reason_kind` | enum | `travel · personal · other-job · family · audition · other` |
| `agency_visible_note` | text? | Talent's explanation surfaced to agencies pitching on these dates |
| `source` | enum | `talent · agency · system` (who created the block) |

### 1.4 `agency_talent_relationships` (extend or new)

Per the agency-exclusivity model. May exist as part of agency roster table; verify.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `talent_id` | uuid | |
| `agency_id` | uuid | |
| `is_exclusive` | boolean | **Constraint: only ONE exclusive per talent_id at a time** (server-side check) |
| `commission_rate` | numeric | Per-agency override; defaults to agency.plan_tier_default |
| `joined_at` | timestamptz | |
| `status` | enum | `active · ended · pending-talent-confirmation` |
| `ended_at` | timestamptz? | |
| `wind_down_until` | timestamptz? | 14-day post-end window for active bookings |
| `bookings_ytd` | int | Cache |

**Unique constraint suggestion**: partial index `WHERE is_exclusive = true` on `(talent_id)` to enforce the one-exclusive rule at DB level.

### 1.5 `talent_celebration_events` (NEW, supports Phase C3)

Append-only log of milestones. Drives the celebratory toasts/banners.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `talent_id` | uuid | |
| `kind` | enum | `first_booking_confirmed · first_payout · first_1k_month · 100th_view · 5_star_review · etc.` |
| `triggered_at` | timestamptz | |
| `seen_at` | timestamptz? | When talent dismissed/saw it |
| `payload` | jsonb | Context (amount, client name, etc.) |

### 1.6 `talent_channel_events` (NEW, optional but recommended)

Append-only log for channel toggles + preset changes. Powers undo + telemetry.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `talent_id` | uuid | |
| `event_kind` | enum | `channel_toggle · preset_change · channel_join · channel_leave` |
| `channel_id` | uuid? | When event_kind targets a single channel |
| `from_state` | jsonb | Previous state (for undo) |
| `to_state` | jsonb | New state |
| `at` | timestamptz | |

---

## 2. Per-surface query + mutation map

In sprint order. Each surface = ~half-day to wire reads, ~1 day per drawer mutation.

### 2.1 Today (`TalentTodayPage`)

**Reads** (parallel):
- `talents` row (`MY_TALENT_PROFILE`)
- `talent_bookings` where `status IN ('confirmed','in-progress')` order by `start_date` asc limit 5
- `talent_requests` where `status IN ('needs-answer','accepted')` order by `age_hrs` desc
- `inquiries` joined with `inquiry_offer_line_items` filtered by `line.talent_id = current_talent_id`, return at most 5 in-flight
- `talent_manual_earnings` + `payouts` joined for "recent earnings" — last 3
- `analytics.profile_views_7d` + delta vs prior 7d (one query)

**Mutations**: read-only; clicks open drawers.

**Real-time hooks**:
- Subscribe to `inquiries` and `talent_requests` for the current talent → drives the pending count + hero copy
- Subscribe to `payouts` (filtered to this talent) → updates "Recent earnings"

### 2.2 Inbox (`InboxPage`)

**Reads**:
- All inquiries the talent is on (joined via `line_items` table) — returns ~50 most recent
- All `talent_requests` for the talent
- Project both into `InboxItem` shape on the client (or do server-side projection if perf matters)

**Search**: client-side filter against `client + brief` (good for ≤200 items). For larger sets, server-side full-text search.

**Mutations** (per row drawer actions):
- `accept_offer(offer_id)` → updates `inquiry_offer_line_items.status` + emits notification
- `decline_offer(offer_id, reason?)` → same
- `mark_inquiry_read(inquiry_id)` → updates `inquiry_views.last_read_at`
- `respond_to_inquiry(inquiry_id, message)` → inserts into `inquiry_messages`

**Real-time**: subscribe to all `inquiries` and `talent_requests` for the user → drives counts + new-row insertion.

### 2.3 Reach (`ReachPage`)

**Reads**:
- `talent_distribution_channels` for current talent — all kinds
- `talent_distribution_channels` for `available_to_join` (channels NOT yet joined; comes from a `partner_directory` table)

**Mutations**:
- `toggle_channel(channel_id, on: boolean)` → updates `status` + appends to `talent_channel_events`
- `apply_exposure_preset(preset)` → bulk-updates per the preset rules
- `join_channel(channel_id)` → creates the row if missing, sets `status='live'`
- `pause_channel(channel_id)` → sets `status='paused'` (Phase A8 — needs new enum value)

**Real-time**: subscribe to `talent_distribution_channels` for the user → reflects multi-device toggles.

### 2.4 Calendar (`CalendarPage`)

**Reads**:
- `talent_bookings` (all statuses) for date range
- `talent_requests` (all statuses)
- `inquiries` in coordination/submitted stages
- `availability_blocks` for current month

**Conflict computation**: SHOULD be server-side. Compute on each inquiry/booking create or update; expose `conflicts` view that returns pairs of overlapping events. Real-time subscribe to drive the coral banner.

**Mutations**:
- `block_dates(from, to, reason_kind, agency_visible_note?)` → insert into `availability_blocks`
- `decline_hold(request_id)` → soft-cancels + emits notification
- `request_reschedule(event_id)` → drafts a coordinator message
- `talk_to_coordinator(event_id)` → opens an inbox thread

### 2.5 Activity / Earnings (`ActivityPage`)

Most of this is already in `talent_manual_earnings` + `payouts`. Display work mostly:
- Sum-by-month for the trends panel
- Group-by-client for "top clients" view

**Mutations**: same as Today's manual-add (`talent_manual_earnings.insert`).

### 2.6 Edit profile (`MyProfilePage`)

Sprawling page. ~12 sub-drawers, each is its own mutation:
- `update_profile_basics`, `update_measurements`, `update_specialties`,
  `update_languages`, `update_skills`, `update_limits`, `update_credits`,
  `update_polaroids`, `update_rate_card`, `update_travel_prefs`,
  `update_contact_policy`, `update_emergency_contact`

**Reads**: one query, return the full `MyTalentProfile` shape.

**Image uploads**: photo + polaroids. Use existing Supabase storage; new bucket `talent-photos/{talent_id}/...`. Use presigned upload URLs.

### 2.7 Settings

Mostly point-back to other drawers. Real mutations:
- `update_notification_prefs(prefs: { email, push } per event)`
- `update_privacy(prefs: { search_indexing, sensitive_visibility, etc. })`
- `update_payout_method(stripe_connect_id, ...)` — see Phase D2

---

## 3. Real-time hooks

Recommended Supabase realtime channels:

| Channel | Drives | Filter |
|---|---|---|
| `talent:{id}:inquiries` | Today pending count, Inbox unread badge, hero copy | `talent_id = current` |
| `talent:{id}:requests` | Today pending count, Inbox | `talent_id = current` |
| `talent:{id}:payouts` | Today's Recent earnings strip, Reach earnings counters | `talent_id = current` |
| `talent:{id}:channels` | Reach toggles (multi-device sync) | `talent_id = current` |
| `talent:{id}:conflicts` | Calendar conflict banner | Server-computed view, `talent_id = current` |
| `talent:{id}:notifications` | Notification bell badge + drawer | `talent_id = current` |
| `talent:{id}:celebrations` | Toast on first-booking, first-payout, etc. | `talent_id = current` |

**Notification fan-out**: existing notification system should add talent-side templates for: new offer, hold expiring, booking confirmed, payout landed, conflict detected, milestone reached.

---

## 4. Image uploads

Per F2 in roadmap. Used in:
- Talent profile photo + cover photo
- Polaroids (15 slots)
- Brand logos in closed-booking team list

**Storage**: Supabase storage bucket `talent-photos/`. Path scheme: `{talent_id}/{kind}/{uuid}.{ext}`. Public read for profile/polaroids; signed URLs for sensitive (ID upload for verification — Phase D1).

**Optimization**: client-side resize before upload (max 2400px long edge); generate WebP variants on upload via Supabase storage transformations or a Cloudflare Worker.

---

## 5. Mobile-responsive

Per F1. None of the surfaces are mobile-tested yet.

**Audit plan** (per surface):
- Today: 3-stat strip needs to stack at <768px; Reply now split button collapses to single primary
- Calendar: month grid → list view at <768px; filter chips horizontal scroll
- Reach: distribution cards stack; Exposure preset segmented control wraps to 2x2
- Inbox: row format already mobile-friendly; just needs the search bar + filter chips to wrap
- Edit profile: sub-drawers full-screen at <768px

**Recommended approach**: ship mobile audit alongside G3 surface ports. One sprint per pair of (port + mobile fix).

---

## 6. Loading + error states

Per F3. Recommend:
- Shimmer skeletons per row (use a single `<RowSkeleton>` primitive)
- Error boundary per drawer (so drawer crash doesn't take down the page)
- Optimistic UI for toggles (Reach channels, Availability) — revert on server error with toast

---

## 7. Telemetry

Per F6. The design pass set color frequency budgets that need measurement:
- Coral hits per session (target 0–2)
- Red hits per week (target 0–1 for typical users)
- Forest brand hits per screen (target ≤5)

**Implementation suggestion**: append color-hit events to a lightweight `ui_events` log on render. Aggregate weekly. Alert when any single hue exceeds budget for 25%+ of users — that's a sign the color is diluting.

---

## 8. Strategic bets — design specs (Phase E)

For each, design spec lives below. None implemented in prototype.

### 8.1 AI reply assistant (Phase E1) — HIGHEST LEVERAGE

**Where**: Talent Inbox row hover OR thread detail.

**Flow**:
1. Talent opens an inquiry/offer
2. AI reads inquiry context + talent's prior reply history
3. Suggests 2-3 reply variants ("Quick confirm", "Polite decline", "Ask about call time")
4. Talent picks one → editable in textarea → 1-tap send

**Privacy implications** (DECISION NEEDED): sending inquiry threads to an LLM exposes client communication. Options:
- (a) Opt-in default off, talent toggles per-thread
- (b) Anonymize before sending (client name → "[Client]")
- (c) Run on-device (only with talent's own device — limited model size)
- (d) Use a privacy-preserving model with no client-side training

**Recommendation**: ship (a) opt-in with (b) anonymization at the same time. Pre-launch dialog: "We send the message + brief to our AI assistant for suggestions. Client identity is masked. Toggle off in Settings."

### 8.2 Smart conflict resolution (Phase E2)

**Where**: Calendar conflict banner.

**Flow**:
1. Calendar detects Vogue Italia booking May 14-15 conflicts with Stella McCartney hold May 14
2. Banner shows "Suggestion: ask Stella McCartney for May 16 instead" + "Send" button
3. AI drafts the message based on the offer details + talent's prior coordinator-thread tone
4. Talent reviews, sends

**Schema dependency**: requires server-side conflict detection (per Section 2.4).

### 8.3 Earnings forecasting (Phase E3)

**Where**: Today hero stats + Activity page.

**Algorithm**:
- Take last 90d of confirmed bookings + payouts
- Compute monthly run-rate
- Project current month: confirmed + pending (probability-weighted)
- Show "At your current pace, ~€8,400 in May"

**Refresh**: nightly batch.

### 8.4 Talent-to-talent network (Phase E4)

**Where**: Inquiry workspace, Manual booking entry, Today suggestions.

**Schema additions**:
- `talent_collaborations` — append-only log of who-worked-with-whom
- Powers "Carla Vega is also available May 18-20" suggestions

**Privacy**: collaborations are visible to the talents involved. Sharing across the network requires opt-in.

### 8.5 Voice replies (Phase E5)

**Where**: Inbox reply composer.

**Flow**:
1. Talent taps mic icon
2. Records 10s voice memo
3. Tulala transcribes (Whisper API or similar)
4. Talent reviews transcript → sends as text + attaches audio

**Mobile-only initially**. Desktop adds it later.

### 8.6 Pro tier value visualization (Phase E6)

**Where**: Reach surface.

**Pattern**: every locked-by-tier capability gets a visible "what you'd get" stat. E.g., custom domain row shows "Pro unlocks · €1,200 of inquiries you can't currently route directly" based on actual personal-page traffic that would otherwise route through agencies.

**Schema**: needs `talent_potential_revenue` view that computes per-talent how much they'd unlock by upgrading.

### 8.7 Compare hubs view (Phase E7)

**Where**: Reach → click "Compare" link near the External hubs card.

**Pattern**: side-by-side table — views, inquiries, bookings, avg fee, fee rate per platform. Sortable. Helps talent invest attention.

---

## 9. Decision points needing product/business input

| Q | Blocks | Owner |
|---|---|---|
| Off-platform earnings → 1099? | D3 design + tax exports | Product + accounting |
| Pause-mode semantics on Reach (vs off) | A8 | Product |
| Trust-score impact preview to talent | A10 | Product + trust team |
| Friend referral attribution model (credits / payout share / badge?) | D7 | Product + finance |
| AI reply data privacy default | E1 | Product + legal |
| Calendar week/day view priority | F7 timing | Product |
| Agency exclusivity: switch-window length (currently 14d) | Agency exclusivity model | Product |
| Free→Studio upgrade: do existing referrals retroactively become exclusive? | Agency exclusivity model | Product |
| Per-agency commission override allowed? | Agency exclusivity model | Product + finance |
| In-kind / gift earnings: tax reporting requirement? | D3 | Accounting + legal |

---

## 10. Migration sprint plan (recap from roadmap)

**Sprint 1**: Extract shared primitives (G1) + schema additions (G2) + mobile audit on Today + Calendar (F1 partial)

**Sprint 2**: Today wiring (G3.1) + Calendar wiring (G3.4) + design Inbox redesign

**Sprint 3**: Inbox wiring (G3.2) + Reach wiring (G3.3) + real-time hooks (G4) + mobile audit on Reach + Inbox

**Sprint 4**: Edit profile wiring (G3.6) + Settings wiring (G3.7) + Activity wiring (G3.5)

**End of Sprint 4**: all 7 surfaces wired behind feature flags, A/B for 1-2 weeks, kill old talent dashboard.

**Sprint 5+**: pick from Phase D (missing features) and Phase E (strategic bets) by launch needs.

---

## 11. What's NOT in this doc (intentionally)

- React component implementation details — those are in the prototype source at `/prototypes/admin-shell/`. Read the components; the contracts are visible.
- CSS / styling — use the design tokens (`COLORS`, `FONTS`, `RADIUS`, `SPACE`). Inline styles port to anything (Tailwind, CSS modules, styled-components).
- Per-surface UI specs beyond data shape — see the prototype + the screenshots in this PR's commit history.

---

*Last updated 2026-04-26. Branch: `phase-1`. Companion to `talent-roadmap.md`.*
