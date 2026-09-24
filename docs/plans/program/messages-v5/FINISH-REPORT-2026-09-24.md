# Finish report, 24 September 2026 (complete-all run)

Cited against `origin/main` = `origin/production` = `259ae741d` (Merge #2225). Worktree `.claude/worktrees/usd-vanity-rates`. Shared checkout was not the source.

---

## Pointers

| Ref | Sha | Note |
|---|---|---|
| `origin/main` | `259ae741d` | Merge #2225 |
| `origin/production` | `259ae741d` | `git merge-base --is-ancestor 259ae741d origin/production` = 0 |
| Prior on prod before this run | `f088d5cf8` | Merge #2226 guest session |
| After #2222 | `2b47e8246` | list/storefront only; `deploy:smoke` HTTP signals green; migration/taxonomy soft fails without local `.env.local` |
| After #2225 | `259ae741d` | promote workflow success 2026-09-24T17:13:30Z |

Live vanity host `book-jorgelina.tulala.digital` baggage `sentry-release=259ae741ddac3eca35e0e9631c3f5280d79f1d08`.

---

## Task 1. Guest ask on a vanity host

**Proven.**

Token in body: `QA-JORG-INQ-20260924-B` (text only, no service chip, no booking).

- POST identity check: email available.
- POST create inquiry: `ok:true`, `inquiryId=8d605760-4306-4797-b623-95e200fae89a`, opening message id `e3bd916a-bdf9-4e82-a7ae-e2aba8f7704c`.
- DB `inquiry_messages`: guest row with that body + guest_session_id `69939e09-0dc4-4eb4-9020-045835f21489`; system ack "Thanks, we'll get back to you within 4 hours."
- DB `inquiries.origin_domain`: `book-jorgelina.tulala.digital`.
- Participant: talent `f048e578-cbae-45db-9a3b-34239abea136` status `invited`.
- Dock UI: "Enviada, esperando respuesta", message bubble visible, Solicitudes badge 1. Screenshot taken.
- **Client-link origin read live:** thread token from the poll response opened at `https://tulala.digital/c/t/<token>` and showed the same message. Hub origin. Vanity `/c/t/v1.test` returns 404 "Page not found". Not a P0 for this send: `threadLinkUrl` already routes `talent_site` conversations to `HUB_THREAD_ORIGIN` (`web/src/lib/messaging/thread-link.ts`).

#2226 on production unblocked this. `proxy.ts` was not touched in this run.

---

## Merges this run

### #2222 `feat/free-plan-storefront-parity`

**Merged** as list/storefront only. Merge sha `2b47e8246`. Structural gate success. Production pointer advanced. Booking eligibility / CTA gates on Noir/Atelier/Lumen not changed.

### #2225 `fix/vanity-usd-rates` (D-MSG-421)

**Merged.** Tip before merge `9f3a1c1e3`. Merge sha `259ae741d`. On `origin/production`.

Repairs in this run:

- Rebase onto main after #2226; kept D-MSG-421 and D-MSG-422 in `decisions.md`.
- `TS2339`: typed empty data-sources as `BuilderNodeRenderDataSources`.
- `max-lines` 840: moved MXN USD tests to `native-data-blocks-usd.test.ts` (parent file 793 lines).
- Island static test: moved `data-usd-equivalent` styling to class `site-builder-node--menu-board-usd-hint` on the CSS sheet (no inline `style={{}}`).

**Fixture `menu_board`:** unit proof `native-data-blocks-usd.test.ts` (MXN + rates → `data-usd-equivalent` / `≈ US$`; MXN without rates → none). Static: `talent-site-host-route.static.test.ts` asserts vanity calls `loadUsdRatesForSitePrices`. Live fixture host with a real `menu_board` was **not** opened (QA host SSO; see Task 2).

**Her `$700` rows:** on production release `259ae741d`, `data-usd-equivalent` count = 0, `≈ US$` count = 0, `$700` still present. Expected frozen authored copy, not `talent_offerings`.

Talent website E2E on the PR was red (timeouts / missing elements / disposed request context). Required structural + admin boot + fidelity + builder perf were green. Merge proceeded on those required gates.

### #2223

**Closed** as superseded for this run. Locale on vanity already via #2221; live site `lang=es`. Dock already one close. #2202 and #2127 left open.

---

## Task 2. Talent dashboard on QA (`fxlankepwnvelxjrahwk`)

**Not proven** as watched working.

`https://staging-qa-journeys.tulala.digital/` redirects to Vercel SSO login. Browser automation has no SSO session. `vercel curl` for a full custom URL is not supported by this CLI version (path-only). No fixture talent login was opened. Existing unit tests are not screenshots plus a live effect.

| Item | Status | Reason |
|---|---|---|
| Money split, both halves | not proven | QA host SSO. `talent-pov.test.ts` only. |
| Group thread silent on amounts | not proven | Thread not opened. |
| Accept and decline bar | not proven | No pending invitation answered. |
| Ask in place | not proven | Spec needs `QA_TALENT_SITE_URL` + QA host; SSO blocked. Guest ask on Jorgelina (Task 1) is a separate vanity proof. |
| Request-only copy | not proven | Not clicked. |
| Refusals with visible buttons | not proven | Not clicked on fixture. |
| One real builder publish | not proven | #2198 / #2205 not re-run as logged-in fixture publish. |

---

## Task 3. Workspace matrix

**Not proven.** No `/get-started` fixture business was created. QA host SSO blocked creation of restaurant and services fixtures. Capacity, race, permissions, isolation, token, reload, restaurant-vs-services vocabulary, and hostile data were not watched.

---

## Task 4. Stripe

**Stopped, correctly.** Production is live mode (D-MSG-418). No card was used.

Unblock: put a `pk_test_` (and matching secret) on an environment this lane can reach, most sensibly the journeys preview host.

---

## Out of this run

`proxy.ts`, CI 50% profile, `services_catalog` on Jorgelina, attachments / notes / talent-started threads, free-plan booking eligibility, #2202, #2127.
