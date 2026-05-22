# ADR — Cross-tenant commission semantics (2026-05-22)

**Status:** Accepted (2026-05-22 — Oran signed off on Option B, schema B1, paused-migration timing, direct Stripe-read swap)
**Branch:** `feat/xtenant-commission-fix` (worktree `/Users/oranpersonal/Desktop/impronta-xtenant-fix`)
**Context:** [`qa-xtenant-commission-2026-05-22.md`](./qa-xtenant-commission-2026-05-22.md) (Issues → MEDIUM), [`qa-xtenant-commission-execution-plan-2026-05-22.md`](./qa-xtenant-commission-execution-plan-2026-05-22.md) item #2.

---

## 1. Problem

`engine_convert_to_booking` inserts **one** `agency_bookings` row per inquiry, with `tenant_id ← inquiries.tenant_id` (the inquiry's home tenant). `engine_load_commission_context(p_booking_id)` resolves commission off that single `tenant_id`, so every talent on a cross-tenant inquiry is commissioned at the inquiry-home-tenant's tier. The frozen per-row `inquiry_participants.owning_party_*` (set by `resolveOwningPartiesForTalents` at submit) is never consulted by the commission path — it drives thread fan-out and routing only.

**Today's blast radius:** zero. `platform_commission_config.plan_tier_bps = {}` and `workspace_commission_overrides` is empty, so every tier resolves to the flat 5% `platform_default`. The bug becomes live the moment tiered rates or per-tenant overrides are populated.

---

## 2. Decision

**Option B — per-participant commission.** One booking, one client UX. Commission resolves per `inquiry_participants` row from its frozen `owning_party_*`. Persist N snapshot rows per booking (one per participant). All non-billing surfaces (offer composer, lineup tab, booking detail, messages thread, Stripe payment intent) are untouched.

Confirmed by Oran 2026-05-22 via interactive question; written rationale below.

### 2.1 Why B over A

The plan recommends Option A (split bookings per owning tenant) on "structural cleanness" grounds. **Rejected** because:

1. **Unified-inquiry binding spec (`project_discover_unified`)** is explicit that cross-tenant inquiries must feel like *one* inquiry / *one* booking to the client. Splitting bookings produces N offer rows, N acceptances, N "Booking confirmed" messages, N call sheets — a multi-vendor UX the platform was built to suppress.
2. **Blast radius is smaller with B.** A touches `engine_convert_to_booking`, the offer composer, line-item editor, lineup tab, booking-detail page, Stripe payment-intent code, invoices, and the Details-tab redesign. B touches the commission engine and the Stripe app-fee read — that's it.
3. **The "one tenant per booking" property A relies on is illusory in current code.** The only place in the codebase that *requires* one owning party per booking is `booking_commission_snapshot.booking_id` (PK). Every other surface — threads, lineup, offer line items, message cards — is already participant-centric. Fixing the PK is local; fixing the surfaces is platform-wide.
4. **Option B generalizes** to mixed independent-talent + workspace-talent inquiries (the Free "Anna" lane in the scenario below) without further schema work. Option A would need a synthetic "no-tenant booking" concept.

### 2.2 Scenario this fixes

Event planner submits one inquiry to Tulala Studio's roster (inquiry `tenant_id` = Tulala Studio):

| Talent | `inquiry_participants.owning_party_*` | Plan tier |
|---|---|---|
| Maria, Luca | `('workspace', tulala-studio-id)` | Studio |
| DJ Rey | `('workspace', impronta-agency-id)` | Agency |
| Anna (independent) | `('talent', anna-talent-profile-id)` | n/a (Free) |

Once `plan_tier_bps` is populated `{free:0, studio:1000, agency:1500}`:

- **Today (bug):** all four commissioned at Tulala Studio's 10% — Impronta loses 5pp, Anna mis-billed 10%.
- **Option B (this ADR):** Maria/Luca at Studio 10%, Rey at Agency 15%, Anna at platform_default. Three snapshot rows on one booking; client UX unchanged.

---

## 3. Schema change

`booking_commission_snapshot` becomes per-participant. **Sub-decision required from Oran** — pick one:

### 3.1 Option B1 (Recommended) — extend existing table

- Drop PK `(booking_id)`; new PK `(booking_id, participant_id)`.
- Add `participant_id UUID NOT NULL REFERENCES inquiry_participants(id)`.
- Add `owning_party_type TEXT NOT NULL CHECK (owning_party_type IN ('agency','workspace','talent'))`.
- Add `owning_party_id UUID NOT NULL` (no FK — points to `agencies.id` or `talent_profiles.id` polymorphically; matches `inquiry_participants.owning_party_id`).
- `lanes_sum_to_gross` CHECK stays — operates per row (each participant's own lanes sum to that participant's own gross).
- Booking-total reads become `SUM(...) WHERE booking_id = ? GROUP BY booking_id`.
- Index `(booking_id)` for fast roll-up reads.
- Production data: **zero rows** today, no backfill needed.

**Pros:** one canonical table, no rollup-vs-detail drift risk, simplest mental model.
**Cons:** existing read-call-sites (`getApplicationFeeForBooking`, Platform Admin reports) become SUMs.

### 3.2 Option B2 — sibling table

- Keep `booking_commission_snapshot` as the per-booking roll-up (gross/platform/workspace/talent_net all SUMs over participants).
- New `booking_participant_commission_snapshot` carries the per-participant grain.
- Both tables write atomically inside `engine_persist_booking_commission_snapshot`.

**Pros:** existing reads keep working unchanged (the roll-up row still answers "what's the app fee for this booking?").
**Cons:** two tables, an additional CHECK invariant (`rollup.platform_fee_cents = SUM(participant.platform_fee_cents)`), engine must keep them in lockstep.

**Recommendation: B1.** Zero prod rows → the PK change is free; the rollup-vs-detail invariant in B2 is technical debt that buys very little (one `SUM(...)` SQL is not real complexity).

---

## 4. Engine rework

### 4.1 `engine_load_commission_context` — return one context per participant

**New signature** (`p_booking_id` only; participant fan-out happens server-side):

```sql
CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id UUID)
RETURNS JSONB
```

**New return shape:**

```json
{
  "booking_id": UUID,
  "platform_config": { ... unchanged ... },
  "participants": [
    {
      "participant_id": UUID,
      "talent_profile_id": UUID,
      "owning_party_type": "agency" | "workspace" | "talent",
      "owning_party_id": UUID,
      "tenant_id": UUID | null,            // null when owning_party_type='talent'
      "workspace_plan": "free"|"studio"|"agency"|"network"|null,
      "tenant_override": { ... } | null,
      "currency_code": "MXN"|...,
      "offer_line_items": [ ... ]          // filtered: only line items for this participant's talent_profile_id
    },
    ...
  ]
}
```

Implementation: join `agency_bookings` → `inquiries.source_inquiry_id` → `inquiry_participants` (role='talent', status='active'), then for each participant resolve tenant via `owning_party_*`, load `workspaces.plan_tier` + `workspace_commission_overrides` for that tenant, and filter `inquiry_offer_line_items` to that participant's `talent_profile_id`.

### 4.2 `resolveBookingCommissions` (TS) — loop over participants

Replace the single-call signature with `resolveBookingCommissionsPerParticipant(ctx)` that returns `BookingCommissionSnapshot[]`. Per-participant rules:

- `owning_party_type='workspace'|'agency'` → resolve through the 4-level hierarchy using that tenant.
- `owning_party_type='talent'` → no tenant context; fall to `platform_default` (and `platform_default_floor`); `resolved_from='platform_default'`.

Each participant's snapshot is computed independently; the booking has no "total" lane structure beyond `SUM(participant_lanes)`.

### 4.3 `engine_persist_booking_commission_snapshot` — N-row variant

Change signature to accept an array (`p_rows JSONB`) and write N rows in one statement. Off-platform fan-out: emit one `platform_commission_movements` accrual per row, bumping the correct tenant's `platform_commission_balances`. Idempotency: `ON CONFLICT (booking_id, participant_id) DO NOTHING`, then return the existing rowset.

### 4.4 `persistBookingCommissionSnapshot` (TS wrapper)

Becomes a single-shot call passing all N rows together — atomic, one round-trip per booking.

### 4.5 `getApplicationFeeForBooking` (Stripe)

`SUM(platform_fee_cents) FROM booking_commission_snapshot WHERE booking_id = ?`. Returns the same integer as today; payment-intent code unchanged.

---

## 5. Test plan

Per the prompt's STEP 3 — a regression test under `web/src/lib/billing/`:

**`commission-engine-xtenant.characterization.test.ts`** (node:test, matches existing characterization-test convention):

- Fixture: 2-talent inquiry, talent_A `owning_party=('workspace', tenant_studio)`, talent_B `owning_party=('workspace', tenant_agency)`. `platform_commission_config.plan_tier_bps = {studio:1000, agency:1500}`.
- Mock the supabase client (mirror the pattern in `commission-engine.characterization.test.ts`) so `engine_load_commission_context` returns the participants array fixture.
- Assert: `resolveBookingCommissionsPerParticipant` returns 2 snapshots; talent_A `platform_take_bps=1000` `resolved_from='plan_tier'`; talent_B `platform_take_bps=1500` `resolved_from='plan_tier'`.
- Assert: when `persistBookingCommissionSnapshot` is called, the mocked persist RPC sees exactly 2 rows with the correct tenant attribution.
- Assert: under flat-5% config (regression for today's behavior) both rows resolve at 500/`platform_default` — no change vs. pre-fix output.

Additional coverage in `commission.characterization.test.ts`:

- Independent talent (`owning_party_type='talent'`) resolves to `platform_default` regardless of any tenant override that happens to match `owning_party_id`.
- Mixed inquiry (1 workspace + 1 independent) produces 2 snapshots with different `resolved_from`.

The existing 22-test `commission.test.ts` resolver suite stays passing — `resolveBookingCommissions` (single-participant) remains as the inner primitive; the new `resolveBookingCommissionsPerParticipant` is a thin wrapper that calls it N times.

---

## 6. Migration

One file, applied via the project's standard protocol:

`supabase/migrations/<utc_now>_booking_commission_snapshot_per_participant.sql`

```sql
BEGIN;

-- Drop old PK; production has 0 rows so no data move needed.
ALTER TABLE public.booking_commission_snapshot
  DROP CONSTRAINT booking_commission_snapshot_pkey;

ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN participant_id UUID NOT NULL
    REFERENCES public.inquiry_participants(id) ON DELETE RESTRICT,
  ADD COLUMN owning_party_type TEXT NOT NULL
    CHECK (owning_party_type IN ('agency','workspace','talent')),
  ADD COLUMN owning_party_id UUID NOT NULL;

ALTER TABLE public.booking_commission_snapshot
  ADD CONSTRAINT booking_commission_snapshot_pkey
    PRIMARY KEY (booking_id, participant_id);

CREATE INDEX booking_commission_snapshot_booking_id_idx
  ON public.booking_commission_snapshot(booking_id);

CREATE INDEX booking_commission_snapshot_owning_party_idx
  ON public.booking_commission_snapshot(owning_party_type, owning_party_id);

-- Replace the load-context RPC body (Section 4.1 shape).
CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$ ... $$;

-- Replace the persist RPC to accept a JSONB array (Section 4.3).
CREATE OR REPLACE FUNCTION public.engine_persist_booking_commission_snapshot(
  p_rows JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$ ... $$;

-- Drop the obsolete scalar-param variant (no callers remain after TS migration).
DROP FUNCTION IF EXISTS public.engine_persist_booking_commission_snapshot(
  UUID, INT, INT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT
);

COMMIT;
```

**Production-write gate.** Per `CLAUDE.md`, this must be applied to remote Supabase via `npm run db:push` (or `apply-migration.mjs --apply-pending` fallback) **before** the merge. I will pause for explicit Oran approval before pushing the migration to prod.

---

## 7. Surfaces NOT touched

Explicit non-goals to bound the change:

- **Offer composer / line-item editor.** Continues to emit one offer per inquiry with line items keyed by `talent_profile_id`. The commission engine derives per-participant grain from this; the editor doesn't need to know about owning parties.
- **`engine_convert_to_booking`.** Still one booking per inquiry. No change.
- **Messages thread / Lineup tab / Booking detail.** Untouched.
- **Stripe payment intent creation.** Still one PI per booking; only the app-fee read (`getApplicationFeeForBooking`) changes its query.
- **Stripe Connect transfers / fan-out.** Out of scope — per the code map, no per-tenant fan-out exists yet (only `getApplicationFeeForBooking` reads the snapshot). When fan-out is built later, the per-participant grain is what it will read; that's a feature, not a forced change.
- **Platform Admin commission UI (`#1a`, `#1b`).** Separate workstream. The interim guard in the execution plan (don't populate `plan_tier_bps` while #2 is open) is *lifted* by this ADR shipping.
- **Independent-talent (Free) rate policy.** Inherits today's flat-5% / `platform_default`. The "Free = 0%" reconciliation is execution-plan item #3 (S effort), not this ADR.
- **House-lane line items (`inquiry_offer_line_items.talent_profile_id IS NULL`).** Today this column is nullable; `engine_convert_to_booking` copies unassigned items into `booking_talent` rows with NULL talent. In v1 of per-participant commission these are **rejected** by `engine_load_commission_context` (raises `commission_context: offer % has unattributed line items`). Rationale: keeps PK `(booking_id, participant_id)` strictly NOT NULL; zero production snapshots means no rows to migrate; surfaces a clean error if an admin tries to ship an offer with house revenue. A "house lane" snapshot (using a synthetic id and `owning_party=home tenant`) can be added later if the use case proves real; current offers in the system already attribute line items to talents.

---

## 8. Sub-decisions (resolved 2026-05-22)

1. **Schema shape: B1 — extend existing table.** New PK `(booking_id, participant_id)`; new columns `participant_id`, `owning_party_type`, `owning_party_id`. Booking totals via `SUM(...)`.
2. **Migration timing: pause for explicit approval before `db:push`.** Code + migration land locally, full test gate passes, then surface a diff for Oran before any production-DB write.
3. **`getApplicationFeeForBooking`: swap shape directly, no compat shim.** Zero production snapshots; no live payment intent reads the table.

---

## 9. Implementation order

Once this ADR is signed off:

1. Migration file written, reviewed locally (no `db:push` yet).
2. RPC bodies fleshed out in the migration.
3. TS rework: `commission.ts` adds `resolveBookingCommissionsPerParticipant`; `commission-engine.ts` updated to call the new persist RPC; `getApplicationFeeForBooking` switches to `SUM`.
4. Regression test added (Section 5).
5. Gate: `cd web && npx tsc --noEmit && npm run lint` + all 4 commission test suites green.
6. **Pause** — surface diff to Oran for approval to `db:push`.
7. Apply migration to remote; verify the QA harness still passes against live.
8. Commit on `feat/xtenant-commission-fix`. Do not push or open a PR without explicit approval.
