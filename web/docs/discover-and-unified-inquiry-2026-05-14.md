# Tulala Discover + Unified Inquiry — Binding Spec

**Date:** 2026-05-14
**Status:** Binding (charter amendment for Phases 6, 8, B, and parts of A)
**Supersedes / amends:** see §8 — Charter Amendments

---

## 0. Why this document exists

Three threads have been running in parallel: (a) the inquiry-funnel binding (foundation step 0 — converge 5 insert paths through `submitInquiry`), (b) the Messages v2 consolidation (18 slices shipped — thread governance, structured cards, cross-tenant RLS), and (c) the new direction set on 2026-05-14 for **Discover** as the client-side power tool and a **paid client subscription** as a new monetization lane.

If we ship Discover without resolving the cross-tenant routing, the funnel converges to a dead end the moment a client picks talents from two different tenants. If we ship Discover as a free public catalog without thinking through the trust ladder, "never pay to DM" gets quietly violated. If we ship a paid client tier without orthogonalizing it from trust, we end up with two payment surfaces fighting each other.

This doc fuses all three into one coherent system: **client-side surface → unified inquiry lifecycle → fanned settlement → analytics on every side**. No dead ends.

---

## 1. The unified mental model

Discover is the **front door** of every pillar in the [2026 Execution Plan](`~/.claude/.../memory/project_tulala_2026_execution_plan.md`):

| Pillar | How Discover wires it |
|---|---|
| **Thread** (Pillar 1) | Submitted inquiry fans out to N per-tenant threads. Slice N + thread governance from Messages v2 is the foundation. |
| **Money** (Pillar 2) | Two monetization lanes touched: client subscription (new), commission per booking-row (existing). Both flow through Discover. |
| **Trust** (Pillar 3) | Trust badges become a visible card element. Trust gates *contact*, never subscription. |
| **Page** (Pillar 4) | "View profile" from Discover card → `tulala.digital/t/<slug>`. Card pulls from same source as public page. |
| **Network** (Pillar 5) | Agency vs independent ownership is a first-class card badge + filter. Hub is a queryable entity. |
| **Discovery** (Pillar 6) | This *is* Pillar 6. |

The client's mental model is: **find → shortlist → compare → submit one inquiry**. The system's mental model is: **N talents → resolve owning party per row → fan out to N tenants → unified payment → per-row settlement**.

Two models. One surface.

---

## 2. The client-side surface (Discover)

### 2.1 Client persona

Sophisticated client — corporate event planner, brand activation lead, festival booker, agency producer, luxury private event concierge. They scan 20-50 profiles in a session. Their currency is *time*. They need:

- Speed (sub-200ms filter switching)
- Information density (no marketing fluff)
- Compare power (side-by-side talents)
- Trust signals at a glance (badges, agency ownership, recent bookings)
- One inquiry that fans to many talents

### 2.2 Card information hierarchy

Top-to-bottom, 5-second scannability:

1. **Hero photo** (4:5, from the talent-photo three-layer system in `project_talent_surface_launch.md`)
2. **Name + trust badge tier** (Basic / Verified / Silver / Gold) — glanceable color + icon
3. **Category line** — primary + sub (e.g., "Chef · Italian, Mediterranean")
4. **Location + ownership tag** — "Milan · Hub Milan" (agency-locked) or "Berlin · Independent" (no exclusive agency)
5. **Availability strip** — 14-day mini-dot row OR "Next available: May 18 · 8 dates in 30d"
6. **Rate band** — "From €1,200/event" — **gated to Pro subscription**, blurred placeholder for Standard
7. **Quick actions** on hover: ❤︎ Save · ＋ Shortlist · ⤴ Inquire · ⇄ Compare

Hover/expand reveals: response-time SLA, recent bookings count, languages, last-active.

### 2.3 Filter contract + engine API

Filter chips above grid, all multi-select, URL-encoded so combos are shareable:

- **Country** (multi)
- **Region / State** (multi)
- **Hub** (multi — agencies and studios are first-class entities)
- **City** + radius slider
- **Category** (multi, hierarchical)
- **Available between** (date range)
- **Trust tier** (Basic / Verified / Silver / Gold) — minimum tier
- **Rate band** (Pro only)
- **Languages** (multi)
- **Independent / Agency-locked** (toggle)

Performance budget:
- Initial page load: < 2s
- Filter change: < 200ms server, instant UI optimistic
- Geographic drill: < 200ms

Implementation:
- MVP: Postgres materialized view `talent_discover_index` + GIN indexes on tags, BTREE on geo
- Refresh policy: every 15min + on-event (profile change, availability change, agency exclusivity change)
- Scale (post-1k active talents): move to Meilisearch or Algolia

