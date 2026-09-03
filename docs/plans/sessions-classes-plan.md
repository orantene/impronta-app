# Sessions & Classes — plan (Phase 1)

Written by the **Capacity Engine Manager** at the Director's request, because Phase 1 is capacity-shaped
and the seam is easier to specify from the engine side than to reverse-engineer from migrations. It is a
starting document for whoever owns Sessions & Classes, **not a set of instructions** — the manager who
takes this owns the shape and should argue with anything here that does not fit the code they find.

Verified against `origin/main` @ `e0b073fc8` on 2026-09-03. Source: "Sell the Room" §04, §05, §10 Phase 1.

---

## 0. What already exists, and what is genuinely new

Checked rather than assumed, because the proposal's audit facts have drifted three times today.

| Thing | State |
|---|---|
| `capacity_pools`, `capacity_allocations`, reserve/commit/release, the ancestor rule | **shipped and live** (0.2–0.10) |
| `subject_kind = 'session_tier'` | **already in the CHECK constraint.** Nothing to migrate |
| `venues` with per-venue IANA `timezone`, `agencies.timezone` | **shipped** (Spaces S1, `20261229000220`) |
| `talent_offering_variants` (a tier is a variant) | **exists** since `20260709051219` |
| `orders`, `order_lines`, `customers` | **shipped** (Orders 0.4/0.5) |
| Signed-token precedent for admissions | `lib/notifications/guest-unsubscribe-token.ts` — HMAC, versioned prefix, `timingSafeEqual` |
| Cron precedent | 20 routes under `app/api/cron/`, `CRON_SECRET` bearer auth, schedules in `web/vercel.json` |
| `sessions`, `session_series`, `admissions`, `session_picker` | **net new.** Zero references anywhere |

So Phase 1 adds three tables and one public block. Everything underneath it is already carrying traffic.

---

## 1. The capacity binding — the part only the engine owner can shortcut

**A session's seats are a pool. A tier within a session is a pool with a different `pool_key`.**

```
subject_kind = 'session_tier'
subject_id   = the session id
pool_key     = the tier slug ('default' when the session has one price)
```

The unique index is `(tenant_id, subject_kind, subject_id, pool_key)`, so **one session carries as many
tier pools as it needs with no extra table and no join**. GA and VIP on the same night are two rows that
differ only in `pool_key`. This is what `pool_key` was added for; do not invent a `session_tiers` table
to hold what an existing unique index already expresses.

**A house cap across tiers is the parent pool.** If 200 people fit in the room whatever mix of GA and VIP
sells, give the tier pools a `parent_pool_id` pointing at a session-total pool (or at the Spaces room
pool, once Spaces ships rooms). The ancestor rule then does the arithmetic for free: 150 GA + 60 VIP is
refused at 201 with reason `ancestor_full`, and neither tier pool needs to know the other exists.

### Two traps that will cost a day each if missed

**Window every allocation to the session, even though the pool is already per-session.** It is tempting
to use a timeless allocation (`starts_at`/`ends_at` NULL) because the pool identifies the session
already. That is correct *only while the pool has no ancestor shared across time*. The moment a tier pool
hangs under a **room** pool, a timeless allocation charges that room **forever** — a Tuesday class would
block Saturday's event in the same room. Always pass the session's window. It costs nothing when the pool
is parentless and it is the difference between correct and catastrophic when it is not.

**Editing seats on a session that has already sold is not a number write.** `units_total` must become
`available + held`, computed under the pool's row lock, or reducing the number silently cancels
outstanding orders. That arithmetic is already solved and shipped for offerings — read
`set_offering_stock` in `20261229000211` and copy its shape rather than deriving it. The two rules it
encodes: **reducing below what is held never cancels a hold** (availability goes to 0, existing buyers
keep their seats — taking a seat back from someone who paid is a refund decision), and **making a session
unlimited deactivates its pool rather than deleting it**, because the allocations are the record of what
was sold.

### One handoff item that is mine

`session_tier` is in the `subject_kind` CHECK but **not yet registered** in `capacity_subject_kinds`, so
a pool of that kind is currently unvalidated — it may point at a session id that does not exist. When
`sessions` ships, register it in the Sessions migration:

```sql
INSERT INTO public.capacity_subject_kinds (subject_kind, table_name, registered_by)
VALUES ('session_tier', 'sessions', 'sessions-P1') ON CONFLICT (subject_kind) DO NOTHING;
```

and delete `session_tier` from the list in `web/src/lib/capacity/subject-registry.static.test.ts` **in the
same commit** — that test fails deliberately when the set of unvalidated kinds changes without someone
deciding it.

---

## 2. Schema sketch

Deliberately a sketch. The manager who owns this should change it; what matters is the three shapes and
the reasons attached to them.

