# Events & Ticketing — plan (Phase 2)

Owner: **Events & Ticketing Manager**. Reports to the **Sessions, Events & Reservations Director**
(the peer director created in the 2026-09-03 evening split; my prompt still names the Platform
Features Director, and the board is the newer record, so I follow the board).

Contract source: "Sell the Room" §04, §05, §05b, §05d, §05f, §09, §10 Phase 2 —
https://claude.ai/code/artifact/871b8720-ae26-4f49-b9a4-c18a45676a99
Designs: the mockups canvas, page **"Tickets and events"** (10 artboards), plus `EventEditor` and
`TicketTier` on page "Admin", `PublicEvent` on page "Customer", and `SettingsEvents` on page
"Calendar and settings" — https://claude.ai/code/artifact/801a67c7-2c74-4304-9b6a-283e28b27b9c

Verified against `origin/main` @ `c5a8ce5a0` on 2026-09-03. **Status: E0 (`admissions`) designed and
sent for review; nothing applied.** My migration band is `20261229000360`–`20261229000379`.

---

## 0. `admissions` is MINE. I was wrong yesterday, and here is the reversal

**Yesterday I wrote that `admissions` belongs to Sessions & Classes and declined to write it.** The CEO
and the Director have both since assigned it to me as my first and only slice until it lands, and they
are right. My reasoning was that Sessions owns the check-in RPC and the token precedent, so the table
should follow the RPC. That inverts the dependency: **Sessions cannot finish P1.4 without this table and
neither can Reservations, so putting it behind either of them blocks two areas to spare one.** Ticketing
is orders plus admissions plus a door; the first two exist, the third is mine, and the table is the
shared floor all three stand on. Message already sent to Sessions & Classes retracting my §2 position.

**Neither reporting line nor shape was taken on a peer's say-so.** Both peers explicitly told me not to,
and one of them flagged that their own session does not resolve under the title they were told to use.
Everything below is verified against `origin/main` @ `c5a8ce5a0`.

### The board's shape, and the one place my brief is stale

I was handed "`allocation_id` **NOT NULL**, `session_id` and `space_id` nullable and descriptive". **That
is superseded**, and I did not have to trust anybody to find out: `origin/main`'s board carries **both**
rulings, the original at line 498 and the overturn at line 567, landed by #1609 at `ffdc19e4c`.

> `allocation_id` is NULLABLE on `admissions`, with
> `CHECK (num_nonnulls(allocation_id, session_id, space_id, order_line_id) >= 1)`.
> The phrase that carried the error was "every admission has an allocation *by construction*".

The counterexample is a case **Events owns**: an uncapped RSVP. Verified two ways rather than one, since
a comment can drift from its column — `20261229000210:58` says "NULL = unlimited", and the column is in
fact nullable. No pool means nothing can refuse, so there is no allocation to point at, and a `NOT NULL`
would have been satisfied by a placeholder allocation against a dummy pool: the repair that makes the
column lie instead of the constraint hold.

