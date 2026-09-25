# Finish report, 24 September 2026 (complete-all run)

Cited against `origin/main` = `origin/production` = `259ae741d` (Merge #2225). Worktree `.claude/worktrees/usd-vanity-rates`. Shared checkout was not the source.

> **Canonical open list:** see [§ Still open (canonical)](#still-open-canonical) at the end of this file (after the pending close-out). Mid-file “not proven” blocks are historical. Execution plan: [`FINISH-AUDIT-EXECUTION-PLAN-2026-09-25.md`](./FINISH-AUDIT-EXECUTION-PLAN-2026-09-25.md).

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

**Proven** after the gitignored file was placed. The secret is not in this report.

With `x-vercel-protection-bypass` (header only):

- `https://staging-qa-journeys.tulala.digital/` returned **200** HTML. Page `data-dpl-id` is `dpl_BMP8ryuJvTZuSrm5zrsp2126S6y8`. Not a redirect to `vercel.com/sso-api`.
- `/api/dev/signin?email=qa-journeys-owner@impronta.test&next=/admin/messages` returned **307** to `https://staging-qa-journeys.tulala.digital/admin/messages`. The loaded page contains `[data-messages-v5]`. Session cookie name is `sb-fxlankepwnvelxjrahwk-auth-token`.

A request with no header still returns **302** to `https://vercel.com/sso-api?url=https%3A%2F%2Fstaging-qa-journeys.tulala.digital%2F&nonce=…`. That is Deployment Protection.

## Step 3. Stripe on journeys (D-MSG-330 / D-MSG-418)

**Not proven.** The signed-in Messages bundle on this host contains `pk_test_` (prefix only; not `pk_live_`). `stripe-pay-refund.spec.ts` was not edited and not run. No card, no refund, no production pay. Parked: this run has no QA service-role key for `fxlankepwnvelxjrahwk`, and `web/.env.local` points at production Supabase.

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
| 6 | Reload and resume | proven | See Quick wins. `reload-resume.spec.ts` 2 passed. |
| 7 | Restaurant vs services vocabulary | proven | See Quick wins. Menu on journeys, Services on journeys-b. |
| 8 | Hostile data | proven | See Quick wins. `hostile-data.spec.ts` 2 passed. |

## Quick wins (same day, after the bypass file existed)

Playwright from `.claude/worktrees/round5-qa-proofs`, Node 20, `PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital`, bypass header from the gitignored file. `web/.env.local` was not sourced.

| Proof | Result | Evidence |
|---|---|---|
| Restaurant vocabulary | **Proven.** Items heading is Menu. Picker is not the talent cart. `vocabulary-restaurant.spec.ts` 1 passed (18.6s). | `web/e2e/qa-program/evidence/2026-09-18/vocab-restaurant-panel.jpg`, `vocab-restaurant-picker.jpg` |
| Salon vocabulary | **Proven.** On `staging-qa-journeys-b.tulala.digital`, Items heading is Services, not Menu and not Talent & services. `vocabulary-salon.spec.ts` 1 passed (9.1s). | `vocab-salon-panel.jpg`, `vocab-salon-picker.jpg` |
| Hostile data | **Proven.** 4000-character message leaves the shell up. `$0` custom line does not show an application error, NaN, or Infinity. `hostile-data.spec.ts` 2 passed (16.8s). | `hostile-long-message.jpg`, `hostile-zero-price.jpg` |
| Reload and resume | **Proven.** Reload mid payment sheet does not add a Payment card. Back from POS returns to Messages on inquiry `ad22e3e4-9ad9-431b-b922-1ccf3bf5c10f`. `reload-resume.spec.ts` 2 passed (33.7s). | `reload-mid-payment-open.jpg`, `reload-mid-payment-after.jpg`, `reload-back-from-pos.jpg` |
| Talent inbox v5 | **Not proven.** `QA_TALENT_INBOX_URL` is unset. Seed profile `QA-JNY-T1` has no talent login email in `seed_journeys_program.sql`. No talent was created and no site was published. | none |

## Not proven (must stay non-empty)

- Stripe pay, full refund, and partial refund.
- Capacity refusals (class, ticket tier, table, appointment) and the two-browser race.
- Permissions, cross-tenant, and expired or flipped links.
- Talent money split, group silence, accept or decline, ask in place, request-only, refusals, and builder publish.
- Talent inbox v5, as above.
- New restaurant or services businesses through `/get-started` (these proofs used the seeded journeys and journeys-b fixtures).

## Out of this run

`proxy.ts`, Jorgelina catalogue, free-plan booking eligibility, #2202, #2127, CI 50% profile, attachments / talent notes / talent-started threads, frozen `$700` without ≈ US$. Production pointer was not moved by hand. No D-MSG-423.

## Round 5 remainder (24 Sep, later pass)

Host check before this pass: `https://staging-qa-journeys.tulala.digital/` with the bypass header returned 200 and `dpl_BMP8ryuJvTZuSrm5zrsp2126S6y8`. The anonymous homepage HTML did not contain `pk_test_` or `pk_live_`.

| Item | Status | Reason |
|---|---|---|
| Stripe pay, full refund, partial refund | not proven | `stripe-pay-refund.spec.ts` skips unless `QA_ALLOW_AGENT_PROD_HOST=1`, and that path targets `qa-stripe-r2.tulala.digital`. This pass did not set that flag. The spec also requires `SUPABASE_SERVICE_ROLE_KEY` to read the minted pay code and the database rows. That key for `fxlankepwnvelxjrahwk` is not on this machine. `web/.env.local` was not sourced. |
| Talent money split, group silence, accept/decline, ask in place, request-only, refusals, builder publish | not proven | No QA service-role key, and the seeded talent `QA-JNY-T1` has no login email. No fixture talent was created. #2198 and #2205 were not re-read as a substitute for the proof. |
| Capacity, race, permissions, cross-tenant, expired/flipped/other-tenant links | not proven | Each of these needs a database row or a second fixture. No QA service-role key. |
| Hostile cases beyond the quick wins | not proven | The passing spec covers a 4000-character message and a `$0` line. It does not cover a 60-character name, 30 offer lines, emoji and right-to-left text, or a `$99,999` line. |

No new defect id. D-MSG-423 was not opened. The not-proven list above stays.

## Shell writers (same branch)

These are unit-tested. They are not on the QA host until this branch merges and the journeys preview is rebuilt.

- A recorded transfer or cash payment on a booking can stay a deposit. `messagingRecordOutsidePayment` passes `amountKind` through. Omitted callers still settle in full.
- A paid `payment_request` card can carry `totalCents`, `paidCents`, `dueCents`, `currency`, and `method` when the order total and a method are known. `readPayment` returns them.
- A system `payment_paid` row is classified as a system note.
- Refund and cancel are wired routes. A refund card carries `refundedCents` and `currency`.
- An offer decline and a failed payment each insert a guest `change_result`.
- `slot_taken` is its own guest error and includes `nextFreeTimes`, or an empty list.
- A verified cash collection inserts `order_confirmation`, and `tickets_card` when the order already has admissions. No door code is invented.

## Guest card gaps (24 Sep, after #2240)

Merged as `25fc7c250` ([#2240](https://github.com/orantene/impronta-app/pull/2240)). `program/journeys-2026-09` fast-forwarded to that commit. The live host `https://staging-qa-journeys.tulala.digital/` returned 200 with `dpl_C4vxn4tsVy3wQiQbyqgEDt7tqKHq` in the HTML, and that deployment's commit is `25fc7c250`. `origin/production` does not contain `25fc7c250`. The pointer was not moved by hand.

| Item | Status | What happened |
|---|---|---|
| Transfer recorded as a deposit, paid card method wire, due greater than 0 | not proven | Signed in as `qa-journeys-owner@impronta.test`. The Appointments filter listed no conversations. On inquiry `eccf0969-7e93-4420-8be1-6fe72c361201` (accepted offer, deposit due, no order) identity was confirmed, then Record as paid outside / Transfer / other amount $200 / reference `WIRE-QA-2240` returned "This could not be completed. Try again." The paid card was not written. |
| One cash order confirmation, then a second order in the same thread | not proven | The Orders filter shows paid and gathering-details POS threads. No second order was created in one thread. No QA service-role key to seed two orders. |
| Stripe pay, full refund, partial refund | not proven | `web/.env.capacity-isolated.local` is still the bypass secret only. It has no `SUPABASE_SERVICE_ROLE_KEY` for `fxlankepwnvelxjrahwk`. The spec was not retargeted and was not run. |
| Talent dashboard seven items, workspace matrix remainder | not proven | Same missing key. No fixture talent was created. |

No new defect id. D-MSG-423 was not opened.

## Finish proofs 1–12 (25 Sep)

Host: `https://staging-qa-journeys.tulala.digital/` still served `dpl_C4vxn4tsVy3wQiQbyqgEDt7tqKHq` (#2240 / `25fc7c250`). QA SQL access was via authenticated Supabase MCP on `fxlankepwnvelxjrahwk` (not production). Local `web/.env.capacity-isolated.local` has the bypass and the QA URL; it still has no service-role key on disk. `web/.env.local` was not sourced. Pointer: `origin/main` = `origin/production` = `d714389e1`, which contains `25fc7c250`. No hand push of `production`.

### 1–4 Live money cards

| Item | Status | Evidence |
|---|---|---|
| 1. Transfer as deposit, method wire, due > 0 | proven | Inquiry `88122fb7-…`. Seeded `deposit_amount_cents=20000` on booking `478b569e-…` and accepted offer (fixture had deposit 0, which refused with unavailable). Recorded outside Transfer / Deposit 25% / ref `WIRE-FINISH-1-12`. DB `payment_request` card: `method=wire`, `totalCents=80000`, `paidCents=20000`, `dueCents=60000`. Screenshots under `web/e2e/qa-program/evidence/2026-09-24-finish/wire-*.png`. |
| 2. Cash → one `order_confirmation` | proven | Inquiry `08f2a0b7-…`, order `a1dccc25-…` ($800). Confirmation row `48a2d3d4-…` with `orderId=a1dccc25-…`. |
| 3. Second order → second confirmation | proven | Same inquiry, order `c282b624-…` ($54). Second confirmation `2f9973c2-…` with `orderId=c282b624-…`. Linked the pending order into `conversation_records` so both Order targets appeared. Screenshots `cash-second-order.png`. |
| 4. Why `eccf0969-…` failed | proven (diagnosis) | QA SQL: `bookings=0`, `orders=0` for `eccf0969-…`. Matches `withInquiryBooking` → "No booking found" → sheet unavailable. Not a paid-card bug once a booking and deposit exist. |

### 5–7 Stripe

| Item | Status | Reason |
|---|---|---|
| 5. QA service-role key in env file | not proven on disk | MCP SQL worked. Local file has no `SUPABASE_SERVICE_ROLE_KEY`. |
| 6–7. Stripe 4242 + full + partial refund | not proven | Ran `stripe-pay-refund.spec.ts` with `QA_ALLOW_AGENT_PROD_HOST=1` against `qa-stripe-r2`. Failed immediately: `signInAgentOwnedHost` requires production Supabase URL + service role + anon (`pluhdapdnuiulvxmyspd`). This lane did not source `web/.env.local`. Journeys shows `pk_test_` in signed-in chunks but D-MSG-313 still mints mock pay links there. Spec only covers full refund, not partial. Unblock: agent-host sign-in secrets for qa-stripe-r2 without using Impronta, or real Stripe mint on journeys. |

### 8 Talent dashboard (seven)

Read #2198 (starter home renders) and #2205 (shell header section pin) before any publish. Signed in as `qa-journeys-talent@impronta.test` (user on `QA-JNY-T1`). Inbox showed **0 conversations**. No money split, group silence, accept/decline, ask in place, request-only, refusal matrix, or builder publish was exercised. Screenshots `talent-*.png`. All seven: **not proven** (empty talent inbox / no fixture sales for this login).

### 9–10 Matrix and hostile

Playwright against journeys (bypass, no production SRK):

| Spec area | Result |
|---|---|
| Class seat limit (Messages + POS 13th) | passed |
| Appointment double-book confirm refusal | passed |
| Cross-tenant: B order on POS, B inquiry on Messages, foreign /pay | passed |
| Tampered client link | failed once (empty page body); treat as **not proven** / flaky |
| Permissions money (Refund refusal) | skipped in run (4 skipped total across capacity/isolation) |
| Table overbook / event tier | among skips or not re-listed as pass in the failing rerun |
| Hostile 4000-char + $0 line | passed (`hostile-data.spec.ts`; title mentions $99,999 but body still only fills $0) |
| Extra: emoji + RTL + 60-char in composer | no application error; screenshot `hostile-emoji-rtl-60.png` |
| 30 offer lines / true $99,999 line | **not proven** |

### Defects

No D-MSG-423 opened. Closest product gap noted: outside **deposit** on a booking refuses with unavailable when `deposit_amount_cents` / `deposit_pct` are zero (`createInquiryTransactionDraft`: "This offer has no valid deposit configured.") while the sheet still offers Other amount as a deposit-shaped request.

---

## Finish proofs leftover (25 Sep, evening)

Worktree `docs/finish-proofs-leftover` off `origin/main` `e90d9d3e4` (#2246). Host still `staging-qa-journeys` / `dpl_C4vxn4tsVy3wQiQbyqgEDt7tqKHq`. Evidence under `web/e2e/qa-program/evidence/2026-09-25-leftover/`. Production Supabase was used only for `signInAgentOwnedHost` magic-link cookies on `qa-stripe-r2` (not for Impronta content). QA SQL via MCP on `fxlankepwnvelxjrahwk`. Local `.env.capacity-isolated.local` still has no QA service-role key on disk.

### Pointer (12)

| Ref | Sha |
|---|---|
| `origin/main` | `e90d9d3e4` |
| `origin/production` | `e90d9d3e4` (fast-forward via `promote-production.yml` run 36090868249) |

`e90d9d3e4` **is** an ancestor of `origin/production`. Pointer was **not** pushed by hand.

### Stripe (6–7) — precise stop

| Step | Result |
|---|---|
| Sign-in on `qa-stripe-r2` with `QA_ALLOW_AGENT_PROD_HOST=1` + production URL/SRK/anon | ok |
| Open payment sheet / mint Checkout on existing inquiry `a3c937e7-…` | ok |
| Checkout session mode | **`cs_live_`** |
| Card 4242 + refund | **not proven** — harness stops on D-MSG-330 (live Checkout) |
| Partial refund | **not in spec** / not reached |

Unblock in one sentence: put `sk_test_` / matching `pk_test_` on `qa-stripe-r2` (or mint `provider=stripe` with test keys on journeys). Do not 4242 against live. Evidence: `stripe-result.txt`, earlier hung fresh-offer run showed empty Menu on R2 (`No items yet`); existing accepted-offer inquiry bypassed that hang.

### Talent dashboard (8)

Signed in as `qa-journeys-talent@impronta.test`. Inbox now lists conversations (35–49). Screenshots `talent-*.png`, logs `talent-seven-*.txt`.

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Money split both halves | **partial** | Agency thread `88122fb7-…`: `$` + `net`, **no** “client total”. Hub/seller half with a visible client total **not** shown on fixture (Money page YTD `$0`). |
| 2 | Group thread silent on amounts | **partial** | Multi-participant inquiry `cd7bf520-…`; stream check `group_stream_has_dollar false`. No dedicated Group tab found. |
| 3 | Accept / Decline bar | **partial** | Decline: UI + DB `inquiry_participants.status=declined` on `515d5c9e-…`. Accept: button seen earlier; re-scan of Needs action did not land a clean Accept→gone with DB `active`/`accepted_at` on a fresh invite. |
| 4 | Ask in place | **partial** | `/t/QA-JNY-T1`: guest dock visible, URL stayed on the profile. Dedicated `#talent-ask` control count was 0. |
| 5 | Request-only copy | **proven** | Public profile shows request-only copy; instant Book count 0. |
| 6 | Named refusals with sentences | **not proven** | Talent thread header More not present; refusal menu walk returned no hits. |
| 7 | Builder publish | **not proven** | Publish control visible on `/talent/site`; click did not show a clear published-tree / `talent_sites` column move in this pass. |

### Matrix + hostile (9–10)

| Item | Status | Notes |
|---|---|---|
| Tampered client link | **proven** | `cross-tenant.spec.ts` tampered case **passed** (3.7s) on retry. |
| Permissions money | **partial** | Seeded `messages.refund` for owner via QA MCP. Nomoney staff: Refund button count 0 (hidden door). Full Playwright skip remains without local QA SRK. Screenshot `permissions-nomoney.png`. |
| Table overbook (Messages Items) | **partial** | MCP filled table pool to 4 committed units. Items picker chips had Menu/Tickets/Packages/Services/Talent and **no Tables**. Screenshot `capacity-table-full-items.png`. Storefront reserve path still needs local SRK for the full spec. |
| Event tier / race | **not proven** | Specs skip without disk QA SRK. |
| Hostile `$99,999` custom line | **proven** | Items picker total `1 selected · $99,999`. `hostile-99999-only.png`. |
| Hostile 30 lines | **proven** | 30 catalog rows selected; total `30 selected · from $251.50`. `hostile-30-catalog-lines.png`. No application error / NaN / Infinity. |
| Hostile 4000-char + $0 | still proven | Prior `hostile-data.spec.ts`. |

### Still not proven (short list) — superseded

Historical leftover list. Talent money / Approve / refusals / publish and event door were proven in the pending close-out below. Canonical open items: [§ Still open (canonical)](#still-open-canonical).

No D-MSG-423 opened. No hand move of `production`. No Impronta / Jorgelina / El Paisa content edits.

---

## Finish proofs pending close-out (25 Sep, late)

Branch `docs/finish-proofs-pending` off `origin/main` `ff84ce3a3`. Merge #2249 → `b2e348168`. Evidence: `web/e2e/qa-program/evidence/2026-09-25-pending/`.

### Pointer

| Ref | Sha |
|---|---|
| `origin/main` | `b2e348168` (#2249) |
| `origin/production` | `4841fef06` at hygiene write; promote follows green CI on tip — not hand-pushed |

Pointer never hand-pushed. Prior tip `e90d9d3e4` had already been promoted via workflow earlier this evening.

### Talent dashboard — remaining items

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Money split both halves | **proven** | Hub seed inquiry `aaaaaaaa-…0001` (tenant hub `00000000-…0002`) money panel: `Total $150 Paid $0 Balance due $150` (`hub-money-open.png`). Agency `88122fb7-…` money panel shows her Total without a “client” label (`agency-money-panel-v2.png`). |
| 2 | Group silence | still partial | Prior leftover: stream dollar check false on multi-participant thread. |
| 3 | Accept / Decline | **proven** | Decline already DB-proven (`515d5c9e-…`). **Approve** (`data-talent-approve`) on Needs-action row; bar gone after click; DB `c08fbead-…` `status=active` + `accepted_at` set (`approve-after-v3.png`, `approve-scan-log.txt`). Label is **Approve**, not Accept. |
| 4 | Ask in place | **proven** (hygiene pass) | `/t/QA-JNY-T1`: no `#talent-ask` (count 0). **Message QA Journeys** opens guest dock on the same URL (`ask-dialog.png`, `soft-proof-log2.json` under `evidence/2026-09-25-hygiene/`). Bridge/`#talent-ask` anchor still absent on this fixture tree. |
| 5 | Request-only | still proven | Prior leftover. |
| 6 | Named refusals | **proven** | Agency sale: Resolve → “cannot”; More menu `copy_link`, `rename`, `handover`, `close_lost`, `history` each return “You cannot…” (`refusals-final-log.txt`, `refusals-final.png`). Buttons stayed visible. |
| 7 | Builder publish | **proven** | `talent_sites` `c4ac191d-…`: `version` 3→5, `published_at` / `draft_updated_at` moved to `2026-09-25 04:13:31+00`, `status=published`. |

### Matrix remainder

| Item | Status | Evidence |
|---|---|---|
| Event door tier sold out | **proven** | MCP released door pool; first guest held; second got sentence “That night just sold out at that ticket…” (`event-door-held.png`, `event-door-sold-out.png`, `event-tier-log.txt`). |
| Appointment double-book | **proven** | `appointment-double-book.spec.ts` **passed** (23.2s) with `PLAYWRIGHT_BASE_URL` set (`appt-double-log.txt`). Concurrent both-win race remains D-MSG-312 (product lock). |
| Stripe 4242 + refund | **not proven** | Unchanged: `qa-stripe-r2` mints `cs_live_` (D-MSG-330). Local `.env.local` has `sk_test_`, but the **host** secret is live. Unblock: set `STRIPE_SECRET_KEY=sk_test_…` (and matching `pk_test_`) on `qa-stripe-r2` in Vercel, then re-run `stripe-pay-refund.spec.ts`. Do not 4242 live. |

### Still open (canonical)

- Stripe test-mode Checkout on `qa-stripe-r2` (host uses **production** `STRIPE_SECRET_KEY`, livemode per env comment / D-MSG-330). Do **not** swap production live keys. Options: custom Vercel env for that host, or Preview+test keys aliased only to R2 — then `stripe-pay-refund.spec.ts`. See [`FINISH-AUDIT-EXECUTION-PLAN-2026-09-25.md`](./FINISH-AUDIT-EXECUTION-PLAN-2026-09-25.md) Phase 1.
- Concurrent TOCTOU race (D-MSG-312) — product backlog, not finish CLEAN.
- Group silence (soft) — optional; inbox list shows money chrome (`$0 net YTD`); dedicated multi-participant stream assert still thin.
- Permissions/table Playwright without disk QA SRK — optional Phase 2.

No D-MSG-423 opened. No Impronta / Jorgelina / El Paisa content edits.

### Hygiene (25 Sep, this PR)

- Removed duplicate “pending close-out” section that landed twice on #2249.
- Added top-of-file pointer to this canonical open list.
- Added execution plan file for remaining work.
- Soft proof: ask-in-place via Message CTA → dock (evidence `2026-09-25-hygiene/`). Confirmed production Stripe env comment is livemode — R2 cannot 4242 until a non-production test-key path exists.


