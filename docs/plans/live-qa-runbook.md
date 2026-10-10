# Live QA runbook — isolated stack + regression pack

Isolated **fxlank** only. Never production. Never TAL-93938. Env **names** only below — never paste values into Notion, PRs, or chat.

## Start / stop the stack

```bash
cd web
# source the isolated env file first (names below); then:
export JOURNEYS_ISOLATED=1
./scripts/qa/start-isolated-stack.sh   # build + next :3008 + proxies :3105/:3106; prints PIDs
./scripts/qa/stop-isolated-stack.sh    # stop by recorded PIDs
```

| Port | Role |
|---|---|
| `:3008` | Next production server (`QA_PACK_SITE_PORT`) |
| `:3105` | Marketing host proxy → `marketing.local` |
| `:3106` | App host proxy → `app.local` |

Talent hosts (`*.tulala.digital`) map to `127.0.0.1` via Playwright `host-resolver-rules` in `playwright.live-qa-pack.config.ts`.

## Env names (values live only in the isolated env file)

| Name | Purpose |
|---|---|
| `JOURNEYS_ISOLATED` | Must be `1` (guard) |
| `NEXT_PUBLIC_SUPABASE_URL` | Isolated project URL (must contain `fxlankepwnvelxjrahwk`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Isolated anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Isolated service role (mint sessions; never production) |
| `TULALA_ALLOW_DEV_SURFACES` | Dev surfaces on the stack (`1`) |
| `TULALA_MARKETING_ORIGIN` | Local marketing origin (e.g. `http://localhost:3105`) |
| `QA_PACK_APP_ORIGIN` | Pack app origin (default `http://localhost:3106`) |
| `QA_PACK_MARKETING_ORIGIN` | Pack marketing origin (default `http://localhost:3105`) |
| `QA_PACK_SITE_PORT` | Upstream Next port (default `3008`) |
| `QA_PACK_FIXTURES` | Absolute path to fixtures JSON |
| `IMPERSONATION_COOKIE_SECRET` | Same throwaway secret as the stack (TUL-255 only) |
| `QA_PACK_THEME_ROUNDTRIP` | Set `1` only on a throwaway talent (TUL-421) |
| `QA_PACK_AI_SUPPORT` | Set `1` only inside a PM-approved AI-support window (TUL-120) |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Test keys only (`*_test_*`); live keys refuse |

## Run the pack

```bash
cd web
export JOURNEYS_ISOLATED=1
export QA_PACK_FIXTURES=/abs/path/fixtures.json   # shape: e2e-isolated/live-qa-pack.fixtures.example.json
npm run qa:live-pack
# one card:
npm run qa:live-pack -- -g "TUL-379"
```

A missing fixture **SKIPS** (not a pass). Open defects may **FAIL** until the fix ships — that is the finding. Evidence lands in `web/docs/plans/qa-evidence/live-qa-pack-<date>/`.

## The 41 Live QA cards

PASS = Done-when holds on the isolated stack for that card. SKIP = fixture / env gate missing. FAIL until fix = red test encodes today's open defect.

| # | Card | Pack test | PASS criteria (Done-when) |
|---|---|---|---|
| 1 | TUL-62 | yes | Client `/account` visit row names the service, date matches detail, cancel/reschedule visible |
| 2 | TUL-64 | yes | Active onboarded client on app host is not bounced to `/start` or `/onboarding/role` |
| 3 | TUL-81 | yes | Builder "Borrador guardado" toast (`[data-edit-overlay=draft-saved-toast]`) readable (≥4.5:1) and on top; pending-images pill ends ≤200 s |
| 4 | TUL-116 | yes | Guest chat price question answers with price + duration, no contact gate first |
| 5 | TUL-117 | skip→journeys | Three-choices journey covered by `e2e/onboarding/choices-journey.spec.ts` |
| 6 | TUL-120 | skip→flag | Support AI answers a Spanish ticket in Spanish (`QA_PACK_AI_SUPPORT=1`) |
| 7 | TUL-182 | yes | Dashboard money reads `<symbol><amount> <CODE>`; never `MX$` or bare `$` |
| 8 | TUL-255 | yes | Staff impersonating a client: portal pages 200 with banner; `/client` does not loop |
| 9 | TUL-378 | yes | Dual owner: Talent \| Admin switch reachable on desktop and phone 390 |
| 10 | TUL-381 | yes | Offer draft editor fits panel; Spanish labels; no `Anadir linea` / `elige Talent` |
| 11 | TUL-398 | yes | Spanish studio builder: Spanish search works, Spanish defaults, no roster sections |
| 12 | TUL-401 | yes | Guest chat dock attached on a fresh talent host within 30 s |
| 13 | TUL-421 | opt-in | Theme A→B→A: business data identical; live page restored byte-for-byte |
| 14 | TUL-519 | yes | Talent count bubble equals inbox "esperando tu respuesta"; Hoy agrees |
| 15 | FIRST-RUN | yes | New studio dashboard greets a person, no restaurant POS rail, first publish 0 blockers |
| 16 | T1/DS-62 | yes | Header primary CTA on talent site points at a real target on `/` and `/politicas` |
| 17 | TUL-39 | yes | Free talent Apps: premium (Nail Designer) shows Web Office badge + Upgrade; paid can Add |
| 18 | TUL-67 | yes | Client email/receipt render path exposes seller block + fee line (fixture email render) |
| 19 | TUL-77 | yes | Fresh myself/both site: public services + real `/book` slots (not inquiry-only) |
| 20 | TUL-79 | yes | Builder desktop/tablet/390: hero not cut off; device switch shows skeleton (not blank) |
| 21 | TUL-93 | yes | Confirmed booking creates guest + talent notification dispatch (not "channel not configured") |
| 22 | TUL-146 | yes | Spanish dashboard locale: no English chrome strings on profile/settings/services/tab title |
| 23 | TUL-279 | yes | Isolated `/start` "understand your words" accepts a valid brief (not stuck on "Tell us a little more") |
| 24 | TUL-312 | yes | With `TULALA_MARKETING_ORIGIN` set, `/start` redirects stay on the local marketing origin |
| 25 | TUL-325 | yes | After gallery apply, Publish CTA is visible and primary so the new design can go live |
| 26 | TUL-358 | yes | Horario drawer exposes Zona horaria + hours form (not only the week calendar) |
| 27 | TUL-379 | yes | Spanish `/talent/inbox`: no English chrome (`My jobs`, `All Jobs`, `Awaiting your response`, 12h AM/PM) |
| 28 | TUL-391 | yes | Money/approval notification kinds exist in catalog for refund.failed / payment.needs_attention / offer-pending-approval |
| 29 | TUL-397 | yes | Builder device switch: frame skeleton then content; inspector does not cover the canvas |
| 30 | TUL-420 | yes | Theme update on a customized site: preview/apply surfaces a decision (kept / updates / conflicts) before publish |
| 31 | TUL-441 | yes | Starter-content failure shows "Tu sitio no se pudo preparar" + Reintentar (not empty success) |
| 32 | TUL-449 | yes | Talent site: secondary-read timeout degrades a section; main talent/site row still 200 |
| 33 | TUL-458 | yes | Hub guest chat: second message after "Solicitud recibida" sends (composer clears) |
| 34 | TUL-472 | yes | Offer flow: Oferta tab shows draft after reload; no stuck "Abriendo la lista" / sticky "Error al guardar" |
| 35 | TUL-473 | yes | `/admin/work/<bookingId>` for a paid booking is not "Something broke" |
| 36 | TUL-503 | yes | Client hub/agency `/account` visit rows show each visit's talent booking zone label |
| 37 | TUL-505 | yes | Both/studio workspace site: every header/hero link returns 200 in the site language |
| 38 | TUL-64 sibling | pack | (covered by TUL-64) client bounce |
| 39 | TUL-116 sibling | pack | (covered by TUL-116) guest price |
| 40 | TUL-401 sibling | pack | (covered by TUL-401) dock |
| 41 | TUL-182 sibling | pack | (covered by TUL-182) money format |

Rows 38–41 are pack-covered siblings kept so the table stays at 41 for the Live QA checklist. New enrollments append below and bump the count in a follow-up.

## Safety

- `live-qa-pack-setup.ts` + `scripts/isolated-target-guard.mjs` refuse non-fxlank, non-local origins, and live Stripe keys.
- Pack is **not** in any CI lane; only `npm run qa:live-pack`.
- Agents do not type Stripe cards. Paid QA is a separate harness (`qa:paid-isolated`).
- Throwaway client created by the pack is deleted in `afterAll` with a read-back; leftover inquiries listed in `fixtures-created.json` for TUL-3.
