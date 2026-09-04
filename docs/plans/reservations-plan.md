# Reservations — area plan

Owner: Reservations Manager · Reports to: Platform Features Director
Source architecture: "Sell the Room" §04, §05, §05b, §05d, §05f, §08, §10 (Phase 3)
Mockups: `HostStand`, `ReserveFlow`, `SettingsReservations`, `SeatingTab`, `Receipt`.
Designs sent to the Director: https://claude.ai/code/artifact/c66ffdd6-0ed1-4071-8830-15670f845137

**Revision 4, 2026-09-03. C6 is CLOSED and will not be reopened by me.** Three sessions changed position
on it in one afternoon, twice in opposite directions, on crossing messages. C6 now settles it on a rule
that does not depend on anyone's estimate of a cost. **A service window is not a session**; it is a rule
plus a small exceptions table, entirely inside this area, and it needs no change to any table another
manager has shipped. Migration band `20261229000380` to `…000399` granted. **R1 to R3 have a go.**

Every fact below was re-verified against `origin/main` myself, not taken from the messages that
reported it.

---

## 0. Where the brief and the code disagree

### C1 — `client_stripe_customers` cannot hold a card on file for a table. Two independent reasons.

§05 says "a SetupIntent against the client Stripe customer that already exists". That object cannot do it.

