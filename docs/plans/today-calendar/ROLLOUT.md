# Talent Agenda V2 — Flag Rollout Steps

## Flag: `TALENT_AGENDA_V2`

Canonical env (matches `web/src/lib/talent-agenda/flag.ts` and `web/.env.example`):

| Value | Effect |
|---|---|
| unset / `0` / `false` | Off for every talent (default; legacy Today/Calendar) |
| `talents` | Only profile ids in `TALENT_AGENDA_V2_TALENTS` |
| `1` / `true` / `all` | Every talent |

Allow-list: `TALENT_AGENDA_V2_TALENTS` = comma-separated `talent_profiles.id` UUIDs.

**Do not** put live Jor (`f048e578-…`) on the allow-list until Step 3 (owner click-through).

---

### Step 0 — Internal QA (code ready)

- [x] Flag off by default
- [x] Allow-list mode (`TALENT_AGENDA_V2=talents` + `TALENT_AGENDA_V2_TALENTS`)
- [x] Migration `20260924213837_talent_agenda_v2_phase1.sql` applied (`npm run db:check`)
- [x] Unit gates: derive / trade walk / free gaps / dual TZ / journeys
- [x] Wave 8 skeleton: mobile tab hide, keyboard-safe sticky bars, a11y chips + countdown, partial EN/ES, Playwright smoke scaffolding
- [ ] **Gap closure** — treat G0–G4 as PARTIAL; finish [`POST-AUDIT-EXECUTION-PLAN.md`](./POST-AUDIT-EXECUTION-PLAN.md) A0–A2 before Step 1
- [ ] Playwright smoke with QA creds: `npx playwright test e2e/talent-agenda-smoke.spec.ts` (skips without `QA_TALENT_*`)

Local allow-list:

```
TALENT_AGENDA_V2=talents
TALENT_AGENDA_V2_TALENTS=<qa-talent-profile-uuid>
```

Pin the agenda clock in QA with `?agendaNow=2026-09-23T09:50:00` on `/talent/today`.

### Step 1 — Beta cohort (~20 talents)

1. Set `TALENT_AGENDA_V2=talents` in Vercel Production env.
2. Add beta talent UUIDs to `TALENT_AGENDA_V2_TALENTS`.
3. Confirm migration applied: `cd web && npm run db:check`.
4. Run `npm run deploy:smoke` after the pointer advances.
5. Monitor 48 h; collect feedback on Today, Calendar, booking-record.

### Step 2 — Full rollout

1. Set `TALENT_AGENDA_V2=all`.
2. Keep legacy flag-off branches for one week (rollback = set `TALENT_AGENDA_V2=0`).

### Step 3 — Jor demo (owner click-through)

1. Add Jor's profile id to the allow-list **or** use `all` after Step 2.
2. **Read-only first:** owner clicks; agents write nothing to her rows.

### Step 4 — Delete legacy (separate PR, after ≥7 days green)

1. Remove `isAgendaV2` branches that render `TalentTodayPage` / `CalendarPage` for agenda routes.
2. Delete unused legacy calendar day-14 helpers only after no flag-off traffic.
3. Leave this checklist item unchecked until that PR merges.

### Rollback

Set `TALENT_AGENDA_V2=0` (or remove the env var). No DB rollback — columns are additive.

### Checklist before each step

- [ ] `cd web && npm run typecheck && npm run lint`
- [ ] `npm run deploy:smoke` exits 0 (after production pointer)
- [ ] At least one internal session on the new pages
- [ ] Playwright smoke passes when QA creds are set
