# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/VENUE-table-service.spec.ts >> VENUE-OP: walk-in booked, seated, fed, amended, collected and the table handed back
- Location: e2e/cases/VENUE-table-service.spec.ts:153:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-pos-sheet="walk-in"]')
Expected: 0
Received: 1
Timeout:  20000ms

Call log:
  - Expect "toHaveCount" with timeout 20000ms
  - waiting for locator('[data-pos-sheet="walk-in"]')
    24 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - link "Skip to main content" [ref=e4] [cursor=pointer]:
      - /url: "#tulala-main"
    - main "workspace surface" [ref=e5]:
      - generic [ref=e6]:
        - complementary [ref=e7]:
          - link "Skip to page content" [ref=e8] [cursor=pointer]:
            - /url: "#tulala-workspace-content"
          - generic [ref=e10]:
            - img [ref=e11]
            - generic [ref=e20]: Sell what you do, not what you ship
          - generic [ref=e21]:
            - button "QA Journeys (48-case fixture) Agency plan" [ref=e22] [cursor=pointer]:
              - generic [ref=e23]: QA
              - generic [ref=e24]:
                - generic [ref=e25]: QA Journeys (48-case fixture)
                - generic [ref=e26]: Agency plan
              - img [ref=e27]
            - navigation "Workspace sections" [ref=e29]:
              - 'button "Overview — Today''s snapshot: unread, pending actions, recent activity" [ref=e32] [cursor=pointer]':
                - img [ref=e33]
                - generic [ref=e37]: Overview
              - generic [ref=e38]:
                - generic [ref=e39]: Operate
                - button "Messages — All threads across active inquiries and bookings" [ref=e41] [cursor=pointer]:
                  - img [ref=e42]
                  - generic [ref=e45]: Messages
                  - generic "5 unread" [ref=e46]: "5"
                - button "Calendar — Scheduled shoots, holds, and deadlines" [ref=e48] [cursor=pointer]:
                  - img [ref=e49]
                  - generic [ref=e52]: Calendar
                - button "Appointments & Classes — Appointments, sessions and series, with the series editor" [ref=e54] [cursor=pointer]:
                  - img [ref=e55]
                  - generic [ref=e59]: Appointments & Classes
                - 'button "Reservations — The host stand: today''s book, arrivals, and who is still unseated" [ref=e61] [cursor=pointer]':
                  - img [ref=e62]
                  - generic [ref=e65]: Reservations
                - button "Orders — Every order taken, and what is still owed on each" [ref=e67] [cursor=pointer]:
                  - img [ref=e68]
                  - generic [ref=e71]: Orders
                - button "Projects — Jobs with a brief, a crew and a deadline" [ref=e73] [cursor=pointer]:
                  - img [ref=e74]
                  - generic [ref=e77]: Projects
                - button "Issues — Refunds, tickets, inquiries and jobs that need a human" [ref=e79] [cursor=pointer]:
                  - img [ref=e80]
                  - generic [ref=e82]: Issues
                  - generic "7 open" [ref=e83]: "7"
              - generic [ref=e84]:
                - generic [ref=e85]: Sell & manage
                - button "Menu & catalog — Workspace-owned items customers can order from your site" [ref=e87] [cursor=pointer]:
                  - img [ref=e88]
                  - generic [ref=e92]: Menu & catalog
                - button "Spaces & Resources — Open checks on the floor" [ref=e94] [cursor=pointer]:
                  - img [ref=e95]
                  - generic [ref=e99]: Spaces & Resources
              - generic [ref=e100]:
                - generic [ref=e101]: Relationships
                - button "Clients — Client accounts, trust tiers, and booking history" [ref=e103] [cursor=pointer]:
                  - img [ref=e104]
                  - generic [ref=e107]: Clients
                - button "Team — Everyone who works here, is bookable here, or has access" [ref=e109] [cursor=pointer]:
                  - img [ref=e110]
                  - generic [ref=e115]: Team
                - button "Pitches — Curated talent suggestions sent to clients" [ref=e117] [cursor=pointer]:
                  - img [ref=e118]
                  - generic [ref=e121]: Pitches
                - button "Reviews — Reported reviews, review photos, and rating integrity" [ref=e123] [cursor=pointer]:
                  - img [ref=e124]
                  - generic [ref=e126]: Reviews
              - generic [ref=e127]:
                - generic [ref=e128]: Money
                - button "Sales — Bookings, orders, appointments and registrations in one list" [ref=e130] [cursor=pointer]:
                  - img [ref=e131]
                  - generic [ref=e134]: Sales
                - button "Payments — Revenue, payouts, commissions, and payment status" [ref=e136] [cursor=pointer]:
                  - img [ref=e137]
                  - generic [ref=e140]: Payments
              - generic [ref=e141]:
                - generic [ref=e142]: Grow
                - button "Analytics — Funnel, money, website, and reviews" [ref=e144] [cursor=pointer]:
                  - img [ref=e145]
                  - generic [ref=e148]: Analytics
                - button "Website — Pages, posts, redirects, custom code, tracking, SEO, domain" [ref=e150] [cursor=pointer]:
                  - img [ref=e151]
                  - generic [ref=e154]: Website
                - button "Media — Workspace photo library, watermark control, and usage tracking" [ref=e156] [cursor=pointer]:
                  - img [ref=e157]
                  - generic [ref=e161]: Media
            - button "Settings — Account, plan, branding, integrations, team, and danger zone" [ref=e164] [cursor=pointer]:
              - img [ref=e165]
              - generic [ref=e168]: Settings
        - generic [ref=e169]:
          - generic [ref=e171]:
            - generic [ref=e172]:
              - generic [ref=e173]: QA Journeys (48-case fixture)
              - img [ref=e174]
              - generic [ref=e176]: Reservations
            - group "Workspace or point of sale" [ref=e178]:
              - button "Workspace" [pressed] [ref=e179] [cursor=pointer]
              - button "POS · Counter" [ref=e180] [cursor=pointer]:
                - img [ref=e181]
                - text: POS · Counter
                - img [ref=e185]
            - generic [ref=e187]:
              - button "Search workspace · ⌘K" [ref=e188] [cursor=pointer]:
                - img [ref=e189]
              - button "Create" [ref=e193] [cursor=pointer]:
                - img [ref=e194]
                - text: Create
                - img [ref=e197]
              - button "Notifications · 35 unread" [ref=e200] [cursor=pointer]:
                - img [ref=e201]
                - generic [ref=e204]: 9+
              - generic [ref=e205]: Agency
              - button "Open account menu — Signed in as QA Journeys Owner" [ref=e207] [cursor=pointer]:
                - img [ref=e209]
          - main [ref=e212]:
            - main [ref=e214]:
              - generic [ref=e215]:
                - generic [ref=e216]:
                  - generic [ref=e217]:
                    - heading "Live Floor" [level=1] [ref=e218]
                    - paragraph [ref=e219]: QA Floor · Dinner 12:00–22:00
                  - generic [ref=e220]: Live
                  - generic [ref=e222]:
                    - button "Walk-in" [ref=e223] [cursor=pointer]:
                      - img [ref=e224]
                      - text: Walk-in
                    - button "New reservation" [ref=e225] [cursor=pointer]:
                      - img [ref=e226]
                      - text: New reservation
                    - button "Pause online bookings" [disabled] [ref=e228]
                - generic [ref=e229]:
                  - alert [ref=e230]:
                    - paragraph [ref=e231]: The room is full for that turn.
                  - complementary [ref=e232]:
                    - tablist [ref=e234]:
                      - tab "Arriving 7" [selected] [ref=e235] [cursor=pointer]
                      - tab "Waiting 7" [ref=e236] [cursor=pointer]
                      - tab "Seated 0" [ref=e237] [cursor=pointer]
                    - list [ref=e238]:
                      - listitem [ref=e239]:
                        - button "12:00 C06 diner · 2 Waiting 115 min Waiting" [ref=e240] [cursor=pointer]:
                          - generic [ref=e241]: 12:00
                          - generic [ref=e242]:
                            - generic [ref=e243]: C06 diner · 2
                            - generic [ref=e244]: Waiting 115 min
                          - generic [ref=e245]: Waiting
                      - listitem [ref=e246]:
                        - button "12:00 C06 diner · 2 Waiting 115 min Waiting" [ref=e247] [cursor=pointer]:
                          - generic [ref=e248]: 12:00
                          - generic [ref=e249]:
                            - generic [ref=e250]: C06 diner · 2
                            - generic [ref=e251]: Waiting 115 min
                          - generic [ref=e252]: Waiting
                      - listitem [ref=e253]:
                        - button "12:00 C06 diner · 2 Waiting 115 min Waiting" [ref=e254] [cursor=pointer]:
                          - generic [ref=e255]: 12:00
                          - generic [ref=e256]:
                            - generic [ref=e257]: C06 diner · 2
                            - generic [ref=e258]: Waiting 115 min
                          - generic [ref=e259]: Waiting
                      - listitem [ref=e260]:
                        - button "12:30 C06 diner · 2 Waiting 85 min Waiting" [ref=e261] [cursor=pointer]:
                          - generic [ref=e262]: 12:30
                          - generic [ref=e263]:
                            - generic [ref=e264]: C06 diner · 2
                            - generic [ref=e265]: Waiting 85 min
                          - generic [ref=e266]: Waiting
                      - listitem [ref=e267]:
                        - button "13:30 C06 diner · 2 Waiting 25 min Waiting" [ref=e268] [cursor=pointer]:
                          - generic [ref=e269]: 13:30
                          - generic [ref=e270]:
                            - generic [ref=e271]: C06 diner · 2
                            - generic [ref=e272]: Waiting 25 min
                          - generic [ref=e273]: Waiting
                      - listitem [ref=e274]:
                        - button "13:30 C06 diner · 2 Waiting 25 min Waiting" [ref=e275] [cursor=pointer]:
                          - generic [ref=e276]: 13:30
                          - generic [ref=e277]:
                            - generic [ref=e278]: C06 diner · 2
                            - generic [ref=e279]: Waiting 25 min
                          - generic [ref=e280]: Waiting
                      - listitem [ref=e281]:
                        - button "13:30 C06 diner · 2 Waiting 25 min Waiting" [ref=e282] [cursor=pointer]:
                          - generic [ref=e283]: 13:30
                          - generic [ref=e284]:
                            - generic [ref=e285]: C06 diner · 2
                            - generic [ref=e286]: Waiting 25 min
                          - generic [ref=e287]: Waiting
                  - generic [ref=e288]:
                    - generic [ref=e289]:
                      - list [ref=e290]:
                        - listitem [ref=e291]: Free
                        - listitem [ref=e293]: Arriving
                        - listitem [ref=e295]: Held / late
                        - listitem [ref=e297]: Seated
                        - listitem [ref=e299]: Needs reset
                        - listitem [ref=e301]: Blocked
                      - tablist [ref=e303]:
                        - tab "Floor" [selected] [ref=e304] [cursor=pointer]
                        - tab "Timeline" [ref=e305] [cursor=pointer]
                        - tab "List" [ref=e306] [cursor=pointer]
                    - generic [ref=e308]:
                      - generic [ref=e309]:
                        - paragraph [ref=e310]: Tables
                        - list [ref=e311]:
                          - listitem [ref=e312]:
                            - button "T1 Free · 4" [ref=e313] [cursor=pointer]:
                              - generic [ref=e314]: T1
                              - generic [ref=e315]: Free · 4
                          - listitem [ref=e316]:
                            - button "T2 Free · 2" [ref=e317] [cursor=pointer]:
                              - generic [ref=e318]: T2
                              - generic [ref=e319]: Free · 2
                          - listitem [ref=e320]:
                            - button "T3 Needs reset" [ref=e321] [cursor=pointer]:
                              - generic [ref=e322]: T3
                              - generic [ref=e323]: Needs reset
                          - listitem [ref=e324]:
                            - button "T4 Free · 4" [ref=e325] [cursor=pointer]:
                              - generic [ref=e326]: T4
                              - generic [ref=e327]: Free · 4
                          - listitem [ref=e328]:
                            - button "T5 Free · 2" [ref=e329] [cursor=pointer]:
                              - generic [ref=e330]: T5
                              - generic [ref=e331]: Free · 2
                      - generic [ref=e332]:
                        - paragraph [ref=e333]: Booths
                        - list [ref=e334]:
                          - listitem [ref=e335]:
                            - button "B1 Free · 6" [ref=e336] [cursor=pointer]:
                              - generic [ref=e337]: B1
                              - generic [ref=e338]: Free · 6
                  - generic [ref=e339]:
                    - button "Close" [ref=e340] [cursor=pointer]
                    - dialog "Walk-in" [ref=e341]:
                      - generic [ref=e342]:
                        - generic [ref=e343]:
                          - heading "Walk-in" [level=2] [ref=e344]
                          - paragraph [ref=e345]: No account needed
                        - button "Close" [ref=e346] [cursor=pointer]:
                          - img [ref=e347]
                      - generic [ref=e351]:
                        - generic [ref=e352]:
                          - generic [ref=e353]:
                            - generic [ref=e354]: Party size
                            - generic [ref=e355]:
                              - button "One fewer guest" [ref=e356] [cursor=pointer]: −
                              - status [ref=e357]:
                                - text: "3"
                                - generic [ref=e358]: guests
                              - button "One more guest" [ref=e359] [cursor=pointer]: +
                          - generic [ref=e360]:
                            - generic [ref=e361]: Common
                            - generic [ref=e362]:
                              - button "2" [ref=e363] [cursor=pointer]
                              - button "4" [ref=e364] [cursor=pointer]
                              - button "6" [ref=e365] [cursor=pointer]
                        - generic [ref=e366]:
                          - generic [ref=e367]:
                            - generic [ref=e368] [cursor=pointer]: Name
                            - textbox "Name" [ref=e369]: Prove Tables 1789156502740
                            - paragraph [ref=e370]: Optional
                          - generic [ref=e371]:
                            - generic [ref=e372] [cursor=pointer]: Mobile for a text when ready
                            - textbox "Mobile for a text when ready" [disabled] [ref=e373]
                            - paragraph [ref=e374]: No text is sent yet; call the party by name.
                        - generic "Needs are not stored on a visit yet." [ref=e375]:
                          - generic [ref=e376]:
                            - checkbox "High chair" [disabled] [ref=e377]
                            - text: High chair
                          - generic [ref=e378]:
                            - checkbox "Step-free access" [disabled] [ref=e379]
                            - text: Step-free access
                          - generic [ref=e380]:
                            - checkbox "Quiet area" [disabled] [ref=e381]
                            - text: Quiet area
                          - generic [ref=e382]: Needs are not stored on a visit yet.
                        - generic [ref=e383]:
                          - paragraph [ref=e384]: Right now
                          - generic [ref=e385]:
                            - generic [ref=e387]: T1 · seats 4 · free
                            - button "Seat now" [ref=e388] [cursor=pointer]
                          - generic [ref=e389]:
                            - generic [ref=e391]: T4 · seats 4 · free
                            - button "Seat now" [ref=e392] [cursor=pointer]
                          - generic [ref=e393]:
                            - generic [ref=e394]:
                              - generic [ref=e395]: Waiting list
                              - generic [ref=e396]: 7 parties ahead
                            - button "Add to waiting list" [ref=e397] [cursor=pointer]
                      - button "Cancel" [ref=e400] [cursor=pointer]
    - dialog [ref=e401]:
      - separator "Resize drawer" [ref=e402]
      - banner [ref=e403]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e404]:
          - button "Copy link to this drawer" [ref=e406] [cursor=pointer]:
            - img [ref=e407]
          - generic [ref=e410]:
            - button "compact size" [ref=e412] [cursor=pointer]:
              - img [ref=e413]
            - button "half size" [ref=e417] [cursor=pointer]:
              - img [ref=e418]
            - button "full size" [ref=e422] [cursor=pointer]:
              - img [ref=e423]
          - button "Close" [ref=e426] [cursor=pointer]:
            - img [ref=e427]
    - status
