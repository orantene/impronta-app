# Sessions & Classes — plan (Phase 1)

Owner: **Sessions & Classes Manager**. Reports to the Platform Features Director (see §9 on the
reporting line, which the board changed after this chat's prompt was written).

Source architecture: "Sell the Room" §04, §05, §05b, §05d, §05f, §10 Phase 1.
Verified against `origin/main` @ `e3f30bb8c` and against **production** on 2026-09-03.

This document replaces the starter written by the Capacity Engine Manager. Their P1.1 shipped
(#1582) and I am taking the area from there. Where I disagree with the starter, the disagreement is
marked and argued; where I disagree with my own brief, the same.

---

## 0. What is already true, measured rather than assumed

Every line here was read on `origin/main` or queried against production today. Four of them
contradict the brief this area was opened with.

| Thing | State |
|---|---|
| `capacity_pools`, `capacity_allocations`, `reserve_capacity_batch`, `commit_capacity`, `release_capacity`, `upsert_capacity_pool`, `capacity_remaining_public`, the ancestor rule | **shipped and live** (Capacity 0.2–0.11) |
| `subject_kind = 'session_tier'` registered in `capacity_subject_kinds` | **shipped** (in `20261229000214`) |
| `venues` with per-venue IANA `timezone`; `agencies.timezone` | **shipped** (Spaces S1, `20261229000220`) |
| `spaces`, `space_groups`, seating | **shipped** (Spaces S2, S3) |
| `orders`, `order_lines`, `customers`, `lib/orders/purchase.ts` (`createPurchase`) | **shipped** (Orders 0.4, 0.5, 0.6a) |
| `session_series`, `sessions`, `lib/sessions/recurrence.ts`, `lib/sessions/tier-pools.ts` | **shipped by the Capacity Engine Manager as P1.1** (`20261229000214`, #1582). 0 rows in both tables |
| `admissions` | **does not exist.** Zero references in the repo outside the word `events.ticket` in `lib/words/rows.ts` |
| `session_picker` | **does not exist.** Zero references |

### 0.1 Four brief-versus-code contradictions

**(1) My scope item 1 is already built, by someone else.** The brief says to write
`session_series` and `sessions`. They shipped this afternoon in the Capacity Engine Manager's band
(`…000214`) while this chat did not exist. I have read the migration line by line and I am adopting
it: the wall-clock-plus-zone decision, the `cardinality()` CHECK, `ON DELETE SET NULL` on
`series_id`, and `sessions_series_occurrence_uniq` are all right, and two of them are right for
reasons I would have had to learn the hard way. **My phase starts at P1.2.** I did not write P1.1
and will not claim its exit proof as mine; I re-ran its tests and re-read its DDL against production
before building on it, which is the most I can honestly offer about someone else's PR.

**(2) The shipped `sessions` has no `kind` and no `meeting_point`.** My brief specifies both.
See §2.1 — after an argument that ran three ways and reversed twice, **neither is being added** and
`sessions` is not changed at all in Phase 1.

**(3) Nothing in the codebase moves an order to `paid`.** `grep` over `origin/main` finds four
writers of `orders` (`purchase.ts`, `draft-order.ts`, `orders-for-thread.ts` reads only) and none of
them sets `status = 'paid'`; `lib/bookings/transactions.ts:markPaid` — the actual Stripe-webhook
seam — does not touch `orders` or call `commit_capacity` at all. Step 12 of the Orders 0.6 pipeline
("webhook: commit capacity, order → paid, snapshot from order lines") **is designed and not yet
built.** This is the single largest fact affecting my phase and it changes my exit proof. See §6.

**(4) Every venue in production is on UTC — all thirteen, including two named "Riviera Maya Work"
and one "Casa Muna".** `venues.timezone` is `text NOT NULL DEFAULT 'UTC'`, so a workspace that has
never opened the venue screen is indistinguishable from one that deliberately chose UTC. For most
features that is cosmetic. For this one it is the whole feature: a class in Playa del Carmen
materialises six hours off, at a valid-looking instant, and the first signal is a customer arriving
to an empty room. **The materialiser must refuse rather than default.** See §3.3. This is Spaces'
column and I am not changing it; I am refusing to consume it blindly, and raising it.

---

## 1. What this phase is for, in one paragraph

The only seat count in production is one row: *"Posing course — September (12 spots)"*, a
`kind='package'` offering with a global `inventory_qty`. Capacity 0.3 closed the oversell, so
thirteen people can no longer buy it. But it is still **twelve seats forever, not twelve per
session** — buy one in September and the October session has eleven. Phase 1 makes a seat belong to
a night. That is the first capacity-greater-than-one sale on the platform, and it produces the two
primitives Events and Reservations are both blocked on: a stored occurrence, and an admission.

---

## 2. Schema

### 2.1 `sessions` is not changed at all — the `kind` column is WITHDRAWN

An earlier revision of this plan added `kind` (with `service_window` dropped) and `meeting_point`.
**Both are withdrawn and `sessions` stays exactly as `20261229000214` shipped it.**

Two separate reversals landed on the same column:

**`service_window`.** I argued it out; the Director overruled me; the Director then retracted the
overrule; the Reservations Manager independently withdrew the model it was protecting. The argument
that closes it is theirs, and it is better than the one I used: **nothing would ever point at a
service-window occurrence.** A class session is named by its tier pool and by every admission. A
dinner service is named by nothing — capacity sits on the band pool and the allocation is a
90-minute turn floating inside the window, not the window itself. Reservations build the rule and a
small exceptions table inside their own area and call `lib/sessions/recurrence.ts`, so there is one
implementation of "wall clock plus zone to instant" and no row of mine involved.

**`kind` itself, which I am withdrawing against my own earlier argument.** I claimed it earned a
column because a CHECK would make `meeting_point` structural on day one rather than decorative.
There is no tour or departure feature, no tenant with one, and no reader. *A column with no reader
now is a column read wrongly later* is the argument I used to reject a decorative enum; it applies
to me. Both columns cost nothing to add the day a departure exists.

**A note on how the wrong ruling was produced, because half of it was mine.** I reported that I had
"dropped `service_window` from the session `kind` enum". That sentence presupposes an enum. There
was never one — `20261229000214` creates `sessions` with no `kind` column at all. The Director
priced a change they had not read; I described a delta against a schema I had read and they had
not, in words that only parse if they had. **Quote the DDL, never describe the delta**, when asking
someone to rule on schema.

### 2.2 `admissions` (P1.5 migration)

```sql
CREATE TABLE public.admissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- NULLABLE: a walk-in seated by a host has no order at all, and that is a
  -- complete, valid reservation. (Reservations Manager, ratified.)
  order_line_id  uuid REFERENCES public.order_lines(id) ON DELETE SET NULL,
  -- The capacity this admission is backed by. See the note on NOT NULL below.
  allocation_id  uuid REFERENCES public.capacity_allocations(id) ON DELETE SET NULL,
  session_id     uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  space_id       uuid REFERENCES public.spaces(id) ON DELETE SET NULL,
  -- The host stand assigns Table 7 later; unassigned is a valid completed state.
  assigned_space_id uuid REFERENCES public.spaces(id) ON DELETE SET NULL,
  -- WHO THIS ADMISSION IS FOR. Not the buyer: the buyer is orders.customer_id.
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  holder_name    text,
  holder_email   citext,
  -- "Today's book, ordered by time" is the host stand's entire query; joining
  -- allocations to sort it is an index nobody should need.
  starts_at      timestamptz,
  party_size     int  NOT NULL DEFAULT 1 CHECK (party_size > 0),
  -- THE COMMERCIAL STATE. Not the door state. See below.
  status         text NOT NULL DEFAULT 'valid'
                   CHECK (status IN ('valid','void','refunded')),
  -- THE DOOR STATE, as a count, because a party of four can arrive in two goes.
  admitted_count int  NOT NULL DEFAULT 0 CHECK (admitted_count >= 0),
  first_admitted_at timestamptz,
  last_admitted_at  timestamptz,
  admitted_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- STAMPS, not derivations. `admitted_count = 0` covers "has not arrived yet"
  -- AND "never came", which is the same label collapse the status split rejects.
  seated_at      timestamptz,
  no_show_at     timestamptz,
  completed_at   timestamptz,
  token_version  smallint NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admissions_admitted_within_party
    CHECK (admitted_count <= party_size),
  CONSTRAINT admissions_no_entry_when_not_valid
    CHECK (status = 'valid' OR admitted_count = 0),
  CONSTRAINT admissions_admitted_stamps
    CHECK ((admitted_count > 0) = (first_admitted_at IS NOT NULL)
           AND (admitted_count > 0) = (last_admitted_at IS NOT NULL)),
  -- An admission must name SOMETHING. The earlier session-or-space guard
  -- refused every band-mode reservation, which has neither at reserve time.
  CONSTRAINT admissions_names_something
    CHECK (num_nonnulls(allocation_id, session_id, space_id, order_line_id) >= 1)
);
```

**On `allocation_id NOT NULL`, which the Director has ruled for and I have contested once.** The
case for it is strong: class seat, ticket, table and walk-in are all backed by a capacity allocation
by construction, and a NOT NULL on the thing that is always there beats a CHECK over two things that
are each sometimes there. **There is a fifth case and it is in writing.** The Events brief scopes
*"free events with RSVP"* and `admission_kind in ('ticket','pass','registration','rsvp')`, and the
proposal (§08) says zero-dollar orders *"still need a customer, an admission and a check-in"*. Under
Capacity's ratified semantics an uncapped thing has **no live pool** — unlimited deactivates the pool
and `reserve_capacity` refuses an inactive one — so an uncapped RSVP has no allocation to point at.
Shipping NOT NULL anyway gets satisfied in Phase 2 by a placeholder allocation against a dummy pool,
which is a sentinel that participates in arithmetic, in the schema instead of in a function. The
column is written nullable here pending the Director's second answer; if they hold the NOT NULL I
ship it, and Reservations lose nothing either way.


**Three deviations from both the brief and the starter, each with a reason.**

**(a) There is no `checked_in` status.** The brief's enum is
`('valid','checked_in','void','refunded')`. That single label covers two independent facts — is this
admission commercially good, and has the holder arrived — and this repo has a recorded incident
(*one label, three states*) in which exactly that collapse hid a cap breach. It also cannot express
the mockup: the door screen in the canvas reads **"General admission · 1 of 2 · 18 checked"**, a
party half-arrived. So `status` is the commercial state and `admitted_count` is the door state, and
"checked in" is `admitted_count = party_size`, derived, never stored. Events and Reservations both
reuse this table, so getting the shape right now is cheaper than an enum migration in Phase 2.

**(b) There is no `qr_token` column.** My brief names one. I am deriving the token instead, per the
starter's recommendation and `lib/notifications/guest-unsubscribe-token.ts`: HMAC over
`admission:v<n>:<admission_id>` with `GUEST_COOKIE_SECRET`, verified with `timingSafeEqual`. A
stored token is a credential at rest in a table that staff, and later a door role, can SELECT; a
derived one cannot leak from a row, needs no backfill, and rotates with the secret. The usual
objection — you cannot revoke a derived token individually — does not apply, because we already
have per-row state: revocation is `status='void'`, and `token_version` gives a per-row rotation
lever if one is ever needed without touching the platform secret.

**(c) `holder_email` is `citext` and separate from the customer.** One buyer purchasing six seats
for six named people is the Events case, and it is a class case too (a parent booking two children).
`customer_id` is who the admission is *for* and is nullable; the buyer is on `orders.customer_id`.
Conflating them was open question 4 in the starter and this is my answer.

RLS follows `capacity_allocations` exactly: SELECT for staff of the tenant, **no write policy of any
kind**, every write through an RPC under the service role, `REVOKE ALL … FROM PUBLIC, anon,
authenticated` and then the explicit role revokes as well (a role grant survives a revoke from
PUBLIC — that is the recorded `revoke_from_anon_noop` mirror, and Supabase grants `ALL` to `anon`
and `authenticated` on every new public table by default).

### 2.3 `order_lines.session_id` — a contract change I need from Orders

`orders.session_id` exists (Orders 0.5) and is the wrong grain for this feature. A studio member
buying Tuesday's and Thursday's class in one checkout is **one order, two sessions**; an
order-level pointer forces either two orders or a lie. `admissions.session_id` alone does not fix
it, because the refund-by-line and capacity-attribution paths key on `order_lines.id`, and
`capacity_allocations.order_line_id` is already what refund-by-line reads.

Requested: `alter table public.order_lines add column session_id uuid null references
public.sessions(id) on delete set null;` in **my** migration, since `sessions` is my table and the
column has no reader on their side yet. `orders.session_id` stays as the "this order is about one
night" convenience for the box-office view; it is not the binding. Raised with the Orders & Checkout
Manager, Director copied.

---

## 3. The materialiser (P1.2)

### 3.1 Shape

A daily cron at `app/api/cron/materialise-sessions/route.ts`, `CRON_SECRET` bearer auth, scheduled
in `web/vercel.json`, following the twenty existing cron routes. For every active series it expands
the next **90 days** and, per occurrence, in one idempotent pass:

1. `INSERT INTO sessions … ON CONFLICT (series_id, starts_at) DO NOTHING` — the unique index P1.1
   shipped is what makes re-running safe rather than merely careful.
2. `upsert_capacity_pool(tenant, 'session_tier', <session id>, <seats>, 'default', …)` — idempotent
   on `(tenant, kind, subject, pool_key)`.

Both are no-ops on the second run, so the exit proof is "run it twice, count the rows", not "read
the code and believe it".

### 3.2 What it must not do

- **Never materialise the past.** A window that starts at `now()` and not at `starts_on`.
- **Never delete or move a materialised session when the series is edited.** A sold session is
  history. A series edit changes *future* occurrences only, which is the "this one or all future"
  question the mockup's Sessions tab asks in so many words.
- **The materialiser CREATES a pool; it never SETS one.** Those are different operations and one
  function will not serve both. `set_session_seats` computes `available + held` under the row lock,
  which is right for an editor and silently wrong here: called with the series' seat count against a
  session that has already sold, it *raises* the ceiling rather than resetting it — and it would read
  as a fix, because it goes through the locked function instead of around it. The name would be doing
  the reassuring. (Capacity's warning; verified — the only reference in the tree today is a comment,
  which is "true now" rather than structural.) Guarded by a static test that nothing under
  `app/api/cron/` references it, with a test proving the guard bites on the broken shape, and
  comments stripped before asserting.
- **Never `units_total = <new number>` on an existing pool.** Editing seats on a session that has
  sold is `available + held` under the pool's row lock. That arithmetic is already shipped and
  proven in `set_offering_stock` (`20261229000211`); I am copying its shape into
  `set_session_seats(p_session_id, p_available, p_tenant_id)` rather than re-deriving it, and
  inheriting both its ratified semantics: reducing below what is held **never cancels a hold**, and
  going unlimited **deactivates the pool rather than deleting it**.
- **Never expand by adding 7×24h to the previous occurrence.** `lib/sessions/recurrence.ts` already
  refuses to; the cron calls it and does no date arithmetic of its own.

### 3.3 The timezone refusal

`resolveTenantTimezone` (Spaces S1) resolves venue → agency. Both are `NOT NULL DEFAULT 'UTC'`, so
it always answers. **The materialiser must not treat that answer as a configuration.** For a series
whose venue has never had a timezone explicitly set, the materialiser records a refusal and
materialises nothing, rather than producing occurrences at a plausible wrong hour.

That needs one bit that does not exist today: "was this zone chosen, or is it the default". I am
**not** adding a column to Spaces' table. The cheapest honest version, and my proposal: the series
editor requires the venue's timezone to be confirmed before a series can be activated, and stores
the confirmed zone on `session_series.timezone` — a copy, deliberately, and here is why the usual
argument against copies does not apply. `venues.timezone` answers "where is this venue now";
`session_series.timezone` answers "what did the operator agree these classes recur in". A venue
that moves city should *not* silently reschedule twelve weeks of sold classes. The copy is the
record of an agreement, not a cache of a fact. This is the one place I am adding a second
timezone store on purpose, and I will not add another.

Alternative, if the Director prefers no copy: Spaces adds `timezone_confirmed_at timestamptz` to
`venues` and the materialiser refuses on NULL. That is cleaner and it is their column and their
call. I have written the plan against the copy because it needs nothing from a manager who has
declared a clean stop, and it is reversible.

---

## 3.4 The gap collision: two sessions, one instant, two pools

Found by the Reservations Manager in their own area; reproduced here before being repeated.
`Europe/Madrid`, 2027-03-28, the day 02:00 to 03:00 does not exist:

```
series at 01:30 local -> 2027-03-28T00:30:00.000Z = 01:30 local
series at 02:30 local -> 2027-03-28T01:30:00.000Z = 03:30 local
series at 03:30 local -> 2027-03-28T01:30:00.000Z = 03:30 local   <- same instant
```

The gap policy that saves a class from vanishing (`next`) folds two wall clocks onto one instant.
A venue with a 02:30 show and a 03:30 show — unremarkable for a club, and `sessions` covers shows —
gets **two sessions at one instant, each with its own `session_tier` pool, each selling its own
capacity into the same room.** In Phase 1 tier pools are parentless, so nothing refuses it; the
ancestor rule catches it only once a Spaces room pool is the parent, which is Phase 4. Until then
it is an oversell with a once-a-year trigger and no guard.

**Keyed on `kind === "shifted"`, not on a re-derivation.** Capacity's `resolveWallClock` (#1592)
returns a discriminated result — `exact` / `ambiguous` / `shifted` / `nonexistent` — rather than a
bare `Date`. Only a `shifted` occurrence can collide, so the runner tests shifted instants against
the venue's instants instead of every pair. Without it the runner would have had to resolve twice
under both policies and diff, which is the caller doing the resolver's job. It is the standing rule
applied to a shift rather than an absence: a bare `Date` cannot say "this is not the clock you
asked for", the same way a bare `[]` cannot say "this can never produce anything".

**Detection, not prevention.** `sessions_series_occurrence_uniq` is on `(series_id, starts_at)` and
correctly does not catch this: two different classes genuinely can run at one instant in two
different rooms, so a uniqueness constraint on `(venue, starts_at)` would refuse valid states —
the mistake already caught once on `admissions`. Instead the **runner** refuses an occurrence whose
`next`-resolved instant is already held by another occurrence at the same venue, with a named
reason. It belongs in the runner rather than in `decideMaterialisation`, which sees one series and
cannot know about the other.

Refusing is the safe direction here in a way it is not for a dinner service: a class that does not
appear is visibly missing from a schedule the operator reads every day, whereas a silently
duplicated room is not visible anywhere until two crowds arrive. Resolution — asking the operator
which one moves — is a screen, and is not Phase 1.

## 4. `session_picker` (P1.4) — and an ownership question

The data contract, following `menu_board` exactly (server resolves, renderer never queries):

```ts
// BuilderNodeRenderDataSources
sessionPicker?: ReadonlyArray<{
  id: string;
  title: string;             // session title, else the series title
  startsAt: string;          // instant
  endsAt: string;
  timeZone: string;          // for rendering the local time, never for math
  kind: "class" | "show" | "departure" | "screening" | "tour";
  venueName: string | null;
  offeringId: string | null;
  poolId: string | null;
  remaining: number | null;  // capacity_remaining_public; null = unlimited
  amountCents: number | null;
  currency: string;
}>;
```

`remaining` comes from `capacity_remaining_public(pool_id, starts_at, ends_at)`, which returns one
integer and never a row, so an anonymous visitor learns how many seats are left and nothing about
who holds them. The island hands lines to the Front Door Manager's Sheet; it never calls
`createPurchase` itself.

**The ownership question.** The board says plainly: *"`builder-node/` belongs to the Page Builder
Director, a separate department. No Platform Features manager edits those files."* A native block
touches at least eight files in that directory (`types.ts`, `registry.ts`, `render.tsx`,
`create.ts`, `drop-policy.ts`, `mvp-allow-list.ts`, `native-data-block-needs.ts`, the add-gallery
catalog). My brief instructs me to build it; the board forbids me from touching the files it lives
in. Both cannot be right. **Director: please rule.** My recommendation is that I write the data
resolver and the island (which are mine — `menu-board-island.tsx` is the precedent and it is a
feature file), and the eight registry wirings go to the Page Builder Director as one small PR
against a contract I hand them. That is how `menu_board` got built and it is the only reading under
which the board's sentence means anything. **P1.4 is blocked on this answer**, and it is the only
slice that is.

---

## 5. PR sequence

| PR | Delivers | Depends on | Exit proof |
|---|---|---|---|
| **P1.2** | Migration: `sessions.kind`, `meeting_point`, `session_series.timezone`, `set_session_seats`. `lib/sessions/materialise.ts` (pure decision) + the cron route. `test:sessions` lane extended. | nothing | Cron run **twice** against a real series → exactly one `sessions` row and exactly one `capacity_pools` row per occurrence, counted in the table, not tallied from replies. A Madrid series at 18:00 spanning the March transition materialises 13 occurrences all at 18:00 local. A series on an unconfirmed-timezone venue materialises **zero** and says why. |
| **P1.3** | The workspace Sessions surface: series editor, the occurrence list from the mockup (Session / Doors / Seats / Status), "this one or all future", seats per session through `set_session_seats`. en + es. | P1.2 | Clicked by me on localhost, screenshotted: create a weekly series, see 13 occurrences, edit one, edit all-future, reduce seats on a session that has a live hold and watch availability go to 0 without cancelling the hold. |
| **P1.4** | `session_picker`: data resolver + island (mine), registry wirings (Page Builder, per §4). | P1.3 + the §4 ruling | A signed-out visitor on a published page sees real remaining seats and a sold-out state at zero. Clicked, not asserted. |
| **P1.5** | `admissions` + RLS + `mintAdmissionsForOrder(orderId)` helper + `order_lines.session_id`. Token derive/verify with tests. **No caller.** | P1.2, Orders agreeing §2.3 | Table exists in production, `has_table_privilege` false for `anon` and `authenticated` on every write verb and true for `service_role`; token round-trips, a tampered token fails, a wrong-purpose token fails. |
| **P1.6a** | The live Posing course becomes session-backed: a September series, its sessions, its pools, the offering pointed at them. A data migration on one real published row, **with its own verification**, not a side effect of P1.6b. | P1.3 | Before and after row dumps of the offering, its pool and its sessions, in the PR body. |
| **P1.6b** | Purchase through `createPurchase` with a session: line seeds carry the session and its tier pool via `tierReserveRequest`. | P1.6a, Orders 0.6b | **Twelve seats on one September session to twelve different customers, and the thirteenth refused** with `sold_out`. Measured in `capacity_allocations`, not from HTTP replies. See §6 on the half of this I cannot prove alone. |
| **P1.7** | `check_in(token, units)` RPC, the staff check-in list per session, attendance on the customer record. | P1.5, P1.6b | A staff member admits 1 of a party of 2, the row reads 1; admits the second, it reads 2; a third scan is refused as already used. The refusal comes from the row, not from a read-then-write. |
| **P1.8** | Session reminders in venue-local time through the notifications catalog, guest recipient. en + es. | P1.6b | A class at 18:00 in a non-UTC zone sends its reminder at the right local hour, proven against a seeded row, and running the cron twice sends once. |

Waitlists are **not** in Phase 1. The design note for the Director is in §8.

---

## 6. The exit proof I can reach, and the half I cannot

My brief's exit proof is: *the Posing course sells twelve seats per September session to twelve
different people, **each with a ticket email and a receipt**, and the thirteenth is refused.*

Split honestly:

| Half | Reachable by P1.6b? |
|---|---|
| Twelve seats on one session to twelve different customers | **Yes.** `createPurchase` reserves through `reserve_capacity_batch` today. |
| The thirteenth refused | **Yes.** `sold_out` is already a `PurchaseRefusalReason`. |
| Each with a **ticket email** | **No, not by me alone.** Admissions are minted on `paid`, and per §0.1(3) nothing in the repo moves an order to `paid` or calls `commit_capacity`. |
| Each with a **receipt** | **No.** `/r/<code>` is Front Door F4, which is behind Orders 0.8. |

So the twelve reservations are **holds**, not sales, until the Orders webhook seam exists. I will
not describe a hold as a sale, and I will not report P1.6b as the phase exit. **P1.6b's proof is
twelve committed-or-held allocations against one session pool and a refused thirteenth, measured in
the table.** The email-and-receipt half becomes provable when the paid transition ships, and I will
re-run the whole proof end to end at that point and report it then, as the actual phase exit.

**Director: this is the one thing I would escalate.** The paid seam is a handful of lines inside a
webhook path that already exists, it blocks the phase whose entire purpose is the platform's first
real sale, and it is nobody's current slice — Orders' next item is 0.7 and then 0.6b. I am happy to
write it against Orders' review rather than wait, if they would rather keep their sequence; it is
their file and their call, and I have said so to them directly.

---

## 7. Contracts I publish

| Consumer | Contract | Available after |
|---|---|---|
| **Events & Ticketing** | `admissions` (party size, seat-or-space arm, `admitted_count`), the derived token format, `check_in`. They are currently blocked on exactly this table. | P1.5 / P1.7 |
| **Reservations** | The same `admissions` row with `space_id` set and `session_id` null, `party_size` = covers. One host-stand check-in surface, shared. | P1.5 |
| **Orders & Checkout** | `order_lines.session_id`; `mintAdmissionsForOrder(orderId)` for the pipeline to call on paid. | P1.5 |
| **Front Door** | The `session_picker` line seed shape: `{ offeringId, variantId?, units, sessionId }` plus the pool for the hold. The Sheet reads it, never resolves it. | P1.4 |
| **Capacity** | I create no pools or allocations directly. Every one goes through `upsert_capacity_pool` and `tierReserveRequest`. | — |

**Invariants I hold and will refuse to break:** a tier is a `pool_key`, never a table; every
allocation carries the session's window even when the pool is parentless; a sold session is never
deleted or moved; seats are never written as a raw number onto a live pool.

---

## 8. Waitlists — the design, not built

Recorded for the Director as the brief asks. `session_waitlist(tenant_id, pool_id, customer_id,
units, position, state, notified_at, expires_at)`, ordered by `position` within a pool. An
offer-on-release job hangs off `release_capacity`: when units come back, offer them to the head of
the queue with a short TTL hold and a notification; on expiry, pass to the next. It is cheap
*because* pools exist — the release event is already a real thing with a real timestamp. It is not
Phase 1, and the marketing case study that promises it should not be pointed at until it is.

---

## 9. Open questions — resolved and outstanding

Ruled by the Director on 2026-09-03, all confirmed here rather than remembered from a message:

| # | Question | Ruling |
|---|---|---|
| 1 | Reporting line | **Platform Features Director.** The peer director the board names has no chat. If one opens, the handover is explicit. |
| 2 | Migration band | **`20261229000340`–`…000359`.** Each exact number announced before it is applied. Events take `…360`–`…379`, Reservations `…380`–`…399`. |
| 3 | `service_window` | **Out, and no `kind` column at all** (§2.1). Reservations build windows entirely inside their own area. |
| 4 | No `checked_in` status; `admitted_count` | **Ratified.** Reservations' `booked\|seated\|no_show\|completed\|cancelled` was the same collapse in a different vocabulary; their `seated_at` / `no_show_at` stamps say the same things without it. |
| 5 | `order_lines.session_id` | **Ratified**, in my migration. Orders agreed independently: the link belongs on the many side. `orders.session_id` stays as a commented convenience, explicitly not the binding. |
| 6 | `builder-node/` ownership | **My recommendation ratified.** I own the resolver and the island; the registry wirings go to the Page Builder Director as one small PR against a contract I hand them, routed by the Director. Blocks P1.4 only. |
| 7 | `session_series.timezone` as a deliberate copy | **Approved.** The materialiser refuses rather than defaulting. |
| 8 | The paid seam | **Orders owns it and has moved it ahead of everything for tomorrow.** They escalated to have their own 0.6b-1 held behind it, because re-homing Menu before the seam exists would leave a paid order stuck in `pending_payment` with its capacity hold lapsing under a customer who has paid. |

Still outstanding:

**(a) `admissions.allocation_id`, NOT NULL or nullable** (§2.2). Ruled NOT NULL; contested once with
the uncapped-RSVP case; awaiting a second answer. Not blocking — this is P1.5.

**(b) Two zone resolvers with opposite gap policies, live on main.** Measured on `3d2a8d14d` with
both functions imported side by side:

```
Europe/Madrid 2027-03-28, wall clock 02:30 (the hour that does not exist)
  scheduling/tz.ts     zonedLocalToUtc      -> NULL        (skip)
  sessions/recurrence  zonedWallClockToUtc  -> 03:30 local (next)
Fall-back ambiguity 2027-10-31 02:30: both give 00:30Z. They agree there.
```

Capacity's rule — one resolver, and it is `tz.ts` — is right, and `recurrence.ts:107` does not
follow it yet. **But consolidating on `tz.ts`'s policy would change this area's behaviour in the
wrong direction:** a class on the gap day does happen, so `null` means the occurrence silently does
not exist. No pool, no seat, no error, once a year in every zone that observes DST. For an
appointment *slot* `null` is correct, which is why the two diverged and why neither is wrong.
Proposed to Capacity: one implementation taking `{ gap: "skip" | "next" }`, default `"skip"` so
their existing callers are byte-identical, with the choice named at the call site. Their file;
`materialise.ts` does no zone math of its own.

**(c) Can one class sell under two offerings (member price and drop-in)?** The starter's open
question 1, left deliberately for a product answer. My working position: **the pool is the binding,
not the offering.** Two offerings pointing at one session tier pool draw from one seat count, which
is what a member price needs. That makes neither `sessions.offering_id` nor `offering.capacity_pool_id`
redundant — it makes `sessions.offering_id` mislabelled: it is provenance (which offering created
this series), not the sales route. Per-session pricing stays out of Phase 1 for a pipeline reason
rather than a schema one: `createPurchase` reads `unit_cents` from the offering and variant rows at
step 1, so a price on the session would be a second price source it does not read, which is a
silently wrong charge rather than a missing feature.

## 10. Status

| Slice | State |
|---|---|
| P1.1 | **shipped by Capacity** (#1582), adopted |
| P1.2 | planned, blocked on the band (§9.2) |
| P1.3 – P1.8 | planned |

Worktree `~/Desktop/wt-sessions-classes`, branch `feat/sessions-classes`, off `origin/main`
@ `e3f30bb8c`.
