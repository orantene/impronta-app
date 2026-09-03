# Tulala — Commission & Take-Rate Model
## Binding spec for platform / workspace / talent revenue split

**Date:** 2026-05-13
**Status:** Ratified and operative. Drives Phase B (Money) of the 2026 execution plan. **Supersedes** all commission-rate statements in `project_agency_exclusivity_model.md` and the SaaS Build Charter Phase 8. If any other doc states a platform-fee rate for any plan tier, this doc is the authority.
**Origin:** captured directly from the user 2026-05-13.
**Reconcile note (2026-05-22):** `project_agency_exclusivity_model.md` lists "Free = 0% commission" for Free-plan workspaces. That figure refers to the **workspace's own agency cut** (what the agency takes), not the Tulala platform fee. The platform fee is flat 5% for **all plan tiers in v1** — confirmed by the user 2026-05-22. The live `platform_commission_config` row encodes this as `default_take_bps = 500`, `plan_tier_bps = {}`. Free-plan workspaces remain a "friend-link" use-case where the agency takes 0% for themselves; Tulala's 5% still applies to any booking they process. See §9.1 and §11 item 2 for details.

---

## 0. Premise — one paragraph

> Every booking that lands inside Tulala carries up to three slices: a **platform** slice (Tulala's revenue), a **workspace** slice (the agency's commission), and a **talent** slice (what the talent takes home). The shape of each slice is configurable — percentage, fixed amount, or per-unit — and the rates can be set at four levels: **platform default**, **plan-tier default**, **per-workspace override**, and **per-booking override**. Money that flows through Stripe Connect splits automatically at the moment of capture. Money that flows off-platform (cash, wire, venue-paid) accrues to a **balance owed** the platform, settled via Stripe invoice on a regular cadence. The talent's take-home is always the residual, and is always visible to the talent line by line.

That's the whole model in one paragraph. The rest of the doc is the detail.

---

## 1. The three lanes

```
                    ┌─ Platform fee (Tulala)
Client pays gross ──┼─ Workspace fee (the agency)
                    └─ Talent net (what the talent actually gets)
```

| Lane | Owner | Default v1 | Customizable |
|------|-------|------------|--------------|
| **Platform** | Tulala | 5 % of gross | Yes, per plan-tier + per-tenant |
| **Workspace** | The agency | varies by plan + the offer line items | Yes, per-booking |
| **Talent net** | The talent | residual = gross − platform − workspace | Implicit |

Lanes are **always computed on the gross** (pre-tax, pre-fees, in presentment currency). VAT/IVA stacks on top — see §10.

---

## 2. The three shapes a commission can take

A single commission entry can be expressed in any of three ways. The resolver supports all three.

| Shape | Example | Stored as | Use case |
|-------|---------|-----------|----------|
| **Percentage** | "5 % of every booking" | basis points (`take_bps`) — 500 = 5.00 % | Platform default; most workspace cuts |
| **Fixed amount** | "Tulala takes 50 MXN on bookings under 1000 MXN" | cents (`take_fixed_cents`) | Minimum floor on small bookings |
| **Per-unit** | "Agency takes 200 MXN per hour" | cents per unit (`take_per_unit_cents`) | Hourly workspace commission — the user's example |

**Composition rule:** when multiple shapes apply, take the **maximum** (favors the commission-taker). E.g. platform default = 5 % OR 50 MXN floor, whichever is higher per booking.

For workspace take specifically: the line-item model already supports this natively. Each `inquiry_offer_line_items` row has `unit_price` (what client pays) and `talent_cost` (what talent gets). The difference IS the workspace margin. So:

```
Hourly job, 8 hours @ 400 MXN/hr client, 200 MXN/hr talent:
  unit_price = 400, talent_cost = 200, units = 8
  → total_price = 3200, talent_net = 1600, workspace_margin = 1600
```

Workspace take is the **sum of margins across all line items**. No need to express it as a separate %. The platform take stacks on top as its own slice.

---

## 3. The four config levels (override hierarchy)

Resolution goes **most-specific wins**:

```
1. Per-booking override        (set on the offer during drafting)
2. Per-workspace override      (set in tenant settings, requires platform admin approval for negotiated rates)
3. Plan-tier default           (Free / Studio / Agency / Network)
4. Platform default            (Tulala-set baseline — applies if nothing above is set)
```

**Who can set what:**

