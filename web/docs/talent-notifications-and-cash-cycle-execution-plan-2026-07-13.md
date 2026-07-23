# Execution Plan — Talent Job-Info Delivery + Cash Cycle + Offer Follow-ups

**Date:** 2026-07-13
**Owner:** Oran (product) · engineering pickup
**Source:** live testing this session (offer→booking flow on the real rail, prod DB) + the offer-conversation hardening program (W0–W4) follow-ups.

This is the full backlog of gaps found and suggestions made. Each item is written to be executed independently: **What / Why / Where / How / Acceptance / Effort**. Groups are ordered by priority. Nothing here is a blocker on what already shipped — these are additive hardening + polish.

---

## Context you should know before starting

- **The money + job DATA is already correct.** Offer line items carry the talent's net rate, call time, wardrobe, transport notes; the inquiry carries event date, location, brief. The commission snapshot math is proven (`talent_net + workspace_fee + platform_fee === gross_charged`). These items are about *delivery and UX*, not correctness of the data.
- **Convert-to-booking is a separate coordinator step** (`convertToBooking`), NOT automatic once all parties accept. An inquiry sits at `status='approved'` until the coordinator confirms. This is by design; see D1 on whether the CTA is obvious enough.
- **Notification system map:** catalog entries live in `web/src/lib/notifications/catalog-entries-inquiry.ts` (+ `-billing.ts`); audience resolvers in `web/src/lib/notifications/catalog-audiences.ts`; in-app rows land in `user_notifications(user_id, kind[system|message|payment], origin_kind, origin_inquiry_id, title, body)`. An entry's `defaultChannels` decides email vs in_app.
- **Test-data caveat:** the impronta tenant currently resolves the inquiry **coordinator to a rostered talent's own user** (Sofía Herrera, `20057931…`). That collision makes per-role notification tests read falsely (a user doesn't get both the coordinator AND talent notification for one event). Fix A3 first so the other talent items can be verified cleanly.

---

## GROUP A — Talent receives all job information (the "make sure talent got it" ask)

### A1. `inquiry.submitted.talent` is email-only — add an in-app channel
- **What:** When a talent is added to a new inquiry they get an email only; nothing appears in the app's notification bell.
- **Why:** Talents live in the app, not their inbox. If Resend is unconfigured (or the talent ignores email), they never learn they were added to a job. Every other party gets an in-app row.
- **Where:** `web/src/lib/notifications/catalog-entries-inquiry.ts` — entry `inquiry.submitted.talent` (~line 111). Currently `defaultChannels: ["email"]`.
- **How:** Change to `defaultChannels: ["email", "in_app"]`. Provide the in-app title/body (e.g. title "You've been added to a job", body = contact name + event date + location). Confirm the `user_notifications` row writes with `origin_kind='inquiry.submitted'` and `origin_inquiry_id` set.
- **Acceptance:** A talent added to an inquiry gets a `user_notifications` row (kind visible in the bell) AND the email. Verify with a talent whose user ≠ coordinator (needs A3).
- **Effort:** S (1 line + copy + 1 test).

### A2. No `offer.sent.talent` — talent isn't proactively told an offer with their rate is waiting
- **What:** `offer.sent.client` exists; there is **no** `offer.sent.talent`. When a coordinator sends an offer that prices a talent — and whose conversion **requires that talent's approval** — the talent gets no dedicated push. They currently learn only via the generic group-thread message "You've received an offer."
- **Why:** The talent is a required approver. Asking them to approve an offer they were never structurally notified about is the single biggest job-info gap. A rich notification (their net rate + call time + event) closes it.
- **Where:** add a new entry in `catalog-entries-inquiry.ts` mirroring `offer.sent.client` (~line 137); audience = the offer's priced talents. Trigger already emitted: `ENGINE_EVENT_TYPES.OFFER_SENT` in `web/src/lib/inquiry/inquiry-engine-offers.ts` `sendOffer` (~line 649). Audience resolver: reuse/extend `allRosterTalent` in `catalog-audiences.ts` (resolves `resolveInquiryRecipients().talentUserIds`), but scope to talents **priced on this offer** (join `inquiry_offer_line_items.talent_profile_id`).
- **How:** New `CatalogEntry` `offer.sent.talent`, `category: "offers"`, `defaultChannels: ["email","in_app"]`, `triggers: ["offer.sent"]`, hydrate the offer + the recipient's own line item so the email shows THEIR net rate (never the client total). New email template (mirror `TalentInquiryInvited`) → "You have an offer to review — $<net>, <event date>". Deep link to `/talent/inbox/<inquiryId>` Offer tab.
- **Acceptance:** Sending an offer that prices talent T produces an in-app + email notification to T containing T's net rate and the event, and T only. Client still gets `offer.sent.client`. Verify no double-notify when T is also the coordinator (dedupe).
- **Effort:** M (new entry + audience scope + email template + tests).

