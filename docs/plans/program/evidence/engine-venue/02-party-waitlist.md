# Task 2 — party waitlist

Migration: `20261231224000_party_waitlist.sql`

RPCs: `party_waitlist_join`, `party_waitlist_notify`, `party_waitlist_seat`,
`party_waitlist_leave`, `party_waitlist_reap`.

In-file `$proof$` asserts `conflict` on a stale version, then leave.

Race: `web/scripts/verify-party-waitlist-race.mjs` (exit 2 without isolated env).

Reaper hooked in `api/cron/expire-orders`.
