# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/MONEY-manager-reads-the-money.spec.ts >> MONEY: a manager reads Sales and Payments, and a cancelled or draft order moves nothing
- Location: e2e/cases/MONEY-manager-reads-the-money.spec.ts:152:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('section').filter({ hasText: 'Still owed' }).first()
Expected substring: "$1,209.00"
Received string:    "Still owedSum of what is still owed on orders awaiting payment, using the same rule the Orders desk uses.$713.00See the order-by-order breakdown"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('section').filter({ hasText: 'Still owed' }).first()
    9 × locator resolved to <section class="flex flex-col gap-3">…</section>
      - unexpected value "Still owedSum of what is still owed on orders awaiting payment, using the same rule the Orders desk uses.$713.00See the order-by-order breakdown"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - link "Skip to main content" [ref=e4] [cursor=pointer]:
      - /url: "#tulala-main"
    - main "workspace surface" [ref=e5]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - img [ref=e9]
          - generic [ref=e18]: Sell what you do, not what you ship
        - button "Business pulse, breakdown" [ref=e21] [cursor=pointer]:
          - generic [ref=e23]: $0 pending · 0 confirmed
          - img [ref=e24]
        - button "Search workspace" [ref=e26] [cursor=pointer]:
          - img [ref=e27]
          - generic [ref=e30]: Search
          - generic [ref=e31]: ⌘K
        - group "Workspace or point of sale" [ref=e33]:
          - button "Workspace" [pressed] [ref=e34] [cursor=pointer]
          - button "Counter" [ref=e35] [cursor=pointer]
        - button "Notifications · 14 unread" [ref=e37] [cursor=pointer]:
          - img [ref=e38]
          - generic [ref=e41]: 9+
        - link "Preview site" [ref=e42] [cursor=pointer]:
          - /url: /qa-journeys
          - img [ref=e43]
        - button "Open account menu — Signed in as QA Journeys Owner" [ref=e47] [cursor=pointer]:
          - img [ref=e49]
      - generic [ref=e52]:
        - complementary [ref=e53]:
          - link "Skip to page content" [ref=e54] [cursor=pointer]:
            - /url: "#tulala-workspace-content"
          - button "QA Journeys (48-case fixture) Agency plan" [ref=e55] [cursor=pointer]:
            - img [ref=e57]
            - generic [ref=e60]:
              - generic [ref=e61]: QA Journeys (48-case fixture)
              - generic [ref=e62]: Agency plan
            - img [ref=e63]
          - navigation "Workspace sections" [ref=e65]:
            - 'button "Overview — Today''s snapshot: unread, pending actions, recent activity" [ref=e68] [cursor=pointer]':
              - img [ref=e69]
              - generic [ref=e73]: Overview
            - generic [ref=e74]:
              - generic [ref=e75]: Operate
              - button "Messages — All threads across active inquiries and bookings" [ref=e77] [cursor=pointer]:
                - img [ref=e78]
                - generic [ref=e81]: Messages
              - button "Calendar — Scheduled shoots, holds, and deadlines" [ref=e83] [cursor=pointer]:
                - img [ref=e84]
                - generic [ref=e87]: Calendar
              - button "Appointments — Appointments, sessions and series, with the series editor" [ref=e89] [cursor=pointer]:
                - img [ref=e90]
                - generic [ref=e94]: Appointments
              - 'button "Reservations — The host stand: today''s book, arrivals, and who is still unseated" [ref=e96] [cursor=pointer]':
                - img [ref=e97]
                - generic [ref=e100]: Reservations
              - button "Orders — Every order taken, and what is still owed on each" [ref=e102] [cursor=pointer]:
                - img [ref=e103]
                - generic [ref=e106]: Orders
              - button "Projects — Jobs with a brief, a crew and a deadline" [ref=e108] [cursor=pointer]:
                - img [ref=e109]
                - generic [ref=e112]: Projects
              - button "Issues — Refunds, tickets, inquiries and jobs that need a human" [ref=e114] [cursor=pointer]:
                - img [ref=e115]
                - generic [ref=e117]: Issues
              - button "Preparation — Tickets the kitchen and pickup station see" [ref=e119] [cursor=pointer]:
                - img [ref=e120]
                - generic [ref=e124]: Preparation
            - generic [ref=e125]:
              - generic [ref=e126]: Sell
              - button "Menu and catalog — Workspace-owned items customers can order from your site" [ref=e128] [cursor=pointer]:
                - img [ref=e129]
                - generic [ref=e133]: Menu and catalog
              - button "Spaces — Open checks on the floor" [ref=e135] [cursor=pointer]:
                - img [ref=e136]
                - generic [ref=e140]: Spaces
              - button "Discounts — Promo codes this workspace owns" [ref=e142] [cursor=pointer]:
                - img [ref=e143]
                - generic [ref=e145]: Discounts
            - generic [ref=e146]:
              - generic [ref=e147]: People
              - button "Clients — Client accounts, trust tiers, and booking history" [ref=e149] [cursor=pointer]:
                - img [ref=e150]
                - generic [ref=e153]: Clients
              - button "Team — Everyone who works here, is bookable here, or has access" [ref=e155] [cursor=pointer]:
                - img [ref=e156]
                - generic [ref=e161]: Team
              - button "Pitches — Curated talent suggestions sent to clients" [ref=e163] [cursor=pointer]:
                - img [ref=e164]
                - generic [ref=e167]: Pitches
              - button "Reviews — Reported reviews, review photos, and rating integrity" [ref=e169] [cursor=pointer]:
                - img [ref=e170]
                - generic [ref=e172]: Reviews
            - generic [ref=e173]:
              - generic [ref=e174]: Money
              - button "Sales — Bookings, orders, appointments and registrations in one list" [ref=e176] [cursor=pointer]:
                - img [ref=e177]
                - generic [ref=e180]: Sales
              - button "Payments — Revenue, payouts, commissions, and payment status" [active] [ref=e182] [cursor=pointer]:
                - img [ref=e183]
                - generic [ref=e186]: Payments
            - generic [ref=e187]:
              - generic [ref=e188]: Grow
              - button "Analytics — Funnel, money, website, and reviews" [ref=e190] [cursor=pointer]:
                - img [ref=e191]
                - generic [ref=e194]: Analytics
              - button "Website — Pages, posts, redirects, custom code, tracking, SEO, domain" [ref=e196] [cursor=pointer]:
                - img [ref=e197]
                - generic [ref=e200]: Website
              - button "Media — Workspace photo library, watermark control, and usage tracking" [ref=e202] [cursor=pointer]:
                - img [ref=e203]
                - generic [ref=e207]: Media
          - button "Settings — Account, plan, branding, integrations, team, and danger zone" [ref=e210] [cursor=pointer]:
            - img [ref=e211]
            - generic [ref=e214]: Settings
        - main [ref=e215]:
          - main [ref=e217]:
            - generic [ref=e218]:
              - generic [ref=e219]:
                - heading "Payments" [level=1] [ref=e220]
                - paragraph [ref=e221]: "What actually moved: takings by method, what is still owed, refunds, and the cash drawer."
              - generic [ref=e222]:
                - link "See Financials (per-talent payout report)" [ref=e223] [cursor=pointer]:
                  - /url: /qa-journeys/admin/financials
                - generic [ref=e224]: Times are shown in this workspace's own time zone.
            - generic [ref=e225]:
              - generic [ref=e226]:
                - generic [ref=e227]:
                  - heading "Takings by method" [level=2] [ref=e228]
                  - paragraph [ref=e229]: Paid transactions only. Every figure traces back to its own rows.
                - table [ref=e231]:
                  - rowgroup [ref=e232]:
                    - row "Method Transactions Amount" [ref=e233]:
                      - columnheader "Method" [ref=e234]
                      - columnheader "Transactions" [ref=e235]
                      - columnheader "Amount" [ref=e236]
                  - rowgroup [ref=e237]:
                    - row "Cash 55 $1,248.50" [ref=e238]:
                      - cell "Cash" [ref=e239]
                      - cell "55" [ref=e240]
                      - cell "$1,248.50" [ref=e241]
              - generic [ref=e242]:
                - generic [ref=e243]:
                  - heading "Still owed" [level=2] [ref=e244]
                  - paragraph [ref=e245]: Sum of what is still owed on orders awaiting payment, using the same rule the Orders desk uses.
                - generic [ref=e246]:
                  - strong [ref=e248]: $713.00
                  - link "See the order-by-order breakdown" [ref=e249] [cursor=pointer]:
                    - /url: /qa-journeys/admin/orders?bucket=to_pay
              - generic [ref=e250]:
                - generic [ref=e251]:
                  - heading "Refunds" [level=2] [ref=e252]
                  - paragraph [ref=e253]: Every refund that actually completed, linked to the payment it reversed.
                - generic [ref=e254]: No refunds yet.
              - generic [ref=e255]:
                - generic [ref=e256]:
                  - heading "Cash drawer sessions" [level=2] [ref=e257]
                  - paragraph [ref=e258]: What was counted against what was expected. Only the running total exists today, not a movement-by-movement breakdown.
                - generic [ref=e259]:
                  - generic [ref=e260]:
                    - generic [ref=e261]:
                      - generic [ref=e262]: Closed
                      - generic [ref=e263]: Opened Sep 10, 2026, 11:39 AM CST
                      - generic [ref=e264]: · Closed Sep 10, 2026, 11:39 AM CST
                    - generic [ref=e265]:
                      - generic [ref=e266]:
                        - generic [ref=e267]: Opening float
                        - generic [ref=e268]: $50.00
                      - generic [ref=e269]:
                        - generic [ref=e270]: Expected
                        - generic [ref=e271]: $68.00
                      - generic [ref=e272]:
                        - generic [ref=e273]: Counted
                        - generic [ref=e274]: $67.50
                      - generic [ref=e275]:
                        - generic [ref=e276]: Variance
                        - generic [ref=e277]: "-$0.50"
                  - generic [ref=e278]:
                    - generic [ref=e279]:
                      - generic [ref=e280]: Closed
                      - generic [ref=e281]: Opened Sep 10, 2026, 11:35 AM CST
                      - generic [ref=e282]: · Closed Sep 10, 2026, 11:39 AM CST
                    - generic [ref=e283]:
                      - generic [ref=e284]:
                        - generic [ref=e285]: Opening float
                        - generic [ref=e286]: $50.00
                      - generic [ref=e287]:
                        - generic [ref=e288]: Expected
                        - generic [ref=e289]: $50.00
                      - generic [ref=e290]:
                        - generic [ref=e291]: Counted
                        - generic [ref=e292]: $50.00
                      - generic [ref=e293]:
                        - generic [ref=e294]: Variance
                        - generic [ref=e295]: $0.00
                  - generic [ref=e296]:
                    - generic [ref=e297]:
                      - generic [ref=e298]: Closed
                      - generic [ref=e299]: Opened Sep 10, 2026, 10:56 AM CST
                      - generic [ref=e300]: · Closed Sep 10, 2026, 10:57 AM CST
                    - generic [ref=e301]:
                      - generic [ref=e302]:
                        - generic [ref=e303]: Opening float
                        - generic [ref=e304]: $50.00
                      - generic [ref=e305]:
                        - generic [ref=e306]: Expected
                        - generic [ref=e307]: $68.00
                      - generic [ref=e308]:
                        - generic [ref=e309]: Counted
                        - generic [ref=e310]: $67.50
                      - generic [ref=e311]:
                        - generic [ref=e312]: Variance
                        - generic [ref=e313]: "-$0.50"
                  - generic [ref=e314]:
                    - generic [ref=e315]:
                      - generic [ref=e316]: Closed
                      - generic [ref=e317]: Opened Sep 10, 2026, 10:20 AM CST
                      - generic [ref=e318]: · Closed Sep 10, 2026, 10:56 AM CST
                    - generic [ref=e319]:
                      - generic [ref=e320]:
                        - generic [ref=e321]: Opening float
                        - generic [ref=e322]: $50.00
                      - generic [ref=e323]:
                        - generic [ref=e324]: Expected
                        - generic [ref=e325]: $104.00
                      - generic [ref=e326]:
                        - generic [ref=e327]: Counted
                        - generic [ref=e328]: $50.00
                      - generic [ref=e329]:
                        - generic [ref=e330]: Variance
                        - generic [ref=e331]: "-$54.00"
                  - generic [ref=e332]:
                    - generic [ref=e333]:
                      - generic [ref=e334]: Closed
                      - generic [ref=e335]: Opened Sep 10, 2026, 10:09 AM CST
                      - generic [ref=e336]: · Closed Sep 10, 2026, 10:20 AM CST
                    - generic [ref=e337]:
                      - generic [ref=e338]:
                        - generic [ref=e339]: Opening float
                        - generic [ref=e340]: $50.00
                      - generic [ref=e341]:
                        - generic [ref=e342]: Expected
                        - generic [ref=e343]: $68.00
                      - generic [ref=e344]:
                        - generic [ref=e345]: Counted
                        - generic [ref=e346]: $50.00
                      - generic [ref=e347]:
                        - generic [ref=e348]: Variance
                        - generic [ref=e349]: "-$18.00"
                  - generic [ref=e350]:
                    - generic [ref=e351]:
                      - generic [ref=e352]: Closed
                      - generic [ref=e353]: Opened Sep 10, 2026, 10:04 AM CST
                      - generic [ref=e354]: · Closed Sep 10, 2026, 10:09 AM CST
                    - generic [ref=e355]:
                      - generic [ref=e356]:
                        - generic [ref=e357]: Opening float
                        - generic [ref=e358]: $50.00
                      - generic [ref=e359]:
                        - generic [ref=e360]: Expected
                        - generic [ref=e361]: $68.00
                      - generic [ref=e362]:
                        - generic [ref=e363]: Counted
                        - generic [ref=e364]: $50.00
                      - generic [ref=e365]:
                        - generic [ref=e366]: Variance
                        - generic [ref=e367]: "-$18.00"
                  - generic [ref=e368]:
                    - generic [ref=e369]:
                      - generic [ref=e370]: Closed
                      - generic [ref=e371]: Opened Sep 10, 2026, 9:22 AM CST
                      - generic [ref=e372]: · Closed Sep 10, 2026, 10:02 AM CST
                    - generic [ref=e373]:
                      - generic [ref=e374]:
                        - generic [ref=e375]: Opening float
                        - generic [ref=e376]: $100.00
                      - generic [ref=e377]:
                        - generic [ref=e378]: Expected
                        - generic [ref=e379]: $238.50
                      - generic [ref=e380]:
                        - generic [ref=e381]: Counted
                        - generic [ref=e382]: $100.00
                      - generic [ref=e383]:
                        - generic [ref=e384]: Variance
                        - generic [ref=e385]: "-$138.50"
                  - generic [ref=e386]:
                    - generic [ref=e387]:
                      - generic [ref=e388]: Closed
                      - generic [ref=e389]: Opened Sep 10, 2026, 9:15 AM CST
                      - generic [ref=e390]: · Closed Sep 10, 2026, 9:22 AM CST
                    - generic [ref=e391]:
                      - generic [ref=e392]:
                        - generic [ref=e393]: Opening float
                        - generic [ref=e394]: $100.00
                      - generic [ref=e395]:
                        - generic [ref=e396]: Expected
                        - generic [ref=e397]: $172.50
                      - generic [ref=e398]:
                        - generic [ref=e399]: Counted
                        - generic [ref=e400]: $100.00
                      - generic [ref=e401]:
                        - generic [ref=e402]: Variance
                        - generic [ref=e403]: "-$72.50"
                  - generic [ref=e404]:
                    - generic [ref=e405]:
                      - generic [ref=e406]: Closed
                      - generic [ref=e407]: Opened Sep 10, 2026, 6:46 AM CST
                      - generic [ref=e408]: · Closed Sep 10, 2026, 9:15 AM CST
                    - generic [ref=e409]:
                      - generic [ref=e410]:
                        - generic [ref=e411]: Opening float
                        - generic [ref=e412]: $100.00
                      - generic [ref=e413]:
                        - generic [ref=e414]: Expected
                        - generic [ref=e415]: $305.50
                      - generic [ref=e416]:
                        - generic [ref=e417]: Counted
                        - generic [ref=e418]: $100.00
                      - generic [ref=e419]:
                        - generic [ref=e420]: Variance
                        - generic [ref=e421]: "-$205.50"
                - paragraph [ref=e422]: Movement-by-movement detail and a denomination count are not recorded in the database yet; only this running total is available.
    - dialog [ref=e423]:
      - separator "Resize drawer" [ref=e424]
      - banner [ref=e425]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e426]:
          - button "Copy link to this drawer" [ref=e428] [cursor=pointer]:
            - img [ref=e429]
          - generic [ref=e432]:
            - button "compact size" [ref=e434] [cursor=pointer]:
              - img [ref=e435]
            - button "half size" [ref=e439] [cursor=pointer]:
              - img [ref=e440]
            - button "full size" [ref=e444] [cursor=pointer]:
              - img [ref=e445]
          - button "Close" [ref=e448] [cursor=pointer]:
            - img [ref=e449]
    - status
