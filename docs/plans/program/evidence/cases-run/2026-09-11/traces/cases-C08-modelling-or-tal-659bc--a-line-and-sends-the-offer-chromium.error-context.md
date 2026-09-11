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

Locator: getByRole('button', { name: /add line item/i })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('button', { name: /add line item/i })

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
              - button "Notifications · 47 unread" [ref=e199] [cursor=pointer]:
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
                      - generic [ref=e219]: 44 threads
                      - button "Select" [ref=e220] [cursor=pointer]:
                        - img [ref=e221]
                        - text: Select
                  - generic [ref=e227]:
                    - textbox "Search clients, briefs…" [ref=e228]
                    - img [ref=e230]
                    - generic [ref=e233]: ⌘K
                  - generic [ref=e234]:
                    - button "All" [ref=e235] [cursor=pointer]
                    - button "Needs me (37)" [ref=e236] [cursor=pointer]
                    - button "Triage (33)" [ref=e237] [cursor=pointer]:
                      - img [ref=e239]
                      - text: Triage (33)
                    - button "Unread (47)" [ref=e241] [cursor=pointer]
                    - button "Coordinating 44" [ref=e242] [cursor=pointer]:
                      - img [ref=e244]
                      - text: Coordinating
                      - generic [ref=e246]: "44"
                    - button "Inquiry" [ref=e247] [cursor=pointer]
                    - button "Offer pending" [ref=e248] [cursor=pointer]
                    - button "Approved" [ref=e249] [cursor=pointer]
                    - button "Booked" [ref=e250] [cursor=pointer]
                    - button "Past" [ref=e251] [cursor=pointer]
                - generic [ref=e252]:
                  - generic [ref=e253]: This week
                  - button "Cora Cuevas NEW 2d Cora Cuevas → Add talent · shortlist empty 1 1 Coord QA" [ref=e255] [cursor=pointer]:
                    - img [ref=e258]
                    - generic [ref=e261]:
                      - generic [ref=e262]:
                        - generic "Cora Cuevas" [ref=e263]
                        - generic [ref=e264]: NEW
                        - generic [ref=e265]: 2d
                      - generic [ref=e267]: Cora Cuevas
                      - generic [ref=e268]:
                        - generic [ref=e270]: → Add talent · shortlist empty
                        - generic [ref=e271]: "1"
                      - generic [ref=e272]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e274]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e283]':
                          - generic [ref=e284]: Coord
                          - img [ref=e286]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e290] [cursor=pointer]:
                    - img [ref=e293]
                    - generic [ref=e296]:
                      - generic [ref=e297]:
                        - generic "Cora Cuevas" [ref=e298]
                        - generic [ref=e299]: NEW
                        - generic [ref=e300]: 2d
                      - generic [ref=e301]:
                        - generic [ref=e302]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e303]: 0/1
                      - generic [ref=e304]:
                        - generic [ref=e306]: → Nudge talent · 1 not responded
                        - generic [ref=e307]: "1"
                      - generic [ref=e308]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e310]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e319]':
                          - generic [ref=e320]: Coord
                          - img [ref=e322]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e326] [cursor=pointer]:
                    - img [ref=e329]
                    - generic [ref=e332]:
                      - generic [ref=e333]:
                        - generic "Cora Cuevas" [ref=e334]
                        - generic [ref=e335]: NEW
                        - generic [ref=e336]: 2d
                      - generic [ref=e337]:
                        - generic [ref=e338]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e339]: 0/1
                      - generic [ref=e340]:
                        - generic [ref=e342]: → Nudge talent · 1 not responded
                        - generic [ref=e343]: "1"
                      - generic [ref=e344]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e346]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e355]':
                          - generic [ref=e356]: Coord
                          - img [ref=e358]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e362] [cursor=pointer]:
                    - img [ref=e365]
                    - generic [ref=e368]:
                      - generic [ref=e369]:
                        - generic "Cora Cuevas" [ref=e370]
                        - generic [ref=e371]: NEW
                        - generic [ref=e372]: 2d
                      - generic [ref=e373]:
                        - generic [ref=e374]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e375]: 0/1
                      - generic [ref=e376]:
                        - generic [ref=e378]: → Nudge talent · 1 not responded
                        - generic [ref=e379]: "1"
                      - generic [ref=e380]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e382]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e391]':
                          - generic [ref=e392]: Coord
                          - img [ref=e394]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e398] [cursor=pointer]:
                    - img [ref=e401]
                    - generic [ref=e404]:
                      - generic [ref=e405]:
                        - generic "Cora Cuevas" [ref=e406]
                        - generic [ref=e407]: NEW
                        - generic [ref=e408]: 2d
                      - generic [ref=e409]:
                        - generic [ref=e410]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e411]: 0/1
                      - generic [ref=e412]:
                        - generic [ref=e414]: → Nudge talent · 1 not responded
                        - generic [ref=e415]: "1"
                      - generic [ref=e416]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e418]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e427]':
                          - generic [ref=e428]: Coord
                          - img [ref=e430]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas → Add talent · shortlist empty 1 1 Coord QA" [ref=e434] [cursor=pointer]:
                    - img [ref=e437]
                    - generic [ref=e440]:
                      - generic [ref=e441]:
                        - generic "Cora Cuevas" [ref=e442]
                        - generic [ref=e443]: NEW
                        - generic [ref=e444]: 2d
                      - generic [ref=e446]: Cora Cuevas
                      - generic [ref=e447]:
                        - generic [ref=e449]: → Add talent · shortlist empty
                        - generic [ref=e450]: "1"
                      - generic [ref=e451]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e453]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e462]':
                          - generic [ref=e463]: Coord
                          - img [ref=e465]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e469] [cursor=pointer]:
                    - img [ref=e472]
                    - generic [ref=e475]:
                      - generic [ref=e476]:
                        - generic "Cora Cuevas" [ref=e477]
                        - generic [ref=e478]: NEW
                        - generic [ref=e479]: 2d
                      - generic [ref=e480]:
                        - generic [ref=e481]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e482]: 0/1
                      - generic [ref=e483]:
                        - generic [ref=e485]: → Nudge talent · 1 not responded
                        - generic [ref=e486]: "1"
                      - generic [ref=e487]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e489]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e498]':
                          - generic [ref=e499]: Coord
                          - img [ref=e501]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 1 Coord QA" [ref=e505] [cursor=pointer]:
                    - img [ref=e508]
                    - generic [ref=e511]:
                      - generic [ref=e512]:
                        - generic "Cora Cuevas" [ref=e513]
                        - generic [ref=e514]: NEW
                        - generic [ref=e515]: 2d
                      - generic [ref=e516]:
                        - generic [ref=e517]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e518]: 0/1
                      - generic [ref=e519]:
                        - generic [ref=e521]: → Nudge talent · 1 not responded
                        - generic [ref=e522]: "1"
                      - generic [ref=e523]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e525]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e534]':
                          - generic [ref=e535]: Coord
                          - img [ref=e537]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Add talent · 0/1 accepted 1 1 Coord QA" [ref=e541] [cursor=pointer]:
                    - img [ref=e544]
                    - generic [ref=e547]:
                      - generic [ref=e548]:
                        - generic "Cora Cuevas" [ref=e549]
                        - generic [ref=e550]: NEW
                        - generic [ref=e551]: 2d
                      - generic [ref=e552]:
                        - generic [ref=e553]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e554]: 0/1
                      - generic [ref=e555]:
                        - generic [ref=e557]: → Add talent · 0/1 accepted
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
                  - button "Cora Cuevas NEW 2d Cora Cuevas → Add talent · shortlist empty 1 1 Coord QA" [ref=e612] [cursor=pointer]:
                    - img [ref=e615]
                    - generic [ref=e618]:
                      - generic [ref=e619]:
                        - generic "Cora Cuevas" [ref=e620]
                        - generic [ref=e621]: NEW
                        - generic [ref=e622]: 2d
                      - generic [ref=e624]: Cora Cuevas
                      - generic [ref=e625]:
                        - generic [ref=e627]: → Add talent · shortlist empty
                        - generic [ref=e628]: "1"
                      - generic [ref=e629]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e631]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e640]':
                          - generic [ref=e641]: Coord
                          - img [ref=e643]
                          - text: QA
                  - button "Cora Cuevas NEW 2d Cora Cuevas 0 of 1 talent accepted → Add talent · 0/1 accepted 1 1 Coord QA" [ref=e647] [cursor=pointer]:
                    - img [ref=e650]
                    - generic [ref=e653]:
                      - generic [ref=e654]:
                        - generic "Cora Cuevas" [ref=e655]
                        - generic [ref=e656]: NEW
                        - generic [ref=e657]: 2d
                      - generic [ref=e658]:
                        - generic [ref=e659]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e660]: 0/1
                      - generic [ref=e661]:
                        - generic [ref=e663]: → Add talent · 0/1 accepted
                        - generic [ref=e664]: "1"
                      - generic [ref=e665]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e667]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e676]':
                          - generic [ref=e677]: Coord
                          - img [ref=e679]
                          - text: QA
                  - generic [ref=e682]: Yesterday
                  - button "Cora Cuevas NEW 1d Cora Cuevas 1 of 1 talent accepted Offer $800 · awaiting client 3 2 Coord QA" [ref=e684] [cursor=pointer]:
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
                        - generic [ref=e699]: Offer $800 · awaiting client
                        - generic [ref=e700]: "3"
                      - generic [ref=e701]:
                        - 'progressbar "Stage 2 of 4: Offer" [ref=e703]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e712]':
                          - generic [ref=e713]: Coord
                          - img [ref=e715]
                          - text: QA
                  - button "Cora Cuevas NEW 1d Cora Cuevas 1 of 1 talent accepted Booked · $800 4 3 Coord QA" [ref=e719] [cursor=pointer]:
                    - img [ref=e722]
                    - generic [ref=e725]:
                      - generic [ref=e726]:
                        - generic "Cora Cuevas" [ref=e727]
                        - generic [ref=e728]: NEW
                        - generic [ref=e729]: 1d
                      - generic [ref=e730]:
                        - generic [ref=e731]: Cora Cuevas
                        - generic "1 of 1 talent accepted" [ref=e732]: 1/1
                      - generic [ref=e733]:
                        - generic [ref=e734]: Booked · $800
                        - generic [ref=e735]: "4"
                      - generic [ref=e736]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e738]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e747]':
                          - generic [ref=e748]: Coord
                          - img [ref=e750]
                          - text: QA
                  - generic [ref=e753]: This week
                  - button "Cora Cuevas NEW 2d Cora Cuevas 1 of 1 talent accepted Offer $800 · awaiting client 2 2 Coord QA" [ref=e755] [cursor=pointer]:
                    - img [ref=e758]
                    - generic [ref=e761]:
                      - generic [ref=e762]:
                        - generic "Cora Cuevas" [ref=e763]
                        - generic [ref=e764]: NEW
                        - generic [ref=e765]: 2d
                      - generic [ref=e766]:
                        - generic [ref=e767]: Cora Cuevas
                        - generic "1 of 1 talent accepted" [ref=e768]: 1/1
                      - generic [ref=e769]:
                        - generic [ref=e770]: Offer $800 · awaiting client
                        - generic [ref=e771]: "2"
                      - generic [ref=e772]:
                        - 'progressbar "Stage 2 of 4: Offer" [ref=e774]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e783]':
                          - generic [ref=e784]: Coord
                          - img [ref=e786]
                          - text: QA
                  - generic [ref=e789]: Today
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e791] [cursor=pointer]:
                    - img [ref=e794]
                    - generic [ref=e797]:
                      - generic [ref=e798]:
                        - generic "Cora Cuevas" [ref=e799]
                        - generic [ref=e800]: now
                      - generic [ref=e802]: Cora Cuevas
                      - generic [ref=e805]: → Add talent · shortlist empty
                      - generic [ref=e806]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e808]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e817]':
                          - generic [ref=e818]: Coord
                          - img [ref=e820]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e824] [cursor=pointer]:
                    - img [ref=e827]
                    - generic [ref=e830]:
                      - generic [ref=e831]:
                        - generic "Cora Cuevas" [ref=e832]
                        - generic [ref=e833]: now
                      - generic [ref=e835]: Cora Cuevas
                      - generic [ref=e838]: → Add talent · shortlist empty
                      - generic [ref=e839]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e841]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e850]':
                          - generic [ref=e851]: Coord
                          - img [ref=e853]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e857] [cursor=pointer]:
                    - img [ref=e860]
                    - generic [ref=e863]:
                      - generic [ref=e864]:
                        - generic "Cora Cuevas" [ref=e865]
                        - generic [ref=e866]: now
                      - generic [ref=e867]:
                        - generic [ref=e868]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e869]: 0/1
                      - generic [ref=e872]: → Nudge talent · 1 not responded
                      - generic [ref=e873]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e875]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e884]':
                          - generic [ref=e885]: Coord
                          - img [ref=e887]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas 1 of 1 talent accepted → Draft offer · lineup confirmed 1 1 Coord QA" [ref=e891] [cursor=pointer]:
                    - img [ref=e894]
                    - generic [ref=e897]:
                      - generic [ref=e898]:
                        - generic "Cora Cuevas" [ref=e899]
                        - generic [ref=e900]: now
                      - generic [ref=e901]:
                        - generic [ref=e902]: Cora Cuevas
                        - generic "1 of 1 talent accepted" [ref=e903]: 1/1
                      - generic [ref=e904]:
                        - generic [ref=e906]: → Draft offer · lineup confirmed
                        - generic [ref=e907]: "1"
                      - generic [ref=e908]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e910]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e919]':
                          - generic [ref=e920]: Coord
                          - img [ref=e922]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e926] [cursor=pointer]:
                    - img [ref=e929]
                    - generic [ref=e932]:
                      - generic [ref=e933]:
                        - generic "Cora Cuevas" [ref=e934]
                        - generic [ref=e935]: now
                      - generic [ref=e937]: Cora Cuevas
                      - generic [ref=e940]: → Add talent · shortlist empty
                      - generic [ref=e941]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e943]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e952]':
                          - generic [ref=e953]: Coord
                          - img [ref=e955]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e959] [cursor=pointer]:
                    - img [ref=e962]
                    - generic [ref=e965]:
                      - generic [ref=e966]:
                        - generic "Cora Cuevas" [ref=e967]
                        - generic [ref=e968]: now
                      - generic [ref=e970]: Cora Cuevas
                      - generic [ref=e973]: → Add talent · shortlist empty
                      - generic [ref=e974]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e976]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e985]':
                          - generic [ref=e986]: Coord
                          - img [ref=e988]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e992] [cursor=pointer]:
                    - img [ref=e995]
                    - generic [ref=e998]:
                      - generic [ref=e999]:
                        - generic "Cora Cuevas" [ref=e1000]
                        - generic [ref=e1001]: now
                      - generic [ref=e1003]: Cora Cuevas
                      - generic [ref=e1006]: → Add talent · shortlist empty
                      - generic [ref=e1007]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1009]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1018]':
                          - generic [ref=e1019]: Coord
                          - img [ref=e1021]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1025] [cursor=pointer]:
                    - img [ref=e1028]
                    - generic [ref=e1031]:
                      - generic [ref=e1032]:
                        - generic "Cora Cuevas" [ref=e1033]
                        - generic [ref=e1034]: now
                      - generic [ref=e1036]: Cora Cuevas
                      - generic [ref=e1039]: → Add talent · shortlist empty
                      - generic [ref=e1040]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1042]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1051]':
                          - generic [ref=e1052]: Coord
                          - img [ref=e1054]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1058] [cursor=pointer]:
                    - img [ref=e1061]
                    - generic [ref=e1064]:
                      - generic [ref=e1065]:
                        - generic "Cora Cuevas" [ref=e1066]
                        - generic [ref=e1067]: now
                      - generic [ref=e1069]: Cora Cuevas
                      - generic [ref=e1072]: → Add talent · shortlist empty
                      - generic [ref=e1073]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1075]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1084]':
                          - generic [ref=e1085]: Coord
                          - img [ref=e1087]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1091] [cursor=pointer]:
                    - img [ref=e1094]
                    - generic [ref=e1097]:
                      - generic [ref=e1098]:
                        - generic "Cora Cuevas" [ref=e1099]
                        - generic [ref=e1100]: now
                      - generic [ref=e1102]: Cora Cuevas
                      - generic [ref=e1105]: → Add talent · shortlist empty
                      - generic [ref=e1106]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1108]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1117]':
                          - generic [ref=e1118]: Coord
                          - img [ref=e1120]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1124] [cursor=pointer]:
                    - img [ref=e1127]
                    - generic [ref=e1130]:
                      - generic [ref=e1131]:
                        - generic "Cora Cuevas" [ref=e1132]
                        - generic [ref=e1133]: now
                      - generic [ref=e1135]: Cora Cuevas
                      - generic [ref=e1138]: → Add talent · shortlist empty
                      - generic [ref=e1139]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1141]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1150]':
                          - generic [ref=e1151]: Coord
                          - img [ref=e1153]
                          - text: QA
                  - button "Cora Cuevas now Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1157] [cursor=pointer]:
                    - img [ref=e1160]
                    - generic [ref=e1163]:
                      - generic [ref=e1164]:
                        - generic "Cora Cuevas" [ref=e1165]
                        - generic [ref=e1166]: now
                      - generic [ref=e1167]:
                        - generic [ref=e1168]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1169]: 0/1
                      - generic [ref=e1172]: → Nudge talent · 1 not responded
                      - generic [ref=e1173]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1175]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1184]':
                          - generic [ref=e1185]: Coord
                          - img [ref=e1187]
                          - text: QA
                  - button "Cora Cuevas 1h Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1191] [cursor=pointer]:
                    - img [ref=e1194]
                    - generic [ref=e1197]:
                      - generic [ref=e1198]:
                        - generic "Cora Cuevas" [ref=e1199]
                        - generic [ref=e1200]: 1h
                      - generic [ref=e1201]:
                        - generic [ref=e1202]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1203]: 0/1
                      - generic [ref=e1206]: → Nudge talent · 1 not responded
                      - generic [ref=e1207]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1209]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1218]':
                          - generic [ref=e1219]: Coord
                          - img [ref=e1221]
                          - text: QA
                  - button "Nadia Varela 17h Nadia Varela 1 of 1 talent accepted → Draft offer · lineup confirmed 1 Coord QA" [ref=e1225] [cursor=pointer]:
                    - img [ref=e1228]
                    - generic [ref=e1231]:
                      - generic [ref=e1232]:
                        - generic "Nadia Varela" [ref=e1233]
                        - generic [ref=e1234]: 17h
                      - generic [ref=e1235]:
                        - generic [ref=e1236]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1237]: 1/1
                      - generic [ref=e1240]: → Draft offer · lineup confirmed
                      - generic [ref=e1241]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1243]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1252]':
                          - generic [ref=e1253]: Coord
                          - img [ref=e1255]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted → Reply to client · \"QA Journeys Talent approved the offer.\" 3 3 Coord QA" [ref=e1259] [cursor=pointer]:
                    - img [ref=e1262]
                    - generic [ref=e1265]:
                      - generic [ref=e1266]:
                        - generic "Nadia Varela" [ref=e1267]
                        - generic [ref=e1268]: 23h
                      - generic [ref=e1269]:
                        - generic [ref=e1270]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1271]: 1/1
                      - generic [ref=e1272]:
                        - generic [ref=e1274]: → Reply to client · "QA Journeys Talent approved the offer."
                        - generic [ref=e1275]: "3"
                      - generic [ref=e1276]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1278]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1287]':
                          - generic [ref=e1288]: Coord
                          - img [ref=e1290]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted → Reply to client · \"QA Journeys Talent approved the offer.\" 3 3 Coord QA" [ref=e1294] [cursor=pointer]:
                    - img [ref=e1297]
                    - generic [ref=e1300]:
                      - generic [ref=e1301]:
                        - generic "Nadia Varela" [ref=e1302]
                        - generic [ref=e1303]: 23h
                      - generic [ref=e1304]:
                        - generic [ref=e1305]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1306]: 1/1
                      - generic [ref=e1307]:
                        - generic [ref=e1309]: → Reply to client · "QA Journeys Talent approved the offer."
                        - generic [ref=e1310]: "3"
                      - generic [ref=e1311]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1313]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1322]':
                          - generic [ref=e1323]: Coord
                          - img [ref=e1325]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted → Reply to client · \"QA Journeys Talent approved the offer.\" 3 3 Coord QA" [ref=e1329] [cursor=pointer]:
                    - img [ref=e1332]
                    - generic [ref=e1335]:
                      - generic [ref=e1336]:
                        - generic "Nadia Varela" [ref=e1337]
                        - generic [ref=e1338]: 23h
                      - generic [ref=e1339]:
                        - generic [ref=e1340]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1341]: 1/1
                      - generic [ref=e1342]:
                        - generic [ref=e1344]: → Reply to client · "QA Journeys Talent approved the offer."
                        - generic [ref=e1345]: "3"
                      - generic [ref=e1346]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1348]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1357]':
                          - generic [ref=e1358]: Coord
                          - img [ref=e1360]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted → Reply to client · \"QA Journeys Talent approved the offer.\" 3 3 Coord QA" [ref=e1364] [cursor=pointer]:
                    - img [ref=e1367]
                    - generic [ref=e1370]:
                      - generic [ref=e1371]:
                        - generic "Nadia Varela" [ref=e1372]
                        - generic [ref=e1373]: 23h
                      - generic [ref=e1374]:
                        - generic [ref=e1375]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1376]: 1/1
                      - generic [ref=e1377]:
                        - generic [ref=e1379]: → Reply to client · "QA Journeys Talent approved the offer."
                        - generic [ref=e1380]: "3"
                      - generic [ref=e1381]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1383]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1392]':
                          - generic [ref=e1393]: Coord
                          - img [ref=e1395]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1399] [cursor=pointer]:
                    - img [ref=e1402]
                    - generic [ref=e1405]:
                      - generic [ref=e1406]:
                        - generic "Nadia Varela" [ref=e1407]
                        - generic [ref=e1408]: 23h
                      - generic [ref=e1409]:
                        - generic [ref=e1410]: Nadia Varela
                        - generic "0 of 1 talent accepted" [ref=e1411]: 0/1
                      - generic [ref=e1414]: → Nudge talent · 1 not responded
                      - generic [ref=e1415]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1417]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1426]':
                          - generic [ref=e1427]: Coord
                          - img [ref=e1429]
                          - text: QA
                  - generic [ref=e1432]: This week
                  - button "Cora Cuevas 2d Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1434] [cursor=pointer]:
                    - img [ref=e1437]
                    - generic [ref=e1440]:
                      - generic [ref=e1441]:
                        - generic "Cora Cuevas" [ref=e1442]
                        - generic [ref=e1443]: 2d
                      - generic [ref=e1445]: Cora Cuevas
                      - generic [ref=e1448]: → Add talent · shortlist empty
                      - generic [ref=e1449]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1451]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1460]':
                          - generic [ref=e1461]: Coord
                          - img [ref=e1463]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1467] [cursor=pointer]:
                    - img [ref=e1470]
                    - generic [ref=e1473]:
                      - generic [ref=e1474]:
                        - generic "Cora Cuevas" [ref=e1475]
                        - generic [ref=e1476]: 2d
                      - generic [ref=e1478]: Cora Cuevas
                      - generic [ref=e1481]: → Add talent · shortlist empty
                      - generic [ref=e1482]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1484]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1493]':
                          - generic [ref=e1494]: Coord
                          - img [ref=e1496]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas → Add talent · shortlist empty 1 Coord QA" [ref=e1500] [cursor=pointer]:
                    - img [ref=e1503]
                    - generic [ref=e1506]:
                      - generic [ref=e1507]:
                        - generic "Cora Cuevas" [ref=e1508]
                        - generic [ref=e1509]: 2d
                      - generic [ref=e1511]: Cora Cuevas
                      - generic [ref=e1514]: → Add talent · shortlist empty
                      - generic [ref=e1515]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1517]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1526]':
                          - generic [ref=e1527]: Coord
                          - img [ref=e1529]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1533] [cursor=pointer]:
                    - img [ref=e1536]
                    - generic [ref=e1539]:
                      - generic [ref=e1540]:
                        - generic "Cora Cuevas" [ref=e1541]
                        - generic [ref=e1542]: 2d
                      - generic [ref=e1543]:
                        - generic [ref=e1544]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1545]: 0/1
                      - generic [ref=e1548]: → Nudge talent · 1 not responded
                      - generic [ref=e1549]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1551]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1560]':
                          - generic [ref=e1561]: Coord
                          - img [ref=e1563]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1567] [cursor=pointer]:
                    - img [ref=e1570]
                    - generic [ref=e1573]:
                      - generic [ref=e1574]:
                        - generic "Cora Cuevas" [ref=e1575]
                        - generic [ref=e1576]: 2d
                      - generic [ref=e1577]:
                        - generic [ref=e1578]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1579]: 0/1
                      - generic [ref=e1582]: → Nudge talent · 1 not responded
                      - generic [ref=e1583]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1585]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1594]':
                          - generic [ref=e1595]: Coord
                          - img [ref=e1597]
                          - text: QA
                  - button "Cora Cuevas 2d Cora Cuevas 0 of 1 talent accepted → Nudge talent · 1 not responded 1 Coord QA" [ref=e1601] [cursor=pointer]:
                    - img [ref=e1604]
                    - generic [ref=e1607]:
                      - generic [ref=e1608]:
                        - generic "Cora Cuevas" [ref=e1609]
                        - generic [ref=e1610]: 2d
                      - generic [ref=e1611]:
                        - generic [ref=e1612]: Cora Cuevas
                        - generic "0 of 1 talent accepted" [ref=e1613]: 0/1
                      - generic [ref=e1616]: → Nudge talent · 1 not responded
                      - generic [ref=e1617]:
                        - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1619]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1628]':
                          - generic [ref=e1629]: Coord
                          - img [ref=e1631]
                          - text: QA
                  - generic [ref=e1634]: Today
                  - button "Nadia Varela 18h Nadia Varela 1 of 1 talent accepted Booked · $800 4 3 Coord QA" [ref=e1636] [cursor=pointer]:
                    - img [ref=e1639]
                    - generic [ref=e1642]:
                      - generic [ref=e1643]:
                        - generic "Nadia Varela" [ref=e1644]
                        - generic [ref=e1645]: 18h
                      - generic [ref=e1646]:
                        - generic [ref=e1647]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1648]: 1/1
                      - generic [ref=e1649]:
                        - generic [ref=e1650]: Booked · $800
                        - generic [ref=e1651]: "4"
                      - generic [ref=e1652]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1654]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1663]':
                          - generic [ref=e1664]: Coord
                          - img [ref=e1666]
                          - text: QA
                  - button "Nadia Varela 22h Nadia Varela 1 of 1 talent accepted Booked · $800 4 3 Coord QA" [ref=e1670] [cursor=pointer]:
                    - img [ref=e1673]
                    - generic [ref=e1676]:
                      - generic [ref=e1677]:
                        - generic "Nadia Varela" [ref=e1678]
                        - generic [ref=e1679]: 22h
                      - generic [ref=e1680]:
                        - generic [ref=e1681]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1682]: 1/1
                      - generic [ref=e1683]:
                        - generic [ref=e1684]: Booked · $800
                        - generic [ref=e1685]: "4"
                      - generic [ref=e1686]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1688]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1697]':
                          - generic [ref=e1698]: Coord
                          - img [ref=e1700]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted Booked · $800 4 3 Coord QA" [ref=e1704] [cursor=pointer]:
                    - img [ref=e1707]
                    - generic [ref=e1710]:
                      - generic [ref=e1711]:
                        - generic "Nadia Varela" [ref=e1712]
                        - generic [ref=e1713]: 23h
                      - generic [ref=e1714]:
                        - generic [ref=e1715]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1716]: 1/1
                      - generic [ref=e1717]:
                        - generic [ref=e1718]: Booked · $800
                        - generic [ref=e1719]: "4"
                      - generic [ref=e1720]:
                        - 'progressbar "Stage 3 of 4: Booked" [ref=e1722]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1731]':
                          - generic [ref=e1732]: Coord
                          - img [ref=e1734]
                          - text: QA
                  - button "Nadia Varela 23h Nadia Varela 1 of 1 talent accepted Offer $800 · awaiting client 1 2 Coord QA" [ref=e1738] [cursor=pointer]:
                    - img [ref=e1741]
                    - generic [ref=e1744]:
                      - generic [ref=e1745]:
                        - generic "Nadia Varela" [ref=e1746]
                        - generic [ref=e1747]: 23h
                      - generic [ref=e1748]:
                        - generic [ref=e1749]: Nadia Varela
                        - generic "1 of 1 talent accepted" [ref=e1750]: 1/1
                      - generic [ref=e1751]:
                        - generic [ref=e1752]: Offer $800 · awaiting client
                        - generic [ref=e1753]: "1"
                      - generic [ref=e1754]:
                        - 'progressbar "Stage 2 of 4: Offer" [ref=e1756]'
                        - 'generic "Coordinator: QA Journeys Owner" [ref=e1765]':
                          - generic [ref=e1766]: Coord
                          - img [ref=e1768]
                          - text: QA
              - generic [ref=e1772]:
                - generic [ref=e1773]:
                  - generic [ref=e1774]:
                    - button "Back to Inbox" [ref=e1775] [cursor=pointer]:
                      - img [ref=e1776]
                    - generic:
                      - heading "Cora Cuevas · Cora Cuevas" [level=1]:
                        - generic:
                          - text: Cora Cuevas
                          - generic [ref=e1778]: · Cora Cuevas
                      - 'generic "Source: Cold email" [ref=e1779]':
                        - img [ref=e1781]
                        - text: Cold email
                    - generic [ref=e1783]:
                      - generic [ref=e1784]:
                        - button "Edit job details" [ref=e1785] [cursor=pointer]:
                          - img [ref=e1786]
                        - button "Propose a time" [ref=e1788] [cursor=pointer]:
                          - img [ref=e1789]
                          - generic [ref=e1792]: Propose a time
                        - 'button "Coordinator: QA Journeys Owner · click to reassign or assign a talent" [ref=e1793] [cursor=pointer]':
                          - img [ref=e1794]
                          - generic [ref=e1798]: "Coord: QA"
                        - button "Move to" [ref=e1800] [cursor=pointer]:
                          - text: Move to
                          - img [ref=e1801]
                        - button "Search this conversation" [ref=e1803] [cursor=pointer]:
                          - img [ref=e1804]
                        - button "More actions" [ref=e1809] [cursor=pointer]:
                          - img [ref=e1811]
                      - 'button "Status: Inquiry. Open full breakdown." [ref=e1815] [cursor=pointer]':
                        - text: Inquiry
                        - img [ref=e1816]
                  - generic [ref=e1818]:
                    - button "1 talent on this inquiry. Open the Lineup tab." [ref=e1819] [cursor=pointer]:
                      - generic "QA Journeys Talent · pending" [ref=e1821]:
                        - img [ref=e1823]
                      - generic [ref=e1826]: 1 talent
                      - generic [ref=e1827]: · 0/1 accepted
                    - 'button "Offer state: Draft · $0. Open the Offer tab." [ref=e1828] [cursor=pointer]': Draft · $0
                - generic [ref=e1829]:
                  - tablist [ref=e1830]:
                    - tab "Client" [ref=e1831] [cursor=pointer]:
                      - img [ref=e1833]
                      - generic [ref=e1837]: Client
                    - tab "Group" [ref=e1838] [cursor=pointer]:
                      - img [ref=e1840]
                      - generic [ref=e1845]: Group
                    - tab "Activity" [ref=e1846] [cursor=pointer]:
                      - img [ref=e1848]
                      - generic [ref=e1851]: Activity
                    - tab "Lineup" [ref=e1852] [cursor=pointer]:
                      - generic [ref=e1853]: Lineup
                    - tab "Offer" [selected] [ref=e1854] [cursor=pointer]:
                      - img [ref=e1856]
                      - generic [ref=e1859]: Offer
                    - tab "Details" [ref=e1860] [cursor=pointer]:
                      - generic [ref=e1861]: Details
                    - tab "Files" [ref=e1862] [cursor=pointer]:
                      - img [ref=e1864]
                      - generic [ref=e1868]: Files
                  - generic [ref=e1871]:
                    - generic [ref=e1873]:
                      - generic [ref=e1875]: Draft
                      - generic [ref=e1876]: $0
                    - button "Send to client" [ref=e1878] [cursor=pointer]
                    - generic [ref=e1880]:
                      - generic [ref=e1881]: Draft editor
                      - generic [ref=e1882]: 1 line item · total $0
                      - button "Edit" [ref=e1883] [cursor=pointer]
                - generic [ref=e1884]:
                  - generic [ref=e1885]: Reply to client to keep this moving.
                  - button "Reply to client" [ref=e1886] [cursor=pointer]
                  - button "Dismiss next-action nudge" [ref=e1887] [cursor=pointer]: ×
    - dialog [ref=e1888]:
      - separator "Resize drawer" [ref=e1889]
      - banner [ref=e1890]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e1891]:
          - button "Copy link to this drawer" [ref=e1893] [cursor=pointer]:
            - img [ref=e1894]
          - generic [ref=e1897]:
            - button "compact size" [ref=e1899] [cursor=pointer]:
              - img [ref=e1900]
            - button "half size" [ref=e1904] [cursor=pointer]:
              - img [ref=e1905]
            - button "full size" [ref=e1909] [cursor=pointer]:
              - img [ref=e1910]
          - button "Close" [ref=e1913] [cursor=pointer]:
            - img [ref=e1914]
    - status
  - alert [ref=e1917]
