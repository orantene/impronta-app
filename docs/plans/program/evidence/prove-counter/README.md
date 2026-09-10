# prove-counter: a cashier takes money at the counter, end to end

**Journey.** Sign in as the fixture owner, enter the point of sale from the top
bar's own Workspace/Counter switch, open a shift, sell two different items,
take cash with a tender larger than the total, reach the paid screen, and open
the receipt by its public code. Then meet the three refusals a real shift
produces, each as a sentence rather than a dead end.

**Spec.** `web/e2e/cases/POS-counter-cash-sale.spec.ts` (extended in place; the
file already existed and its original test is the baseline in
`qa-baseline.txt`).

**Branch.** `work/prove-counter` off `program/journeys-2026-09`
(`deca2efc86b3382baed31103f069e3de1b60c8a0`). The proving commit is the head of
this branch that carries this README.

**Database.** Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`) for every
run recorded here, including the local ones. Production (`pluhdapdnuiulvxmyspd`)
was never written to and `npm run db:push` was never run.

Two runs of this work happened: the first was cut off mid-run (sections 1, 2
and the defect in section 3 are its findings, kept as it left them); the second
continued from its worktree and finished the proof (sections 4 onward).

---

## 1. The platform switch, and how it was turned on

The point of sale is behind `platform_settings.workspace_pos_enabled`, one row
for the whole product, shipping `false` (`lib/platform/workspace-ui.ts` says so
in its own words: "the counter ships dark").

**The application exposes no control for it.** `writePlatformWorkspaceUi` takes
`Omit<PlatformWorkspaceUi, "posEnabled">` and the super-admin settings card at
`/platform/admin/settings` knows only the other four switches. There was no
screen to click, so it was written directly with SQL, on the isolated QA
database only. See `sql/01-platform-switch.sql`. **This is a product finding in
its own right: nobody can turn the counter on without a database client.**

It gates the DOOR, not the route: `/admin/pos` stays reachable by address with
the switch off (the route's own comment explains why), which is exactly why
this journey enters through the switch instead of typing the address.

## 2. Fixture data, and which path created it

The fixture workspace had one priced workspace item (`House pizza`, $18.00) and
no item that demands a buyer's name. Both gaps were filled **through the
application's own screen**, `/admin/catalog` (the workspace Menu page, which
mounts `TalentOfferingsManager` with `owner: { kind: "workspace" }`), in a real
browser signed in as the fixture owner. Nothing was inserted.

| Item | Price | How | Why the journey needs it |
|---|---|---|---|
| `Garlic bread` | $6.50 | Menu, + Add a menu item, title + Fixed price, Save | a SECOND price, so the sale's total is a sum of two different items and not one price times a quantity |
| `QA gala ticket` | $12.00 | same, plus **Direct booking** and **"Needs the buyer's name (email or phone), whatever it costs"** (reason: attendee names) | the only thing that makes `startCollection` refuse an unnamed buyer |

Read back in `sql/02-fixture-catalog.sql`. Screenshots of the creation:
`screenshots/seed-menu-garlic-bread.png`, `screenshots/seed-menu-gala-ticket.png`.

## 3. The defect: entering from the switch kept the workspace sidebar

`screenshots/defect-switch-entry-keeps-sidebar.png` (first run) and
`traces/qa-host-defect-switch-keeps-sidebar.trace.zip` +
`runs/qa-host-run-defect-reproduced.txt` (second run, on the deployed host,
2026-09-10 15:32 UTC): after pressing **Counter** in the top bar, the counter
rendered INSIDE the admin rail, at reduced width, with **Workspace** still the
pressed half of its own switch. `screenshots/url-entry-chromeless.png` shows
the same address typed into the bar rendering full width, which is why every
static guard was green: they measured the hard load.

**Cause.** `WorkspaceShell` drops the sidebar when `state.page` resolves to a
destination with `chrome: "pos"`, and deliberately does not read the live
pathname. On a hard load the admin layout seeds `state.page` from the request
path. On a soft navigation the layout does not re-run, and the switch is a
soft navigation (`router.push`), so the shell kept `page: "overview"`. Every
other admin route mounts a `<PageRouteSyncer>` for exactly this; `/admin/pos`
is a canonical route and never got one.

**Fix (in this commit).** `web/src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx`
mounts `<PageRouteSyncer page="pos" />` on every return arm (the counter, the
counter-off notice, the no-usable-mode gate, the mode-not-built notice), so
every way in lands in the same chrome. `web/src/lib/pos/pos-page-wire.static.test.ts`
gained a test that counts JSX returns against syncers so a new arm cannot land
in the wrong chrome again. Proven in a browser: `screenshots/fixed-switch-entry-full-width.png`
(no rail, Counter pressed, the POS's own Sell/Orders/Shifts rail on the left).

## 4. Where the journey was proven, and why not on the deployed host

The deployed QA host `staging-qa-journeys.tulala.digital` answered 200 with the
bypass header throughout (`x-vercel-id: cle1::iad1::...`). But it serves
**`d51227f591a719bcc3925ff4d9bce389c1083123`, 17 commits behind the branch tip**
this work is based on. The tip, `deca2efc8`, has failed to build on Vercel
three times (`dpl_GwGHktUW29MRvrFYPzfTbVkjqQ3a`, `dpl_2Vot2V7RvvFN8AKy6PCWykP2WpcK`,
`dpl_3h1NdTujVMzdCvCzDCw15fiPN2SJ`), each with `errorCode: BUILD_EXCEEDED_MAXIMUM_TIME`
after `Creating an optimized production build ...` (Vercel's build runs with
`cpus: 1`). So the host is not "this branch"; it is the last commit of it that
built. This is a finding for whoever owns the branch: **`program/journeys-2026-09`
cannot deploy at its tip.** Nothing in this slice can fix a build timeout, and
this work may not push.

The deployed host was still used for two things it can prove: the defect in
section 3 reproduces there (`runs/qa-host-run-defect-reproduced.txt`), and the
original baseline test passed there (`qa-baseline.txt`).

**The journey itself was proven on a local server of THIS branch, with the fix,
against the SAME QA database:**

- `npm run dev` on port 3110 in the worktree, with `.env.capacity-isolated.local`
  exported (`NEXT_PUBLIC_SUPABASE_URL` = `fxlankepwnvelxjrahwk`) and
  `TULALA_ALLOW_DEV_SURFACES=1`, behind `scripts/local-host-proxy.mjs 3111
  qa-journeys.local 3110` so the app sees the tenant host shape the deployed
  host has (`/admin`, `/r/<code>` on a tenant host) and the browser stays on
  `http://localhost:3111`. `qa-journeys.local` is a registered host on the QA
  database already (`agency_domains`, non-primary); the `qa-journeys.localhost`
  row the first run added (`sql/03-local-branded-host.sql`) was not needed and
  was left in place.
