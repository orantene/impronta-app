# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-OP send: staff prices a line and sends the offer
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:211:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByRole('heading', { level: 1 })
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { level: 1 })
    9 × locator resolved to <h1 class="text-admin-ink">…</h1>
      - unexpected value "hidden"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - link "Skip to main content" [ref=e3] [cursor=pointer]:
      - /url: "#tulala-main"
    - main "workspace surface" [ref=e4]:
      - generic [ref=e5]:
        - complementary [ref=e6]:
          - link "Skip to page content" [ref=e7] [cursor=pointer]:
            - /url: "#tulala-workspace-content"
          - generic [ref=e9]:
            - img [ref=e10]
            - generic [ref=e19]: Sell what you do, not what you ship
          - generic [ref=e20]:
            - button "QA Journeys (48-case fixture) Agency plan" [ref=e21] [cursor=pointer]:
              - generic [ref=e22]: QA
              - generic [ref=e23]:
                - generic [ref=e24]: QA Journeys (48-case fixture)
                - generic [ref=e25]: Agency plan
              - img [ref=e26]
            - navigation "Workspace sections" [ref=e28]:
              - 'button "Overview — Today''s snapshot: unread, pending actions, recent activity" [ref=e31] [cursor=pointer]':
                - img [ref=e32]
                - generic [ref=e36]: Overview
              - generic [ref=e37]:
                - generic [ref=e38]: Operate
                - button "Messages — All threads across active inquiries and bookings" [ref=e40] [cursor=pointer]:
                  - img [ref=e41]
                  - generic [ref=e44]: Messages
                  - generic "5 unread" [ref=e45]: "5"
                - button "Calendar — Scheduled shoots, holds, and deadlines" [ref=e47] [cursor=pointer]:
                  - img [ref=e48]
                  - generic [ref=e51]: Calendar
                - button "Appointments & Classes — Appointments, sessions and series, with the series editor" [ref=e53] [cursor=pointer]:
                  - img [ref=e54]
                  - generic [ref=e58]: Appointments & Classes
                - 'button "Reservations — The host stand: today''s book, arrivals, and who is still unseated" [ref=e60] [cursor=pointer]':
                  - img [ref=e61]
                  - generic [ref=e64]: Reservations
                - button "Orders — Every order taken, and what is still owed on each" [ref=e66] [cursor=pointer]:
                  - img [ref=e67]
                  - generic [ref=e70]: Orders
                - button "Projects — Jobs with a brief, a crew and a deadline" [ref=e72] [cursor=pointer]:
                  - img [ref=e73]
                  - generic [ref=e76]: Projects
                - button "Issues — Refunds, tickets, inquiries and jobs that need a human" [ref=e78] [cursor=pointer]:
                  - img [ref=e79]
                  - generic [ref=e81]: Issues
                  - generic "7 open" [ref=e82]: "7"
              - generic [ref=e83]:
                - generic [ref=e84]: Sell & manage
                - button "Menu & catalog — Workspace-owned items customers can order from your site" [ref=e86] [cursor=pointer]:
                  - img [ref=e87]
                  - generic [ref=e91]: Menu & catalog
                - button "Spaces & Resources — Open checks on the floor" [ref=e93] [cursor=pointer]:
                  - img [ref=e94]
                  - generic [ref=e98]: Spaces & Resources
              - generic [ref=e99]:
                - generic [ref=e100]: Relationships
                - button "Clients — Client accounts, trust tiers, and booking history" [ref=e102] [cursor=pointer]:
                  - img [ref=e103]
                  - generic [ref=e106]: Clients
                - button "Team — Everyone who works here, is bookable here, or has access" [ref=e108] [cursor=pointer]:
                  - img [ref=e109]
                  - generic [ref=e114]: Team
                - button "Pitches — Curated talent suggestions sent to clients" [ref=e116] [cursor=pointer]:
                  - img [ref=e117]
                  - generic [ref=e120]: Pitches
                - button "Reviews — Reported reviews, review photos, and rating integrity" [ref=e122] [cursor=pointer]:
                  - img [ref=e123]
                  - generic [ref=e125]: Reviews
              - generic [ref=e126]:
                - generic [ref=e127]: Money
                - button "Sales — Bookings, orders, appointments and registrations in one list" [ref=e129] [cursor=pointer]:
                  - img [ref=e130]
                  - generic [ref=e133]: Sales
                - button "Payments — Revenue, payouts, commissions, and payment status" [ref=e135] [cursor=pointer]:
                  - img [ref=e136]
                  - generic [ref=e139]: Payments
              - generic [ref=e140]:
                - generic [ref=e141]: Grow
                - button "Analytics — Funnel, money, website, and reviews" [ref=e143] [cursor=pointer]:
                  - img [ref=e144]
                  - generic [ref=e147]: Analytics
                - button "Website — Pages, posts, redirects, custom code, tracking, SEO, domain" [ref=e149] [cursor=pointer]:
                  - img [ref=e150]
                  - generic [ref=e153]: Website
                - button "Media — Workspace photo library, watermark control, and usage tracking" [ref=e155] [cursor=pointer]:
                  - img [ref=e156]
                  - generic [ref=e160]: Media
            - button "Settings — Account, plan, branding, integrations, team, and danger zone" [ref=e163] [cursor=pointer]:
              - img [ref=e164]
              - generic [ref=e167]: Settings
        - generic [ref=e168]:
          - generic [ref=e170]:
            - generic [ref=e171]:
              - generic [ref=e172]: QA Journeys (48-case fixture)
              - img [ref=e173]
              - generic [ref=e175]: Messages
            - group "Workspace or point of sale" [ref=e177]:
              - button "Workspace" [pressed] [ref=e178] [cursor=pointer]
              - button "POS · Counter" [ref=e179] [cursor=pointer]:
                - img [ref=e180]
                - text: POS · Counter
                - img [ref=e184]
            - generic [ref=e186]:
              - button "Search workspace · ⌘K" [ref=e187] [cursor=pointer]:
                - img [ref=e188]
              - button "Create" [ref=e192] [cursor=pointer]:
                - img [ref=e193]
                - text: Create
                - img [ref=e196]
              - button "Notifications · 38 unread" [ref=e199] [cursor=pointer]:
                - img [ref=e200]
                - generic [ref=e203]: 9+
              - generic [ref=e204]: Agency
              - button "Open account menu — Signed in as QA Journeys Owner" [ref=e206] [cursor=pointer]:
                - img [ref=e208]
          - main [ref=e211]:
            - generic [ref=e213]:
              - complementary [ref=e214]:
                - generic [ref=e215]:
                  - generic [ref=e216]:
                    - heading "Inbox" [level=3] [ref=e217]
                    - generic [ref=e218]:
                      - generic [ref=e219]: 28 threads
                      - button "Select" [ref=e220] [cursor=pointer]:
                        - img [ref=e221]
                        - text: Select
                  - generic [ref=e227]:
                    - textbox "Search clients, briefs…" [ref=e228]
                    - img [ref=e230]
                    - generic [ref=e233]: ⌘K
                  - generic [ref=e234]:
                    - button "All" [ref=e235] [cursor=pointer]
                    - button "Needs me (28)" [ref=e236] [cursor=pointer]
                    - button "Triage (24)" [ref=e237] [cursor=pointer]:
                      - img [ref=e239]
                      - text: Triage (24)
                    - button "Unread (59)" [ref=e241] [cursor=pointer]
                    - button "Coordinating 35" [ref=e242] [cursor=pointer]:
                      - img [ref=e244]
                      - text: Coordinating
                      - generic [ref=e246]: "35"
                    - button "Inquiry" [ref=e247] [cursor=pointer]
                    - button "Offer pending" [ref=e248] [cursor=pointer]
                    - button "Approved" [ref=e249] [cursor=pointer]
                    - button "Booked" [ref=e250] [cursor=pointer]
                    - button "Past" [ref=e251] [cursor=pointer]
                - generic [ref=e252]:
                  - generic [ref=e253]: Today
                  - button "Cora Cuevas NEW now Cora Cuevas Inviting talent to the shortlist 2 1 Coord QA" [ref=e255] [cursor=pointer]:
                    - img [ref=e258]
                    - generic [ref=e261]:
                      - generic [ref=e262]:
                        - generic "Cora Cuevas" [ref=e263]
                        - generic [ref=e264]: NEW
                        - generic [ref=e265]: now
                      - generic [ref=e267]: Cora Cuevas
                      - generic [ref=e268]:
                        - generic [ref=e269]: Inviting talent to the shortlist
                        - generic [ref=e270]: "2"
                      - generic [ref=e271]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e273]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e282]':
                          - generic [ref=e283]: Coord
                          - img [ref=e285]
                          - text: QA
                  - button "Cora Cuevas NEW now Cora Cuevas Inviting talent to the shortlist 2 1 Coord QA" [ref=e289] [cursor=pointer]:
                    - img [ref=e292]
                    - generic [ref=e295]:
                      - generic [ref=e296]:
                        - generic "Cora Cuevas" [ref=e297]
                        - generic [ref=e298]: NEW
                        - generic [ref=e299]: now
                      - generic [ref=e301]: Cora Cuevas
                      - generic [ref=e302]:
                        - generic [ref=e303]: Inviting talent to the shortlist
                        - generic [ref=e304]: "2"
                      - generic [ref=e305]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e307]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e316]':
                          - generic [ref=e317]: Coord
                          - img [ref=e319]
                          - text: QA
                  - button "Cora Cuevas NEW now Cora Cuevas Inviting talent to the shortlist 7 1 Coord QA" [ref=e323] [cursor=pointer]:
                    - img [ref=e326]
                    - generic [ref=e329]:
                      - generic [ref=e330]:
                        - generic "Cora Cuevas" [ref=e331]
                        - generic [ref=e332]: NEW
                        - generic [ref=e333]: now
                      - generic [ref=e335]: Cora Cuevas
                      - generic [ref=e336]:
                        - generic [ref=e337]: Inviting talent to the shortlist
                        - generic [ref=e338]: "7"
                      - generic [ref=e339]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e341]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e350]':
                          - generic [ref=e351]: Coord
                          - img [ref=e353]
                          - text: QA
                  - generic [ref=e356]: This week
                  - button "Cora Cuevas NEW 2d Cora Cuevas Inviting talent to the shortlist 1 1 Coord QA" [ref=e358] [cursor=pointer]:
                    - img [ref=e361]
                    - generic [ref=e364]:
                      - generic [ref=e365]:
                        - generic "Cora Cuevas" [ref=e366]
                        - generic [ref=e367]: NEW
                        - generic [ref=e368]: 2d
                      - generic [ref=e370]: Cora Cuevas
                      - generic [ref=e371]:
                        - generic [ref=e372]: Inviting talent to the shortlist
                        - generic [ref=e373]: "1"
                      - generic [ref=e374]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e376]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e385]':
                          - generic [ref=e386]: Coord
                          - img [ref=e388]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 1 Coord QA" [ref=e392] [cursor=pointer]:
                    - img [ref=e395]
                    - generic [ref=e398]:
                      - generic [ref=e399]:
                        - generic "Cora Cuevas" [ref=e400]
                        - generic [ref=e401]: NEW
                        - generic [ref=e402]: 2d
                      - generic [ref=e403]:
                        - generic [ref=e404]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e405]: 0/1
                      - generic [ref=e406]:
                        - generic [ref=e407]: Coordinating · 0/1 confirmed
                        - generic [ref=e408]: "1"
                      - generic [ref=e409]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e411]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e420]':
                          - generic [ref=e421]: Coord
                          - img [ref=e423]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 1 Coord QA" [ref=e427] [cursor=pointer]:
                    - img [ref=e430]
                    - generic [ref=e433]:
                      - generic [ref=e434]:
                        - generic "Cora Cuevas" [ref=e435]
                        - generic [ref=e436]: NEW
                        - generic [ref=e437]: 2d
                      - generic [ref=e438]:
                        - generic [ref=e439]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e440]: 0/1
                      - generic [ref=e441]:
                        - generic [ref=e442]: Coordinating · 0/1 confirmed
                        - generic [ref=e443]: "1"
                      - generic [ref=e444]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e446]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e455]':
                          - generic [ref=e456]: Coord
                          - img [ref=e458]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 1 Coord QA" [ref=e462] [cursor=pointer]:
                    - img [ref=e465]
                    - generic [ref=e468]:
                      - generic [ref=e469]:
                        - generic "Cora Cuevas" [ref=e470]
                        - generic [ref=e471]: NEW
                        - generic [ref=e472]: 2d
                      - generic [ref=e473]:
                        - generic [ref=e474]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e475]: 0/1
                      - generic [ref=e476]:
                        - generic [ref=e477]: Coordinating · 0/1 confirmed
                        - generic [ref=e478]: "1"
                      - generic [ref=e479]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e481]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e490]':
                          - generic [ref=e491]: Coord
                          - img [ref=e493]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 1 Coord QA" [ref=e497] [cursor=pointer]:
                    - img [ref=e500]
                    - generic [ref=e503]:
                      - generic [ref=e504]:
                        - generic "Cora Cuevas" [ref=e505]
                        - generic [ref=e506]: NEW
                        - generic [ref=e507]: 2d
                      - generic [ref=e508]:
                        - generic [ref=e509]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e510]: 0/1
                      - generic [ref=e511]:
                        - generic [ref=e512]: Coordinating · 0/1 confirmed
                        - generic [ref=e513]: "1"
                      - generic [ref=e514]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e516]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e525]':
                          - generic [ref=e526]: Coord
                          - img [ref=e528]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas Inviting talent to the shortlist 1 1 Coord QA" [ref=e532] [cursor=pointer]:
                    - img [ref=e535]
                    - generic [ref=e538]:
                      - generic [ref=e539]:
                        - generic "Cora Cuevas" [ref=e540]
                        - generic [ref=e541]: NEW
                        - generic [ref=e542]: 2d
                      - generic [ref=e544]: Cora Cuevas
                      - generic [ref=e545]:
                        - generic [ref=e546]: Inviting talent to the shortlist
                        - generic [ref=e547]: "1"
                      - generic [ref=e548]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e550]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e559]':
                          - generic [ref=e560]: Coord
                          - img [ref=e562]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 1 Coord QA" [ref=e566] [cursor=pointer]:
                    - img [ref=e569]
                    - generic [ref=e572]:
                      - generic [ref=e573]:
                        - generic "Cora Cuevas" [ref=e574]
                        - generic [ref=e575]: NEW
                        - generic [ref=e576]: 2d
                      - generic [ref=e577]:
                        - generic [ref=e578]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e579]: 0/1
                      - generic [ref=e580]:
                        - generic [ref=e581]: Coordinating · 0/1 confirmed
                        - generic [ref=e582]: "1"
                      - generic [ref=e583]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e585]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e594]':
                          - generic [ref=e595]: Coord
                          - img [ref=e597]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 1 Coord QA" [ref=e601] [cursor=pointer]:
                    - img [ref=e604]
                    - generic [ref=e607]:
                      - generic [ref=e608]:
                        - generic "Cora Cuevas" [ref=e609]
                        - generic [ref=e610]: NEW
                        - generic [ref=e611]: 2d
                      - generic [ref=e612]:
                        - generic [ref=e613]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e614]: 0/1
                      - generic [ref=e615]:
                        - generic [ref=e616]: Coordinating · 0/1 confirmed
                        - generic [ref=e617]: "1"
                      - generic [ref=e618]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e620]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e629]':
                          - generic [ref=e630]: Coord
                          - img [ref=e632]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted Inviting talent to the shortlist 1 1 Coord QA" [ref=e636] [cursor=pointer]:
                    - img [ref=e639]
                    - generic [ref=e642]:
                      - generic [ref=e643]:
                        - generic "Cora Cuevas" [ref=e644]
                        - generic [ref=e645]: NEW
                        - generic [ref=e646]: 2d
                      - generic [ref=e647]:
                        - generic [ref=e648]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e649]: 0/1
                      - generic [ref=e650]:
                        - generic [ref=e651]: Inviting talent to the shortlist
                        - generic [ref=e652]: "1"
                      - generic [ref=e653]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e655]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e664]':
                          - generic [ref=e665]: Coord
                          - img [ref=e667]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas Inviting talent to the shortlist 1 1 Coord QA" [ref=e671] [cursor=pointer]:
                    - img [ref=e674]
                    - generic [ref=e677]:
                      - generic [ref=e678]:
                        - generic "Cora Cuevas" [ref=e679]
                        - generic [ref=e680]: NEW
                        - generic [ref=e681]: 2d
                      - generic [ref=e683]: Cora Cuevas
                      - generic [ref=e684]:
                        - generic [ref=e685]: Inviting talent to the shortlist
                        - generic [ref=e686]: "1"
                      - generic [ref=e687]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e689]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e698]':
                          - generic [ref=e699]: Coord
                          - img [ref=e701]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas Inviting talent to the shortlist 1 1 Coord QA" [ref=e705] [cursor=pointer]:
                    - img [ref=e708]
                    - generic [ref=e711]:
                      - generic [ref=e712]:
                        - generic "Cora Cuevas" [ref=e713]
                        - generic [ref=e714]: NEW
                        - generic [ref=e715]: 2d
                      - generic [ref=e717]: Cora Cuevas
                      - generic [ref=e718]:
                        - generic [ref=e719]: Inviting talent to the shortlist
                        - generic [ref=e720]: "1"
                      - generic [ref=e721]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e723]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e732]':
                          - generic [ref=e733]: Coord
                          - img [ref=e735]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted Inviting talent to the shortlist 1 1 Coord QA" [ref=e739] [cursor=pointer]:
                    - img [ref=e742]
                    - generic [ref=e745]:
                      - generic [ref=e746]:
                        - generic "Cora Cuevas" [ref=e747]
                        - generic [ref=e748]: NEW
                        - generic [ref=e749]: 2d
                      - generic [ref=e750]:
                        - generic [ref=e751]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e752]: 0/1
                      - generic [ref=e753]:
                        - generic [ref=e754]: Inviting talent to the shortlist
                        - generic [ref=e755]: "1"
                      - generic [ref=e756]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e758]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e767]':
                          - generic [ref=e768]: Coord
                          - img [ref=e770]
                          - text: QA
                  - generic [ref=e773]: Today
                  - button "Cora Cuevas now Cora Cuevas Inviting talent to the shortlist 2 1 Coord QA" [ref=e775] [cursor=pointer]:
                    - img [ref=e778]
                    - generic [ref=e781]:
                      - generic [ref=e782]:
                        - generic "Cora Cuevas" [ref=e783]
                        - generic [ref=e784]: now
                      - generic [ref=e786]: Cora Cuevas
                      - generic [ref=e787]:
                        - generic [ref=e788]: Inviting talent to the shortlist
                        - generic [ref=e789]: "2"
                      - generic [ref=e790]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e792]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e801]':
                          - generic [ref=e802]: Coord
                          - img [ref=e804]
                          - text: QA
                  - button "Nadia Varela 17h Nadia Varela 1 of 1 talent accepted All talent confirmed · drafting offer 1 Coord QA" [ref=e808] [cursor=pointer]:
                    - img [ref=e811]
                    - generic [ref=e814]:
                      - generic [ref=e815]:
                        - generic "Nadia Varela" [ref=e816]
                        - generic [ref=e817]: 17h
                      - generic [ref=e818]:
                        - generic [ref=e819]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e820]: 1/1
                      - generic [ref=e822]: All talent confirmed · drafting offer
                      - generic [ref=e823]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e825]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e834]':
                          - generic [ref=e835]: Coord
                          - img [ref=e837]
                          - text: QA
                  - button "Nadia Varela 22h Nadia Varela 1 of 1 talent accepted Client approved · prep production 3 3 Coord QA" [ref=e841] [cursor=pointer]:
                    - img [ref=e844]
                    - generic [ref=e847]:
                      - generic [ref=e848]:
                        - generic "Nadia Varela" [ref=e849]
                        - generic [ref=e850]: 22h
                      - generic [ref=e851]:
                        - generic [ref=e852]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e853]: 1/1
                      - generic [ref=e854]:
                        - generic [ref=e855]: Client approved · prep production
                        - generic [ref=e856]: "3"
                      - generic [ref=e857]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e859]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e868]':
                          - generic [ref=e869]: Coord
                          - img [ref=e871]
                          - text: QA
                  - button "Nadia Varela 22h Nadia Varela 1 of 1 talent accepted Client approved · prep production 3 3 Coord QA" [ref=e875] [cursor=pointer]:
                    - img [ref=e878]
                    - generic [ref=e881]:
                      - generic [ref=e882]:
                        - generic "Nadia Varela" [ref=e883]
                        - generic [ref=e884]: 22h
                      - generic [ref=e885]:
                        - generic [ref=e886]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e887]: 1/1
                      - generic [ref=e888]:
                        - generic [ref=e889]: Client approved · prep production
                        - generic [ref=e890]: "3"
                      - generic [ref=e891]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e893]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e902]':
                          - generic [ref=e903]: Coord
                          - img [ref=e905]
                          - text: QA
                  - button "Nadia Varela 22h Nadia Varela 1 of 1 talent accepted Client approved · prep production 3 3 Coord QA" [ref=e909] [cursor=pointer]:
                    - img [ref=e912]
                    - generic [ref=e915]:
                      - generic [ref=e916]:
                        - generic "Nadia Varela" [ref=e917]
                        - generic [ref=e918]: 22h
                      - generic [ref=e919]:
                        - generic [ref=e920]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e921]: 1/1
                      - generic [ref=e922]:
                        - generic [ref=e923]: Client approved · prep production
                        - generic [ref=e924]: "3"
                      - generic [ref=e925]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e927]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e936]':
                          - generic [ref=e937]: Coord
                          - img [ref=e939]
                          - text: QA
                  - button "Nadia Varela 22h Nadia Varela 1 of 1 talent accepted Client approved · prep production 3 3 Coord QA" [ref=e943] [cursor=pointer]:
                    - img [ref=e946]
                    - generic [ref=e949]:
                      - generic [ref=e950]:
                        - generic "Nadia Varela" [ref=e951]
                        - generic [ref=e952]: 22h
                      - generic [ref=e953]:
                        - generic [ref=e954]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e955]: 1/1
                      - generic [ref=e956]:
                        - generic [ref=e957]: Client approved · prep production
                        - generic [ref=e958]: "3"
                      - generic [ref=e959]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e961]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e970]':
                          - generic [ref=e971]: Coord
                          - img [ref=e973]
                          - text: QA
                  - button "Nadia Varela 22h Nadia Varela 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 Coord QA" [ref=e977] [cursor=pointer]:
                    - img [ref=e980]
                    - generic [ref=e983]:
                      - generic [ref=e984]:
                        - generic "Nadia Varela" [ref=e985]
                        - generic [ref=e986]: 22h
                      - generic [ref=e987]:
                        - generic [ref=e988]: Nadia Varela
                        - generic "0 of 1 talent accepted" [ref=e989]: 0/1
                      - generic [ref=e991]: Coordinating · 0/1 confirmed
                      - generic [ref=e992]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e994]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1003]':
                          - generic [ref=e1004]: Coord
                          - img [ref=e1006]
                          - text: QA
                  - generic [ref=e1009]: This week
                  - button "Cora Cuevas 2d Cora Cuevas Inviting talent to the shortlist 1 Coord QA" [ref=e1011] [cursor=pointer]:
                    - img [ref=e1014]
                    - generic [ref=e1017]:
                      - generic [ref=e1018]:
                        - generic "Cora Cuevas" [ref=e1019]
                        - generic [ref=e1020]: 2d
                      - generic [ref=e1022]: Cora Cuevas
                      - generic [ref=e1024]: Inviting talent to the shortlist
                      - generic [ref=e1025]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1027]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1036]':
                          - generic [ref=e1037]: Coord
                          - img [ref=e1039]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas Inviting talent to the shortlist 1 Coord QA" [ref=e1043] [cursor=pointer]:
                    - img [ref=e1046]
                    - generic [ref=e1049]:
                      - generic [ref=e1050]:
                        - generic "Cora Cuevas" [ref=e1051]
                        - generic [ref=e1052]: 2d
                      - generic [ref=e1054]: Cora Cuevas
                      - generic [ref=e1056]: Inviting talent to the shortlist
                      - generic [ref=e1057]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1059]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1068]':
                          - generic [ref=e1069]: Coord
                          - img [ref=e1071]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas Inviting talent to the shortlist 1 Coord QA" [ref=e1075] [cursor=pointer]:
                    - img [ref=e1078]
                    - generic [ref=e1081]:
                      - generic [ref=e1082]:
                        - generic "Cora Cuevas" [ref=e1083]
                        - generic [ref=e1084]: 2d
                      - generic [ref=e1086]: Cora Cuevas
                      - generic [ref=e1088]: Inviting talent to the shortlist
                      - generic [ref=e1089]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1091]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1100]':
                          - generic [ref=e1101]: Coord
                          - img [ref=e1103]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 Coord QA" [ref=e1107] [cursor=pointer]:
                    - img [ref=e1110]
                    - generic [ref=e1113]:
                      - generic [ref=e1114]:
                        - generic "Cora Cuevas" [ref=e1115]
                        - generic [ref=e1116]: 2d
                      - generic [ref=e1117]:
                        - generic [ref=e1118]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1119]: 0/1
                      - generic [ref=e1121]: Coordinating · 0/1 confirmed
                      - generic [ref=e1122]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1124]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1133]':
                          - generic [ref=e1134]: Coord
                          - img [ref=e1136]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 Coord QA" [ref=e1140] [cursor=pointer]:
                    - img [ref=e1143]
                    - generic [ref=e1146]:
                      - generic [ref=e1147]:
                        - generic "Cora Cuevas" [ref=e1148]
                        - generic [ref=e1149]: 2d
                      - generic [ref=e1150]:
                        - generic [ref=e1151]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1152]: 0/1
                      - generic [ref=e1154]: Coordinating · 0/1 confirmed
                      - generic [ref=e1155]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1157]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1166]':
                          - generic [ref=e1167]: Coord
                          - img [ref=e1169]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted Coordinating · 0/1 confirmed 1 Coord QA" [ref=e1173] [cursor=pointer]:
                    - img [ref=e1176]
                    - generic [ref=e1179]:
                      - generic [ref=e1180]:
                        - generic "Cora Cuevas" [ref=e1181]
                        - generic [ref=e1182]: 2d
                      - generic [ref=e1183]:
                        - generic [ref=e1184]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1185]: 0/1
                      - generic [ref=e1187]: Coordinating · 0/1 confirmed
                      - generic [ref=e1188]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1190]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1199]':
                          - generic [ref=e1200]: Coord
                          - img [ref=e1202]
                          - text: QA
              - generic [ref=e1206]:
                - generic [ref=e1208]:
                  - button "Back to Inbox" [ref=e1209] [cursor=pointer]:
                    - img [ref=e1210]
                  - generic:
                    - heading "Cora Cuevas · Cora Cuevas" [level=1]:
                      - generic:
                        - text: Cora Cuevas
                        - generic [ref=e1212]: · Cora Cuevas
                    - 'generic "Source: Cold email" [ref=e1213]':
                      - img [ref=e1215]
                      - text: Cold email
                  - generic [ref=e1217]:
                    - generic [ref=e1218]:
                      - button "Edit job details" [ref=e1219] [cursor=pointer]:
                        - img [ref=e1220]
                      - button "Propose a time" [ref=e1222] [cursor=pointer]:
                        - img [ref=e1223]
                        - generic [ref=e1226]: Propose a time
                      - 'button "Coordinator: QA Journeys Owner · click to reassign or assign a talent" [ref=e1227] [cursor=pointer]':
                        - img [ref=e1228]
                        - generic [ref=e1232]: "Coord: QA"
                      - button "Move to" [ref=e1234] [cursor=pointer]:
                        - text: Move to
                        - img [ref=e1235]
                      - button "Search this conversation" [ref=e1237] [cursor=pointer]:
                        - img [ref=e1238]
                      - button "More actions" [ref=e1243] [cursor=pointer]:
                        - img [ref=e1245]
                    - 'button "Status: Inquiry. Open full breakdown." [ref=e1249] [cursor=pointer]':
                      - text: Inquiry
                      - img [ref=e1250]
                - generic [ref=e1252]:
                  - tablist [ref=e1253]:
                    - tab "Client" [selected] [ref=e1254] [cursor=pointer]:
                      - img [ref=e1256]
                      - generic [ref=e1260]: Client
                      - generic [ref=e1261]: "2"
                    - tab "Group" [ref=e1262] [cursor=pointer]:
                      - img [ref=e1264]
                      - generic [ref=e1269]: Group
                    - tab "Activity" [ref=e1270] [cursor=pointer]:
                      - img [ref=e1272]
                      - generic [ref=e1275]: Activity
                    - tab "Lineup" [ref=e1276] [cursor=pointer]:
                      - generic [ref=e1277]: Lineup
                    - tab "Offer" [ref=e1278] [cursor=pointer]:
                      - img [ref=e1280]
                      - generic [ref=e1283]: Offer
                    - tab "Details" [ref=e1284] [cursor=pointer]:
                      - generic [ref=e1285]: Details
                    - tab "Files" [ref=e1286] [cursor=pointer]:
                      - img [ref=e1288]
                      - generic [ref=e1292]: Files
                  - generic [ref=e1293]:
                    - img [ref=e1294]
                    - text: Your turn. Reply to the client to move this forward.
                  - generic [ref=e1297]:
                    - generic "Client thread. Visible to the client and workspace staff." [ref=e1298]: Client thread
                    - generic [ref=e1299]:
                      - generic [ref=e1302]: Fri 8:01 PM
                      - generic [ref=e1304]:
                        - generic:
                          - generic:
                            - button "Add reaction":
                              - img
                          - button "Reply to this message":
                            - img
                        - img [ref=e1306]
                        - generic [ref=e1309]:
                          - generic [ref=e1311]: System · system
                          - generic [ref=e1312]: Need two models for a catalog shoot next month.
                          - generic [ref=e1313]: Fri 8:01 PM
                      - generic [ref=e1314]:
                        - generic:
                          - generic:
                            - button "Add reaction":
                              - img
                          - button "Reply to this message":
                            - img
                        - img [ref=e1316]
                        - generic [ref=e1320]: Status updated
                    - generic [ref=e1323]:
                      - generic "Attach file" [ref=e1324] [cursor=pointer]:
                        - img [ref=e1325]
                      - button "Show smart replies" [ref=e1327] [cursor=pointer]:
                        - img [ref=e1328]
                      - textbox "Reply to Cora Cuevas…" [ref=e1331]
                      - button "Record voice note" [disabled] [ref=e1332]:
                        - img [ref=e1333]
                      - button "Send" [disabled] [ref=e1336]:
                        - img [ref=e1337]
                - generic [ref=e1339]:
                  - generic [ref=e1340]: Reply to client to keep this moving.
                  - button "Reply to client" [ref=e1341] [cursor=pointer]
                  - button "Dismiss next-action nudge" [ref=e1342] [cursor=pointer]: ×
    - dialog [ref=e1343]:
      - separator "Resize drawer" [ref=e1344]
      - banner [ref=e1345]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e1346]:
          - button "Copy link to this drawer" [ref=e1348] [cursor=pointer]:
            - img [ref=e1349]
          - generic [ref=e1352]:
            - button "compact size" [ref=e1354] [cursor=pointer]:
              - img [ref=e1355]
            - button "half size" [ref=e1359] [cursor=pointer]:
              - img [ref=e1360]
            - button "full size" [ref=e1364] [cursor=pointer]:
              - img [ref=e1365]
          - button "Close" [ref=e1368] [cursor=pointer]:
            - img [ref=e1369]
    - status
  - alert [ref=e1372]
