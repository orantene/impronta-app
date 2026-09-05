# Write-proof audit — Sessions, Events & Reservations

**Required by the rule from Sessions' #1813:** the scheduler everyone accepted as shipped had
never written a session. Its `ON CONFLICT` could not *plan* against a partial unique index, every
gate was green because no test reaches a database, and an empty table looked like nothing.

So: **a claim that an engine works, resting on unit tests plus an empty production table, is not
proven.** Proof is one write through the real client that is refused for a reason arising *after*
planning, or one real row created and deleted on a test tenant.

## Measured on production, 2026-09-05

```
events                          0     admissions              0
sessions                        0     orders                  0
session_series                  0     order_lines             0
capacity_pools                  7     capacity_allocations    0     ← never one allocation, ever
capacity_pools subject_kind='session_tier'   0
talent_offering_variants with pool_key       0     ← no tier has ever existed
agency_bookings                 2  (newest 2026-09-01, predates the reservations work)
talent_bookings / talent_holds / booking_transactions / booking_fulfillment   0
```

`capacity_allocations = 0` is the load-bearing number. Allocations are reaped, so zero *now* would
not prove zero *ever* — but `talent_holds`, `talent_bookings` and `booking_transactions` are not
swept and are also zero, and the only two `agency_bookings` predate the work. **Nothing has ever
reserved capacity in production.**

## The claims

### PROVEN

| Claim | Proof |
|---|---|
| `createSessionWithPools` writes a session | #1813 — refused through the real client with an invalid tenant, `42P10` before the fix and `23503` after, zero rows written. The proof shape this rule is named for. |
| The reserve block renders on a real page | **Proven FALSE**, which is still proof: it is on zero pages platform-wide (#1756). |

### NOT PROVEN — and what the owner's runbook run will settle

These need no separate work. The runbook is live and each is exercised by a step of it.

| Claim | Runbook step |
|---|---|
| `createEvent` / `setEventStatus` / `addTier` (#1764) | 2–4 |
| A tier rename keeps its pool (`pool_key` never recomputed) | 4 |
| Sessions' scheduler creates a night with seats per tier | 5 |
| `setSessionPoolUnits` surfaces `CP015` as a sentence (#1777) | 6 |
| `sellAtDoor` mints an admission and admits it (#1750) | 7 |
| `check_in` refuses a second scan | 7 |

**`CP015` has never been observed firing.** #1769's guard was verified from its definition and its
concurrency argument; the behaviour probe could not run because there were no sessions to anchor a
throwaway row on. That was recorded at the time and is still true.

### NOT PROVEN — and the runbook will NOT settle these

Ordered. These need their own proof.

1. **Reservations: `reserve_table` reserves capacity.** This is the oldest standing "live" claim in
   my three areas — recorded as *booking path in production, 2026-09-04* — and `capacity_allocations`
   has never held a row. It is also the cheapest to prove: 14 venues and 7 pools already exist, so a
   refused write through the real client on a test tenant needs nothing built and nobody signed in.
   **Do this first.** It is the largest gap between what is believed and what is evidenced.
2. **Sessions: the materialise cron writes occurrences.** `session_series = 0` and `sessions = 0`, so
   the daily sweep has never materialised anything. Same proof shape.
3. **Sessions: the DST collision refusal.** Refuses into `improntaLog` with no operator surface, so
   it cannot be human-QA'd at all — already recorded as a finding rather than a row.
4. **Events: `mint-on-paid` mints admissions from a paid order.** `orders = 0`. Cannot be proven
   until guest checkout exists; it is E5's acceptance, not a separate task.
5. **Events: `receipt_for_code` resolves a receipt.** Same — no receipt has ever existed.

### Adjacent, not mine, flagged

**Capacity's `CP015` floor refusal (#1769)** — my issue, their fix, verified from the definition and
never observed firing. Raised here because the rule applies to it and the owner is Capacity's.

## The pattern worth keeping

Every claim above was believed on the same evidence: green unit tests over an empty table. The
scheduler is the proof that this evidence class can be **uniformly wrong** — not flaky, not
edge-case, simply never executed against a database. An empty table is the least informative
observation available: it is equally consistent with "works and unused" and "has never once run".
