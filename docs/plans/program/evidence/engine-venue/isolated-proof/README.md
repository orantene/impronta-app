# Package 3 (PR #1960, engine-venue) + POS Messages (PR #1961, pos-messages) — isolated-branch proof

Target: Supabase branch `fxlankepwnvelxjrahwk` (qa-journeys), fixture tenant
`33333333-3333-4333-8333-333333333333`. NOT production (`pluhdapdnuiulvxmyspd`).
No `db:push`, no `reset_branch`, no dev server, no typecheck, no build.

Worktree `engine/venue-messages-proofs` = `origin/cursor/engine-venue-f891`
(head `3d5385c10`) merged with `origin/cursor/pos-messages-444f` (fetched at
head `d415969c5`, which already carries the `/c/t/<token>` route-collision
fix — `843d042c8` named in the original task was superseded upstream before
this proof started).

**Merge conflict resolved:** `docs/plans/program/pos/decisions.md` — both
branches independently used D-POS-76..82. Kept engine-venue's numbering
(D-POS-76..82, widely referenced from `venue.md`, `path-groups.ts`,
`reserved-slugs.ts`) and renumbered pos-messages' 7 entries to D-POS-83..89,
updating the 3 places that cited the old numbers
(`web/src/lib/messaging/thread-token.ts`, `docs/plans/program/engine/messaging.md`,
`docs/plans/program/evidence/pos-messages/README.md`). Catalog JSON and
`web/messages/*.json` merged clean (no conflict).

Companion evidence file: [`../../pos-messages/isolated-proof/README.md`](../../pos-messages/isolated-proof/README.md).

## Task 1 — migration collision check

```
cd web && node --env-file=.env.capacity-isolated.local scripts/check-migration-version-collisions.mjs --remote
```
```
[migration-collisions] remote ledger read: 820 recorded migrations
[migration-collisions] OK — 828 local migrations, local + remote checks clean
```
Exit 0.

## Task 2 — apply the eight migrations, in order

All applied via `npm run journeys:repair -- ../supabase/migrations/<file>`.

| File | Result |
|---|---|
| `20261231222000_pos_messaging_state.sql` | **Failed first attempt, fixed, applied clean** — see below |
| `20261231223000_venue_locations.sql` | OK |
| `20261231224000_party_waitlist.sql` | OK |
| `20261231225000_layouts_periods_stations.sql` | OK |
| `20261231226000_guest_qr_substitutes.sql` | OK |
| `20261231227000_event_seats_holds.sql` | OK |
| `20261231228000_pos_devices_outbox.sql` | OK |
| `20261231229000_reserve_ticket_slug.sql` | OK |

### Fix required: `20261231222000_pos_messaging_state.sql`

First attempt failed:
```
RETRY 20261231222000_pos_messaging_state.sql  (78 statements)
      invalid input value for enum inquiry_source_channel: "web_chat"
PART  20261231222000_pos_messaging_state.sql  (76 applied then rolled back, 0 already there, 2 unresolved)
  22P02 invalid input value for enum inquiry_source_channel: "web_chat"
    ↳ UPDATE public.inquiries
  22P02 invalid input value for enum inquiry_offer_status: "approved"
    ↳ UPDATE public.inquiries i
```
Root cause: on this branch, `inquiries.source_channel` (enum
`inquiry_source_channel`) has no `web_chat`/`sms`/`counter` members, and
`inquiry_offers.status` (enum `inquiry_offer_status`) has no
`pending`/`approved` members. The migration compared these enum columns
directly against those string literals inside an `IN (...)`, which Postgres
resolves by casting the literals to the enum type — and those literals are
not valid members of it.

Fix (committed `9762ec4b4`): cast `source_channel` and `v_offer.status` to
`text` before the `IN` checks, matching the `p_inquiry.status::text` pattern
already used two lines below in the same function
(`messaging_derive_opportunity_state`). This describes categories the
text-typed target column (`channel`) or the function's text return value
accept — it does not need the enum widened. Re-applied clean:
```
OK    20261231222000_pos_messaging_state.sql
```

## Task 3 — object + privilege + RLS check

All 18 tables created by the eight migrations exist, every one has
`relrowsecurity = true` and at least one `SELECT` policy for staff:

