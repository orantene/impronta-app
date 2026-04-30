# Transaction & Payment Architecture — v1 Locked Spec

**Status:** Locked architecture spec. Author: founder (architectural direction); written 2026-04-25.

This document is binding. It defines the v1 transaction / payment model and the data shapes that current and future code must reserve room for. Any model change that conflicts must be raised as a Decision-Log amendment before implementation.

This doc complements [`docs/talent-relationship-model.md`](talent-relationship-model.md) and is referenced from `OPERATING.md` §12.

**This is not a request to build v1 payments now.** This is an architecture lock: when we start wiring payment surfaces (already starting in the prototype), the data model must already be the right shape. Code committed after this doc must not assume "agency always receives" or "payments are workspace billing" or "group booking implies split payouts."

---

## 1. The v1 model — what we're building toward

> **client pays → platform fee retained → one selected receiver gets net → receiver handles any downstream distribution outside the platform**

That's the entire v1 economic model in one line. The architecture must support it cleanly and grow into multi-split / commission chains later without reshape.

Core simplifications for v1:
- **One booking = one payout receiver.** Multi-split is deferred. Group bookings still resolve to one receiver.
- **Platform fee taken first.** Always. Even on `Free` if Free workspaces process bookings (they do — see plan-ladder rules).
- **Receiver does any downstream distribution externally** (writes the talent a check, etc.). The platform doesn't track that.
- **Manual payment handling is the v1 reality.** No Stripe wiring yet. The model supports it; the wiring is deferred.

What the architecture explicitly does **not** assume:
- ❌ "The agency always receives the payout."
- ❌ "Workspace billing (subscription) and booking payments share infrastructure."
- ❌ "Group bookings need split payouts at v1."
- ❌ "Payments are a future plugin, separate from the inquiry → booking pipeline."

---

## 2. Four-entity model (the architectural shape)

The v1 payment surface introduces **four new entities** alongside the existing booking/inquiry pipeline. None of these tables exist yet — this section is the reserved-shape spec.

### 2.1 `booking_transactions`

The canonical record of money moving for a booking. One booking = one (active) transaction; refunds may produce a second linked transaction.

```
booking_transactions
├─ id                   UUID PK
├─ booking_id           UUID FK → agency_bookings(id)        NOT NULL
├─ source_tenant_id     UUID FK → agencies(id)               NOT NULL
│   (denormalized for fast cross-tenant audit; trigger enforces equality
│    with agency_bookings.tenant_id)
├─ source_inquiry_id    UUID FK → inquiries(id)              NULL
│   (inquiries.tenant_id MUST equal source_tenant_id; trigger-enforced)
├─ payer_user_id        UUID FK → profiles(id)               NULL
│   (the client; nullable for guest-session bookings)
├─ payer_email          TEXT                                  NULL
│   (denormalized for guest-session bookings)
├─ payout_receiver_id           UUID FK → payout_accounts(id) NULL
├─ payout_receiver_kind         TEXT                          NULL
│   (snapshot at selection-time: 'agency' | 'admin' |
│    'coordinator' | 'talent'; denormalized so audit survives if
│    the underlying account changes)
├─ payout_receiver_display_name TEXT                          NULL
│   (snapshot for receipt/audit)
├─ gross_amount_cents   BIGINT                                NOT NULL
├─ platform_fee_cents   BIGINT                                NOT NULL
├─ net_amount_cents     BIGINT                                NOT NULL
│   (gross - fee; CHECK: net + fee = gross; non-negative)
├─ currency             TEXT  (ISO 4217)                      NOT NULL
├─ status               TEXT  (enum, see §5)                  NOT NULL
├─ provider             TEXT                                   NOT NULL
│   (v1: 'manual'. v2+: 'stripe', 'mercado_pago', etc.)
├─ provider_reference   TEXT                                   NULL
│   (e.g. Stripe PaymentIntent id; null for manual)
├─ provider_metadata    JSONB DEFAULT '{}'                     NOT NULL
├─ refund_of_transaction_id UUID FK → booking_transactions(id) NULL
│   (links a refund record back to the original transaction)
├─ requested_at         TIMESTAMPTZ NULL
├─ paid_at              TIMESTAMPTZ NULL
├─ payout_initiated_at  TIMESTAMPTZ NULL
├─ payout_completed_at  TIMESTAMPTZ NULL
├─ refunded_at          TIMESTAMPTZ NULL
├─ failed_at            TIMESTAMPTZ NULL
├─ failure_reason       TEXT NULL
├─ created_by_profile_id UUID FK → profiles(id) NULL
│   (the staff member who initiated the transaction; null for
│    client-initiated flows)
├─ created_at           TIMESTAMPTZ DEFAULT now()              NOT NULL
└─ updated_at           TIMESTAMPTZ DEFAULT now()              NOT NULL

Indexes:
  (booking_id) WHERE status NOT IN ('cancelled','failed')  -- one active txn per booking
  (source_tenant_id, status, created_at DESC)              -- workspace inbox
  (payout_receiver_id) WHERE status IN ('paid','payout_pending','payout_sent')

RLS (Phase 2 hardening):
  staff_select_own_tenant — staff of source_tenant_id
  payer_select_self       — client sees own transactions
  receiver_select_self    — payout receiver sees their transaction
  platform_admin_all      — super_admin sees all
```

