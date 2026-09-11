# cd-scan: the customer display (D01–D08) and the scanner (C23, C24 / POS-2.8), 2026-09-11

Branch `work/cd-scan` off `program/journeys-2026-09` at `867e0ecc2`. Two
things the design package had and the code did not, both completing the
Counter loop; neither is a new mode.

- **Customer display** at `/admin/pos/display`, behind the counter's own
  `booking.payment.request` capability and the counter's own on/off switch.
  Opened from the counter's rail ("Customer display", opens a new window).
  Follows the cashier's sale by polling the counter's own reader
  (`loadPosSale`) every 2 s; idle → review → confirm → waiting → declined /
  paid → receipt contact → sent → cleared.
- **Scanner** on the counter's Sell screen: a document-level keyboard-wedge
  listener, the "Scanner ready" chip, `posResolveScanCode` (an offering id,
  or a QR & Links code whose row names the offering), the item added through
  `posAddLine`, and one toast per scan.

Database: Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`) throughout.
Production was never read from or written to. No migration.

## Where it was proven, honestly

**Not on the deployed QA host.** `staging-qa-journeys.tulala.digital` answered
200 with the bypass header and its `sentry-release` marker read
`867e0ecc2582990c2054aceb63ba55910f4f18c7`, the branch base: it does not carry
this work, and this work is not pushed. The journeys ran on a **local dev
server of THIS worktree against the same QA database**, the way `prove-counter`,
`pos-door` and `pos-classes` did:

- `npm run dev` on `:3150` with `.env.capacity-isolated.local` exported,
  `TULALA_ALLOW_DEV_SURFACES=1` and a `GUEST_COOKIE_SECRET` generated for the
  run, behind `scripts/local-host-proxy.mjs 3151 qa-journeys.local 3150`.
  Dev-server lease granted for this worktree and revoked at the end.
- **Not a production build.** The brief asked for `npm run build && next start`.
  At run time the machine had 1.3 GB of swap free and 60 MB of free RAM with
  the CPU governor in memory-tight mode; a `next build` with its 5 GB heap on
  top of that was judged likelier to stall every session on the machine than
  to finish. The dev server compiles the same source against the same rows.
  What is NOT proven: that the Vercel build of this commit behaves the same.
- `PLAYWRIGHT_BASE_URL=http://localhost:3151 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 npx playwright test e2e/cases/<spec> --project=chromium --workers=1 --reporter=line --trace=on`
- Same real browser, same fixture sign-in (`/api/dev/signin` as the fixture
  owner), same rows.

## Customer display: what a person clicks, and what was watched

Spec `web/e2e/cases/pos-customer-display.spec.ts`. Final run
`runs/cd-scan-pw-display-run4.log`: **1 passed (2.2 min), EXIT=0**. Trace
`traces/customer-display-run4.trace.zip`.