```

# Test source

```ts
  199 |   expect(assigned, "staff assign must persist a talent lineup on qa-journeys").not.toBeNull();
  200 |   expect(assigned?.talentIds).toContain(QA_JOURNEYS_TALENT_ID);
  201 |   expect(assigned?.offerStatus, "draft offer must exist on qa-journeys").toMatch(
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
  289 |   const editDraft = page.getByRole("button", { name: /^edit$/i });
  290 |   if (await editDraft.first().isVisible().catch(() => false)) {
  291 |     await editDraft.first().click();
  292 |   }
  293 | 
  294 |   const addLine = page.getByRole("button", { name: /add line item/i });
  295 |   const talentSelect = page
  296 |     .locator("select")
  297 |     .filter({ has: page.locator("option", { hasText: /qa journeys talent/i }) });
  298 |   if ((await talentSelect.count()) === 0) {
> 299 |     await expect(addLine).toBeVisible({ timeout: 20_000 });
      |                           ^ Error: expect(locator).toBeVisible() failed
  300 |     await addLine.click();
  301 |   }
  302 |   await expect(talentSelect.first()).toBeVisible({ timeout: 10_000 });
  303 |   await talentSelect.first().selectOption({ label: "QA Journeys Talent" });
  304 |   const rate = page.locator('input[placeholder="rate"]').first();
  305 |   await expect(rate).toBeVisible({ timeout: 10_000 });
  306 |   await rate.fill("800");
  307 |   await page.getByRole("button", { name: /^save draft$/i }).click();
  308 |   await expect(page.getByText(/saved ·/i).first()).toBeVisible({ timeout: 20_000 });
  309 | 
  310 |   const sendOffer = page.getByRole("button", { name: /^send to client$/i });
  311 |   await expect(sendOffer).toBeEnabled({ timeout: 20_000 });
  312 |   await sendOffer.click();
  313 |   await expect(
  314 |     page.getByText(/send offer done|awaiting client and talent approval/i).first(),
  315 |   ).toBeVisible({ timeout: 30_000 });
  316 | 
  317 |   expect(
  318 |     await latestGuestDirectoryInquiry(marker),
  319 |     "C08-OP send guest inquiry must still exist on qa-journeys",
  320 |   ).not.toBeNull();
  321 |   const sent = await latestSentDirectoryInquiry();
  322 |   expect(sent, "a sent offer must exist on qa-journeys").not.toBeNull();
  323 |   expect(sent?.offerStatus, "offer must be sent on qa-journeys").toBe("sent");
  324 |   expect(sent?.sentAt, "sent_at must be stamped").not.toBeNull();
  325 |   expect(Number(sent?.totalClientPrice ?? 0)).toBeGreaterThan(0);
  326 |   expect(sent?.contactEmail ?? "").toMatch(/c08-op-/);
  327 |   expect(sent?.inquiryStatus).toMatch(/offer_pending|coordination/);
  328 |   const lines = await inquiryOfferLines(sent!.offerId);
  329 |   expect(lines.length, "sent offer must have a priced line").toBeGreaterThan(0);
  330 |   expect(lines.some((line) => line.talentProfileId === QA_JOURNEYS_TALENT_ID)).toBe(true);
  331 |   expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBeGreaterThan(0);
  332 |   const approvals = await inquiryOfferApprovalCount(sent!.offerId);
  333 |   expect(approvals, "send must seed at least the priced talent approval").toBeGreaterThan(0);
  334 | 
  335 |   await page.screenshot({
  336 |     path: testInfo.outputPath("c08-op-send.png"),
  337 |     fullPage: true,
  338 |   });
  339 | });
  340 | 
  341 | test("C08-TAL accept: talent approves the sent offer", async ({ page }, testInfo) => {
  342 |   test.setTimeout(180_000);
  343 |   const awaiting = await latestSentOfferAwaitingTalent();
  344 |   expect(awaiting, "a sent offer must still wait on QA Journeys Talent").not.toBeNull();
  345 |   expect(awaiting?.offerStatus).toBe("sent");
  346 |   expect(awaiting?.inquiryStatus).toMatch(/offer_pending|coordination/);
  347 | 
  348 |   await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
  349 |   await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
  350 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  351 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  352 |   await expect(page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i })).toHaveCount(0);
  353 |   await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  354 | 
  355 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  356 |   if (await offerTab.isVisible().catch(() => false)) {
  357 |     await offerTab.click();
  358 |   }
  359 |   const approve = page.getByRole("button", { name: /approve offer/i });
  360 |   const acceptInvite = page.getByRole("button", { name: /^(accept|show next action: accept)$/i });
  361 |   if (!(await approve.isVisible().catch(() => false))) {
  362 |     if (await acceptInvite.first().isVisible().catch(() => false)) {
  363 |       await acceptInvite.first().click();
  364 |     }
  365 |   }
  366 |   if (!(await approve.isVisible().catch(() => false))) {
  367 |     await page.goto("/talent/inbox");
  368 |     await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  369 |     const allChip = page.getByRole("button", { name: /^all$/i });
  370 |     if (await allChip.isVisible().catch(() => false)) {
  371 |       await allChip.click();
  372 |     }
  373 |     const row = page
  374 |       .locator("[data-tulala-inbox-row]")
  375 |       .filter({ hasText: /cora cuevas/i })
  376 |       .filter({ hasText: /offer sla/i })
  377 |       .first();
  378 |     await expect(row).toBeVisible({ timeout: 40_000 });
  379 |     await row.click();
  380 |     if (await offerTab.isVisible().catch(() => false)) {
  381 |       await offerTab.click();
  382 |     }
  383 |   }
  384 |   await expect(approve).toBeVisible({ timeout: 40_000 });
  385 |   await approve.click();
  386 |   await expect(
  387 |     page.getByText(
  388 |       /offer approved|you've approved|approved the offer|waiting on client|you approved/i,
  389 |     ).first(),
  390 |   ).toBeVisible({ timeout: 30_000 });
  391 | 
  392 |   const approvals = await inquiryOfferApprovals(awaiting!.offerId);
  393 |   const talent = approvals.find(
  394 |     (row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID,
  395 |   );
  396 |   const client = approvals.find((row) => row.role === "client");
  397 |   expect(talent?.status, "talent approval must be accepted").toBe("accepted");
  398 |   expect(client?.status, "client approval must still be pending").toBe("pending");
  399 | 
```