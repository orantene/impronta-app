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

---

# Round 5 (24 September 2026, QA host proofs)

Cited against `origin/main` = `origin/production` = `cd27278d1` (Merge #2227). Worktree `.claude/worktrees/round5-qa-proofs` on `docs/round5-qa-proofs`. Shared checkout was not the source.

## Pointers

| Ref | Sha | Note |
|---|---|---|
| `origin/main` | `cd27278d1` | Merge #2227 |
| `origin/production` | `cd27278d1` | `git merge-base --is-ancestor cd27278d1 origin/production` = 0 |
| `origin/program/journeys-2026-09` before this run | `825f69f42` | #2213; missing #2222 / #2225 / #2226 / #2227 |
| `origin/program/journeys-2026-09` after mirror | `cd27278d1` | `git push -f origin origin/main:program/journeys-2026-09` |
| QA alias before | `dpl_AbxsNHiWjqdezCBPKBJXmQEzgAuH` | sha `825f69f42` |
| QA alias after | `dpl_BMP8ryuJvTZuSrm5zrsp2126S6y8` | sha `cd27278d1`; Ready; aliases include `staging-qa-journeys.tulala.digital` |

## Step 1. QA host on current main

**Proven.** Feature pointer force-mirror (the established exception). New preview Ready on `cd27278d1`. `dpl_` changed. Did not start dashboard proofs against the old build.

## Step 2. Vercel protection bypass

**Not proven. Stopped as specified.**

`web/.env.capacity-isolated.local` was missing in the shared checkout and in this worktree when Step 2 started. The key `VERCEL_AUTOMATION_BYPASS_SECRET` is also absent from `.env.local` / `.env.prod` / `.env.vercel.local`. No value was read, written, rotated, or printed.

Bare request (no header):

- URL: `https://staging-qa-journeys.tulala.digital/`
- Status: `302`
- Location: `https://vercel.com/sso-api?url=https%3A%2F%2Fstaging-qa-journeys.tulala.digital%2F&nonce=…`

That is Deployment Protection working. `/api/dev/signin` was not called. Playwright was not run.

Unblock (owner, one line): put the existing Protection Bypass for Automation value into `web/.env.capacity-isolated.local` as `VERCEL_AUTOMATION_BYPASS_SECRET=…` (gitignored). Do not rotate. Do not paste it into chat, a PR, a commit, a log, or this report.

No new product defect. No D-MSG-423.

## Step 3. Stripe on journeys (D-MSG-330 / D-MSG-418)

**Not proven.** Blocked on Step 2. `pk_test_` prefix was not read from a mounted pay sheet. `stripe-pay-refund.spec.ts` was not edited and not run. No card, no refund, no production pay.

## Step 4. Talent dashboard (QA fixtures only)

**Not proven.** No fixture agency or fixture talent was created. Jorgelina was not written.

| # | Proof | Status | Reason |
|---|---|---|---|
| 1 | Money split (agency net vs hub client total) | not proven | Step 2 stop |
| 2 | Group thread silent on amounts | not proven | Step 2 stop |
| 3 | Accept / decline bar | not proven | Step 2 stop |
| 4 | Ask in place | not proven | Step 2 stop |
| 5 | Request-only copy | not proven | Step 2 stop |
| 6 | Named refusals stay visible | not proven | Step 2 stop |
| 7 | Builder publish | not proven | Step 2 stop |

## Step 5. Workspace matrix

**Not proven.** No `/get-started` restaurant or services fixture. Capacity, race, permissions, cross-tenant, links, reload, vocabulary, and hostile-data specs were not run.

| # | Proof | Status | Reason |
|---|---|---|---|
| 1 | Capacity refusals (class / tier / table / appointment) | not proven | Step 2 stop |
| 2 | Race: one win, one refusal, one row | not proven | Step 2 stop |
| 3 | Permissions money | not proven | Step 2 stop |
| 4 | Cross-tenant | not proven | Step 2 stop |
| 5 | Expired / flipped / other-tenant links | not proven | Step 2 stop |
| 6 | Reload and resume | not proven | Step 2 stop |
| 7 | Restaurant vs services vocabulary | not proven | Step 2 stop |
| 8 | Hostile data | not proven | Step 2 stop |

## Not proven (must stay non-empty)

Everything after Step 1. Next run starts at Step 2 once the gitignored env file exists on the machine that will run Playwright.

## Out of this run

`proxy.ts`, Jorgelina catalogue, free-plan booking eligibility, #2202, #2127, CI 50% profile, attachments / talent notes / talent-started threads, frozen `$700` without ≈ US$. Production pointer was not moved by hand.