### A3. Tenant coordinator resolves to a rostered talent — RESOLVED: NON-ISSUE (audited 2026-07-13)
- **Verdict:** Not a bug. `agencies.default_coordinator_user_id` for impronta is **`null`** (unset); real inquiries correctly fall back to the workspace owner `bfe72e1e`. Sofía Herrera showed up as coordinator only in my test because she is a **`manager`** on impronta (a hybrid talent-manager), so she self-coordinates inquiries about herself — that is the intended hub self-coordination behavior, not a misconfiguration.
- **Impact on A1/A2:** the "talent notification deduped to zero" I saw was correct behavior for a hybrid (you don't double-notify the same person as both coordinator and talent). A1/A2 remain valid as catalog-level improvements — verify them against a **pure** talent (e.g. More, `da74b80e`, who is talent-only), not a talent-manager.
- **Action:** none. No config change.

### A4. Verify `booking.confirmed.talent` carries the full job brief
- **What:** `booking.confirmed.talent` is wired (email + in_app), but this session couldn't drive a real conversion to confirm its payload end-to-end (the harness actor lacked convert permission; see D1).
- **Why:** Booking confirmation is the talent's "this is really happening" moment — it must carry date, location, call time, their net, and the confirmed status.
- **Where:** `catalog-entries-inquiry.ts` `booking.confirmed.talent` (~line 193) + its hydrate.
- **How:** Drive a full convert (coordinator-of-record actor) in a harness or on localhost, assert the talent's `user_notifications` row + email content includes the job brief + net.
- **Acceptance:** On convert, talent T gets `booking.confirmed.talent` with correct date/location/net.
- **Effort:** S (verification; fix only if payload is thin).

---

## GROUP B — CDMX demo offer + cash/efectivo cycle (in progress, interrupted)

### B1. Populate + send the CDMX demo offer — DONE (verified 2026-07-13)
- **Status:** Complete. Offer `e9905b2f` is populated + `sent`: 3 talents in USD — More ($700/day ×2 = $1,400, net $1,120), Sofía ($600×2 = $1,200, net $960), Anto ($600×2 = $1,200, net $960); **total $3,800, line-sum matches**; travel baked into each line ("Rate includes return CDMX flight + 2 nights lodging"); 30% deposit ($1,140). Owner can approve as-is.
- Original spec (kept for reference):
- **What:** The staged CDMX demo inquiry `44b6d1f4-54a7-4546-98da-87f82a34a924` (More + 2 girls, 2-day Mexico City trip, event 2026-09-05); offer shell `e9905b2f-6548-4b78-9744-7ccb2ec0af27`. Coordinator assigned (`bfe72e1e`).
- **Why:** So there's a real, populated offer the owner can approve to demo the full loop; also the concrete artifact answering the multi-talent + baked-in-travel scenario.
- **Where:** engine `updateOfferDraft` + `sendOffer` in `web/src/lib/inquiry/inquiry-engine-offers.ts`; run headless via the `register-server-only-test.cjs` shim (see `scripts/qa-offerings-e2e.mts` for the pattern).
- **How:** Build line items: More (day rate ×2), Girl-2 (day ×2), Girl-3 (day ×2), each in **USD**, with **travel baked into the line total** and stated in the line `notes` (per decision D2 — no separate expense-line feature). 30% deposit term. Then `sendOffer`. Talents must have user accounts to receive notifications (More `da74b80e`, Sofía `20057931`; the 3rd needs an account or it silently can't be notified).
- **Acceptance:** CDMX offer has 6 line items (or 3 talents × structure), USD, non-zero total, `status='sent'`; owner sees it in the app and can approve.
- **Effort:** S–M (script; talent-account check).

### B2. End-to-end Cash / Efectivo payment cycle test
- **What:** Prove the full offer→booking→**cash**-collection loop: coordinator offer → client + talent accept → `convertToBooking` → payment method **cash** → `markPaid` → off-platform balance accrues.
- **Why:** Mexico market is cash-heavy; cash is an **off-platform** method (`isOffPlatformPaymentMethod('cash')` = true, `web/src/lib/billing/commission.ts:481`). Must prove: no Stripe charge attempted, commission snapshot still correct, workspace balance-owed increments, booking flips to paid/confirmed.
- **Where:** `convertToBooking` (`inquiry-engine-booking.ts:131`), transaction lifecycle `requestPayment`/`markPaid` (`web/src/lib/bookings/transactions.ts:430/470`), mark-as-cash action (`_pipeline-actions.ts` — `markInquiryPaymentReceived`, `createInquiryTransactionDraft`). Note the newly-merged fix **#819** (pay-in-person booking is ledgered cash, not card).
- **How:** Headless harness (mirror `qa-offerings-e2e.mts`): create inquiry → offer → both accept → convert (actor = coordinator-of-record) → create/settle a cash transaction → assert booking `payment_status`, off-platform balance, snapshot invariant, and that no Stripe PaymentIntent was created.
- **Acceptance:** Cash booking ends `paid`/`confirmed`; `talent_net+workspace_fee+platform_fee===gross`; workspace balance-owed += net; zero Stripe calls.
- **Effort:** M (harness + assertions). Clean up test rows after (never `qa-client-1/2`).

---

## GROUP C — Offer-conversation hardening follow-ups (deferred from W0–W4 PRs)

### C1. Send-gate cross-component wiring (W0-3)
- **What:** The `canSendOffer()` gate (`offer-save-state.ts`) exists but isn't fully wired across the editor components — a coordinator can still attempt send in edge states.
- **Where:** `web/src/components/admin/shell/internal/messages/shared/` (machinery-11 + offer-save files).
- **Acceptance:** Send is disabled with a reason whenever the offer is unsaved/empty/not-editable; enabled otherwise.
- **Effort:** S.

### C2. Live offer status chip (W0-4)
- **What:** A live "saved / saving / error" status chip on the offer editor (companion to the save banner already shipped in W0).
- **Where:** same offer-editor cluster; reuse `OfferSaveState`.
- **Acceptance:** Chip reflects real-time save state; matches the banner.
- **Effort:** S.

### C3. Rich guest offer card renders label + note (W2-3)
- **What:** The guest-facing offer card should render the editable line **label + note** (travel baked-in context) that W2 made editable — so the client sees "Day rate (incl. travel)" not a bare number.
- **Where:** guest offer card renderer under `web/src/app/t/[profileCode]/_chat/`.
- **Acceptance:** Guest offer card shows each line's label + note.
- **Effort:** S.

---

## GROUP D — UX observations to decide on (not clearly bugs)

### D1. Is "convert to booking" discoverable enough? — AUDITED 2026-07-13 (owner decision pending)
- **Finding:** convert is reachable but not loud. Once every party accepts, the inquiry sits at `status='approved'`; the coordinator converts via a **status action labeled "Move to Booked"** (`admin-1.tsx:505` → `convertInquiryToBookingAction` → atomic `engine_convert_to_booking` RPC). It works, but there's no prominent auto-surfaced "everyone approved, confirm the booking" primary CTA the moment approvals complete. Talent side is transparent ("You've approved this offer; waiting on the other parties" / "You're booked at this rate").
- **Decision needed (owner):** is "Move to Booked" enough, or add (a) a prominent "Ready to book" CTA that auto-surfaces on approvals-complete, and/or (b) a stale-approved nudge (like the W3 unowned-inquiry bell) when an inquiry sits `approved` for N hours unconverted? If yes → build.
- **Effort:** M (if adding CTA + nudge).

### D2. Audit tenant coordinator config across all tenants — DONE: CLEAN (2026-07-13)
- **Finding:** No tenant has a talent-only user as `default_coordinator_user_id`. Almost all are unset (fall back to owner); only the QA tenant `qa-agency` has one set (`4b9e595d`), which is fine. No action.

---

## GROUP E — Money-path bugs found by the B2 cash test (NEW, need owner decision)

The cash cycle PASSED (money invariants hold in both talent-direct and workspace-seller lanes), but the harness surfaced two real bugs. Both are money-engine changes — **flagged for owner sign-off before building** (higher risk than the additive work above; F2 likely needs a migration).

### E1 (was F1) — hybrid self-coordination breaks the offer flow
- **Repro:** when an inquiry's `coordinator_id` resolves to a user who is ALSO a priced talent on that inquiry (a hybrid talent-manager self-coordinating — e.g. impronta's Sofía/MORENA), that one user holds two `inquiry_participants` rows (roles `talent` + `coordinator`). `loadParticipant`'s `.maybeSingle()` by `user_id` then returns null (multiple rows), so `create_offer` AND the talent's own approval both return **`forbidden`**. The offer flow cannot run until coordination is reassigned to a non-talent user.
- **Impact:** any hub self-coordination scenario (talent owns/manages the workspace and prices themselves) is blocked. The normal case (owner coordinates, prices other talents — like the CDMX demo) is fine.
- **Fix options:** (a) make participant resolvers role-scoped (`.eq("role", …)` + handle multi-role users) so one user with two roles resolves deterministically; and/or (b) coordinator assignment skips a user who is a priced talent on the same offer. Prefer (a) — it's the root cause.
- **Where:** `inquiry-engine-approvals.ts` / `inquiry-engine-offers.ts` participant resolution (`loadParticipant` + the `create_offer`/approval permission checks). **No migration.**
- **Effort:** M. **Corrects the earlier A3 "non-issue" note** — the config is fine, but this runtime multi-role collision is a real bug.

### E2 (was F2) — cash-only workspaces (no Stripe) cannot settle a cash booking
- **Repro:** `booking_transactions` cannot leave `draft` → `payment_requested` without a `payout_receiver_id` (FK → `payout_accounts`), and `agency_bookings.payment_status='paid'` is only set by `markPaid` → `applyBookingPaymentSync`. So a cash-only workspace with **no connected payout account** (impronta today) literally cannot mark a cash booking paid — even though cash is off-platform and no Stripe payout occurs. The harness had to provision a temporary manual receiver to complete the cycle.
- **Impact:** HIGH for the Mexico / cash-first market. An agency that only takes cash and hasn't connected Stripe cannot record a cash payment at all. This is the most important finding.
- **Fix:** allow off-platform methods (`isOffPlatformPaymentMethod` = cash/wire/venue_paid/crypto/other) to reach `payment_requested`/`paid` WITHOUT a `payout_receiver_id` (there is no payout to route). Likely relax the transaction gate + possibly the FK/NOT-NULL (migration) so cash transactions don't require a receiver.
- **Where:** `src/lib/bookings/transactions.ts` (`requestPayment`/`markPaid`/`applyBookingPaymentSync` gates) + the `booking_transactions.payout_receiver_id` constraint. **May need a migration.**
- **Effort:** M–L (money code + migration + tests). **Recommend prioritizing** for the cash market.

## Execution status (2026-07-13, autonomous run)
- **A1** — dropped (redundant; engine `buildInquiryBells(["talent"])` already bells talents in-app on submit).
- **A2** — SHIPPED PROD, PR #825 (`offer.sent.talent`: email + in-app with the talent's own net rate; audience = talents priced on the offer; never leaks the client total or another talent's rate).
- **A3 / D2** — audited, non-issue / clean (see above).
- **A4** — pending live verification against a pure talent (More) now that A2 is on prod.
- **B1** — done + verified (CDMX offer $3,800, sent).
- **B2** — in progress (headless cash-cycle proof).
- **C1 / C2 / C3** — SHIPPED PROD, PR #826 (send-gate wiring + live status chip + guest card label/note; guest enrichment reads only label/notes/total_price, never `talent_cost`).
- **D1** — audited; owner decision on a louder convert CTA.
- **NEW follow-up (found by C-agent):** `dashboard.adminTabs.lineup.lineLabelPlaceholder` / `lineNotePlaceholder` are referenced in the offer editor but missing from every message catalog, so they render as the raw dotted key. Add the EN/ES/FR strings. Effort: S.

## Suggested execution order

1. **A3** (unblocks clean testing) → **A1**, **A2**, **A4** (talent job-info delivery — the core ask).
2. **B1** (populate CDMX demo) → **B2** (cash cycle proof).
3. **C1–C3** (offer-editor polish) in parallel — independent, small.
4. **D1** (convert CTA discoverability) — decide, then build if warranted.

Everything ships branch-off-main → PR → `db:push` if any migration → smoke. No item requires a schema change except possibly A2 (none expected — catalog entries are code, not DB).