- Run command:
  `PLAYWRIGHT_BASE_URL=http://localhost:3111 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 npx playwright test e2e/cases/POS-counter-cash-sale.spec.ts --project=chromium --workers=1 --reporter=line --trace=on`
- Same real browser, same sign-in path (`/api/dev/signin` for the fixture
  owner), same database. The only thing that differs from the deployed host is
  which build of the branch is answering.

One trap on the way: the first run had left a production `.next` (built 08:07)
in the worktree, and under `next dev` that stale build made EVERY API route
answer 404, including `/api/dev/signin` and `/api/health`. Moving `.next` aside
fixed it. Nothing in the product was involved.

## 5. What was proven (run 4, 2026-09-10 15:22 to 15:25 UTC, 4 of 4 green)

`runs/local-run4-all-four.txt` ends `4 passed (3.2m)`, `EXIT=0`. Trace of the
full sale: `traces/run4-journey-shift-two-items-cash-receipt.trace.zip`.

| Step | Watched in the browser | The database agrees |
|---|---|---|
| Sign in, land on `/admin`, workspace identity asserted | trace | |
| Enter from the top bar switch: URL becomes `/admin/pos?mode=counter`, `[data-tulala-app-sidebar]` count 0, `[data-tulala-pos-chrome]` count 1, Counter rail visible | `screenshots/fixed-switch-entry-full-width.png` | |
| Close the shift the previous run left open (counted 100.00), open this run's own with a 100.00 float | trace | `sql/05-shifts.sql`: `796ee710` closed 15:22:23, `a0df8241` opened 15:22:42 |
| Start a new sale; add House pizza; + on the basket line (two units, $36.00); add Garlic bread; Charge reads $42.50 | trace | `sql/04-journey-rows.sql`: order `3b6ed989`, two lines, 2 x 1800 + 650 = 4250 |
| Collect sheet: Cash tab, keypad 5-0-0-0, $50.00 tendered, Confirm cash | trace | money row `paid`, gross 4250, `paid_via: cash`, `tendered_cents: 5000` |
| Paid screen: Amount collected $42.50, Change given $7.50 | `screenshots/paid-screen-42-50-change-7-50.png` | `change_cents: 750`; `shift_id` = `a0df8241`, the shift this run opened (asserted in the spec: opened after the test began, float 10000) |
| Receipt link is absolute, on the workspace's host, `/r/<code>`; opened in a context with NO cookies: 200, no not-found heading, shows $42.50 | `screenshots/receipt-anonymous-r-code.png` | `receipt_code = rej1c4dqt4gnup3ue5gq` is in the href |
| Order is `paid`, `source_channel = pos`, tenant is the fixture, exactly ONE paid money row | spec assertions | `sql/04-journey-rows.sql` |

### The three refusals (run 4 first; run 5 and 6 after the sentences were reworded, see section 6)

Each is driven from the interface, never injected. "Someone else" is a second
tab holding the same sale, which is what the refusals actually turn on: they
are decided by the order's state and version under a row lock, not by who is
charging. The fixture has one member who may take money; the other is a
viewer whom the mode vocabulary correctly gives no POS at all.