### 2.2 `payout_accounts`

The normalized representation of "who can receive money." One row per payout-eligible entity (agency-level OR per-user-within-workspace).

```
payout_accounts
├─ id                UUID PK
├─ tenant_id         UUID FK → agencies(id)        NOT NULL
│   (the workspace this account is associated with — agency-level
│    or per-member-of-workspace)
├─ owner_type        TEXT                          NOT NULL
│   ('agency' | 'profile' | 'talent')
├─ owner_id          UUID                          NOT NULL
│   (references agencies.id when owner_type='agency';
│    references profiles.id when 'profile';
│    references talent_profiles.id when 'talent')
├─ display_name      TEXT                          NOT NULL
│   (operator-facing label; "Acme Agency", "Maria Lopez", etc.)
├─ provider          TEXT                          NOT NULL
│   (v1: 'manual_bank'. v2+: 'stripe_connect', 'mercado_pago', etc.)
├─ provider_account_id TEXT                        NULL
│   (e.g. Stripe Connect acct_xxx)
├─ status            TEXT                          NOT NULL
│   ('pending_verification' | 'connected' | 'restricted' |
│    'disconnected' | 'failed')
├─ requirements_pending_jsonb JSONB DEFAULT '{}'   NOT NULL
│   (Stripe Connect requirements payload; or v1 manual bank fields TBD)
├─ connected_at      TIMESTAMPTZ NULL
├─ last_verified_at  TIMESTAMPTZ NULL
├─ disconnected_at   TIMESTAMPTZ NULL
├─ created_by_profile_id UUID FK → profiles(id) NULL
├─ created_at        TIMESTAMPTZ DEFAULT now()     NOT NULL
├─ updated_at        TIMESTAMPTZ DEFAULT now()     NOT NULL

Constraints:
  UNIQUE (tenant_id, owner_type, owner_id)
    WHERE status IN ('pending_verification','connected')
    -- one active payout account per (workspace, owner)

RLS:
  staff_select_own_tenant       — workspace staff see all accounts in their tenant
  owner_select_self             — the user who owns the account sees it
  receiver_eligibility_lookup   — public-ish read for fields needed
                                  during receiver-selection in a booking
                                  (display_name, status, owner_type only)
```

`status = 'connected'` is the **only** value that makes an account eligible to be selected as a payout receiver. The receiver-selection UI must filter on this.

### 2.3 Platform fee configuration

