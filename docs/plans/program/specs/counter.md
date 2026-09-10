# Counter: the point of sale counter sale, from empty basket to receipt

Source: `docs/plans/program/pos/`  -  screen-index.md, actions.md, modes.md, decisions.md, v3.1-corrections.md, coverage-matrix.md. Data verified against `supabase/migrations/*.sql` and `web/src/lib/pos/*`, `web/src/app/(workspace)/[tenantSlug]/admin/pos/*` in this worktree on 2026-09-09. Payment-state screens (M01–M33, D01–D08) are documented in money.md and referenced here, not repeated.

## 1. The journey

A cashier is trying to ring up a sale  -  retail items, food, a session credit, a booking balance, whatever the business sells  -  attach it to a customer if one applies, apply a discount or a manager-approved custom amount when needed, and collect payment, all fast enough to keep a line moving. The customer may be anonymous, an existing record, or created on the spot. A scanner may add items directly. The sale may be held and resumed, or it may end at a card reader that leaves the outcome unknown, at which point the cashier must not be able to charge the same sale twice.

## 2. Screens in this slice

1. **C01** Start  -  the counter's home state. Next action: start a new sale.
2. **C02** New sale · empty  -  a fresh, empty basket. Next action: add an item.
3. **C03** Counter  -  the working basket. Next action: Charge.
4. **C04** Item options  -  required modifier choices. Next action: Add.
5. **C05** Item options · missing choice  -  Add is disabled with a stated reason.
6. **C06** Customer · search  -  find an existing customer.
7. **C07** Search · keyboard open  -  same screen, footer stays above the keyboard.
8. **C08** Customer · create & return  -  create one and attach by id.
9. **C09** Customer · create · keyboard open.
10. **C10** Customer · saved but not attached  -  attach failed; retry reuses the same customer id rather than creating a duplicate.
11. **C11** Link a booking  -  attach the sale to an existing booking's balance.
12. **C12** Edit a line  -  quantity, notes; blocked once the line is sent (see tables.md T20 for the sent-item case).
13. **C13** Discount  -  code, manual, or comp, with a stated reason.
14. **C14** Custom amount  -  a free-text priced line.
15. **C15** Manager approval · wrong PIN  -  the custom-amount-over-limit gate.
16. **C16** Hold sale  -  park the current draft.
17. **C17** Held place expired  -  a held session/class place's own timer ran out.
18. **C18** Sold out while charging  -  capacity vanished between basket and charge.
19. **C19** Pick a class session  -  attach a session to a line.
20. **C20** Use a pass credit  -  redeem a credit against a line. **Blocked: no credit ledger (see §3).**
21. **C21** Orders  -  open/held/website-pickup orders.
22. **C22** Someone else changed this sale  -  a concurrent-edit conflict.
23. **C23** Scanner ready.
24. **C24** Scan result · product added.
25. **C25** Website pickup · hand over.
26. **C26** Pickup · already handed over  -  duplicate-handoff guard.
27. **C27** Counter · offline.
28. **C28** Counter · Spanish, long names.
29. **C29** Counter · portrait tablet.
30. **C30** Measured quantity  -  a by-weight/by-volume line.
31. **C31** Return · restock or waste.
32. **C32** Location not ready · setup path.

## 3. Data per screen

