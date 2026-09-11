# Tables: reservations desk, floor, and kitchen

Source: `docs/plans/program/pos/`  -  screen-index.md, actions.md, modes.md, decisions.md, coverage-matrix.md, v3.1-corrections.md. Data verified against `supabase/migrations/*.sql` in this worktree on 2026-09-09.

## 1. The journey

A host is trying to seat parties against tables that actually fit them, keep the floor's true state (who is where, how long they have been there, who is waiting) visible at a glance, and hand a seated party to a server. A server is trying to send what a table ordered to the right kitchen or bar station, keep the check accurate as the party changes its mind, split it correctly when the party leaves, and free the table for the next one. A kitchen or bar station is trying to see what was actually sent  -  not what the sale currently shows  -  and acknowledge it. A guest at the table is trying to see the menu and order more without waving down a server.

## 2. Screens in this slice

1. **T01** Floor  -  the live map of tables and their state. Next action: tap a table.
2. **T02** Floor · timeline  -  the same floor as a schedule (reservations against tables over time). Next action: tap a slot.
3. **T03** Floor · list  -  the floor as a list, for a keyboard/mouse rather than a touch map. Next action: tap a row.
4. **T04** Tap a table  -  the actions available for one table's current state. Next action: pick an action.
5. **T05** Seat party  -  assign a party to a free table. Next action: confirm seating.
6. **T06** After seating  -  the floor reflects the new occupancy. Next action: open the table's order.
7. **T07** Walk-in  -  seat someone with no reservation. Next action: same as T05.
8. **T08** Waiting list · offers  -  parties waiting for a table. Next action: offer the next table to the next party. **Blocked: no waitlist table exists (see §3).**
9. **T09** Table order  -  build the check for a seated table. Next action: Send.
10. **T10** Send · review changes  -  confirm what is new since the last send before dispatching. Next action: Send.
11. **T11** After sending · acknowledgments  -  per-station acknowledgment state. Next action: wait for acks, or resend a bounded retry.
12. **T12** Move / join / merge chooser  -  pick which table operation to do. Next action: pick one.
13. **T13** Move the party  -  relocate an open visit to another table. Next action: confirm.
14. **T14** After the move  -  floor and check both reflect the same relocated visit.
15. **T15** Join tables  -  combine two tables' physical space for one party.
16. **T16** Merge checks  -  combine two checks, only within the same party (v3.1-corrections.md).
17. **T17** Change server  -  reassign who owns the table.
18. **T18** Checks · split by items  -  divide a check by line item.
19. **T19** Split a shared item  -  divide one line item's quantity across checks.
20. **T20** Cancel a sent item  -  void or comp an item already sent to the kitchen.
21. **T21** Guest QR order  -  accept an order a guest placed from their phone. Next action: accept into the table's order.
22. **T22** Extend time  -  give a table more time before the next booking. Next action: confirm, bounded by the next commitment.
23. **T23** Party left · bill open  -  the party is gone but the check is not settled.
24. **T24** Table reset  -  clear a table back to available.
25. **T25** Booth · minimum spend (met)  -  the counted total already clears the booth's minimum.
26. **T26** Kitchen station  -  what a station must prepare, in order.
27. **T27** Handheld server  -  a server's own device view of tables/orders.
28. **T28** Booth · below minimum spend  -  the shortfall is shown as a bill line, not hidden.
29. **Q01** Table QR landing  -  the guest's entry point at the table.
30. **Q02** Browse & configure  -  the guest orders from the menu.
31. **Q03** Submitted · tracking  -  the guest sees their order's status.
32. **Q04** Substitution needs OK  -  an item needs the guest's approval to swap.
33. **Q05** Pay at table  -  the guest sees the bill.
34. **Q06** Pay my share  -  the guest pays a portion.
35. **Q07** Already paid by someone else  -  a second payer at the same table sees recovery, not a duplicate charge.

## 3. Data per screen

