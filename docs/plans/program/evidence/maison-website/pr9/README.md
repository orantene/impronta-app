# Maison website — PR 9 evidence

**Branch:** `cursor/maison-pr9-journeys-e2e-8b57`  
**Closes:** W77–W78 (journeys e2e + layout matrix + Jor Unlock check)  
**Base:** `7c9a8938a` (PR8 live pending + options #2328)

## Delivered

| W | Work | Proof |
|---|---|---|
| W77 | Journeys 1–6 e2e on isolated Vale/Iván, EN+ES | `web/e2e/talent-website/maison-journeys.spec.ts` |
| W78 | Layouts 1440 / 390 / 360 / 430 / 375×667 | Viewport matrix in same spec + journey 1 phone smokes |
| W20 | Live site never shows Unlock (Jor read-only) | `web/e2e/talent-website/jor-live-unlock.spec.ts` |

### Fixture repair (first)

| Gap | Fix |
|---|---|
| `fixtures.t_max.talentProfileId` missing (j0 hang) | Seed writes `e2e/.auth/talent-website/ids.json`; lazy getter on `TalentFixtureView` |
| j4 imported `signInJourneysStaff` from agency harness | `helpers.signInTalentFixture` via `/api/dev/signin` |
| No Vale / Iván personas | `t_vale` / `t_ivan` in fixtures + seed (nails @ intro-missing; chef quotes) |
| Maison journeys ungated | `MAISON_JOURNEY_E2E=1` + `TALENT_MAISON_THEME_ENABLED` in `talent-website-e2e.yml` |

### Journey map (spec §14)

1. Vale: Today 83% → Finish with AI → Activate → Choose design → Lilac → My content → Use this design → Review → Publish  
2. Vale: Import starter → keep Manicura en gel → result + Undo  
3. Iván: Custom colors (+ contrast adjust) → Review (My colors) → Publish  
4. Iván live: Change design → Publish new colors (one step)  
5. Recovery chrome (preview retry surface + review blockers)  
6. Design options → Restore; Undo import when batch exists  

## Flag

Journeys require `TALENT_MAISON_THEME_ENABLED`. Flag-off production unchanged (no product code changes in this PR beyond e2e + CI env for the hermetic lane).

## Out of scope

- Visual pixel match vs owner PDF/prototype → **BLOCKED**
- Prototype journeys 2/3/4/7 (profession search, multi-talent, theme-to-demo discovery) → future per spec §14

## Gates

- `npm run typecheck && npm run lint`
- Playwright: `--project=talent-website` with `MAISON_JOURNEY_E2E=1` (CI workflow)

## Migrations

None.