```

# Test source

```ts
  1   | /**
  2   |  * Case-journey spec pattern.
  3   |  *
  4   |  * Fixtures prepare state. This file only opens the real interface.
  5   |  * Each case adds `e2e/cases/Cxx-….spec.ts` rather than a bespoke harness.
  6   |  *
  7   |  * Auth: PLAYWRIGHT_USE_DEV_SIGNIN=1 and /api/dev/signin already exist.
  8   |  * Device: tablet-pos and mobile-checkout projects in playwright.config.ts.
  9   |  *
  10  |  * A login page, host-not-registered page, or empty error shell cannot pass.
  11  |  */
  12  | 
  13  | import { test, expect, type Page } from "@playwright/test";
  14  | 
  15  | export { test, expect };
  16  | 
  17  | export const JOURNEYS_SLUG = process.env.JOURNEYS_TENANT_SLUG ?? "qa-journeys";
  18  | export const JOURNEYS_DISPLAY = process.env.JOURNEYS_TENANT_NAME ?? "QA Journeys";
  19  | export const FIXTURE_READY = process.env.JOURNEYS_FIXTURE_READY === "1";
  20  | 
  21  | export async function prepareJourneysPage(page: Page): Promise<void> {
  22  |   await page.addInitScript(() => {
  23  |     try {
  24  |       window.localStorage.setItem("impronta_analytics_consent", "denied");
  25  |     } catch {
  26  |       /* ignore */
  27  |     }
  28  |   });
  29  | }
  30  | 
  31  | export async function assertNotAuthWall(page: Page): Promise<void> {
  32  |   const url = page.url().toLowerCase();
  33  |   expect(url, "login URL cannot pass a journey").not.toMatch(/\/login|\/signin|\/auth\//);
  34  |   await expect(
  35  |     page.getByText(/host not registered/i),
  36  |     "unregistered host page cannot pass a journey",
  37  |   ).toHaveCount(0);
  38  |   // A public header "Sign in" link is not an auth wall. The wall is a
  39  |   // sign-in heading as the page itself — scanning the whole body also
  40  |   // matched builder CSS and failed every storefront journey.
  41  |   await expect(
  42  |     page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i }),
  43  |     "login heading cannot pass a journey",
  44  |   ).toHaveCount(0);
  45  | }
  46  | 
  47  | export async function assertWorkspaceIdentity(page: Page): Promise<void> {
  48  |   await assertNotAuthWall(page);
  49  |   expect(
  50  |     page.url(),
  51  |     "workspace identity must be asserted on a workspace surface",
  52  |   ).toMatch(/\/(admin|talent|client)(\/|\?|$)/);
  53  |   await expect(
  54  |     page.getByRole("heading", { name: /this page is no longer here/i }),
  55  |     "branded 404 cannot pass a workspace identity check",
  56  |   ).toHaveCount(0);
> 57  |   await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      |                                                         ^ Error: expect(locator).toBeVisible() failed
  58  |   const landmarks = await page
  59  |     .locator("header, [role='banner'], nav, aside, h1")
  60  |     .allTextContents();
  61  |   const shell = [await page.title(), ...landmarks].join(" ").toLowerCase();
  62  |   expect(shell, `workspace chrome must name ${JOURNEYS_DISPLAY}`).toContain(
  63  |     JOURNEYS_DISPLAY.toLowerCase().slice(0, 8),
  64  |   );
  65  | }
  66  | 
  67  | export async function openWorkspace(page: Page, segment: string): Promise<void> {
  68  |   await signInJourneysStaff(page, `/admin/${segment}`);
  69  |   await assertWorkspaceIdentity(page);
  70  | }
  71  | 
  72  | export async function openStorefront(page: Page): Promise<void> {
  73  |   await page.goto("/");
  74  |   await assertNotAuthWall(page);
  75  |   await expect(page.locator("body")).toBeVisible();
  76  | }
  77  | 
  78  | export const JOURNEYS_OWNER_EMAIL =
  79  |   process.env.JOURNEYS_OWNER_EMAIL ?? "qa-journeys-owner@impronta.test";
  80  | export const JOURNEYS_TALENT_EMAIL =
  81  |   process.env.JOURNEYS_TALENT_EMAIL ?? "qa-journeys-talent@impronta.test";
  82  | 
  83  | /**
  84  |  * How many times to ask for a session before calling it a failure.
  85  |  *
  86  |  * A 404 from `/api/dev/signin` has two very different causes and only one of
  87  |  * them is worth retrying.
  88  |  *
  89  |  * PERMANENT: TULALA_ALLOW_DEV_SURFACES is not set on the dev server. The Edge
  90  |  * proxy inlines NODE_ENV=production, so without the flag `/api/dev/*` is not
  91  |  * short-circuited, falls through host resolution, and every request lands on
  92  |  * the storefront's not-found page. Retrying cannot help and the message below
  93  |  * has to name the flag, because the symptom looks like a missing route.
  94  |  *
  95  |  * TRANSIENT: the Turbopack dev server briefly loses the route from its tree
  96  |  * after it rebuilds — observed as four consecutive 404s immediately after
  97  |  * `Compiling /_not-found/page`, followed by 307 for the sixteen requests
  98  |  * either side of them, all inside one server process with the flag set the
  99  |  * whole time. It is a dev-server fault, not a product one, so it must not be
  100 |  * allowed to read as "the fixture cannot sign in".
  101 |  */
  102 | const SIGNIN_ATTEMPTS = 6;
  103 | 
  104 | /**
  105 |  * Passwordless fixture sign-in. Reads cookies from the 307 and then opens
  106 |  * `nextPath` on PLAYWRIGHT_BASE_URL so a Location that dropped the proxy
  107 |  * port cannot bounce the browser onto :80.
  108 |  */
  109 | export async function signInJourneysStaff(
  110 |   page: Page,
  111 |   nextPath = "/admin/pos",
  112 |   email = JOURNEYS_OWNER_EMAIL,
  113 | ): Promise<void> {
  114 |   const params = new URLSearchParams({ email, next: nextPath });
  115 |   const seen: number[] = [];
  116 |   let setCookies: string[] = [];
  117 |   for (let attempt = 1; attempt <= SIGNIN_ATTEMPTS; attempt += 1) {
  118 |     const res = await page.request.get(`/api/dev/signin?${params.toString()}`, {
  119 |       maxRedirects: 0,
  120 |     });
  121 |     if (res.status() === 307) {
  122 |       setCookies = res
  123 |         .headersArray()
  124 |         .filter((h) => h.name.toLowerCase() === "set-cookie")
  125 |         .map((h) => h.value);
  126 |       break;
  127 |     }
  128 |     seen.push(res.status());
  129 |     // 404 (Turbopack briefly missing the route) and 502/503 (Next restarting
  130 |     // or the proxy's upstream gone) are the only statuses worth retrying.
  131 |     // 403/400/401/500 are the handler answering; retrying only delays the report.
  132 |     if (res.status() !== 404 && res.status() !== 502 && res.status() !== 503) {
  133 |       expect(res.status(), `dev sign-in refused: ${await res.text()}`).toBe(307);
  134 |     }
  135 |     if (attempt < SIGNIN_ATTEMPTS) await page.waitForTimeout(250 * attempt);
  136 |   }
  137 |   expect(
  138 |     seen.length,
  139 |     `dev sign-in returned ${seen.join(", ")} — ${SIGNIN_ATTEMPTS} 404s is not a rebuild ` +
  140 |       `gap. Start the dev server with TULALA_ALLOW_DEV_SURFACES=1 or /api/dev/* falls ` +
  141 |       `through to the storefront's not-found page.`,
  142 |   ).toBeLessThan(SIGNIN_ATTEMPTS);
  143 |   // A response that is not followed does not always reach the browser's cookie
  144 |   // jar (observed on a remote https origin: only the platform's own cookie was
  145 |   // stored). The session cookie is the whole point of the call, so put it in
  146 |   // the context explicitly rather than trusting the transfer.
  147 |   await adoptSetCookies(page, setCookies);
  148 |   await page.goto(nextPath);
  149 |   await assertNotAuthWall(page);
  150 | }
  151 | 
  152 | /** Parse `Set-Cookie` headers from a non-followed response into the context. */
  153 | async function adoptSetCookies(page: Page, headers: string[]): Promise<void> {
  154 |   if (headers.length === 0) return;
  155 |   const origin = new URL(
  156 |     process.env.PLAYWRIGHT_BASE_URL ?? new URL(page.url()).origin,
  157 |   );
```