# Marathon P1 — feature-build specs + recipes (wf_6583ce35)


## feature-6.3-deposits
### currentState
**Schema — what exists today:**

`inquiry_offers` (20260603211232): `deposit_pct numeric`, `deposit_amount_cents bigint`, `balance_collection_method text` (CHECK: request_in_messages|pay_in_place|full_upfront), `refund_policy_key text`. All nullable — snapshotted at offer save.

`agency_bookings` (20260513191442 + 20260603211232): `deposit_amount_cents int8`, `deposit_currency text`, `deposit_paid_at timestamptz`, `deposit_payment_intent_id text` — already exist. Plus `deposit_pct numeric`, `balance_collection_method text`, `refund_policy_key text` (from 20260603211232). Missing: no `balance_due_at`, no `balance_txn_id`.

`booking_transactions` (20260901190000): no `checkout_type` or `txn_kind` column. Columns: gross_amount_cents, platform_fee_cents, net_amount_cents, currency, status (text, CHECK via app-layer only), provider, provider_reference, provider_metadata jsonb, paid_at.

`agency_bookings.client_revenue_lifecycle`: CHECK (pending|deposit_paid|fully_paid|refunded|failed) — 20260520103000.

**Webhook routing (webhook-routing.ts:70–75 + 254–267):**
`booking_deposit` StripeAction kind exists. Classifier: `payment_intent.succeeded` where `intent.metadata.purpose === 'booking_deposit'` → `{ kind: 'booking_deposit', bookingId, amountCents, currency, paymentIntentId }`. Handler `markBookingDepositPaid` (webhook-handler.ts:130–143): only updates `agency_bookings` deposit_paid_at/deposit_amount_cents/deposit_currency/deposit_payment_intent_id — does NOT set `client_revenue_li
### migrations
- -- 20260614030000_deposits_checkout_type.sql
-- Deposits feature (6.3).
-- 1. booking_transactions.checkout_type — distinguishes deposit / balance / full charge.
-- 2. agency_bookings.balance_due_at — timestamp when the balance becomes due.
-- 3. inquiry_messages.message_kind widened to include 'balance_due'.

-- 1. booking_transactions: checkout_type discriminator
alter table public.booking_transactions
  add column if not exists checkout_type text not null default 'full'
    check (checkout_type in ('deposit', 'balance', 'full'));

comment on column public.booking_transactions.checkout_type is
  'Deposits feature (6.3): full = full-amount charge (default, pre-deposit behaviour); deposit = first partial charge (deposit_pct% of gross); balance = second charge covering the remainder. markPaid gates executeBookingTransfers to deposit=false only.';

-- 2. agency_bookings: balance_due_at timestamp
alter table public.agency_bookings
  add column if not exists balance_due_at timestamptz;

comment on column public.agency_bookings.balance_due_at is
  'Deposits feature (6.3): timestamp set when the deposit is paid (client_revenue_lifecycle flips to deposit_paid). Displayed in the balance-due card so the client knows when to pay the remainder.';

-- 3. inquiry_messages.message_kind: add balance_due
alter table public.inquiry_messages
  drop constraint if exists inquiry_messages_message_kind_check;

alter table public.inquiry_messages
  add constraint inquiry_messages_message_kind_check
  check (message_kind = any (array[
    'text'::text,
    'offer_event'::text,
    'payment_request'::text,
    'payment_paid'::text,
    'booking_confirmed'::text,
    'talent_rate_confirmed'::text,
    'coordinator_request'::text,
    'talent_rate'::text,
    'call_sheet_update'::text,
    'booking_status'::text,
    'system_event'::text,
    'admin_suggested_talent'::text,
    'balance_due'::text,
    'voice'::text
  ]));
### editMap
- **supabase/migrations/20260614030000_deposits_checkout_type.sql** — NEW FILE. Three changes: (1) Add `checkout_type text CHECK (checkout_type IN ('deposit','balance','full')) DEFAULT 'full'` to `booking_transactions`. (2) Add `balance_due_at timestamptz` to `agency_bookings`. (3) Widen `inquiry_messages.message_kind` CHECK to include 'balance_due'. Full DDL in migrations section below.
- **web/src/lib/bookings/transactions.ts** — A) Add `checkoutType: 'deposit' | 'balance' | 'full'` to `BookingTransaction` type (line 63, after `refundOfTransactionId`). B) Add `checkout_type` to `TransactionRow` (line ~1010). C) Add it to `mapRow` (line ~1094). D) Add optional `checkoutType` param to `createBookingTransaction` opts (line 281); write `checkout_type: opts.checkoutType ?? 'full'` in the INSERT. E) CRITICAL gate in `markPaid` (line 514): BEFORE the `agency_bookings` update block, read the transaction's `checkout_type`. If `checkout_type === 'deposit'`: set `client_revenue_lifecycle='deposit_paid'` + `deposit_paid_at=now()` (NOT 'fully_paid'), emit a `balance_due` chat card (private thread only, card_payload includes `balance_due_cents` = booking.total_client_revenue_cents - amountCents), and SKIP `executeBookingTransfers`. If `checkout_type !== 'deposit'` (i.e. 'balance' or 'full'): existing behavior (fully_paid + executeBookingTransfers).
- **web/src/lib/stripe/webhook-handler.ts** — Expand `markBookingDepositPaid` (line 130–143) to ALSO: (1) set `client_revenue_lifecycle='deposit_paid'` + `balance_due_at` on the booking, and (2) emit a `balance_due` inquiry_message into the private thread. Currently it only writes the four deposit_* columns and misses the lifecycle flip and the client-facing card. The booking_id on the action gives us the booking row; fetch `source_inquiry_id + source_tenant_id + deposit_amount_cents + total_client_revenue` to derive the balance label.
- **web/src/lib/server-actions/client-pipeline.ts** — In `createInquiryPaymentIntent` (line 292), after loading the active booking transaction, add deposit branching: if the booking has `deposit_pct > 0 AND deposit_pct < 100` AND `client_revenue_lifecycle === 'pending'` AND `balance_collection_method === 'request_in_messages'`, then create the PI for `txn.depositAmountCents` (= booking.deposit_amount_cents) instead of `txn.grossAmountCents`, set PI metadata `checkout_type='deposit'` + `purpose='booking_deposit_txn'` (distinct from legacy admin deposit PI). A SEPARATE second action `createInquiryBalancePaymentIntent(inquiryId)` handles the balance-due path: loads the booking, asserts `lifecycle === 'deposit_paid'`, creates a PI for `(total_client_revenue_cents - deposit_amount_cents)`, sets `checkout_type='balance'` in PI metadata, returns clientSecret. NOTE: The PI's `metadata.transaction_id` must still be set (same transaction_id) so the webhook routes to `booking_payment`, which calls `markPaid`. The `checkout_type` value is read from the TRANSACTION ROW by `markPaid` to determine payout gating — it is NOT read from PI metadata.
- **web/src/lib/bookings/transactions.ts** — Add exported helper `createDepositTransaction(opts: { bookingId, sourceTenantId, sourceInquiryId, planTier, depositAmountCents, grossAmountCents, currency, payerUserId, payerEmail, platformFeeCentsOverride? })`: creates a booking_transaction with `checkout_type='deposit'` and `gross_amount_cents = depositAmountCents` (the partial charge). A second `createBalanceTransaction` with `checkout_type='balance'` and `gross_amount_cents = gross - deposit`. Both are variants of `createBookingTransaction` with the new `checkoutType` param. Alternatively, pass `checkoutType` directly to `createBookingTransaction` and call it twice.
- **web/src/lib/stripe/webhook-routing.ts** — In `classifyStripeEvent`, extend the `payment_intent.succeeded` branch for the new embedded-deposit flow: when `metadata.checkout_type === 'deposit'` AND `metadata.transaction_id` is present, still return `{ kind: 'booking_payment', transactionId }` — no new action kind needed. The routing is unchanged; only `markPaid`'s behavior forks on the transaction's `checkout_type` column. Add a test fixture note in comments to clarify this.
- **web/src/components/chat-cards/ChatCard.tsx** — Add `BalanceDueCard` component (after `BookingConfirmedCard`, ~line 292): props `{ depositLabel: string; balanceLabel: string; balanceDueHint?: string; onPayBalance?: () => void }`. Tone: 'amber'. Title: 'Deposit received — balance due'. Summary: hint or 'Pay the remaining balance before the event date.'. Meta: balanceLabel. Action: 'Pay balance now' button when `onPayBalance` provided.
- **web/src/components/admin/shell/internal/messages/admin-3.tsx** — In the message_kind switch (around line 321), add `case 'balance_due':` that renders `<BalanceDueCard depositLabel=... balanceLabel=... />`. Extract amounts from `msg.card_payload.deposit_label` and `msg.card_payload.balance_label`.
- **web/src/app/(workspace)/[tenantSlug]/client/messages/OfferTab.tsx** — Wire up the balance-due pay button. When `payment.state === 'partially_paid'`, show a 'Pay remaining balance' CTA that opens PayNowSheet — but call `createInquiryBalancePaymentIntent` instead of `createInquiryPaymentIntent`. This requires passing an `isBalance` flag to PayNowSheet or creating a `BalancePayNowSheet` variant that calls the new action.
- **web/src/app/(workspace)/[tenantSlug]/_data-bridge/client-inquiry-details.ts** — In the `payment` block (line 676), the `partially_paid` state is already handled via `lifecycle === 'deposit_paid'`. Add `balance_due_cents` to the payment output shape: compute as `total_client_revenue_cents - deposit_amount_cents` from the booking row so BalanceDueCard can display the exact balance.
### newFns
- `createDepositTransaction` export async function createDepositTransaction(opts: { bookingId: string; sourceTenantId: string; sourceInquiryId: string | null; planTier: string; depositAmountCents: number; currency?: string; payerUserId?: string | null; payerEmail?: string | null; createdByProfileId?: string | null; platformFeeCentsOverride?: number | null; }): Promise<TransactionResult<BookingTransaction>> (web/src/lib/bookings/transactions.ts)
- `createBalanceTransaction` export async function createBalanceTransaction(opts: { bookingId: string; sourceTenantId: string; sourceInquiryId: string | null; planTier: string; balanceAmountCents: number; currency?: string; payerUserId?: string | null; payerEmail?: string | null; createdByProfileId?: string | null; platformFeeCentsOverride?: number | null; }): Promise<TransactionResult<BookingTransaction>> (web/src/lib/bookings/transactions.ts)
- `createInquiryBalancePaymentIntent` export async function createInquiryBalancePaymentIntent(inquiryId: string): Promise<ClientActionResult & { clientSecret?: string; amountCents?: number; currency?: string; mock?: boolean; }> (web/src/lib/server-actions/client-pipeline.ts)
- `BalanceDueCard` export function BalanceDueCard(props: { depositLabel: string; balanceLabel: string; balanceDueHint?: string; onPayBalance?: () => void; }): JSX.Element (web/src/components/chat-cards/ChatCard.tsx)
### qaDriveRecipe
**Prerequisites:**
- Stripe sandbox acct_1ThlEN7Oqi82ykAI, `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- Sign in as qa-admin 4b9e595d (pw Impronta-QA-Admin-2026!)
- A converted booking with an approved offer that has `deposit_pct=30`, `balance_collection_method='request_in_messages'`, `total_client_price=$1000` → `deposit_amount_cents=30000`, `gross_amount_cents=103000` (with surcharge).

