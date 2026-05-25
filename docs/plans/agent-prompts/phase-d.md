# Phase D — Revenue plumbing (DB → talent self-view)

**Scope:** 3–4 days. Server-side aggregation reading real
`booking_commission_snapshot` + `talent_bookings`. Wires identity-bar YTD and
prepares the data layer for Phase E (Money page).

**No new schema unless RLS gap is real.** Decision OQ-3 = derive realized
commission from snapshots; do NOT add a per-roster commission column.

## Tasks (in order)

### D.1 — Aggregation helper (shared with future admin-financials)

1. New file `web/src/lib/billing/snapshot-aggregations.ts`:
   - `aggregateTalentNet({ talentProfileId, since, agencyFilter? })`
   - `aggregateAgencyEarnings({ tenantId, since })` (export but DO NOT consume
     here — Phase 15 / admin financials owns).
   - Both return cents in EUR (v1 single-currency; fail-soft on rows where
     `currency_code !== 'EUR'` by excluding + logging).

2. New file `web/src/lib/talent/earnings.ts`:
   ```ts
   export type TalentEarnings = {
     totals: {
       ytdGrossCents: number;
       ytdNetCents: number;
       pendingCents: number;            // invoiced not paid
       confirmedPipelineCents: number;  // booked not yet invoiced
       currency: "EUR";
     };
     perAgency: Array<{
       tenantId: string;
       slug: string;
       name: string;
       ytdNetCents: number;
       bookingsCount: number;
       lastBookingAt: string | null;
       commissionBps: number;  // realized — avg of workspace_fee_cents / gross_cents
     }>;
     rows: Array<{
       id: string;
       workDate: string;
       payoutDate: string | null;
       agencyName: string;
       client: string;
       grossCents: number;
       netCents: number;
       status: "paid" | "invoiced" | "pending" | "confirmed";
       source: "agency_routed" | "personal_page" | "hub" | "unknown";
       paymentMethod: string | null;
     }>;
   };

   export async function loadTalentEarnings(
     talentProfileId: string,
     opts?: { sinceISO?: string; agencyFilter?: string }
   ): Promise<TalentEarnings> { /* ... */ }
   ```

3. RLS check:
   - Confirm `booking_commission_snapshot` is selectable by a talent for their
     own bookings. If not, write a tiny additive policy migration:
     `supabase/migrations/<ts>_talent_select_own_commission_snapshot.sql`
     that grants SELECT where the related `talent_bookings.talent_profile_id`
     maps to `auth.uid()` via `talent_profiles`. Apply with `npm run db:push`.

### D.2 — Unit tests

4. `web/src/lib/talent/earnings.test.ts`:
   - Mock supabase responses; assert totals, perAgency, rows shape.
   - Edge cases: zero bookings, mixed currencies, future-dated holds (excluded).

### D.3 — Wire identity bar

5. `web/src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx`:
   - Replace the Phase B placeholder copy with the real YTD net from
     `loadTalentEarnings`.
   - Talent surface only — workspace + client surfaces untouched.

6. Layout integration:
   - `web/src/app/(workspace)/talent/layout.tsx` — call `loadTalentEarnings`
     in the existing Promise.all batch, surface as `talentEarnings` on the
     bridge.
   - Extend `BridgeData` type accordingly.

### D.4 — No UI page yet

Phase E builds the Money page on top of this layer. Do not touch
`AgenciesPage.tsx`, `ActivityPage.tsx`, or nav.

### D.5 — Commit

One commit:
```
talent/: wire real YTD earnings from commission snapshots
```

## Acceptance

- typecheck, lint, tenant-isolation green.
- New unit tests pass.
- Identity bar shows real YTD for `qa-talent-dashboard-audit@…`. (Result will
  be €0 unless QA has actual bookings — that's expected, not a bug. Log this in
  output if zero.)
- A talent cannot read another talent's snapshot rows (tenant-isolation gate
  covers this if you added a fresh cross-talent test).

## Reference index

- Master plan §7 (Phase D), §10 (OQ-3, OQ-6), §15 (shared with admin financials).
- `supabase/migrations/20260513072842_commission_model_foundation.sql`
- `supabase/migrations/20260513081325_talent_calendar_v1.sql`
- `web/src/lib/billing/commission.ts`
- `web/src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx`
- `web/src/app/(workspace)/talent/layout.tsx`
