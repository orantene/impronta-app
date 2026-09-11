# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-TAL accept: talent approves the sent offer
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:345:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /cora cuevas/i }).filter({ hasText: /offer sla/i }).first()
Expected: visible
Timeout: 40000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 40000ms
  - waiting for getByRole('button', { name: /cora cuevas/i }).filter({ hasText: /offer sla/i }).first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - link "Skip to main content" [ref=e3] [cursor=pointer]:
      - /url: "#tulala-main"
    - main "talent surface" [ref=e4]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - img [ref=e8]
          - generic [ref=e17]: Sell what you do, not what you ship
        - button "Acting as QA Journeys (48-case fixture) — switch" [ref=e19] [cursor=pointer]:
          - generic [ref=e21]:
            - generic [ref=e23]: QA Journeys (48-case fixture)
            - generic [ref=e24]: $0 net YTD
          - img [ref=e26]
        - button "Notifications · 15 unread" [ref=e29] [cursor=pointer]:
          - img [ref=e30]
          - generic [ref=e33]: 9+
        - link "Preview site" [ref=e34] [cursor=pointer]:
          - /url: /qa-journeys
          - img [ref=e35]
        - button "Open account menu — Signed in as QA Journeys Talent" [ref=e39] [cursor=pointer]:
          - img [ref=e41]
      - generic [ref=e44]:
        - complementary [ref=e45]:
          - link "Skip to page content" [ref=e46] [cursor=pointer]:
            - /url: "#tulala-talent-content"
          - navigation "Talent sections" [ref=e47]:
            - button "Today" [ref=e49] [cursor=pointer]:
              - img [ref=e50]
              - generic [ref=e54]: Today
            - generic [ref=e55]:
              - generic [ref=e56]: Work
              - button "Messages" [ref=e57] [cursor=pointer]:
                - img [ref=e58]
                - generic [ref=e61]: Messages
              - button "Calendar" [ref=e62] [cursor=pointer]:
                - img [ref=e63]
                - generic [ref=e66]: Calendar
              - button "Money" [ref=e67] [cursor=pointer]:
                - img [ref=e68]
                - generic [ref=e71]: Money
            - generic [ref=e72]:
              - generic [ref=e73]: Presence
              - button "Profile" [ref=e74] [cursor=pointer]:
                - img [ref=e75]
                - generic [ref=e78]: Profile
              - button "Public page" [ref=e79] [cursor=pointer]:
                - img [ref=e80]
                - generic [ref=e83]: Public page
              - button "Services" [ref=e84] [cursor=pointer]:
                - img [ref=e85]
                - generic [ref=e88]: Services
              - button "Reviews" [ref=e89] [cursor=pointer]:
                - img [ref=e90]
                - generic [ref=e92]: Reviews
          - generic [ref=e94]:
            - button "Plan, currently Free. Open plan comparison." [ref=e95] [cursor=pointer]:
              - generic [ref=e96]: Plan
              - generic [ref=e97]: Free
            - link "Preview profile" [ref=e98] [cursor=pointer]:
              - /url: https://tulala.digital/t/QA-JNY-T1
              - img [ref=e99]
              - text: Preview profile
            - button "Settings" [ref=e101] [cursor=pointer]:
              - img [ref=e102]
              - generic [ref=e105]: Settings
        - main [ref=e106]:
          - generic [ref=e108]:
            - complementary [ref=e109]:
              - generic [ref=e110]:
                - generic [ref=e111]:
                  - heading "My jobs" [level=3] [ref=e112]
                  - generic [ref=e113]:
                    - generic [ref=e114]: "32"
                    - button "Collapse jobs list" [ref=e115] [cursor=pointer]:
                      - img [ref=e116]
                - generic [ref=e119]:
                  - textbox "Search jobs…" [ref=e120]
                  - img [ref=e122]
                  - generic [ref=e125]: ⌘K
                - generic [ref=e126]:
                  - button "All jobs" [ref=e127] [cursor=pointer]
                  - button "Inquiry" [ref=e128] [cursor=pointer]
                  - button "Hold" [ref=e129] [cursor=pointer]
                  - button "Booked" [ref=e130] [cursor=pointer]
                  - button "Past" [ref=e131] [cursor=pointer]
              - generic [ref=e132]:
                - generic [ref=e133]: Today
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 1 Inquiry SLA: fresh awaiting you" [ref=e134] [cursor=pointer]':
                  - img [ref=e137]
                  - generic [ref=e140]:
                    - generic "Cora Cuevas" [ref=e142]
                    - generic [ref=e144]: Need two models for a catalog shoot next month.
                    - generic [ref=e145]:
                      - generic [ref=e146]: "QA: Awaiting your response."
                      - generic [ref=e147]: now
                      - generic [ref=e148]: "1"
                    - generic [ref=e149]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e151]'
                      - generic [ref=e160]: Inquiry
                      - 'generic "SLA: fresh" [ref=e161]'
                      - generic [ref=e162]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 1 Inquiry SLA: fresh awaiting you" [ref=e163] [cursor=pointer]':
                  - img [ref=e166]
                  - generic [ref=e169]:
                    - generic "Cora Cuevas" [ref=e171]
                    - generic [ref=e173]: Need two models for a catalog shoot next month.
                    - generic [ref=e174]:
                      - generic [ref=e175]: "QA: Awaiting your response."
                      - generic [ref=e176]: now
                      - generic [ref=e177]: "1"
                    - generic [ref=e178]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e180]'
                      - generic [ref=e189]: Inquiry
                      - 'generic "SLA: fresh" [ref=e190]'
                      - generic [ref=e191]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 Inquiry SLA: fresh awaiting you" [ref=e192] [cursor=pointer]':
                  - img [ref=e195]
                  - generic [ref=e198]:
                    - generic "Cora Cuevas" [ref=e200]
                    - generic [ref=e202]: Need two models for a catalog shoot next month.
                    - generic [ref=e203]:
                      - generic [ref=e204]: "QA: Awaiting your response."
                      - generic [ref=e205]: now
                    - generic [ref=e206]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e208]'
                      - generic [ref=e217]: Inquiry
                      - 'generic "SLA: fresh" [ref=e218]'
                      - generic [ref=e219]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 1 Inquiry SLA: fresh awaiting you" [ref=e220] [cursor=pointer]':
                  - img [ref=e223]
                  - generic [ref=e226]:
                    - generic "Cora Cuevas" [ref=e228]
                    - generic [ref=e230]: Need two models for a catalog shoot next month.
                    - generic [ref=e231]:
                      - generic [ref=e232]: "QA: Awaiting your response."
                      - generic [ref=e233]: now
                      - generic [ref=e234]: "1"
                    - generic [ref=e235]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e237]'
                      - generic [ref=e246]: Inquiry
                      - 'generic "SLA: fresh" [ref=e247]'
                      - generic [ref=e248]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 Inquiry SLA: fresh awaiting you" [ref=e249] [cursor=pointer]':
                  - img [ref=e252]
                  - generic [ref=e255]:
                    - generic "Cora Cuevas" [ref=e257]
                    - generic [ref=e259]: Need two models for a catalog shoot next month.
                    - generic [ref=e260]:
                      - generic [ref=e261]: "QA: Awaiting your response."
                      - generic [ref=e262]: now
                    - generic [ref=e263]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e265]'
                      - generic [ref=e274]: Inquiry
                      - 'generic "SLA: fresh" [ref=e275]'
                      - generic [ref=e276]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 2 Offer SLA: fresh awaiting you" [ref=e277] [cursor=pointer]':
                  - img [ref=e280]
                  - generic [ref=e283]:
                    - generic "Cora Cuevas" [ref=e285]
                    - generic [ref=e287]: Need two models for a catalog shoot next month.
                    - generic [ref=e288]:
                      - generic [ref=e289]: "QA: Awaiting your response."
                      - generic [ref=e290]: now
                      - generic [ref=e291]: "1"
                    - generic [ref=e292]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e294]'
                      - generic [ref=e303]: Offer
                      - 'generic "SLA: fresh" [ref=e304]'
                      - generic [ref=e305]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 1h 1 Inquiry SLA: fresh awaiting you" [ref=e306] [cursor=pointer]':
                  - img [ref=e309]
                  - generic [ref=e312]:
                    - generic "Cora Cuevas" [ref=e314]
                    - generic [ref=e316]: Need two models for a catalog shoot next month.
                    - generic [ref=e317]:
                      - generic [ref=e318]: "QA: Awaiting your response."
                      - generic [ref=e319]: 1h
                    - generic [ref=e320]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e322]'
                      - generic [ref=e331]: Inquiry
                      - 'generic "SLA: fresh" [ref=e332]'
                      - generic [ref=e333]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 18h 1 Inquiry SLA: aging awaiting you" [ref=e334] [cursor=pointer]':
                  - img [ref=e337]
                  - generic [ref=e340]:
                    - generic "Nadia Varela" [ref=e342]
                    - generic [ref=e344]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e345]:
                      - generic [ref=e346]: "QA: Awaiting your response."
                      - generic [ref=e347]: 18h
                    - generic [ref=e348]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e350]'
                      - generic [ref=e359]: Inquiry
                      - 'generic "SLA: aging" [ref=e360]'
                      - generic [ref=e361]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 18h 2 3 Booked" [ref=e362] [cursor=pointer]':
                  - img [ref=e365]
                  - generic [ref=e368]:
                    - generic "Nadia Varela" [ref=e370]
                    - generic [ref=e372]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e373]:
                      - generic [ref=e374]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e375]: 18h
                      - generic [ref=e376]: "2"
                    - generic [ref=e377]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e379]'
                      - generic [ref=e388]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 22h 2 3 Booked" [ref=e389] [cursor=pointer]':
                  - img [ref=e392]
                  - generic [ref=e395]:
                    - generic "Nadia Varela" [ref=e397]
                    - generic [ref=e399]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e400]:
                      - generic [ref=e401]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e402]: 22h
                      - generic [ref=e403]: "2"
                    - generic [ref=e404]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e406]'
                      - generic [ref=e415]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 23h 2 3 Booked" [ref=e416] [cursor=pointer]':
                  - img [ref=e419]
                  - generic [ref=e422]:
                    - generic "Nadia Varela" [ref=e424]
                    - generic [ref=e426]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e427]:
                      - generic [ref=e428]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e429]: 23h
                      - generic [ref=e430]: "2"
                    - generic [ref=e431]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e433]'
                      - generic [ref=e442]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e443] [cursor=pointer]':
                  - img [ref=e446]
                  - generic [ref=e449]:
                    - generic "Nadia Varela" [ref=e451]
                    - generic [ref=e453]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e454]:
                      - generic [ref=e455]: "QA: Awaiting your response."
                      - generic [ref=e456]: 23h
                      - generic [ref=e457]: "1"
                    - generic [ref=e458]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e460]'
                      - generic [ref=e469]: Offer
                      - 'generic "SLA: aging" [ref=e470]'
                      - generic [ref=e471]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e472] [cursor=pointer]':
                  - img [ref=e475]
                  - generic [ref=e478]:
                    - generic "Nadia Varela" [ref=e480]
                    - generic [ref=e482]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e483]:
                      - generic [ref=e484]: "QA: Awaiting your response."
                      - generic [ref=e485]: 23h
                      - generic [ref=e486]: "1"
                    - generic [ref=e487]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e489]'
                      - generic [ref=e498]: Offer
                      - 'generic "SLA: aging" [ref=e499]'
                      - generic [ref=e500]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e501] [cursor=pointer]':
                  - img [ref=e504]
                  - generic [ref=e507]:
                    - generic "Nadia Varela" [ref=e509]
                    - generic [ref=e511]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e512]:
                      - generic [ref=e513]: "QA: Awaiting your response."
                      - generic [ref=e514]: 23h
                      - generic [ref=e515]: "1"
                    - generic [ref=e516]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e518]'
                      - generic [ref=e527]: Offer
                      - 'generic "SLA: aging" [ref=e528]'
                      - generic [ref=e529]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e530] [cursor=pointer]':
                  - img [ref=e533]
                  - generic [ref=e536]:
                    - generic "Nadia Varela" [ref=e538]
                    - generic [ref=e540]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e541]:
                      - generic [ref=e542]: "QA: Awaiting your response."
                      - generic [ref=e543]: 23h
                      - generic [ref=e544]: "1"
                    - generic [ref=e545]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e547]'
                      - generic [ref=e556]: Offer
                      - 'generic "SLA: aging" [ref=e557]'
                      - generic [ref=e558]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e559] [cursor=pointer]':
                  - img [ref=e562]
                  - generic [ref=e565]:
                    - generic "Nadia Varela" [ref=e567]
                    - generic [ref=e569]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e570]:
                      - generic [ref=e571]: "QA: Awaiting your response."
                      - generic [ref=e572]: 23h
                      - generic [ref=e573]: "1"
                    - generic [ref=e574]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e576]'
                      - generic [ref=e585]: Offer
                      - 'generic "SLA: aging" [ref=e586]'
                      - generic [ref=e587]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 Inquiry SLA: aging awaiting you" [ref=e588] [cursor=pointer]':
                  - img [ref=e591]
                  - generic [ref=e594]:
                    - generic "Nadia Varela" [ref=e596]
                    - generic [ref=e598]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e599]:
                      - generic [ref=e600]: "QA: Awaiting your response."
                      - generic [ref=e601]: 23h
                    - generic [ref=e602]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e604]'
                      - generic [ref=e613]: Inquiry
                      - 'generic "SLA: aging" [ref=e614]'
                      - generic [ref=e615]: awaiting you
                - generic [ref=e616]: This week
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e617] [cursor=pointer]':
                  - img [ref=e620]
                  - generic [ref=e623]:
                    - generic "Cora Cuevas" [ref=e625]
                    - generic [ref=e627]: Need two models for a catalog shoot next month.
                    - generic [ref=e628]:
                      - generic [ref=e629]: "QA: Awaiting your response."
                      - generic [ref=e630]: 2d
                    - generic [ref=e631]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e633]'
                      - generic [ref=e642]: Inquiry
                      - 'generic "SLA: overdue" [ref=e643]'
                      - generic [ref=e644]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e645] [cursor=pointer]':
                  - img [ref=e648]
                  - generic [ref=e651]:
                    - generic "Cora Cuevas" [ref=e653]
                    - generic [ref=e655]: Need two models for a catalog shoot next month.
                    - generic [ref=e656]:
                      - generic [ref=e657]: "QA: Awaiting your response."
                      - generic [ref=e658]: 2d
                    - generic [ref=e659]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e661]'
                      - generic [ref=e670]: Inquiry
                      - 'generic "SLA: overdue" [ref=e671]'
                      - generic [ref=e672]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e673] [cursor=pointer]':
                  - img [ref=e676]
                  - generic [ref=e679]:
                    - generic "Cora Cuevas" [ref=e681]
                    - generic [ref=e683]: Need two models for a catalog shoot next month.
                    - generic [ref=e684]:
                      - generic [ref=e685]: "QA: Awaiting your response."
                      - generic [ref=e686]: 2d
                    - generic [ref=e687]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e689]'
                      - generic [ref=e698]: Inquiry
                      - 'generic "SLA: overdue" [ref=e699]'
                      - generic [ref=e700]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e701] [cursor=pointer]':
                  - img [ref=e704]
                  - generic [ref=e707]:
                    - generic "Cora Cuevas" [ref=e709]
                    - generic [ref=e711]: Need two models for a catalog shoot next month.
                    - generic [ref=e712]:
                      - generic [ref=e713]: "QA: Awaiting your response."
                      - generic [ref=e714]: 2d
                    - generic [ref=e715]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e717]'
                      - generic [ref=e726]: Inquiry
                      - 'generic "SLA: overdue" [ref=e727]'
                      - generic [ref=e728]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Booking confirmed — check logistics tab. 2d 2 3 Booked" [ref=e729] [cursor=pointer]':
                  - img [ref=e732]
                  - generic [ref=e735]:
                    - generic "Cora Cuevas" [ref=e737]
                    - generic [ref=e739]: Need two models for a catalog shoot next month.
                    - generic [ref=e740]:
                      - generic [ref=e741]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e742]: 2d
                      - generic [ref=e743]: "2"
                    - generic [ref=e744]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e746]'
                      - generic [ref=e755]: Booked
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e756] [cursor=pointer]':
                  - img [ref=e759]
                  - generic [ref=e762]:
                    - generic "Cora Cuevas" [ref=e764]
                    - generic [ref=e766]: Need two models for a catalog shoot next month.
                    - generic [ref=e767]:
                      - generic [ref=e768]: "QA: Awaiting your response."
                      - generic [ref=e769]: 2d
                      - generic [ref=e770]: "1"
                    - generic [ref=e771]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e773]'
                      - generic [ref=e782]: Offer
                      - 'generic "SLA: overdue" [ref=e783]'
                      - generic [ref=e784]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e785] [cursor=pointer]':
                  - img [ref=e788]
                  - generic [ref=e791]:
                    - generic "Cora Cuevas" [ref=e793]
                    - generic [ref=e795]: Need two models for a catalog shoot next month.
                    - generic [ref=e796]:
                      - generic [ref=e797]: "QA: Awaiting your response."
                      - generic [ref=e798]: 2d
                      - generic [ref=e799]: "1"
                    - generic [ref=e800]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e802]'
                      - generic [ref=e811]: Offer
                      - 'generic "SLA: overdue" [ref=e812]'
                      - generic [ref=e813]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e814] [cursor=pointer]':
                  - img [ref=e817]
                  - generic [ref=e820]:
                    - generic "Cora Cuevas" [ref=e822]
                    - generic [ref=e824]: Need two models for a catalog shoot next month.
                    - generic [ref=e825]:
                      - generic [ref=e826]: "QA: Awaiting your response."
                      - generic [ref=e827]: 2d
                    - generic [ref=e828]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e830]'
                      - generic [ref=e839]: Inquiry
                      - 'generic "SLA: overdue" [ref=e840]'
                      - generic [ref=e841]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e842] [cursor=pointer]':
                  - img [ref=e845]
                  - generic [ref=e848]:
                    - generic "Cora Cuevas" [ref=e850]
                    - generic [ref=e852]: Need two models for a catalog shoot next month.
                    - generic [ref=e853]:
                      - generic [ref=e854]: "QA: Awaiting your response."
                      - generic [ref=e855]: 2d
                    - generic [ref=e856]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e858]'
                      - generic [ref=e867]: Inquiry
                      - 'generic "SLA: overdue" [ref=e868]'
                      - generic [ref=e869]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e870] [cursor=pointer]':
                  - img [ref=e873]
                  - generic [ref=e876]:
                    - generic "Cora Cuevas" [ref=e878]
                    - generic [ref=e880]: Need two models for a catalog shoot next month.
                    - generic [ref=e881]:
                      - generic [ref=e882]: "QA: Awaiting your response."
                      - generic [ref=e883]: 2d
                    - generic [ref=e884]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e886]'
                      - generic [ref=e895]: Inquiry
                      - 'generic "SLA: overdue" [ref=e896]'
                      - generic [ref=e897]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e898] [cursor=pointer]':
                  - img [ref=e901]
                  - generic [ref=e904]:
                    - generic "Cora Cuevas" [ref=e906]
                    - generic [ref=e908]: Need two models for a catalog shoot next month.
                    - generic [ref=e909]:
                      - generic [ref=e910]: "QA: Awaiting your response."
                      - generic [ref=e911]: 2d
                    - generic [ref=e912]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e914]'
                      - generic [ref=e923]: Inquiry
                      - 'generic "SLA: overdue" [ref=e924]'
                      - generic [ref=e925]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e926] [cursor=pointer]':
                  - img [ref=e929]
                  - generic [ref=e932]:
                    - generic "Cora Cuevas" [ref=e934]
                    - generic [ref=e936]: Need two models for a catalog shoot next month.
                    - generic [ref=e937]:
                      - generic [ref=e938]: "QA: Awaiting your response."
                      - generic [ref=e939]: 2d
                    - generic [ref=e940]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e942]'
                      - generic [ref=e951]: Inquiry
                      - 'generic "SLA: overdue" [ref=e952]'
                      - generic [ref=e953]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e954] [cursor=pointer]':
                  - img [ref=e957]
                  - generic [ref=e960]:
                    - generic "Cora Cuevas" [ref=e962]
                    - generic [ref=e964]: Need two models for a catalog shoot next month.
                    - generic [ref=e965]:
                      - generic [ref=e966]: "QA: Awaiting your response."
                      - generic [ref=e967]: 2d
                    - generic [ref=e968]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e970]'
                      - generic [ref=e979]: Inquiry
                      - 'generic "SLA: overdue" [ref=e980]'
                      - generic [ref=e981]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e982] [cursor=pointer]':
                  - img [ref=e985]
                  - generic [ref=e988]:
                    - generic "Cora Cuevas" [ref=e990]
                    - generic [ref=e992]: Need two models for a catalog shoot next month.
                    - generic [ref=e993]:
                      - generic [ref=e994]: "QA: Awaiting your response."
                      - generic [ref=e995]: 2d
                    - generic [ref=e996]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e998]'
                      - generic [ref=e1007]: Inquiry
                      - 'generic "SLA: overdue" [ref=e1008]'
                      - generic [ref=e1009]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e1010] [cursor=pointer]':
                  - img [ref=e1013]
                  - generic [ref=e1016]:
                    - generic "Cora Cuevas" [ref=e1018]
                    - generic [ref=e1020]: Need two models for a catalog shoot next month.
                    - generic [ref=e1021]:
                      - generic [ref=e1022]: "QA: Awaiting your response."
                      - generic [ref=e1023]: 2d
                    - generic [ref=e1024]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1026]'
                      - generic [ref=e1035]: Inquiry
                      - 'generic "SLA: overdue" [ref=e1036]'
                      - generic [ref=e1037]: awaiting you
            - separator "Resize jobs list" [ref=e1038]
            - generic [ref=e1041]:
              - generic [ref=e1042]:
                - generic [ref=e1043]:
                  - button "Back to my jobs" [ref=e1044] [cursor=pointer]:
                    - img [ref=e1045]
                  - generic [ref=e1047]:
                    - heading "Cora Cuevas · Need two models for a catalog shoot next month. Guest" [level=1] [ref=e1048]:
                      - generic [ref=e1049]:
                        - text: Cora Cuevas
                        - generic [ref=e1050]: · Need two models for a catalog shoot next month.
                      - generic [ref=e1052]: Guest
                    - generic [ref=e1054]: via QA Journeys (48-case fixture)
                  - generic [ref=e1055]:
                    - 'button "Status: Inquiry. Tap for details." [ref=e1056] [cursor=pointer]': Inquiry
                    - button "Search this conversation" [ref=e1057] [cursor=pointer]:
                      - img [ref=e1058]
                    - button "More actions" [ref=e1062] [cursor=pointer]:
                      - img [ref=e1064]
                - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1069]':
                  - generic [ref=e1072]: Inquiry
                  - generic [ref=e1075]: Offer
                  - generic [ref=e1078]: Booked
                  - generic [ref=e1081]: Wrapped
              - generic [ref=e1082]:
                - tablist [ref=e1083]:
                  - tab "Activity" [selected] [ref=e1084] [cursor=pointer]:
                    - img [ref=e1086]
                    - generic [ref=e1089]: Activity
                  - tab "Lineup" [ref=e1090] [cursor=pointer]:
                    - generic [ref=e1091]: Lineup
                  - tab "Offer" [ref=e1092] [cursor=pointer]:
                    - img [ref=e1094]
                    - generic [ref=e1097]: Offer
                  - tab "Details" [ref=e1098] [cursor=pointer]:
                    - generic [ref=e1099]: Details
                  - tab "Files" [ref=e1100] [cursor=pointer]:
                    - img [ref=e1102]
                    - generic [ref=e1106]: Files
                - generic [ref=e1107]:
                  - img [ref=e1108]
                  - text: Waiting for the coordinator to set up your offer.
                - generic [ref=e1111]:
                  - button "Search this thread" [ref=e1114] [cursor=pointer]:
                    - img [ref=e1115]
                  - generic [ref=e1119]:
                    - generic [ref=e1120]: No activity yet
                    - generic [ref=e1121]: Offers, payments and booking confirmations will appear here as the job progresses.
              - generic [ref=e1122]:
                - generic [ref=e1123]: Coordinator invited you. Accept, hold, or decline?
                - button "Decline" [ref=e1124] [cursor=pointer]
                - button "Accept" [ref=e1125] [cursor=pointer]
                - button "Dismiss next-action nudge" [ref=e1126] [cursor=pointer]: ×
    - dialog [ref=e1127]:
      - separator "Resize drawer" [ref=e1128]
      - banner [ref=e1129]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e1130]:
          - button "Copy link to this drawer" [ref=e1132] [cursor=pointer]:
            - img [ref=e1133]
          - generic [ref=e1136]:
            - button "compact size" [ref=e1138] [cursor=pointer]:
              - img [ref=e1139]
            - button "half size" [ref=e1143] [cursor=pointer]:
              - img [ref=e1144]
            - button "full size" [ref=e1148] [cursor=pointer]:
              - img [ref=e1149]
          - button "Close" [ref=e1152] [cursor=pointer]:
            - img [ref=e1153]
    - status
  - alert [ref=e1156]
