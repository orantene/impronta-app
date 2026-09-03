# Menu re-home plan

Menu Workspace Manager → Platform Features Director. Reconciles the shipped Menu
(PRs #1456–#1470) with "Sell the Room" §04, §05b, §05c, §05d.

---

## 1. Punch-list reconciliation

My post-ship punch list (`~/.claude/plans/polished-growing-wombat.md`) had six items. **All six are
closed.** P1 (an orphan test that never ran) and P2 (a seat-limited item could be oversold) shipped
in #1470; P3 (QA data) is cleared; P4, P5 and P6 were verified already correct.

### The one open item is superseded, and was impossible as written

The punch list ended with an owner action: *"complete one menu-order payment in Stripe test mode —
`transfers.ts` on a house snapshot has never run against Stripe."*

§05d says that cannot be done: *"A guest can trigger a card charge but cannot complete one: both
payment actions require a session, the pay sheet is mounted only inside the account dashboard, and
the guest thread renders payment cards read-only. The only completable guest money path is pay in
person."*

So I asked the owner to click through a path the platform does not have. **Withdrawn.** It is
replaced by scope item 1 (default to pay in person and say so) and, properly, by the Front Door
Sheet's pay step (F3) and guest checkout. The underlying gap is real and unchanged: the house lane
of `transfers.ts` has run in unit tests and never against Stripe. It becomes provable at Orders 0.6
with guest checkout, not before.

### Still open, not covered by the proposal

1. **Three archived QA offerings** remain on the Impronta tenant (`QA Lookbook Session`,
   `QA Casting Day Pass`, `QA Brand Campaign Kit`). `status='archived'` so they are not public.
   Cosmetic; I will clear them with the next production touch.
2. **`menu-order-stock.static.test.ts` must be re-homed, not deleted, at Orders 0.6.** It pins two
   properties: the stock gate is not keyed on `kind`, and no failure return after a reservation
   leaks it. When `menu-order-engine.ts` is deleted those guarantees move to the pipeline. Deleting
   the test with the engine silently drops the compensation guarantee. **Handoff to Orders &
   Checkout Manager.**
3. **The `kind` lesson must survive the move to pools.** instant-book gates stock on
   `kind === 'product'`; the live *"Posing course — 12 spots"* is `kind='package'`, so that gate
   leaves the one item needing enforcement unenforced. A capacity pool must attach on
   **stock presence, never on kind**. **Handoff to Capacity Engine Manager.**
4. **No receipt.** §05d names it: menu orders show "Order sent." and discard the order id. Owned by
   the Front Door Manager (the Receipt surface); I supply the order id once the pipeline returns one.

---

## 2. Files I own vs. files I consume

**Mine, throughout:**
- `src/lib/site-admin/builder-node/menu-board-island.tsx` — steppers, quantities, sold-out, i18n; becomes the Sheet's lines-builder
- `src/lib/site-admin/server/native-data-block-sources.ts` → `deriveWorkspaceMenuOfferings` / `fetchWorkspaceMenuOfferings` (the menu DTO)
- `src/lib/site-admin/builder-node/render.tsx` — the `menu_board` case only
- `src/lib/talent/menu-offerings-actions.ts` — the workspace items editor
- `src/components/talent/services/*` — the editor UI, where it serves menu items
- `src/lib/talent/menu-order-offer.ts` — becomes the pipeline's line-seed helper; the "2 pepperoni" quantity rule survives verbatim
- `fulfilment_pipelines` and the Menu page views (Items, Orders, Kitchen, Tabs)

**Consumed, never redefined:**
- Orders, order lines, XOR payee, house participant shape, order states → **Orders & Checkout**
- `reserve_capacity` / pools / allocations → **Capacity Engine**
- `space_id`, `session_id`, QR printing → **Spaces & Seating** (I read the id; I never resolve a space)
- The Sheet, the Receipt, the words table → **Front Door**

**Deleted at Orders 0.6:** `menu-order-engine.ts`. `menu-order-actions.ts` becomes a thin caller.

---

## 3. Order of changes

**Item 1 — now, no cross-manager dependency.** Editor exposes stock; the board shows sold out; the
island gains inventory awareness, loses its hardcoded English (en + es), and defaults to pay in
person where the offering allows it. Ships against `inventory_qty` today behind a narrow read seam
so the source can swap to a pool without touching the island.

**Item 5 — offering policies, next.** `createMenuOrder` reads none of `reserveMode`, `depositPct`,
`allowPayInPerson`, `requireAccountToBook`, `cancellationHours`. I will carry them onto the draft
now so the pipeline inherits real values rather than defaults at 0.6.

**Item 2 — with Orders 0.6.** Engine deleted; actions call the pipeline; the order card replaces the
`"Menu order:"` text message; `calendar_lane='order'` and its `starts_at = ends_at = now` placeholder
retire and the calendar reads fulfilment due time.

**Item 3 — fulfilment pipelines.** `fulfilment_pipelines(tenant_id, name, stages jsonb)` with a
default per preset, item→pipeline routing by category, `booking_fulfillment` rekeyed to orders with
its status becoming the stage key. Menu page grows Items / Orders / Kitchen / Tabs.

**Item 4 — table QR.** Consume `space_id` on the draft once Spaces publishes it.

---

## 4. Exit proofs

| Item | Proof |
|---|---|
| 1 | A stock-limited item renders sold out and cannot be added; an item with `allowPayInPerson` produces an order with `payment_method='cash'` and no uncompletable card request; every island string resolves in en **and** es; `deriveWorkspaceMenuOfferings` unit-tested for the sold-out and pay-in-person flags |
| 5 | An offering with a deposit produces a draft carrying that deposit; `require_account_to_book` blocks a guest order |
| 2 | `menu-order-engine.ts` is gone, `grep` finds no `calendar_lane='order'` writer, and a menu order appears on the calendar at its fulfilment time; the re-homed stock-compensation test passes against the pipeline |
| 3 | A tenant edits a stage label and the board column renames; an item routed to `bar` appears in the bar column only |
| 4 | Scanning a table QR yields a draft order carrying that `space_id` |

**Standing gates:** `tsc --noEmit`, `lint`, `test:money`, `test:builder`, `test:builder-chrome`,
`test:phase1-i18n`, `test:size-ratchet` — real exit codes, and every new test wired into a lane
(verified by the lane's pass count moving, not by the file existing).

---

## 5. Contract questions

**Capacity Engine Manager** — I need the pool contract before stock stops living on
`inventory_qty`: how a timeless pool is created for an offering, whether the offering points at the
pool or vice-versa, and the read shape for "units left" that a public page may call. Item 1 ships
against `inventory_qty` behind a seam so this can land without touching the island.

**Orders & Checkout Manager** — confirm the line-seed signature you want from
`menu-order-offer.ts`, and take the stock-compensation guard listed above.

**Front Door Manager** — confirm the island's output shape as the Sheet's lines-builder
(`{offeringId, variantId, addonIds[], qty}` today).

**Director** — the operating-rules block came through empty (`[paste the shared block here]`), so I
am working to the four contracts in the brief plus the repo's house rules. Send it and I will
reconcile.
