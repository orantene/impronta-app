# QA — Events & Ticketing

New rows go here. Rows already in [`../phase-boundary-qa.md`](../phase-boundary-qa.md) stay valid
and were deliberately not moved — see [README](README.md).

## Corrections to rows on the shared list

Verified against `production` (`f4cec4988`) on 2026-09-05, not against a working tree. Recorded here
rather than edited in place, because that file is conflicted on an open PR.

### The six E8 rows are NOT executable — they are not marked blocked, and should be

Every E8 row opens with **"Buy a ticket"**. There is no way to buy one.
`web/src/app/(public)/events/[slug]/page.tsx` says so in its own header:

> NO PURCHASE PATH YET, deliberately. This page shows what is on, when doors are, and what the
> tiers cost. Buying needs the ticket picker block, guest checkout and the receipt

`/events` and `/events/<slug>` are live, correct, and honestly a price list. But E5b and E6 are
marked `NOT EXECUTABLE` for this same missing piece and the E8 rows are not. **That is the expensive
direction of the error**: a blocked row costs nothing, and this one would have sent the owner to a
real iPhone — the one step nobody can do on his behalf — to buy something unbuyable.

**Open question, owner: Events & Ticketing.** Can a cash sale at the door mint an admission with no
order behind it? If yes, that row is the bootstrap for the whole E8 block and must run first,
because it is then the only thing that produces a scannable code. If no, E8 is blocked entire.
Searching found `mint-on-paid.ts` (needs a paid order) plus session and reservation doors, and no
cash path outside a test file — but that is a grep, and a grep is not a specification.

**Answered 2026-09-05 (Events & Ticketing): YES, as of #1750 (`6918aa09b`).** The schema always allowed it
(anchor rule: `session_id` set, `order_line_id` null) and nothing wrote it until E8b. `sellAtDoor` on the
door screen reserves one unit on the tier's pool for that session, commits, inserts the admission with
`door_amount_cents` + `door_paid_via`, and checks it in under the same lock. **So the door sale is the
bootstrap row for the whole E8 block and runs first**; the six "Buy a ticket" rows stay blocked until
the ticket picker + guest checkout exist. Money: recorded on the admission as what was actually taken;
no order, no charge, no commission; the night report sums it by method.

### E2 is marked blocked and is NOT

E2 reads *"NOT EXECUTABLE UNTIL THE RAIL SLOT LANDS (no `events` segment exists in `WorkspacePage`
or `WORKSPACE_PAGE_SEGMENTS`)"*. In production:

```
"events",  // Events & Ticketing — SPA tab (menu shape); reachable by URL now, rail door deferred
```

The segment is there and the page is reachable by URL. **E2 — sell on a tier, rename the tier, prove
the pool is keyed on `pool_key` and not the label — is executable today by typing the URL**, and does
not need the rail door. Row recovered.

## Owed rows — written below (2026-09-05)

The three rows named here (dim-phone scan, print scan, the `runs_events` click) are now in the table,
plus the door-sale bootstrap row. QR & Links has measured NOTHING by camera or on paper; every
scannability claim so far is arithmetic and the standard. The scan rows are what turns it into a fact.

## New rows

