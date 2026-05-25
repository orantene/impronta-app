# Phase F — Polish, retire dead code, docs, prod smoke

**Scope:** 2 days. Final cleanup after Phases B–E land. Retire dead surfaces.
Update docs. Run full CI + smoke.

**Do not start Phase F unless Phases B, C, D, E are committed and green.**

## Tasks (in order)

### F.1 — Manual hand-verification pass (no code)

1. Local dev signed in as `qa-talent-dashboard-audit@impronta.test`:
   - `/talent/today` — no switcher, real (or zero) data.
   - `/talent/messages` — threads from both Impronta + Morena, filter chips work.
   - `/talent/site` — My pages hub + Max builder.
   - `/talent/money` — KPIs, agency cards, ledger.
   - `/talent/agencies` → 308 → `/talent/money`.
2. Local dev signed in as a hybrid user (mode toggle visible).
3. Note any blocker in Out-of-scope findings and stop. Otherwise proceed.

### F.2 — Delete superseded files

If hand-verify is clean:

- Delete `web/src/components/admin/shell/internal/talent/pages/AgenciesPage.tsx`.
- Delete `web/src/components/admin/shell/internal/talent/pages/ActivityPage.tsx`.
- Delete `web/src/components/admin/shell/internal/talent/pages/ReachPage.tsx`
  (already orphaned — confirm no imports first via grep).
- Delete `web/src/components/talent/site/TalentAgencyContextSwitcher.tsx`
  (Phase B already stopped rendering it for pure talent).
  - If hybrid still renders it, KEEP the file and log in findings instead.
- Remove `EARNINGS_ROWS` constant from `fixtures.ts` (and any unused imports
  it dragged in).

### F.3 — Update docs

- `docs/decision-log.md`: mark L41–L43 status as **shipped (date)**.
- `web/docs/talent-monetization.md`: add a one-paragraph note about
  `/talent/money` and the shared `snapshot-aggregations.ts` helper.
- `docs/plans/talent-tulala-dashboard-execution-plan-2026-05-25.md`: in
  §12 (Gantt) and §13 (DoD), check off each acceptance line.

### F.4 — Full gate

```
cd web
npm run typecheck
npm run lint
npm run ci
```

(`npm run ci` is the heavier gate that includes tenant + RLS suites.)

### F.5 — Promote + smoke (only with explicit user approval)

Do NOT promote without the user's go-ahead. If approved:
- `npm run deploy:promote`
- `npm run deploy:smoke`
- Re-verify `qa-talent-dashboard-audit@…` on `app.tulala.digital`.

### F.6 — Commit

One commit:
```
talent/: retire legacy talent surfaces post-Money cutover
```

## Acceptance

- All `git status` clean except your single commit.
- `npm run ci` green.
- Deleted files do not break any import (verified by typecheck).
- Decision log updated.

## Reference index

- Master plan §9 (Phase F), §13 (DoD), §14 (out of scope).
- All files listed in F.2.