### 2.4 Geographic switching

Map app pattern. Drill-down: **World → Continent → Country → Hub → City**. With a Grid / List / Map toggle.

- Map view: pins clustered by hub. Clicking a hub filters to it.
- List view: dense table, sortable columns (rate, response time, trust tier, distance).
- Grid view: default, cards.

Geographic filter state is part of URL; refresh keeps the user in place.

### 2.5 Shortlist as first-class

The cart from the inquiry-funnel binding becomes a richer object on Discover:

- **Favorites** (❤︎) — personal forever-list, not event-bound. Persists across sessions.
- **Shortlists** (named groups) — "Brand X Gala 2026", "Pirelli Q3", etc. Multi-talent, draft-state. Owned by the client, persistent.
- **Compare view** — side-by-side table of 2-6 selected talents: rate, availability, recent bookings, languages, hub, trust tier, response time. The "decide between three chefs" surface.
- **Send-to-client** (Pro+) — shortlist → shareable link. **Sibling of the [Pitch feature](`~/.claude/.../memory/project_pitch_feature.md`)**: Pitch is admin-curated *for* a client; Send-to-client is client-curated for *their own* client (agency presenting to brand, planner presenting to host).
- **Convert to inquiry** — shortlist → `submitInquiry` with per-row routing (§3).

### 2.6 Keyboard surface

Premium signal. Power users feel respected:

- `/` focus search
- `f` toggle filters
- `j` / `k` walk cards
- `s` save (favorite)
- `i` inquire
- `c` add to compare
- `Esc` clear all filters

### 2.7 What Discover does NOT do

- **No public roster catalog at SEO indexed URL.** This is a logged-in surface. A Standard (free) tier exists for converted-but-unpaid clients; non-clients see a marketing page that prompts signup.
- **No talent-side rankings or leaderboards.** Sort order is filter-relevance + trust tier + plan-priority. No public rating visible (ratings happen post-booking, fold into trust signals).
- **No "buy now" pricing UI.** Rates are *bands* shown to Pro+; firm prices come from the inquiry-offer flow.

---

## 3. The unified inquiry lifecycle (Discover → Money)

### 3.1 Six insert paths (amendment to inquiry-funnel binding)

Original [inquiry-funnel binding](`~/.claude/.../memory/binding_inquiry_funnel_audit.md`) named 5 insert paths, only 2 going through `submitInquiry`. **This spec adds path 6 and reaffirms that foundation step 0 (converge all paths) MUST complete before Discover ships.**

| # | Path | Status |
|---|---|---|
| 1 | Talent public profile inquire-button | existing, converged ✓ |
| 2 | Workspace public roster inquire | existing, converged ✓ |
| 3 | Pitch landing → inquiry | existing, not yet converged |
| 4 | Admin manual inquiry create | existing, not yet converged |
| 5 | Client portal inquiry create | existing, not yet converged |
| **6** | **Discover / Shortlist → inquiry** | **NEW — will use converged `submitInquiry` from day one** |

Paths 3-5 must converge as part of the foundation work that ships *before* path 6 enters the codebase.

### 3.2 Per-row routing at submit

For each talent in the shortlist, `submitInquiry` resolves the **owning party** via existing `is_exclusive_to_agency_id`:

```
For each talent T in shortlist:
  if T.is_exclusive_to_agency_id is not null:
    owning_party = (type: 'agency', id: T.is_exclusive_to_agency_id)
    commission_lane = agency_workspace
    commission_rate = agency.plan_tier_commission_rate
  elif T.owning_tenant_id is not null and T.is_independent = false:
    owning_party = (type: 'workspace', id: T.owning_tenant_id)
    commission_lane = workspace
    commission_rate = workspace.plan_tier_commission_rate
  else:
    owning_party = (type: 'talent', id: T.id)
    commission_lane = platform_only
    commission_rate = 0 to workspace, platform_take_rate to Tulala
```

The result is stored on a new column `inquiry_talents.owning_party_type` + `inquiry_talents.owning_party_id`, frozen at submit time so commission doesn't drift if exclusivity changes mid-flight.

### 3.3 Multi-tenant thread fan-out

For each unique `owning_party` in the resolved set, **one thread is created** in the owning party's Messages v2 inbox, scoped via existing RLS from [Slice N](`web/docs/messages-consolidation-plan-2026-05-13.md`).

The client's Messages view shows **one Chat tab** that fans out to per-tenant sub-threads behind the scenes — they don't see "Hub A's thread" vs "Hub B's thread", they see one timeline of "Hub Milan replied · Hub Berlin replied · Independent talent replied".

Cross-tenant context is enforced by RLS: Hub Milan's coords see only Hub Milan's row. They cannot see Hub Berlin's pricing, internal notes, or thread.