`checkout_snapshots`, `conversation_identity`, `conversation_records`,
`message_delivery`, `scheduled_messages`, `venue_location_zones`,
`venue_locations`, `party_waitlist`, `prep_stations`, `service_periods`,
`space_layout_items`, `space_layouts`, `order_line_substitute_offers`,
`admission_holds`, `event_seat_maps`, `event_series`, `pos_devices`,
`pos_outbox` — 18/18 `exists=true rls=true select_policies=1`.

All 35 functions created by the eight migrations exist and are
service_role-only: `has_function_privilege` is `false` for both `anon` and
`authenticated`, `true` for `service_role`, on every one —
`messaging_assign_owner`, `messaging_auto_cancel_reminders`,
`messaging_close_lost`, `messaging_derive_opportunity_state`,
`messaging_link_record`, `messaging_recover_from_snapshot`,
`messaging_set_conversation_state`, `messaging_set_identity`,
`messaging_touch_inquiry_from_message`, `messaging_touch_opportunity`,
`messaging_unlink_record`, `venue_location_set_default`,
`venue_location_upsert`, `venue_location_zone_delete`,
`venue_location_zone_upsert`, `party_waitlist_attach_visit`,
`party_waitlist_join`, `party_waitlist_leave`, `party_waitlist_notify`,
`party_waitlist_reap`, `party_waitlist_seat`, `party_waitlist_unclaim`,
`layout_activate`, `prep_station_delete`, `service_period_upsert`,
`pos_line_offer_substitute`, `admission_comp`, `admission_exchange`,
`admission_hold_reap`, `admission_hold_seats`, `event_seat_map_upsert`,
`event_series_upsert`, `pos_device_heartbeat`, `pos_device_register`,
`pos_device_update`, `pos_outbox_apply`.

Full transcript in the checks above (re-run any time with the query in
`../../engine-pos-money/isolated-proof/` for the pattern — same tables/
functions query, different names substituted).

## Coordinator check — `pos_reserve_collection` and `p_method='link'`

A report claimed `pos_reserve_collection` (migration `20261230002310`) only
accepts `cash`/`online_card`/`terminal` while `createPaymentLink` (package 1,
`web/src/lib/payments/links.ts`) sends `method: "link"`. Checked directly:
the **file on disk** in this branch's migration does read
`p_method NOT IN ('cash', 'online_card', 'terminal')` (no `'link'`), but the
**live function on the isolated branch** already reads
`p_method NOT IN ('cash', 'online_card', 'terminal', 'link')` — it was
patched live at some point without a matching migration file update. Called
it directly:
```sql
select public.pos_reserve_collection(
  '33333333-3333-4333-8333-333333333333', <draft order with a 2500-cent line>,
  'link-method-check-op-1', 2500, 'link', <fixture manager>, 2, 900
);
```
```
{ ok: true, state: 'reserved', already: false, version: 3,
  amount_cents: 2500, reservation_id: '6baa6a28-...', outstanding_cents: 0 }
```
**Accepted.** Not a defect — no fix needed. (Separately worth noting: the
migration file and the live function have drifted; a future migration
should update the file to match what's live, or the next `db:push`-style
apply elsewhere will regress this.)

## Task 4 — the seven verify-*.mjs scripts

`git diff --name-only origin/main...HEAD -- web/scripts` lists 7 new scripts.
All run against fixtures built through the engine's own RPCs
(`pos_mutate_draft_line`, `party_waitlist_join`, `pos_device_register`,
`admission_hold_seats`), except where a script's own fixture-prep step
required a direct insert (a draft `orders` row, a fixture `spaces` row of
`kind='seat'`, an `inquiries`/`inquiry_messages` pair — none of these are the
thing under test, all through columns the schema exposes for exactly this).