*(For the record, because it is the exact error class this department warns about: the Director told me
this correction was still unmerged in #1608. It is on `origin/main`. I checked rather than relayed.)*

---

## 1. What I verified, and the seven places the brief, the mockups or the copy disagree with the code

Every row here was read on `origin/main`, not inferred.

### V-1 · A tier's pool CANNOT live on the variant, and the mockups imply it can

`20261229000210_offering_stock_pools.sql:47` added `capacity_pool_id` and `consumes_units` to
`talent_offering_variants`. It is tempting to conclude "a tier is a variant, so point the variant at
its pool and you are done." That is wrong for events and right for everything else.

**A variant is one row. An event with a series has one pool per tier PER SESSION.** "General
admission" for `Domingo Acústico` is twelve pools, one per Sunday, and one column holds one uuid.

The binding is therefore **resolved, never stored**: `subject_kind='session_tier'`,
`subject_id = session.id`, `pool_key = the tier's slug`. That is exactly the shape
`web/src/lib/sessions/tier-pools.ts` already builds and the board already ruled on
("a tier is not a table"). *That file is the **Capacity Engine Manager's**, from P1.1 (#1582) — Sessions
adopted it rather than writing it, and corrected my attribution.* For an event tier, `variants.capacity_pool_id` stays **NULL** and must
stay NULL, because a non-null value would be a second, stale source of truth for a fact that is
per-session.

**The one thing a variant genuinely lacks is a stable `pool_key`.** `talent_offering_variants` is
`label + amount_cents + sort_order` (`20260709051219:10`). A pool key derived from `label` breaks the
day someone renames "GA" to "General admission" — every existing pool orphans and the sold seats
detach from the tier. This is the single shared-table change I need. See §5.

### V-2 · The mockups sell a split platform fee that the money rail does not have

`TicketsTab`, `EventSettingsTab` and `SettingsEvents` all carry **"Buyer pays 3%, you 3%"** as a
setting. The shipped rail is one 6% commission on the seller side through the pure resolver, and the
marketing FAQ commits to the opposite of a split in writing:

> the same platform fee as other booked work rather than a separate ticketing rate
> — `feature-ticketing.ts`, FAQ 2, en and es

A buyer-paid fee is not a toggle. It is a new order line whose payee is the platform, a new input to
the commission snapshot, a change to what "gross" means on every ticketing report, and a receipt
line a buyer can dispute. It also lands on a snapshot path that the Finance audit still lists a P0
against.

**My recommendation: v1 ships the existing single-sided fee**, the price on the page is the price
paid, and the fee control is cut from the Settings screens rather than rendered inert. Whether
Tulala ever passes fees to buyers is a Commerce + Finance decision and an owner one, not mine — I
raise it and build the honest version meanwhile.

### V-3 · `product_discounts.code` is globally UNIQUE, and copying it would be a bug

`20260527213552_product_pricing_dashboard.sql:133` — `code text NOT NULL UNIQUE`. Correct for a
platform SaaS coupon; catastrophic for a tenant code, because the first venue to create `SALSA10`
takes it from every other venue on the platform, and the failure appears as an unexplained "code
already exists" in someone else's workspace.

Tenant promo codes are unique on `(tenant_id, upper(code))`. This repo has a recorded incident named
`incident_copying_the_sibling_pattern_preserved_the_bug` for exactly this move, so it is worth the
sentence.

### V-4 · Doors time does not exist anywhere

Every artboard distinguishes doors from show time (`DOORS 21:00`, `21:00 to 03:00`). `sessions`
(`20261229000214`) has `starts_at` and `ends_at` and nothing else.

I propose **`events.doors_offset_minutes`** rather than a `doors_at` column on `sessions`.
Reasons: doors is a property of how the event is run, not of an occurrence; an offset is right for
a series without a per-row edit; and `sessions` is another manager's table. If a one-off session
ever needs its own doors time, that is a later column on `sessions` and their call to make.

### V-5 · Layouts and seat maps are behind me, not in front of me

`layouts` and `layout_spaces` are Spaces **S4**, wave **E** — after Events. Spaces' own plan says
S4–S6 are "a clean stop, on purpose". So:

- `CreateEvent` step 3 ("pick the venue and a layout") ships as **venue only** in Phase 2.
- `SeatMapDesigner` and `PublicSeatPicker` **cannot be built in Phase 2** and are not in this plan.
  The `TicketsTab` row "Section A seated · choose your seat · Seat map" is deferred with them.
- `events.layout_id` ships **nullable and unread**, so S4 can populate it without a migration from me.

**What survives is the part that matters commercially.** Spaces S2 shipped `spaces` and
`space_groups` with band-mode pools. So "VIP table for 6 · Table group: VIP" — the mockups' second
tier and the higher-margin one — **is buildable in Phase 2**: the tier binds to the group's pool for
the session's window. Only the floor plan waits. I checked the Spaces handoff first, as instructed:
a parentless band pool is deliberate, and **SS-2 is the caller's invariant** — I must never activate
a group pool and its member table pools at the same time.

### V-6 · A `door` role added to `agency_memberships` grants the whole workspace

`is_staff_of_tenant` (`20260602100000_saas_p2_tenant_helpers.sql:42`) asks only whether an **active
membership row exists**. It never reads `role`. Every RLS policy on every tenantised table is built
on it. The role CHECK (`20260625120000:63`) is a one-line edit.

So adding `'door'` to that CHECK is trivial and is the **opposite** of "sees only that mode": the
door person would pass RLS on clients, orders, revenue and messages. The brief's phrase "a 'door'
membership role that sees only that mode" is not one line; it is a role-aware authorisation layer
that does not exist.

**v1, honestly:** the door is a **`SECURITY DEFINER` `check_in(token)` RPC plus a scoped door-list
read**, gated in the app layer on a per-event door grant, and **no new membership role**. Nobody
gains RLS they did not have. When a role-aware helper exists (`has_tenant_role(tenant, role)`), the
door role becomes real and the app gate becomes redundant. Flagged to the Director as a departure
from my brief, with the reason.

### V-7 · `/events` will 404 despite existing

`web/src/lib/saas/surface-allow-list.ts` 404s any path not on its per-host-kind list, before Next
routing. A single top segment also needs reserving in **both** `WORKSPACE_SLUG_RESERVED_PREFIXES`
and `PATH_BASED_TENANT_RESERVED_PREFIXES`, or a tenant whose slug is `events` shadows the engine.
Four registrations, and the board notes that file is at its 800-line lint cap with **zero headroom**
— so my PR that adds `/events` may have to trim it, not grow it (`feedback_trim_dont_raise_budgets`).

### Verified as stated in the brief, no correction

| Claim | Evidence |
|---|---|
| Tiers are catalog variants | `talent_offering_variants` exists since `20260709051219` |
| `orders`, `order_lines`, `customers` shipped | `…140`, `…142`; `orders.discount_cents` already present at `:59` |
| Sessions and pools shipped | `20261229000214`; `session_tier` registered in `capacity_subject_kinds` |
| Spaces groups shipped | `20261229000221`, `…222`, `…223` |
| Refunds exist | Finance's `refund-execute.ts` calls `stripe.refunds.create`; Orders 0.8b layers refund-by-line above it |
| Payout hold exists | `booking_payouts` status `held` + `releaseHeldPayouts` |
| No tenant discount object anywhere | only the platform `product_discounts` store |
| `inquiries` has no `event_id` | grep, none |

---

## 2. The architecture, in one page

**An event owns nothing that already exists.**

```
events            title, status, policies, page, admission_kind, doors offset, venue
  └─ sessions            (Sessions & Classes — one row per occurrence)
       └─ capacity pool  (Capacity — subject_kind='session_tier', pool_key=tier slug)
  └─ one event offering  (Catalog — talent_offerings)
       └─ tiers          (Catalog — talent_offering_variants + a pool_key)
  └─ lineup              (Inquiry spine — inquiries.event_id, venue is the client)
  └─ page                (Page Builder — event_list, event_hero, ticket_picker)

buying          Orders createPurchase  →  order_lines  →  capacity_allocations
                                       →  admissions (one per unit, Sessions' table)
receipt         Front Door  /r/<code>  — one QR per admission
door            check_in(token)        — Sessions' RPC
```

Three rules I will not break, and will say so in every PR body:

1. **No orchestrator.** Tickets go through `lib/orders/purchase.ts`. If I find myself writing a
   fourth purchase pipeline I stop and message the Director.
2. **Two money flows on one event are two orders.** Tickets in (venue is seller, house lane) and the
   performer's fee out (venue is client, talent lane) never net. The `LineupTab` artboard says this
   in the product's own words: "ticket money and performer fees never mix."
3. **I never define a table or a seat.** I select a Spaces object.

**`admission_kind` is a word, not a schema.** `ticket | pass | registration | rsvp` selects the noun
from the words table (§05f) and, for `rsvp`, nothing more than a zero-price tier. A free conference
registration and a $600 VIP table are the same three rows with different numbers.

---

## 3. DDL

Band `20261229000360`–`20261229000379`. **Numbers are claimed on the board through the Director
before any apply**, and the object is verified in production afterwards, because `db:check` gives a
false green on a collision.

### E0 — `20261229000360_admissions.sql`  ·  the only thing that matters until it lands

Sessions & Classes and Reservations both compose on this table, so it is agreed with them through the
Director before it is written. The board's shape is adopted, not redesigned. **Two additions, one
refusal, and one thing I checked and left alone.**

```sql
CREATE TABLE public.admissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- ON DELETE SET NULL on every one of these, for the reason orders.inquiry_id
  -- has it: losing the thing that produced the record must never destroy the
  -- record that someone was admitted.
  allocation_id  uuid REFERENCES public.capacity_allocations(id) ON DELETE SET NULL,
  order_line_id  uuid REFERENCES public.order_lines(id)          ON DELETE SET NULL,
  session_id     uuid REFERENCES public.sessions(id)             ON DELETE SET NULL,
  space_id       uuid REFERENCES public.spaces(id)               ON DELETE SET NULL,
  -- WHO THE ADMISSION IS FOR, ratified by Sessions & Classes. The BUYER is
  -- orders.customer_id and is never conflated with this: six seats bought by one
  -- person are six admissions, six holders, one order, one buyer.
  customer_id    uuid REFERENCES public.customers(id)            ON DELETE SET NULL,
  holder_name    text,
  holder_email   citext,
  starts_at      timestamptz,          -- the host stand's whole query is today's book by time

  status         text NOT NULL DEFAULT 'valid'
                   CHECK (status IN ('valid','void','refunded')),

  -- The denominator, and the only count the door asks for. I proposed a second
  -- column here and was refuted; see below.
  party_size     int NOT NULL DEFAULT 1 CHECK (party_size > 0),
  admitted_count int NOT NULL DEFAULT 0,
  CONSTRAINT admissions_admitted_within_party CHECK (admitted_count BETWEEN 0 AND party_size),

  -- ADDITION 2. In the HMAC input, so a re-issue kills every prior QR without
  -- voiding the row. Not a credential: a counter.
  token_version  smallint NOT NULL DEFAULT 1 CHECK (token_version > 0),

  seated_at      timestamptz,
  no_show_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- The board's guard, kept exactly as ruled. The five legitimate cases are
  -- enumerated below and pinned by a test, so a sixth is a visible edit rather
  -- than a silent widening.
  CONSTRAINT admissions_anchored
    CHECK (num_nonnulls(allocation_id, session_id, space_id, order_line_id) >= 1)
);
```

| Case | allocation | session | space | order_line |
|---|---|---|---|---|
| Class seat or ticket, capped | yes | yes | — | yes |
| Comp or guest list on a capped session | yes | yes | — | **no** |
| Uncapped RSVP or free registration | **no** | yes | — | yes |
| Band reservation before the host seats it | yes | — | **no** | yes |
| Walk-in against the same pool | yes | — | later | **no** |

**ADDITION 1 WITHDRAWN — I proposed `units` alongside `party_size` and was wrong, and the counterexample
is in my own area.** Sessions & Classes refuted it: `party_size` already *is* the denominator, because a
ticket line for four is four admissions of one each and a table for four is one admission of four. My
"0 of 4 on a single GA ticket" only happens if a GA ticket is minted with `party_size = 4`, which is a
misuse rather than a schema defect.

Looking for the row where the two counts must differ, I found one that **kills my own column**: a
**VIP table for 6** is one allocation of **1** unit — one table out of the VIP group — admitting **6**
people. With both columns, `units` is 1 and `CHECK (admitted_count <= units)` caps a six-person table at
one guest through the door. The column I argued for would have broken this feature's headline tier.

Their general argument is the one to keep: two counts that are equal in every case anyone can name and
differ in **grain** when they diverge, under names that do not say so, is the exact shape of the
`unit_price` / `talent_cost` commission P0 fixed two days ago. **One count, named for the question the
door actually asks.**

**What survives is the risk, not the column.** Nothing forces the minting helper to pick the right row
count, and "one admission of four" versus "four admissions of one" is a decision someone will get wrong
silently. That gets the `tier-pools.ts` treatment in E5: `lib/events/mint-admissions.ts` takes the
allocation, how many rows, and what each admits, so the wrong shape cannot be constructed rather than
merely being documented.

**ADDITION 2 — `token_version`, because a derived token cannot be rotated.** No `qr_token` column is
right, and I am not arguing with it: a stored token is a credential at rest in a table a door role
reads, and the HMAC precedent (`guest-unsubscribe-token.ts`) is the correct one. But the board's
revocation answer — `status='void'` — revokes the **admission**, not the **token**, and those are
different needs. A buyer who forwards the wrong email, or transfers a ticket, needs the old QR dead and
a new one live **for the same seat**. Voiding and re-minting detaches the row from its allocation and
loses the sold history. One int in the HMAC input costs nothing and makes re-issue possible without
storing anything secret.

**THE REFUSAL — I considered a stronger guard and am not proposing it.** Reading down the table,
`session_id IS NOT NULL OR allocation_id IS NOT NULL` holds on all five cases and is strictly stronger
than `>= 1` across four columns, which `order_line_id` alone satisfies for essentially every purchase.
I am not proposing it anyway. An uncapped walk-in to a venue with no session is a sixth case I cannot
rule out, and **this exact table has already had a strong guard refuse a real case twice** — first the
`session_id OR space_id` check that refused every band reservation, then the `NOT NULL` that refused the
uncapped RSVP. A third tightening from the manager who has been here one day is the wrong bet. The
enumeration plus the test is the better mechanism: it makes widening visible without making it hard.

**WHAT I CHECKED AND LEFT ALONE.** `status` carrying `'refunded'` looks like a second source of truth
for a fact `order_lines` owns. I am keeping it, because the door needs a one-row read and the
`DoorScanner` artboard has to say *"Refunded or wrong night · shows red with the reason"*. **The
condition is that refund-by-line is the only writer** — if anything else can refund without stamping
here, the door lets in a refunded ticket and nothing detects the disagreement. That belongs in Orders
0.8b's contract, and I will raise it there.

**And one thing the reaper made safe:** `reap_capacity_allocations` **UPDATEs** to `state='released'`
and never deletes (`20261229000200:229`), so `allocation_id` never dangles from a reap. The FK is
`ON DELETE SET NULL` regardless, because `capacity_allocations.pool_id` cascades from `capacity_pools`
and a pool delete must not take the ticket record with it.

**DELETING AN EVENT MUST NOT PUBLISH ITS SESSIONS. Found by Sessions & Classes, in my column, and
I verified the predicate myself before accepting it.** `20261229000214:160` grants `anon` a
`SELECT` on `sessions USING (status = 'scheduled')`, and the public `session_picker` reads exactly
that. So `sessions.event_id ON DELETE SET NULL` would **silently promote a deleted show's four
nights to standalone public schedule entries** — still listed, still bookable, belonging to nothing.

`ON DELETE CASCADE` is not the fix: it destroys occurrences people bought, against the standing rule
that a sold session is history.

**My ruling, which goes one step further than the one I was offered.** Deleting an event is a
**cancellation**: `status='cancelled'` on its sessions plus deactivating their pools, the same shape
as Capacity deactivating rather than deleting a pool, and for the same reason — the allocations are
what settles a dispute. On top of that, **`DELETE` is permitted only for a `draft` event with zero
admissions.** A published or sold event is never deletable at all. That makes `ON DELETE SET NULL` a
backstop that should never fire, which is the correct job for an FK clause: the behaviour lives in
the delete path where it can be read, not in a clause that has to be *inferred* to mean it. The same
applies to `status='cancelled'` on the event, which must cancel its sessions explicitly — otherwise
cancelling an event leaves its nights on sale, which is the identical bug by a different door.

**Exit proof.** The table exists in production, verified by querying `pg_constraint` and
`information_schema` rather than `to_regclass` — Reservations caught a unique index that needed a
`COALESCE`, because Postgres waves duplicate NULLs through and existence is not shape. Plus a test that
inserts all five enumerated cases successfully and refuses an admission anchored to nothing.

### E1 — `20261229000361_events.sql`

```sql
CREATE TABLE public.events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id           uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  -- Nullable and UNREAD in Phase 2. Spaces S4 (wave E) creates `layouts`; this
  -- column exists now so their migration adds a constraint, not a column.
  layout_id          uuid,
  series_id          uuid REFERENCES public.session_series(id) ON DELETE SET NULL,
  offering_id        uuid REFERENCES public.talent_offerings(id) ON DELETE SET NULL,

  slug               text NOT NULL,
  title              text NOT NULL,
  description        text,
  cover_media_id     uuid,
  page_id            uuid,

  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','published','cancelled')),
  admission_kind     text NOT NULL DEFAULT 'ticket'
                       CHECK (admission_kind IN ('ticket','pass','registration','rsvp')),

  -- Doors, as an offset, per V-4.
  doors_offset_minutes int NOT NULL DEFAULT 0 CHECK (doors_offset_minutes >= 0),

  -- Policies. NULL means "inherit the workspace default", which is why these are
  -- nullable rather than defaulted: an absent value is not a value. (Three
  -- managers reached this rule independently this week; it is the house rule now.)
  age_gate           int CHECK (age_gate IS NULL OR age_gate BETWEEN 1 AND 99),
  refund_cutoff_hours int CHECK (refund_cutoff_hours IS NULL OR refund_cutoff_hours >= 0),
  payout_release_rule text NOT NULL DEFAULT 'on_session_end'
                       CHECK (payout_release_rule IN ('immediate','on_fulfilment','on_session_end')),

  published_at       timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_published_stamp   CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT events_cancelled_stamp   CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE UNIQUE INDEX events_tenant_slug_uniq ON public.events (tenant_id, lower(slug));
CREATE INDEX events_tenant_status_idx ON public.events (tenant_id, status);

-- An event's occurrences are Sessions' rows. One column, on their table, added by
-- ME with their agreement — see §5. Nullable: a class series is not an event.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS event_id uuid
  REFERENCES public.events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sessions_event_idx ON public.sessions (event_id, starts_at)
  WHERE event_id IS NOT NULL;
```

`refund_cutoff_hours`, not "days before session" as my brief words it. The mockups say **48h** in
four places and a venue cancelling at noon for a 9pm show is an hours-shaped question. Days is a
lossy unit for something that happens after dinner.

### E2 — `20261229000362_event_tiers_on_variants.sql`  ·  **shared table, needs a go**

```sql
ALTER TABLE public.talent_offering_variants
  ADD COLUMN IF NOT EXISTS pool_key    text,
  ADD COLUMN IF NOT EXISTS sales_from  timestamptz,
  ADD COLUMN IF NOT EXISTS sales_until timestamptz,
  ADD COLUMN IF NOT EXISTS min_per_order int NOT NULL DEFAULT 1 CHECK (min_per_order >= 1),
  ADD COLUMN IF NOT EXISTS max_per_order int CHECK (max_per_order IS NULL OR max_per_order >= 1),
  ADD COLUMN IF NOT EXISTS is_hidden   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS age_gate    int,
  ADD COLUMN IF NOT EXISTS description text,
  -- 'standing' | 'space_group'. 'seat_map' is deliberately absent until Spaces S5.
  ADD COLUMN IF NOT EXISTS seating_mode text
        CHECK (seating_mode IS NULL OR seating_mode IN ('standing','space_group')),
  ADD COLUMN IF NOT EXISTS space_group_id uuid REFERENCES public.space_groups(id) ON DELETE SET NULL;

-- The slug is immutable per offering and survives a rename. This is the whole
-- point of V-1: rename the label freely, never the key.
CREATE UNIQUE INDEX IF NOT EXISTS offering_variants_pool_key_uniq
  ON public.talent_offering_variants (offering_id, pool_key) WHERE pool_key IS NOT NULL;

ALTER TABLE public.talent_offering_variants
  ADD CONSTRAINT variant_sales_window CHECK (sales_until IS NULL OR sales_from IS NULL
                                             OR sales_until > sales_from),
  ADD CONSTRAINT variant_order_bounds CHECK (max_per_order IS NULL OR max_per_order >= min_per_order);
```

Every column is nullable or defaulted. Nothing existing changes shape or meaning. A variant that is
not an event tier carries nine NULLs and behaves exactly as it does today.

### E3 — `20261229000363_tenant_promo_codes.sql`  ·  **shared concept, needs a go**

```sql
CREATE TABLE public.tenant_promo_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  code             text NOT NULL CHECK (char_length(code) BETWEEN 2 AND 40),
  label            text,
  kind             text NOT NULL CHECK (kind IN ('percent','fixed')),
  -- percent: 1..100. fixed: integer cents. One column, two units, one CHECK that
  -- says so, because a numeric percent and a numeric amount in one column with no
  -- constraint is how a 10% discount becomes ten cents.
  value            bigint NOT NULL CHECK (value > 0),
  CONSTRAINT promo_percent_range CHECK (kind <> 'percent' OR value BETWEEN 1 AND 100),
  currency         text CHECK (currency IS NULL OR char_length(currency) = 3),
  CONSTRAINT promo_fixed_currency CHECK (kind <> 'fixed' OR currency IS NOT NULL),

  -- Scope. NULL event = the whole workspace. NULL variant = every tier.
  event_id         uuid REFERENCES public.events(id) ON DELETE CASCADE,
  variant_id       uuid REFERENCES public.talent_offering_variants(id) ON DELETE CASCADE,

  max_redemptions  int CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_customer_limit int NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
  starts_at        timestamptz,
  ends_at          timestamptz,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- V-3. Per tenant, case-insensitive. NOT globally unique.
CREATE UNIQUE INDEX tenant_promo_codes_uniq ON public.tenant_promo_codes (tenant_id, upper(code));

-- Redemptions are counted by ROWS, never by a counter column on the code.
-- `product_discounts.redemption_count` is a denormalised int that nothing locks;
-- two simultaneous checkouts on the last comp both read 19 and both write 20.
CREATE TABLE public.tenant_promo_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.tenant_promo_codes(id) ON DELETE CASCADE,
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  amount_cents  bigint NOT NULL CHECK (amount_cents >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tenant_promo_redemption_per_order ON public.tenant_promo_redemptions (order_id);
```

The discount lands in `orders.discount_cents`, which already exists (`…142:59`) and is already inside
the shipped `total_cents = subtotal - discount + tax` CHECK. **No money arithmetic changes.**

### E4 — `20261229000364_inquiries_event_id.sql`  ·  **the spine, needs a go**

```sql
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS event_id uuid
  REFERENCES public.events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inquiries_event_idx ON public.inquiries (event_id) WHERE event_id IS NOT NULL;
```

One nullable column on the busiest table on the platform. It is the entire lineup feature, and it is
the "book the DJ and sell the night from one page" hinge in §09.

---

## 4. PR sequence and exit proofs

Gates on every PR, real exit codes: `bash web/scripts/tsc-queue.sh` from the worktree's `web/`,
`npm run lint`, every curated lane naming a test I touched, and `test:size-ratchet`. New test files
join a lane in the same PR, resolved by **taking main's line and re-appending only mine**, then
proving the count by running the lane, and checking `.github/workflows/ci.yml` for the second half
of the same conflict.

### E0 first, then these three need nothing further from Sessions

| PR | Delivers | Migration | Exit proof |
|---|---|---|---|
| **E0** | **`admissions`** — the table Sessions P1.4 and Reservations both wait on. Nothing else in my area starts until it lands. | `…360` | All five enumerated anchor cases insert; an admission anchored to nothing is refused; `admitted_count` cannot exceed `units`. Verified in production by `pg_constraint` + `information_schema`, not `to_regclass`. |
| **E1** | `events`, `sessions.event_id`, RLS, `lib/events/` pure library: slug, status transitions, doors resolution against the venue timezone, the refund-amount calculator. No UI. | `…361` | A published event resolves doors at 20:30 America/Cancun for a 21:00 show **across a DST boundary**, and the refund calculator returns full / none / refused on both sides of a 48h cutoff, in a unit table. Object verified present in production by query, not by the green line. |
| **E2** | Tiers on variants (V-1). `lib/events/tiers.ts` builds pool requests through Sessions' `tierReserveRequest`, so a tier request cannot be constructed without the session window. | `…362` | A three-tier event on a twelve-session series resolves **36 distinct pools** and zero `variants.capacity_pool_id` writes. A tier renamed from "GA" to "General admission" keeps its pool and its 88 sold seats. |
| **E3** | The Events admin page: list, `CreateEvent`, `EventEditor` Details, `SessionsTab`, `TicketsTab` tiers table, `TicketTier` panel. Reads and writes schema only. | none | **Clicked by me on localhost**, screenshots in the PR: create a one-night event, add GA and a VIP tier, see 300 and 6 as remaining before anything sells. |

### Behind `admissions` (Sessions P1.4/P1.5)

| PR | Delivers | Migration | Exit proof |
|---|---|---|---|
| **E4** | Public: `event_list`, `event_hero`, `ticket_picker` blocks following the `menu_board` pattern; `/events` and `/events/<slug>` with **all four registrations** (V-7); the conference and festival designs' dead `/tickets`, `/passes`, `/lineup`, `/schedule`, `/program`, `/venue` made real. | none | A signed-out visitor sees real remaining seats and a sold-out tier on a published event, on localhost, screenshotted. The F1a dead-href tripwire passes with those six routes live. |
| **E5** | Guest ticket purchase through `createPurchase` with a **ten-minute** hold; admissions minted on paid lines; **a web receipt carrying one QR per admission, which is NOT deferrable** — the QR must live somewhere a buyer can open on a phone at the door. **The paid seam is NOT a blocker; `/r` ownership IS a live dependency — see below.** | none | **Two guests with no account buy GA and VIP for the same night; the pools go to zero and the next buyer is refused.** One receipt, three QRs, three admission rows. |
| **E6** | Tenant promo codes: the object, the order-time application, the `TicketsTab` manager. Comps are a 100% code on a hidden tier. | `…363` | `SALSA10` takes $3 off a $30 ticket, `orders.discount_cents` is 300, and the **same code created by a second tenant does not collide** (V-3). A 20-comp code refuses the 21st under concurrency. |
| **E7** | Payout held to session end: the `on_session_end` rule on `booking_payouts`, released by the existing `releaseHeldPayouts`. | none | A ticket order paid today shows `held`; after the session's `ends_at` passes, the release path moves it. Proven against a real session window, not a mocked clock. |
| **E8** | **PHASE 2 EXIT ITEM, not a tail-ender — the owner named it.** The door: `/door/<event>` staff PWA, `check_in(token)`, cached already-scanned list, walk-up look-up by name, **walk-up sales at the door in card AND cash**, and the end-of-night report (sold, scanned, not scanned, door sales split cash vs card). **No new membership role** (V-6). | none | **I scan a real QR on a phone**: valid goes green, the same QR again goes red as already scanned, a refunded ticket goes red with the reason. Screenshots. |
| **E9** | Lineup: `inquiries.event_id`, "book talent for this event", the `LineupTab`, cross-listing on the performer's page and Discover as upcoming. | `…364` | A performer booked through the spine appears on the event page and the event appears on their public page; the two orders (tickets in, fee out) are separate rows with separate snapshots. |
| **E10** | `SalesTab`: sold, remaining, revenue, channel. Bulk refund on cancellation as a batch over orders (needs Orders 0.8b). | none | Cancelling an event refunds every order by policy in one batch and emails every buyer; **one real refund exercised**, per the Phase 2 exit. |

**THE DOOR RE-RANK, AND THE CASH RULING (owner, via the CEO, 2026-09-03).** Tickets get a receipt, a
QR and a PDF; anyone with a phone can scan them; entries are registered; and day-of sales happen at the
door by card **or cash**. Absorbed as a re-ranking plus two additions, not a redesign:

- **E8 becomes a Phase 2 exit item.** It is the feature that makes an event real on the night.
- **Walk-up sales move INTO E8 and are no longer "additive".** Card at the door is not a new money path
  — it is the existing checkout on the door staff's phone, and it earns normally.
- **A cash door sale records the admission and takes ZERO commission.** We never touch the money, so
  there is nothing to take a fee from, and invoicing a venue afterwards for 6% of cash we never saw is
  a collections problem we lose and a relationship we poison. The UI says so plainly. The evasion risk
  (marking card as cash) is an accepted, watched number after launch, not a thing to design against
  with zero paying customers.
- **The end-of-night report** — sold, scanned, not scanned, door sales split cash versus card — is the
  artifact a venue owner asks for the next morning. In E8, since it is the same screen's data.

**THE CASH SALE IS REPRESENTABLE ONLY BECAUSE THE ANCHOR GUARD STAYED WEAK.** A cash walk-up is an
admission with a session and an allocation and **no `order_line_id`**, because no order exists. That is
case 5 of the five enumerated in `20261229000360`. Had the guard been tightened to require an order
line — which is the obvious shape if you assume every admission was bought — the owner's cash sale
would have been unrepresentable, and it would have been discovered at a door on a Saturday night.
**Third time a strong guard on that table would have refused a real case, and the first time it was
caught before rather than after.** It still consumes capacity: `capacity_allocations.order_line_id` is
nullable, so a door sale holds a seat without an order and the venue cannot oversell.

**THE ONE THING IN THE RULING THAT IS NOT MINE TO ABSORB: `/r` IS FRONT DOOR'S F4, AND F4 IS BEHIND
ORDERS 0.8.** "The web receipt is not deferrable" is right — a QR with nowhere to live is not a ticket
— but it makes my E5 exit proof depend on another department's slice that has its own blocker. Raised
rather than absorbed. Two ways out, and it is the Director's call, not mine: sequence F4 ahead of the
rest of Front Door's queue, or I render the admission QRs on a minimal view I own and Front Door
replaces it when F4 lands. **I recommend the second**: it is smaller, it makes nobody wait, and a
receipt that shows a QR and is later upgraded is strictly better than a ticket with no page.

**E7 CANNOT BE BUILT AS MY BRIEF DESCRIBES IT, and the reason is a live hazard rather than a wording
quibble.** The brief says "reuse `booking_payouts` status `'held'` and `releaseHeldPayouts`; add the
`on_session_end` rule". Verified against `origin/main` and the production schema:

- **`booking_payouts` has NO time column at all.** Its columns are id, booking_id, transaction_id,
  participant_id, party, owning_party_type, owning_party_id, talent_profile_id, tenant_id,
  destination_account_id, amount_cents, currency, status, stripe_transfer_id, attempts, last_error,
  created_at, updated_at, transferred_at, payout_rail. No `release_after`, no `hold_reason`, no
  `order_id`.
- **`releaseHeldPayouts` is payee-scoped with no time gate.** `booking-payouts-ledger.ts:225` selects
  `.in("status", ["held","failed"])` plus payee filters, and it is called when an account flips
  payouts-enabled and by the reconcile cron.

**So marking a ticket payout `held` and waiting does the opposite of what it looks like.** The moment
the venue's Connect account flips enabled — or the next reconcile runs — **every ticket payout releases
early, before the show**, which defeats the entire chargeback-safe purpose of holding it. Nothing would
error. The money would simply leave sooner than intended and nobody would look.

**And it is `one label, three states` again.** `'held'` already means *the payee's account cannot
receive money yet*. "The show has not happened yet" is a different fact with a different resolution
(time, not an account flip). One status carrying both is the recorded incident, and here the collision
is not cosmetic: the two states have opposite correct behaviours on the same trigger.

**What E7 actually needs:** `booking_payouts.release_after timestamptz` (nullable; NULL means due now,
so every existing leg is unaffected) and one clause in the release query — `release_after IS NULL OR
release_after <= now()`. Small, but **both the column and the query are Finance's**, so it is a
cross-department ask routed through the Director rather than something I write.

**E8 CONTRACT, agreed with Reservations before a line is written.**

```
check_in(token)                        -- door: the buyer's QR
check_in(actor, admission_id, count?)  -- host stand: tapping Seat beside a name
```

`count` defaults to **the remainder** (`party_size - admitted_count`), which unifies the two modes
rather than special-casing them: a single ticket admits 1 because its remainder is 1, a VIP table for 6
scanned once admits 6, and a host seating two of a four-top passes `2`. Without the count argument a
four-top is four calls and four row-lock round trips at the busiest moment of the night.

**THE DEFAULT HAS A TRAP AND IT IS THE WHOLE REASON THE RETURN TYPE MATTERS.** On a second scan the
remainder is 0, so a naive implementation admits zero units and **succeeds** — and the door shows green
for a ticket that has already walked in. That is this repo's recorded *a function that answers instead
of refusing*, arriving through the convenience default. So `check_in` **refuses** when the remainder is
zero rather than admitting nothing, and returns a discriminated result:

```
{ ok: true,  admitted: n, remaining: m }
{ ok: false, reason: 'already_admitted' | 'not_valid' | 'unknown_token' | 'exceeds_party' }
```

`not_valid` carries the `status` so a refunded ticket goes red **with the reason** rather than as a
generic failure, which is what the `DoorScanner` artboard shows and what stops an argument at the door.

**The host stand's six states are DERIVED from columns that already exist — no new ones.** Reservations'
table: `no_show_at` set is No-show; `completed_at` set is Completed; `admitted_count = party_size` is
Seated; `0 < admitted_count < party_size` is **Part seated** (2 of 4); past `starts_at + grace` with a
zero count is Late; otherwise Booked. **Nothing derives from `status`** — `valid`/`void`/`refunded` is
commercial and renders as a separate badge, because "seated, then refunded" is a real sentence that one
label could not say.

**"Part seated" is a fourth independent justification for `party_size`**, after the VIP-table case, the
grain argument, and the two covers numbers (`sum(admitted_count)` is arrivals, `sum(party_size)` is
booked, and one column would have made one of Reservations' two screens wrong).

**A boundary, so I do not build it: creating a walk-in is Reservations', not mine.** A walk-in has no
admission row until the host makes one — an allocation with a null order line — and then calls my
function on it. **E8 admits people to rows that exist**; it does not grow a create-a-walk-in mode.

**`check_in` DOES NOT EXIST, AND WHEN I BUILD IT IT NEEDS TWO ENTRY MODES, NOT ONE.** I told the
Reservations Manager that "`check_in(token)` works on a table already". It does not: I queried `pg_proc`
after they challenged it and the only matching function in `public` is `admissions_touch`. My own error,
of exactly the class I spent the evening catching in other people — an inherited plan line repeated as a
statement about main. Sessions' plan lists it at P1.5 and it has not been written.

**The signature must not be token-only, and Reservations found the reason before a line was written.**
A diner scans nothing. The host taps *Seat* beside a name, and for a walk-in there is **no booking, no
receipt and no token in existence**. A token-only `check_in` leaves them minting a token nobody will
ever scan, or writing `admitted_count` directly and becoming a second implementation of the invariant.
So: **one function, two ways in** — a signed token for the door, and an actor plus an admission id for a
host looking at the person. Same row, same arithmetic, same `<= party_size` bound, one enforcement site.

**And the door and the host stand are one surface with two entry modes, not two surfaces.** They are the
same question asked twice — *has this person arrived, and how many of them* — and the differences are
cosmetic: I scan and show a tier, they tap and show a table. Agreed with Reservations that I shape E8
for both now rather than retrofit, and that they consume it rather than mirror it.

**A CORRECTION TO MY OWN PROSE, WHICH THE SCHEMA HAD RIGHT.** I described their walk-in as having
"session or space set". It has **neither**: only an allocation. No order line (nothing was bought), no
space (unassigned is valid until the host seats them), and **no session — a service window is not a
`sessions` row** in their area at all. The migration's enumerated case 5 already says exactly this
(`allocation yes, session -, space later, order_line NO`); only my message was sloppy.

**Which produces a seventh case I did not know about when I refused to tighten the guard.** Had anyone
required a **session** for a timed admission — an entirely reasonable-sounding constraint — **every
restaurant reservation on the platform would have been unrepresentable.** I held the line on a sixth
case nobody could name; there were at least two.

**`/r` IS UNREGISTERED AND WILL 404. Confirmed on `origin/main`, with two corrections to how I was
told it.** `surface-allow-list.ts:391` has `CANONICAL_LINK_PREFIX = "/q"` and `:736` gates it; **there
is no `/r` anywhere.** So the receipt page would exist on disk and serve an HTML 404 from a working
handler, which reads as a routing bug and is not one.

- **The prefix collision I was warned about does not exist.** `hasPrefix` (`:695`) is
  `pathname === prefix || pathname.startsWith(prefix + "/")`, so `/r` cannot shadow `/review` or
  `/register`: neither equals `/r` nor starts with `/r/`. Segment-safe by construction. Checked rather
  than assumed, because designing around an imaginary collision would have cost a worse path than `/r`.
- **`reserved-routes.ts` does not exist.** Both reserved lists live inside `surface-allow-list.ts`
  (`:404` and `:427`), and `PATH_BASED_TENANT_RESERVED_PREFIXES` spreads
  `WORKSPACE_SLUG_RESERVED_PREFIXES`, so **one Set entry satisfies both**. They are keyed on the tenant
  slug (`:480` is `.has(tenantSlug)`), so the entry is `"r"`, not `"/r"`. Four registrations, three
  edits, one file.

**BUILD THE INTERIM RECEIPT AT THE FINAL PATH `/r/<code>`, NOT A TEMPORARY ONE.** Approved to build it
myself rather than wait on Front Door's F4, on this condition, and the condition is the whole value:
**a QR is not a link on a page you can update.** It is on someone's phone or on paper. Ship the interim
view at a different path and every ticket issued before F4 points at a dead URL, with no way to reach
those buyers. Same path, swappable view, and F4 becomes a replacement rather than a migration.

**This slice is therefore gated on the `surface-allow-list.ts` decomposition (#1631), not on Orders.**
That file is at exactly its 800-line error ceiling with zero headroom. No appending, and **no
suppression** — the ratchet counts suppressions in aggregate, so working around it reddens main.

**CAMERA SCANNING CANNOT BE SELF-VERIFIED AND GOES ON THE PHASE-BOUNDARY QA LIST.** The condition is a
real iPhone in Safari or the installed PWA, not desktop Chrome with a webcam, and not the simulator:
camera capture is exactly where mobile browsers differ, and the iOS Simulator has no camera. I cannot
produce this evidence myself. It is the owner's click, and I will write the exact steps.

**THE `paid` SEAM EXISTS AND IS WIRED — I was told otherwise and checked.** Sessions & Classes
warned me that "nothing on main moves an order to `paid`" and that `markPaid` touches neither
`orders` nor `commit_capacity`, which would have blocked E5 behind an Orders slice. It is on
`origin/main`: `lib/orders/complete-order.ts:156` writes `status: "paid"` after committing capacity,
and `lib/bookings/transactions.ts:873` calls it **from inside `markPaid`**, under a comment
describing that exact gap as the thing it was written to close. So minting admissions on paid lines
needs the table and nothing else. Relayed dependencies are worth ten minutes of grep.

**Phase 2 exit proof, unchanged from §10:** a workspace publishes an event, sells GA and VIP to
guests without accounts, scans them at the door, books a performer through the spine, is paid the
morning after the show, and one real refund is exercised. E10 is the last brick; E5 and E8 are the
ones that make it a product.

---

## 5. What I need from other owners, through the Director

| # | Ask | Owner | Why it is not mine to decide |
|---|---|---|---|
| **A1** | Nine additive nullable columns + one unique index on `talent_offering_variants` (E2). | Catalog / Menu / Orders | Shared table read by the menu board, the offering editor and offer-line expansion. Additive, but it is theirs. |
| **A2** | `sessions.event_id` (E1). | Sessions & Classes | Their table. One nullable FK. I would rather add it than have them carry my feature's column. |
| **A3** | `inquiries.event_id` (E9). | Orders / the spine's owner | The busiest table on the platform. |
| ~~A3b~~ | ~~`order_lines.session_id`~~ | — | **Withdrawn: it already exists.** `20261228000142:73` declared it forward for Phase 1, unconstrained. No migration needed, and it is the binding. |
| **A4** | `tenant_promo_codes` as the agreed tenant discount object, and confirmation it is mine to own. | Orders & Checkout + Commerce Director | My brief says "agree the table with Orders and Commerce through the Director". Doing it any other way makes a third discount store; the repo already killed two. |
| **A5** | **A ruling on V-2, the split platform fee.** | Commerce + Finance + owner | The mockups promise it, the marketing copy promises the opposite, and the code has neither. |
| **A6** | **A ruling on V-6, the door role.** | whoever owns `is_staff_of_tenant` | Adding `'door'` to the role CHECK is one line and grants the entire workspace through RLS. |
| **A7** | Timestamps `…360`, `…361`, `…362`, `…363` announced on the board before any apply. | Director | Department rule. Collisions between parallel sessions have shipped before. |

---

## 6. What is deliberately NOT in Phase 2

Named so nobody reads the mockups and believes it is coming in this wave.

- **Seat maps and the seat picker** (`SeatMapDesigner`, `PublicSeatPicker`, the "Section A seated"
  tier). Spaces S5, wave E. V-5.
- **Layouts** on an event. Spaces S4, wave E. The column ships unread.
- **Wallet passes, PDF tickets, ticket design.** `SettingsEvents` and `TicketsTab` show all three.
  **The web receipt is NOT in this list any more** — it moved into E5, because a phone screen is what
  actually gets scanned and a QR needs somewhere to live. PDF stays parked and stays in the plan: it is
  for the person who prints or who loses the email, and it is a small render on top of a receipt that
  will already exist. Nobody calls this feature finished while a buyer has nothing to show at the door.
- **Add-ons on a tier** ("Welcome drink + $8"). `talent_offering_addons` exists and this is small,
  but it is a second money path through the ticket picker and I would rather ship the first one
  correctly. Immediately after E5 if the Director wants it.
- **Transfers** ("send a ticket to a friend"). Needs an admission-holder change and a second token
  issue; a genuine v2.
- **Waitlist when sold out** and **embed on another site**. Both appear in the mockups and both are
  additive to a working box office. **Walk-up sales are no longer in this list** — card and cash both
  moved into E8 by the owner's ruling.
- **Offline door scanning.** My brief says it is not a v1 goal, and I agree: E8 is online-first with
  the already-scanned list cached so a dropped signal degrades to a warning rather than a turnstile.
  **The marketing FAQ must be edited in the E8 PR**, not before — it currently says the offline
  question "is part of the design work" and that we "will say plainly what it does and does not
  handle when it ships." That sentence is honest today and becomes a debt the day E8 merges.

---

## 6b. Where this area actually stands, 2026-09-04

**Everything buildable without another department's file is built.** Eight of ten slices have shipped
or are pushed; the remaining two and the surfaces of three others are blocked on named files owned by
named people, not on judgment.

| Slice | State | Migration |
|---|---|---|
| E0 `admissions` | **merged, live** | `…360` |
| E1 `events` + delete guard | **merged, live** | `…361`, `…362` |
| `party_size` rationale | **merged, live** | `…363` |
| E2 tiers on variants | **merged, live** | `…364` |
| `admits_per_unit` | **merged, live** | `…365` |
| E5b mint idempotency + shortfall view + `order_lines.session_id` | **merged, live** | `…366` |
| E6 tenant promo codes | pushed, applied, unmerged | `…367` |
| E9 lineup | pushed, applied, unmerged | `…368` |
| E8 `check_in` + the no-show fix | pushed, applied, unmerged | `…369`, `…370` |
| **SECURITY** shortfall view leak | pushed, applied, unmerged | `…371` |

**Blocked, each on one named thing:**

- **E3's screens** — there is no `events` rail slot. My brief said the Dashboards Director had added
  it; verified four ways against main, it does not exist. Routed as one three-area contract.
- **E4's `/events` and `/r`** — the `surface-allow-list.ts` decomposition. That file is at its
  800-line ceiling and cannot absorb one line today. Four registrations, not two.
- **E5b's wiring** — Orders is adding an `onOrderPaid?` callback after their own red PR clears. The
  shortfall view is already on main **ahead** of the hook, which is what makes their best-effort
  ruling safe rather than merely convenient.
- **E7 payout hold** — Finance's `release_after` column. **Parked, not faked.** `booking_payouts` has
  no time column and `releaseHeldPayouts` has no time predicate at either site, so holding a ticket
  payout as `'held'` releases it early on the next account flip or reconcile, silently.
- **E8's camera scan** — the owner's click on a real iPhone. Cannot be produced here at all: the iOS
  Simulator has no camera, so any green would be evidence about a thing that does not exist.

## 6c. What this area learned, in the order it cost something

1. **A brief is a claim like any other.** Four items in mine did not survive contact with `origin/main`
   — the `admissions` shape, the rail slot, the payout hold, and `order_lines.session_id`, the last of
   which I asserted myself and had confirmed back to me by the table's owner. Verify a dependency on
   `origin/main`, never in the conversation about it.
2. **Existence is not shape, and shape is not behaviour.** `to_regclass` passes on a table that
   enforces nothing. Every migration here was proven by a rolled-back probe that made the guards
   *refuse*.
3. **A green lane is not a green branch.** `tsx --test` executes and does not typecheck; seven tests
   passed over five type errors.
4. **A privilege sweep catches what a careful reading cannot** — *and the sweep itself needs a
   discriminator, or it becomes the next bug.* I wrote a true sentence about view ownership, drew the
   wrong conclusion from it, and shipped a cross-tenant read; the comment recording the error read like
   diligence. But the rule I then published would have **broken** a correct view:
   `inquiry_offer_line_items_talent_view` is in the identical state mine was — `security_invoker` unset,
   running as owner, bypassing RLS — and is **right**, because it carries its own `auth.uid()` scope and
   the base table's policies do not admit a talent by `talent_profile_id` at all. It exists *because*
   RLS refuses that access. Setting the invoker flag returns zero rows for every talent, silently,
   since an empty result is what a correctly-filtered view looks like. **The two are indistinguishable
   by shape and opposite in correctness.** The discriminator: *does the view carry its own scope, and
   would RLS have granted this access anyway?* A sweep that flags both for a human is useful; one that
   auto-fixes, or whose message says "set security_invoker", is worse than none.

5. **One authority per fact.** The units-versus-people confusion surfaced five times in five different
   costumes — a column, a detector, a constraint, a door count, a reconciler predicate. A bad column
   does not just store a wrong number; it teaches every later reader to compute one.
6. **A weak guard that is correct beats a strong one that refuses valid states.** The `admissions`
   anchor check stayed weak over three separate objections, and then the owner's cash door sale and
   Reservations' walk-in both turned out to need exactly the room it left.

## 7. Log

| Date | Entry |
|---|---|
| 2026-09-03 | Sessions & Classes ratified `customer_id`/`holder_name`/`holder_email` (holder, never the buyer) and accepted `sessions.event_id` in my migration. **Their finding adopted and extended**: a deleted event would have published its sessions to the public schedule, so delete is a cancellation and `DELETE` is draft-only. **Their claim that the `paid` seam does not exist is wrong** — `complete-order.ts:156` + `transactions.ts:873`, both on main. Credit corrected: `tier-pools.ts` is Capacity's, not Sessions'. |
| 2026-09-03 | **E0 `admissions` designed** and sent to the Director. Ownership reversed: it is mine, not Sessions' (§0). Board's nullable-`allocation_id` shape adopted; two additions argued (`units`, `token_version`), one stronger guard considered and refused. **A3b withdrawn — `order_lines.session_id` already exists** at `20261228000142:73`. |
| 2026-09-03 | Plan written. Verified against `origin/main` @ `6f7351fc9`. Seven contradictions raised (§1). **Blocked on `admissions`**, which does not exist. Sent to the Sessions, Events & Reservations Director. No go, no code, no migration claimed. |
