# Paid QA on the isolated stack (TUL-464)

One command, no human step beyond starting the stack:

```bash
cd web
# local production build running on :3001, pointed at the isolated project (fxlank),
# Stripe TEST keys, and the two `stripe listen` forwarders (US + MX) up.
set -a; . ../.paidqa.server.env; set +a        # the isolated env, never production
export JOURNEYS_ISOLATED=1
export PAID_QA_BASE_URL=http://hub.localhost:3001
export PAID_QA_PAY_URLS='{"success":"http://hub.localhost:3001/pay/<code1>","decline":"http://hub.localhost:3001/pay/<code2>","threeDS":"http://hub.localhost:3001/pay/<code3>"}'
npm run qa:paid-isolated
```

Evidence (a screenshot per step, `results.json`, `summary.md`) lands in
`docs/plans/qa-evidence/paid-qa-<date>/`.

## Safety rules (enforced in `global-setup.ts`, before any test)

- Supabase target must be the isolated project (`scripts/isolated-target-guard.mjs`); production or Impronta refuse.
- Every Stripe key must be a `*_test_*` key; any live key refuses.
- `PAID_QA_BASE_URL` and every pay URL must be a local host (`localhost`, `127.0.0.1`, `*.localhost`).
- The spec asserts the Stripe checkout page is a test session (URL contains `cs_test_`) and shows the **Sandbox** or **Test mode** badge before it types a card.
- Only Stripe's published test cards are used (4242 success, 4000 0000 0000 0002 decline,
  4000 0000 0000 3220 3-D Secure).
- Database reads are GETs only. The spec never writes.

## Who runs it

A person or CI runs it. **Agent sessions do not run it**: it types card numbers on a stripe.com page.

## What is NOT covered yet

- Minting the pay links (book -> offer -> pay link) is still done by hand or by the end-to-end run; links are single use,
  so each case needs a fresh one. A missing case URL is reported as *skipped* (never as pass).
- MXN + USD variants: run once per currency by passing links created in each currency.
- Money page and full/partial refund steps: not automated in this first version.
- Status: written 2026-10-09, **not yet run**. First run: adjust `fillCard` selectors if Stripe changed its markup.

## Live-QA regression pack (`live-qa-pack.spec.ts`)

**Expected state on 2026-10-09 (read a red test as a KNOWN DEFECT, not a regression, until its row says PASS):**