| Do this | Proves | Falsified by |
|---|---|---|
| **E8b, runs FIRST.** On `/admin/events/door?session=<id>` (a session with at least one tier that has a pool), open **Sell at the door**, pick a tier, leave the amount at the tier price, choose **Cash**, tap **Sell and admit**. Then open the Events page's pool count for that tier, and the end-of-night report. | The screen goes green; a row tagged **door** appears already **In**; the tier's remaining count is **one lower** (the walk-up holds an allocation); the report's "Taken at the door" equals what was typed and the "cash" figure matches. Commission is nowhere, and the row says "no platform fee". | Green with no row; a row with no allocation (remaining unchanged: the room can oversell at the door); a total that differs from what was typed; any commission line. |
| **E8b, sold out.** Sell at the door until the tier refuses. | "Sold out at that tier." **No row is written** for the refused sale and the remaining count does not go negative. | A row written for a refused sale; a negative or unchanged remaining after the refusal. |
| **E8b, comp and mismatch.** Sell one with the amount edited to **0** (a comp), and one with the amount edited to less than the tier price. | Both rows are **In**; the report's cash total is the sum of what was typed (the comp adds 0 and still counts as a priced walk-up). There is **no** "walk-ups without a recorded amount" line. | A total equal to tier prices rather than typed amounts (a derived number that would change when the price changes); the red unpriced line appearing when every sale recorded both fields. |
| **E3, owner only.** Signed in as the workspace **owner**: Settings → Workspace → "Does this workspace run events?" → **Yes** → wait for "Saved" → reload the page. Then sign in as a non-owner staff member and open the same card. | Yes persists across the reload; the non-owner sees the card **read-only** with the owner-only line; nothing else on the page changed. (The rail link is Dashboards' follow-up and is not asserted here.) | A value that does not survive a reload; a non-owner able to change it; an Events link appearing or disappearing anywhere as a result (that is not this PR's claim). |
| **E3, switching off.** With events on and at least one event created, switch to **No**. Open `/events/<slug>` on the tenant host and the workspace's Events page by URL. | Every event, session, tier and admission is still there; the public event page still resolves; the Events page still opens by URL. **Only the link is a link.** | Anything cancelled, unpublished or gone; a public event page that stops resolving. |
| **E4c, dim screen (the real case).** Open a receipt (`/r/<code>`) on a real iPhone at normal indoor brightness; **dim the screen to about 25%**; scan the QR with a **second** phone's camera at arm's length and at a **shallow angle**. Record whether it scanned. | The scan admits at the door (green, one person of the party). The symbol is version 8 at `Q` (49 modules); 105-byte token. | **Anything green that came from a bright screen held square** — a door is dim, tilted and impatient. If it fails dim and angled, the fix is the raw-byte uuid lever in Sessions' token format (version 7), not a bigger ECC. |
| **E4c, print — only if a printed ticket is ever a product.** Print a receipt at the **smallest size that would ever ship** and scan the QR with a phone camera. | Scans. At the 0.4 mm/module rule of thumb a version-8 symbol needs ~22.8 mm across including the quiet zone — that figure is a field rule, not the standard, and this row is what tests it. | Anything green that did not come from a phone camera on paper. |
| **E4c, six seats.** Buy (when buying exists) or door-sell six separate admissions on one receipt; scan the **first** QR twice, then the **second** once. | Each QR is its own token: the first scan admits one person, the second scan of the same code is **red "already scanned"**, and the second code admits one more. One receipt, six codes, six people. | A QR that encodes the receipt URL (one scan identifies a purchase and admits a party); a second code refused because the first was used. |
| **E4c, overflow (negative case, staged).** With a deliberately long token (Sessions' `signAdmissionToken` payload padded past 130 bytes in a staging build), open a receipt with two admissions, one long and one normal. | The receipt renders: the normal admission shows a QR, the long one shows **the typed code and "Show this code at the door"** and nothing else; the server log carries `receipt.qr/overflow` with the admission id and byte count. | A 500 on the receipt (one bad token must cost one gap, never the page); a silently absent code with no log line; a truncated QR that scans and admits nobody. |

## Owner runbook — a published event with a paid tier on El Paisa (two minutes)

**Read first, both change what the runner does (Director, 2026-09-06):**
- **`https://app.tulala.digital/elpaisa/admin/events` is URL-only** until the rail door exists. Do not look for a nav item; type the address.
- **Flip the events switch first** (Settings → Workspace → "Does this workspace run events?" → Yes). `runs_events` was false on El Paisa; every later step 404s in a way that looks like a bug in the step, not a missing precondition. (As of 2026-09-06 15:30 it is already **true**, and a real published event exists: "Noche de prueba", session 2026-09-07 21:00 Buenos Aires, GA 20.00 USD — created through the shared writers on the owner's authorization. Steps 3, 4, 6 and 8 therefore already have their rows; run them as edits/second rows or verify the existing ones.)
- **Two rows must be run signed out, or in a private window** — a signed-in browser cannot see what a guest sees and will silently pass them while being wrong: step 3's "a draft's `/events/<slug>` 404s" and step 7's "a published event shows a price with no way to buy".

Signed in on `app.tulala.digital` as the **owner** of El Paisa. Each step names what a wrong state looks like; stop at the first one you see and send the screenshot.

1. **Settings → Workspace → "Does this workspace run events?" → Yes.** Wait for "Saved", reload. *Wrong:* the card does not show "Saved"; it reverts to No on reload; a non-owner can change it.
2. **Open `https://app.tulala.digital/elpaisa/admin/events`** (by URL; the rail link is a later Dashboards change). *Wrong:* a 404, or a "not allowed" message while signed in as owner.
3. **New event → title `Noche de prueba` → Create draft.** The event appears selected with status `draft` and "Public address: /events/noche-de-prueba (draft, not public)". *Wrong:* no event appears; a second click creates a duplicate with the same address (it must refuse, naming the address); `https://elpaisa.tulala.digital/events/noche-de-prueba` resolves while still a draft (it must 404 — **check signed out**).
4. **Tickets tab → Add a tier: `General admission`, price `150.00`, admits `1` → Add.** The tier row shows 150.00 and "Scheduled/On sale" state. *Wrong:* the row is missing; adding `General admission` a second time is accepted (it must refuse as already existing).
5. **Tickets → Edit on the tier → rename to `GA` → Save.** *(Needs #1777.)* *Wrong:* the tier vanishes or a new tier appears (the pool key must not change on rename).
6. **Details tab → Publish.** Status becomes `published`; the red line **"Published, but no night of it is on sale yet: schedule a session with seats per tier"** appears. *Wrong:* no red line; the publish silently fails; a "Cancel event" control does not appear afterwards.
7. **SIGNED OUT / private window — open `https://elpaisa.tulala.digital/events/noche-de-prueba`.** The page shows the title and `General admission · 150.00` and **no way to buy**; `https://elpaisa.tulala.digital/events` lists it. *Wrong:* a Buy / Add to cart control; a 404; the date shown in your laptop's timezone rather than the venue's (there is no date yet, so "Date to be announced" is correct).
8. **Sessions surface → schedule one night for `Noche de prueba`, seats: General admission = 10.** *(Needs #1780.)* Back on Events → Sessions tab, the night is listed with "seats 10 · sold: 0"; Door tab shows "Open the door" for it. *Wrong:* the night exists but the Events page still says no night is on sale; the Door tab still says there is no night.
9. **Sessions tab → set seats to 5 → Save; then to 12 → Save.** *(Needs #1777.)* Both save (nothing is sold yet). Then sell one at the door (Door → Sell at the door → cash) and set seats to **0** → **"0 is below the 1 already sold for this night. Enter 1 or more."** *Wrong:* 0 accepted; a message with no number; a "sold" figure that disagrees with the door's count.
10. **Details → Cancel event.** Status `cancelled`; the public page still resolves and says it is cancelled; `/events` no longer lists it. *Wrong:* the page 404s (a cancelled event keeps its page); the event can be published again (it cannot; create a new one).

Steps 1–4, 6, 7 and 10 are executable on the current release (`9e1388e47` and later). Steps 5 and 9 need #1777; step 8 needs #1780. **Nobody can buy a ticket yet** — that needs the ticket picker and guest checkout, and the runbook stops honestly at "no way to buy".
