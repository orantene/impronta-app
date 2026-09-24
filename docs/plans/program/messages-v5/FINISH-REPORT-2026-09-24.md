# Finish report, 24 September 2026

Cited against `origin/main` `73294bd55` and this branch. Shared checkout was not the source.

---

## Task 1. Guest ask on a vanity host

**Not proven.** Assigned fixer owns `proxy.ts`. This lane did not open a branch on it.

A guest ask was already attempted on `book-jorgelina.tulala.digital` (authorised, services/pages/offerings/bookings untouched). POST `/` returned `forbidden`: `We couldn't identify your session. Please refresh and try again.` (`resolveGuestSessionId()` empty; `x-impronta-guest` is not set on the `talent_site` early return). `inquiry_messages` has no row for `QA-JORG-INQ-20260924-A`.

Inbox landing and the minted client-link origin are therefore **not proven**. No guest-session fix PR was open at the time of this write.

When that fix reaches `origin/production` (`git merge-base --is-ancestor <sha> origin/production`), send several asks and read the actual client URL. Do not infer it.

---

## Task 2. Talent dashboard on the QA project

All items **not proven** as watched working. No QA talent session was opened in this pass (no fixture login exercised here). Existing unit tests are not screenshots plus a live effect.

| Item | Status | Reason |
|---|---|---|
| Money split, both halves | not proven | `talent-pov.test.ts` asserts agency hides client total and hub can show it. Not watched on `fxlankepwnvelxjrahwk`. |
| Group thread silent on amounts | not proven | Not opened. Do not "fix" silence. |
| Accept and decline bar | not proven | No pending invitation was answered on the fixture. |
| Ask in place | not proven | Spec `ask-in-place.spec.ts` requires `QA_TALENT_SITE_URL`. Not run. Vanity guest session is also broken (Task 1). |
| Request-only copy | not proven | No request-capped surface was clicked. |
| Refusals with visible buttons | not proven | `not_her_sale` is unit-tested. Each named refusal sentence was not read on screen. Buttons were not hidden. |
| One real builder publish | not proven | #2198 / #2205 not re-run as a logged-in fixture publish. No `talent_sites` / `talent_pages` column movement recorded. |

---

## Task 3. Workspace matrix

**Not proven.** No `/get-started` fixture business was created in this pass. Capacity, race, permissions, isolation, token, reload, restaurant-vs-services vocabulary, and hostile data were not watched.

---

## Task 4. Stripe

**Stopped, correctly.** Production is live mode (D-MSG-418). No card was used.

Unblock: put a `pk_test_` (and matching secret) on an environment this lane can reach, most sensibly the journeys preview host.

---

## Task 5. D-MSG-421

**Fixed on this branch, not shipped.** Vanity `renderTalentMaxSite` now loads public offerings with tenant null, then `loadUsdRatesForSitePrices`, and passes `usdRates` into the freeform tree. `menu_board` prints `data-usd-equivalent` when rates exist and prints nothing when they do not.

Revert-proof:

- Static test on `render-max-site.tsx`: rename `loadUsdRatesForSitePrices` → fail; restore → 5 pass.
- `native-data-blocks.test.ts` MXN + rates: drop `usdRates` → fail (`data-usd-equivalent` missing); restore → pass.

**Still not on her live authored menu.** Frozen builder copy is not `talent_offerings`. Until a live catalog widget is on that page, `book-jorgelina.tulala.digital` will still show `$700` with no ≈ US$ line even after this ships. That is the frozen-copy gap, not a missed `loadUsdRates` call.

Shipped only after merge sha is an ancestor of `origin/production`.

---

## Pointer

At write time `origin/main` was `73294bd55` (#2220) and `origin/production` was `5b6613d6e` (#2221). Main is ahead. A cancelled structural gate must be re-run on that commit; do not move the pointer by hand.