```

# Test source

```ts
  300 |   const paidOrder = (await orderById(paidOrderId))!;
  301 |   expect(paidOrder.status).toBe("paid");
  302 |   expect(paidOrder.collectedCents).toBe(paidOrder.totalCents);
  303 |   expect(paidOrder.customerId, "naming the buyer must attach a customer").not.toBeNull();
  304 |   const cashTakingCents = paidOrder.totalCents;
  305 | 
  306 |   // A CANCELLED sale, with a real total behind it.
  307 |   const cancelledOrderId = await counterNextSale(page, paidOrderId);
  308 |   await counterAddPizza(page, cancelledOrderId);
  309 |   await page.getByRole("button", { name: "Cancel sale" }).click();
  310 |   await expect
  311 |     .poll(async () => (await orderById(cancelledOrderId))?.status, { timeout: 30_000 })
  312 |     .toBe("cancelled");
  313 |   const cancelledOrder = (await orderById(cancelledOrderId))!;
  314 |   expect(
  315 |     cancelledOrder.totalCents,
  316 |     "a cancelled order with a zero total would prove nothing about cancellation",
  317 |   ).toBeGreaterThan(0);
  318 | 
  319 |   // A DRAFT sale: opened, an item added, walked away from.
  320 |   const draftOrderId = await counterNextSale(page, cancelledOrderId);
  321 |   await counterAddPizza(page, draftOrderId);
  322 |   await expect
  323 |     .poll(async () => (await orderById(draftOrderId))?.totalCents, { timeout: 30_000 })
  324 |     .toBeGreaterThan(0);
  325 |   const draftOrder = (await orderById(draftOrderId))!;
  326 |   expect(draftOrder.status).toBe("draft");
  327 | 
  328 |   // The cash just taken must be stamped with THIS drawer, or the drawer's
  329 |   // Expected cannot include it. `cashTakenOnShift` is the close rule's own
  330 |   // predicate, so the rows it returns are the rows Expected is made of. Other
  331 |   // sessions share this fixture; any cash they took meanwhile is in the same
  332 |   // rows and belongs in the same figure, which is why Expected is derived
  333 |   // from the rows rather than written down as float + one sale.
  334 |   const cashRows = await cashTakenOnShift(shiftId);
  335 |   expect(
  336 |     cashRows.some((r) => r.orderId === paidOrderId && r.grossAmountCents === cashTakingCents),
  337 |     "the cash sale is stamped with the open drawer",
  338 |   ).toBe(true);
  339 |   const expectedCents = 5000 + cashRows.reduce((sum, r) => sum + r.grossAmountCents, 0);
  340 |   // Close the drawer with a count that is deliberately NOT the expected figure,
  341 |   // so the variance on screen is arithmetic rather than a zero that would look
  342 |   // the same whether it was computed or hardcoded.
  343 |   const countedCents = expectedCents - 50;
  344 |   await counterRail(page, /^shifts$/i);
  345 |   await page.getByLabel("Cash counted at close").fill((countedCents / 100).toFixed(2));
  346 |   await page.getByRole("button", { name: "Close the shift" }).click();
  347 |   await expect.poll(async () => (await drawerSession(shiftId))?.status, { timeout: 30_000 }).toBe("closed");
  348 |   const drawer = (await drawerSession(shiftId))!;
  349 |   expect(drawer.openingCashCents).toBe(5000);
  350 |   expect(drawer.closingCashCents).toBe(countedCents);
  351 |   expect(
  352 |     drawer.expectedCashCents,
  353 |     `expected cash is the float plus the ${cashRows.length} cash row(s) stamped with this shift`,
  354 |   ).toBe(expectedCents);
  355 |   await shot("07-counter-shift-closed");
  356 | 
  357 |   // ────────────────────────────────────────────────────────────────────
  358 |   // 3 — PAYMENTS: four figures, four queries.
  359 |   // ────────────────────────────────────────────────────────────────────
  360 |   await page.goto("/admin");
  361 |   await expect(
  362 |     sidebar.getByRole("button", { name: /^Payments\b/ }),
  363 |     "a manager reaches the money from the rail, not by typing a URL",
  364 |   ).toBeVisible({ timeout: 30_000 });
  365 |   await sidebar.getByRole("button", { name: /^Payments\b/ }).click();
  366 |   await expect(page).toHaveURL(/\/admin\/payments/, { timeout: 30_000 });
  367 |   await expect(page.getByRole("heading", { name: "Payments", level: 1 })).toBeVisible();
  368 | 
  369 |   // TAKINGS BY METHOD — cash on its own row, every other method on its own.
  370 |   const takings = await takingsByMethod();
  371 |   const cashBucket = takings.find((b) => b.method === "cash" && b.currency === "USD");
  372 |   expect(cashBucket, "the cash sale just taken must land in a cash bucket").toBeTruthy();
  373 |   const takingsTable = page.locator("table").first();
  374 |   const cashRow = takingsTable.locator("tr", { hasText: "Cash" }).first();
  375 |   await expect(cashRow).toContainText(money(cashBucket!.totalCents, "USD"));
  376 |   await expect(cashRow).toContainText(String(cashBucket!.count));
  377 |   for (const bucket of takings) {
  378 |     if (bucket.method === "cash" && bucket.currency === "USD") continue;
  379 |     await expect(
  380 |       takingsTable,
  381 |       `${bucket.method} has takings and must have its own row rather than being folded into cash`,
  382 |     ).toContainText(money(bucket.totalCents, bucket.currency));
  383 |   }
  384 | 
  385 |   // STILL OWED — the figure a review found counting cancelled and draft orders,
  386 |   // and the one this run found summing a 200-row window and calling it the
  387 |   // total. Read the whole owed SET and the whole workspace, not a window.
  388 |   const owedSet = await owedOrdersInWorkspace();
  389 |   const everyOrder = await allOrdersInWorkspace();
  390 |   const owedUsd = owedByCurrency(owedSet).get("USD") ?? 0;
  391 |   expect(
  392 |     owedByCurrency(everyOrder).get("USD") ?? 0,
  393 |     "the owed set and the whole workspace must agree under the same rule",
  394 |   ).toBe(owedUsd);
  395 |   testInfo.annotations.push({
  396 |     type: "still owed",
  397 |     description: `${money(owedUsd, "USD")} over ${owedSet.length} owed order(s) of ${everyOrder.length} in the workspace`,
  398 |   });
  399 |   const owedSection = page.locator("section", { hasText: "Still owed" }).first();