| Step | Click | Watched | Rows (`sql/02-rows-after-runs.json`) |
|---|---|---|---|
| Open the display | Counter rail → **Customer display** (`target=_blank`) | new window at `/admin/pos/display` | |
| D01 idle | nothing | "Welcome to QA Journeys (48-case fixture)" · "Your order will appear here" — `screenshots/cd-01-idle.png` | |
| D02 review | cashier: **Start a new sale**, tap **House pizza** (other window) | within a few polls: the line, **To pay today $18.00**, the tips-not-offered sentence, no 10/15/20% controls — `cd-02-review.png` | order `f52cc410` draft, `total_cents 1800`, tenant = fixture |
| D04 confirm | display: **Looks right** | "Ready to pay · $18.00" — `cd-04-confirm.png`; **Back** returns to D02 | nothing written (the confirm is local: there is no tip to write) |
| D07 paid | cashier: **Charge · $18.00**, **Confirm cash** | display turns into "Thank you · $18.00 paid · cash"; **Text me** disabled with its sentence — `cd-07-paid.png` | order `paid`; money row `paid`, gross 1800, `paid_via: cash`, tendered 1800 |
| D08 refusal | display: **Email me**, type `foo@bar`, **Send** | `role=alert` "That does not look like an email address. Check it and try again." (the SERVER's zod refusal; the browser accepts `foo@bar`) — `cd-08-contact-refused.png` | nothing written |
| D08 sent | type `qa-display-1789095496596@impronta.test`, **Send** | "Receipt sent · We saved qa-display-…@impronta.test, but this workspace cannot send email yet. Ask the team for a printed receipt." — `cd-08-sent.png`. This server has NO `RESEND_API_KEY` (the dev log says "skipping email"), so `sendEmailResult` answered `skipped` and the screen said so rather than "sent": the honest branch of D-POS-12, watched | `customers` row `536454d2` with that email on the fixture tenant; `orders.customer_id` = that row (the sale had no customer before) |
| cleared | nothing, 8 s | back to D01 and STAYS there 5 s later although the counter's beacon still names the paid sale — `cd-09-cleared.png` | |

Runs 1 to 3 (`runs/`): run 1 timed out on the cold compile of `/admin/pos`
(5 min under load 12); run 2 reached D08 and the refusal rendered 1.5 s after
a 30 s wait expired (the action took 7.9 s inside a 31 s POST under load;
wait raised to 60 s, nothing in the product changed); run 3 lost the counter's
own **Start a new sale** to a 31 s POST. All three are load, not product.

## Scanner: what a person does, and what was watched

Spec `web/e2e/cases/pos-scanner.spec.ts`. Final run
`runs/cd-scan-pw-scanner-run5.log`: **1 passed (44.5 s), EXIT=0**. Trace
`traces/scanner-run5.trace.zip`.

The spec's own fixture: one `links` row on the QA workspace (code
`qa-scan-<ts>`, `kind: menu`, `context.offering_id` = House pizza), inserted
before and deleted after (`scan_link_after_cleanup: []`). The scan is what is
proven; nothing about the scan is seeded.

| Step | Watched | Rows |
|---|---|---|
| C23 | **Scanner ready** chip on the Sell screen — `screenshots/scan-01-ready.png` | |
| C24, link code, no sale open | keys typed at once + Enter → toast **Added House pizza**, the URL gains `order=`, Charge reads $18.00 — `scan-02-added-link-code.png` | order `882b3d28` draft, one line, offering = pizza, 1800 |
| offering id (bare UUID) | toast **Added House pizza**, Charge $36.00 | total 3600, two lines |
| unknown code `go-check-zzzz` | toast **Nothing matches go-check-zzzz**, no `no_match` word; no drawer opened, URL unchanged — `scan-03-no-match.png` | total still 3600 |
| the same code typed at 150 ms per key | no toast | total still 3600 |
| the same code typed with the search box focused | it lands in the search box, no toast | total still 3600 |
| the toast | clears itself; Dismiss works while it is up | |

## What the journey found in the application, and what changed

1. **The workspace shell's single-key shortcuts fired on scanned characters.**
   Run 3 (`traces/scanner-run3-drawer-defect.trace.zip`,
   `runs/cd-scan-pw-scanner-run3.log`): scanning a code containing `c` opened
   the **New inquiry** drawer over the register (the toast's Dismiss was then
   "intercepted by `aside[aria-label=New inquiry]`"). `g` then `o` would have
   navigated the cashier to Overview mid-scan. Fixed in
   `WorkspaceShell.tsx`: `useKeyboardLayer` is suppressed while the shell is
   in point-of-sale chrome (`resolveDestination(state.page)?.chrome === "pos"`).
   `Cmd/Ctrl-K` is unaffected (a scanner sends no modifier). The spec's unknown
   code is now `go-check-zzzz` and asserts no drawer opens and the URL holds.