| Level | Settable by | Visible to |
|-------|-------------|------------|
| Platform default | Tulala admin only (`tulala.digital/admin/platform`) | All workspaces (transparency) |
| Plan-tier | Tulala admin only | All workspaces |
| Per-tenant override | Tulala admin (workspace requests it, Tulala approves) | The workspace + Tulala admin |
| Per-booking | Workspace coordinator drafting the offer | Workspace + (split breakdown only) the talent |

**Boundary rules:**
- Per-tenant override has a `min_take_bps` and `max_take_bps` — platform admin sets the band. Workspace can't go below it without Tulala approval.
- Per-booking can override workspace take freely (it's the agency's own cut) but cannot reduce platform take. Platform take is set workspace-wide.

---

## 4. The two payment paths

### Path A — In-platform (card / Apple Pay / Google Pay / bank)

1. Client taps **Approve** on the offer.
2. Server creates a Stripe PaymentIntent on the workspace's Connect account with:
   - `amount`: total gross (cents)
   - `application_fee_amount`: platform fee (cents) — flows to Tulala
   - `transfer_data.destination`: workspace's `stripe_account_id`
3. Charge succeeds → Stripe auto-routes platform fee to Tulala, the rest lands in workspace Connect account.
4. The workspace (server-side, scheduled job) initiates a second Connect transfer: workspace → talent Connect account(s). Amount = each talent's `talent_cost` from the line items.
5. Movement log: `card_settlement_auto`, amount = full platform fee, immediately marked paid.

### Path B — Off-platform (cash / wire / venue-paid / other)

