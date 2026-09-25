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
- [x] **Gap closure A0–A2** — ownership, mirror scope, request_link honesty, load-mapper transfer/deadline (see [`POST-AUDIT-EXECUTION-PLAN.md`](./POST-AUDIT-EXECUTION-PLAN.md)); Step 0 residuals (Confirm transfer CTA, attention/TradeSections i18n, no-show mirror parity) closed on branch
- [x] Playwright evidence PNGs committed under `docs/plans/program/evidence/today-calendar/*-evidence.png` (+ `a3-evidence.static.test.ts`); capture via `node web/scripts/capture-agenda-evidence.mjs`
- [x] Full Playwright smoke against production host: `PLAYWRIGHT_BASE_URL=https://app.tulala.digital npx playwright test e2e/talent-agenda-smoke.spec.ts` (V2-only routes skip until flag-on deploy; Today/Calendar/mobile paths green)

Local allow-list (Step 0 — do **not** commit `.env.local`; do **not** include live Jor `f048e578-…`):

```
TALENT_AGENDA_V2=talents
TALENT_AGENDA_V2_TALENTS=<qa-talent-profile-uuid>
```

Seed QA talents (isolated project only):

```
cd web && node --env-file=.env.local scripts/seed-talent-agenda-qa.mjs \
  --i-understand-this-writes-to-the-database --allow-isolated
```

Primary login from seed: `qa-agenda-jor@impronta.test` (password via `QA_AGENDA_TALENT_PASSWORD` / default in script).

Pin the agenda clock in QA with `?agendaNow=2026-09-23T09:50:00` on `/talent/today`.

### Step 1 — Beta cohort (~20 talents)

**Armed 2026-09-25 (Production):**
- `TALENT_AGENDA_V2=talents` (later superseded by Step 2 `all`)
- `TALENT_AGENDA_V2_TALENTS=f385fb27-0833-4e4f-a894-a1bd04a30907` (QA Agenda Jor after 2026-09-25 reseed; was `f9090640-…`)
- `deploy:smoke` exit 0 after #2245 merge
- Expand UUID list when adding real beta talents; keep live Jor off until Step 3

Remaining for full Step 1:
1. ~~Add up to ~19 more beta talent UUIDs~~ — **skipped 2026-09-25:** no owner UUID list; Step 2 `all` supersedes.
2. [x] Confirm migration applied: `cd web && npm run db:check` — OK 2026-09-25 (869 local migrations all applied).
3. ~~Monitor 48 h~~ — superseded by Step 2 the same day.

### Step 2 — Full rollout

**Armed 2026-09-25 (Production):**
- [x] `TALENT_AGENDA_V2=all` (owner unlock via “do all”)
- [x] Client bridge stamp merged (#2251) — shell reads `talentAgendaV2` from layout bridge
- Rollback: set `TALENT_AGENDA_V2=0`
- **Day-7 legacy clock starts:** 2026-09-25 → earliest Step 4 **2026-10-02**
- Redeploy / promote after env + bridge so runtimes pick up `all`

### Step 3 — Jor demo (owner click-through)

**With Step 2 `all`, Jor is included.** Agents: **read-only only** — no writes to `f048e578-…` rows.
1. [ ] Owner clicks Today / Calendar / a booking record on her account.
2. [x] Agent SQL probe + note: `docs/plans/program/evidence/today-calendar/jor-readonly-probe-2026-09-25.md` (0 bookings / 0 booking_talent / 0 hours; no agent UI session). Refreshed 2026-09-25.
3. Leave owner click open until confirmed.

### Step 4 — Delete legacy (owner waive 2026-09-25; Day-7 was 2026-10-02)

1. [x] Remove `isAgendaV2` / `bridgeTalentAgendaV2` branches that render legacy `TalentTodayPage` body / `CalendarPage` for agenda routes — Agenda surfaces only; kill switch empties agenda load.
2. [ ] Delete unused `talent/pages/CalendarPage.tsx` file after one release with no flag-off traffic (kept on disk unused).
3. Soft kill switch retained: `TALENT_AGENDA_V2=0` → empty V2 chrome (no legacy remount).

### Rollback

Set `TALENT_AGENDA_V2=0` (or remove the env var). No DB rollback — columns are additive.

### Checklist before each step

- [ ] `cd web && npm run typecheck && npm run lint`
- [ ] `npm run deploy:smoke` exits 0 (after production pointer)
- [ ] At least one internal session on the new pages
- [ ] Playwright smoke passes when QA creds are set