- **T01–T03 floor**: reads `spaces` (`kind IN ('table','booth','cabana',...)`, `party_min/max`, `status`), `venues` (the location), `visits` (open occupancy  -  `visits.space_id`, `visits.status = 'open'`, `visits.opened_at` for elapsed time), and `orders` (`orders.visit_id`, `orders.space_id`) for the check attached to the visit. One open visit per space is enforced by a unique index (`visits_one_open_per_space`), so the floor's "who is where" cannot show two active parties on one table.
- **T04–T07 seat/walk-in**: writes a new `visits` row (`opened_at`, `opened_by`) via `lib/reservations/walkin.ts`, and a `public_token` that becomes the QR identity for that seating only (changes every seating, per the table's own comment). T05/T07 read `spaces.party_min/max` to refuse a party that does not fit.
- **T08 waiting list**: **Not in the database yet.** No table for a waiting party, an offer, or its expiry was found anywhere in `supabase/migrations/`. This is the same gap as appointments.md's B06/K02/K07  -  one missing capability (waitlist/offer/expiry), needed in two slices. Would need: an ordered list per venue of (party, size, joined_at), an offer with an expiry, and an accepted/expired outcome.
- **T09–T11 order/send/ack**: writes `order_lines` against the visit's `orders` row, then `preparation_tickets` (one row per order, `station`, `destination IN ('table','pickup','counter')`, `status`) and `preparation_ticket_revisions` (one row per send, `revision` incremented, `snapshot` jsonb)  -  confirmed by `preparation_tickets_one_active_per_order` unique index and the table's own comment: "Amendments bump revision; they do not create a second ticket." T11's per-station acknowledgment reads `preparation_tickets.status IN ('acknowledged','ready')` and `acknowledged_at`.
- **T12–T14 move/join/merge**: `visits.space_id` is updated (the move); `space_combinations` (verified table, `supabase/migrations/20261229000221_spaces_and_groups.sql`) is the "T7 and T8 join" relationship for T15. T16 merge checks combines two `orders` rows' lines onto one  -  v3.1-corrections.md's rule (same party only) is a business rule the design states; **unverified** which write enforces it at the data layer, since `orders` carries no party/guest-identity column distinct from `customer_id`  -  would verify by reading whatever POS-4.4 command implements merge.
- **T17 change server**: `visits.opened_by` or a separate server-of-record column  -  **unverified**; the `visits` table as read has `opened_by` (who opened it) but no explicit "current server" column distinct from that. Would verify by reading the actual T17 command once written.
- **T18–T20 split/cancel**: `lib/pos/check-partition.ts` (confirmed present) reallocates `order_lines` across `orders` rows sharing one `visit_id`; the unique index `orders_one_per_visit` means a split must produce more than one visit-scoped order, or attach the second check without a visit link  -  **unverified** which; would verify by reading `check-partition.ts`'s actual write shape. T20 cancel of a sent item needs a `preparation_ticket_revisions` entry recording the removal, per "kitchen ack failure visible" in actions.md.
- **T21–T24**: T21 accepts a guest QR order into the visit's `orders`/`order_lines` (same tables as T09). T22 extend reads `venue_service_windows`/`turn_minutes` (on `spaces`, a per-table override) to bound the extension. T23/T24 read `visits.status` and set it to `closed` with `closed_at`, freeing the `visits_one_open_per_space` slot for the next seating.
- **T25/T28 minimum spend**: `spaces.min_spend_cents` (verified column) is the policy; the design's own comment on that column says explicitly "a POLICY, not a charge. S6 turns it into prepaid credit on the tab; no money is ever settled from this table"  -  so the shortfall/met comparison is computed at display time against `orders.total_cents` for that visit, not stored.
- **T26 kitchen station / T27 handheld**: both read `preparation_tickets` filtered by `station` (T26) or by the signed-in server's tables (T27, via `visits.opened_by` or the server-of-record column above).
- **Q01–Q07 guest QR**: `visits.public_token` is the entry identity (Q01). Q02 reads the public menu (`talent_offerings`/catalog, not itself part of this slice). Q03 reads `order_lines`/`preparation_tickets` status for the guest's own order. Q05/Q06/Q07 (pay at table, pay my share, already-paid recovery) go through the shared payment state against the visit's `orders.total_cents`; task POS-4.7 is named in actions.md as not yet implemented for "pay my share"  -  **not in the database yet**: no column marks which `order_lines` (or what fraction) a given payer has already covered, so a partial per-guest payment has nowhere to record itself beyond the order-level payment attempt. This blocks Q06/Q07 specifically.

## 4. Refusals and empty states

- T05/T07: a table that does not fit the party (`party_min`/`party_max`) or is already occupied is refused, not silently seated over (actions.md: "occupied → refused").
- T13/T15 move/join: "occupied → refused"  -  a destination table that is not free or does not fit is not offered as a candidate at all (actions.md: "non-candidates disabled").
- T16 merge: only within the same party; other parties and any check with a payment attempt already open are not candidates (v3.1-corrections.md, page 47 correction).
- T11 send/ack: a station that never confirms is retried a bounded number of times and never silently resent once already acknowledged  -  "unconfirmed station → bounded retry; never resend acked" (actions.md).
- T18: a paid check is locked  -  no further split is offered once settled (actions.md: "paid check locked").
- Q07: a second guest opening the pay screen after the bill is already settled sees "already paid," never a duplicate charge prompt.
- T08 waitlist (when built): per B06/K07 in appointments.md, an offer must show as expired rather than silently disappear.
- General floor state: v3.1-corrections.md's page-45 fix is the standard for what "after a move" must show  -  the real elapsed time from original seating, the correct new table label, and the origin table marked "Needs reset," never a stale "Free."

## 5. Definition of done

The one journey that must pass end to end on the QA host: a host seats a walk-in party of four (T07) that requires joining two two-tops (T15), a server builds and sends a multi-course order (T09→T10→T11) with at least one kitchen acknowledgment observed, the party is moved once mid-meal (T13→T14) with the same visit and check following them, the check is split by item for two separate payers (T18) and both settle through the shared payment state, and the table resets (T24) and reappears as free on T01. Guest QR ordering (Q01–Q05) and the waiting list (T08) are separate acceptance passes; the waiting list specifically cannot ship until the missing table named in §3 exists.