```sql
-- A recurring definition. Materialised forward; never itself bookable.
CREATE TABLE public.session_series (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id     uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  offering_id  uuid REFERENCES public.talent_offerings(id) ON DELETE SET NULL,
  title        text NOT NULL,
  -- Local wall-clock, NOT an instant: "Tuesdays at 18:00" survives a DST shift
  -- only if it is stored as 18:00 + a zone and resolved per occurrence.
  local_time   time NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  weekdays     int[] NOT NULL,          -- ISO 1..7
  seats        int NOT NULL CHECK (seats >= 0),
  starts_on    date NOT NULL,
  ends_on      date,                    -- NULL = open-ended
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One occurrence. THIS is what a pool attaches to and what a customer buys.
CREATE TABLE public.sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  series_id    uuid REFERENCES public.session_series(id) ON DELETE SET NULL,
  venue_id     uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  offering_id  uuid REFERENCES public.talent_offerings(id) ON DELETE SET NULL,
  title        text,                    -- NULL inherits the series/offering title
  starts_at    timestamptz NOT NULL,    -- resolved from local_time + venue timezone
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled','cancelled','completed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_range CHECK (ends_at > starts_at)
);
-- The materialiser must be re-runnable without duplicating an occurrence.
CREATE UNIQUE INDEX sessions_series_occurrence_uniq
  ON public.sessions (series_id, starts_at) WHERE series_id IS NOT NULL;

-- One row per unit sold. A ticket, a class seat, later a table reservation.
CREATE TABLE public.admissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  order_line_id uuid REFERENCES public.order_lines(id) ON DELETE SET NULL,
  session_id    uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  holder_name   text,
  party_size    int NOT NULL DEFAULT 1 CHECK (party_size > 0),
  state         text NOT NULL DEFAULT 'valid'
                  CHECK (state IN ('valid','checked_in','void')),
  checked_in_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admissions_checkin_stamp
    CHECK ((state = 'checked_in') = (checked_in_at IS NOT NULL))
);
```

**No token column.** Follow `guest-unsubscribe-token.ts`: HMAC the admission id with a versioned prefix
and a distinct salt, verify with `timingSafeEqual`. A stored token is a credential at rest in a table
several roles can read; a derived one cannot leak from a row.

**`party_size` on the admission, not the order line.** The proposal wants one check-in surface for class
seats, tickets and table reservations. A reservation for four is *one* admission with `party_size = 4`,
not four admissions — otherwise the host stand shows four rows for one party.

---

## 3. Recurrence, and the one thing that makes it hard

**Store local wall-clock, resolve per occurrence.** "Tuesdays at 18:00" is not an instant. Materialising
by adding 7×24h to a `timestamptz` silently shifts the class by an hour across a DST boundary, and the
platform now has real per-venue timezones from Spaces S1, so there is no excuse to get this wrong. Each
occurrence resolves `local_time` against `venues.timezone` (falling back to `agencies.timezone`).

**The materialiser creates the session and its pools together, idempotently.** `upsert_capacity_pool` is
idempotent on `(tenant, kind, subject, pool_key)` and `sessions_series_occurrence_uniq` covers the
session, so re-running the cron is a no-op rather than a duplicate. Materialise 90 days forward, daily.

**Do not materialise the past, and do not delete materialised sessions when a series changes.** A series
edit changes future occurrences; sold sessions are history. Cancelling a session is `status='cancelled'`
plus deactivating its pools — never a delete, for the same reason a pool is deactivated rather than
deleted: the allocations are what settles a dispute.

---

## 4. PR sequence

| PR | Delivers | Exit proof |
|---|---|---|
| **P1.1** | `session_series`, `sessions`, RLS, the `session_tier` registry row + test-list deletion, a pure `lib/sessions/` recurrence library with tests | A series at 18:00 local materialises 13 correct occurrences across a DST boundary, each still at 18:00 local |
| **P1.2** | The materialiser cron + pool creation per session. Re-run safety | Running the cron twice creates exactly one session and one pool per occurrence |
| **P1.3** | Offering → session binding; `session_picker` public block showing remaining seats via `capacity_remaining_public` | A published class shows real remaining seats to a signed-out visitor, and shows sold-out at zero |
| **P1.4** | Purchase through the Orders pipeline; `admissions` minted on paid lines | **The live 12-spot course sells 12 seats for one September session to 12 different people and refuses the 13th** |
| **P1.5** | Signed check-in token, staff check-in list, attendance history | A staff member scans a token, the admission flips to `checked_in`, and a second scan is refused as already used |
| **P1.6** | Reminders in venue-local time | A class at 18:00 America/Cancun sends its reminder at the right local hour, not UTC |

**P1.4 needs Orders 0.6.** Everything before it does not, which is why this can be planned and largely
built now. P1.1–P1.3 are buildable against the shipped engine today.

---

## 5. Open questions for the Director and the owner

1. **Does a session belong to an offering, or does an offering point at a session?** The sketch has both
   `sessions.offering_id` and the offering carrying a pool reference. One of them is redundant and I
   have deliberately not chosen — it depends on whether one class can be sold under two offerings
   (member price and drop-in price), which is a product question, not a schema one.
2. **Per-session pricing.** A tier is a variant, and variants have `amount_cents`. Does a single
   September session ever cost more than an August one? If yes, price lives on the session and the
   variant is a tier *name*; if no, the variant carries it. Affects P1.3.
3. **The live course is `kind='package'` with a flat price and no variants.** Phase 1's exit proof needs
   it to become a session-backed offering. That is a data migration on a real published row with a real
   pool — it should be a deliberate step with its own verification, not a side effect of P1.4.
4. **Attendance history is per customer, and `customers` shipped four hours ago.** Confirm with Orders
   that `customer_id` on an admission is the right key rather than the order's buyer, for the case where
   one buyer books six seats for six named people.

---

## 6. What I will keep owning

The capacity seam: pool shape, the ancestor rule, the registry row, and any RPC change Sessions needs.
Message me before working around the engine rather than after — twice today a manager asking a question
about this contract found a real defect inside it that was invisible from where I was standing.