```

# Test source

```ts
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
  302 |   await expect(addLine).toBeVisible({ timeout: 20_000 });
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
> 389 |     await expect(row).toBeVisible({ timeout: 40_000 });
      |                       ^ Error: expect(locator).toBeVisible() failed
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
  403 |   const approvals = await inquiryOfferApprovals(awaiting!.offerId);
  404 |   const talent = approvals.find(
  405 |     (row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID,
  406 |   );
  407 |   const client = approvals.find((row) => row.role === "client");
  408 |   expect(talent?.status, "talent approval must be accepted").toBe("accepted");
  409 |   expect(client?.status, "client approval must still be pending").toBe("pending");
  410 | 
  411 |   const after = await latestSentDirectoryInquiry();
  412 |   expect(after?.inquiryId).toBe(awaiting!.inquiryId);
  413 |   expect(after?.offerStatus, "offer stays sent until the client also accepts").toBe("sent");
  414 |   expect(after?.inquiryStatus, "inquiry stays offer_pending until the client accepts").toMatch(
  415 |     /offer_pending|coordination/,
  416 |   );
  417 | 
  418 |   await page.screenshot({
  419 |     path: testInfo.outputPath("c08-tal-accept.png"),
  420 |     fullPage: true,
  421 |   });
  422 | });
  423 | 
  424 | test("C08-CUS accept: claimed client approves the sent offer", async ({ page }, testInfo) => {
  425 |   test.setTimeout(180_000);
  426 |   const ready = await latestOfferReadyForClientAccept();
  427 |   expect(ready, "a sent offer must wait on the claimed client after talent approve").not.toBeNull();
  428 |   expect(ready?.contactEmail, "claimed client email must exist").toMatch(/@impronta\.test$/);
  429 |   expect(ready?.offerStatus).toBe("sent");
  430 |   expect(ready?.inquiryStatus).toMatch(/offer_pending|coordination/);
  431 | 
  432 |   const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  433 |   await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  434 |   if (/\/onboarding\/role/.test(page.url())) {
  435 |     const chooseClient = page.getByRole("button", { name: /i'm a client/i });
  436 |     await expect(chooseClient).toBeVisible();
  437 |     await chooseClient.click();
  438 |     await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  439 |     await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
  440 |     await page.goto(messagesPath);
  441 |   }
  442 |   await expect(page).toHaveURL(
  443 |     new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`),
  444 |     { timeout: 40_000 },
  445 |   );
  446 |   await expect(page.getByRole("heading", { name: /no client account here/i })).toHaveCount(0);
  447 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  448 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  449 | 
  450 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  451 |   if (await offerTab.isVisible().catch(() => false)) {
  452 |     await offerTab.click();
  453 |   }
  454 |   const approve = page.getByRole("button", { name: /approve & lock/i });
  455 |   await expect(approve.first()).toBeVisible({ timeout: 40_000 });
  456 |   await approve.first().click();
  457 |   await expect(approve.nth(1)).toBeVisible({ timeout: 15_000 });
  458 |   await approve.nth(1).click();
  459 |   await expect(
  460 |     page.getByText(
  461 |       /you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i,
  462 |     ).first(),
  463 |   ).toBeVisible({ timeout: 30_000 });
  464 | 
  465 |   const approvals = await inquiryOfferApprovals(ready!.offerId);
  466 |   const talent = approvals.find((row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID);
  467 |   const client = approvals.find((row) => row.role === "client");
  468 |   expect(talent?.status, "talent approval must stay accepted").toBe("accepted");
  469 |   expect(client?.status, "client approval must be accepted").toBe("accepted");
  470 | 
  471 |   const offer = await latestInquiryOffer(ready!.inquiryId);
  472 |   expect(offer?.status, "all parties accepted so the offer must flip to accepted").toBe("accepted");
  473 |   const persisted = await latestGuestDirectoryInquiry(ready!.contactEmail!);
  474 |   expect(persisted?.status, "inquiry must be approved once every party accepts").toBe("approved");
  475 | 
  476 |   await page.screenshot({
  477 |     path: testInfo.outputPath("c08-cus-accept.png"),
  478 |     fullPage: true,
  479 |   });
  480 | });
  481 | 
```