> 400 |   await expect(owedSection).toContainText(money(owedUsd, "USD"));
      |                             ^ Error: expect(locator).toContainText(expected) failed
  401 | 
  402 |   // The three sales just made are in the workspace, and only the rule tells
  403 |   // them apart: two of them have a real total and none is owed.
  404 |   for (const [id, what] of [
  405 |     [paidOrderId, "paid"],
  406 |     [cancelledOrderId, "cancelled"],
  407 |     [draftOrderId, "draft"],
  408 |   ] as const) {
  409 |     expect(everyOrder.some((r) => r.id === id), `the ${what} sale is among the orders read`).toBe(true);
  410 |     expect(owedSet.some((r) => r.id === id), `the ${what} sale is not in the owed set`).toBe(false);
  411 |   }
  412 |   expect(owedCents(cancelledOrder), "a cancelled order owes nothing").toBe(0);
  413 |   expect(owedCents(draftOrder), "a draft order owes nothing").toBe(0);
  414 |   expect(owedCents(paidOrder), "a collected order owes nothing").toBe(0);
  415 | 
  416 |   // And the wrong rule, so the check above is not a tautology: `total -
  417 |   // collected` over every row is a bigger number, and it is not on the screen.
  418 |   const naiveUsd = naiveOwed(everyOrder.filter((r) => r.currency === "USD"));
  419 |   expect(
  420 |     naiveUsd,
  421 |     "the two rules must differ on this data or the assertion below proves nothing",
  422 |   ).toBeGreaterThan(owedUsd);
  423 |   await expect(
  424 |     owedSection,
  425 |     "Still owed must not be total-minus-collected over drafts and cancellations",
  426 |   ).not.toContainText(money(naiveUsd, "USD"));
  427 | 
  428 |   // REFUNDS.
  429 |   const { data: refundRows, error: refundErr } = await sb
  430 |     .from("booking_transactions")
  431 |     .select("id, gross_amount_cents, currency")
  432 |     .eq("source_tenant_id", JOURNEYS_TENANT_ID)
  433 |     .eq("status", "refunded");
  434 |   expect(refundErr).toBeNull();
  435 |   const refundsSection = page.locator("section", { hasText: "Refunds" }).first();
  436 |   if ((refundRows ?? []).length === 0) {
  437 |     await expect(refundsSection).toContainText("No refunds yet.");
  438 |   } else {
  439 |     for (const raw of refundRows ?? []) {
  440 |       const row = raw as { gross_amount_cents: number | string; currency: string | null };
  441 |       await expect(refundsSection).toContainText(
  442 |         money(Number(row.gross_amount_cents), (row.currency ?? "USD").toUpperCase()),
  443 |       );
  444 |     }
  445 |   }
  446 | 
  447 |   // THE DRAWER: what was counted against what was expected, on THIS session's
  448 |   // card. Other sessions' cards are on the same page, so the card is found by
  449 |   // its own expected and counted figures together.
  450 |   const drawerSectionEl = page.locator("section", { hasText: "Cash drawer sessions" }).first();
  451 |   const drawerCard = drawerSectionEl
  452 |     .locator("div.rounded-xl", { hasText: money(drawer.expectedCashCents!, "USD") })
  453 |     .filter({ hasText: money(drawer.closingCashCents!, "USD") })
  454 |     .first();
  455 |   await expect(drawerCard, "the closed drawer has its own card").toBeVisible();
  456 |   await expect(drawerCard).toContainText("Closed");
  457 |   await expect(drawerCard).toContainText(money(drawer.openingCashCents, "USD"));
  458 |   await expect(
  459 |     drawerCard,
  460 |     "a variance is the count minus the expectation, not a zero",
  461 |   ).toContainText(money(drawer.closingCashCents! - drawer.expectedCashCents!, "USD"));
  462 |   await shot("08-payments");
  463 | 
  464 |   // A FIGURE ON SALES, now that a sale exists whose row is known: the cash
  465 |   // sale sits under Order + Counter at its own total, with nothing owed.
  466 |   await page.goto("/admin/sales?kind=order&channel=pos");
  467 |   const saleRow = page.locator("tbody tr", { hasText: paidOrderId.slice(0, 8) });
  468 |   await expect(saleRow, "the counter sale is on the Sales list under its channel").toHaveCount(1);
  469 |   await expect(saleRow.locator("td").nth(1)).toHaveText("Counter");
  470 |   await expect(saleRow.locator("td").nth(3)).toContainText(money(paidOrder.totalCents, "USD"));
  471 |   await expect(saleRow.locator("td").nth(3), "a paid sale is not marked still owed").not.toContainText("still owed");
  472 |   await expect(saleRow.locator("td").nth(4)).toHaveText("paid");
  473 |   await shot("08b-sales-row-of-the-cash-sale");
  474 | 
  475 |   // ────────────────────────────────────────────────────────────────────
  476 |   // 4 — THE CLIENT RECORD: what they bought, and what is owed.
  477 |   // ────────────────────────────────────────────────────────────────────
  478 |   const { data: customerRow } = await sb
  479 |     .from("customers")
  480 |     .select("id, display_name, email")
  481 |     .eq("tenant_id", JOURNEYS_TENANT_ID)
  482 |     .eq("email", buyer)
  483 |     .maybeSingle();
  484 |   const customerId = (customerRow as { id: string } | null)?.id;
  485 |   expect(customerId, "the cash sale must have created a customer to look up").toBeTruthy();
  486 | 
  487 |   await page.goto(`/admin/clients/${customerId}`);
  488 |   await expect(page.getByText(buyer)).toBeVisible({ timeout: 30_000 });
  489 |   const purchaseRow = page.locator("tbody tr", { hasText: paidOrderId.slice(0, 8) });
  490 |   await expect(purchaseRow, "the sale they paid for is on their record").toHaveCount(1);
  491 |   await expect(purchaseRow, "what they bought, at its own total").toContainText(
  492 |     money(paidOrder.totalCents, "USD"),
  493 |   );
  494 |   await expect(purchaseRow, "and nothing outstanding on it").toContainText(money(0, "USD"));
  495 |   await expect(page.locator("body"), "the collect action, refused in words").toContainText(
  496 |     "There is nothing to collect. Every record is settled.",
  497 |   );
  498 |   await shot("09-client-record");
  499 | 
  500 |   // ────────────────────────────────────────────────────────────────────
```