2. **`text-foreground` is muddy grey on every tenant host.** Under the tenant
   override on workspace routes `--foreground` maps to the NEUTRAL token
   (#737373; `globals.css` documents this above `.site-hero__headline`). The
   first display screenshots (run 2) were grey on white; the display now uses
   the pinned admin ink tokens. **The counter's own components carry the same
   defect** (`Basket`, `SellSurface`, the primary action: see the grey
   "Charge · $18.00" in `scan-02-added-link-code.png`). Not changed here; it is
   the counter owner's, and it is reported.
3. **Two new action refusals had to be given banner sentences.** The guard in
   `refusal-reason.test.ts` reads every `reason: "<word>"` in `pos/actions.ts`
   and reddened on `no_match`, `not_paid` and `send_failed`. They now map to
   `scanNoMatch`, `receiptNotPaid`, `receiptNotSent`, three languages each,
   even though the display and the toast render their own sentences: a caller
   that funnels them through the banner gets a sentence, never a word.
4. Two `react-hooks/refs` lint errors (ref written during render) in the
   listener and the display client; both now sync in an effect.

## Decisions recorded (`docs/plans/program/pos/decisions.md`)

- **D-POS-11** tips are not offered: no tip line exists in the engine; a
  sentence in three languages, no control, no second totals rule.
- **D-POS-12** receipt by text is not offered (no customer SMS sender);
  receipt by email = `ensureCustomer` attach (only when the sale has no
  customer) + the existing order-confirmation email; `skipped` is told as
  skipped, never as sent; refused unless the order is paid.
- **D-POS-13** a scanned code is an offering id or a QR & Links code; there is
  no barcode column (adding one is the honest next step, not taken here).
- **D-POS-14** the display follows the same-device `localStorage` beacon the
  counter writes, else the workspace's newest open draft; a registers table
  would replace the beacon without changing the state machine.

## Not proven

- **The deployed host.** See above. The same commands with
  `PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital` are the
  proof to re-run once the branch carries this commit.
- **D05 waiting and D06 declined** need a card attempt; this environment has
  no reader and no Stripe keys. Both are covered by `lib/pos/display-model.test.ts`
  (pure model), not by a browser.
- **A display on a second device** (no beacon; follows the newest open draft)
  was not watched; the rule is `nextFollowedOrder`, unit-tested.
- **A `sent` email** was not watched: this server has no `RESEND_API_KEY`, so
  the run exercised the `skipped` branch (above). A provider send, and the
  order-confirmation email as delivered, are unproven here; the `sent`
  sentence is rendered by the render test only.
- **Three languages** are proven as strings in the catalogue and by the
  render tests over `es`/`fr`; the browser runs were in English.
- **A real wedge scanner** was not used; Playwright's zero-delay `keyboard.type`
  is the same keystroke stream as far as the page can tell.

## Rows left on the fixture workspace (declared)

Paid order `f52cc410` ($18, cash) and customer `536454d2`; draft orders from
the scanner runs (`882b3d28` at $36, plus the drafts of runs 1 to 4). None
were removed: they are the evidence.

## Gates (final, on the private lane, after the last edit)

| Command | Exit |
|---|---|
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.cd-scan.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.cd-scan.tickets npm run typecheck` | 0 (`/tmp/tulala-tsc.04a3b645.last`, this worktree's key) |
| `npm run lint` | 0 (after the two ref fixes; first run 1) |
| `npm run test:money` | 0, 1013 pass (after the refusal map; first run 1 fail = finding 3) |
| `npm run test:design-system` | 0, 96 pass |
| `npm run test:tenant-isolation` | 0, 609 pass |
| `npm run test:size-ratchet` | 0, 173 pass |
| `node scripts/check-server-actions.mjs` / `check-ui-messages.mjs` / `check-untracked-imports.mjs` | 0 / 0 / 0 |
| `npx playwright test e2e/cases/pos-customer-display.spec.ts …` runs 1, 2, 3 / run 4 | 1, 1, 1 / **0** |
| `npx playwright test e2e/cases/pos-scanner.spec.ts …` runs 1, 2, 3, 4 / run 5 | 1, 1, 1, 1 / **0** |

## Package 1 (2026-09-11, wire-pos-money): D02 / D03 tips are live

D-POS-11 is closed by D-POS-75. The review screen's right half is the tip
chooser (`CustomerDisplayTip`: 10% · 15% · 20% of the services with the
figure under each, `Other`, `No tip`); `Other` is the custom-amount screen
with the keypad and `Total would be`. The tap is `posSetTip`
(`orders.tip_cents`, never a line); the sale's own figure comes back on the
next poll, the counter on the same device re-reads through the
`saleChanged` storage beacon, and `pos-customer-display.spec.ts` asserts
`tip_cents` and the line count. Frames: `screenshots/package1/CDReview.*`,
`CDCustomTip.*`, `CDReview-tip-added.live.png` (1194x834, the boards'
viewport; the display's own layout is the earlier one-column card with the
chooser beside it, not the boards' split panes).