### 3.4 Per-row offer + acceptance gates

Each owning party independently confirms / declines / holds their row. The lineup view (client surface) shows per-row status + a derived top-level summary:

- "2 of 3 confirmed · 1 pending Hub Berlin"
- "All confirmed — ready to issue offer"
- "Hub Berlin declined chef → suggest alternates?"

When an owning party declines, the client gets a prompt to either drop that row or replace with an alternate (re-shortlist).

### 3.5 Per-row commission resolution

[Commission resolver](`web/src/lib/billing/commission.ts`) already runs per booking-line. No new code. The resolver receives the frozen `owning_party_type` + `owning_party_id` from §3.2 and produces the split.

### 3.6 Unified payment, fanned settlement

Client pays one total via Stripe PaymentIntent. The app-fee model (already shipped per Messages v2 Slice J) splits to N Connect accounts:

- Workspace account (for agency-owned rows) — minus their commission
- Talent account (for independent rows) — minus platform fee
- Platform (Tulala) — keeps app-fee on every row

Off-platform cash payments use the balance ledger (already in commission model spec) settled via Stripe Invoice.

### 3.7 Status visibility

Three layers of status, all derived:

- **Per-row pill**: confirmed / pending / declined / hold-expired
- **Top-level summary**: "2/3 confirmed", or "Ready to book"
- **Owner-side per-tenant view**: each owning party sees only their row's lifecycle, with cross-tenant context badge ("Part of mixed inquiry with 2 other workspaces — independent timelines")

---

## 4. Premium client subscription — the new monetization lane

### 4.1 Decision: Free browse + paid power (Option B — confirmed 2026-05-14)

Browsing the catalog is **free** to all authenticated clients. Power tools are **paid**. Reasoning:

- Discover-as-flywheel beats Discover-as-paywall. Clients compare platforms; if they can't see the catalog they leave.
- Friction belongs at the *action* (save, compare, multi-inquiry-send), not at the *look*.
- Composes cleanly with the existing trust ladder.

### 4.2 Three tiers

| Tier | Price (placeholder) | What's included |
|---|---|---|
| **Standard** (free) | $0 | Browse Discover, view profiles, see Basic / Verified talents prominent (Silver/Gold tagged as "premium — upgrade to compare"), submit *single*-talent inquiries, 1 saved shortlist (max 5 talents) |
| **Pro** | $49 / mo (placeholder) | Unlimited shortlists, rate band visibility, compare view, **multi-talent inquiry send**, full 30-day availability calendar per talent, send-to-client shareable shortlists, advanced filters (rate band, language, response-time sort) |
| **Enterprise** | Custom (placeholder $500+/mo) | API access, dedicated rep, bulk RFPs, white-label shortlist sharing (own domain), analytics dashboard (saved-search alerts, market reports), priority support, multi-seat |

Pricing is **placeholder** — see §12 open decisions.

### 4.3 What's gated vs. free

| Capability | Standard | Pro | Enterprise |
|---|---|---|---|
| Browse Discover | ✓ | ✓ | ✓ |
| View talent profile | ✓ | ✓ | ✓ |
| Save favorites (max 20) | ✓ | unlimited | unlimited |
| Named shortlists | 1 (max 5 talents) | unlimited | unlimited |
| Compare view | – | ✓ | ✓ |
| Rate band visibility | – | ✓ | ✓ |
| 30-day availability | 7-day | 30-day | 90-day |
| Single-talent inquiry | ✓ | ✓ | ✓ |
| **Multi-talent inquiry** (fanned) | – | ✓ | ✓ |
| Send-to-client shortlist | – | ✓ | ✓ + white-label |
| API access | – | – | ✓ |
| Saved-search alerts | – | – | ✓ |

### 4.4 Relationship to trust ladder (orthogonal axes)

**This is critical and must be enforced in UI.** Two independent axes:

| | No trust | Verified | Silver | Gold |
|---|---|---|---|---|
| **Standard** | Browse, can shortlist, **cannot inquire** | Browse, can inquire | Browse, can inquire | Browse, can inquire |
| **Pro** | Browse, shortlist, compare, **cannot inquire** | Full | Full | Full |
| **Enterprise** | Same as Pro — subscription doesn't bypass trust | Full | Full | Full |

**Pro subscription gives you TOOLS. Trust tier gives you ACCESS.** A Pro client who hasn't verified or funded their account can shortlist and compare all day — but the moment they hit "Inquire" the trust gate fires and they're walked through verification + funding. This preserves the "never pay to DM" rule from the [trust badges spec](`~/.claude/.../memory/project_client_trust_badges.md`).