Platform fee lives on `plans` (it's plan-driven, not per-tenant). Reserved column on the future `plans` table:

```
plans.platform_fee_basis_points  INTEGER NOT NULL DEFAULT 1000
   (1000 = 10.00%; 500 = 5.00%; 0 = waived)
```

Per-tenant overrides for grandfathered or enterprise customers go through the special-plan pattern (per the override-governance rules in `OPERATING.md` §10): create a custom plan with a custom fee. No separate `agency_fee_overrides` table needed in v1.

The fee is computed at transaction-creation time and snapshotted on `booking_transactions.platform_fee_cents`. Subsequent fee changes don't retroactively affect existing transactions.

### 2.4 Payment events (extension of `inquiry_events`)

Don't create a separate `booking_events` table. Extend `inquiry_events` with a nullable `booking_id` column:

```
inquiry_events
├─ ... (existing columns)
└─ booking_id  UUID FK → agency_bookings(id)  NULL
    (set when the event relates to a booking phase, not the inquiry phase)
```

All payment-related events log here. Visibility flag (`participants` vs `staff_only`) is set per event type per §6.

---

## 3. Source-ownership invariants

The most important rule from [`docs/talent-relationship-model.md`](talent-relationship-model.md) §6 — **inquiry ownership = source URL** — flows directly into payment ownership:

> The workspace whose domain/URL received the inquiry owns the booking, owns the payment context, and is the only workspace that can configure the payout receiver for that booking.

### Enforced invariants

```
∀ inquiry I, booking B, transaction T:
  B.source_inquiry_id = I.id  ⇒  B.tenant_id = I.tenant_id
  T.booking_id = B.id          ⇒  T.source_tenant_id = B.tenant_id
  T.source_inquiry_id = I.id   ⇒  T.source_tenant_id = I.tenant_id
```

Implementation: triggers on `agency_bookings` and `booking_transactions` enforce the equality. Any code that bypasses (e.g., direct SQL update) fails the trigger.

### What this rules out

- Payment receiver selected from a workspace that doesn't own the booking. Rejected.
- A booking's tenant changing (e.g., "transfer this booking to a different agency"). Not supported in v1; would be a destructive operation across the whole transaction trail. Defer.
- Cross-workspace payment data leaks. RLS on `booking_transactions` enforces tenant scope on both staff and receiver reads.

### Multi-source talent context

Per the talent-relationship model, the same talent appears in multiple workspaces. Same talent → multiple inquiries (one per source workspace) → multiple bookings (each owned by its source) → multiple transactions (each in its source). **No transaction ever crosses source.** Same talent receives net amounts from multiple workspaces independently; each receiver-selection is per-booking, per-source.

---

## 4. Receiver selection — who can be selected

### 4.1 Eligible receiver types

Per the v1 directive, the eligible types are:

1. **Agency owner** — payout goes to the workspace's agency-level payout account
2. **Admin** — a workspace admin's personal payout account
3. **Coordinator** — the booking's coordinator's personal payout account
4. **Talent** — one of the talents on the booking

For each, the candidate must have a `payout_accounts` row with `status='connected'` AND `tenant_id = booking.tenant_id`.

### 4.2 Eligibility query (the rule code reads)

```sql
-- Candidates a workspace member can pick from when selecting receiver for a booking
SELECT pa.id, pa.owner_type, pa.display_name, pa.status
FROM payout_accounts pa
WHERE pa.tenant_id = :booking_tenant_id
  AND pa.status = 'connected'
  AND (
    -- 1) Agency-level account
    (pa.owner_type = 'agency' AND pa.owner_id = :booking_tenant_id)
    OR
    -- 2) Workspace member with appropriate role (admin / coordinator / owner)
    (pa.owner_type = 'profile' AND EXISTS (
       SELECT 1 FROM agency_memberships m
       WHERE m.tenant_id = :booking_tenant_id
         AND m.profile_id = pa.owner_id
         AND m.status = 'active'
         AND m.role IN ('owner', 'admin', 'coordinator')
    ))
    OR
    -- 3) Talent on this booking
    (pa.owner_type = 'talent' AND EXISTS (
       SELECT 1 FROM booking_talent bt
       WHERE bt.booking_id = :booking_id
         AND bt.talent_profile_id = pa.owner_id
    ))
  );
```

A connected account that's NOT in one of the three categories is filtered out. A talent rostered in the workspace but NOT on this specific booking is NOT a candidate (you can't pick a non-participating talent as receiver).

### 4.3 Group bookings

`booking_talent` already supports many talents per booking. v1 lets the operator pick **one** of them (or the agency, or admin, or coordinator) as receiver. The other talents see the booking and the receiver but receive nothing through the platform.

The selection is **explicit** — not derived. There's no "default to first talent" or "default to highest-rank role." Operator picks; UI shows the list with eligibility indicators.

### 4.4 Default UX guidance (not a hard rule)

