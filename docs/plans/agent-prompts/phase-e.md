# Phase E — Money page (replaces Agencies)

**Scope:** 3–4 days. New `/talent/money` route + nav item. Hero KPIs, per-agency
cards, earnings ledger, payouts strip, grow strip. Retires the talent-side
`AgenciesPage` and absorbs `ActivityPage` earnings UI.

**Depends on Phase D** (data layer must exist).

## Tasks (in order)

### E.1 — Type + nav

1. `web/src/components/admin/shell/internal/state/types.ts`:
   - Extend `TalentPage` union with `"money"`. Keep `"agencies"` and
     `"activity"` for URL backward-compat.

2. `web/src/components/admin/shell/internal/state/fixtures.ts`:
   - `TALENT_PAGES` array: replace `"agencies"` with `"money"`.
   - `TALENT_PAGE_META`: add `money: { label: "Money" }`. Keep `agencies` /
     `activity` entries marked legacy.

3. Talent router (`web/src/components/admin/shell/internal/talent.tsx` ~line
   280–296): map `case "money": page = <MoneyPage />;`. Keep `case "agencies"`
   delegating to `MoneyPage` for compat.

### E.2 — Routes

4. New page `web/src/app/(workspace)/talent/money/page.tsx`:
   - Mirror the existing `talent/agencies/page.tsx` shape — a thin route syncer
     that sets `state.talentPage = "money"`.

5. Legacy redirects:
   - `web/src/app/(workspace)/talent/agencies/page.tsx` → 308 → `/talent/money`.
   - `web/src/app/(workspace)/talent/activity/page.tsx` → 308 → `/talent/money`
     (create if missing).

### E.3 — Shared building blocks

6. `web/src/components/admin/shell/internal/talent/shared/MoneyKpiStrip.tsx`:
   - 4 KPIs: YTD net, Pending, Confirmed pipeline, Goal ring.
   - Lift `EarningsGoalRing` from `ActivityPage.tsx` into this shared file.

7. `web/src/components/admin/shell/internal/talent/shared/EarningsLedger.tsx`:
   - Lift the table + source/status filter chips from `ActivityPage.tsx`.
   - Source = `bridgeTalentEarnings.rows` (from Phase D).

8. `web/src/components/admin/shell/internal/talent/shared/MoneyAgencyCards.tsx`:
   - 1-up on mobile, 2-up on desktop.
   - Per agency: name + plan-tier chip + exclusivity status + YTD net +
     bookings count + commission rate (realized).
   - CTAs: **View roster profile** (use `agencyRosterProfileUrl`) +
     **Manage relationship** (existing `talent-agency-relationship` drawer).

### E.4 — Page composition

9. `web/src/components/admin/shell/internal/talent/pages/MoneyPage.tsx`:
   ```
   <MoneyKpiStrip />
   <MoneyAgencyCards />
   <EarningsLedger />
   <PayoutsStrip /> { /* Stripe Connect status from talent_profiles */ }
   <GrowStrip />    { /* find agencies, leave agency, boost reach */ }
   ```

### E.5 — Lint ratchet

The admin shell tree forbids new inline `style={{}}` blocks
(`ratchet/no-new-inline-style`). Either:
- Author all new components inside `internal/talent/pages/MoneyPage.tsx`,
  `internal/talent/shared/Money*.tsx` using Tailwind classes / token presets
  (preferred), OR
- Place the new files OUTSIDE `components/admin/shell/` (e.g. under
  `web/src/components/talent/money/`) where the ratchet doesn't apply,
  and import from the admin shell.

Pick whichever lands faster. Document choice in the output contract.

### E.6 — E2e

10. Extend `web/e2e/talent-platform-ia.spec.ts`:
    - `/talent/money` renders with "Money" heading.
    - At least one agency card visible for QA audit talent.
    - Ledger row OR empty state visible.
    - `/talent/agencies` returns 308 → `/talent/money`.

### E.7 — Commit

One commit (or two if E.5 splits files):
```
talent/: ship Money page (replaces Agencies + Activity)
```

## Acceptance

- typecheck, lint, tenant-isolation green.
- `/talent/money` renders for QA audit talent with real data shape (numbers may
  be €0 — fine).
- Nav order: Today · Messages · My pages · Profile · Calendar · **Money** ·
  Settings.
- `/talent/agencies` and `/talent/activity` redirect.
- `AgenciesPage.tsx` and `ActivityPage.tsx` are NOT deleted yet (Phase F does
  that after a hand-verification pass).

## Reference index

- Master plan §8 (Phase E).
- `web/src/components/admin/shell/internal/talent/pages/AgenciesPage.tsx`
- `web/src/components/admin/shell/internal/talent/pages/ActivityPage.tsx`
- `web/src/lib/talent/earnings.ts` (Phase D)
- `web/src/lib/talent/agency-roster-profile-url.ts`
- `web/src/components/admin/shell/internal/state/{types,fixtures}.ts`
- `web/src/components/admin/shell/internal/talent.tsx` (page router)