**Step 1 — Set up offer with deposit:**
```sql
-- Via Supabase MCP or npx tsx
-- After converting inquiry to booking (RPC engine_convert_to_booking with auth.uid()=qa-admin):
SELECT deposit_pct, deposit_amount_cents, balance_collection_method FROM agency_bookings WHERE id = '<bookingId>';
-- Must show: deposit_pct=30, deposit_amount_cents=30000, balance_collection_method='request_in_messages'
```

**Step 2 — Admin creates deposit transaction:**
```ts
// In npx tsx --env-file=web/.env.local:
import { createDepositTransaction } from './web/src/lib/bookings/transactions';
const r = await createDepositTransaction({ bookingId, sourceTenantId, sourceInquiryId, planTier: 'agency', depositAmountCents: 30000, currency: 'USD' });
console.log(r); // { ok: true, data: { id: '...', checkout_type: 'deposit', grossAmountCents: 30000 } }
```

**Step 3 — Client pays deposit via PayNowSheet:**
- Open Messages as qa-client-1, Offer tab
- PayNowSheet mounts, calls `createInquiryPaymentIntent(inquiryId)`
- ASSERT: action creates PI for 30000 (not 103000) with `metadata.transaction_id=<depositTxnId>`
- Confirm payment (test card 4242...)

**Step 4 — Webhook fires, assert deposit_paid state + NO payout:**
```sql
-- Via Stripe CLI output + Supabase:
SELECT client_revenue_lifecycle, deposit_paid_at, balance_due_at FROM agency_bookings WHERE id='<bookingId>';
-- ASSERT: client_revenue_lifecy
### risks
- TRANSACTION SPLIT AND 3-WAY INVARIANT: The split invariant (talent_net + workspace_fee + platform_fee == gross_charged) applies PER TRANSACTION. For the deposit txn: gross=depositAmountCents, and the fee split must be derived proportionally (not from the full commission snapshot which covers gross_charged). The safest approach is platformFeeCentsOverride = round(depositAmountCents * platformFeeBasisPoints / 10000) so the deposit txn's net/fee/gross are internally consistent. The balance txn gets the remainder. Do NOT let transfers.ts try to reconcile both txns against one commission snapshot — it reads snapshots by bookingId; only the balance txn should trigger executeBookingTransfers.
- IDEMPOTENCY OF markPaid FOR DEPOSIT: markPaid's `transitionStatus` checks `fromStatus = ['payment_requested', 'pending', 'disputed']`. A deposit txn that is already 'paid' returns error on a re-delivered webhook — that is correct behaviour. But the agency_bookings update (lifecycle flip) happens AFTER the status transition. If the webhook retries between those two steps (rare but possible), lifecycle stays 'pending' even though txn is 'paid'. Fix: the agency_bookings update should be conditional (`WHERE client_revenue_lifecycle='pending'`) or wrapped in a read-check.
- PAYOUT GATE IN executeBookingTransfers: transfers.ts calls `loadBookingCommissionSnapshots` keyed by bookingId. Both the deposit and balance transactions share the same bookingId and commission snapshot. When the balance txn triggers executeBookingTransfers, it will correctly use the full snapshot. But if somehow a deposit txn erroneously reaches executeBookingTransfers, it would transfer the FULL snapshot amounts even though only 30% was collected. The gate in markPaid (`if checkout_type === 'deposit': skip executeBookingTransfers`) MUST be in the `if (result.ok)` block BEFORE the executeBookingTransfers call at line 571.
- DOUBLE-PAYMENT GUARD IN createInquiryPaymentIntent: currently the action checks `txn.status === 'paid'` and returns 'already paid'. With deposits, the deposit txn may be 'paid' but the balance txn is 'payment_requested'. The guard must check BOTH: if lifecycle='deposit_paid', redirect to `createInquiryBalancePaymentIntent`; if lifecycle='fully_paid', block with 'already paid'.
- LEGACY booking_deposit PATH (bank-link.ts createDepositPaymentIntent): this admin-only action sets PI metadata `purpose='booking_deposit'` (NOT `transaction_id`) and routes to the `booking_deposit` webhook action which only updates the raw deposit_* columns on agency_bookings. It does NOT create a booking_transaction at all. This path is a different flow (legacy admin-managed deposit outside the transaction system). The new client-facing deposit flow MUST use `metadata.transaction_id` so it routes to `booking_payment` and calls `markPaid` properly. Keep the two paths separate — do NOT merge them.
- MESSAGE_KIND CONSTRAINT: 'voice' message_kind is used in app code (voice-notes.ts:182) but is NOT in the current CHECK constraint (20260601155328). The migration above adds it. If the migration is applied before voice was added, it is a no-op safe. If it has been applied out-of-order, the drop+re-add pattern is idempotent. Verify via `\d inquiry_messages` after applying.
### openDecisions
- WHO CREATES THE DEPOSIT/BALANCE TRANSACTIONS? The current flow is: admin creates booking → admin calls requestPayment (creates booking_transaction, calls requestPayment action). With deposits, the admin would need to call createDepositTransaction explicitly, then later createBalanceTransaction. Alternatively: createBookingTransaction auto-detects the booking's deposit_pct and creates a deposit txn automatically. Decision needed: admin-explicit vs. auto-detect at requestPayment time.
- DOES THE BALANCE TXN EXIST BEFORE THE DEPOSIT IS PAID, OR IS IT CREATED AFTER? Option A: both txns are created at convert/requestPayment time. Option B: the balance txn is created inside markPaid when checkout_type='deposit'. Option B is cleaner (the balance txn only exists when the deposit is actually paid) but creates a txn inside a webhook handler — transactional risk. Option A is simpler but the balance txn would be in 'draft' status while the deposit is outstanding, which could confuse loadActiveBookingTransaction (it returns the most recent non-cancelled txn).
- AMOUNT RECONCILIATION FOR THE BALANCE TXN: gross_charged for the balance txn = total_gross_charged - deposit_amount_cents. But the commission snapshot was built on total_gross_charged. The balance txn's platform_fee_cents should be (total_platform_fee - deposit_platform_fee) to preserve the 3-way sum. The safest implementation: store both deposit_platform_fee_cents and balance_platform_fee_cents at createDepositTransaction time and pass them as platformFeeCentsOverride to the respective calls.
- SHOULD THE DEPOSIT TXNS SHARE ONE booking_transactions ROW OR HAVE TWO? Two rows (one per charge) is cleaner for the audit trail and reconciliation. One row with a 'partially_paid' state is simpler for the existing loadActiveBookingTransaction query which returns the most-recent row. The two-row approach requires updating loadActiveBookingTransaction to handle multiple active txns per booking.
- REFUND POLICY FOR PARTIAL PAYMENTS: if the client refunds after paying the deposit but before the balance, which txn is refunded? The deposit txn. The refund should flip lifecycle back to 'pending'. The existing handleBookingRefund (refunds.ts) matches by paymentIntentId → bookingId → sets lifecycle='refunded'. This is too aggressive for a deposit-only refund. A new refund path is needed that sets lifecycle='refunded' only when BOTH txns are refunded, or sets it to 'pending' on deposit-only refund.

## feature-6.4-instant-book
### currentState
Config layer (already exists, no code changes needed here):
- `platform_settings.instant_book_default` boolean NOT NULL DEFAULT false — migration 20260603202858_commercial_terms_config.sql:28
- `agencies.settings jsonb` under key `commercialTerms.instantBookEnabled` (TenantCommercialTerms) — no column, pure JSONB
- `talent_profiles.booking_terms jsonb` carrying `{ instantBookOptIn: boolean, fixedRateCents: number|null, … }` — migration 20260603202858_commercial_terms_config.sql:17-18
- Resolver `resolveCommercialTerms()` in web/src/lib/billing/commercial-terms.ts:68 — pure fn, already computes `instantBookEnabled` (tenant gate + talent opt-in) and `fixedRateCents`
- `loadPlatformCommercialDefaults()` in web/src/lib/platform/commercial-defaults.ts:38 — server-only cached loader
- Talent settings UI for `instantBookOptIn` + `fixedRateCents` in web/src/app/(workspace)/[tenantSlug]/talent/settings/CommercialBookingTermsCard.tsx:259-283
- Tenant admin UI for `instantBookEnabled` in web/src/components/admin/account/CommercialTermsSettingsCard.tsx:277-286

Engine fns already available (web/src/lib/inquiry/):
- `submitInquiry()` — inquiry-engine-submit.ts:216 (creates inquiry + participants)
- `createOffer()` — inquiry-engine-offers.ts:310 (creates draft offer, auto-seeds line items from participants)
- `updateOfferDraft()` — inquiry-engine-offers.ts:684 (writes line items + pricing)
- `sendOffer()` — inquiry-engine-offers.ts:528 (calls RPC engine_send_offer; seeds inquiry_approvals 
### migrations
- -- Migration: 20260614020419_instant_book_source_channel.sql
-- Add 'instant_book' to the inquiry source_channel enum so submitInquiry
-- can stamp source_channel='instant_book' without a check-constraint violation.
-- The enum is used in inquiries.source_channel.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.inquiry_source_channel'::regtype
      AND enumlabel = 'instant_book'
  ) THEN
    ALTER TYPE public.inquiry_source_channel ADD VALUE 'instant_book';
  END IF;
END $$;

-- Verify the platform_settings instant_book_default column exists
-- (already added by 20260603202858; this is a no-op guard).
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS instant_book_default boolean NOT NULL DEFAULT false;

-- Verify talent_profiles.booking_terms exists (already added; guard only).
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS booking_terms jsonb;

-- Comment to explain the instant-book flow on the inquiries table.
COMMENT ON COLUMN public.inquiries.source_channel IS
  'Origination channel. ''instant_book'' = talent opted-in fixed-rate booking; skips negotiation and talent approval.';

### editMap
- **web/src/lib/inquiry/instant-book-engine.ts** — NEW FILE. Export `createInstantBooking(supabase, ctx)`. This is the single orchestrating fn — it does not expose the multi-step admin flow; it runs all steps atomically in one server call. Signature:

```ts
export type InstantBookInput = {
  tenantId: string;
  talentProfileId: string;   // single talent only for instant-book v1
  clientUserId: string;      // must be authenticated (no guest instant-book)
  actorUserId: string;       // same as clientUserId in client-initiated flow
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  sourcePage?: string | null;
  originDomain?: string | null;
  sourceWorkspaceId?: string | null;
  guestSessionId?: string | null;
};