The receiver-selection UI may present a default suggestion, but **does not auto-select**:
- Single-talent booking, talent has connected account → suggest `talent`
- Multi-talent booking → no default; operator must pick
- Talent on exclusive relationship → suggest `agency` (the agency typically handles distribution to exclusive talent)
- Free-tier workspace where the owner is also the only talent (AlsoTalent) → suggest the agency-level account (which is the owner anyway)

These are display defaults. The operator can always pick a different eligible candidate.

### 4.5 Receiver changes mid-flow

Receiver can be changed **before** `status='paid'`. Each change emits a `payment.receiver_changed` event with old and new values. After payment is received, the receiver is locked — changing it would require a refund + new transaction.

Capability `booking.payment.change_receiver` is admin+ (more sensitive than initial selection at coordinator+).

---

## 5. Booking payment state machine

The state lives on `booking_transactions.status`, NOT on `agency_bookings`. The booking has its own lifecycle (open / confirmed / fulfilled / cancelled). The transaction has its own.

### 5.1 States

```
draft
  Transaction record created with receiver selected; not yet sent to client.
  ↓
payment_requested
  Operator clicked "Request payment". Client received the link/instructions.
  Provider: 'manual' = email with bank details; 'stripe' = PaymentIntent created.
  ↓
pending
  Client initiated payment. Provider is processing.
  (For 'manual', this state may be skipped — operator marks 'paid' when wire arrives.)
  ↓
paid
  Funds received by the platform.
  ↓
payout_pending
  Queued for payout to receiver.
  Provider: 'manual' = waiting for operator to confirm external transfer;
            'stripe' = Stripe Connect transfer initiated.
  ↓
payout_sent
  Net amount delivered to receiver's connected account.
  TERMINAL (success).
```

### 5.2 Off-path states

```
failed
  Provider reported failure. Reason in `failure_reason`. Operator can
  retry (creates new transaction) or cancel.

cancelled
  Operator cancelled before payment. No money moved. TERMINAL.

refunded
  Money returned to client. If payout was already sent, the receiver
  must return funds (off-platform recovery; flag in refund metadata).
  A `refunded` transaction is paired with a refund-record transaction
  via `refund_of_transaction_id`. TERMINAL.

disputed
  Client filed a chargeback / formal dispute. Funds held; manual
  resolution required. Not a terminal state — resolves into one of
  paid/refunded.
```

### 5.3 Allowed transitions

```
draft           → payment_requested, cancelled
payment_requested → pending, paid, failed, cancelled
pending         → paid, failed, cancelled
paid            → payout_pending, refunded, disputed
payout_pending  → payout_sent, refunded, failed
payout_sent     → refunded (creates linked refund transaction)
failed          → payment_requested (retry), cancelled
disputed        → paid, refunded
```

Trigger enforces the valid-transition graph. Any other state change rejected.

### 5.4 v1 simplified path (manual provider)

For v1 with `provider = 'manual'`, the typical flow:

```
draft → payment_requested → paid → payout_pending → payout_sent
                  ↑                       ↑                ↑
       operator clicks         operator confirms     operator confirms
       "Request payment"       "Payment received"    "Paid receiver
                              (e.g. wire arrived)    externally"
```

No Stripe webhooks. Every state transition is operator-initiated. The schema supports this fully without modification — the difference is which actor advances the state.

---

## 6. Event taxonomy

All payment events log to `inquiry_events` with new `event_type` values. The `booking_id` column (added by the deferred migration) carries the link.

| event_type | actor_role | visibility | payload (JSONB) |
|---|---|---|---|
| `payment.receiver_selected` | admin / coordinator | `participants` | `{ receiver_id, receiver_kind, receiver_display_name }` |
| `payment.receiver_changed` | admin | `participants` | `{ from: {...}, to: {...} }` |
| `payment.requested` | admin / coordinator | `participants` | `{ gross_amount_cents, currency, provider }` |
| `payment.received` | admin / system | `participants` | `{ amount_cents, currency, provider_reference }` |
| `payment.failed` | system | `staff_only` | `{ reason }` |
| `payment.cancelled` | admin / coordinator | `participants` | `{ reason }` |
| `payment.refunded` | admin / system | `participants` | `{ amount_cents, refund_transaction_id }` |
| `payment.disputed` | system | `staff_only` | `{ provider_reference, reason }` |
| `payout.account_connected` | system / owner | `staff_only` | `{ payout_account_id, owner_type, owner_id }` |
| `payout.account_disconnected` | system / owner | `staff_only` | `{ payout_account_id, reason }` |
| `payout.initiated` | admin / system | `staff_only` | `{ amount_cents, provider }` |
| `payout.marked_external` | admin | `staff_only` | `{ amount_cents, note }` |
| `payout.sent` | system / admin | `participants` | `{ amount_cents, provider_reference }` |
| `payout.failed` | system | `staff_only` | `{ reason }` |

