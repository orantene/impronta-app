# host-sell: the Sell-rail admin surfaces, built but never walked, on the deployed QA host

Proved by agent `host-b`, 2026-09-11, against `https://staging-qa-journeys.tulala.digital`
(Vercel deployment `tulala-5e3o227vw`), confirmed serving commit `867e0ecc2`
(`sentry-release=867e0ecc2582990c2054aceb63ba55910f4f18c7` — same check as
`docs/plans/program/evidence/host-classes/README.md`). Database: Supabase
branch `fxlankepwnvelxjrahwk` (qa-journeys). Production `pluhdapdnuiulvxmyspd`
was never read from or written to; no migration; `npm run db:push` was never
run.

## Why a new spec

No existing spec under `web/e2e/` opens `/admin/catalog`, `/admin/events`,
`/admin/spaces` and `/admin/discounts` as one journey, or creates and reads
back a discount code. Searched: `admin/catalog`, `admin/events`,
`admin/spaces`, `admin/discounts`, `catalog`, `discount`, `spaces`, `events`
across `e2e/*.ts`, `e2e/cases/*.ts`, `e2e/journeys/*.ts`. `C12-event-venue.spec.ts`
covers Events partially (used separately for `host-events-presale`);
`VENUE-*` specs cover the floor from the staff side but not `/admin/spaces`
itself; nothing touches `/admin/catalog` or `/admin/discounts` at all. A new
spec was authored: `e2e/cases/SELL-catalog-events-spaces-discounts.spec.ts`.

## What it proves

One staff session opens the four Sell-rail pages in turn and finds the
fixture's own real rows on each — no seeded-for-this-spec data:

1. `/admin/catalog` → the fixture's "House pizza" offering (the same item
   proven on the public storefront and POS by `C06-restaurant.spec.ts` and
   `C07-bar.spec.ts`) is visible on the workspace catalogue.
2. `/admin/events` → the fixture's "QA Night" event (the same event
   `C12-event-venue.spec.ts` and `host-events-presale` sell tickets against)
   is visible on the list.
3. `/admin/spaces` → redirects to `/admin/tables` (the real floor page;
   Spaces is the registry's canonical segment for the built floor, per its
   own source comment) and table T2 is visible — the same table
   `VENUE-join-and-refusal.spec.ts` and `VENUE-table-service.spec.ts` seat
   parties at.
4. `/admin/discounts` → a promo code is created through the real form
   (`createTenantPromo`, 15% off), confirmed with the page's own "saved"
   status, then read back TWICE: the page reloaded and the code found in its
   table (the real server read via `tenant_promo_codes`, not the optimistic
   client state the submit already showed), and a direct query against
   `tenant_promo_codes` on the isolated database.

## Run 1 (a spec bug, fixed before the proof stood)

Run 1 failed immediately on the Discounts step: `page.getByLabel("Code")`
was a strict-mode violation — it matched not only the form's `<input
name="code">` but also two sidebar nav buttons whose accessible names
contain "Code" ("Discounts — Promo codes this workspace owns" and "Website —
… tracking, SEO, domain" happens to contain "code" via a different string).
This was a bug in the newly-authored spec, not the application. Fixed by
scoping to the form and its named inputs
(`form.locator('input[name="code"]')` etc.) instead of `getByLabel`. Run 2
passed clean.

## Command and exit code

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital \
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
npx playwright test e2e/cases/SELL-catalog-events-spaces-discounts.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
Run 1: exit 1 (spec locator bug, see above; `run1.log`). Run 2 (after the
fix): exit 0 — **1 passed (19.9s)** (`run2.log`).

## Evidence

Screenshots (`screenshots/`, 5 files): `01-catalog.png`, `02-events.png`,
`03-spaces.png`, `04-discounts-before.png` (empty form, existing codes
table), `05-discounts-after.png` (the new code visible in the table after a
reload).

SQL ground truth (`sql-after-journey.json`, service role, never printed):
`tenant_promo_codes` row `3b961dcc-97a3-4685-b478-7fb22836e0ca`,
`code SELL-1789094086259`, `kind percent`, `value 15`, `is_active true`,
`tenant_id` the fixture tenant — matching what the page showed after reload.

## Difference between local and host

None found in the application. The one failure was a bug in the new spec
(an ambiguous locator), fixed in the test, not the application.

## Fixture state left behind

One `tenant_promo_codes` row (`SELL-<stamp>`, active, 15% off, never
redeemed). Nothing was deleted.

## Not done, and known

- Only one row per page was checked as "the fixture's own real row"; this is
  not an exhaustive audit of every catalogue item, event or table.
- Card/Kind toggling (turning the new code off) was not exercised — the spec
  proves creation and read-back, not the full lifecycle.
- Spanish/French Sell-rail screens were not opened in a browser.