Talent contact controls (the per-tier "who can DM me" toggles) remain trust-based, not subscription-based.

---

## 5. Availability — source of truth

### 5.1 Talent-managed calendar (primary signal)

**Already shipped.** `talentCalendarEntries` table loaded in `/web/src/app/(workspace)/[tenantSlug]/talent/layout.tsx`. The Calendar page (`CalendarPage()` in `talent.tsx`) already shows availability blocks. We extend it, we don't build it.

What we add: a "block / unblock dates" UI affordance + a "set recurring unavailable" pattern (e.g., "I never work Sundays").

### 5.2 Holds + bookings (derived)

Inquiry holds and confirmed bookings auto-fill the unavailability calendar on the read side. Already done — no work.

### 5.3 Travel radius

New talent profile field: `home_base_location_id` (already kind of exists per the [location-input memory](`~/.claude/.../memory/project_location_input.md`)) + new `travel_radius_km` (integer, nullable for "willing to travel anywhere"). Surface as filter on Discover: "Available in [city]" returns talents whose home base is within radius.

### 5.4 The denormalized signal on Discover cards

Materialized view `talent_discover_index` includes per-talent computed columns:

- `next_available_date` (DATE)
- `available_days_in_next_30` (INT)
- `availability_dots_14d` (TEXT — encoded 14-char string, one char per day: `.` open, `o` tentative, `x` blocked, `b` booked)

Refreshed nightly + on-event (calendar change, booking change).

### 5.5 Per-row availability check on shortlist

When the client enters event-date(s) on the inquiry, the system flags which shortlisted talents are now unavailable. Visual: card shows red "Unavailable on May 18" pill; client can swap or proceed (some clients want to ask anyway).

---

## 6. Data model changes

### 6.1 New tables

```sql
-- Cross-tenant discoverability flag + metadata per talent
-- (could live as columns on talents/agency_talent_roster — TBD per audit §9)
ALTER TABLE agency_talent_roster ADD COLUMN is_discoverable BOOLEAN DEFAULT false;
ALTER TABLE agency_talent_roster ADD COLUMN discover_enrolled_at TIMESTAMPTZ;
ALTER TABLE agency_talent_roster ADD COLUMN discover_priority_score INT DEFAULT 0;
ALTER TABLE agency_talent_roster ADD COLUMN travel_radius_km INT;

-- Materialized view — fast Discover queries
CREATE MATERIALIZED VIEW talent_discover_index AS
  SELECT
    atr.id AS roster_id,
    atr.talent_id,
    atr.tenant_id,
    -- denormalized name, photo, category, location, hub
    -- trust tier (joined from trust_signals)
    -- is_exclusive_to_agency_id (denormalized owning party)
    -- next_available_date, available_days_in_next_30, availability_dots_14d
    -- rate_band_min, rate_band_max
    -- response_time_avg_hours, recent_bookings_count
    -- languages (jsonb array)
    -- ...
  FROM agency_talent_roster atr
  JOIN ... 
  WHERE atr.is_discoverable = true
    AND atr.workflow_status = 'approved'
    AND atr.visibility = 'public';

CREATE INDEX ON talent_discover_index USING GIN (tags);
CREATE INDEX ON talent_discover_index (country, hub_id, city);
-- etc.

-- Client subscription
CREATE TABLE client_subscriptions (
  id UUID PRIMARY KEY,
  client_user_id UUID REFERENCES users(id),
  tier TEXT CHECK (tier IN ('standard', 'pro', 'enterprise')),
  stripe_subscription_id TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shortlists
CREATE TABLE client_shortlists (
  id UUID PRIMARY KEY,
  client_user_id UUID REFERENCES users(id),
  name TEXT,
  event_date_hint DATE NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE client_shortlist_items (
  shortlist_id UUID REFERENCES client_shortlists(id) ON DELETE CASCADE,
  roster_id UUID, -- references the public roster identity, not a tenant-scoped one
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (shortlist_id, roster_id)
);

CREATE TABLE client_favorites (
  client_user_id UUID REFERENCES users(id),
  roster_id UUID,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (client_user_id, roster_id)
);
```

### 6.2 Modifications to existing tables

- `inquiries`: extend `source` enum to include `'discover'` and `'shortlist'`
- `inquiry_talents` (or whatever the join is): add `owning_party_type` ('agency' | 'workspace' | 'talent'), `owning_party_id` UUID, both set at submit and frozen
- `agency_talent_roster`: see §6.1 — `is_discoverable`, `discover_enrolled_at`, `discover_priority_score`, `travel_radius_km`
- `talents`: add `languages` jsonb if not already there
- `tenants`: add `discover_enrollment_allowed` boolean (Free-plan workspaces can be denied Discover entirely if we decide that — see §12)

