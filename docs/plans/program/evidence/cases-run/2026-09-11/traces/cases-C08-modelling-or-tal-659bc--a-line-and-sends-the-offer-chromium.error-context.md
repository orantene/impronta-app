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

Locator: getByRole('button', { name: /add line item/i }).or(locator('select').filter({ has: locator('option').filter({ hasText: /qa journeys talent/i }) }).first())
Expected: visible
Error: strict mode violation: getByRole('button', { name: /add line item/i }).or(locator('select').filter({ has: locator('option').filter({ hasText: /qa journeys talent/i }) }).first()) resolved to 2 elements:
    1) <select>…</select> aka getByRole('combobox').first()
    2) <button type="button" class="rounded border border-admin-border bg-white px-2 py-1 text-[11px] text-admin-ink disabled:opacity-50">+ Add line item</button> aka getByRole('button', { name: '+ Add line item' })

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('button', { name: /add line item/i }).or(locator('select').filter({ has: locator('option').filter({ hasText: /qa journeys talent/i }) }).first())

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
              - button "Notifications · 50 unread" [ref=e199] [cursor=pointer]:
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
                      - generic [ref=e219]: 47 threads
                      - button "Select" [ref=e220] [cursor=pointer]:
                        - img [ref=e221]
                        - text: Select
                  - generic [ref=e227]:
                    - textbox "Search clients, briefs…" [ref=e228]
                    - img [ref=e230]
                    - generic [ref=e233]: ⌘K
                  - generic [ref=e234]:
                    - button "All" [ref=e235] [cursor=pointer]
                    - button "Needs me (40)" [ref=e236] [cursor=pointer]
                    - button "Triage (36)" [ref=e237] [cursor=pointer]:
                      - img [ref=e239]
                      - text: Triage (36)
                    - button "Unread (46)" [ref=e241] [cursor=pointer]
                    - button "Coordinating 47" [ref=e242] [cursor=pointer]:
                      - img [ref=e244]
                      - text: Coordinating
                      - generic [ref=e246]: "47"
                    - button "Inquiry" [ref=e247] [cursor=pointer]
                    - button "Offer pending" [ref=e248] [cursor=pointer]
                    - button "Approved" [ref=e249] [cursor=pointer]
                    - button "Booked" [ref=e250] [cursor=pointer]
                    - button "Past" [ref=e251] [cursor=pointer]
                - generic [ref=e252]:
                  - generic [ref=e253]: This week
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e255] [cursor=pointer]:
                    - img [ref=e258]
                    - generic [ref=e261]:
                      - generic [ref=e262]:
                        - generic "Cora Cuevas" [ref=e263]
                        - generic [ref=e264]: NEW
                        - generic [ref=e265]: 2d
                      - generic [ref=e266]:
                        - generic [ref=e267]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e268]: 0/1
                      - generic [ref=e269]:
                        - generic [ref=e271]: → Nudge talent · 1 not responded
                        - generic [ref=e272]: "1"
                      - generic [ref=e273]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e275]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e284]':
                          - generic [ref=e285]: Coord
                          - img [ref=e287]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e291] [cursor=pointer]:
                    - img [ref=e294]
                    - generic [ref=e297]:
                      - generic [ref=e298]:
                        - generic "Cora Cuevas" [ref=e299]
                        - generic [ref=e300]: NEW
                        - generic [ref=e301]: 2d
                      - generic [ref=e302]:
                        - generic [ref=e303]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e304]: 0/1
                      - generic [ref=e305]:
                        - generic [ref=e307]: → Nudge talent · 1 not responded
                        - generic [ref=e308]: "1"
                      - generic [ref=e309]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e311]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e320]':
                          - generic [ref=e321]: Coord
                          - img [ref=e323]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e327] [cursor=pointer]:
                    - img [ref=e330]
                    - generic [ref=e333]:
                      - generic [ref=e334]:
                        - generic "Cora Cuevas" [ref=e335]
                        - generic [ref=e336]: NEW
                        - generic [ref=e337]: 2d
                      - generic [ref=e338]:
                        - generic [ref=e339]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e340]: 0/1
                      - generic [ref=e341]:
                        - generic [ref=e343]: → Nudge talent · 1 not responded
                        - generic [ref=e344]: "1"
                      - generic [ref=e345]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e347]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e356]':
                          - generic [ref=e357]: Coord
                          - img [ref=e359]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e363] [cursor=pointer]:
                    - img [ref=e366]
                    - generic [ref=e369]:
                      - generic [ref=e370]:
                        - generic "Cora Cuevas" [ref=e371]
                        - generic [ref=e372]: NEW
                        - generic [ref=e373]: 2d
                      - generic [ref=e374]:
                        - generic [ref=e375]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e376]: 0/1
                      - generic [ref=e377]:
                        - generic [ref=e379]: → Nudge talent · 1 not responded
                        - generic [ref=e380]: "1"
                      - generic [ref=e381]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e383]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e392]':
                          - generic [ref=e393]: Coord
                          - img [ref=e395]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas → Add talent · shortlist empty 1 1 Coord QA" [ref=e399] [cursor=pointer]:
                    - img [ref=e402]
                    - generic [ref=e405]:
                      - generic [ref=e406]:
                        - generic "Cora Cuevas" [ref=e407]
                        - generic [ref=e408]: NEW
                        - generic [ref=e409]: 2d
                      - generic [ref=e411]: Cora Cuevas
                      - generic [ref=e412]:
                        - generic [ref=e414]: → Add talent · shortlist empty
                        - generic [ref=e415]: "1"
                      - generic [ref=e416]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e418]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e427]':
                          - generic [ref=e428]: Coord
                          - img [ref=e430]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e434] [cursor=pointer]:
                    - img [ref=e437]
                    - generic [ref=e440]:
                      - generic [ref=e441]:
                        - generic "Cora Cuevas" [ref=e442]
                        - generic [ref=e443]: NEW
                        - generic [ref=e444]: 2d
                      - generic [ref=e445]:
                        - generic [ref=e446]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e447]: 0/1
                      - generic [ref=e448]:
                        - generic [ref=e450]: → Nudge talent · 1 not responded
                        - generic [ref=e451]: "1"
                      - generic [ref=e452]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e454]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e463]':
                          - generic [ref=e464]: Coord
                          - img [ref=e466]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e470] [cursor=pointer]:
                    - img [ref=e473]
                    - generic [ref=e476]:
                      - generic [ref=e477]:
                        - generic "Cora Cuevas" [ref=e478]
                        - generic [ref=e479]: NEW
                        - generic [ref=e480]: 2d
                      - generic [ref=e481]:
                        - generic [ref=e482]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e483]: 0/1
                      - generic [ref=e484]:
                        - generic [ref=e486]: → Nudge talent · 1 not responded
                        - generic [ref=e487]: "1"
                      - generic [ref=e488]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e490]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e499]':
                          - generic [ref=e500]: Coord
                          - img [ref=e502]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Add talent · 0/1 accepted 1 1 Coord QA" [ref=e506] [cursor=pointer]:
                    - img [ref=e509]
                    - generic [ref=e512]:
                      - generic [ref=e513]:
                        - generic "Cora Cuevas" [ref=e514]
                        - generic [ref=e515]: NEW
                        - generic [ref=e516]: 2d
                      - generic [ref=e517]:
                        - generic [ref=e518]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e519]: 0/1
                      - generic [ref=e520]:
                        - generic [ref=e522]: → Add talent · 0/1 accepted
                        - generic [ref=e523]: "1"
                      - generic [ref=e524]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e526]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e535]':
                          - generic [ref=e536]: Coord
                          - img [ref=e538]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas → Add talent · shortlist empty 1 1 Coord QA" [ref=e542] [cursor=pointer]:
                    - img [ref=e545]
                    - generic [ref=e548]:
                      - generic [ref=e549]:
                        - generic "Cora Cuevas" [ref=e550]
                        - generic [ref=e551]: NEW
                        - generic [ref=e552]: 2d
                      - generic [ref=e554]: Cora Cuevas
                      - generic [ref=e555]:
                        - generic [ref=e557]: → Add talent · shortlist empty
                        - generic [ref=e558]: "1"
                      - generic [ref=e559]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e561]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e570]':
                          - generic [ref=e571]: Coord
                          - img [ref=e573]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas → Add talent · shortlist empty 1 1 Coord QA" [ref=e577] [cursor=pointer]:
                    - img [ref=e580]
                    - generic [ref=e583]:
                      - generic [ref=e584]:
                        - generic "Cora Cuevas" [ref=e585]
                        - generic [ref=e586]: NEW
                        - generic [ref=e587]: 2d
                      - generic [ref=e589]: Cora Cuevas
                      - generic [ref=e590]:
                        - generic [ref=e592]: → Add talent · shortlist empty
                        - generic [ref=e593]: "1"
                      - generic [ref=e594]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e596]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e605]':
                          - generic [ref=e606]: Coord
                          - img [ref=e608]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Add talent · 0/1 accepted 1 1 Coord QA" [ref=e612] [cursor=pointer]:
                    - img [ref=e615]
                    - generic [ref=e618]:
                      - generic [ref=e619]:
                        - generic "Cora Cuevas" [ref=e620]
                        - generic [ref=e621]: NEW
                        - generic [ref=e622]: 2d
                      - generic [ref=e623]:
                        - generic [ref=e624]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e625]: 0/1
                      - generic [ref=e626]:
                        - generic [ref=e628]: → Add talent · 0/1 accepted
                        - generic [ref=e629]: "1"
                      - generic [ref=e630]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e632]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e641]':
                          - generic [ref=e642]: Coord
                          - img [ref=e644]
                          - text: QA
                  - generic [ref=e647]: Yesterday
                  - button "Cora Cuevas NEW 1d Cora Cuevas 1 of 1 talent accepted Offer $800 · awaiting client 3 2 Coord QA" [ref=e649] [cursor=pointer]:
                    - img [ref=e652]
                    - generic [ref=e655]:
                      - generic [ref=e656]:
                        - generic "Cora Cuevas" [ref=e657]
                        - generic [ref=e658]: NEW
                        - generic [ref=e659]: 1d
                      - generic [ref=e660]:
                        - generic [ref=e661]: Cora Cuevas
                        - generic "1 of 1 talent accepted" [ref=e662]: 1/1
                      - generic [ref=e663]:
                        - generic [ref=e664]: Offer $800 · awaiting client
                        - generic [ref=e665]: "3"
                      - generic [ref=e666]:
                        - 'progressbar "Stage 2 of 4: Offer" [ref=e668]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e677]':
                          - generic [ref=e678]: Coord
                          - img [ref=e680]
                          - text: QA
                  - button "Cora Cuevas NEW 1d Cora Cuevas 1 of 1 talent accepted Booked · $800 4 3 Coord QA" [ref=e684] [cursor=pointer]:
                    - img [ref=e687]
                    - generic [ref=e690]:
                      - generic [ref=e691]:
                        - generic "Cora Cuevas" [ref=e692]
                        - generic [ref=e693]: NEW
                        - generic [ref=e694]: 1d
                      - generic [ref=e695]:
                        - generic [ref=e696]: Cora Cuevas
                        - generic "1 of 1 talent accepted" [ref=e697]: 1/1
                      - generic [ref=e698]:
                        - generic [ref=e699]: Booked · $800
                        - generic [ref=e700]: "4"
                      - generic [ref=e701]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e703]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e712]':
                          - generic [ref=e713]: Coord
                          - img [ref=e715]
                          - text: QA
                  - generic [ref=e718]: This week
                  - button "Cora Cuevas NEW 2d Cora Cuevas 1 of 1 talent accepted Offer $800 · awaiting client 2 2 Coord QA" [ref=e720] [cursor=pointer]:
                    - img [ref=e723]
                    - generic [ref=e726]:
                      - generic [ref=e727]:
                        - generic "Cora Cuevas" [ref=e728]
                        - generic [ref=e729]: NEW
                        - generic [ref=e730]: 2d
                      - generic [ref=e731]:
                        - generic [ref=e732]: Cora Cuevas
                        - generic "1 of 1 talent accepted" [ref=e733]: 1/1
                      - generic [ref=e734]:
                        - generic [ref=e735]: Offer $800 · awaiting client
                        - generic [ref=e736]: "2"
                      - generic [ref=e737]:
                        - 'progressbar "Stage 2 of 4: Offer" [ref=e739]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e748]':
                          - generic [ref=e749]: Coord
                          - img [ref=e751]
                          - text: QA
                  - generic [ref=e754]: Today
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e756] [cursor=pointer]:
                    - img [ref=e759]
                    - generic [ref=e762]:
                      - generic [ref=e763]:
                        - generic "Cora Cuevas" [ref=e764]
                        - generic [ref=e765]: now
                      - generic [ref=e767]: Cora Cuevas
                      - generic [ref=e770]: → Add talent · shortlist empty
                      - generic [ref=e771]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e773]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e782]':
                          - generic [ref=e783]: Coord
                          - img [ref=e785]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e789] [cursor=pointer]:
                    - img [ref=e792]
                    - generic [ref=e795]:
                      - generic [ref=e796]:
                        - generic "Cora Cuevas" [ref=e797]
                        - generic [ref=e798]: now
                      - generic [ref=e800]: Cora Cuevas
                      - generic [ref=e803]: → Add talent · shortlist empty
                      - generic [ref=e804]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e806]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e815]':
                          - generic [ref=e816]: Coord
                          - img [ref=e818]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e822] [cursor=pointer]:
                    - img [ref=e825]
                    - generic [ref=e828]:
                      - generic [ref=e829]:
                        - generic "Cora Cuevas" [ref=e830]
                        - generic [ref=e831]: now
                      - generic [ref=e832]:
                        - generic [ref=e833]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e834]: 0/1
                      - generic [ref=e837]: → Nudge talent · 1 not responded
                      - generic [ref=e838]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e840]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e849]':
                          - generic [ref=e850]: Coord
                          - img [ref=e852]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e856] [cursor=pointer]:
                    - img [ref=e859]
                    - generic [ref=e862]:
                      - generic [ref=e863]:
                        - generic "Cora Cuevas" [ref=e864]
                        - generic [ref=e865]: now
                      - generic [ref=e867]: Cora Cuevas
                      - generic [ref=e870]: → Add talent · shortlist empty
                      - generic [ref=e871]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e873]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e882]':
                          - generic [ref=e883]: Coord
                          - img [ref=e885]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e889] [cursor=pointer]:
                    - img [ref=e892]
                    - generic [ref=e895]:
                      - generic [ref=e896]:
                        - generic "Cora Cuevas" [ref=e897]
                        - generic [ref=e898]: now
                      - generic [ref=e900]: Cora Cuevas
                      - generic [ref=e903]: → Add talent · shortlist empty
                      - generic [ref=e904]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e906]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e915]':
                          - generic [ref=e916]: Coord
                          - img [ref=e918]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e922] [cursor=pointer]:
                    - img [ref=e925]
                    - generic [ref=e928]:
                      - generic [ref=e929]:
                        - generic "Cora Cuevas" [ref=e930]
                        - generic [ref=e931]: now
                      - generic [ref=e932]:
                        - generic [ref=e933]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e934]: 0/1
                      - generic [ref=e937]: → Nudge talent · 1 not responded
                      - generic [ref=e938]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e940]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e949]':
                          - generic [ref=e950]: Coord
                          - img [ref=e952]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas 1 of 1 talent accepted → Draft offer · lineup confirmed 1 1 Coord QA" [ref=e956] [cursor=pointer]:
                    - img [ref=e959]
                    - generic [ref=e962]:
                      - generic [ref=e963]:
                        - generic "Cora Cuevas" [ref=e964]
                        - generic [ref=e965]: now
                      - generic [ref=e966]:
                        - generic [ref=e967]: Cora Cuevas
                        - generic "1 of 1 talent accepted" [ref=e968]: 1/1
                      - generic [ref=e969]:
                        - generic [ref=e971]: → Draft offer · lineup confirmed
                        - generic [ref=e972]: "1"
                      - generic [ref=e973]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e975]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e984]':
                          - generic [ref=e985]: Coord
                          - img [ref=e987]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e991] [cursor=pointer]:
                    - img [ref=e994]
                    - generic [ref=e997]:
                      - generic [ref=e998]:
                        - generic "Cora Cuevas" [ref=e999]
                        - generic [ref=e1000]: now
                      - generic [ref=e1002]: Cora Cuevas
                      - generic [ref=e1005]: → Add talent · shortlist empty
                      - generic [ref=e1006]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1008]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1017]':
                          - generic [ref=e1018]: Coord
                          - img [ref=e1020]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1024] [cursor=pointer]:
                    - img [ref=e1027]
                    - generic [ref=e1030]:
                      - generic [ref=e1031]:
                        - generic "Cora Cuevas" [ref=e1032]
                        - generic [ref=e1033]: now
                      - generic [ref=e1035]: Cora Cuevas
                      - generic [ref=e1038]: → Add talent · shortlist empty
                      - generic [ref=e1039]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1041]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1050]':
                          - generic [ref=e1051]: Coord
                          - img [ref=e1053]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1057] [cursor=pointer]:
                    - img [ref=e1060]
                    - generic [ref=e1063]:
                      - generic [ref=e1064]:
                        - generic "Cora Cuevas" [ref=e1065]
                        - generic [ref=e1066]: now
                      - generic [ref=e1068]: Cora Cuevas
                      - generic [ref=e1071]: → Add talent · shortlist empty
                      - generic [ref=e1072]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1074]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1083]':
                          - generic [ref=e1084]: Coord
                          - img [ref=e1086]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1090] [cursor=pointer]:
                    - img [ref=e1093]
                    - generic [ref=e1096]:
                      - generic [ref=e1097]:
                        - generic "Cora Cuevas" [ref=e1098]
                        - generic [ref=e1099]: now
                      - generic [ref=e1101]: Cora Cuevas
                      - generic [ref=e1104]: → Add talent · shortlist empty
                      - generic [ref=e1105]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1107]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1116]':
                          - generic [ref=e1117]: Coord
                          - img [ref=e1119]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1123] [cursor=pointer]:
                    - img [ref=e1126]
                    - generic [ref=e1129]:
                      - generic [ref=e1130]:
                        - generic "Cora Cuevas" [ref=e1131]
                        - generic [ref=e1132]: now
                      - generic [ref=e1134]: Cora Cuevas
                      - generic [ref=e1137]: → Add talent · shortlist empty
                      - generic [ref=e1138]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1140]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1149]':
                          - generic [ref=e1150]: Coord
                          - img [ref=e1152]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1156] [cursor=pointer]:
                    - img [ref=e1159]
                    - generic [ref=e1162]:
                      - generic [ref=e1163]:
                        - generic "Cora Cuevas" [ref=e1164]
                        - generic [ref=e1165]: now
                      - generic [ref=e1167]: Cora Cuevas
                      - generic [ref=e1170]: → Add talent · shortlist empty
                      - generic [ref=e1171]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1173]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1182]':
                          - generic [ref=e1183]: Coord
                          - img [ref=e1185]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1189] [cursor=pointer]:
                    - img [ref=e1192]
                    - generic [ref=e1195]:
                      - generic [ref=e1196]:
                        - generic "Cora Cuevas" [ref=e1197]
                        - generic [ref=e1198]: now
                      - generic [ref=e1200]: Cora Cuevas
                      - generic [ref=e1203]: → Add talent · shortlist empty
                      - generic [ref=e1204]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1206]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1215]':
                          - generic [ref=e1216]: Coord
                          - img [ref=e1218]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1222] [cursor=pointer]:
                    - img [ref=e1225]
                    - generic [ref=e1228]:
                      - generic [ref=e1229]:
                        - generic "Cora Cuevas" [ref=e1230]
                        - generic [ref=e1231]: now
                      - generic [ref=e1232]:
                        - generic [ref=e1233]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1234]: 0/1
                      - generic [ref=e1237]: → Nudge talent · 1 not responded
                      - generic [ref=e1238]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1240]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1249]':
                          - generic [ref=e1250]: Coord
                          - img [ref=e1252]
                          - text: QA
                  - button "Cora Cuevas 1h Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1256] [cursor=pointer]:
                    - img [ref=e1259]
                    - generic [ref=e1262]:
                      - generic [ref=e1263]:
                        - generic "Cora Cuevas" [ref=e1264]
                        - generic [ref=e1265]: 1h
                      - generic [ref=e1266]:
                        - generic [ref=e1267]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1268]: 0/1
                      - generic [ref=e1271]: → Nudge talent · 1 not responded
                      - generic [ref=e1272]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1274]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1283]':
                          - generic [ref=e1284]: Coord
                          - img [ref=e1286]
                          - text: QA
                  - button "Nadia Varela 17h Nadia Varela 1 of 1 talent accepted → Draft offer · lineup confirmed 1 Coord QA" [ref=e1290] [cursor=pointer]:
                    - img [ref=e1293]
                    - generic [ref=e1296]:
                      - generic [ref=e1297]:
                        - generic "Nadia Varela" [ref=e1298]
                        - generic [ref=e1299]: 17h
                      - generic [ref=e1300]:
                        - generic [ref=e1301]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1302]: 1/1
                      - generic [ref=e1305]: → Draft offer · lineup confirmed
                      - generic [ref=e1306]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1308]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1317]':
                          - generic [ref=e1318]: Coord
                          - img [ref=e1320]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted → Reply to client · \"QA Journeys Talent approved the offer.\" 3 3 Coord QA" [ref=e1324] [cursor=pointer]:
                    - img [ref=e1327]
                    - generic [ref=e1330]:
                      - generic [ref=e1331]:
                        - generic "Nadia Varela" [ref=e1332]
                        - generic [ref=e1333]: 23h
                      - generic [ref=e1334]:
                        - generic [ref=e1335]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1336]: 1/1
                      - generic [ref=e1337]:
                        - generic [ref=e1339]: → Reply to client · "QA Journeys Talent approved the offer."
                        - generic [ref=e1340]: "3"
                      - generic [ref=e1341]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1343]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1352]':
                          - generic [ref=e1353]: Coord
                          - img [ref=e1355]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted → Reply to client · \"QA Journeys Talent approved the offer.\" 3 3 Coord QA" [ref=e1359] [cursor=pointer]:
                    - img [ref=e1362]
                    - generic [ref=e1365]:
                      - generic [ref=e1366]:
                        - generic "Nadia Varela" [ref=e1367]
                        - generic [ref=e1368]: 23h
                      - generic [ref=e1369]:
                        - generic [ref=e1370]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1371]: 1/1
                      - generic [ref=e1372]:
                        - generic [ref=e1374]: → Reply to client · "QA Journeys Talent approved the offer."
                        - generic [ref=e1375]: "3"
                      - generic [ref=e1376]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1378]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1387]':
                          - generic [ref=e1388]: Coord
                          - img [ref=e1390]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted → Reply to client · \"QA Journeys Talent approved the offer.\" 3 3 Coord QA" [ref=e1394] [cursor=pointer]:
                    - img [ref=e1397]
                    - generic [ref=e1400]:
                      - generic [ref=e1401]:
                        - generic "Nadia Varela" [ref=e1402]
                        - generic [ref=e1403]: 23h
                      - generic [ref=e1404]:
                        - generic [ref=e1405]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1406]: 1/1
                      - generic [ref=e1407]:
                        - generic [ref=e1409]: → Reply to client · "QA Journeys Talent approved the offer."
                        - generic [ref=e1410]: "3"
                      - generic [ref=e1411]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1413]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1422]':
                          - generic [ref=e1423]: Coord
                          - img [ref=e1425]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted → Reply to client · \"QA Journeys Talent approved the offer.\" 3 3 Coord QA" [ref=e1429] [cursor=pointer]:
                    - img [ref=e1432]
                    - generic [ref=e1435]:
                      - generic [ref=e1436]:
                        - generic "Nadia Varela" [ref=e1437]
                        - generic [ref=e1438]: 23h
                      - generic [ref=e1439]:
                        - generic [ref=e1440]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1441]: 1/1
                      - generic [ref=e1442]:
                        - generic [ref=e1444]: → Reply to client · "QA Journeys Talent approved the offer."
                        - generic [ref=e1445]: "3"
                      - generic [ref=e1446]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1448]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1457]':
                          - generic [ref=e1458]: Coord
                          - img [ref=e1460]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1464] [cursor=pointer]:
                    - img [ref=e1467]
                    - generic [ref=e1470]:
                      - generic [ref=e1471]:
                        - generic "Nadia Varela" [ref=e1472]
                        - generic [ref=e1473]: 23h
                      - generic [ref=e1474]:
                        - generic [ref=e1475]: Nadia Varela
                        - generic "0 of 1 talent accepted" [ref=e1476]: 0/1
                      - generic [ref=e1479]: → Nudge talent · 1 not responded
                      - generic [ref=e1480]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1482]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1491]':
                          - generic [ref=e1492]: Coord
                          - img [ref=e1494]
                          - text: QA
                  - generic [ref=e1497]: This week
                  - button "Cora Cuevas 2d Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1499] [cursor=pointer]:
                    - img [ref=e1502]
                    - generic [ref=e1505]:
                      - generic [ref=e1506]:
                        - generic "Cora Cuevas" [ref=e1507]
                        - generic [ref=e1508]: 2d
                      - generic [ref=e1510]: Cora Cuevas
                      - generic [ref=e1513]: → Add talent · shortlist empty
                      - generic [ref=e1514]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1516]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1525]':
                          - generic [ref=e1526]: Coord
                          - img [ref=e1528]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1532] [cursor=pointer]:
                    - img [ref=e1535]
                    - generic [ref=e1538]:
                      - generic [ref=e1539]:
                        - generic "Cora Cuevas" [ref=e1540]
                        - generic [ref=e1541]: 2d
                      - generic [ref=e1543]: Cora Cuevas
                      - generic [ref=e1546]: → Add talent · shortlist empty
                      - generic [ref=e1547]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1549]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1558]':
                          - generic [ref=e1559]: Coord
                          - img [ref=e1561]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1565] [cursor=pointer]:
                    - img [ref=e1568]
                    - generic [ref=e1571]:
                      - generic [ref=e1572]:
                        - generic "Cora Cuevas" [ref=e1573]
                        - generic [ref=e1574]: 2d
                      - generic [ref=e1576]: Cora Cuevas
                      - generic [ref=e1579]: → Add talent · shortlist empty
                      - generic [ref=e1580]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1582]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1591]':
                          - generic [ref=e1592]: Coord
                          - img [ref=e1594]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1598] [cursor=pointer]:
                    - img [ref=e1601]
                    - generic [ref=e1604]:
                      - generic [ref=e1605]:
                        - generic "Cora Cuevas" [ref=e1606]
                        - generic [ref=e1607]: 2d
                      - generic [ref=e1608]:
                        - generic [ref=e1609]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1610]: 0/1
                      - generic [ref=e1613]: → Nudge talent · 1 not responded
                      - generic [ref=e1614]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1616]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1625]':
                          - generic [ref=e1626]: Coord
                          - img [ref=e1628]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1632] [cursor=pointer]:
                    - img [ref=e1635]
                    - generic [ref=e1638]:
                      - generic [ref=e1639]:
                        - generic "Cora Cuevas" [ref=e1640]
                        - generic [ref=e1641]: 2d
                      - generic [ref=e1642]:
                        - generic [ref=e1643]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1644]: 0/1
                      - generic [ref=e1647]: → Nudge talent · 1 not responded
                      - generic [ref=e1648]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1650]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1659]':
                          - generic [ref=e1660]: Coord
                          - img [ref=e1662]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1666] [cursor=pointer]:
                    - img [ref=e1669]
                    - generic [ref=e1672]:
                      - generic [ref=e1673]:
                        - generic "Cora Cuevas" [ref=e1674]
                        - generic [ref=e1675]: 2d
                      - generic [ref=e1676]:
                        - generic [ref=e1677]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1678]: 0/1
                      - generic [ref=e1681]: → Nudge talent · 1 not responded
                      - generic [ref=e1682]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1684]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1693]':
                          - generic [ref=e1694]: Coord
                          - img [ref=e1696]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1700] [cursor=pointer]:
                    - img [ref=e1703]
                    - generic [ref=e1706]:
                      - generic [ref=e1707]:
                        - generic "Cora Cuevas" [ref=e1708]
                        - generic [ref=e1709]: 2d
                      - generic [ref=e1710]:
                        - generic [ref=e1711]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1712]: 0/1
                      - generic [ref=e1715]: → Nudge talent · 1 not responded
                      - generic [ref=e1716]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1718]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1727]':
                          - generic [ref=e1728]: Coord
                          - img [ref=e1730]
                          - text: QA
                  - generic [ref=e1733]: Today
                  - button "Nadia Varela 18h Nadia Varela 1 of 1 talent accepted Booked · $800 4 3 Coord QA" [ref=e1735] [cursor=pointer]:
                    - img [ref=e1738]
                    - generic [ref=e1741]:
                      - generic [ref=e1742]:
                        - generic "Nadia Varela" [ref=e1743]
                        - generic [ref=e1744]: 18h
                      - generic [ref=e1745]:
                        - generic [ref=e1746]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1747]: 1/1
                      - generic [ref=e1748]:
                        - generic [ref=e1749]: Booked · $800
                        - generic [ref=e1750]: "4"
                      - generic [ref=e1751]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1753]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1762]':
                          - generic [ref=e1763]: Coord
                          - img [ref=e1765]
                          - text: QA
                  - button "Nadia Varela 22h Nadia Varela 1 of 1 talent accepted Booked · $800 4 3 Coord QA" [ref=e1769] [cursor=pointer]:
                    - img [ref=e1772]
                    - generic [ref=e1775]:
                      - generic [ref=e1776]:
                        - generic "Nadia Varela" [ref=e1777]
                        - generic [ref=e1778]: 22h
                      - generic [ref=e1779]:
                        - generic [ref=e1780]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1781]: 1/1
                      - generic [ref=e1782]:
                        - generic [ref=e1783]: Booked · $800
                        - generic [ref=e1784]: "4"
                      - generic [ref=e1785]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1787]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1796]':
                          - generic [ref=e1797]: Coord
                          - img [ref=e1799]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted Booked · $800 4 3 Coord QA" [ref=e1803] [cursor=pointer]:
                    - img [ref=e1806]
                    - generic [ref=e1809]:
                      - generic [ref=e1810]:
                        - generic "Nadia Varela" [ref=e1811]
                        - generic [ref=e1812]: 23h
                      - generic [ref=e1813]:
                        - generic [ref=e1814]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1815]: 1/1
                      - generic [ref=e1816]:
                        - generic [ref=e1817]: Booked · $800
                        - generic [ref=e1818]: "4"
                      - generic [ref=e1819]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1821]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1830]':
                          - generic [ref=e1831]: Coord
                          - img [ref=e1833]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted Offer $800 · awaiting client 1 2 Coord QA" [ref=e1837] [cursor=pointer]:
                    - img [ref=e1840]
                    - generic [ref=e1843]:
                      - generic [ref=e1844]:
                        - generic "Nadia Varela" [ref=e1845]
                        - generic [ref=e1846]: 23h
                      - generic [ref=e1847]:
                        - generic [ref=e1848]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1849]: 1/1
                      - generic [ref=e1850]:
                        - generic [ref=e1851]: Offer $800 · awaiting client
                        - generic [ref=e1852]: "1"
                      - generic [ref=e1853]:
                        - 'progressbar "Stage 2 of 4: Offer" [ref=e1855]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1864]':
                          - generic [ref=e1865]: Coord
                          - img [ref=e1867]
                          - text: QA
              - generic [ref=e1871]:
                - generic [ref=e1872]:
                  - generic [ref=e1873]:
                    - button "Back to Inbox" [ref=e1874] [cursor=pointer]:
                      - img [ref=e1875]
                    - generic:
                      - heading "Cora Cuevas · Cora Cuevas" [level=1]:
                        - generic:
                          - text: Cora Cuevas
                          - generic [ref=e1877]: · Cora Cuevas
                      - 'generic "Source: Cold email" [ref=e1878]':
                        - img [ref=e1880]
                        - text: Cold email
                    - generic [ref=e1882]:
                      - generic [ref=e1883]:
                        - button "Edit job details" [ref=e1884] [cursor=pointer]:
                          - img [ref=e1885]
                        - button "Propose a time" [ref=e1887] [cursor=pointer]:
                          - img [ref=e1888]
                          - generic [ref=e1891]: Propose a time
                        - 'button "Coordinator: QA Journeys Owner · click to reassign or assign a talent" [ref=e1892] [cursor=pointer]':
                          - img [ref=e1893]
                          - generic [ref=e1897]: "Coord: QA"
                        - button "Move to" [ref=e1899] [cursor=pointer]:
                          - text: Move to
                          - img [ref=e1900]
                        - button "Search this conversation" [ref=e1902] [cursor=pointer]:
                          - img [ref=e1903]
                        - button "More actions" [ref=e1908] [cursor=pointer]:
                          - img [ref=e1910]
                      - 'button "Status: Inquiry. Open full breakdown." [ref=e1914] [cursor=pointer]':
                        - text: Inquiry
                        - img [ref=e1915]
                  - generic [ref=e1917]:
                    - button "1 talent on this inquiry. Open the Lineup tab." [ref=e1918] [cursor=pointer]:
                      - generic "QA Journeys Talent · pending" [ref=e1920]:
                        - img [ref=e1922]
                      - generic [ref=e1925]: 1 talent
                      - generic [ref=e1926]: · 0/1 accepted
                    - 'button "Offer state: Draft · $0. Open the Offer tab." [ref=e1927] [cursor=pointer]': Draft · $0
                - generic [ref=e1928]:
                  - tablist [ref=e1929]:
                    - tab "Client" [ref=e1930] [cursor=pointer]:
                      - img [ref=e1932]
                      - generic [ref=e1936]: Client
                    - tab "Group" [ref=e1937] [cursor=pointer]:
                      - img [ref=e1939]
                      - generic [ref=e1944]: Group
                    - tab "Activity" [ref=e1945] [cursor=pointer]:
                      - img [ref=e1947]
                      - generic [ref=e1950]: Activity
                    - tab "Lineup" [ref=e1951] [cursor=pointer]:
                      - generic [ref=e1952]: Lineup
                    - tab "Offer" [selected] [ref=e1953] [cursor=pointer]:
                      - img [ref=e1955]
                      - generic [ref=e1958]: Offer
                    - tab "Details" [ref=e1959] [cursor=pointer]:
                      - generic [ref=e1960]: Details
                    - tab "Files" [ref=e1961] [cursor=pointer]:
                      - img [ref=e1963]
                      - generic [ref=e1967]: Files
                  - generic [ref=e1970]:
                    - generic [ref=e1972]:
                      - generic [ref=e1974]: Draft
                      - generic [ref=e1975]: $0
                    - button "Send to client" [ref=e1977] [cursor=pointer]
                    - generic [ref=e1979]:
                      - generic [ref=e1980]:
                        - generic [ref=e1981]: Draft editor
                        - button "Collapse" [ref=e1982] [cursor=pointer]
                      - generic [ref=e1983]:
                        - generic [ref=e1984]: Talent
                        - generic [ref=e1985]: Unit
                        - generic [ref=e1986]: Qty
                        - generic [ref=e1987]: Client rate
                        - generic [ref=e1988]: Talent gets
                      - generic [ref=e1991]:
                        - combobox [ref=e1992]:
                          - option "— choose talent —"
                          - option "QA Journeys Talent" [selected]
                          - option "QA Journeys Therapist B"
                          - option "QA Stylist C 1789056442571"
                          - option "QA Stylist C 1789056697210"
                          - option "QA Stylist C 1789056763904"
                          - option "QA Stylist C 1789057258133"
                          - option "QA Stylist C 1789058000476"
                          - option "QA Stylist C 1789058206222"
                          - option "QA Stylist C 1789058391126"
                          - option "QA Stylist C 1789058780034"
                          - option "QA Stylist C 1789059109800"
                          - option "QA Stylist C 1789060297309"
                        - combobox [ref=e1993]:
                          - option "/hr"
                          - option "/day"
                          - option "/wk"
                          - option "/half-day"
                          - option "/event" [selected]
                          - option "/person"
                          - option "/session"
                          - option "flat"
                          - option "custom"
                        - spinbutton [ref=e1994]: "1"
                        - spinbutton [ref=e1995]: "0"
                        - spinbutton [ref=e1996]: "0"
                        - button "×" [ref=e1997] [cursor=pointer]
                        - generic [ref=e1998]: Loading services…
                        - generic [ref=e1999]:
                          - textbox "Line label (e.g. Full-day + travel)" [ref=e2000]: QA Journeys Talent
                          - textbox "What's included (optional)" [ref=e2001]
                      - generic [ref=e2002]:
                        - button "+ Add line item" [ref=e2003] [cursor=pointer]
                        - generic [ref=e2004]: Total
                        - generic "Auto-summed from the line items above, this is exactly what the client sees on the offer and is charged at booking." [ref=e2005]: $0
                        - generic "An extra agency charge added on top of the line items — your coordination fee. Leave 0 if your margin is already in the rates." [ref=e2006] [cursor=pointer]: Agency fee
                        - spinbutton "Agency fee" [ref=e2007]: "0"
                        - button "Save draft" [ref=e2008] [cursor=pointer]
                      - generic [ref=e2009]:
                        - generic [ref=e2010]: Where this money goes
                        - generic [ref=e2011]:
                          - generic [ref=e2012]: Client list price
                          - generic [ref=e2013]: $0.00
                        - generic [ref=e2014]:
                          - generic [ref=e2015]: Talent is paid
                          - generic [ref=e2016]: $0.00
                        - generic [ref=e2017]:
                          - generic [ref=e2018]: Your workspace keeps
                          - generic [ref=e2019]: (before the platform share)
                          - generic [ref=e2020]: $0.00
                        - alert [ref=e2021]: This talent is set to receive $0 — check the “Talent gets” column.
                        - generic [ref=e2022]: A platform fee (a small client surcharge plus a share of your margin) is calculated at booking and shown on the confirmed booking.
                      - generic [ref=e2023]:
                        - generic [ref=e2024]:
                          - generic [ref=e2025]: Booking terms
                          - generic [ref=e2026]: Negotiated as part of this offer — both parties see them before approving.
                        - generic [ref=e2027]:
                          - generic [ref=e2028]: Refund policy
                          - combobox "Refund policy Full refund 14+ days out, 50% at 7 to 14 days, none under 7 days; deposit non-refundable" [ref=e2029]:
                            - option "Tiered" [selected]
                            - option "Flexible"
                            - option "Strict"
                            - option "Manual"
                          - generic [ref=e2030]: Full refund 14+ days out, 50% at 7 to 14 days, none under 7 days; deposit non-refundable
                        - generic [ref=e2031]:
                          - generic [ref=e2032]: Balance collection
                          - combobox "Balance collection Deposit now; the balance is requested in Messages before the event" [ref=e2033]:
                            - option "Deposit now, balance in Messages" [selected]
                            - option "Pay in person"
                            - option "Full amount now"
                          - generic [ref=e2034]: Deposit now; the balance is requested in Messages before the event
                        - generic [ref=e2036]:
                          - generic [ref=e2037]: Deposit
                          - spinbutton "Deposit %" [ref=e2038]: "0"
                          - generic [ref=e2039]: "%"
                        - generic [ref=e2040]:
                          - generic [ref=e2041]:
                            - generic [ref=e2042]: Deposit due now
                            - generic [ref=e2043]: —
                            - generic [ref=e2044]: 0% of total
                          - generic [ref=e2045]:
                            - generic [ref=e2046]: Balance later
                            - generic [ref=e2047]: —
                            - generic [ref=e2048]: Deposit now, balance in Messages
                - generic [ref=e2049]:
                  - generic [ref=e2050]: Reply to client to keep this moving.
                  - button "Reply to client" [ref=e2051] [cursor=pointer]
                  - button "Dismiss next-action nudge" [ref=e2052] [cursor=pointer]: ×
    - dialog [ref=e2053]:
      - separator "Resize drawer" [ref=e2054]
      - banner [ref=e2055]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e2056]:
          - button "Copy link to this drawer" [ref=e2058] [cursor=pointer]:
            - img [ref=e2059]
          - generic [ref=e2062]:
            - button "compact size" [ref=e2064] [cursor=pointer]:
              - img [ref=e2065]
            - button "half size" [ref=e2069] [cursor=pointer]:
              - img [ref=e2070]
            - button "full size" [ref=e2074] [cursor=pointer]:
              - img [ref=e2075]
          - button "Close" [ref=e2078] [cursor=pointer]:
            - img [ref=e2079]
    - status
  - alert [ref=e2082]