export type InstantBookResult =
  | { ok: true; inquiryId: string; bookingId: string; transactionId: string }
  | { ok: false; reason: 'instant_book_not_enabled' | 'no_fixed_rate' | 'rate_limited' | 'forbidden' | 'engine_error'; error?: string };

export async function createInstantBooking(
  supabase: SupabaseClient,
  input: InstantBookInput,
): Promise<InstantBookResult>
```

Algorithm (all steps inside `runWithEngineLog`):

**Step 0 — Check eligibility.** Load talent_profiles.booking_terms (using service-role to avoid RLS column gaps). Parse with `parseTalentBookingTerms()`. Guard: `instantBookOptIn !== true` → return `instant_book_not_enabled`. Guard: `fixedRateCents == null || fixedRateCents <= 0` → return `no_fixed_rate`. Derive `fixedRateDollars = fixedRateCents / 100` (whole-dollar line item). Load tenant `agencies.settings` and parse `parseTenantCommercialTerms()`. If tenant.instantBookEnabled is not true → return `instant_book_not_enabled`. (Platform default is intentionally NOT checked here — the tenant switch is the runtime gate; platform.instantBookDefault is for the resolver / display layer only.)

**Step 1 — Create inquiry.** Call `submitInquiry(supabase, { ...input, talent_profile_ids: [talentProfileId], initiator_role: 'client', source_channel: 'instant_book', source_context: { instant_book: true } })`. On failure propagate error.

**Step 2 — Create offer.** Fetch inquiry version (just inserted, version=1). Call `createOffer(supabase, { inquiryId, tenantId, actorUserId: input.actorUserId, expectedVersion: 1, currencyCode: platformCurrency })`. On failure propagate.

**Step 3 — Populate offer line item with fixed rate.** Call `updateOfferDraft(supabase, { inquiryId, tenantId, offerId, actorUserId: input.actorUserId, inquiryExpectedVersion: 2, offerExpectedVersion: 1, total_client_price: fixedRateDollars, coordinator_fee: 0, currency_code: platformCurrency, notes: null, lineItems: [{ talent_profile_id: talentProfileId, label: talentDisplayName, pricing_unit: 'event', units: 1, unit_price: fixedRateDollars, total_price: fixedRateDollars, talent_cost: fixedRateDollars, notes: null, sort_order: 0 }] })`. On failure propagate.

**Step 4 — Send offer (seeds approvals).** Fetch fresh inquiry + offer versions. Call `sendOffer(supabase, { inquiryId, tenantId, offerId, actorUserId: input.actorUserId, inquiryExpectedVersion, offerExpectedVersion })`. This calls engine_send_offer RPC which: (a) activates the talent participant, (b) seeds inquiry_approvals for client + talent with status='pending', (c) advances inquiry to 'offer_pending'.

**Step 5 — Auto-accept the talent approval.** The talent opted in → they don't need to manually approve. Use service-role client to directly UPDATE the talent's inquiry_approvals row to 'accepted' (bypass validateActorPermission which would require the talent's session). SQL: `UPDATE inquiry_approvals SET status='accepted', responded_at=now() WHERE inquiry_id=$inquiryId AND offer_id=$offerId AND participant_id=(SELECT id FROM inquiry_participants WHERE inquiry_id=$inquiryId AND role='talent' AND talent_profile_id=$talentProfileId LIMIT 1)`. This is safe because eligibility was gated on instantBookOptIn=true in Step 0.

**Step 6 — Client accepts offer.** Call `clientAcceptOffer(supabase, { inquiryId, tenantId, offerId, actorUserId: input.clientUserId, expectedVersion })`. This records the client approval. engine_submit_approval sees all approval rows accepted → flips inquiry to 'approved'.

**Step 7 — Convert to booking.** Fetch fresh inquiry version (now 'approved'). Call `convertToBooking(supabase, { inquiryId, tenantId, actorUserId: input.actorUserId, expectedVersion })`. IMPORTANT: engine_convert_to_booking requires auth.uid() match — use service-role client here so the client user_id passes the RPC's actor check. Returns { bookingId }.

**Step 8 — Create payment transaction.** Load booking row for planTier + commission. Call `createBookingTransaction({ bookingId, sourceTenantId: tenantId, sourceInquiryId: inquiryId, planTier, grossAmountCents: fixedRateCents, currency: platformCurrency, payerUserId: input.clientUserId, payerEmail: input.contactEmail })`. Then call `requestPayment(transactionId)` to advance to payment_requested. Returns transactionId.

Return `{ ok: true, inquiryId, bookingId, transactionId }`.
- **web/src/lib/server-actions/instant-book-action.ts** — NEW FILE. `'use server'` module exporting `createInstantBookingAction(formData: InstantBookFormPayload): Promise<InstantBookActionResult>`. Resolves caller session, reads tenant_id from host context (`getPublicTenantScope()`), reads operating currency from `loadPlatformOperatingCurrency()`, calls `createInstantBooking(supabase, { ...formData, actorUserId: userId, clientUserId: userId, ... })`. On success redirects to `/c/${inquiryId}?instant_booked=1` (the client messages shell for that inquiry). On failure returns `{ ok: false, reason, error }`. Also export a loader action `loadInstantBookEligibility(talentProfileId: string, tenantId: string): Promise<InstantBookEligibility>` that returns `{ eligible: boolean, fixedRateDollars: number | null, currencyCode: string }` — used by the public talent profile page to decide whether to show 'Book now' vs 'Inquire'.
- **web/src/app/t/[profileCode]/talent-profile-instant-book-button.tsx** — NEW FILE. `'use client'` component `TalentProfileInstantBookButton`. Props: `{ talentId, tenantId, tenantSlug, displayName, sourcePage, fixedRateDollars, currencyCode, className? }`. Renders a 'Book now' button. On click shows a minimal confirm sheet (name / email / phone fields if not already from session + event date + a clear price display 'Total: $X'). On submit calls `createInstantBookingAction`. On success navigates to returned redirect path. On error shows inline error. Does NOT render the full InquiryDrawer — intentionally lightweight.
- **web/src/app/t/[profileCode]/page.tsx** — In the existing talent profile server component, call `loadInstantBookEligibility(talentId, tenantId)` (imported from instant-book-action.ts). Pass result to the CTA area. Render `TalentProfileInstantBookButton` (from talent-profile-instant-book-button.tsx) when `eligible === true` alongside (not replacing) the existing `TalentProfileInquireButton`. The instant-book button displays 'Book now — $X' using fixedRateDollars; the inquire button stays for custom-scope inquiries.
- **web/src/lib/inquiry/inquiry-engine.ts** — Add re-export: `export { createInstantBooking } from './instant-book-engine'; export type { InstantBookInput, InstantBookResult } from './instant-book-engine';` — keeps the public engine API surface as the single import point.
- **web/src/lib/inquiry/inquiry-engine-offers.ts** — No change needed to the function bodies. The existing `seedApprovalsForOffer` is already exported (line 308) and can be called from instant-book-engine if needed as a fallback, but the preferred path is via `sendOffer` → RPC which seeds correctly. No edit required.
### newFns
- `createInstantBooking` async function createInstantBooking(supabase: SupabaseClient, input: InstantBookInput): Promise<InstantBookResult> (web/src/lib/inquiry/instant-book-engine.ts)
- `createInstantBookingAction` async function createInstantBookingAction(payload: InstantBookFormPayload): Promise<InstantBookActionResult> (web/src/lib/server-actions/instant-book-action.ts)
- `loadInstantBookEligibility` async function loadInstantBookEligibility(talentProfileId: string, tenantId: string): Promise<{ eligible: boolean; fixedRateDollars: number | null; currencyCode: string }> (web/src/lib/server-actions/instant-book-action.ts)
### qaDriveRecipe
Prerequisites: Sofía Herrera (talent 878cb63f) has instantBookOptIn=true and fixedRateCents set in booking_terms; the Impronta tenant (22222222) has instantBookEnabled=true in agencies.settings.commercialTerms. The US sandbox Stripe keys are loaded (acct_1ThlEN7Oqi82ykAI).

--- SETUP (via npx tsx + service-role) ---

1. Seed Sofía's booking_terms:
   UPDATE talent_profiles
   SET booking_terms = '{"instantBookOptIn":true,"fixedRateCents":150000,"depositPct":50,"refundPolicy":"tiered"}'
   WHERE id = '878cb63f-...';

2. Seed tenant instant-book switch:
   UPDATE agencies
   SET settings = jsonb_set(COALESCE(settings,'{}'), '{commercialTerms}',
     '{"instantBookEnabled":true,"depositPct":null,"refundPolicy":null}')
   WHERE id = '22222222-...';

--- ELIGIBILITY CHECK ---

3. Call loadInstantBookEligibility('878cb63f-...', '22222222-...'). Assert:
   eligible = true, fixedRateDollars = 1500.00, currencyCode = 'USD'.

4. Turn off the tenant switch (instantBookEnabled=false), call again, assert eligible = false.
   Turn it back on.

5. Turn off talent opt-in (instantBookOptIn=false), call again, assert eligible = false.
   Turn it back on.

--- HAPPY PATH (skip-approval flow) ---

6. Sign in as qa-client-1 (bb31fa4c). Note: must be authenticated — no guest path.

7. Call createInstantBookingAction with:
   { talentProfileId: '878cb63f-...', contactName: 'QA Client', contactEmail: 'qa-client-1@…', tenantId: '22222222-...' }

8. Assert Step 1 outcome: inquiries row exists, status='submitted' initially then 'offer_pending' after sendOffer, source_channel='instant_book'.

9. Assert Step 2/3: inquiry_offers row status='sent', total_client_price=1500.00. inquiry_offer_line_items has 1 row with talent_profile_id=878cb63f, unit_price=1500.00.

10. Assert Step 5 (auto-accept talent
### risks
- Step 7 (convertToBooking) requires the RPC engine_convert_to_booking to be called with auth.uid() matching the actor. The TS engine fn validates via validateActorPermission (which checks inquiry_participants role), but the RPC itself also reads auth.uid() for the audit row. The instant-book action uses the clientUserId as actorUserId, but the server action runs as service-role for most writes. The safe path is to call convertToBooking with a supabase client whose JWT is the clientUserId session — or pass overrideReason='instant_book_system' if the actor is super_admin. DECISION NEEDED: the spec above calls convertToBooking with the client's actorUserId (which is a real user), but if the server-action escalates to service-role before calling the engine the RPC's auth.uid() will be the service-role (NULL or system). Test explicitly that engine_convert_to_booking does not fail when actorUserId is a non-admin client user — the existing QA record (inquiry 2c714cac, booking 4504e6f9) shows admin conversions only.
- Step 5 (auto-accept talent) bypasses the engine's submitApproval permission gate. This is intentional (talent opted in), but the direct UPDATE must set tenant_id guard to prevent a cross-tenant exploit: add `.eq('tenant_id', tenantId)` on the UPDATE and an EXISTS on inquiry_participants that also filters tenant_id.
- fixedRateCents is stored in CENTS in booking_terms but offer line items use whole-dollar `unit_price`/`total_price`. The conversion (/ 100) must happen before Step 3. The 3-way split invariant requires the cents figure for the commission snapshot — use fixedRateCents directly for createBookingTransaction, not the rounded dollar value.
- If the tenant's instantBookEnabled switch is toggled off between eligibility check and submission (race), the engine gate in Step 0 of createInstantBooking will catch it (checked server-side on every call, not just on page load).
- The auto-ack system message (submitInquiry post-submit) will fire for instant-book inquiries ('Thanks — we'll get back to you within 4 hours'). This copy is wrong for instant-book (it's already booked). Guard: check source_channel='instant_book' in the post-submit auto-ack block in inquiry-engine-submit.ts:606-646 and skip the generic ack, or emit a dedicated 'Your booking is confirmed' system message from instant-book-engine after Step 7.
- Multi-talent instant-book is explicitly out of scope (v1). The engine validates talent_profile_ids.length==1 in createInstantBooking before proceeding. A future v2 can extend to multiple talents if all have opted in and all have a fixedRateCents set.
### openDecisions
- convertToBooking actor: should the instant-book flow call convertToBooking with the CLIENT's userId as actorUserId (requires the client to have 'convert_to_booking' engine permission — currently staff-only via validateActorPermission), OR should it use a super_admin proxy (qa-admin 4b9e595d) OR pass the existing overrideReason path? Recommend: add a new bypass in instant-book-engine.ts that calls engine_convert_to_booking directly via service-role client with the client user_id stamped as actor — mirroring the existing pattern in createOffer (inquiry-engine-offers.ts:437). Do NOT use overrideReason (that path records a forced conversion which is misleading). Alternatively, add 'convert_to_booking' to the set of permissions a client participant holds when source_channel='instant_book'. Either way, validate against QA-admin fixture first.
- Payment capture on booking vs. on inquiry: the spec creates the booking_transaction and advances it to payment_requested immediately in Step 8. The client still needs to complete the Stripe payment flow from the messages shell. An alternative is to show the Stripe Payment Element inline in the instant-book confirm sheet (before convertToBooking), only calling Steps 7-8 on successful payment. This gives stronger atomicity but requires a Stripe PaymentIntent before the booking exists. Decision: the spec keeps payment as a separate post-booking step for now (matches the existing Messages Pay-now flow), noting this as a follow-up UX improvement.
- deposit_pct on the offer: for instant-book with balanceMethod='full_upfront' (the natural fit), depositPct=100 and depositAmountCents=fixedRateCents. The updateOfferDraft call in Step 3 should pass terms: { balanceMethod: 'full_upfront' } so the offer commercial terms snapshot is correct and the client's PayNowSheet shows the full amount as the deposit due. Confirm this is the right default or inherit from talent.booking_terms.depositPct.
- Source channel enum: the migration adds 'instant_book' to inquiry_source_channel. If the enum type does not exist in the DB (it may be a text column with a CHECK constraint instead), the migration approach changes. Run: SELECT pg_typeof(source_channel) FROM inquiries LIMIT 1; to confirm before applying.

## feature-2.10-client-picker
### currentState
inquiry_participants table: id, inquiry_id, tenant_id, user_id, talent_profile_id, role (enum), status (enum), sort_order, added_by_user_id, owning_party_type, owning_party_id, requirement_group_id (NOT NULL). DB types at web/src/lib/supabase/database.types.ts:5326.

Roster guard: assertAllTalentOnTenantRoster(supabase, tenantId, ids[]) at web/src/lib/saas/talent-roster.ts:114. Checks agency_talent_roster.status=active + agency_visibility IN (site_visible,featured) + talent_site_hidden=false.

addTalentToRoster engine fn: web/src/lib/inquiry/inquiry-engine-roster.ts:93. Inserts inquiry_participants with role=talent, status=invited, resolves requirement_group_id from default group, validates isMutablePhase, gates on validateActorPermission(add_talent), uses inquiryWriteClient (service-role after gate), emits ROSTER_TALENT_INVITED. Currently only coordinatorActions includes add_talent (inquiry-permissions.ts:167); clients are NOT in add_talent permission.

owning_party resolution: resolveOwningPartyForTalent(supabase, talentProfileId, tenantId, hubSourced) at web/src/lib/inquiry/owning-party-resolver.ts:130. For a non-exclusive roster talent on the same tenant returns {type:'workspace', id:tenantId}.

Approval re-seed: seedApprovalsForOffer(supabase, inquiryId, tenantId, offerId) at web/src/lib/inquiry/inquiry-engine-offers.ts:247. Called inside engine_send_offer RPC. engine_send_offer reseeds approvals using ON CONFLICT DO NOTHING. Client adding a talent post-offer requires re
### migrations
(none)
### editMap
- **web/src/lib/inquiry/inquiry-permissions.ts** — Add 'add_talent' to clientActions array (line 137–147). New clientActions: [...existing, 'add_talent']. This unlocks validateActorPermission for client role on the add_talent action. The permission gate in addTalentToRoster already calls validateActorPermission(add_talent); adding it to clientActions is the ONLY change required to the permission layer.
- **web/src/app/(workspace)/[tenantSlug]/client/_actions/client-add-talent-actions.ts** — CREATE new file. Export clientAddTalentToInquiryAction(tenantSlug: string, inquiryId: string, talentProfileId: string): Promise<{ok: true} | {ok: false; error: string}>. Body: (1) getCachedActorSession — require session.user, else return {ok:false,error:'Not authenticated.'}. (2) getTenantPortalScopeBySlug(tenantSlug) — else {ok:false,error:'Tenant not found.'}. (3) createServiceRoleClient() for all reads/writes. (4) Load inquiry: select id, client_user_id, version, status, is_frozen from inquiries where id=inquiryId AND tenant_id=tenantId — verify client_user_id===session.user.id, else forbidden. (5) Roster guard: assertAllTalentOnTenantRoster(admin, tenantId, [talentProfileId]) — if !ok return {ok:false,error:'That talent is not on this agency's visible roster.'}. (6) Contact-policy gate: load talent_profiles.contact_policy for talentProfileId; load client_trust_state.trust_level for session.user.id+tenantId (default 'basic'); if policy[trustLevel]===false return {ok:false,error:'This talent is not accepting inquiries from your trust tier.'}. (7) Check no existing active/invited participant row for same inquiry+talent (idempotency guard). (8) Call addTalentToRoster(admin, {inquiryId, tenantId, talentProfileId, actorUserId:session.user.id, expectedVersion:inq.version, requirementGroupId:null}). (9) If pending offer exists (inquiry.current_offer_id + offer.status==='sent'), emit a private thread system message: 'Client added a talent. The coordinator must re-send the offer to include them.' — do NOT auto-reseed; that is the coordinator's job. (10) revalidatePath(`/${tenantSlug}/client/messages`). Return {ok:true}. Full signature: export async function clientAddTalentToInquiryAction(tenantSlug: string, inquiryId: string, talentProfileId: string): Promise<{ok: true} | {ok: false; error: string}>
- **web/src/app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx** — In LineupTab (line 2520): add 'Add talent' UX. (1) Extend LineupTab props to accept: inquiryId: string, tenantSlug: string, roster: TalentOption[], inquiryStatus: string, isFrozen: boolean. (2) Compute canPropose = isMutablePhase(inquiryStatus, isFrozen) — import isMutablePhase from inquiry-lifecycle. (3) When canPropose && roster.length > 0, render a small 'Suggest talent' button below the list (or inline empty-state). On click, open an inline picker overlay (no full modal needed): a small dropdown/popover listing roster items not already in details.talent.selected (filter by participant_id lookup). Each row shows talent name + primaryTypeLabel chip + a '+ Add' button. (4) On '+ Add' click: call clientAddTalentToInquiryAction(tenantSlug, inquiryId, talentOption.id), show optimistic pending state on the button, on success call onAfterAdd() (prop: () => void) which triggers a details refetch (router.refresh() in the parent). On error, show inline error text. (5) At call site (ThreadPaneWithTabs line 1109), pass the new props: inquiryId={inq.id}, tenantSlug={tenantSlug}, roster={roster} (already a prop on ClientMessagesShell), inquiryStatus={inq.status}, isFrozen={false} (inquiries.is_frozen not yet surfaced in ClientInquiryRow — default false for now; see open decisions), onAfterAdd={() => router.refresh()}. NOTE: roster must be threaded from ClientMessagesShell → ThreadPaneWithTabs → LineupTab; ClientMessagesShell already receives roster as a prop.
- **web/src/app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx** — Thread import: add import for clientAddTalentToInquiryAction from ../_actions/client-add-talent-actions and isMutablePhase from @/lib/inquiry/inquiry-lifecycle.
### newFns
- `clientAddTalentToInquiryAction` export async function clientAddTalentToInquiryAction(tenantSlug: string, inquiryId: string, talentProfileId: string): Promise<{ok: true} | {ok: false; error: string}> (web/src/app/(workspace)/[tenantSlug]/client/_actions/client-add-talent-actions.ts)
### qaDriveRecipe
Setup: Sign in as qa-client-1 (bb31fa4c) on the impronta tenant. Find or create an inquiry in coordination/submitted status that does NOT include Sofía (878cb63f) or Marco (de81316a). Confirm Sofía is site_visible on the tulala hub roster (agency_talent_roster: status=active, agency_visibility=site_visible or featured, talent_site_hidden=false).

Step 1 — navigate to the client Messages shell. Open the inquiry thread. Click the Lineup tab. The list renders current participants only (no 'Suggest talent' button yet until the code ships).

Step 2 — after shipping: verify 'Suggest talent' button is visible when inquiry status is coordination/submitted and roster is non-empty. Click the button. Picker dropdown lists Sofía and Marco (minus any already on the lineup).

Step 3 — click '+ Add' next to Sofía. Assert optimistic spinner appears on the button.

Step 4 — assert DB: SELECT * FROM inquiry_participants WHERE inquiry_id='<id>' AND talent_profile_id='878cb63f' AND role='talent' AND status='invited' — row must exist with added_by_user_id = bb31fa4c's user_id and owning_party_type='workspace', owning_party_id = tulala hub tenant id (40081ec3-5ca8-43a0-b50b-31c927b2716b).

Step 5 — assert thread card: SELECT * FROM inquiry_messages WHERE inquiry_id='<id>' ORDER BY created_at DESC LIMIT 5 — if a pending offer was present, check for message_kind='system_event' with body containing 'Client added a talent'.

Step 6 — re-open Lineup tab (router.refresh() should have fired). Sofía now appears in the list with status 'Invited'.

Step 7 — negative test: attempt to add a talent NOT on the roster (any talent_profile_id not in agency_talent_roster for this tenant). Expect {ok:false, error:'That talent is not on this agency's visible roster.'} and no participant row inserted.

Step 8 — 
### risks
- Permission elevation: adding 'add_talent' to clientActions means any authenticated client participant on any inquiry can call addTalentToRoster. The mitigations are: (a) validateActorPermission checks participant.role==='client' && participant.status==='active' — only the inquiry's own client can act; (b) assertAllTalentOnTenantRoster prevents adding off-roster or hidden talent; (c) contact_policy gate prevents tier-gated talent; (d) isMutablePhase blocks booked/archived/frozen inquiries. Without these gates the feature is over-permissive.
- Offer re-seed: if a client adds talent while an offer is pending (status=sent), the existing approval set becomes stale (the new talent has no approval row). The engine's invalidateOfferIfRosterChanged in addTalentToRoster already fires and sets the offer to 'invalidated' + inquiry back to 'coordination'. This is the correct behavior — the coordinator must re-draft and re-send. The thread message warning is a UX signal, not a separate guard.
- Offer invalidation: clients can therefore force an offer back to coordination by adding a talent. This is an intentional design choice (coordinator retains pricing control). Mitigate UX confusion by making the system message prominent: 'Coordinator must re-send the offer to include the new talent.'
- requirement_group_id NOT NULL: passing requirementGroupId=null to addTalentToRoster triggers the M2.2 fallback which resolves the default group. If no group exists (escaped M5.6 backfill) it creates one inline. This is a known safe path per inquiry-engine-roster.ts:160.
- is_frozen not surfaced in ClientInquiryRow: the current client list row type does not carry is_frozen. The canPropose check should default isFrozen=false until is_frozen is added to the loadClientInquiries query. Risk is low (frozen inquiries are rare; the engine itself blocks the write with reason=post_booking_immutable). Fix by adding is_frozen to loadClientInquiries SELECT in the data-bridge.
- Roster used in LineupTab is the storefront roster (site_visible/featured). A talent could be on the inquiry as a participant but removed from the roster since submission — they would appear in the picker again. Filter the picker against details.talent.selected participant_ids to prevent re-adding existing participants.
- Race condition: two tabs/devices click '+ Add' for the same talent simultaneously. The unique index on inquiry_participants (active_talent) prevents duplicate rows; the second insert will error. The action should handle this as a non-fatal idempotency case and return {ok:true} rather than an error.
### openDecisions
- Trust level source: the contact_policy gate in clientAddTalentToInquiryAction should read from client_trust_state.trust_level for the acting user+tenant. If no row exists (client never had trust evaluated), default to 'basic'. Decide whether to surface an evaluateTrustState() call here or treat the missing row as basic (recommended: basic default, same as submitInquiry).
- Picker scope — site_visible vs all roster: the current design uses assertAllTalentOnTenantRoster which requires site_visible or featured. The picker should only show site_visible/featured talent too (same guard). Consider whether agency_visibility='roster_only' talent should ever be proposable by clients — current spec says no.
- Notification: when a client adds a talent, should the coordinator be notified in-app? The existing ROSTER_TALENT_INVITED engine event fires a notification to the talent (their user_id) but not explicitly to the coordinator. addTalentToRoster already emits the bell to talent (inquiry-engine-roster.ts:238). Consider adding a coordinator bell via buildInquiryBells({audiences:['coordinator']}) inside clientAddTalentToInquiryAction after the engine call.
- UI insertion point — Lineup tab vs chat composer: the spec pins the picker to the Lineup tab. An alternative is a '+' button in the chat composer toolbar (mirroring how Slack adds users to a channel in-thread). Lineup tab is chosen because it is where the client already sees the current lineup and the action is conceptually lineup management, not messaging.
- Picker as overlay vs inline: implementation can be a simple absolute-positioned inline dropdown (no modal portal needed) or a small slide-in panel. Recommend inline dropdown for minimal code surface — no new component, just a conditional div absolutely positioned below the 'Suggest talent' button.
- Freeze signal: is_frozen should be added to loadClientInquiries (web/src/app/(workspace)/[tenantSlug]/_data-bridge/clients.ts) SELECT so the canPropose gate is accurate. Until then, default false (engine blocks frozen writes regardless).

## recipe-11.3-trial
### currentState
Storage:
- `talent_plan_overrides` table: /Users/oranpersonal/Desktop/impronta-app/supabase/migrations/20260524222151_talent_plan_overrides.sql — columns id, talent_profile_id, status (active/expired/revoked), base_plan_key, override_plan_key, grant_kind (comp/trial/promo, added in 20261005000000_plan_trials_engine.sql), starts_at, expires_at (NULL=indefinite), reason, note, created_by, ended_at, ended_by. Unique partial index ensures at most one status='active' row per talent_profile_id.
- `talent_profiles.talent_plan_key` — materialized effective plan; mirrored by applyTalentPlanOverride and by reconcile_expired_talent_plan_overrides.
- `plan_trial_offers` table: /Users/oranpersonal/Desktop/impronta-app/supabase/migrations/20261005000000_plan_trials_engine.sql — (audience, plan_key) unique; trial_days default 14; is_enabled; cta_headline, cta_subtext. Seeded for (workspace: studio/agency/network) and (talent: talent_pro/talent_portfolio).

Grant fn / server action:
- `applyTalentPlanOverride(input)` — /Users/oranpersonal/Desktop/impronta-app/web/src/app/(workspace)/platform/admin/users/actions-billing.ts:63 — "use server"; requires super_admin; accepts {talentProfileId, overridePlanKey, durationKey (1w/2w/1m/3m/6m/1y/indefinite/custom), customExpiresAt?, reason?, note?, grantKind? ('comp'|'trial'|'promo')}; guard: grantKind='trial' + durationKey='indefinite' → rejected; revokes any prior active override preserving original base_plan_key; inserts talent_plan_overrides row; m
### migrations
(none)
### editMap
### newFns
### qaDriveRecipe
No Stripe money rail needed — this is a pure admin grant path.

SETUP (run once, before the drive):
1. Confirm Sofía (878cb63f) or Marco (de81316a) is on talent_basic.
   Supabase MCP execute_sql:
     SELECT id, talent_plan_key FROM talent_profiles WHERE id = '878cb63f-...';
   If on talent_pro/portfolio from a prior test, call removeTalentPlanOverride('878cb63f-...') from the admin UI or directly via:
     node -e "require('./web/src/app/(workspace)/platform/admin/users/actions-billing').removeTalentPlanOverride('878cb63f-...')"

STEP 1 — Grant the trial (simulate: sign in as qa-admin 4b9e595d, pw Impronta-QA-Admin-2026!):
Method A — UI: open /platform/admin/users, find Sofía, expand Billing & Subscriptions, click "Apply plan override", pick:
  - Plan: Pro (talent_pro)
  - Grant type: Trial
  - Duration: 1 week (picks expires_at = now()+7d)
  - Reason: "QA recipe 11.3"
  Click "Apply override".

Method B — tsx directly (no browser needed):
  cd web
  npx tsx --env-file=.env.local -e "
    import { applyTalentPlanOverride } from './src/app/(workspace)/platform/admin/users/actions-billing';
    const r = await applyTalentPlanOverride({
      talentProfileId: '878cb63f-...',  // Sofía full UUID
      overridePlanKey: 'talent_pro',
      durationKey: '1w',
      grantKind: 'trial',
      reason: 'QA recipe 11.3'
    });
    console.log(JSON.stringify(r));
  "
  Expected: { ok: true, data: { expiresAt: '<ISO 7 days out>' } }

ASSERTION A — trial granted:
  Supabase MCP execute_sql:
    SELECT id, status, grant_kind, override_plan_key, base_plan_key, expires_at
    FROM talent_plan_overrides
    WHERE talent_profile_id = '878cb63f-...' AND status = 'active';
  Expected row: grant_kind='trial', override_plan_key='talent_pro', status='active', expires_at ~7 days out.

  Supab
### risks
- trial_will_end webhook (customer.subscription.trial_will_end) is log-only today — no email/notification to the talent when a Stripe-native trial is about to end. B3 notification path is deferred. Admin-granted trials also have no notification at all.
- reconcile_expired_talent_plan_overrides runs lazily on load AND nightly via cron. A dormant talent who never opens any surface will not degrade until the cron fires at 03:00 UTC — up to ~24h stale window.
- plan_locked flag on talent_sites (set by onTalentPlanChanged) only blocks the builder UI; the public-page gate is separately enforced by planPermitsPublishedTalentSite checking talent_profiles.talent_plan_key — both must agree or the builder could show a 'locked' banner while the public page still serves the premium site if reconcile hasn't run yet.
- A trial cannot be 'indefinite' (server-action guard enforces this), but a 'comp' grant CAN be indefinite. The two look identical to the talent unless grant_kind is surfaced in the UI — the admin must choose the right kind at grant time.
- If a talent pays for Pro (talent_subscriptions row active) during a Max trial, reconcile_expired_talent_plan_overrides restores to the live paid plan key (correct), NOT the stale base snapshot — this is correct behavior but should be QA'd if a talent self-upgrades mid-trial.
### openDecisions
- trial_will_end notification (B3): when Stripe fires customer.subscription.trial_will_end, the handler logs only. No email or in-app banner is sent to workspace owners or talent. Decision needed: which surface owns the 3-day-out notification?
- Admin-granted trial expiry notification: there is no webhook for an admin-override expiry (it's not a Stripe event). If we want to notify the talent '7 days before your Pro trial ends', it would need a separate scheduled check (extend the cron) or a Supabase pg_cron job. Currently not built.
- Workspace-side trial_will_end: the webhook-routing.ts trial_will_end action is mapped but has no workspace-specific handling — it's the same log-only path. Workspace plan overrides have an identical reconcile_expired_plan_overrides (workspace) fn but no notification path either.

## fix-11.4-dunning-resync
### currentState
webhook-routing.ts line 87: `StripeAction` union member `invoice_payment_succeeded` = `{ kind: "invoice_payment_succeeded"; customerId: string | null; amountPaid: number; currency: string }` — no `subscriptionId` field.

webhook-routing.ts lines 215-223: classifier case `"invoice.payment_succeeded"` extracts only `invoice.customer`, `invoice.amount_paid`, `invoice.currency`. It does NOT read `invoice.parent?.subscription_details?.subscription` (the subscription id field), even though the parallel `invoice.payment_failed` case at lines 206-213 already does exactly that.

webhook-handler.ts lines 420-427: `case "invoice_payment_succeeded"` handler only emits a dev-mode `improntaLog`. No retrieve-and-sync. Comment says "no entitlement change" which is wrong after dunning recovery (sub status flips `past_due → active`).

`syncSubscriptionByType` at webhook-handler.ts lines 102-127: already handles both talent and workspace subscriptions correctly. It is already called by `invoice_payment_failed` at lines 323-332 (retrieve → `syncSubscriptionByType`). That path is the exact template.

`syncStripeSubscriptionToDb` (workspace-billing.ts line 265): upserts `workspace_subscriptions` and writes `agencies.plan_tier`. The `mapStripeStatus` in utils.ts correctly maps Stripe `"active"` → `"active"`.

`syncTalentSubscriptionToDb` (talent-billing.ts line 239): upserts `talent_subscriptions` and writes `talent_profiles.talent_plan_key`. CAUTION: lines 288-302 contain a stale-event guard that 
### migrations
(none)
### editMap
- **web/src/lib/stripe/webhook-routing.ts** — Line 87 — add `subscriptionId` to the `invoice_payment_succeeded` action shape. Replace:

  | { kind: "invoice_payment_succeeded"; customerId: string | null; amountPaid: number; currency: string }

with:

  | { kind: "invoice_payment_succeeded"; subscriptionId: string | null; customerId: string | null; amountPaid: number; currency: string }

Lines 215-223 — expose the subscription id from the invoice object in the classifier. Replace:

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        kind: "invoice_payment_succeeded",
        customerId: refId(invoice.customer),
        amountPaid: invoice.amount_paid ?? 0,
        currency: invoice.currency ?? "usd",
      };
    }

with:

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        kind: "invoice_payment_succeeded",
        subscriptionId: refId(invoice.parent?.subscription_details?.subscription),
        customerId: refId(invoice.customer),
        amountPaid: invoice.amount_paid ?? 0,
        currency: invoice.currency ?? "usd",
      };
    }
- **web/src/lib/stripe/webhook-routing.test.ts** — Update the existing `invoice.payment_succeeded` test (line 311) to assert the new `subscriptionId` field, and add a second test for the case where the invoice has no parent subscription (subscriptionId null). Replace the existing test:

test("invoice.payment_succeeded → invoice_payment_succeeded (audit log)", () => {
  const a = classifyStripeEvent(
    evt("invoice.payment_succeeded", {
      id: "in_3",
      customer: "cus_1",
      amount_paid: 1200,
      currency: "usd",
    }),
  );
  const action = expectKind(a, "invoice_payment_succeeded");
  assert.equal(action.customerId, "cus_1");
  assert.equal(action.amountPaid, 1200);
  assert.equal(action.currency, "usd");
});

with:

test("invoice.payment_succeeded with parent subscription → subscriptionId extracted", () => {
  const a = classifyStripeEvent(
    evt("invoice.payment_succeeded", {
      id: "in_3",
      customer: "cus_1",
      amount_paid: 1200,
      currency: "usd",
      parent: { subscription_details: { subscription: "sub_ren" } },
    }),
  );
  const action = expectKind(a, "invoice_payment_succeeded");
  assert.equal(action.subscriptionId, "sub_ren");
  assert.equal(action.customerId, "cus_1");
  assert.equal(action.amountPaid, 1200);
  assert.equal(action.currency, "usd");
});

test("invoice.payment_succeeded without parent subscription → subscriptionId null", () => {
  const a = classifyStripeEvent(
    evt("invoice.payment_succeeded", {
      id: "in_3b",
      customer: "cus_1",
      amount_paid: 500,
      currency: "usd",
    }),
  );
  const action = expectKind(a, "invoice_payment_succeeded");
  assert.equal(action.subscriptionId, null);
});
- **web/src/lib/stripe/webhook-handler.ts** — Lines 420-427 — replace the log-only handler with a retrieve-and-sync that mirrors the `invoice_payment_failed` handler at lines 323-332. Replace:

    case "invoice_payment_succeeded":
      // Subscription renewal billed — no entitlement change. Log for audit.
      if (process.env.NODE_ENV !== "production") {
        void improntaLog("stripe_webhook.info", {
          message: `[stripe.subscription] invoice paid customer=${action.customerId ?? "?"} amount=${action.amountPaid} ${action.currency}`,
        });
      }
      return;

with:

    case "invoice_payment_succeeded": {
      // Dunning recovery: when a past_due subscription's invoice is
      // eventually collected, Stripe fires invoice.payment_succeeded BEFORE
      // customer.subscription.updated. Re-syncing here ensures the DB flips
      // from past_due → active immediately, without waiting for the follow-up
      // subscription event. For normal renewals (already active) the upsert is
      // a no-op because the status is unchanged. When there is no subscription
      // id (e.g. a one-time invoice), skip the sync and just log.
      if (action.subscriptionId) {
        let subscription: Stripe.Subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(action.subscriptionId);
        } catch (err) {
          throw new TransientWebhookError(`subscriptions.retrieve failed for ${action.subscriptionId}`, err);
        }
        await syncSubscriptionByType(subscription, event.id);
      } else {
        // One-time invoice (no subscription) — audit log only.
        void improntaLog("stripe_webhook.info", {
          message: `[stripe.subscription] invoice paid (no subscription) customer=${action.customerId ?? "?"} amount=${action.amountPaid} ${action.currency}`,
        });
      }
      return;
    }
### newFns
### qaDriveRecipe
Prerequisites: stripe CLI pointed at Stripe sandbox acct_1ThlEN7Oqi82ykAI with `stripe listen --forward-to localhost:3000/api/stripe/webhook`. STRIPE_WEBHOOK_SECRET set from the CLI output.

1. FORCE PAST_DUE — in the Stripe dashboard for sandbox acct_1ThlEN7Oqi82ykAI, find a workspace subscription (checkout_type=workspace_subscription, plan_key=studio/agency) that is currently `active`. Use the Stripe test clock or the Stripe Dashboard > Subscriptions > \"…\" > \"Mark as past_due\" (test mode) to flip it to past_due. Alternatively: `stripe subscriptions update sub_XXX --status past_due` (test mode only). Verify: `select status from workspace_subscriptions where stripe_subscription_id='sub_XXX'` via Supabase MCP execute_sql — should return `past_due`.

2. ASSERT PAST_DUE IN DB — also assert `agencies.plan_tier` still shows the paid plan (past_due does not downgrade, per syncStripeSubscriptionToDb line 302-308): `select plan_tier from agencies where id=(select tenant_id from workspace_subscriptions where stripe_subscription_id='sub_XXX')`. Should NOT be `free`.

3. TRIGGER RECOVERY — in Stripe Dashboard (test mode), find the outstanding invoice for sub_XXX and click \"Pay\" / use `stripe invoices pay in_XXX` (test mode). This fires `invoice.payment_succeeded` then `customer.subscription.updated`.

4. ASSERT ACTIVE AFTER INVOICE EVENT — before the subscription.updated event arrives (the two are sequential but the invoice event fires first), check: `select status from workspace_subscriptions where stripe_subscription_id='sub_XXX'`. After the fix it should already be `active` from the `invoice.payment_succeeded` handler. Check server logs for `[stripe.subscription] invoice paid` log line to confirm the old log-only path is gone.

5. FOR TALENT SUBSCRIPTIONS — repeat steps 1
### risks
- syncTalentSubscriptionToDb stale-event guard (talent-billing.ts lines 288-302) only blocks re-promotion of a TERMINALLY CANCELLED subscription. Dunning recovery transitions past_due → active, not cancelled → active, so the guard does NOT block the recovery sync. No change needed, but verify the guard logic if a dunning recovery on a talent sub ever fails to sync.
- invoice.payment_succeeded fires for ALL invoices on the customer, including one-time invoices (no parent subscription). The fix already handles this: when subscriptionId is null (refId returns null for a non-subscription invoice), the handler falls through to the log-only branch. Confirm no TypeError from stripe.subscriptions.retrieve with a null id.
- Normal renewal (already active sub): retrieve + syncSubscriptionByType is called on every invoice.payment_succeeded even when the sub was never past_due. This is a safe no-op upsert (status unchanged, period dates advance). Cost: one extra Stripe API call + one DB upsert per renewal event. Acceptable for correctness.
- webhook-routing.ts uses invoice.parent?.subscription_details?.subscription — this is the Stripe v2 (dahlia API) invoice shape (parent replaces the old top-level subscription field). This matches the existing invoice.payment_failed path at line 208 which already uses the same access pattern, so it is correct for the API version in use (2026-04-22.dahlia).
### openDecisions
- TALENT STALE-EVENT GUARD: syncTalentSubscriptionToDb refuses to write when the existing row is already terminal (cancelled/incomplete_expired) and the incoming event is non-terminal. That guard is correct for termination but technically blocks a scenario where a subscription row somehow got stuck in cancelled and then the same subscription recovered (rare, but possible if an admin manually altered the DB row). Leave the guard as-is — it protects against Stripe's out-of-order delivery guarantee — but note it as a known edge case.
- ONE-TIME INVOICE LOGGING: the null-subscriptionId branch logs only in non-production (the old behavior). The spec preserves this. If ops wants all invoice payment events logged in production for an audit trail, the log call should remove the NODE_ENV guard. Not changed here — flag for a follow-up if needed.

## recipe-discover-2.7-2.8
### currentState
Route: /Users/oranpersonal/Desktop/impronta-app/web/src/app/api/discover/inquiry/route.ts (lines 1-226)

Request body shape (type SubmitBody, line 37-45):
  talentIds: string[]          // required; empty array → 400 talent_ids_required
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  eventDate?: string           // ISO YYYY-MM-DD
  eventLocation?: string
  message?: string
  sourceShortlistId?: string   // triggers source_channel="discover_shortlist" when set

Auth: requires signed-in user (getCachedActorSession, line 61). Returns 401 if session.user is null.

Discoverability prerequisites (route.ts lines 108-138 + matview migration 20260515134903_talent_discover_index.sql):
  - talent_profiles.is_discoverable = TRUE
  - talent_profiles.workflow_status IN ('approved', 'published')
  - at least one agency_talent_roster row with status IN ('active', 'pending')
    (else skipped with reason="no_roster")
  Primary-roster preference (line 125-133): picks is_primary=true row first;
  falls back to first active/pending roster row if no primary found.

Tenant grouping (lines 103-138): talents are grouped by chosen.tenant_id into
Map<tenantId, string[]>. One submitInquiry call per bucket (lines 177-216).
source_channel resolution (lines 167-169):
  talentIds.length > 1 OR sourceShortlistId set → "discover_shortlist"
  else → "discover_single_talent"

Response (200):
  { inquiries: Array<{ tenantId, inquiryId, talentIds }>, skipped: Array<{ talentId, reason }>,
### migrations
(none)
### editMap
### newFns
### qaDriveRecipe
## Prerequisites — verify before driving

1. Dev server running at localhost:3000 (NODE_ENV=development).

2. Confirm both talents are in the matview (Supabase MCP execute_sql):
   SELECT id, display_name FROM talent_discover_index
   WHERE id IN (
     '878cb63f-6999-4ed3-8469-35e5a2a1c17a',
     'de81316a-8939-49d0-afbc-f946c64648af'
   );
   Expected: 2 rows. If 0 rows → trigger a matview refresh:
   POST http://localhost:3000/api/cron/refresh-discover-index
   (with Authorization: Bearer $CRON_SECRET from .env.local), then re-check.

3. Confirm roster rows exist (execute_sql):
   SELECT talent_profile_id, tenant_id, is_primary, status
   FROM agency_talent_roster
   WHERE talent_profile_id IN (
     '878cb63f-6999-4ed3-8469-35e5a2a1c17a',
     'de81316a-8939-49d0-afbc-f946c64648af'
   ) AND status IN ('active','pending');
   Expected: Sofía has a row with tenant_id='00000000-0000-0000-0000-000000000001', is_primary=true.
   Marco has a row with tenant_id='40081ec3-5ca8-43a0-b50b-31c927b2716b'.

---

## Step 1 — Acquire qa-client-1 session cookie

```bash
# Run once. Captures cookies (-c) into /tmp/client-cookies.txt.
# /api/dev/signin is short-circuited before host gating and bypasses
# the agency_domains check entirely in dev mode.
curl -s -o /dev/null -w "%{http_code}" \
  -c /tmp/client-cookies.txt \
  "http://localhost:3000/api/dev/signin?email=qa-client-1%40impronta.test"