1. Client and workspace agree off-platform (cash on the day, wire transfer to the workspace's own bank, venue-direct).
2. Workspace marks the booking with `payment_method = "cash"` (or wire / etc.) + a free-text **reason**.
3. Server creates a **commission_movement** of type `accrual` for the platform fee.
4. Balance updated on `platform_commission_balances` (per workspace, per currency).
5. At month-end OR when balance exceeds settlement threshold (`cash_settlement_threshold_cents` — default $50 / 1000 MXN equivalent), a **Stripe Invoice** is auto-issued to the workspace. When paid, balance settles via `invoice_settlement` movement.

**The friction is deliberate.** Off-platform reduces our take, hurts our visibility, and breaks the talent's auto-payout. Three guardrails:

- **"Why?" prompt** at booking time. Free-text reason, surfaces in workspace's reporting. Tracked for product-research: are clients refusing cards? Workspaces avoiding fees?
- **Workspace owes regardless.** No "I'll skip platform fee because it's cash" — that's silently breaking the model. Balance is enforced.
- **High threshold = no friction for small one-offs.** $50 minimum so a workspace doesn't get invoiced for a single 100 MXN tip-style booking.

---

## 5. The data model (5 new tables)

### 5.1 `platform_commission_config` — Tulala-owned, singleton
```sql
CREATE TABLE platform_commission_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Default platform take (5% = 500 bps)
  default_take_bps INT NOT NULL DEFAULT 500,
  -- Optional floor amount per booking (cents — e.g. 50 MXN floor on bookings under 1000 MXN)
  default_take_floor_cents INT NOT NULL DEFAULT 0,
  -- Plan-tier overrides. JSON: {"studio": 500, "agency": 350, "network": 250}
  -- Lower for higher tiers (volume discount).
  plan_tier_bps JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Balance threshold above which Stripe invoice auto-issues
  cash_settlement_threshold_cents INT NOT NULL DEFAULT 5000,
  -- Currency used for the threshold above (single currency for v1 — multi-currency in Phase Z)
  cash_settlement_currency TEXT NOT NULL DEFAULT 'USD',
  -- Enforce singleton
  singleton_key BOOLEAN NOT NULL DEFAULT TRUE UNIQUE CHECK (singleton_key = TRUE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
RLS: read = `is_platform_admin()`, write = `is_platform_admin()`. NOT readable by workspaces (we don't expose other plans' rates). The workspace's own resolved rate IS readable via a SECURITY DEFINER RPC.

### 5.2 `workspace_commission_overrides` — per-tenant rates
```sql
CREATE TABLE workspace_commission_overrides (
  tenant_id UUID PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  -- Platform take override (NULL = use plan-tier or platform default)
  platform_take_bps INT,
  platform_take_floor_cents INT,
  -- Workspace's own default commission (their own cut)
  -- Used as the v1 lookup BUT line items can express finer granularity
  default_workspace_take_bps INT,
  default_workspace_take_per_unit_cents INT, -- "200 MXN per hour"
  default_workspace_take_per_unit_label TEXT, -- "hour" / "day" / "event"
  -- Audit
  override_note TEXT NOT NULL DEFAULT '',
  set_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
RLS: read = `is_staff_of_tenant() OR is_platform_admin()`, write = `is_platform_admin()`. Workspaces request changes via a flow; only platform admin can set the override.

### 5.3 `booking_commission_snapshot` — immutable per-booking record
```sql
CREATE TABLE booking_commission_snapshot (
  booking_id UUID PRIMARY KEY REFERENCES agency_bookings(id) ON DELETE CASCADE,
  -- Rates that were in effect at the moment of offer-acceptance
  platform_take_bps INT NOT NULL,
  platform_take_floor_cents INT NOT NULL DEFAULT 0,
  -- Amounts in cents, presentment currency
  gross_cents INT NOT NULL,
  platform_fee_cents INT NOT NULL,
  workspace_fee_cents INT NOT NULL,
  talent_net_cents INT NOT NULL,
  currency_code TEXT NOT NULL,
  -- Payment method
  payment_method TEXT NOT NULL CHECK (payment_method IN
    ('card', 'apple_pay', 'google_pay', 'bank_transfer', 'cash', 'wire', 'venue_paid', 'crypto', 'other')),
  off_platform_reason TEXT,
  -- Resolution metadata (audit trail — which level supplied the rate?)
  resolved_from TEXT NOT NULL CHECK (resolved_from IN ('platform_default', 'plan_tier', 'tenant_override', 'booking_override')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
RLS: read = booking participants (workspace staff + the talent on the booking + the client), write = engine path only (SECURITY DEFINER RPC).

### 5.4 `platform_commission_balances` — per-tenant balance ledger
```sql
CREATE TABLE platform_commission_balances (
  tenant_id UUID PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  -- Currency-keyed balances. {"MXN": 4500, "USD": 1200} = 45 MXN + 12 USD owed
  balances_cents JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_settled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
RLS: read = `is_staff_of_tenant() OR is_platform_admin()`, write = engine path only.

### 5.5 `platform_commission_movements` — full audit log
```sql
CREATE TABLE platform_commission_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES agency_bookings(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN
    ('accrual', 'card_settlement_auto', 'invoice_settlement', 'adjustment_credit', 'adjustment_debit', 'refund_reversal')),
  -- Positive = workspace owes more (debit), negative = workspace owes less (credit / paid down)
  amount_cents INT NOT NULL,
  currency_code TEXT NOT NULL,
  note TEXT,
  -- Set when movement_type='invoice_settlement'
  stripe_invoice_id TEXT,
  stripe_payment_intent_id TEXT,
  created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON platform_commission_movements (tenant_id, created_at DESC);
CREATE INDEX ON platform_commission_movements (booking_id) WHERE booking_id IS NOT NULL;
```
RLS: read = `is_staff_of_tenant() OR is_platform_admin()`, write = engine path only.

---

## 6. The resolver — pure function

A single pure function `resolveBookingCommissions(input) → snapshot`. No side effects, no DB writes. Called inside `convertInquiryToBooking` (the engine call that creates the booking). Returns the snapshot, which is then persisted by the engine in a transaction with the `agency_bookings` insert.

```typescript
interface ResolveInput {
  tenantId: string;
  workspacePlan: "free" | "studio" | "agency" | "network";
  // From the accepted offer
  offerLineItems: Array<{
    // GRAIN: both amounts below are LINE TOTALS, not per-unit prices, and
    // `units` is always 1 in production (`engine_load_commission_context`
    // hard-codes it). Passing a line total in a per-unit field, then
    // multiplying by units a second time, was a P0 that inflated what the
    // talent was paid — see migrations 20261226000017 / 20261226000018.
    units: number;
    line_total_cents: number;
    talent_cost_total_cents: number;  // the talent's share of this line; workspace margin = line_total_cents - talent_cost_total_cents
  }>;
  currencyCode: string;
  paymentMethod: PaymentMethod;
  offPlatformReason?: string | null;
  // Resolution context (looked up by the engine before calling)
  platformConfig: PlatformCommissionConfig;
  tenantOverride: WorkspaceCommissionOverride | null;
}

interface ResolveOutput {
  platformTakeBps: number;
  platformTakeFloorCents: number;
  grossCents: number;
  platformFeeCents: number;
  workspaceFeeCents: number;
  talentNetCents: number;
  currencyCode: string;
  paymentMethod: PaymentMethod;
  offPlatformReason: string | null;
  resolvedFrom: "platform_default" | "plan_tier" | "tenant_override" | "booking_override";
}

function resolveBookingCommissions(input: ResolveInput): ResolveOutput {
  // 1. Determine platform take with override hierarchy
  let platformBps = input.platformConfig.default_take_bps;
  let platformFloor = input.platformConfig.default_take_floor_cents;
  let resolvedFrom: ResolveOutput["resolvedFrom"] = "platform_default";

  const planTierBps = input.platformConfig.plan_tier_bps[input.workspacePlan];
  if (typeof planTierBps === "number") {
    platformBps = planTierBps;
    resolvedFrom = "plan_tier";
  }
  if (input.tenantOverride?.platform_take_bps != null) {
    platformBps = input.tenantOverride.platform_take_bps;
    resolvedFrom = "tenant_override";
  }
  if (input.tenantOverride?.platform_take_floor_cents != null) {
    platformFloor = input.tenantOverride.platform_take_floor_cents;
  }

  // 2. Compute gross + workspace fee from line items
  const grossCents = input.offerLineItems.reduce(
    (sum, li) => sum + Math.round(li.units * li.line_total_cents),
    0
  );
  const workspaceFeeCents = input.offerLineItems.reduce(
    (sum, li) => sum + Math.round(li.units * (li.line_total_cents - li.talent_cost_total_cents)),
    0
  );

  // 3. Platform fee = max(% take, floor)
  const platformByBps = Math.round(grossCents * platformBps / 10000);
  const platformFeeCents = Math.max(platformByBps, platformFloor);

  // 4. Talent net = residual
  const talentNetCents = grossCents - platformFeeCents - workspaceFeeCents;

  return {
    platformTakeBps: platformBps,
    platformTakeFloorCents: platformFloor,
    grossCents,
    platformFeeCents,
    workspaceFeeCents,
    talentNetCents,
    currencyCode: input.currencyCode,
    paymentMethod: input.paymentMethod,
    offPlatformReason: input.offPlatformReason ?? null,
    resolvedFrom,
  };
}
```

**Edge cases (covered by unit tests):**
- Free-plan workspace: workspace fee can be 0 (everything goes to talent). Platform still takes its slice.
- Floor exceeds % take on a small booking: platform fee = floor, talent net shrinks accordingly.
- Workspace fee > gross (theoretically impossible but defend against): clamp `talentNetCents` to 0 and log a warning — booking can't proceed without manual review.
- Currency mismatch between line items: impossible at the schema level (offer has one `currency_code`).
- Per-unit-cents workspace commission that isn't expressed in line items: not supported at v1. The user's "200 MXN per hour" example must be expressed by the workspace as `unit_price=400, talent_cost=200` in the line item. The `default_workspace_take_per_unit_cents` on the override table is a UI hint for offer-drafting, not a runtime fallback.

---

## 7. The settlement flow (off-platform balance)

A scheduled job runs daily (or on-demand) and:

1. Reads `platform_commission_balances` for each tenant.
2. For each currency where balance ≥ `cash_settlement_threshold_cents` (converted to currency):
   - Creates a Stripe Invoice on the workspace's billing customer.
   - Items: one line per outstanding `accrual` movement since `last_settled_at`.
   - Sends invoice via Stripe (or just emails it with a Pay link).
3. When invoice is paid (webhook `invoice.paid`):
   - Inserts `invoice_settlement` movement with negative amount.
   - Balance recomputed.
   - `last_settled_at` updated.

**Failure modes:**
- Invoice not paid in 14 days → workspace gets a soft reminder.
- Invoice not paid in 30 days → workspace's ability to mark new bookings as off-platform is **suspended**. New bookings must use in-platform payment until balance is cleared.
- Invoice not paid in 60 days → workspace's Stripe Connect payouts are paused (reversible only by paying down).

This isn't punitive theatre — it protects the platform from running an unpaid receivable.

---

## 8. UI surfaces (where the commission model becomes visible)

### 8.1 Tulala platform admin (`tulala.digital/admin/platform`) — only accessible to Tulala staff
- **Platform → Commissions** page
  - Edit `default_take_bps` + `default_take_floor_cents`
  - Edit plan-tier table (Free / Studio / Agency / Network rates)
  - Edit settlement threshold + currency
- **Platform → Workspaces** page
  - List of workspaces with their resolved take + override status
  - Per-row "Set override" action (modal)
- **Platform → Movements** page
  - Global movement feed across all tenants
  - Filters by tenant, currency, type, date range

### 8.2 Workspace admin (`*.tulala.digital/admin/settings/money`)
- **Settings → Money** page (NEW — sits inside the existing Settings nav)
  - Their plan + resolved platform take ("You pay 5% to Tulala on every booking")
  - Their default workspace take (editable: % or per-unit + label like "per hour")
  - Accrued cash-payment balance — per currency
  - "Pay down balance now" button (issues immediate Stripe invoice)
  - Stripe Connect status (Connected / KYC needed / Verified)
  - Per-booking commission feed (last 30 days)

### 8.3 Workspace coordinator during offer drafting
- Offer draft UI shows live the breakdown:
  ```
  Gross to client:       1,000 MXN
  Platform fee (5%):        50 MXN  → Tulala
  Your commission:         200 MXN  → Workspace
  Talent net:              750 MXN  → Sofia
  ```
- "Adjust commission" button — per-booking override (only changes workspace cut, not platform).

### 8.4 Talent (inside the Offer sheet)
- See breakdown for every offer addressed to them:
  ```
  Client pays:    1,000 MXN
  Agency fee:      200 MXN
  Platform fee:     50 MXN
  Your net:        750 MXN
  ```
- The breakdown is transparency, not negotiation. Talent can decline but can't haggle the split from this view.

### 8.5 Client
- See **only the gross**: "1,000 MXN, taxes included". Never the internal split. The client doesn't need to know how the agency and Tulala divide their slice.

---

## 9. How this integrates with the rest of the plan

### 9.1 vs. `project_agency_exclusivity_model.md`
That doc says agency take-rate is set per plan (Free 0%, Studio 10-12%, Agency 15-20%). **This refers to the workspace's own cut, not the Tulala platform fee.** Two separate lanes: the exclusivity doc governs how much an agency earns from a booking; this doc governs how much Tulala earns.

**Platform-fee authority:** this doc supersedes any implicit or explicit statement in the exclusivity doc about the Tulala platform fee. For v1, the platform fee is **flat 5% across all plan tiers**, including Free. Free-plan workspaces take 0% for themselves but still route through Tulala infrastructure, so the 5% platform fee applies.

The workspace take-rates from the exclusivity doc (0% / 10-12% / 15-20%) become **suggested defaults** in the offer drafter — pre-fills `talent_cost` at `unit_price × (1 - planTierTake)`. The coordinator can adjust per-line. Those numbers are expressed per-line-item via the offer model (§2), not as a single workspace-wide percentage stored by the commission engine.

### 9.2 vs. `project_talent_subscriptions.md`
Orthogonal. Talent subs ($12/mo Pro, $29/mo Portfolio) are direct-to-talent SaaS. The commission model is per-booking. Both exist. Both bill via Stripe but on different products.

### 9.3 vs. `project_client_trust_badges.md`
Verification fee ($5 one-time) sits OUTSIDE this model — that's a service fee, not a commission. Bills via Stripe Checkout, not Connect.

### 9.4 vs. 2026 execution plan
Phase B (Money) implements this. **Phase B is amended:**
- Add the 5 commission tables to Phase B PR 1 (DB foundation).
- Add the resolver to Phase B PR 2 (engine integration).
- Add the platform admin UI to Phase B PR 3.
- Add the workspace Money settings to Phase B PR 4.
- Add the offer-drafting breakdown to Phase B PR 5.
- Add the talent breakdown view to Phase B PR 6.
- Add the off-platform balance settlement job to Phase B PR 7.

---

## 10. Tax (VAT / IVA / sales tax) — explicit deferral

Out of scope for v1. v1 assumes:
- All prices in offers are pre-tax.
- Workspaces handle their own tax on their commission.
- Talent handles their own income tax.
- Tulala charges no VAT on the platform fee in v1 (workspaces may need to receipt this).

When tax lands in Phase Z:
- VAT-inclusive vs. exclusive toggle per workspace.
- Stripe Tax integration for automatic computation + reporting.
- 1099 (US) / IRPF (ES) / SAT-CFDI (MX) generation per talent year-end.

---

## 11. Open decisions (with my lean)

| # | Decision | Options | Lean / Ratified |
|---|----------|---------|------|
| 1 | Platform default take % | 3% / 5% / 7% | **5%** — covers Stripe processing (~2.9%) + leaves margin |
| 2 | Plan-tier discount structure | Flat 5% everywhere / tiered (Studio 5% / Agency 3.5% / Network 2.5%) | **RATIFIED v1: flat 5% for all plan tiers** (`plan_tier_bps = {}`). Tiered structure (Studio 5% / Agency 3.5% / Network 2.5%) is the aspirational direction but deferred until volume warrants it. A plan_tier_bps.studio, .agency, .network override can be set via the platform admin UI (Phase B PR 5) without a migration. Free-plan workspaces pay the same 5% platform fee; "Free = 0%" in the exclusivity model refers to the workspace's own cut, not Tulala's fee — confirmed 2026-05-22. |
| 3 | Cash settlement threshold | $25 / $50 / $100 | **$50 equivalent** — small enough to settle promptly, big enough to skip tip-style one-offs |
| 4 | Settlement cadence | Daily / Weekly / Monthly | **Auto when threshold + monthly catch-up** for sub-threshold balances |
| 5 | Refund handling | Refund pulls money back proportionally / Workspace eats it / Platform forgives | **Proportional reversal** — `refund_reversal` movement, all parties refund their slice |
| 6 | Currency conversion | Lock to presentment / Convert to USD daily | **Lock to presentment per booking**, multi-currency balances, settle in original |
| 7 | Workspace can self-set override (above floor) | Yes / No / Only Tulala can | **Only Tulala can** — prevents race-to-zero. Workspaces request, Tulala approves. |
| 8 | Talent see workspace's commission breakdown | Yes / Aggregated only | **Yes, fully transparent** — builds trust. Same way Stripe shows fees on the dashboard. |

---

## 12. Implementation phasing

### Phase B PR 1 (this marathon — partial)
Ship the BONES that don't need Stripe:
- ✅ Migrations for the 5 tables
- ✅ Pure resolver function + unit tests
- ✅ This design doc + memory pointer

### Phase B PR 2 (next marathon, requires Stripe ops)
- Wire resolver into `convertInquiryToBooking`
- Persist snapshot at booking time
- Create accrual movement for off-platform path
- Update balance ledger

### Phase B PR 3 — Stripe Connect for in-platform path
- Workspace KYC onboarding
- PaymentIntent creation with `application_fee_amount`
- Webhook handler updates `card_settlement_auto` movements

### Phase B PR 4 — Workspace Money settings UI
- The "Settings → Money" page from §8.2

### Phase B PR 5 — Platform admin UI
- The Tulala-only platform admin from §8.1

### Phase B PR 6 — Offer-drafting breakdown
- Live commission split in the offer builder
- Per-booking override capability

### Phase B PR 7 — Off-platform settlement
- Stripe Invoice issuance job
- Threshold + cadence enforcement
- Suspension at 30/60 day overdue

---

## 13. Open questions for you to answer before Phase B PR 2

These are the only ones I really need before I can build:

1. **Confirm 5 % platform default + tiered by plan?** (Studio 5%, Agency 3.5%, Network 2.5% is my lean.)
2. **Confirm cash settlement threshold = $50 equivalent + monthly cadence?**
3. **Confirm Stripe Connect Standard (workspace as merchant)?** vs. Direct (Tulala as merchant). Standard means workspaces handle their own tax/legal — recommended for talent agencies.
4. **Refund policy** — pro-rata across the three lanes, or workspace eats it?
5. **Who can manually adjust the balance ledger?** Only Tulala admin (audit-trail compliance), or workspace can too (e.g. write off a small balance)? My lean: only Tulala, via the platform admin movements UI.

Lock those five, and Phase B builds in two marathons.

---

## 14. What's shipping in this commit

- This design doc.
- The 5 migrations (schema only, no engine wiring yet).
- The pure resolver function + unit tests.
- 2026 execution plan amendment + memory pointer.

The resolver is **callable** — it can be wired into a future Phase B PR 2 without any further work. The migrations stand up the schema cleanly. The UI + engine wiring comes when Stripe is live.