| Refusal | Driven how | Sentence seen (EN) | Database |
|---|---|---|---|
| A sale someone else already collected against | till 1 opens a sale with a pizza; till 2 opens the same order and takes $18 cash first; till 1 then charges | "This sale is no longer open. Someone may already have collected it. Reload to see where it stands." with a **Reload** button inside the banner | order `b6b18505`: ONE paid row, gross 1800. `screenshots/refusal-1-already-collected.png` |
| A sale changed underneath the operator | till 2 adds Garlic bread to till 1's sale (version 2 to 3); till 1, still showing $18.00, charges | "This sale changed while you had it open. Reload it to see the latest before charging." with **Reload** | order `3529f14c`: still `draft`, total 2450, NO money row. `screenshots/refusal-2-changed-underneath.png` |
| An item that needs a name, sold without one | QA gala ticket, Charge, Confirm cash with nothing typed | "This item needs the customer's name before it can be sold." (no action: the fix is typing the name, which is right there) | nothing taken. Then **Back to the sale**, email typed in `#pos-buyer-email`, Confirm cash: **Paid**. Order `0768d19d` paid 1200, `customer_id` = `ccd3b6cb`, whose email is the one typed (`sql/06-named-buyer.sql`). `screenshots/refusal-3-needs-name.png`, `screenshots/refusal-3-recovered-paid.png` |

`screenshots/refusal-sentences-strip.png` shows all three banners as rendered.
The spec asserts on every one that the engine's own words (`not_draft`,
`no_contact`, `conflict`, `already_collected`, ...) are absent from the
banner, and that it carries `role="alert"`.

## 6. What failed on the way, and what was fixed in the application

1. **The sidebar defect** (section 3). Fixed at its cause in the route, with a
   static test that guards every return arm.
2. **Two refusal sentences did not say what the counter does.**
   `saleReloading` read "This sale changed while you had it open. Reloading
   now." while nothing reloads until the operator presses the Reload button
   beside it: a promise the interface does not keep. `bookingChanged`, the
   sentence for `not_draft` / `already_collected` / `not_open` / `not_found`,
   read "This booking changed since you opened it.", which calls a counter
   sale a booking and hides the one thing a cashier must hear, that the money
   may already have been taken. Both reworded in `messages/{en,es,fr}.json`
   to name the sale, say what may have happened and say what to do. Watched
   again in runs 5 and 6 (`runs/local-run5-refusals-reworded.txt`,
   `runs/local-run6-refusal-3-after-signin-flake.txt`).
3. **The refusal banner had no hook of its own.** The first run's spec looked
   for "the first `role=alert` on the page", and the shell has other, empty
   live regions, so it read "" and reported a working refusal as missing.
   `PosRefusalBanner` now carries `data-pos-refusal="<reason>"` (same
   convention as `data-pos-receipt-link`) and the spec finds it by that while
   still asserting the alert role.
4. **The shift step was inherited, not performed.** The first run's helper used
   whichever shift was already open. The helper now closes an inherited shift
   through the Shifts screen and opens its own, and the spec asserts the
   money row's `shift_id` names a shift opened after the test began.

Not product, but worth knowing for the next run on this machine:

- Under machine load 12 or more the dev server's authenticated `/admin/pos`
  render took 18 s and the basket's 20 s expectation expired once
  (`runs/local-run2-journey-pass-refusal-timeout-under-load.txt`). The line
  HAD been written: the order read back with the pizza on it at version 2
  while the screen was still waiting for its refresh. Re-run at load 3 was
  clean. Timeouts were not raised.
- One dev sign-in answered 401 "Email link is invalid or has expired" after
  many sign-ins of the same fixture in a few minutes (`runs/local-run5-refusals-reworded.txt`);
  a minute later it signed in. That is the auth provider's OTP handling, not
  the counter.

## 7. What is not proven

- **Not proven on the deployed host.** The journey and the fix ran against a
  local build of this branch on the QA database, not against
  `staging-qa-journeys.tulala.digital`, because that host serves a commit 17
  behind the branch tip and the tip does not build on Vercel (section 4). The
  defect IS reproduced on the deployed host. Once `program/journeys-2026-09`
  builds again and carries this commit, the same command in section 4 with
  `PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital` is the
  proof to re-run.
- **Two logins were not used** for the refusals; two tabs of the one member
  who may take money were. The refusals are decided by the order row, so the
  result would not differ, but "another cashier's login" as such was not
  watched.
- **Card, payment link and pass credit** were not collected; only cash. The
  spec asserts the Card tab exists and reads its reader status, nothing more.
- **Print receipt / Email receipt** buttons on the paid screen were not
  pressed.
- **The three languages** were proven as strings in the catalogue
  (`messages/{en,es,fr}.json` carry all three refusal sentences plus the
  Reload label); only the English rendering was watched in a browser.
- **The receipt page's copy** calls a pizza and a garlic bread "Your tickets"
  and says "we will find you by name at the door"
  (`screenshots/receipt-anonymous-r-code.png`). The receipt resolves and shows
  the right lines and total, which is what was being proven; the wording is a
  defect in `/r/[code]`, outside this slice, recorded and not fixed here.
- **The platform switch** still has no control in the product (section 1).