**Receiver-side events visible to participants** (selected, requested, received, refunded, sent) — the talent and client need to know who's getting paid and when.

**Account-management events are staff-only** — payout account lifecycle is workspace ops, not visible in client/talent chat.

The chat/timeline UI queries `inquiry_events` filtered by visibility per the existing pattern. No new infra.

---

## 7. Provider integration seam

The `provider` field on both `booking_transactions` and `payout_accounts` is the seam. Today's only value is `'manual'`. Future values: `'stripe'`, `'stripe_connect'`, `'mercado_pago'`, etc.

### 7.1 Provider responsibilities

For each provider, an adapter module under `web/src/lib/payments/providers/<name>.ts` implements:

```typescript
interface PaymentProvider {
  name: string;                                    // 'manual' | 'stripe'

  // Transactions
  createPaymentRequest(transactionId: string): Promise<{
    providerReference: string;
    clientPaymentUrl: string | null;  // null for manual
  }>;
  cancelPaymentRequest(transactionId: string): Promise<void>;
  refund(transactionId: string, amountCents?: number): Promise<{
    refundReference: string;
  }>;

  // Payouts
  initiatePayout(transactionId: string): Promise<{
    payoutReference: string;
  }>;

  // Connection (payout accounts)
  startAccountConnection(payoutAccountId: string): Promise<{
    onboardingUrl: string | null;
  }>;
  refreshAccountStatus(payoutAccountId: string): Promise<{
    status: PayoutAccountStatus;
    requirements: Record<string, unknown>;
  }>;

  // Webhooks
  handleWebhook(payload: unknown, signature: string): Promise<void>;
}
```

### 7.2 v1 manual provider behavior

- `createPaymentRequest`: returns `clientPaymentUrl: null`; the operator copies bank details into a manual message
- `cancelPaymentRequest`: no-op
- `refund`: marks the linked transaction as a refund record; relies on operator to wire money back externally
- `initiatePayout`: no-op (operator confirms `payout.marked_external` after they pay externally)
- `startAccountConnection`: no-op; account is created with manual bank fields (account name, IBAN/routing, etc.)
- `refreshAccountStatus`: returns current status; manual-only fields don't change unless operator updates
- `handleWebhook`: not applicable

### 7.3 Stripe Connect (v2 deferred, but seam ready)

When Stripe lands:
- `provider = 'stripe'` for the platform-acceptance side; `'stripe_connect'` for the payout side
- Webhook route at `web/src/app/api/webhooks/stripe/route.ts` calls `handleWebhook` on the right adapter
- `provider_account_id` on `payout_accounts` stores the Connect account id
- `provider_reference` on `booking_transactions` stores the PaymentIntent id

The schema needs no changes for Stripe — the seam is sized correctly.

---

## 8. Capability keys (added to registry now)

The following capabilities are added to [`web/src/lib/access/capabilities.ts`](../web/src/lib/access/capabilities.ts) as locked product contracts. Most have no callers in v1; they exist so names are stable for the prototype and future wire-up.

| Key | Category | Gating | Granted to |
|---|---|---|---|
| `booking.payment.select_receiver` | billing | role | coordinator+ |
| `booking.payment.change_receiver` | billing | role | admin+ |
| `booking.payment.request` | billing | role | coordinator+ |
| `booking.payment.mark_received` | billing | role | admin+ (manual provider only) |
| `booking.payment.refund` | billing | role | admin+ |
| `booking.payment.payout_mark_external` | billing | role | admin+ (manual provider only) |
| `payout_account.connect_self` | billing | relationship | owner of the account being connected |
| `agency.payout_account.manage` | billing | role | owner |
| `platform.payments.view_all` | platform | platform_role | super_admin |
| `platform.fee.configure` | platform | platform_role | super_admin |