| Script | Result | Notes |
|---|---|---|
| `verify-guest-share-race.mjs` | **PASS**, exit 0, wins=1 | Fixture: draft order, one 5000-cent custom line, `version` reset to 1 by direct `UPDATE` to match the script's hardcoded `p_expected_version:1` (the derived `total_cents` column makes version 1 unreachable through the RPC path alone once a line exists — a latent fixture-contract issue in the script, not a defect in the RPC). `a` conflict (stale version), `b` reserved the full 5000. |
| `verify-messaging-concurrent-draft.mjs` | **PASS**, exit 0 | No `messages`-channel drafts exist on the isolated branch; script's own no-op branch. |
| `verify-messaging-double-link.mjs` | **PASS**, exit 0 | Invariant query over `conversation_records`; 0 double-live-links found. |
| `verify-messaging-double-settle.mjs` | **PASS**, exit 0 | No `payment_links` rows on the fixture tenant; script's own empty-tenant branch. |
| `verify-outbox-replay.mjs` | **Failed first run, fixed, PASS on re-run** | See below. |
| `verify-party-waitlist-race.mjs` | **PASS**, exit 0, wins=1 | Fixture: `party_waitlist_join` entry, race target Table 5 space. `a` seated (claimed=true), `b` `already_seated`. |
| `verify-seat-hold-race.mjs` | **PASS**, exit 0, wins=1 | Fixture: a `kind='seat'` space + real event session. `a` `seat_taken`, `b` held. |

### Fix required: `verify-outbox-replay.mjs` — real race in `pos_outbox_apply`

First run:
```
Error: pos_outbox_apply 409: {"code":"23505", ...
  "message":"duplicate key value violates unique constraint \"pos_outbox_operation_key_uniq\""}
```
**Real defect, not a fixture problem.** `pos_outbox_apply`'s idempotency
check (`SELECT ... FROM pos_outbox WHERE operation_key = ...`) ran **before**
any row was locked. Two concurrent calls with the same `operation_key` both
passed the "not found" check, both then locked the device row `FOR UPDATE`
one after another (that part was already serialized), and the second's
`INSERT` hit the unique constraint as an **uncaught** `23505` — a 500 back
to the caller — instead of the idempotent `{ok:true, already:true}` reply
the function is supposed to guarantee on a retried operation key.

Fixed in a new migration
[`20260911202541_pos_outbox_apply_serialize_operation_key.sql`](../../../../../../supabase/migrations/20260911202541_pos_outbox_apply_serialize_operation_key.sql)
(applied, committed `1e34c8558`): reordered the function so the device row
is locked `FOR UPDATE` **first** (the function's own natural per-device
serialization point), and the `operation_key` existence check runs **after**
acquiring that lock — so a second concurrent caller blocks on the device
lock, then re-reads and finds the first caller's committed row. Re-run after
the fix, fresh fixture:
```
[outbox-replay] PASS cashWins=2 cardRefused=true
  a={"id":"4a5440cf-...","ok":true,"result":{"state":"reserved",...,"reservation_id":"93cdc17c-...","already":false}}
  b={"id":"4a5440cf-...","ok":true,"result":{...,"reservation_id":"93cdc17c-...","already":true}}
  card={"id":"5db95654-...","ok":false,"reason":"not_replayable"}
```
Exit 0. Both calls return the **same** `id`/`reservation_id` (one fresh, one
`already:true`) — a single reservation was created, not two — and the
provider-touching `card_collect` command was correctly refused
`not_replayable`.

## Task 5 — one-path checks by SQL

All fixture rows deleted by id after ground truth was read; no wildcard
deletes.

**Location default backfill** — every agency has exactly one default
location:
```sql
select tenant_id, count(*) filter (where is_default) as defaults, count(*) as total
  from public.venue_locations group by tenant_id;
```
All 4 tenants in the branch: `defaults=1, total=1`.

**Party waitlist join → seat** — `party_waitlist_join` then
`party_waitlist_seat`: `claimed:true, status:'seated'`. Ground truth row
after: `status='seated', seated_visit_id` set on the seating path exercised
in the race test above (same fixture, PASS row).

**Layout activate → exactly one active** — created two `space_layouts` rows
on one location (`Layout A` active, `Layout B` inactive), called
`layout_activate` on `Layout B`. Result `{ok:true, version:2}`. Ground truth:
`Layout A` `is_active=false`, `Layout B` `is_active=true` — exactly one.

**Guest add line → submit** — draft order `source_channel='guest_qr'`,
`pos_mutate_draft_line(..., 'add', {kind:'custom', unit_cents:1800})` →
`{ok:true, total_cents:1800}`, then `pos_reserve_collection(..., method:'link')`
→ `{ok:true, state:'reserved', amount_cents:1800, outstanding_cents:0}`.