1. **Keyed by an auth user.** `user_id UUID PRIMARY KEY REFERENCES auth.users(id)`
   ([`20260901180000_trust_economics.sql:25`](../../supabase/migrations/20260901180000_trust_economics.sql#L25)).
   A guest who gives only an email has no `auth.users` row, and Orders 0.4 deliberately **stops
   provisioning them**. The no-show moat is for exactly that guest.
2. **On the wrong Stripe account.** The platform uses **Direct Charges on the connected account** —
   `stripe.checkout.sessions.create(params, { stripeAccount })`
   ([`stripe-checkout.ts:136-147`](../../web/src/lib/payments/stripe-checkout.ts#L136)) — and
   [`20260907150100:36-42`](../../supabase/migrations/20260907150100_stripe_connect_accounts.sql#L36)
   states the connected account carries chargebacks. A PaymentMethod on the platform account cannot be
   charged on a connected one.

Fix: `customer_payment_methods`, tenant-scoped, storing the account it was saved on (§1.3).

### C2 — D2 is mostly already answered by that charge model

Direct charges put a forfeiture in the restaurant's balance the moment it settles; the platform cannot
"keep" it without a transfer nothing builds. The only live question is `application_fee_amount` on a
penalty charge, which **defaults to 0 today**. Recommendation: **tenant keeps it; fee 0 on a no-show or
forfeiture; normal fee on a deposit applied to the bill.** A penalty is not a sale, a cut of one reads
badly to both sides, and penalty charges are the most chargeback-prone money on the platform.

### C3 — the weekly-hours shape provably cannot express a window crossing midnight

[`hours-types.ts:65-68`](../../web/src/lib/scheduling/hours-types.ts#L65) rejects `endMin > 1440` and
`endMin <= startMin`. A 23:00 to 05:00 club service is unrepresentable. I therefore store a window as a
**wall clock plus a duration**, never as a pair of minutes inside a civil day (§1.1).

### C4 — the marketing page promises a floor plan the first release does not have

[`feature-tables.ts`](../../web/src/lib/marketing/features/feature-tables.ts) leads with "Your floor plan
online", makes "Floor plan and table configuration" the **first** highlight, and explains the product as
"appointments with a floor plan on top". Band mode has no floor plan; assigned mode and the layout editor
come later. The sentiment is right and the mechanism is wrong: what is shared with appointments is the
**policy** layer (deposits, reminders, inbox, calendar), not the booking engine, which picks one subject
of capacity one per offering. Wording in §8; I do not own that file.

### C5 — `agency_memberships.role` is TEXT + CHECK, and its capability model is strictly hierarchical

Role values are a CHECK, not an enum
([`20260601100100:19-20`](../../supabase/migrations/20260601100100_saas_p1_agency_memberships.sql#L19)),
so `host` needs no `ALTER TYPE` file. But
[`capabilities.ts:19`](../../web/src/lib/saas/capabilities.ts#L19) documents "lower roles are strict
subsets of higher roles", and `host` — and Events' `door` — are **lateral**. §5.

### C6 — a service window is not a session. Closed, with the argument that ends it.

This question was argued four times in one afternoon by three sessions, twice in opposite directions, on
messages that crossed. Revision 1 made a window a `sessions` row. Revision 2 withdrew it. Revision 3
restored it on per-date variation. The Director ruled both ways and retracted the first ruling. **The
record matters more than any one of those positions**, so here is why it kept moving and what stops it.

**Why it oscillated: everyone, me included, was weighing two costs against each other.** Row count against
machinery. That comparison has no fixed answer, so each of us re-weighted it and got a different result.
A question settled by weighing is a question that reopens.

**The rule that settles it does not weigh anything.** `sessions` has a defined meaning, written in its own
schema comment at [`20261229000214`](../../supabase/migrations/20261229000214_sessions_and_series.sql):
*"One occurrence. The only bookable thing, and the subject of session_tier capacity pools."*

A service window is **neither**. Nobody books a service window — they book a table inside one. It is not
the subject of a pool; the band is, and the allocation is a turn floating inside the window rather than
the window itself. Putting a window in that table makes the table's own comment false, and every future
reader has to learn that some rows are products and some are containers. That is the cost that does not
show up in a row count, and it is the one that lasts.

**My Revision 3 argument was wrong in a specific, checkable way.** I said per-date variation forces
materialisation, because an exceptions mechanism is a materialised occurrence with extra steps. Per-date
variation is real — closed 25 December, New Year's Eve to 02:00, brunch only this Sunday — but it needs a
row **per varied date**, roughly ten a year per venue, not a row per date, which is seven hundred and
thirty. I conflated the two and they differ by two orders of magnitude. §1.1 is that exceptions table, and
it is smaller than the thing it replaces.

**What this design does not ask anyone for.** No `kind` column on `sessions` (there is none today), no
`venue_id`, no pool-less session, no `seats = 0` series, no change to the materialiser. Sessions & Classes
keep their table exactly as shipped. My earlier asks for all five are withdrawn.

**What I reuse instead of the table.** [`lib/sessions/recurrence.ts`](../../web/src/lib/sessions/recurrence.ts)
is pure and CI-gated, and its whole subject is that a wall clock is not an instant: `zonedWallClockToUtc`
takes the **later** candidate in a spring-forward gap — its header records that an earlier version
converged an hour early, a class running while customers stood outside — and the earlier candidate in a
fall-back ambiguity. I call it; I do not copy it. That is the reuse that was worth having, and it is
available without owning a row in their table.

**One correction that must not be lost.** The first ruling gave C3 (`hours-types.ts` rejecting
`endMin > 1440`) as the clincher for the session model. **C3 does not discriminate between the designs**:
a `local_time` plus `duration_minutes` rule crosses midnight perfectly well. C3 kills building on the
*weekly hours shape*, which is true and separate. If C3 reaches the board as an argument for materialised
occurrences, someone will reuse it where it does not hold.

### C7 — a public path is 404'd by a second gate, and CLAUDE.md names a file that no longer exists

Reported by QR & Links through the Director; verified by me on `origin/main`.
`web/src/lib/saas/surface-allow-list.ts` is a per-host-kind path allow-list applied **before** Next
routing; a path absent from it is rewritten to `/_page-not-found` with a 404 while the route file
compiles and typechecks fine. That is this repo's `incident_route_404d_by_surface_allow_list`. A single
top segment must also be reserved in **both** `WORKSPACE_SLUG_RESERVED_PREFIXES` and
`PATH_BASED_TENANT_RESERVED_PREFIXES` (`surface-allow-list.ts:405` and `:426`), or a tenant whose slug
matches shadows the route. Separately, CLAUDE.md's QA caveat names `web/src/middleware.ts`; that file
does not exist on `main` — Next 16 renamed it to `web/src/proxy.ts`. The gate is real, only the doc is
stale. **I am not editing CLAUDE.md**; the Director owns that correction.

Consequence for me: every PR of mine that adds a public path adds the allow-list entry **in the same PR**,
and its exit proof is a real request returning 200, never the existence of the route file.

### C8 — Spaces has already shipped what my first phase needs, and two "obvious fixes" are traps

Live on `main`: `venues`, `spaces`, `space_combinations`, `space_groups` (with `party_min`, `party_max`,
`kind='party_band'`, `sell_mode`), `space_group_members`, `space_assignments`, migrations `…000220` to
`…000223`, and `lib/spaces/*`. Verified by reading the DDL, not the handoff.

Two things I would have got wrong:

- **The band pool is parentless on purpose.** Parenting it to the room double-charges the room on every
  replacement during a band-to-assigned migration and makes that migration refuse itself with
  `ancestor_full` mid-service. It is also wrong standing still: a room of 10 with a band of 6 sells 6,
  reads 6/10, then sells a table directly at 7/10 — seven four-tops promised against six.
- **A party under a space's minimum is allowed and flagged, not refused.** `decideAssignment` returns
  `oversized: true` and does not block. A system that refuses is one the host works around, and a host
  working around the floor plan is how the floor plan stops matching the room.

Both are now invariants I hold (§6), not decisions I get to revisit.

---

## 1. DDL

Three tables across two migrations. Cents everywhere. RLS on; staff-of-tenant SELECT; writes
service-role only. **No table is named `reservations`, `bookings` or `holds`**, and I define no venue,
space, group or layout.

Timestamps come from my band **once the Director allocates one** — the board's table stops at
Appointments. I have picked no number and will announce each before applying it (§7 Q4).

### 1.1 `venue_service_windows` and `venue_service_window_exceptions` (PR R1)

Two tables, one migration `20261229000380`, both inside this area. Nothing another manager owns changes.

```sql
-- ─── the rule: dinner, 19:00, four hours, seven nights ──────────────────────
create table public.venue_service_windows (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.agencies(id) on delete cascade,
  venue_id         uuid not null references public.venues(id) on delete cascade,

  key              text not null check (key ~ '^[a-z][a-z0-9_-]{0,31}$'),  -- 'lunch','dinner'
  label            jsonb not null default '{}'::jsonb,   -- { "en": "Dinner", "es": "Cena" }

  -- The same shape and the same semantics as session_series, resolved by the
  -- same pure function. A wall clock, NEVER an instant: adding seven days to an
  -- instant drifts across DST, which lib/sessions/recurrence.ts exists to stop.
  local_time       time not null,
  duration_minutes int  not null check (duration_minutes between 15 and 1440),
  weekdays         int[] not null
                     check (cardinality(weekdays) between 1 and 7
                            and weekdays <@ array[1,2,3,4,5,6,7]),

  -- Minutes after local_time. NULL = the window's end minus this party's turn.
  -- Structurally distinct from 0, which means "this window takes no seatings".
  last_seating_offset_min int null check (last_seating_offset_min >= 0),
  seating_step_minutes    int not null default 15 check (seating_step_minutes between 5 and 120),
  turn_minutes_override   int null check (turn_minutes_override > 0),

  starts_on        date not null default current_date,
  ends_on          date,
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint venue_service_windows_date_order check (ends_on is null or ends_on >= starts_on)
);

create unique index venue_service_windows_key_uniq on public.venue_service_windows (venue_id, key);
create index venue_service_windows_tenant_idx on public.venue_service_windows (tenant_id) where is_active;

-- ─── the variation: about ten rows a year per venue ─────────────────────────
-- Closed 25 December. New Year's Eve to 02:00. Brunch only this Sunday.
create table public.venue_service_window_exceptions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.agencies(id) on delete cascade,
  venue_id         uuid not null references public.venues(id) on delete cascade,
  -- NULL window_id = the whole venue is closed that day, which is one row
  -- rather than one per window.
  window_id        uuid null references public.venue_service_windows(id) on delete cascade,

  on_date          date not null,
  is_closed        boolean not null default false,

  -- Overrides. NULL means "inherit", which is why they are nullable rather than
  -- defaulted: a 0 here would mean something, and inheriting must not.
  local_time              time null,
  duration_minutes        int null check (duration_minutes is null
                                          or duration_minutes between 15 and 1440),
  last_seating_offset_min int null check (last_seating_offset_min is null
                                          or last_seating_offset_min >= 0),
  note             text null,
  created_at       timestamptz not null default now(),

  -- A closure overrides nothing; an override closes nothing. Allowing both on
  -- one row gives two readings of the same date.
  constraint venue_service_window_exceptions_closed_xor_override check (
    not is_closed
    or (local_time is null and duration_minutes is null and last_seating_offset_min is null))
);

create unique index venue_service_window_exceptions_uniq
  on public.venue_service_window_exceptions (venue_id, on_date, coalesce(window_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index venue_service_window_exceptions_date_idx
  on public.venue_service_window_exceptions (venue_id, on_date);
```

`duration_minutes` is why 23:00 to 05:00 works where `hours-types.ts` cannot: a window is a start plus a
length, so it never has to name an end inside a civil day (C3).

`cardinality(weekdays) between 1 and 7` is copied deliberately from `session_series`, whose header records
that the obvious `array_length(...) between 1 and 7` **accepts the empty array** — `array_length` of an
empty array is NULL, `NULL BETWEEN` evaluates to NULL, and a CHECK accepts NULL. The obvious version
silently permits a rule that expands to no windows, and nobody finds out until a page shows no times.

**No occurrence rows.** A window for a date is the rule, plus any exception for that date, resolved
through `zonedWallClockToUtc` in the venue's zone. The resolver returns a discriminated result and refuses
rather than answers: an hour that does not exist in a DST gap is **dropped from the offered times, never
moved**.

### 1.2 `venue_service_rules` (PR R1, same migration)

One row per venue; everything on the `SettingsReservations` mockup that is not a window. Overbooking is
deliberately absent: it is `capacity_pools.overbook_units`, and duplicating it would give two answers.

```sql
create table public.venue_service_rules (
  venue_id            uuid primary key references public.venues(id) on delete cascade,
  tenant_id           uuid not null references public.agencies(id) on delete cascade,
  is_active           boolean not null default false,

  party_size_min      int not null default 1 check (party_size_min >= 1),
  party_size_max      int not null default 8 check (party_size_max >= party_size_min),
  horizon_days        int not null default 60 check (horizon_days between 1 and 365),
  min_notice_minutes  int not null default 120 check (min_notice_minutes >= 0),

  -- [{ "minParty":1, "maxParty":2, "turnMinutes":75 }, ...] Ordered, non-overlapping,
  -- fail-closed parse: a malformed blob yields default_turn_minutes for every party
  -- and never a guessed turn.
  turn_time_bands      jsonb not null default '[]'::jsonb,
  default_turn_minutes int not null default 90 check (default_turn_minutes between 15 and 720),

  -- Public upsizing: may a party of 2 book a four-top band when the two-tops are
  -- gone? Default false online, always true at the host stand (§2).
  allow_public_upsize boolean not null default false,

  card_on_file_from_party  int null check (card_on_file_from_party >= 1),
  no_show_fee_cents        bigint not null default 0 check (no_show_fee_cents >= 0),
  no_show_fee_basis        text not null default 'per_person'
                             check (no_show_fee_basis in ('per_person','per_party')),
  no_show_grace_minutes    int not null default 30 check (no_show_grace_minutes between 0 and 240),
  deposit_from_party       int null check (deposit_from_party >= 1),
  deposit_cents_per_person bigint not null default 0 check (deposit_cents_per_person >= 0),
  free_cancel_hours        numeric(5,2) not null default 2 check (free_cancel_hours >= 0),

  waitlist_enabled    boolean not null default false,
  walkins_enabled     boolean not null default true,
  notes_enabled       boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index venue_service_rules_tenant_idx on public.venue_service_rules (tenant_id);
```

A null threshold (`card_on_file_from_party`, `deposit_from_party`) means **never ask**, and is
structurally distinct from a value. That is the standing rule from
`incident_a_function_that_answers_instead_of_refusing`, and it is why these are nullable ints rather than
a sentinel like 0 or 999.

### 1.3 `customer_payment_methods` (PR R5)

The C1 fix.

```sql
create table public.customer_payment_methods (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.agencies(id) on delete cascade,
  customer_id              uuid not null references public.customers(id) on delete cascade,

  stripe_account_id        text not null,   -- acct_*, the tenant's connected account
  stripe_customer_id       text not null,   -- cus_*, created ON that account
  stripe_payment_method_id text not null,   -- pm_*

  brand      text null,
  last4      text null check (last4 is null or last4 ~ '^[0-9]{4}$'),
  exp_month  int null check (exp_month is null or exp_month between 1 and 12),
  exp_year   int null check (exp_year is null or exp_year between 2020 and 2100),

  status     text not null default 'active' check (status in ('active','detached','failed')),
  is_default boolean not null default true,
  last_charged_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customer_payment_methods_pm_uniq
  on public.customer_payment_methods (stripe_account_id, stripe_payment_method_id);
create unique index customer_payment_methods_default_uniq
  on public.customer_payment_methods (tenant_id, customer_id)
  where is_default and status = 'active';
```

`stripe_account_id` is stored on the row rather than read from `agencies` at charge time, because a
tenant can reconnect a different Stripe account and a method saved on the old one is then unusable.
Storing it makes that a visible mismatch instead of a confusing decline. No card data is held; brand,
last4 and expiry come back from Stripe for display.

### 1.4 What I call, and what I still need from other managers

**Shipped and mine to call** (verified on `main`): `resolveTenantTimezone` — the only timezone read path;
`loadSpaces` / `loadSpaceGroups`; `decideAssignment` and `rankCandidates` (pure, and `rankCandidates`
takes a rotating offset, or every concurrent booker contends on table one); `assignSpace`, `moveToSpace`,
`setSpaceStatus`, `loadSeatingForWindow`; `planModeMigration` / `runModeMigration`; `ss2Violations`;
`spaces.turn_minutes` as the per-table override of my window's turn time.
**Availability I read from `capacity_remaining_public` directly** — it already returns the tightest answer
across the whole ancestor chain, so a table inside a bought-out room reports 0 without me knowing a tree
exists. Spaces must not become a wrapper I route through.

| Still needed | Owner | What, and why now |
|---|---|---|
| `admissions.allocation_id` | Sessions & Classes (their Phase 1) | **Ruled for me.** `allocation_id uuid not null`; `session_id` and `space_id` nullable and descriptive. A reservation has no session at all under C6 and no space until the host seats the party, and a walk-in has no order line either — the allocation is the only thing every admission has by construction. |
| `lines[].partySize?: number` | Front Door / Orders | A line needs a party. It is **not** `units`: a party of four in a four-top band consumes **one** unit. Without it the Sheet cannot express a table booking at all. |
| `host` role | Events' operational-roles slice | §5 |
| `createLinkForSpace()` | QR & Links | Ruled by the Director: QR & Links own the link and every rendering of it. A table's scannable code is asked for, never generated by me. |

### 1.5 `admissions`: what was ruled, and the one column still open

**Ruled in, and in their Phase 1 migration** (so it is one migration, not a second one on a live status
set): `party_size int null`, `assigned_space_id uuid null`, `order_line_id` **nullable**, `seated_at`,
`no_show_at`.

**Ruled against me, correctly.** I asked for `status` values `booked|seated|no_show|completed|cancelled`.
The Sessions Manager argued for `status in ('valid','void','refunded')` plus a separate `admitted_count`,
and they are right: whether an admission is commercially good and whether the guest has arrived are
independent facts, and one label holding both is the `one label, three states` collapse I have been
citing at other people all day. The door facts come back to me as the `seated_at` / `no_show_at` stamps I
wanted anyway, and the split says something my enum could not: *seated, then refunded*. `admitted_count`
also expresses a case I had not modelled — a party of four where two arrive first and the rest at 20:40 —
which my grace-period no-show job would have got wrong.

**Still open: the anchor.** Their guard is `CHECK (session_id IS NOT NULL OR space_id IS NOT NULL)`. With
`service_window` restored a reservation does have a `session_id`, so the guard no longer refuses the
common case — but it still has no `space_id` until the host seats the party, and a **walk-in seated
outside any window has neither**. Every admission that will ever exist — class seat, ticket, table,
walk-in — is backed by a `capacity_allocations` row by construction; session and space are each true for
only some. Proposal stands: `allocation_id uuid not null`, session and space nullable and descriptive.
One column, same migration.

---

## 2. The model, stated once

> **A service window is time. A band is capacity. A reservation is an order plus an admission.**

- **Window.** A `venue_service_windows` rule plus any exception for that date, resolved to instants
  through `lib/sessions/recurrence.ts` in the venue's own zone. No stored occurrences, and no row in
  anyone else's table. 23:00 to 05:00 is ordinary; a DST gap drops the affected seating rather than
  moving it (C6).
- **Capacity.** The **band** pool — a `space_groups` row of `kind='party_band'` with `party_min`/`party_max`,
  holding one `capacity_pools` row, `sell_mode='band'`. **It is parentless and I do not parent it** (C8).
  Member tables hold no pool in this mode; that is SS-2, and once I own the venue's mode it is mine to
  hold, because membership is the Spaces table and no capacity row can see it.
- **The claim.** `reserve_capacity(band_pool, T, T + turn(N), 1, ttl)` — **one unit**, whatever N is.
  Party size selects the band; it never multiplies units.
- **Turn time** comes from the band's rules, overridden per table by `spaces.turn_minutes` once a venue is
  in assigned mode. **Overlap is half-open**: a table freed at 20:00 is seatable at 20:00. Treating that
  as a clash loses a seating every night and looks like caution.
- **Upsizing** — a party of 2 offered a four-top when the two-tops are gone — is allowed and flagged at
  the host stand always, and online only when `allow_public_upsize` is set. Refusing it outright is the
  mistake Spaces warns about; offering it by default on a Saturday at 20:00 burns a four-top on a deuce.
  So it is a policy with an honest default rather than a rule.
- **The reservation** is an `orders` row (`source_channel='reservation'`, $0 or a deposit) with one
  `order_lines` row, one allocation, and one `admissions` row carrying `party_size`.
- **Assignment** to Table 7 is `assignSpace` writing `space_assignments`. It is a **label on an existing
  allocation, never a second one**; `capacity_allocations` has no `space_id` and must never get one,
  because a joined party sits at two tables.
- **A walk-in** is an admission and an allocation both with a null `order_line_id`, and a host actor.
  Same pool, counted.
- **Band to assigned** is `planModeMigration` then `runModeMigration`, and **the order is the safety
  property**: create table pools, then **reserve and commit the replacement, and only then release the
  band allocation**. Release-then-reserve opens a window where the guest holds nothing and a walk-in
  takes their table. Already-seated parties are placed first; you cannot move someone mid-meal.

Under other words (§05f) nothing moves: a padel club's band is courts and `party_size` reads players,
turn time is match length; a beach club's is sunbeds; a coworking's is desks and the window is an hour.

**Two things I will not re-derive.** The ancestor rule ("rule 8") is the capacity engine's, and its
`ancestor_full` refusal is the answer; a second implementation of someone else's invariant is free to
drift from it. And `ancestor_full`'s customer-facing wording — the table is empty and the guest still
cannot sit at it — is Front Door's string, not mine.

---

## 3. Screens

Unchanged from the designs sent to the Director, with one correction: in band mode the host stand's room
picture is a **chip grid of assignments**, not a floor plan, and drag-to-seat arrives with layouts. The
"Unassigned" row in the mockup is not a defect to clean up; in band mode it is the normal state until the
host places the party, and that list is the host stand's whole job.

Public `reserve_table` block, the Sheet's four steps, the receipt, the host stand and the rules page are
in the artifact linked at the top.

---

## 4. PR sequence

My **Phase 1 is band mode**, which is why R1 to R4 need nothing that is not already on `main`.
Assigned mode and the floor plan are my Phase 3. One migration per PR; the allow-list entry ships in the
same PR as any public path (C7).

| PR | Delivers | Exit proof |
|---|---|---|
| **R1** | Migration `20261229000380`: `venue_service_windows` + `venue_service_window_exceptions` + `venue_service_rules`. `lib/reservations/`: fail-closed rules parser, turn-time bands, pure `offeredTimes()` over a window occurrence. Tests in a curated lane. No UI. | Lane green with real exit codes, including: a 23:00 window of 360 minutes in `America/Cancun` yields a 05:00 end across two civil days; a seating time inside a spring-forward gap is **dropped, not moved**; a malformed band blob yields the default turn and never a guess; 20:00 and 21:30 on a 90-minute turn do not overlap. |
| **R2** | The settings page and the read-only book by window on the Reservations page. Windows and rules editable; the Set up drawer writes the same values. | Clicked on `localhost`: a restaurant defines lunch and dinner and a turn table in under two minutes, and the book renders both windows for a real date. Screenshot. |
| **R3** | Public availability endpoint + the `reserve_table` block. "Ask first" wired; "Reserve" behind a flag until R4. **Allow-list entry in this PR.** | A real request to the public path returns 200 on a tenant host (not the route file's existence). A party of 6 is offered nothing when only two-tops and four-tops exist; is offered 20:15 when the eight-top band is free; upsizing is refused online with `allow_public_upsize` false and offered with it true. Clicked, screenshot. |
| **R4** | The reservation through `lib/orders/purchase.ts`: order, line, one allocation, admission with `party_size`. $0 and deposit paths. Confirmation to the receipt. | **A reservation for four at 20:00, taken online end to end**, clicked by me: one allocation of one unit on the four-tops band, admission with `party_size=4`, receipt loads with no account. |
| **R5** | Migration `20261229000381`: `customer_payment_methods`. SetupIntent on the connected account; a guest with an email and no `auth.users` row saves a card; off-session no-show charge under the ratified policy. | A real low-value test: **the charge lands on the tenant's connected account** with the agreed `application_fee_amount`. Stripe dashboard plus the row. |
| **R6** | Host stand: today's book, seat / move / running late / no-show, **walk-ins against the band with a null order line**, `host` role. | **A walk-in seated against the same pool**: remaining drops by one with no order row, and the next online booking is refused when the last band unit goes. Clicked, screenshot, plus the query. |
| **R7** | Confirmation and reminders in venue-local time by email; the "running late" tap holds 15 more minutes; the channel abstraction ready for SMS. | A venue in `America/Cancun` gets its reminder at **8am local**, proven from the cron log. SMS stays dark until Twilio exists. |
| **R8** | A seated admission opens a tab: a menu order tagged with the space and the customer, and its table code asked for from `createLinkForSpace()`. | A menu order from the host stand carries `space_id` and `customer_id` and appears on the guest's record. |
| **R9** | **Phase 3.** The mode flip: a venue moves band → assigned through `planModeMigration` / `runModeMigration`, with `ss2Violations()` wired into the flip so SS-2 cannot be broken by the action that exists to change modes. | A venue with live allocations migrates with **no guest ever holding nothing**: every replacement is reserved and committed before its band allocation is released, and a plan that cannot place one party refuses to start at all. |

Dependencies: R1 to R3 need nothing further. R4 needs Orders 0.6 and Front Door F3. R5 needs Orders 0.4.
R6 needs the operational-roles slice. R9 needs R6 and assigned-mode table pools.

The department exit proof is R4, R6 and R5 — *a reservation for four at 20:00, a walk-in on the same
pool, a no-show forfeiting into the right account*. I will not call the phase done until each is clicked
and evidenced on production.

---

## 5. Roles — `host` must NOT be a membership role

**Corrected 2026-09-04 after reading the function rather than assuming it.**
[`is_staff_of_tenant`](../../supabase/migrations/20260602100000_saas_p2_rls_tenant_isolation.sql#L43)
is the predicate under **every RLS policy on every tenantised table**, and its body is:

```sql
SELECT public.is_platform_admin()
  OR EXISTS (SELECT 1 FROM public.agency_memberships m
              WHERE m.profile_id = auth.uid()
                AND m.tenant_id  = target_tenant_id
                AND m.status IN ('active','pending_acceptance'));
```

**It never reads `role`.** So adding `host` to the membership role CHECK would not create a narrow
role; it would grant a host read access to the entire workspace — the roster, the clients, the money —
through every policy in the schema. My earlier plan said "Events builds the `door` slice and I add
`host` on top", which was right about not forking and wrong about the mechanism.

The pattern is a **SECURITY DEFINER function plus app-layer gating**, not a membership row. Events is
building the `door` shape first; I build `host` on that shape. Capabilities the host stand needs:
`view_reservation_book`, `seat_guest`, `mark_no_show`, `create_walkin`, and read of name, party size and
notes — **not** email, phone, spend, or notes marked private.

**A related trap, same source:** `product_discounts.code` is **globally unique**
([`20260527213552:133`](../../supabase/migrations/20260527213552_product_discounts.sql#L133)). If
Reservations ever grows promo or comp codes, that shape must not be copied — the first venue to create
`SALSA10` would take it from every other venue on the platform.

## 6. Invariants I hold, and will refuse to break

1. **One unit per table, whatever the party size.** Party size selects the band.
2. **Assignment never allocates.** Seating Table 7 labels; it does not touch capacity. `capacity_allocations`
   gets no `space_id`.
3. **The band pool stays parentless.**
4. **SS-2.** A group's pool and its members' pools are never both active. Wired into whatever flips a mode.
5. **Reserve before release, never the reverse,** in any mode migration.
6. **A party under a space's minimum is allowed and flagged, not refused.**
7. **Overlap is half-open.**
8. **A walk-in consumes capacity** — null order line, host actor, same pool, counted.
9. **A window resolver refuses rather than answers.** No invented hour in a DST gap, no guessed turn from a
   malformed blob, no sentinel standing in for "never ask".
9b. **A closure and an override never share a row**, or one date has two readings.
10. **No table named `reservations`, `bookings` or `holds`; no venue, space, group or layout defined here;
    no `links` row written and no QR image generated; no customer-facing noun hardcoded.**
11. **I do not touch the appointments subject model.** I reuse its policy layer and its reminders.
12. **Cents, `en` + `es`, no em dashes, literal emoji only. Any public path ships with its allow-list entry.**

---

## 7. Questions, and how they were answered

| # | Question | Ruling, 2026-09-03 |
|---|---|---|
| 1 | Who owns `customer_payment_methods`? | **Mine to build in R5.** Finance reviews the charge path; it enters the contracts registry before Events or Appointments touch it. |
| 2 | D2 forfeiture | **To the owner as a yes/no**, in the narrowed form: tenant keeps it, platform fee 0 on a no-show or forfeiture, normal fee on a deposit applied to the bill. |
| 3 | `admissions` and `sessions` shape | **Ruled and instructed to Sessions & Classes** in their Phase 1 migration (§1.5). `allocation_id` still open. |
| 4 | Migration band | **`20261229000380` to `…000399` granted.** Each exact number announced before it is applied. |
| 5 | Operational roles | **Events builds the slice with `door`; I add `host` on their shape.** Reverts to me if Events stalls. |
| 6 | `feature-tables.ts` copy | **Creative Director**, with §8 as the proposed wording. Not me, not Front Door. |
| 7 | CLAUDE.md names `web/src/middleware.ts`, which does not exist | Director's to correct. **I will not edit CLAUDE.md.** |

Still open: nothing. `admissions.allocation_id` was ruled for me and sent to Sessions & Classes as urgent;
the `session_series.seats = 0` ask is **withdrawn**, because C6's close means I need nothing from their
schema at all.

---

## 8. Proposed copy correction for `feature-tables.ts`

Wording only; I do not own the file.

- The subtitle and the first highlight lead with what the first release actually is: **party size, service
  windows, turn times and deposits**. "Floor plan and table configuration" moves down and gains the honest
  qualifier that it is the layer above.
- "Underneath, this is appointments with a floor plan on top" becomes: *the same deposits, reminders, inbox
  and calendar as appointments, on a booking model built for a room rather than for one person at a time.*
  The shared thing is the policy layer, not the engine.
- The FAQ keeps "not shipped yet"; nothing there over-promises.

---

## 9. Status log

- **2026-09-03** — Revision 1 written and sent to the Director with designs. No code.
- **2026-09-03, later** — Revision 2, after the Spaces handoff, the Sessions Manager's two decisions and
  the links ruling. Three assumptions were wrong: Spaces had already shipped band mode (C8), a public path
  needs an allow-list entry (C7), and I withdrew the session model for service windows.
- **2026-09-03, later still** — Revision 3 restored the session model on per-date variation, on a Director
  ruling that had crossed Revision 2. The status enum was ruled against me and the ruling is right (§1.5).
  Band `20261229000380`–`…000399` granted.
- **2026-09-03, close of day** — **Revision 4. C6 closed.** The Director retracted the first ruling and
  approved Revision 2; my Revision 3 argument was wrong by two orders of magnitude (a row per *varied*
  date, not per date). C6 is now settled on what `sessions` *is* rather than on a cost comparison, so it
  does not reopen. A window is two small tables in this area and needs nothing from anyone else's schema;
  five asks on Sessions & Classes withdrawn. `admissions.allocation_id` ruled for me. **R1 to R3 have a
  go.** Plan on PR #1591; no implementation code written yet.