- **C01–C03, C12 (basket)**: `lib/pos/draft.ts` (confirmed present) persists the in-progress sale as an `orders` row (`status = 'draft'`) with `order_lines`. `orders.version` (confirmed column) is the optimistic-concurrency guard: every mutation writes `WHERE version = :expected`, which is exactly what C22's conflict screen surfaces on a lost update.
- **C04–C05 item options**: `lib/pos/addons.ts` (confirmed present) prices required/optional modifier groups against `talent_offerings`/`talent_offering_variants`/addon rows, writing `order_lines.variant_id`/`addon_ids` (confirmed columns) plus a snapshot of what was chosen and its price at the time.
- **C06–C10 customer**: `customers` (confirmed table: tenant-scoped, `email`/`phone_e164`/`display_name`, `user_id` nullable) via `lib/customers/ensure-customer.ts` (confirmed present)  -  the "save once, attach by id, retry attachment without duplicating" pattern (cross-surface.md) means C10's retry reuses the same `customers.id` rather than inserting a second row, per actions.md: "attach failure → C10 retry (same id)."
- **C11 link a booking**: attaches the sale's lines to an existing `agency_bookings`/`booking_talent` receivable (task POS-2.6 per actions.md  -  "booking-shell" work). `lib/orders/booking-shell.ts` is confirmed present on this branch. "Other seller not selectable" (actions.md) means the picker must filter to bookings owned by the current seller/tenant.
- **C13 discount**: `lib/orders/promo-eligibility.ts` and `promo-resolve.ts` (both confirmed present), `discount_redemptions` (confirmed table, `supabase/migrations/20261123010300_discount_redemptions.sql`) records the redemption; `order_lines.discount_cents`-equivalent allocation is per-line per actions.md ("allocation per line; redemption").
- **C14–C15 custom amount + approval**: a free-priced `order_lines` row (no `offering_id`) flagged as custom, gated above a limit by a manager PIN check against `agency_memberships`/`staff_permissions` (see people.md). The approval record itself  -  **unverified** whether it is a distinct row (an approval log) or only implied by which user's session authorized the write; would verify by reading the actual POS-2.4 command. Audit finding F29 ("custom amount is being used as an unstructured deposit," Design pending) is an open correction against this pair of screens specifically  -  a custom amount is not yet distinguished from a deposit in the design.
- **C16–C17 hold/expired**: the draft `orders` row persists (`lib/pos/draft.ts`) with no special hold table; a *held class place* is a separate thing from the held sale  -  its expiry is the `capacity_allocations.expires_at` on whatever hold the class pick (C19) created, not the sale draft's own state. C17's screen therefore reads two different expiries depending on what triggered it: the sale draft never expires on its own (P06/P08 in actions.md), but a capacity hold inside it does.
- **C18 sold out while charging**: re-reads `capacity_pools`/`capacity_allocations` remaining units at charge time and refuses the charge if a hold has since expired or been outbid  -  this is the same mechanism C17 depends on, checked at a different moment.
- **C19 pick a class session**: `sessions`, `capacity_pools`/`capacity_allocations` (`subject_kind = 'session_tier'`)  -  see appointments.md §3 for the same tables in the appointments context.
- **C20 use a pass credit**: **Not in the database yet.** Same gap as appointments.md's K03/K04/K05  -  no credit/entitlement ledger table exists. C20 cannot be built against real data until that table exists; it is listed here as blocked for that reason, not because the counter-side UI is hard.
- **C21 orders**: reads `orders` filtered to `status IN ('draft','pending_payment','paid')` plus `preparation_tickets`/fulfilment state for the website-pickup case (see tables.md §3 for `preparation_tickets`).
- **C22 conflict**: surfaces the `orders.version` mismatch described under C01–C03 above.
- **C23–C24 scanner**: product lookup against `talent_offerings`/catalog by a scanned code; "one outcome per screen" (actions.md) means a scan either adds exactly one line or shows exactly one refusal, never an ambiguous partial state.
- **C25–C26 pickup handoff**: reads an already-`paid` `orders` row plus its `preparation_tickets` (`destination = 'pickup'`), writes handed-off quantities; C26's duplicate-handoff guard depends on `preparation_tickets.handed_off_at` (confirmed column) being set once.
- **C27–C29 device/locale/orientation states**: no new data; same `orders`/`order_lines` tables under different connectivity, language, or layout conditions. C27 (offline) is the D-POS-5 "cash-only degraded mode"  -  decisions.md rules a full local capacity model out of launch scope, so C27 must not attempt to hold or sell capacity-limited items while offline.
- **C30 measured quantity**: `order_lines.units` is `NUMERIC(12,3)` (confirmed, not an integer) specifically so a by-weight/by-volume line (0.350 kg, say) is representable without rounding to a whole unit.
- **C31 return**: **Unverified** whether a return writes a negative `order_lines`/refund row versus a dedicated returns/restock table; would verify by reading the actual return command once written. Restock-vs-waste as a stated choice (not just "refunded") is the design's own distinction and has no confirmed table backing it either way.
- **C32 location not ready**: reads whatever readiness signal Settings › POS (W20) computes; audit finding F20 ("setup readiness is not the same thing as device pairing," Design pending, "readiness per action (W20, C32)") is an open correction  -  C32 is not yet drawn to reflect per-action readiness rather than one global ready/not-ready flag.

## 4. Refusals and empty states

- C03: Charge is disabled on an empty sale, and disabled again (loading) while an attempt is already open (actions.md, "Charge $X" row).
- C05: Add is disabled with the specific missing choice named, not a generic "incomplete" message.
- C10: attach failure retries against the same customer id  -  never silently creates a second customer record for the same person.
- C13: "Apply disabled if not combinable"  -  a discount that cannot stack with one already applied is refused before charge, with the rejection reason shown (actions.md).
- C15: a wrong manager PIN shows tries remaining, and denial "returns unchanged"  -  the custom amount is not partially applied on a failed approval.
- C17: an expired hold on a class place is shown as expired, not silently re-offered as available.
- C18: sold-out-at-charge must never charge for a unit that is no longer held  -  the charge itself is refused, sale intact, per the same rule M07 (decline) uses ("sale intact").
- C22: a conflicting concurrent edit is shown as a named conflict, never silently overwritten (the `orders.version` mechanism above is what makes this detectable).
- C26: a second attempt to hand over an already-handed-off pickup is refused, not repeated.
- C27 offline: card payment is unavailable (per D-POS-5's cash-only degraded scope); anything requiring a live capacity check must refuse rather than guess.
- General: v3.1-corrections.md's keyboard/footer rule applies directly to C07 and C09  -  the footer (and its primary action) stays visible above an open on-screen keyboard, and the same PIN-pad-reduction rule applies to C15.

## 5. Definition of done

The one journey that must pass end to end on the QA host: a cashier starts a new sale (C02), adds an item with a required modifier choice (C04), attaches an existing customer found by search (C06→C03), applies a combinable discount (C13), holds the sale and resumes it (C16→C01→C03, sale intact and unchanged), then charges by cash through the shared payment state (money.md) to a receipt (M13/M14). A second, separate proof: a sale is charged while its held class-session capacity has just expired, and the charge is refused (C17/C18) rather than silently succeeding. Scanner-driven add (C23/C24), pass-credit redemption (C20), and returns (C31) are excluded from this pass's done bar  -  C20 because its backing table does not exist, C23/C24 and C31 because they were not exercised in verifying this document and should be proven separately before being marked done.