10 new capability keys. Registry: 57 → 67.

`payout_account.connect_self` is relationship-gated because:
- Talent connecting own payout account: needs to be the owner of the talent profile
- Workspace member connecting own personal account: needs to be the named profile
- The "self" check is a relationship-state evaluation, not a tenant-role check

---

## 9. Schema changes — what's reserved (deferred migrations)

These migrations are **not** written yet. They're locked here so future implementation matches.

### 9.1 New tables

- `booking_transactions` (full DDL in §2.1)
- `payout_accounts` (full DDL in §2.2)

### 9.2 Modified tables

- `inquiry_events`: add `booking_id UUID FK NULL`
- `plans`: add `platform_fee_basis_points INTEGER NOT NULL DEFAULT 1000`
- `agency_bookings`: existing `payment_status` and `payment_method` columns are **deprecated** in favor of `booking_transactions.status` and `booking_transactions.provider`. They stay for backward-compatibility during transition; new code reads from the transaction. After Track wiring lands, drop them per the pre-launch removal policy.

### 9.3 Triggers

- `booking_transactions_source_tenant_consistency` — enforces the source-ownership invariants in §3
- `booking_transactions_state_transition` — enforces the state machine in §5.3
- `payout_accounts_unique_active` — enforces the partial unique constraint per §2.2
- `inquiry_events_booking_tenant_consistency` — when `booking_id` is set, the event's referenced booking's tenant must equal the inquiry's tenant

### 9.4 RLS