```

# Test source

```ts
  202 |     /draft|pending|sent/,
  203 |   );
  204 | 
  205 |   await page.screenshot({
  206 |     path: testInfo.outputPath("c08-op-assign.png"),
  207 |     fullPage: true,
  208 |   });
  209 | });
  210 | 
  211 | test("C08-OP send: staff prices a line and sends the offer", async ({ page }, testInfo) => {
  212 |   test.setTimeout(180_000);
  213 |   const marker = `c08-op-${Date.now()}@impronta.test`;
  214 |   const brief = "Need two models for a catalog shoot next month.";
  215 | 
  216 |   const chat = await openFreshDirectoryChat(page);
  217 |   const composer = chat.getByPlaceholder(/type your message|write a reply|type a message/i);
  218 |   await expect(composer).toBeVisible({ timeout: 30_000 });
  219 |   await composer.fill(brief);
  220 |   const sendLine = chat.getByRole("button", { name: /send message/i }).first();
  221 |   if (await sendLine.isVisible().catch(() => false)) {
  222 |     await sendLine.click();
  223 |   } else {
  224 |     await chat.getByRole("button", { name: /send to agency/i }).click();
  225 |   }
  226 |   await expect(chat.getByPlaceholder(/^first name$/i)).toBeVisible({ timeout: 20_000 });
  227 |   await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  228 |   await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  229 |   await chat.getByPlaceholder(/email/i).fill(marker);
  230 |   await chat.getByRole("button", { name: /^send message$/i }).click();
  231 |   await expect(
  232 |     page.getByText(/inquiry received|got it, we've received your message|sent[,·] awaiting|inquiry sent/i).first(),
  233 |   ).toBeVisible({ timeout: 60_000 });
  234 | 
  235 |   const seed = await latestGuestDirectoryInquiry(marker);
  236 |   expect(seed, "C08-OP send guest inquiry must exist before staff send").not.toBeNull();
  237 | 
  238 |   await signInJourneysStaff(page, "/admin/messages");
  239 |   await expect(page).toHaveURL(/\/admin\/messages/, { timeout: 30_000 });
  240 |   const inbox = page.locator("[data-tulala-inbox-scroll]");
  241 |   await expect(inbox).toBeVisible({ timeout: 40_000 });
  242 |   // Messages after the fidelity pass keeps the h1 in the tree but hidden;
  243 |   // the inbox is the identity check for this screen.
  244 |   await assertNotAuthWall(page);
  245 |   await page.keyboard.press("Escape");
  246 | 
  247 |   const allChip = page.getByRole("button", { name: /^all$/i });
  248 |   if (await allChip.isVisible().catch(() => false)) {
  249 |     await allChip.click();
  250 |   }
  251 |   const row = inbox
  252 |     .getByRole("button", { name: /cora cuevas/i })
  253 |     .filter({ hasText: /shortlist empty/i })
  254 |     .first();
  255 |   await expect(row).toBeVisible({ timeout: 30_000 });
  256 |   await row.click();
  257 | 
  258 |   await page.getByRole("tab", { name: /^lineup$/i }).click();
  259 |   await expect(page.locator("[data-live-lineup-loading]")).toHaveCount(0, {
  260 |     timeout: 20_000,
  261 |   });
  262 |   const manage = page.getByText(/^manage$/i);
  263 |   if (await manage.isVisible().catch(() => false)) {
  264 |     await manage.click();
  265 |   }
  266 |   const alreadyOnLineup = page.getByText(/qa journeys talent/i);
  267 |   if (!(await alreadyOnLineup.isVisible().catch(() => false))) {
  268 |     const addTalent = page.getByRole("button", { name: /^add talent$/i });
  269 |     await expect(addTalent).toBeVisible({ timeout: 20_000 });
  270 |     await addTalent.click();
  271 |     const rosterSearch = page.getByPlaceholder(/search roster/i);
  272 |     await expect(rosterSearch).toBeVisible({ timeout: 10_000 });
  273 |     await rosterSearch.fill("QA Journeys");
  274 |     await page.getByRole("button", { name: "QA Journeys Talent", exact: true }).click();
  275 |     await expect(page.getByText(/invited|added to lineup/i).first()).toBeVisible({
  276 |       timeout: 20_000,
  277 |     });
  278 |   }
  279 | 
  280 |   await page.getByRole("tab", { name: /^offer$/i }).click();
  281 |   const startOffer = page.getByRole("button", { name: /start drafting offer/i });
  282 |   if (await startOffer.isVisible().catch(() => false)) {
  283 |     await startOffer.click();
  284 |     await expect(page.getByText(/offer draft created/i)).toBeVisible({
  285 |       timeout: 20_000,
  286 |     });
  287 |   }
  288 |   // Fidelity keeps the draft editor collapsed ("1 line item · total $0").
  289 |   // Other "Edit" buttons exist on Messages; only the one beside Draft editor
  290 |   // expands the line-item grid.
  291 |   const draftEditorLabel = page.getByText(/^draft editor$/i);
  292 |   await expect(draftEditorLabel).toBeVisible({ timeout: 20_000 });
  293 |   const editorEdit = draftEditorLabel.locator("xpath=..").getByRole("button", { name: /^edit$/i });
  294 |   if (await editorEdit.isVisible().catch(() => false)) {
  295 |     await editorEdit.click();
  296 |   }
  297 | 
  298 |   const addLine = page.getByRole("button", { name: /add line item/i });
  299 |   const talentSelect = page
  300 |     .locator("select")
  301 |     .filter({ has: page.locator("option", { hasText: /qa journeys talent/i }) });
> 302 |   await expect(addLine.or(talentSelect.first())).toBeVisible({ timeout: 20_000 });
      |                                                  ^ Error: expect(locator).toBeVisible() failed
  303 |   if ((await talentSelect.count()) === 0) {
  304 |     await addLine.click();
  305 |   }
  306 |   await expect(talentSelect.first()).toBeVisible({ timeout: 10_000 });
  307 |   await talentSelect.first().selectOption({ label: "QA Journeys Talent" });
  308 |   const rate = page.locator('input[placeholder="rate"]').first();
  309 |   await expect(rate).toBeVisible({ timeout: 10_000 });
  310 |   await rate.fill("800");
  311 |   await page.getByRole("button", { name: /^save draft$/i }).click();
  312 |   await expect(page.getByText(/saved ·/i).first()).toBeVisible({ timeout: 20_000 });
  313 | 
  314 |   const sendOffer = page.getByRole("button", { name: /^send to client$/i });
  315 |   await expect(sendOffer).toBeEnabled({ timeout: 20_000 });
  316 |   await sendOffer.click();
  317 |   await expect(
  318 |     page.getByText(/send offer done|awaiting client and talent approval/i).first(),
  319 |   ).toBeVisible({ timeout: 30_000 });
  320 | 
  321 |   expect(
  322 |     await latestGuestDirectoryInquiry(marker),
  323 |     "C08-OP send guest inquiry must still exist on qa-journeys",
  324 |   ).not.toBeNull();
  325 |   const sent = await latestSentDirectoryInquiry();
  326 |   expect(sent, "a sent offer must exist on qa-journeys").not.toBeNull();
  327 |   expect(sent?.offerStatus, "offer must be sent on qa-journeys").toBe("sent");
  328 |   expect(sent?.sentAt, "sent_at must be stamped").not.toBeNull();
  329 |   expect(Number(sent?.totalClientPrice ?? 0)).toBeGreaterThan(0);
  330 |   expect(sent?.contactEmail ?? "").toMatch(/c08-op-/);
  331 |   expect(sent?.inquiryStatus).toMatch(/offer_pending|coordination/);
  332 |   const lines = await inquiryOfferLines(sent!.offerId);
  333 |   expect(lines.length, "sent offer must have a priced line").toBeGreaterThan(0);
  334 |   expect(lines.some((line) => line.talentProfileId === QA_JOURNEYS_TALENT_ID)).toBe(true);
  335 |   expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBeGreaterThan(0);
  336 |   const approvals = await inquiryOfferApprovalCount(sent!.offerId);
  337 |   expect(approvals, "send must seed at least the priced talent approval").toBeGreaterThan(0);
  338 | 
  339 |   await page.screenshot({
  340 |     path: testInfo.outputPath("c08-op-send.png"),
  341 |     fullPage: true,
  342 |   });
  343 | });
  344 | 
  345 | test("C08-TAL accept: talent approves the sent offer", async ({ page }, testInfo) => {
  346 |   test.setTimeout(180_000);
  347 |   const awaiting = await latestSentOfferAwaitingTalent();
  348 |   expect(awaiting, "a sent offer must still wait on QA Journeys Talent").not.toBeNull();
  349 |   expect(awaiting?.offerStatus).toBe("sent");
  350 |   expect(awaiting?.inquiryStatus).toMatch(/offer_pending|coordination/);
  351 | 
  352 |   await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
  353 |   await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
  354 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  355 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  356 |   await expect(page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i })).toHaveCount(0);
  357 |   await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  358 | 
  359 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  360 |   if (await offerTab.isVisible().catch(() => false)) {
  361 |     await offerTab.click();
  362 |   }
  363 |   const approve = page.getByRole("button", { name: /approve offer/i });
  364 |   const acceptInvite = page.getByRole("button", { name: /^accept$/i });
  365 |   if (!(await approve.isVisible().catch(() => false))) {
  366 |     if (await acceptInvite.isVisible().catch(() => false)) {
  367 |       await acceptInvite.click();
  368 |       if (await offerTab.isVisible().catch(() => false)) {
  369 |         await offerTab.click();
  370 |       }
  371 |     }
  372 |   }
  373 |   if (!(await approve.isVisible().catch(() => false))) {
  374 |     await expect(approve)
  375 |       .toBeVisible({ timeout: 15_000 })
  376 |       .catch(() => undefined);
  377 |   }
  378 |   if (!(await approve.isVisible().catch(() => false))) {
  379 |     await page.goto("/talent/inbox");
  380 |     await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  381 |     const allChip = page.getByRole("button", { name: /^all$/i });
  382 |     if (await allChip.isVisible().catch(() => false)) {
  383 |       await allChip.click();
  384 |     }
  385 |     const row = page
  386 |       .getByRole("button", { name: /cora cuevas/i })
  387 |       .filter({ hasText: /offer sla/i })
  388 |       .first();
  389 |     await expect(row).toBeVisible({ timeout: 40_000 });
  390 |     await row.click();
  391 |     if (await offerTab.isVisible().catch(() => false)) {
  392 |       await offerTab.click();
  393 |     }
  394 |   }
  395 |   await expect(approve).toBeVisible({ timeout: 40_000 });
  396 |   await approve.click();
  397 |   await expect(
  398 |     page.getByText(
  399 |       /offer approved|you've approved|approved the offer|waiting on client|you approved/i,
  400 |     ).first(),
  401 |   ).toBeVisible({ timeout: 30_000 });
  402 | 
```