```

# Test source

```ts
  100 |  * apart, for the cook and for this locator alike.
  101 |  */
  102 | function tableTicket(page: Page, code: string) {
  103 |   return page
  104 |     .locator("li[data-prep-ticket]")
  105 |     .filter({ hasText: /house pizza/i })
  106 |     // The card leads with the table's code and says "Table" beside it.
  107 |     // Adjacent spans concatenate in textContent ("T4Table"), so a word
  108 |     // boundary never comes; "not followed by another digit" is the real test.
  109 |     .filter({ hasText: new RegExp(`${code}(?![0-9])`, "i") })
  110 |     .filter({ hasText: /table/i })
  111 |     .first();
  112 | }
  113 | 
  114 | /**
  115 |  * Leave the point of sale the way a person does: the identity bar's
  116 |  * "Workspace | <mode>" switch. The POS has no rail of its own.
  117 |  */
  118 | async function leaveCounter(page: Page) {
  119 |   await page
  120 |     .getByRole("group", { name: /workspace or point of sale/i })
  121 |     .getByRole("button", { name: /^workspace$/i })
  122 |     .click();
  123 |   await expect(page.locator("[data-tulala-app-sidebar]")).toBeVisible({ timeout: 30_000 });
  124 | }
  125 | 
  126 | /** From the floor, open the check that belongs to a table's visit. */
  127 | async function openCheckFromFloor(page: Page, code: string): Promise<string> {
  128 |   await railButton(page, "Spaces").click();
  129 |   await expect(page).toHaveURL(/\/admin\/tables/, { timeout: 30_000 });
  130 |   const card = tableCard(page, code);
  131 |   await expect(card).toContainText(/occupied/i, { timeout: 30_000 });
  132 |   await card.getByRole("button", { name: /open check/i }).click();
  133 |   await expect(page).toHaveURL(/\/admin\/pos\?.*order=/, { timeout: 40_000 });
  134 |   const orderId = new URL(page.url()).searchParams.get("order");
  135 |   expect(orderId, "the floor must hand the counter the visit's own check").toBeTruthy();
  136 |   await expect(page.getByRole("button", { name: "House pizza" }).first()).toBeVisible({
  137 |     timeout: 30_000,
  138 |   });
  139 |   return orderId!;
  140 | }
  141 | 
  142 | /** Send what is on the check to the kitchen as a TABLE ticket. */
  143 | async function sendToKitchen(page: Page) {
  144 |   // A check opened from the floor carries its table, so `Here` sends a TABLE
  145 |   // ticket (the counter's `Send N items`); there is no destination select.
  146 |   const send = page.locator("[data-pos-send]");
  147 |   await send.click();
  148 |   // The counter's sign the ticket went: once the engine has answered the
  149 |   // action reads `Send again` (a second send is an amendment).
  150 |   await expect(send).toHaveText(/send again|enviar de nuevo|renvoyer/i, { timeout: 30_000 });
  151 | }
  152 | 
  153 | test("VENUE-OP: walk-in booked, seated, fed, amended, collected and the table handed back", async ({
  154 |   page,
  155 | }, testInfo) => {
  156 |   test.setTimeout(360_000);
  157 | 
  158 |   const stamp = Date.now();
  159 |   const guest = `Prove Tables ${stamp}`;
  160 |   const sb = isolatedService();
  161 | 
  162 |   // ── The desk ───────────────────────────────────────────────────────
  163 |   await signInJourneysStaff(page, "/admin");
  164 |   await assertWorkspaceIdentity(page);
  165 | 
  166 |   await railButton(page, "Reservations").click();
  167 |   await expect(page).toHaveURL(/\/admin\/reservations/, { timeout: 30_000 });
  168 |   // The Live Floor (`LiveFloor.dc.html`).
  169 |   await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^live floor$/i);
  170 |   // A read that failed and an empty book are different screens; neither is
  171 |   // the one this journey runs on.
  172 |   await expect(page.getByText(/we could not load the book/i)).toHaveCount(0);
  173 |   await expect(page.getByText(/no venue yet|no service windows yet/i)).toHaveCount(0);
  174 |   await expect(page.getByRole("tab", { name: /^arriving/i })).toBeVisible();
  175 | 
  176 |   // Take the party (T07, the Walk-in sheet). Three covers, because a two-top
  177 |   // will not hold them and that is what makes the table choice a real one.
  178 |   // A click that lands before hydration is a click on nothing, so the door
  179 |   // is knocked until the sheet is there.
  180 |   const walkInSheet = page.locator('[data-pos-sheet="walk-in"]');
  181 |   for (let attempt = 0; attempt < 5 && !(await walkInSheet.isVisible()); attempt += 1) {
  182 |     await page.locator("[data-floor-walk-in]").click();
  183 |     await page.waitForTimeout(1_000);
  184 |   }
  185 |   await expect(walkInSheet).toBeVisible({ timeout: 20_000 });
  186 |   await walkInSheet.getByLabel(/^name$/i).fill(guest);
  187 |   await walkInSheet.getByRole("button", { name: /one more guest/i }).click();
  188 |   await expect(walkInSheet.locator("[data-floor-party]")).toContainText("3");
  189 |   // RIGHT NOW offers only the tables that fit three: never a two-top.
  190 |   await expect(walkInSheet.locator('[data-floor-walkin-fit="T2"]'), "a two-top must not be offered to a party of three").toHaveCount(0);
  191 |   await expect(walkInSheet.locator('[data-floor-walkin-fit="T4"]')).toBeVisible();
  192 |   await walkInSheet.locator("[data-floor-walkin-waitlist]").click();
  193 |   // After the fidelity re-skin the walk-in sheet leaves a POS overlay up;
  194 |   // the Waiting tab is in the page behind it and cannot be clicked until
  195 |   // the overlay is dismissed. Same end state: the party on tonight's book.
  196 |   const overlayClose = page.locator('[data-pos-overlay] [aria-label="Close"]');
  197 |   if (await overlayClose.isVisible().catch(() => false)) {
  198 |     await overlayClose.click();
  199 |   }
> 200 |   await expect(walkInSheet).toHaveCount(0, { timeout: 20_000 });
      |                             ^ Error: expect(locator).toHaveCount(expected) failed
  201 | 
  202 |   // The party lands on tonight's book: on the Waiting list (here, no table yet).
  203 |   await page.getByRole("tab", { name: /^waiting/i }).click();
  204 |   const bookRow = page.locator("[data-floor-party]").filter({ hasText: guest });
  205 |   await expect(bookRow, "the walk-in must land on tonight's book").toBeVisible({
  206 |     timeout: 30_000,
  207 |   });
  208 |   await expect(bookRow).toContainText(/waiting/i);
  209 |   await page.screenshot({ path: testInfo.outputPath("desk-walk-in-on-the-book.png"), fullPage: true });
  210 | 
  211 |   // ── Seat them (T08 → T05) ──────────────────────────────────────────
  212 |   await bookRow.click();
  213 |   const waiting = page.locator('[data-pos-sheet="waiting"]');
  214 |   await expect(waiting).toBeVisible();
  215 |   await waiting.locator("[data-floor-waiting]").filter({ hasText: guest }).getByRole("button", { name: /^seat now$/i }).click();
  216 |   const seatSheet = page.locator('[data-pos-sheet="seat-party"]');
  217 |   await expect(seatSheet).toBeVisible();
  218 |   await expect(seatSheet).toContainText(new RegExp(`Seat ${guest} · 3`));
  219 |   // Only tables that FIT are offered. A party of three must never be shown a
  220 |   // two-top, and the fixture's floor has several.
  221 |   await expect(
  222 |     seatSheet.getByRole("radio", { name: /^T2 · seats/ }),
  223 |     "a two-top must not be offered to a party of three",
  224 |   ).toHaveCount(0);
  225 |   const fourTop = seatSheet.getByRole("radio", { name: /^T4 · seats/ });
  226 |   await expect(fourTop).toBeVisible();
  227 |   await fourTop.click();
  228 |   await seatSheet.getByRole("button", { name: /^seat 3 guests at T4$/i }).click();
  229 | 
  230 |   // The Seated tab shows the party at the table it chose.
  231 |   await page.getByRole("tab", { name: /^seated/i }).click();
  232 |   const seatedTile = page.locator('[data-floor-seated="T4"]');
  233 |   await expect(seatedTile, "the desk must show the party seated at the table it chose").toContainText(new RegExp(guest), { timeout: 30_000 });
  234 |   await expect(seatedTile).toContainText(/seated/i);
  235 |   await expect(seatedTile).toContainText("T4");
  236 |   await page.screenshot({ path: testInfo.outputPath("desk-party-seated.png"), fullPage: true });
  237 | 
  238 |   // The booking row agrees before the floor is even opened: the admission is
  239 |   // on the table, everybody is admitted, and the stamp is real.
  240 |   const seatedRow = await venueJourneyRows(guest);
  241 |   expect(seatedRow.admission, "the walk-in must exist as an admission").not.toBeNull();
  242 |   expect(seatedRow.admission?.spaceId).toBe(seatedRow.tableFourTopId);
  243 |   expect(seatedRow.admission?.partySize).toBe(3);
  244 |   expect(seatedRow.admission?.admittedCount).toBe(3);
  245 |   expect(seatedRow.admission?.seatedAt).not.toBeNull();
  246 | 
  247 |   // ── The floor ──────────────────────────────────────────────────────
  248 |   await railButton(page, "Spaces").click();
  249 |   await expect(page).toHaveURL(/\/admin\/tables/, { timeout: 30_000 });
  250 |   await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^tables$/i);
  251 |   await expect(page.getByText(/we could not load the floor/i)).toHaveCount(0);
  252 | 
  253 |   // Every time on this screen belongs to the venue, and the screen says so.
  254 |   await expect(
  255 |     page.getByText(new RegExp(`times shown in ${VENUE_ZONE}`, "i")),
  256 |     "the floor must name the clock it prints in",
  257 |   ).toBeVisible();
  258 | 
  259 |   const fourTopCard = tableCard(page, "T4");
  260 |   await expect(fourTopCard).toContainText(/occupied/i);
  261 |   await expect(fourTopCard).toContainText(/table check/i);
  262 |   await expect(fourTopCard, "the card must carry the party it was opened for").toContainText(
  263 |     /party of 3/i,
  264 |   );
  265 |   await page.screenshot({ path: testInfo.outputPath("floor-t4-occupied.png"), fullPage: true });
  266 | 
  267 |   // ── The check ──────────────────────────────────────────────────────
  268 |   await fourTopCard.getByRole("button", { name: /open check/i }).click();
  269 |   await expect(page).toHaveURL(/\/admin\/pos\?.*order=/, { timeout: 40_000 });
  270 | 
  271 |   const orderId = new URL(page.url()).searchParams.get("order");
  272 |   expect(orderId, "the floor must hand the counter the visit's own check").toBeTruthy();
  273 | 
  274 |   const pizza = page.getByRole("button", { name: "House pizza" }).first();
  275 |   await expect(pizza).toBeVisible({ timeout: 30_000 });
  276 |   await pizza.click();
  277 |   const charge = page.locator("[data-pos-charge]").first();
  278 |   await expect(charge).toHaveText(/\$18\.00/, { timeout: 30_000 });
  279 | 
  280 |   // ── To the kitchen ─────────────────────────────────────────────────
  281 |   await sendToKitchen(page);
  282 |   await leaveCounter(page);
  283 | 
  284 |   await openPreparation(page);
  285 |   // The station board (T26): `Kitchen`, the venue's clock, tabs Queued · Preparing · Ready.
  286 |   await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^kitchen/i);
  287 |   await expect(page.getByText(/we could not load the board/i)).toHaveCount(0);
  288 |   await expect(
  289 |     page.getByText(new RegExp(`times shown in ${VENUE_ZONE}`, "i")),
  290 |     "the kitchen must name the clock it prints in",
  291 |   ).toBeVisible();
  292 | 
  293 |   await page.getByRole("tab", { name: /^queued/i }).click();
  294 |   const ticket = tableTicket(page, "T4");
  295 |   await expect(ticket, "the kitchen must see a ticket that names the table").toBeVisible({
  296 |     timeout: 30_000,
  297 |   });
  298 |   // Every line of a first send is new; the pill is its own element because
  299 |   // textContent runs the spans together ("T4TableHouse pizzaNew").
  300 |   await expect(ticket.getByText("New", { exact: true })).toBeVisible();
```