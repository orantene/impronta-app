# Messages ⇄ Inquiry → Booking → Payment — Handoff (2026-06-15)

Handoff for the agent improving the **messages experience**. It maps how an inquiry
becomes a booking and gets paid, and **how every step of that surfaces inside the
chat thread** (the cards you'll be improving). Written after a session that (a)
shipped the talent **services menu** which now feeds the offer composer, and (b)
ran a full **payment-lifecycle test sweep** (10 scenarios, all green, real Stripe
test transfers). File:line references are accurate as of `main` @ this date.

---

## 1. The spine: inquiry → offer → approval → convert → pay → payout

Every state transition is a Postgres-RPC-backed engine call. The whole thing is
driven by **three actors on one inquiry**: the **client**, the **workspace admin/
coordinator** (staff), and the **talent(s)**. Each sees the same inquiry through a
different shell.

| Step | Engine fn (file) | RPC | What it does |
|---|---|---|---|
| Submit | `submitInquiry` (`src/lib/inquiry/inquiry-engine-submit.ts:216`) | — | creates `inquiries` (status `submitted`), client participant + one `talent` participant per id (status `invited`) |
| Create offer | `createOffer` (`inquiry-engine-offers.ts:310`) | `engine_create_offer` | draft `inquiry_offers` + auto-seeded $0 line items |
| Edit offer | `updateOfferDraft` (`inquiry-engine-offers.ts:691`) | — (TS insert) | **wholesale delete+reinsert** of `inquiry_offer_line_items`; line items are inserted in plain TS, **no RPC** |
| Send offer | `sendOffer` (`inquiry-engine-offers.ts:528`) | `engine_send_offer` | flips offer→`sent`, activates priced talents, **seeds `inquiry_approvals` for the canonical set = client + every talent with a line item** |
| Approve | `submitApproval` / `talentRespondToOffer` (`inquiry-engine-approvals.ts:27/156`) | `engine_submit_approval` | per-participant accept/reject; when ALL accepted → offer `accepted`, inquiry `approved` |
| Convert | `convertToBooking` (`inquiry-engine-booking.ts:129`) | `engine_convert_to_booking` | creates `agency_bookings`. **Hard-requires `auth.uid() == p_actor_user_id`** → must run under a real session, NOT service-role |
| Snapshot | `persistBookingCommissionSnapshot` (`src/lib/billing/commission-engine.ts`) | — | writes `booking_commission_snapshot` (the 3-way split). Without it the talent never gets paid |
| Request pay | `requestPayment` (`src/lib/bookings/transactions.ts:376`) | — | txn `draft`→`payment_requested`; **emits `payment_request` card**. No Stripe call |
| Charge | `createPaymentIntentForTransaction` (`src/lib/payments/stripe-payment-intent.ts:68`) | — | the client's real PaymentIntent (from the Pay sheet) |
| Settle | `markPaid` (`transactions.ts:416`) | — | txn→`paid`; updates `agency_bookings` lifecycle; **emits `payment_paid` + `booking_confirmed` (or `balance_due`) cards**; fires `executeBookingTransfers` (non-deposit) |
| Payout | `executeBookingTransfers` (`src/lib/payments/transfers.ts:141`) | — | real `stripe.transfers.create` per snapshot leg → talent + workspace connected accounts |

**Instant-book (6.4)** (`src/lib/inquiry/instant-book-engine.ts:158`) runs the whole
front half in one call (submit→offer→send→auto-approve→convert→snapshot→
createBookingTransaction→requestPayment) under the client's session, then the
client pays via the normal Pay sheet.

---

## 2. The message data model (what the chat reads/writes)

- **Table:** `inquiry_messages` (`supabase/migrations/20260520102000_phase2_inquiry_messaging.sql:10`).
  Key columns: `inquiry_id`, **`thread_type`** (`private` | `group`), `sender_user_id`
  (null = system), `body`, **`message_kind`**, **`card_payload`** (jsonb, per-kind),
  `metadata`, `created_at`, `edited_at`, `deleted_at`.
- **Two threads per inquiry:**
  - `private` = client ↔ staff/coordinator (carries money amounts).
  - `group` = booking team (staff + assigned talents) — money cards mirrored here are **amount-free** (talents shouldn't see the client's gross).
- **Read tracking:** `inquiry_message_reads` (inquiry_id, thread_type, user_id).
- **Participants:** `inquiry_participants` (role `client|talent|coordinator|admin`, status `invited|active`).

### `message_kind` set
`text`, `offer_event`, `payment_request`, `payment_paid`, `booking_confirmed`,
`balance_due` (deposit flow), `talent_rate_confirmed`, `talent_rate`,
`coordinator_request`, `call_sheet_update`, `booking_status`, `system_event`,
`admin_suggested_talent`. (Several are reserved/future — see the migrations
`20260513214948_*`, `20260601155328_*`, `20260614022616_*`.)

---

## 3. Where each card is EMITTED (engine → thread)

| Card | Emitted by | File:line | Thread(s) |
|---|---|---|---|
| `offer_event` (sent) | `sendOffer` | `inquiry-engine-offers.ts:641` (private) + `:656` (group, amount-free) | both |
| `offer_event` (accepted) | `talentRespondToOffer` | `inquiry-engine-approvals.ts:237` | group |
| `payment_request` | `requestPayment` | `transactions.ts:392` | private |
| `payment_paid` | `markPaid` | `transactions.ts:448` (private) + `:504` (group) | both |
| `booking_confirmed` | `markPaid` (full/balance) | `transactions.ts:484` (private) + `:515` (group) | both |
| `balance_due` | `markPaid` (deposit) | `transactions.ts:463` | private |
| `admin_suggested_talent` | `admin-suggested-talent.ts` | — | private |
| `system_event` | `client-add-talent-actions.ts` etc. | — | varies |

All card emits are **fire-and-forget** (a failed card never blocks the money/state
transition). That's a deliberate resilience choice — worth knowing when you debug
"why didn't a card appear."

---

## 4. Where cards are RENDERED (the UI you'll improve)

Three surfaces, each with a `message_kind → component` dispatcher:

- **Admin / coordinator:** `src/components/admin/shell/internal/messages/admin-3.tsx` →
  `renderChatCardForMessage()` at **:302-419**. Tabs/sheets: Lineup · Offer · Booking ·
  Logistics · Details · Files. Offer composer lives here (see §5).
- **Talent:** `src/components/admin/shell/internal/messages/talent-1.tsx` + `talent-2.tsx`
  (group thread always; private only if the talent self-coordinates). Pay CTAs suppressed.
- **Client:** `src/app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx`
  client dispatcher at **:3330-3378**. This is the only surface with **Pay now** /
  **Pay balance** CTAs.

**Shared card components:** `src/components/chat-cards/ChatCard.tsx` — `OfferCard`
(:189), `PaymentRequestCard` (:228), `BookingConfirmedCard` (:270), `BalanceDueCard`,
`TalentRateCard`, `CoordinatorRequestCard`, `CallSheetUpdateCard`, `SystemEventCard`,
`SuggestedTalentCard`. **Improve cards here once; all three surfaces inherit it.**

**Role-safety rule (do not break):** the private-thread money cards carry amounts;
the group-thread mirrors are amount-free; talents never get a Pay CTA; staff-only
cards (`coordinator_request`, `talent_rate`, …) never render on the client surface.

---

## 5. Offer composer + payment UI inside messages

- **Offer composer (staff):** `OfferDraftEditor` in
  `src/components/admin/shell/internal/messages/shared/machinery-11.tsx:388`. Renders
  only for admin + `offer.status='draft'`. Add/edit/remove line items (talent picker,
  pricing unit, units, unit price, talent cost). **Total auto-sums from line items —
  never hand-typed** (so shown = charged = booked). Save → `saveOfferDraft` →
  `updateOfferDraft`.
- **Pay sheet (client):** `src/components/chat-cards/PayNowSheet.tsx:47` →
  `createInquiryPaymentIntent` (`src/lib/server-actions/client-pipeline.ts:292`) →
  Stripe PaymentElement → `confirmPayment`. Webhook → `markPaid`.
- **Services-menu picker (staff, NEW this session):**
  `src/components/admin/shell/internal/messages/shared/line-service-picker.tsx` — per
  line, lazy-loads the selected talent's services menu and prefills label +
  pricing_unit + unit price from a priced service. Stamps `source_service_id` on the
  line (`machinery-11.tsx` onPick → save).

---

## 6. The commission model (what the cards represent in money)

The `booking_commission_snapshot` produces one leg per participant. Per leg:
`gross_charged_cents`, `talent_net_cents`, `workspace_fee_cents`, `platform_fee_cents`,
`client_surcharge_cents`, `seller_deduction_cents`, `platform_take_bps`.

`gross = talent_net + workspace_fee + platform_fee`. Default platform take = **600 bps
(6%)** split as a **3% client surcharge (added on top)** + **3% seller deduction (from
the workspace margin)**. Line items carry `unit_price` (client, **per unit**) and
`talent_cost` (talent net, **per unit** — guard: `talent_cost ≤ unit_price`); totals =
×`units`.

Worked example proven live this session — **3 talents × 3h @ $20/hr**:
```
CLIENT pays (gross):      $222.48
  → 3 TALENTS receive:    $180.00   ($60 each, full $20/hr — real transfers)
  → IMPRONTA (workspace): $29.52    commission (real transfer to agency acct)
  → TULALA (platform):    $12.96    6% fee (kept on platform balance)
```

---

## 7. What this session shipped (context for your work)

- **Talent services menu** (a "menu of services": per hour/day/event/person/package/
  custom + add-ons/tiers/bundles + per-discipline scoping). It is **catalog-native**
  (`commerce.servicesMenu`) and now **feeds the offer composer** (the line-service
  picker, §5) and **instant-book**. See `project_talent_services_menu` memory + PRs
  #403/#407/#408/#410/#411/#412/#413/#418/#420/#423.
- **S18 audit stamp:** `inquiry_offer_line_items.source_service_id` records which
  service prefilled a line (set by the picker + instant-book). **Persisted but NOT yet
  shown in the offer card** → a concrete UX opportunity for you (surface "from
  <service>" on the offer line / offer card).
- **Payment-lifecycle test sweep (10 scenarios, all green, Stripe TEST mode):**
  real charge + commission invariant + bad-destination rejection; held→release;
  real settled transfer + idempotency; deposit→balance; instant-book; coordinator
  reassign; client picker; off-platform; refund→reversal (full + partial); and the
  3-talent full loop above. Harnesses in `web/scripts/_sandbox/*.ts` (engine, run with
  the server-only shim) + `web/scripts/qa-*.mjs` (pure-Stripe). See §9.

---

## 8. Opportunities / known gaps for the messages experience

These are concrete, verified starting points (not vague):

1. **Offer card doesn't surface `source_service_id`** — the data is there; show "from
   <service name>" on the offer line so client/talent see what was booked.
2. **`balance_due` deposit flow** (6.3) — the deposit card + "Pay balance" CTA exist
   (`ClientMessagesShell.tsx:3353`); the second (balance) charge is a separate
   transaction. Worth a UX pass on the deposit→balance journey in-thread.
3. **Group-thread amount-free mirrors** — talents see milestone cards without amounts.
   Verify any new card you add respects this (don't leak the client gross to talents).
4. **Multi-talent threads** — an inquiry can have N talents (proven with 3). The group
   thread + lineup must scale; offer card shows the line items.
5. **Card emits are fire-and-forget** — if you make a card load-bearing, that
   assumption changes; today a missing card never blocks money.
6. **Three surfaces, one ChatCard** — change `ChatCard.tsx` once; verify all three
   dispatchers (admin-3.tsx, talent-*.tsx, ClientMessagesShell.tsx) pass the right
   props/CTAs per role.

---

## 9. How to re-run the money/lifecycle tests

Environment: `web/.env.local` is prod-Supabase + **test-Stripe** (`sk_test_`, account
"Lavender Tunnel" `acct_1ThlEN7…`). `assertLivePayoutSafe` is a no-op on test keys, so
real test transfers fire; **no live money**. Enabled test connected accounts can be
minted on demand (custom account + `external_account: btok_us_verified` + test
identity → transfers capability active instantly).

```bash
cd web
# pure-Stripe money harnesses (committed):
npm run qa:money                 # qa-money-loop + qa-held-payouts
node scripts/qa-live-finale.mjs  # real settled transfer + idempotency + held-release
                                 #   (update its SOFIA_ACCT to a current Lavender-Tunnel acct first)

# engine harnesses (full inquiry→booking→pay→payout; server-only shim required):
NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs --max-old-space-size=4096' \
  npx tsx --env-file=.env.local scripts/_sandbox/qa-deposits.ts      # deposit→balance lifecycle
  # ...same invocation for qa-instant-book.ts / qa-coordinator.ts / qa-picker.ts / qa-offplatform.ts
```
Caveats: the committed `.mjs` harnesses reference a retired sandbox account
(`acct_1Td…`) — repoint to a current Lavender-Tunnel acct. The `_sandbox/*.ts`
harnesses create + tear down their own throwaway talents/accounts and self-clean
their DB rows; if a run dies mid-way it can orphan a row — sweep
`qa-%@impronta.test` inquiries/users afterward.

**markPaid driven directly is a faithful test** of settlement + payout (it's exactly
what the webhook calls); only the webhook signature/Audit#5 guard + `emitBookingConfirmation`
wrapper aren't exercised that way (covered by `webhook-routing.test` / `test:billing`).