### 6.3 Indexes for query speed

- GIN on `talent_discover_index.tags` and `talent_discover_index.languages`
- BTREE on `(country, hub_id, city)`, `(next_available_date)`, `(trust_tier, discover_priority_score DESC)`
- Partial index `WHERE is_discoverable = true AND workflow_status = 'approved'`

---

## 7. Engine API surface

### 7.1 Endpoints

```
GET  /api/discover/talents          ?filters=...&page=...&sort=...
GET  /api/discover/facets           ?filters=... (returns counts per filter value)
GET  /api/discover/talent/:rosterId
GET  /api/discover/talent/:rosterId/availability   ?from=X&to=Y
GET  /api/discover/hubs             (list of agency hubs for filter UI)

POST /api/discover/shortlists                       (create)
GET  /api/discover/shortlists                       (list mine)
GET  /api/discover/shortlists/:id
PATCH /api/discover/shortlists/:id                  (rename, etc.)
POST /api/discover/shortlists/:id/items            (add talent)
DELETE /api/discover/shortlists/:id/items/:rosterId
DELETE /api/discover/shortlists/:id
POST /api/discover/shortlists/:id/share             (Pro+: generate shareable link)
POST /api/discover/shortlists/:id/convert-to-inquiry   (the fan-out)

POST /api/discover/favorites/:rosterId
DELETE /api/discover/favorites/:rosterId

POST /api/discover/compare          (returns side-by-side data for 2-6 talents)

POST /api/discover/subscriptions/checkout   (Stripe Checkout for client tier upgrade)
POST /api/discover/subscriptions/portal     (Stripe portal)
```

### 7.2 Performance budget

- Filter change: < 200ms p95
- Geographic drill: < 200ms p95
- Card fetch (page of 24): < 300ms p95
- Compare: < 400ms p95 (joins more data)
- Initial Discover page load: < 2s LCP

### 7.3 Caching strategy

- Materialized view refresh: every 15min + on-event triggers (calendar change, profile change, exclusivity change)
- HTTP cache 60s on `/api/discover/facets`
- Redis cache 5min TTL on filter combos (key = hash of filters), invalidated on materialized view refresh
- Browser cache 30s on card data via `Cache-Control: private, max-age=30`

---

## 8. Charter amendments — what existing binding docs change

Documenting EXPLICITLY because future agents will read the originals.

### 8.1 [Inquiry funnel binding](`~/.claude/.../memory/binding_inquiry_funnel_audit.md`)

**Amendment:**
- 5 insert paths → **6 paths**. Discover / Shortlist is path 6.
- Foundation step 0 (converge all paths through `submitInquiry`) **MUST complete before Discover ships path 6**.
- `submitInquiry` is updated to perform **per-row owning-party resolution** (§3.2) and freeze the result on `inquiry_talents`.

### 8.2 [Inquiry → Booking improvement plan](`~/.claude/.../memory/project_inquiry_booking_improvement_plan.md`)