| Test (card id) | Expected today | Why |
|---|---|---|
| TUL-62 client /account list + cancel/reschedule | FAIL until fixed | list row shows "Servicio", date one day early; no cancel/reschedule (booking client_user_id NULL) |
| TUL-64 client not bounced on the app host | FAIL until fixed | active client lands on /start or /onboarding/role |
| TUL-116 guest chat price answer | PASS | verified by hand 2026-10-09 |
| TUL-401 chat dock present | PASS (may flake: absent 30 s on 1 of 14 first loads) | stalls on the isolated stack |
| TUL-182 money formats | PASS | verified by hand |
| TUL-378 dual-owner switch desktop + phone | FAIL until fixed | no route to the business side on phone 390 |
| TUL-255 impersonation portal pages | FAIL until fixed | generic 404 on every portal page, /client redirect loop |
| TUL-398 builder Spanish search + defaults | FAIL until fixed | search matches English only; Gallery/Services defaults in English |
| TUL-81 draft-saved toast | PASS | verified by hand |
| TUL-381 offer draft editor | FAIL until fixed | "Anadir linea" typo, English "elige Talent" |
| TUL-519 count bubble == inbox count | FAIL until #3181 lands | bubble 2 vs inbox 5 vs Hoy "Todo al día" |
| FIRST-RUN studio greeting / POS rail / first publish | FAIL until the P1 cards ship | handle greeting, POS rail, 3 publish blockers |
| T1/DS-62 header CTA target | UNKNOWN: the first run decides | batch t1 risk (primaryCta not pruned) |
| TUL-421 theme round trip | SKIP unless QA_PACK_THEME_ROUNDTRIP=1; PASS when run | verified by hand |
| TUL-117, TUL-120 | SKIP | delegated / needs a shared-row change |
| TUL-39 premium Apps gate | UNKNOWN until first stack run | free talent Apps badge + Upgrade |
| TUL-67 branded receipt | SKIP without visit fixture; FAIL until fee/seller lines ship | seller block + 1.5% line |
| TUL-77 bookable myself site | FAIL until slots exist | services + real /book slots |
| TUL-79 builder device/hero | UNKNOWN until first stack run | skeleton + hero not cut off |
| TUL-93 booking notifications | SKIP without confirmed booking; FAIL on channel-not-configured | dispatch rows present |
| TUL-146 Spanish chrome | FAIL until English leaks gone | no EN shell on profile/settings/services |
| TUL-279 start brief AI | UNKNOWN / may FAIL on isolated AI config | not stuck on "Tell us a little more" |
| TUL-312 marketing origin | PASS when TULALA_MARKETING_ORIGIN set | no redirect to production tulala.digital |
| TUL-325 Publish CTA after gallery | UNKNOWN until first stack run | Publish visible after apply |
| TUL-358 Horario zone | FAIL until Zona horaria ships | zone + hours form |
| TUL-379 inbox Spanish | FAIL until EN chrome gone | no My jobs / 12h AM/PM |
| TUL-391 money notif catalog | SKIP if catalog unreadable | refund.failed / needs_attention / offer approval |
| TUL-397 builder gaps | UNKNOWN until first stack run | device switch + inspector width |
| TUL-420 theme update decision | UNKNOWN until first stack run | keep/update/conflict copy |
| TUL-441 starter fail retry | SKIP unless QA_PACK_STARTER_FAIL=1 | Tu sitio no se pudo preparar + Reintentar |
| TUL-449 secondary-read degrade | PASS when home 200 | no whole-page 500 |
| TUL-458 hub chat second send | FAIL until launcher opens on hub/marketing directory + second send clears | composer clears; targets MARKETING /global-directory (not talent siteHost) |
| TUL-472 offer papercuts | FAIL until draft persists | no Abriendo la lista / Error al guardar |
| TUL-473 admin work paid booking | SKIP without paidBooking fixture | not Something broke |
| TUL-503 client zone labels | SKIP without visits | zone label on hub account |
| TUL-505 workspace nav 200 | SKIP without both.siteHost; FAIL on 404 links | header/hero links 200 |

Full PASS table: [`docs/plans/live-qa-runbook.md`](../../../docs/plans/live-qa-runbook.md) ("The 41 Live QA cards").

**NOT enrolled anywhere:** this spec is in no CI lane, no nightly list and no orphan list (`web/package.json` lanes,
`web/scripts/ci/nightly-orphans.txt`, `.github/` do not mention it); only `tsconfig.json` type-checks `e2e-isolated/`.
It runs only through `npm run qa:live-pack` against an isolated stack.

One Playwright test per Notion card id, replacing the hand-run Live QA checks (Spanish workspace, client portal,
builder, first-run publish, header CTA). Isolated stack only; `live-qa-pack-setup.ts` refuses first.

```bash
cd web
# stack built from the release commit, on 3008/3105/3106, TULALA_PERF_TRACE optional
export JOURNEYS_ISOLATED=1
export QA_PACK_FIXTURES=/abs/path/fixtures.json     # shape: e2e-isolated/live-qa-pack.fixtures.example.json
export IMPERSONATION_COOKIE_SECRET=<same throwaway secret as the stack>   # only for TUL-255
npm run qa:live-pack
```

A missing fixture SKIPS the test (a skip is not a pass). Tests that encode a defect open today are written to FAIL
until the fix ships. The pack creates one throwaway QA client and removes it in `afterAll` with a read-back; the
inquiries/bookings that client makes are listed in `fixtures-created.json` for the TUL-3 clean-up. Status: written
2026-10-09, NOT YET RUN end to end; adjust selectors on the first run.