**Seat hold → expiry → release** — fixture `kind='seat'` space,
`admission_hold_seats` → `{ok:true, status:'held'}`; forced `expires_at` to
5 minutes in the past by direct `UPDATE`; `admission_hold_reap(50)` →
`{ok:true, released:1}`. Ground truth: the hold row's `status` is now
`'released'`.

**Ticket transfer bumps token_version** — **finding, not a pass.** Created
an `admissions` row (`version=1, token_version=1`), called
`admission_exchange` to move it to a different session:
`{ok:true, version:2, delta_cents:0}`. Ground truth after:
`session_id` changed, `version=2`, but **`token_version` is still `1`**.
Grepped every migration and every TS caller in the repo for anywhere
`token_version` is incremented — there is none. `admission_exchange`
(the only "move an admission to a different session" RPC in these two
packages) does not invalidate the old signed ticket token on transfer.
Not fixed here: this is outside the race-script scope this proof was asked
to gate on (it is not a concurrency defect the task's fix-on-failure rule
covers), but it is a real gap worth a follow-up ticket — a transferred
ticket's old QR code stays valid.

**Device heartbeat** — `pos_device_register` then
`pos_device_heartbeat(..., app_version:'1.2.3')` → `{ok:true}`. Ground
truth: `pos_devices.last_seen_at` updated to the call time,
`app_version='1.2.3'`.

**Messaging: conversation_state flips on customer vs staff message** —
one `inquiries` row, then two `inquiry_messages` inserts:
- customer (`sender_user_id IS NULL`) → `conversation_state='needs_reply'`,
  `last_customer_message_at` set.
- staff (`sender_user_id` = fixture manager) → `conversation_state='awaiting_customer'`,
  `last_staff_message_at` set, `last_customer_message_at` unchanged.

**One `scheduled_messages` row per record** — enforced by the partial unique
index `scheduled_messages_one_live_per_record` (`WHERE state='scheduled' AND
record_id IS NOT NULL`), not by RPC logic. First insert for a `record_id`
succeeded; a second insert for the same `(tenant_id, record_kind,
record_id)` while the first is still `state='scheduled'` was refused
`23505 duplicate key value violates unique constraint`.

## Cleanup

Every fixture row created for this proof was deleted by its own id
immediately after ground truth was read — no wildcard deletes. Covered:
`order_collection_reservations`, `order_lines`, `orders` (guest-share-race,
outbox-replay ×2, guest-QR-submit), `pos_outbox`, `pos_devices` (outbox
device + heartbeat device), `party_waitlist` (1 row), `space_layouts` (2
rows), `admission_holds` (seat-hold-race + expiry-release, 2 rows),
`spaces` (2 fixture `kind='seat'` rows), `admissions` (1 row), `inquiries` +
`inquiry_messages` + `scheduled_messages` (1 inquiry, its 2 messages, its 1
scheduled-message row). Verified clean by re-querying every id above
(all empty) before this commit.

## Summary

| Check | Result |
|---|---|
| Task 1 — migration collision check | PASS — exit 0, clean |
| Task 2 — eight migrations apply in order | PASS — 7 applied clean, 1 fixed then applied clean |
| Task 3 — 18 tables exist, RLS + staff SELECT policy | PASS — 18/18 |
| Task 3 — 35 functions exist, service_role-only | PASS — 35/35, 0 anon/authenticated execute |
| Coordinator check — `pos_reserve_collection` method=`link` | Accepted live (already patched); migration file is stale relative to the live function |
| `verify-guest-share-race.mjs` | PASS — exit 0, wins=1 |
| `verify-messaging-concurrent-draft.mjs` | PASS — exit 0 (no-op branch) |
| `verify-messaging-double-link.mjs` | PASS — exit 0 |
| `verify-messaging-double-settle.mjs` | PASS — exit 0 (no-op branch) |
| `verify-outbox-replay.mjs` | **FAIL → fixed → PASS** — real race in `pos_outbox_apply`, closed |
| `verify-party-waitlist-race.mjs` | PASS — exit 0, wins=1 |
| `verify-seat-hold-race.mjs` | PASS — exit 0, wins=1 |
| Task 5 — 8 one-path checks | 7 PASS, 1 finding (`admission_exchange` does not bump `token_version`) |