# Expected: 307 (redirect to "/"). Cookie jar now has the sb-* Supabase SSR tokens.
```

Note: the passwordless path (email ends in @impronta.test, no password) uses
admin.auth.admin.generateLink + supabase.auth.verifyOtp to mint the session
server-side and set SSR cookies on the redirect response (route.ts lines 64-85).

---

## Story 2.7 — Discover: single talent (Sofía, Impronta tenant)

``
### risks
- Rate-limit exhaustion: 5 submissions/hour per authenticated user (inquiry-engine-submit.ts line 234). If other agents ran QA submits for qa-client-1 in the past hour, the 6th call silently returns rate_limited inside fanFailures with a 500 HTTP status. Check by running a clean-state probe or use qa-client-2 (688787f4-...) as a fallback.
- Real Impronta tenant (00000000-...-0001) will receive inquiry rows for Sofía. These MUST be deleted after the drive. Do NOT mistake them for real bookings.
- talent_discover_index matview may be stale if the cron has not run since the last talent_profiles update. Always run the SELECT-from-matview check (step in Prerequisites) before hitting the route. Refresh via POST /api/cron/refresh-discover-index if needed.
- Marco's owning_party_type resolves to 'talent' (hub self-coord) because source_channel='discover_shortlist' makes isHubSourcedChannel return true, and Marco is non-exclusive. This is correct behavior per owning-party-resolver.ts line 183. Do not interpret it as a routing bug.
- Sofía is primary-exclusive on Impronta (plan_tier='agency' or 'network' in EXCLUSIVE_PLAN_TIERS). Her owning_party resolves to type='agency' regardless of hub-source flag (owning-party-resolver.ts line 174: exclusive check fires before the hubSourced branch). If Impronta's plan_tier has been mutated to 'free' by another test, Sofía's owning_party will fall through to 'talent' instead — verify plan_tier on agencies WHERE id='00000000-...-0001' is NOT 'free' before driving.
- The /api/dev/signin route uses a magiclink flow (generateLink + verifyOtp) to set SSR cookies server-side. The response is a 307 redirect; curl with -c captures the cookies from the redirect response headers. If the Supabase project is down or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from .env.local, the signin step will return 503.
### openDecisions
- 2.8 fan-out currently uses Sofía (Impronta-primary-exclusive) and Marco (Tulala-only). This is the clearest two-tenant split available in the fixture set. If a third talent on qa-agency (22222222-...) with is_discoverable=true and workflow_status=published is available, a 3-way fan-out could also be exercised — but requires verifying the talent is in the matview first.
- The shortlist_id in 2.8 is a synthetic string ('qa-test-shortlist-2.8') — the route only reads it from source_context JSONB and does not validate it against an actual shortlists row. If the real UI requires an actual shortlists.id, a real shortlist must be seeded first via POST /api/discover/shortlists as qa-client-1.
- After a 2.8 fan-out, each inquiry routes to a different tenant. The approval-population path (#1 fix) seeds approval requirements per-inquiry scoped to that inquiry's tenant. This is the intended behavior but has not been live-proven for the multi-tenant case. The DB assertion in step 4 of 2.8 covers this — flag if cross-contamination is seen.

## recipe-2.12-pitch
### currentState
Pitch engine: /Users/oranpersonal/Desktop/impronta-app/web/src/lib/pitch/pitch-engine.ts
  - createPitchDraft(supabase, CreatePitchDraftInput) → PitchResult<{pitchId}>  (lines 172–244)
  - sendPitch(supabase, SendPitchInput) → PitchResult<SentPitchOutput>  (lines 342–452)
  - convertPitchToInquiry(supabase, ConvertPitchInput) → PitchResult<ConvertedPitchOutput>  (lines 723–898)
  - filterPublishableTalentIds: internal — requires agency_talent_roster.status≠'removed' AND talent_profiles.workflow_status='approved' AND visibility='public' AND deleted_at IS NULL (lines 52–84)

Share token: /Users/oranpersonal/Desktop/impronta-app/web/src/lib/pitch/pitch-share-token.ts
  - signPitchToken(claims, ttlSeconds?) → {token, expiresAt}  — uses PREVIEW_JWT_SECRET (HS256, 7-day default TTL, min 1h/max 30d)
  - buildPitchShareUrl(token, baseUrl) → https://tulala.digital/share/pitch/<token>
  - PitchTokenClaims: {tenantId, pitchId, shareTokenId, issuerProfileId} — shareTokenId maps to pitches.share_token_id for revocation

Types: /Users/oranpersonal/Desktop/impronta-app/web/src/lib/pitch/pitch-types.ts
  - PitchStatus lifecycle: draft → sent → viewed → edited → approved → converted | declined | cancelled | expired
  - ConvertPitchInput: {token, contactInfo?, recipientUserId?}
  - ConvertedPitchOutput: {inquiryId, pitchId}

Admin server actions: /Users/oranpersonal/Desktop/impronta-app/web/src/app/(workspace)/[tenantSlug]/admin/pitches/actions.ts
  - CONFIRMED BUG line 74: `.select("plan")` —
### migrations
(none)
### editMap
- **web/src/app/(workspace)/[tenantSlug]/admin/pitches/actions.ts** — Bug fix (line 74+81): change `.select("plan")` to `.select("plan_tier")` and `agency?.plan` to `agency?.plan_tier`. The agencies table has no `plan` column; the real column is `plan_tier` (added in migration 20260630120000). Until this is fixed every call to createPitchDraftAction/sendPitchAction returns {ok:false, reason:'plan_not_eligible'} regardless of the workspace's actual plan.
### newFns
- `createPitchDraft` async function createPitchDraft(supabase: SupabaseClient, input: CreatePitchDraftInput): Promise<PitchResult<{ pitchId: string }>> (web/src/lib/pitch/pitch-engine.ts)
- `sendPitch` async function sendPitch(supabase: SupabaseClient, input: SendPitchInput): Promise<PitchResult<SentPitchOutput>> (web/src/lib/pitch/pitch-engine.ts)
- `convertPitchToInquiry` async function convertPitchToInquiry(supabase: SupabaseClient, input: ConvertPitchInput): Promise<PitchResult<ConvertedPitchOutput>> (web/src/lib/pitch/pitch-engine.ts)
### qaDriveRecipe
All engine calls go against the service-role client directly (bypasses the broken server-action plan gate). Set env vars from web/.env.local before running. PREVIEW_JWT_SECRET must be set for signPitchToken to work.

TENANT = '22222222-2222-2222-2222-222222222222'  (qa-agency)
ACTOR  = '4b9e595d-...'  (qa-admin user id — check auth.users via Supabase MCP)
SOFIA  = '878cb63f-6999-4ed3-8469-35e5a2a1c17a'

PRE-FLIGHT (Supabase MCP or execute_sql):
  -- Confirm Sofia is approved+public+rostered (must pass filterPublishableTalentIds)
  SELECT t.workflow_status, t.visibility, t.deleted_at, r.status AS roster_status
  FROM talent_profiles t
  JOIN agency_talent_roster r ON r.talent_profile_id = t.id AND r.tenant_id = '22222222-2222-2222-2222-222222222222'
  WHERE t.id = '878cb63f-6999-4ed3-8469-35e5a2a1c17a';
  -- Expected: workflow_status=approved, visibility=public, deleted_at=null, roster_status NOT 'removed'
  -- If not met, run: UPDATE talent_profiles SET workflow_status='approved', visibility='public' WHERE id='878cb63f-6999-4ed3-8469-35e5a2a1c17a';
  --                  INSERT INTO agency_talent_roster(tenant_id,talent_profile_id,status,is_primary) VALUES('22222222-2222-2222-2222-222222222222','878cb63f-6999-4ed3-8469-35e5a2a1c17a','active',true) ON CONFLICT DO UPDATE SET status='active';

STEP 1 — Create pitch draft (tsx script, uses service-role client):
  import { createClient } from '@supabase/supabase-js';
  import { createPitchDraft } from './src/lib/pitch/pitch-engine';
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const r1 = await createPitchDraft(supabase, {
    tenantId: '22222222-2222-2222-2222-222222222222',
    actorUserId: '<qa-admin-user-id>',
    talentProfileIds: ['878cb63f-6999-4ed3-8469
### risks
- BUG (blocking for server-action path): actions.ts line 74 reads .select('plan') but agencies.plan does not exist — real column is plan_tier. All calls to createPitchDraftAction/sendPitchAction always return {ok:false, reason:'plan_not_eligible'}. The QA recipe therefore must call the engine functions directly (service-role client tsx script), not via server actions. The edit in editMap MUST land before the admin UI pitch flow works at all.
- Sofia 878cb63f-6999-4ed3-8469-35e5a2a1c17a must be workflow_status=approved AND visibility=public AND on qa-agency's agency_talent_roster with status!='removed'. The filterPublishableTalentIds helper silently drops any talent that fails this check — if the roster row is missing the talent list will be empty and createPitchDraft will succeed (zero-talent draft is allowed) but sendPitch will return {ok:false, reason:'no_talents'}.
- Marco de81316a-8939-49d0-afbc-f946c64648af is tulala-hub-only (not on qa-agency roster). Using Marco in this recipe will result in a zero-talent draft / no_talents error. Use Sofia or add Marco to qa-agency's roster first.
- QUIRK (pinned in deep test): if pitch.status='converted' but converted_inquiry_id IS NULL, the idempotency short-circuit does NOT fire — the engine falls through to a second submitInquiry call. This is a latent double-conversion risk. Only scenario: a DB write to pitches.status succeeded but the subsequent converted_inquiry_id update failed mid-flight.
- The contact-gate bypass is doc-only for now (pitch-engine.ts lines 714-721 comment): the check in submitInquiry already bypasses on initiator_role='admin', so pitch conversions are protected. However if the contact-policy gate is ever tightened to apply to admin-role submits, the bypass will stop working without an explicit source_channel='pitch' exemption.
- PREVIEW_JWT_SECRET must match between the signing environment (sendPitch/createPitchDraft via tsx script) and the verification environment (convertPitchToInquiry). If the tsx script uses web/.env.local but a live call uses the Vercel env, the token will fail with bad_signature. Always source from the same .env.local for end-to-end QA.
### openDecisions
- Should the plan gate in actions.ts be updated to also accept the 'legacy' plan tier? The pitch-plan-gate.ts already includes 'legacy' in PITCH_ELIGIBLE_PLANS — this is implicitly handled once the column name bug is fixed.
- The origin_domain in convertPitchToInquiry is hardcoded null (pitch-engine.ts line 834) because the pitch share URL host is not reliably captured. Future work: store the host from the PITCH_PUBLIC_BASE_URL env or the incoming request host at send time, then propagate to the inquiry.
- The public landing at /share/pitch/[token] only shows the 'Submit as inquiry' button after status='approved' (the step-8 middle step). The engine itself does NOT enforce this (legacy path: 'sent'/'viewed'/'edited' all convert). Decision needed: should the engine add an approved-only gate, or keep the legacy fallback open for admin fast-path conversion?
- Auth requirement for the tsx QA script: the engine takes actorUserId as a plain string — it does NOT call auth.uid(). You must supply a valid auth.users.id (e.g. the qa-admin user id). For the service-role client path there is no JWT session to look up; use the UUID directly from the users table. For the server-action path (post-fix), the actor is resolved via getCachedActorSession() which requires an active browser session.