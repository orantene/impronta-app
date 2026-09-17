# Tulala workspace + POS program: handover (2026-09-17)

This is the closing handover of the program that made the approved design package real on the Tulala engine. It replaces the 2026-09-12 handover (`HANDOVER-2026-09-12.md`, kept for history) and the earlier "start here" reconciliation (its canonical-file table is at the end of this file). Everything below was checked against `origin/main` and the isolated QA host on 2026-09-17; where a line repeats an agent's claim rather than a re-check, it says so.

## 1. What the program was

Make the approved design package real on the existing engine (Next.js 16 + Supabase), proven journey by journey on the isolated QA host, released to production through CI, without a single merge that skips the gate.

- **259 boards, 17 areas**: workspace back office W01–W59, POS modes and boards, customer/mobile MW boards, and the Messages-in-POS handoff (103 screens). Board specs: `pos/screen-index.md`; rendered boards under `evidence/fidelity-*/<Board>/board.png`.
- **Engine packages 1–3** (contracts in `engine/pos-money.md`, `engine/scheduling.md`, `engine/venue.md`): package 1 = custom amount + manager PIN, till lock / operator switch, link a booking, tips, payment links + `/pay/<code>`, table move / split / merge / change server with expected version, class waitlist offers, cash movements; package 2 = series editor + generator, substitute / move / cancel session with scope, cancel appointment, customer self-manage, replace talent, amendments, milestones, archive, packages + price phases, booking policies, approvals + role limits; package 3 = locations / zones / per-location modes, party waitlist, layouts, service periods, prep stations + fire by course, guest QR + pay my share, seat map + hold timer, exchange / comp / delivery, ticket page transfer / resend / lookup, devices + heartbeat + outbox replay.
- **Messages engine** (`engine/messaging.md`, `messages-consolidation-plan`): 5 roles, 5 tabs, 11 card types; the customer thread at `/c/t/<token>`; reminders and delivery-retry crons; prototypes MSG-P1…P8, P11, P12.
- **Wiring**: every engine control wired into a screen (PRs #1966, #1969, #1970, #1974), then **verification** of every control on the QA host (`WIRING-VERIFICATION-PROMPT.md`; runs 2026-09-12, 09-15, 09-16 under `evidence/wiring-verify/`), which found D-133…D-153 and fixed the twelve wiring defects in #1993.
- **Polish groups 3–9** (`evidence/fidelity-polish3` … `fidelity-polish8`, PRs #1997, #2001, #2008, #2012, #2015, #2020, plus the small-9 pass #1995): pixel-level second passes for the shell and Overview, Counter, Appointments and Front desk, Tables / Reservations / Kitchen, Door / Events, Settings / Sales / Payments, Mobile.
- **LUMINA** (`IMPRONTA-LUMINA-PROMPT.md`, PR #2002 and its follow-ups #2016 … #2045): the first real event on production (Impronta, 21 Nov 2026): launch page, ticket page v2 with the designed checkout, PDF ticket, QR route, delivery labels, canonical event URLs.
- **Onboarding** landed alongside (P3 #1992, P4 #1996, P4b–P7 #2010, P8 #2018, P9 #2044): the sign-up that composes a site from a brief.

## 2. What is on production today

`production` was last fast-forwarded to `main` by `promote-production.yml`; `main` at handover is `87cc65c4d` (#2045). The QA host that produced this run's evidence serves `140f003be` (#2041), one merge behind. PRs merged to `main` since 2026-09-16, newest first:

#2045 linked-page edit redirect · #2041 Projects portal ghost page (D-167) · #2044 onboarding P9 AI routing · #2043 program briefs (docs) · #2040 LUMINA builder audit (ticket picker cards / checkout / floating CTA) · #2039 event page canonical URL (`events.page_id`, `/es/eventos/<slug>`) · #2038 hat and surface labels · #2033 LUMINA close (docs) · #2034 ticket page workspace locale · #2032 D-160 close (docs) · #2024 guest ticket page v2 · #2028 door delivery labels · #2031 ticket PDF attachment · #2023 reveal runtime rebinds remounted nodes · #2017 LUMINA tracker (docs) · #2021 launch page full bleed · #2025 D-160 transfer on a cash ticket · #2030 ticket QR route extension · #2026 support header icon · #2020 polish 8 · #2018 onboarding P8 trial doors · #2019 top-bar talent switch / create / language · #2015 polish 7 · #2016 ticket delivery payer column (D-159) · #2014 LUMINA flow (docs) · #2013 cron cadence / DB load · #2007 door gate silent verdict · #2012 polish 6 · #2008 polish 5 · #2010 onboarding P4b–P7 identity · #2009 counter regression (D-155, D-156) · #2006 POS KPI timeout · #2005 wiring verify run 3 · #2004 D-150 view · #2002 Impronta LUMINA · #1996 onboarding P4 account · #2003 D-146 / D-150 · #1999 storefront seams · #2001 polish 4 · #1998 wiring verify run 2 · #1997 polish 3 · #1995 small-9 · #1992 onboarding P3 reasoning.

Production POS is on: `platform_settings.workspace_pos_enabled = true`; Impronta runs counter / classes / projects / door, El Paisa counter / floor (claim from the 09-12 handover, not re-checked this run).

## 3. Where the evidence lives

- **Final case run (this handover)**: `evidence/cases-run/2026-09-17/` — `README.md` (counts by class, per-spec table, spec edits, fixture rows), `logs/<spec>.<project>.<suffix>.log` (`final` = the full run, `r2`/`r3` = reruns after spec fixes), `traces/<spec>.<suffix>/` (Playwright traces of the failures that back a filed defect; the stale-selector traces stayed local, the logs carry their call logs). Result after triage: 104 of 112 specs pass, 8 fail on real defects (D-168…D-174), none on fixture or selector drift.
- **Scenario matrix**: `scenario-matrix.md` — one row per case × role (CS-01…48 grid, 240 rows), the Wiring section (40 controls), the program specs. Every row's status is from the 2026-09-17 run.
- **Wiring verification**: `evidence/wiring-verify/2026-09-15/` and `2026-09-16/`.
- **Fidelity (boards vs screens)**: `evidence/fidelity-*/` (one README per group with the per-board verdicts, `board.png` + `screen.png` per board).
- **Engine proofs**: `evidence/engine-pos-money/`, `engine-scheduling/`, `engine-venue/` (migration version, objects proven, race output with exit codes).
- **Host proofs of each POS mode**: `evidence/host-counter/`, `host-door/`, `host-floor/`, `pos-*/`, `prove-*/`.
- **Previous case runs**: `evidence/cases-run/2026-09-11/`.
- **Defect ledger**: `defects.md`. **Decisions**: `pos/decisions.md` (D-POS-1…). **Task ledger**: `ledger.md`.

## 4. The defect ledger at handover

Filed by this run (see `defects.md` for the full text and the trace paths):

- **D-168** (high-risk, open): `20261231244000_events_refund_settings` re-created `ticket_refund_intents_reason_check` without `session_cancelled` and `admission_exchange`; cancelling a session with a paid seat and exchanging a ticket to a cheaper night both fail with "This could not be completed". One migration re-adding both reasons fixes it; production carries the narrowed CHECK.
- **D-169** (high-risk, open): the page-less tenant's Look fallback (#1989) renders the home without the type's components, so a page-less restaurant has no menu board or reserve-table block and a page-less studio no class picker on `/`.
- **D-170** (high-risk, open): a promo code can never be applied on a counter sale before it is charged, because the buyer named on the sale is attached to the order only at collection and reprice refuses a code without `orders.customer_id`; D-139's approval path is unreachable from the screen.
- **D-171** (high-risk, open): entering the counter from the top-bar switch and opening the drawer throws the operator back to the Overview and writes no shift; the same open through a hard load works (D-167 family: the Overview's poll keeps running under the POS).
- **D-172** (normal, open): seating a waiting party from the Live Floor opens a nameless walk-in; no admission carries the party's name, size or `seated_at`.
- **D-173** (normal, open, harness): the first `/api/dev/signin` for a brand-new fixture user answers 401, the second 307; the harness retries once.
- **D-174** (high-risk, open): the claimed client's account-less seat keeps `user_id` NULL, so Approve & lock answers `no_client_participant` and the dialog prints the raw code.

Still open from before (one line each; the row in `defects.md` is the truth):

- **D-151** (normal): `/events/<slug>` rendered in the tenant's first locale and `events.page_id` was unwired; #2034 and #2039 addressed the locale and the page link, the row has not been closed with a check.
- **D-152** (normal): an exchange with a price difference inserts the balance `order_lines` row without either payee column (`order_lines_payee_xor`); not reproduced on a host yet (D-168 now sits in front of it).
- **D-153** (normal): admitting a superseded (transferred) ticket code at the gate renders no verdict; #2007 "door gate silent verdict" merged after the row, re-verify and close.
- **D-154, D-157, D-158, D-166**: named as owed by the program session; no rows with those ids exist in `defects.md` on `main` (the LUMINA tracker on `origin/docs/lumina-tracker-round2` uses D-165…D-169 as its own ids, which collide with this ledger). Whoever owns them must write the rows before anyone acts on the ids.
- Older open rows: D-001/D-002/D-003 (implementing), D-008/D-009/D-010 (capacity audit, implementing), D-014 and D-103 (the repo cannot rebuild its own production schema), D-020 (now moot: the Sales table prints words), D-022, D-100, D-105 (waitlist double seat, blocking), D-106, D-107, D-109 and D-110 (owner decisions), D-124, D-129, D-130/D-131 (#1978), D-132.

## 5. How to run the suite

One Playwright process at a time, `--workers=1`, against the isolated database only. The run harness used for every log in `evidence/cases-run/2026-09-17/` is a one-spec wrapper (`run-wire.sh`, kept in the session scratchpad; recreate it from this recipe):

```bash
cd web
export VERCEL_AUTOMATION_BYPASS_SECRET=…        # from the local bypass file; never printed, never committed
set -a; . ./.env.capacity-isolated.local; set +a  # NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY of the ISOLATED branch
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital \
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 JOURNEYS_FIXTURE_READY=1 \
npx playwright test e2e/cases/<spec>.spec.ts --project=chromium --workers=1 --reporter=line --trace=retain-on-failure --output=<scratch>/pw-out/<spec>
```

- Projects: `chromium` unless the spec declares `tablet-pos` / `mobile-checkout`.
- Before a run, confirm the host serves the commit you mean: `curl -s -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" https://staging-qa-journeys.tulala.digital/ | grep -o 'sentry-release[^"]*'`.
- Run `WIRE-0-enable-modes.spec.ts` first if the fixture's POS modes may have been switched off; `WIRE-1-staff-pin-limit` before the manager-PIN specs.
- Classification rules and the known drifts: `CASES-RUN-PROMPT.md`, `evidence/wiring-verify/2026-09-16/README.md`, and the run README.
- The fixture is time-relative: `seed_journeys_program.sql` seeds Morning class, Last place class and QA Night at `now() + 1–2 days`, and its `ON CONFLICT` for the two classes does not move `starts_at`. A run more than a day after the seed needs the three sessions moved forward (this run did it directly on the isolated branch; the run README says how).
- Never `npm run db:push`; never a bare `tsc`; if types must be checked, `cd web && npm run typecheck` once.

## 6. The release rule

PR to `main` → the four required checks (Structural quality gate, Admin boot (prod build), Builder perf budget, Fidelity goldens) green → a normal merge (`gh pr merge <n> --merge`, never `--admin`) → `promote-production.yml` fast-forwards `production` → Vercel builds it → `vercel-post-deploy-alias.yml` re-aliases the domains → `cd web && npm run deploy:smoke`. One merger at a time; merges are paced (the pointer freezes when they are not). Never push the `production` pointer by hand.

Migrations: isolated branch first (`fxlankepwnvelxjrahwk`, `npm run journeys:repair -- ../supabase/migrations/<file>.sql`), objects verified there, then production (`pluhdapdnuiulvxmyspd`) BEFORE the code merges; additive only before merge, shape changes are code-first. **Ask the program session for the next free migration version** before naming a file: versions have been taken remotely under another name twice (`incident_migration_version_taken_remotely_never_applies`), and the last one in tree is `20261231245000`.

## 7. The machine rules

One heavy process at a time (a Playwright run, a typecheck, a dev server); never `next build` locally; `npm run typecheck` is the only type check (a bare `tsc` over the repo is forbidden); one Playwright process with `--workers=1`; dev servers need a lease from the CPU governor; never `git switch` in the shared checkout, always a worktree under the session scratchpad.

## 8. What is still owed

- **Messages polish** waits on the Messages redesign (admin boards v1 artifact; the workspace shell is "the POS shell grown up"); MSG-boards-preview is a dev-only route and cannot be proven on the host.
- **Widget islands** (`WIDGETS-PROGRAM.md`): the block-level islands for the storefront are designed, not built.
- **WhatsApp worker hosting**: `channels-whatsapp` passes on the host with the stub; the worker has no host and no credentials.
- **Stripe / Mercado Pago keys**: the isolated env has no Stripe secret (mock checkout leaves deposits open); Mercado Pago Point (`p4-mercado-pago-discovery.md`) waits on credentials and on D-POS-4 (Terminal vs Point).
- **Passes / memberships**: designed in the boards, no engine.
- **The owner's real purchase + refund proof** on production (a card purchase, a refund, the money rows read back) has not been done; the 29-test live-money runbook is written.
- **Defects**: D-168 … D-174 (this run), D-151, D-152, D-153, D-154, D-157, D-158, D-166 (rows owed), and the older open rows in §4.
- **Rotate the Vercel protection-bypass secret and scrub the repo**: 33 Playwright trace zips already on `main` (`evidence/wiring-verify/2026-09-1*/traces/**`, from the 2026-09-15/16 runs) embed the `x-vercel-protection-bypass` header with its value in their network logs. This run's traces were scrubbed before the commit; the earlier ones were not. Rotate the secret in Vercel, update the local secret file, then remove or rewrite those zips (history rewrite is a separate decision).
- **Fixture**: the three seeded sessions need a re-seed that moves `starts_at` on conflict, or a cron that keeps the fixture in the future; the fixture workspace carries every row the specs leave (listed in the run README).
- **Specs that document a real defect**: `WIRE-2-approvals` (D-170), `WIRE-2-cancel-session` and `WIRE-3-exchange-comp` E11 (D-168), the three storefront tests of `C06` and two of `C09` (D-169), `POS-counter-cash-sale` (D-171), `VENUE-table-service` (D-172), `C08-CUS accept` (D-174) fail until the app is fixed; none was weakened.

## Appendix: which file is canonical for what

| Question | Canonical file |
|---|---|
| Case status, per scenario, from a real run | `scenario-matrix.md` |
| Open defects, their real text and disposition | `defects.md` |
| Evidence a scenario ran and what it proved | `evidence/` |
| Per-case requirement text | `cases/` |
| Merged task tracker (T-ids, P/M-ids, POS-ids) | `ledger.md` |
| Screens, actions, modes, decisions, coverage of the POS/workspace design | `pos/` (`screen-index.md`, `actions.md`, `modes.md`, `decisions.md`, `coverage-matrix.md`) |
| Engine contracts (action names, inputs, refusal codes, readers) | `engine/` |
| Prompts that ran the sub-programs | `CASES-RUN-PROMPT.md`, `ENGINE-PACKAGES-PROMPT.md`, `ENGINE-PACKAGE-3-PROMPT.md`, `POS-MESSAGES-PROMPT.md`, `WIRING-VERIFICATION-PROMPT.md`, `IMPRONTA-LUMINA-PROMPT.md`, `WIDGETS-PROGRAM.md`, `MESSAGES-DESIGN-BRIEF.md` |
| The 404-row blueprint scenario register | `scenario-register-404.md` |