**Amendment:**
- Critical breaker list extends. Add:
  - **B11** — per-row owning-party routing missing (blocks multi-tenant fan-out)
  - **B12** — cross-tenant lineup view missing (client surface)
  - **B13** — owning-party context badge missing on admin inquiry inbox (so admins know they're seeing 1-of-N)

### 8.3 [Trust badges spec](`~/.claude/.../memory/project_client_trust_badges.md`)

**Amendment (reaffirmation, not change):**
- "Never pay to DM" rule **explicitly extends to client subscriptions**. Pro/Enterprise are orthogonal — they give tools, not access.
- New surface: trust badge prominently visible on Discover cards (originally listed only inbox / inquiry workspace / profile drawer).

### 8.4 [Talent subscriptions](`~/.claude/.../memory/project_talent_subscriptions.md`)

**Amendment:**
- Pro and Portfolio tiers gain a new benefit: **priority placement on Discover** (higher `discover_priority_score`, default sort lifts them above Basic).
- Basic tier remains discoverable but at standard placement.
- Subscription tier does NOT control whether talent is discoverable at all — that's `is_discoverable` flag, owned by the talent (and gated by workspace admin for non-Free plans, see §10).

### 8.5 [Agency exclusivity model](`~/.claude/.../memory/project_agency_exclusivity_model.md`)

**Amendment (mostly reaffirmation):**
- Exclusive ownership visible on Discover card as a "Hub Milan · exclusive" tag.
- Independent talent visible too, tagged "Independent" (or no tag — TBD UX).
- Hybrid mode: a talent who owns a workspace appears on Discover as **independent** unless they have a separate exclusive agency. Owning a workspace ≠ being agency-locked to that workspace.

### 8.6 [Messages v2](`web/docs/messages-consolidation-plan-2026-05-13.md`)

**Amendment:**
- Cross-tenant thread governance from Slice N is the foundation of Discover-originated inquiries.
- Slice S (search) needs a cross-tenant variant for Pro clients ("search across my conversations with all hubs").
- Client Chat tab fans out to per-tenant threads behind the scenes — UI-level work needed in client surface (`web/src/app/(workspace)/[tenantSlug]/client/`).
- Pitch-origin card (Slice M) gets a sibling: **Discover-origin card** ("This inquiry was sent from Discover · client picked 3 of you").

### 8.7 [Pitch feature](`~/.claude/.../memory/project_pitch_feature.md`)

**Amendment:**
- Pitch is **admin-curated for client**. Client shortlist (Send-to-client) is **client-curated for their own client**.
- They share the public-link mechanism (slug, expiry, optional password) — refactor opportunity to extract a shared `share_link` primitive.
- Both convert to inquiry via the same `convertToInquiry` path — DRY this on the engine side.

### 8.8 [Workspace × Talent hybrid](`~/.claude/.../memory/project_workspace_talent_hybrid.md`)

**Amendment:**
- A talent who simultaneously owns a workspace appears on Discover as **independent** unless they have an exclusive agency (which would have to be a *different* agency from their own workspace, by definition of "one exclusive agency per talent").
- When such a talent receives a Discover-originated inquiry, it routes to their **talent inbox** (not their workspace admin inbox), because they're acting as the talent, not as the workspace owner.

### 8.9 [Pre-launch shipping rules](`~/.claude/.../memory/feedback_pre_launch_shipping.md`)

**Reminder, not amendment:** ship straight to prod; no parallel mockups; one canonical version per surface. Discover is no exception.

---

## 9. Audit — Talent dashboard impact

### 9.1 What exists today

(From audit findings, 2026-05-14)

Surfaces under `/[tenantSlug]/talent/`:
- **Today** — pulse view (offers, holds, bookings)
- **Inbox** — kanban-style inquiry inbox with accept/decline/hold
- **Profile** (`MyProfilePage`) — completeness indicator, section manager, drag-reorder, public preview link
- **Calendar** (`CalendarPage`) — week-view list of bookings + holds + **availability blocks** (date blocking already works)
- **Agencies** — cross-tenant agency roster relationships
- **Public Page** (`PublicPageEditor`) — public profile section order + visibility controls
- **Settings** — subscription tier (Basic/Pro/Portfolio shipped with Stripe wiring) + Payouts page

Public surface: `tulala.digital/t/<profileCode>` already exists.

### 9.2 What needs to change

| # | Change | Surface | Effort |
|---|---|---|---|
| T1 | Add **"Discover enrollment"** toggle | Profile or Settings | Small — new boolean field + UI switch |
| T2 | Add **Discover card preview** ("how my card looks to clients") | Profile | Medium — render the Discover card component with this talent's data |
| T3 | Extend Calendar with **block / unblock UI** + recurring unavailable | Calendar | Small — UI on existing `talentCalendarEntries` model |
| T4 | Add **travel radius** input (home base + km) | Profile | Small — leverage existing location-input + new int field |
| T5 | Add **Discover analytics** widget on Today (impressions, saves, shortlist-adds, inquiries) | Today | Medium — new analytics surface, needs event-tracking pipeline |
| T6 | Show **cross-tenant inquiry source badge** in Inbox when inquiry came from Discover | Inbox | Small — read `inquiries.source` and render badge |
| T7 | Add **Subscription tier-tied Discover benefits** copy in Settings (Pro/Portfolio = priority placement) | Settings → Subscription | Trivial — copy + a "see preview" link |
| T8 | New **"Trust profile"** sub-tab on Profile — verification status, funded-account status (clients see your trust tier on Discover) | Profile | Medium — wires into existing trust signal infra |

### 9.3 What we explicitly do NOT add

- No "Discover earnings leaderboard" — feels gamey, conflicts with the premium positioning
- No per-client profile views ("Acme Corp viewed your profile 3 times") — privacy violation for clients, and pushes us toward LinkedIn-style creepiness
- No public ratings on talent — ratings remain trust-signal inputs, not displayed numerically

---

## 10. Audit — Workspace admin dashboard impact

### 10.1 What exists today

(From audit findings, 2026-05-14)

Surfaces under `/[tenantSlug]/admin/`:
- Overview, Messages, **Roster** (with `visibility` public/hidden default-hidden + `agency_visibility` roster_only), **Bookings**, Calendar, Clients, Operations, Production, Website, Media, Pitches, **Settings**

Plan-tier gating infra shipped: capability catalog, global upgrade modal, plan-tier toggle UI, `loadCommissionContext()` per tenant.

Workflow status on roster: draft → approved → archived.

### 10.2 What needs to change

| # | Change | Surface | Effort |
|---|---|---|---|
| A1 | Add **per-talent Discover toggle** in Roster (bulk-actionable) | Roster | Small — new column + bulk action |
| A2 | Add **Discover Visibility** field to TalentEditForm (admin sets it; talent sees it; gated by workspace plan) | Roster → Edit | Small |
| A3 | Add **Roster Discover analytics column** (impressions, saves, inquiries — last 30d) | Roster | Medium — needs aggregation query |
| A4 | Add **cross-tenant inquiry source badge** in Messages inbox + **"This is 1-of-N — see lineup"** context | Messages | Medium — read `inquiries.source` + `inquiry_talents` count |
| A5 | Add **"Cross-tenant inquiry"** filter chip in Messages inbox | Messages | Small |
| A6 | Extend Bookings page to show **Discover-originated bookings as a filter** | Bookings | Small |
| A7 | Add **Discover plan-tier benefits panel** in Settings (Studio/Agency get bulk enrollment + analytics; Free has limited Discover or none — see §12.4) | Settings | Small |
| A8 | Add **Discover commission preview** in Roster (this talent's expected commission split on a Discover-originated inquiry) | Roster → Edit | Small — call commission resolver in preview mode |
| A9 | Add **"Discover Index"** entry in Operations or new top-level **Discover** section — workspace's overall Discover performance dashboard | Operations / new | Medium |

### 10.3 What does NOT change

- Bookings, Calendar, Clients, Operations, Production, Website, Media, Pitches, Settings core flows are unaffected
- Existing `visibility` (public/hidden) and `agency_visibility` (roster_only) remain — Discover adds an orthogonal axis (`is_discoverable`), it doesn't replace them
- Plan-tier capability catalog absorbs new Discover entries; no new gating system

### 10.4 Plan-tier × Discover matrix

| Workspace plan | Can their talents appear on Discover? | Roster Discover analytics? | Bulk enrollment? |
|---|---|---|---|
| **Free** | Yes (default off, talent opts in), basic placement | Limited (last 7d) | No (per-talent only) |
| **Studio** | Yes (default off, admin can default-enroll) | Yes (last 30d) | Yes |
| **Agency** | Yes + priority placement weighting | Yes (last 90d) | Yes + saved cohorts |
| **Network** | Same as Agency + multi-workspace rollup | Yes (unlimited history) | Yes |

This is **proposal-stage** — see §12.4.

---

## 11. Phased rollout

Slotting into the [2026 Execution Plan](`~/.claude/.../memory/project_tulala_2026_execution_plan.md`) Phases:

| Phase | Slice | Description | Dependencies |
|---|---|---|---|
| **D0** | **Funnel convergence** | Foundation: paths 3, 4, 5 converge through `submitInquiry`. Per-row routing logic + `owning_party_type/id` columns added. | None (existing work) |
| **D1** | **Data layer** | New tables (`client_subscriptions`, `client_shortlists`, `client_favorites`), new columns on `agency_talent_roster`, materialized view `talent_discover_index`. | D0 |
| **D2** | **Engine API (read)** | `/api/discover/talents`, `/api/discover/facets`, `/api/discover/talent/:id`, `/api/discover/talent/:id/availability`, `/api/discover/hubs` | D1 |
| **D3** | **Client surface MVP** | Card grid (Roster-card visual parity), filter chips, geographic drill, list-view toggle. Standard tier. | D2 |
| **D4** | **Shortlists + favorites + compare** | All shortlist/favorite endpoints; compare view; named shortlists. | D3 |
| **D5** | **Submit fan-out** | Path 6 inserted: shortlist → `submitInquiry` with per-row routing. Cross-tenant thread fan-out (extends Messages v2 Slice N). Per-row lineup status. | D0, D4 |
| **D6** | **Premium subscription** | Stripe product + checkout + portal for client tiers. Paywall placements (rate band, compare, multi-inquiry, advanced filters). | D5 |
| **D7** | **Talent-side audit fixes** | T1-T8 from §9.2. | D2 (for preview) |
| **D8** | **Admin-side audit fixes** | A1-A9 from §10.2. | D2, D5 |
| **D9** | **Polish: map view, saved searches, keyboard surface** | Map clustering by hub, saved-search alerts (Enterprise), keyboard shortcuts | D3 |
| **D10** | **Send-to-client shortlist sharing** | Public-link mechanism shared with Pitch (refactor `share_link` primitive) | D4, D6, Pitch feature |

**Critical path:** D0 → D1 → D2 → D3 → D5. Everything else parallelizable.

---

## 12. Ratified product decisions (2026-05-14)

**STATUS:** PO ratified leans on 7 of 8 decisions in session 2026-05-14. Pricing (§12.1) remains TBD before D6 (subscription) can ship. All other slices (D0–D5, D7–D10) are unblocked.

### 12.1 Pricing of client tiers — ⏳ TBD before D6
Standard / Pro / Enterprise — what are the actual prices? Placeholder $0 / $49 / $500+. Market comparison needed (Bookagora, Cameo Pro, Toptal client-side). **Not blocking until D6 (subscription) starts.**

### 12.2 Default discoverable: opt-in or opt-out? — ✅ RATIFIED: opt-in (default off)
- **Opt-in** (default `is_discoverable = false`) → respects talent agency, slower flywheel
- **Opt-out** (default `is_discoverable = true` for approved profiles) → faster flywheel, may surprise talents

**RATIFIED 2026-05-14: opt-in for v1.** Talent self-toggles via "Show me on Tulala Discover" with `recommended` framing in profile editor. Already shipped in commit `cb157db7a` + `ed729362c`. Revisit after we see talent adoption rate.

### 12.3 Availability — required input or optional? — ✅ RATIFIED: optional with derived fallback
- **Required**: forces talents to maintain calendar → richer Discover, but high friction
- **Optional with derived fallback**: talents who don't block dates show "Availability unknown — ask to confirm" on card

**RATIFIED 2026-05-14: optional with derived fallback** for v1. Calendar UI in talent dash gets enhanced (T3 audit fix) but isn't blocking.

### 12.4 Free-plan workspaces — can their talents appear on Discover? — ✅ RATIFIED: yes, throttled
Yes / No / Yes-but-throttled. See matrix in §10.4. Trade: Free workspaces drive volume to flywheel; but if they hog Discover real estate, paying workspaces feel cheated.

**RATIFIED 2026-05-14: yes-but-throttled.** Talents on Free-plan workspaces appear on Discover if they personally opt in (their choice always wins). Workspace plan tier does NOT gate visibility — it only gates *admin-side* tools (no priority placement boost via `feature_in_directory`, no roster Discover analytics, no bulk-enroll for Free workspaces). The talent's `is_discoverable` is sovereign; the workspace's plan only affects what the workspace admin can do on top.

### 12.5 Verification mandatory before talent appears on Discover? — ✅ RATIFIED: tiered
- **Yes**: catalog quality bar
- **No**: faster catalog growth, but unverified talents may signal "low quality"

**RATIFIED 2026-05-14: tiered approach.** No for basic discoverability (unverified talents appear with a "Basic" trust badge — the badge itself signals quality to the client). Yes for premium card features (rate band visibility, priority placement) — those gate on verification + trust tier.

### 12.6 "Recently viewed by client" — surfaced to talent or kept private? — ✅ RATIFIED: aggregate only
- **Surfaced**: useful for talent ("13 clients viewed me this week"); aggregate only, never client identities
- **Private**: respects client privacy fully

**RATIFIED 2026-05-14: aggregate counters surfaced to talent; never per-client attribution.** Per-client view logging would breach client privacy and push us toward LinkedIn-style creepiness — not on-brand.

### 12.7 Hubs as queryable entities — what's a "hub" exactly? — ✅ RATIFIED: workspaces only for v1
- Every Studio/Agency workspace = a hub
- Plus Network plan = a multi-workspace hub
- Do we let talents tag themselves with informal "scenes" (e.g., "Milan electronic music scene") that aren't workspaces? That's a new entity.

**RATIFIED 2026-05-14: v1 = hub is a Studio / Agency / Network workspace only.** Informal scenes ("Milan electronic music scene") deferred until we see demand. Avoids introducing a new entity type prematurely.

### 12.8 Cross-tenant lineup — single timeline or per-tenant tabs? — ✅ RATIFIED: single unified timeline
Client picks 3 talents from 3 tenants. In their inquiry workspace, do they see:
- **One unified timeline** of messages (sorted by time, each tagged with which tenant)
- **Three tabs**, one per tenant

**RATIFIED 2026-05-14: one unified timeline, per-message tenant tag.** Easier mental model for the client. Server-side thread fan-out (Slice N) keeps per-tenant isolation invisible to client UX.

---

## End

This document is the canonical reference. It amends the binding files listed in §8. Future agents touching Discover, the inquiry funnel, client subscriptions, or cross-tenant routing should read this first.

Long-form lives here at `web/docs/discover-and-unified-inquiry-2026-05-14.md`. Short memory pointer at `~/.claude/.../memory/project_discover_unified.md`. Index entry at `MEMORY.md`.
