# Decision memo: is `ledger_entries` dead? Wire it or remove it

Date: 2026-10-09. Author: Payments Developer chat. For: PM (decision owner).
Status: evidence only. No SQL was run against production beyond read-only counts, and nothing was changed in the repo.

## Answer in one paragraph

It is not dead. It is **wired, scheduled and silently producing nothing**. Last night's claim in the Money bucket ("nothing in `src` writes `ledger_entries`") was wrong: I grepped for callers of `write.ts` too narrowly. The ledger is projected **hourly** by `GET /api/cron/project-ledger` (`web/vercel.json`, `:50`), and the cron's heartbeat says `ok`. But since it shipped, the booking-payment projection has refused **every** payment, because of one swallowed error (a column that does not exist), so production holds 4 ledger rows in total, all payout events. **Recommendation: wire it (fix three small things, below). Do not remove it.** Nothing reads it yet, so nothing is at risk while it is fixed, and nothing is lost by waiting; the cost of removal is a migration plus losing the only designed place where "whose money is this" can be answered.

## What it is

- Migration `20261226000016_ledger_foundation.sql`: a chart of accounts (`ledger_accounts`, 14 seeded in prod) and a balanced double-entry table (`ledger_entries`, a deferred constraint trigger refuses an unbalanced group). RLS on, admin read policy.
- `web/src/lib/ledger/project.ts` (pure projections), `run-projection.ts` (finds un-projected sources by deterministic group id, so it is idempotent and doubles as the backfill), `write.ts` (writes a balanced group); `transfer-settlement.test.ts` covers the transfer projection.
- Sources projected in order: paid booking transactions, processing fees (`provider_balance_transactions`), paid invoices, payouts, settled transfers. Refunds are deliberately not projected yet (noted in the file).
- Schedule: hourly at `:50`, after the balance-transaction ingest at `:35`.

## Writers and readers

| | where |
|---|---|
| Writers | `lib/ledger/write.ts` (`writeLedgerGroup`), called only from `lib/ledger/run-projection.ts`, called only from `app/api/cron/project-ledger/route.ts` |
| Readers in `src` | none. `write.ts` reads it only to dedupe a group. `lib/account/retention-account-purge.ts` lists it for talent-account purge (`ledger_entries.talent_profile_id`, reason "money"). No screen, report, export or RPC reads it. |
| Policies/views | admin read policies only; no views |
| Similar names | `client_balance_ledger` is a different table (client credit); do not confuse |

What would break if it were removed: the cron route, the `lib/ledger` module and its three test files (about 1,500 lines), the retention-purge entry, and `database.types.ts`. No user-facing feature breaks, because nothing user-facing reads it.

## Why it produces nothing (verified)

1. **Wrong column in the lanes read (the root cause).** `run-projection.ts` selects `talent_profile_id` from `booking_commission_snapshot`. That column does not exist (checked on production and on the isolated project). PostgREST returns an error, the code does not check it, `snaps` is null, `lanes` is empty, and `projectBookingPayment` refuses with "no commission lanes — cannot attribute the payment" for every payment. Reproduced on the isolated project (`column booking_commission_snapshot.talent_profile_id does not exist`); with that column removed from the select, the paid sale `f15c22ff` projected and wrote 3 balanced legs (`stripe_balance +101,500`, `talent_payable -100,000`, `platform_commission -1,500`).
2. **Unordered `LIMIT 200` starves new rows.** The booking-transaction read has no `ORDER BY` and a batch of 200. On the isolated project (231 paid transactions) the same 200 old, unprojectable rows came back on every run (`refused: 200`), so newer sales are never reached. On production there are only 10 paid transactions today, so this is dormant there, but it will bite as volume grows or whenever old rows stay unprojectable.
3. **Heartbeat is green while the work is refused.** Production's `project-ledger` heartbeat reads `last_status ok`, `last_detail projected=0 refused=10`, `consecutive_failures 0`. A run that refuses everything is reported as healthy, which is why this went unnoticed.

Also true and unrelated to the bug: 6 of production's 10 paid transactions have no commission snapshot at all (older sales), and 2 more have lanes that do not sum to the charge (old `included`-mode sales, 50,750 vs 50,000 and 10,150 vs 10,000). Those will still be refused (correctly) after the fix; they need a decision (backfill snapshots, or accept a ledger that starts at the first balanced sale).

Production state now: 4 `ledger_entries` rows (2 `payout_initiated`, 2 `payout_arrived`, 2026-10-05), 14 accounts, 0 booking-payment groups.

## Options

### A. Wire it (recommended)
One small PR, no migration:
1. Remove `talent_profile_id` from the snapshot select (and check `error` on that read: a read error must refuse loudly, never look like "no lanes").
2. `ORDER BY paid_at DESC` (or `created_at`) plus a stable cursor on the booking-transaction read, so the batch is newest-first and a pile of unprojectable rows cannot starve it.
3. Make the heartbeat honest: `last_status` degraded (or `consecutive_failures` incremented) when `refused > 0` and `projected = 0`; include the first refusal reason in `last_detail`.

Then run the cron once by hand (it is the backfill) after a first dry read of what it would write. Cost: about a day including tests. Risk: low; the write path is idempotent by deterministic group id and the database refuses unbalanced groups. The first visible effect is rows appearing in the ledger; no screen changes.

Where to read it next (a separate, later decision): an admin "Finance" panel for the platform (revenue, owed to talent, owed to workspaces), and a reconciliation check that `sum(talent_payable)` equals the sum of unreleased talent payout legs. That is the use the migration's header describes ("how much of the balance is ours?").

### B. Remove it
Migration plan, none run: (1) delete `app/api/cron/project-ledger`, the `vercel.json` entry and `lib/ledger/*`; (2) drop the retention-purge entry; (3) a migration that drops the deferred balance trigger, `ledger_entries`, `ledger_accounts` and `ledger_account_kind`, after confirming production still holds only the 4 payout rows (they can be exported first); (4) regenerate `database.types.ts`; (5) remove the tests. Cost: about half a day, most of it care around the trigger and types. This loses the designed answer to "whose money is this" and the audit-readiness reason it was built (Finance day-one audit, 2026-09-01).

### C. Leave it
Not recommended: it spends a cron and a heartbeat on an empty table and gives a false green.

## Recommendation

**A, now.** The bug is a single wrong column plus two hardening gaps, the module is already tested (1,500 lines) and idempotent, and a ledger that starts accumulating from the next balanced sale is more valuable than one that starts later. Do B only if the product decision is that finance reporting will be built on `booking_commission_snapshot` and Stripe balance data instead, in which case remove it cleanly rather than leave an empty, falsely healthy cron.

If you pick A, I will open the fix as a fresh branch off main. I verified the corrected read end to end on the isolated project only (one booking-payment group written there); nothing was written to production.

## Evidence

- Cron: `web/src/app/api/cron/project-ledger/route.ts`, `web/vercel.json` (`/api/cron/project-ledger`, hourly `:50`).
- Production, read-only: `ledger_entries` 4 rows, latest `2026-10-05 01:50`, kinds `payout_initiated` 2 and `payout_arrived` 2; `ledger_accounts` 14; `cron_heartbeats.project-ledger` `ok`, `projected=0 refused=10`; paid booking transactions 10 (4 with snapshots, 6 without; of the 4, 2 balance and 2 do not).
- Isolated project: `runLedgerProjection()` refused 200 of 231 with "no commission lanes"; `booking_commission_snapshot` select with `talent_profile_id` errors; corrected select projects 3 balanced legs for the paid sale.