Standard tenant-scoped policies via `is_staff_of_tenant(source_tenant_id)`. Plus:
- Payer-self-read on `booking_transactions` (client sees their own)
- Receiver-self-read on `booking_transactions` (the payee sees the transaction they're receiving)
- Owner-self-read on `payout_accounts` (the connected user sees their own account)
- Platform-admin-read-all (super_admin via `is_platform_admin()`)

These migrations land **when v1 payment surfaces actually start needing them**. Capability keys exist now so prototype copy / placeholder UI can reference the right names.

---

## 10. What's explicitly out of scope for v1

- **Multi-split payouts.** One booking, one receiver. Period.
- **Commission chains.** "Agency takes 20%, talent gets 80%" auto-calculation. Receiver handles externally.
- **Auto-derived receivers from relationship type.** No "exclusive talent → automatic agency receiver" hardcoding. Always selected per booking.
- **Cross-currency conversion on the platform.** Each transaction is in one currency.
- **Tax handling / VAT / 1099s.** Receiver handles tax obligations on the net amount they receive; the platform doesn't compute or remit.
- **Subscription-style recurring bookings.** Each booking is one transaction.
- **Platform-driven payouts in installments / escrow.** v1 is request → pay → payout. No held funds beyond clearance time.
- **Disputed-transaction resolution UI.** Surfaces it; manual resolution off-platform.
- **Talent-side direct booking acceptance (booking happens without operator).** Requires the operator to coordinate. Platform-bypass direct-booking is a future product question.

These rules let us ship v1 narrow and grow into v2 without retrofit pain.

---

## 11. UX implications (for the prototype + Track B.5 shell)

The prototype is already starting to render placeholder payment flows. As they evolve:

### Booking detail (workspace admin)

- **Payment receiver** card. Shows currently-selected receiver (kind, display name, account status). "Change" button (admin+ capability). When unset: empty state with "Select payout receiver" CTA.
- **Receiver-selection drawer.** Lists eligible candidates per §4.2 query. Each row shows kind icon, display name, and connection state. Disabled rows (not connected) show "Not connected — invite to connect" link with explainer copy per the "explain why" rule.
- **Payment status.** Badge reflecting `booking_transactions.status`. Click to see full timeline (linked to `inquiry_events`).
- **Fee breakdown.** Always visible: "Gross $X · Platform fee $Y (Z%) · Net to receiver $W". Computed client-side from the snapshotted values.
- **Actions row.** Conditional buttons: "Request payment", "Mark received", "Mark payout sent externally", "Refund", "Cancel" — all gated by capability checks.

### Account drawer (any workspace member)

- **Payout account** section. If user has `payout_accounts.owner_type='profile'` row in current workspace: shows status + manage button. If not: "Connect a payout account" CTA.
- **Workspace payout account** section (owners only). Same shape, for the agency-level account.

### Talent surface (`/talent/account`)

- **My payout account.** The talent's own connected account. Cross-workspace context: which workspaces is this talent currently selectable as receiver on? Listed for transparency.
- **Eligibility status per workspace.** "You can receive payouts on bookings in: Acme Agency, Models Hub" — only shown when actually a candidate.

### Inquiry / chat timeline

- **Receiver-selected events** render as system messages: "Maria selected as payout receiver."
- **Payment-requested events** render with the amount and method, visible to client + talent + workspace staff.
- **Payment-received events** render with confirmation.
- **Payout events** render either as participant-visible (for `.sent`) or staff-only (for `.initiated`, `.marked_external`).

### Platform admin (`/admin/payments`)

- **Cross-tenant transaction list.** Super_admin only. Capability: `platform.payments.view_all`.
- **Fee configuration.** Per-plan `platform_fee_basis_points` editor. Capability: `platform.fee.configure`.
- **Provider config.** Stripe Connect creds, webhook secrets (when wired).

---

## 12. Integration with talent-relationship-model

This doc inherits and refines [`docs/talent-relationship-model.md`](talent-relationship-model.md). Key intersections:

### 12.1 Source ownership

Identical rule. The workspace whose URL got the inquiry owns the booking owns the transaction. No exceptions.

### 12.2 Exclusivity influences default receiver suggestion (NOT auto-selection)

- **Talent on exclusive relationship** → UI suggests `agency` as receiver default. Operator can override.
- **Talent on non-exclusive relationship** → no UI default; operator picks.
- **No talent on the booking** (event-only, no individual selected) → UI suggests `agency`.

The selection is always explicit and stored. Auto-selection isn't a thing.

### 12.3 AlsoTalent (operator-is-also-talent)

When the workspace owner is also one of the booking talents (Free-tier solo creator scenario):
- Both `agency`-level account and the owner's `talent` payout account may exist
- Both are eligible candidates — operator picks
- UI surfaces both clearly with explainer ("This is you, as the workspace owner" / "This is you, as a talent on the booking")

### 12.4 Multi-source talent

Per relationship-model §7: same talent receives inquiries from multiple workspaces. Each workspace's bookings produce their own transactions. The talent's `/talent/account` view shows their connected account and which workspaces it's eligible on, **but transactions are owned by the source workspaces** — the talent sees them from each source's chat thread, not in a unified "my earnings" view in v1.

A unified earnings view is a future surface. The data is there (transactions linked to the talent via `payout_receiver_id` and the `payout_account.owner_id`); the aggregation UI is deferred.

### 12.5 Profile lifecycle states

- `Draft` / `Invited` / `Awaiting approval` talents can't be selected as receiver (their relationship status isn't `active`)
- `Inactive` / `Removed` talents can't be selected
- Only `Published` + `Claimed` (or `Published` + the workspace's own talent profile) can be selected

---

## 13. Reference scenarios

### Scenario 1 — Single-talent agency booking, talent receives

Acme Agency on `agency` plan books a single dancer for an event. The agency runs `roster_join_mode='open_by_approval'`; the dancer is in a non-exclusive relationship.

Flow:
- Inquiry on `acme.tulala.digital`
- Booking created; tenant_id = acme
- Operator opens booking detail; receiver-selection drawer suggests `talent` (only one talent on booking, talent has connected account)
- Operator confirms receiver = dancer's payout account
- "Request payment" → manual provider; client receives bank details message
- Client wires payment → operator marks "Payment received"
- Operator pays dancer externally → clicks "Mark payout sent externally"
- Status: `payout_sent`
- Platform fee retained: net amount = gross − (gross × plans.platform_fee_basis_points / 10000)

### Scenario 2 — Group booking, agency receives, distributes externally

Same Acme Agency books 3 dancers + 1 musician for a wedding. The agency is set up to manage distribution itself.

Flow:
- Booking created with 4 `booking_talent` rows
- Operator opens receiver drawer; sees: agency, agency owner profile, coordinator profile, 4 talent options (only those connected listed as eligible)
- Operator selects `agency` (the agency-level payout account)
- "Request payment" → client receives bank details
- Payment received → status `paid`
- Operator distributes to the 4 talents externally (cash, individual transfers, however)
- Operator clicks "Mark payout sent externally" with note "Distributed individually 2026-04-30"
- `payout.marked_external` event logged with the note
- Status: `payout_sent`

The platform doesn't track the downstream distribution. That's the v1 simplification.

### Scenario 3 — Free-tier solo (AlsoTalent), self-receives

Maria runs a Free workspace on `maria.tulala.digital`. She's the owner AND her own talent. A client inquires through her workspace.

Flow:
- Inquiry on her workspace
- Booking created; only one talent (Maria herself)
- Receiver drawer shows: agency-level account (owned by her, since she's owner), her talent payout account
- Both rows render with "(you)" badge
- Operator (Maria) picks one — they go to the same bank account, but she might prefer the talent-level account for record-keeping
- Standard manual flow → `payout_sent`

### Scenario 4 — Hub-originated inquiry, agency-resident talent

Models Hub at `hub-models.tulala.digital` is browsed by a client. The client opens the profile of a model rostered exclusively at Acme Agency. Client inquires from the hub.

Flow:
- Inquiry on `hub-models.tulala.digital` → tenant_id = hub
- Hub operator coordinates the inquiry, converts to booking
- Booking belongs to the hub (source ownership)
- Receiver drawer shows: hub-level account, hub coordinator's profile, the model's talent account (if connected)
- Note: even though the model is exclusively at Acme Agency, Acme Agency is **not** automatically inserted as a candidate — the booking is hub-owned, not Acme-owned. The hub operator might pick the talent (who, per their exclusive relationship, would handle distribution to Acme externally) or the hub itself.
- Acme Agency does NOT see this transaction — it's on a different workspace's source domain

This is the most important scenario to understand: **exclusivity does not override source ownership**. Inquiries received elsewhere stay there.

---

## 14. Locked vs deferred

### Locked now

- v1 economic model (one booking, one receiver, platform fee, net to receiver, external distribution)
- Four-entity architecture (`booking_transactions`, `payout_accounts`, plan fee column, `inquiry_events.booking_id`)
- Source-ownership invariants (§3)
- Receiver eligibility rules (§4.2)
- Booking payment state machine (§5)
- Event taxonomy (§6)
- Provider integration seam (§7)
- 10 capability keys (§8)
- Out-of-scope list (§10)

### Deferred (planned, not built yet)

- All migrations (the four entities + triggers + RLS + plan column)
- Manual-provider adapter implementation
- Stripe Connect adapter implementation
- Webhook routes
- Booking-detail receiver-selection UI
- Account-drawer payout-account section
- Platform admin payments view + fee config
- Talent unified earnings view (future post-v1)
- Real receiver-eligibility query engine (today: queries don't run yet)

These are scheduled for after the dashboard restructure (Track B.5) lands the canonical shell — receiver-selection lives inside booking detail, which is part of that work.

---

## 15. Page-builder integration

When v1 payment surfaces wire into the dashboard, they consume the existing UI conventions per [`page-builder-invariants.md`](page-builder-invariants.md):

- **Receiver-selection drawer, payment-status panel, fee breakdown row** all compose inspector kit primitives (`KIT.input`, `KIT.label`, `InspectorGroup`, etc.). Don't re-style fields ad-hoc — the visual rhythm propagates.
- **`booking_transactions` and `payout_accounts`** carry `version` columns; their save actions follow the CAS protocol (reference: `web/src/lib/site-admin/server/sections.ts`).
- **Cache-tag entries** for `payment` / `payout` / `booking-detail` surfaces are added to `cache-tags.ts` when those reads need invalidation. The `tagFor` helper is the only path; bare-string tags are banned.
- **Updating `inquiry_events` to add `booking_id`** doesn't require new cache-tag work (events are typically read on-demand, not cached). But payment-state-driven UI surfaces (booking detail, talent earnings view) cache via `unstable_cache` — they pair with `updateTag` calls in payment server actions.

## 16. Reference

This doc is the canonical source. Code, schema, or copy that conflicts must be raised as a Decision-Log amendment before being changed.

The user's full transaction-direction statement that established this logic is in the session transcript dated 2026-04-25.
