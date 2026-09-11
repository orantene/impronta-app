# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-TAL accept: talent approves the sent offer
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:341:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-tulala-inbox-row]').filter({ hasText: /cora cuevas/i }).filter({ hasText: /offer sla/i }).first()
Expected: visible
Timeout: 40000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 40000ms
  - waiting for locator('[data-tulala-inbox-row]').filter({ hasText: /cora cuevas/i }).filter({ hasText: /offer sla/i }).first()

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
        - button "Notifications · 14 unread" [ref=e29] [cursor=pointer]:
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
                    - generic [ref=e114]: "28"
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
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 Inquiry SLA: fresh awaiting you" [ref=e134] [cursor=pointer]':
                  - img [ref=e137]
                  - generic [ref=e140]:
                    - generic "Cora Cuevas" [ref=e142]
                    - generic [ref=e144]: Need two models for a catalog shoot next month.
                    - generic [ref=e145]:
                      - generic [ref=e146]: "QA: Awaiting your response."
                      - generic [ref=e147]: now
                    - generic [ref=e148]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e150]'
                      - generic [ref=e159]: Inquiry
                      - 'generic "SLA: fresh" [ref=e160]'
                      - generic [ref=e161]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 1 Inquiry SLA: fresh awaiting you" [ref=e162] [cursor=pointer]':
                  - img [ref=e165]
                  - generic [ref=e168]:
                    - generic "Cora Cuevas" [ref=e170]
                    - generic [ref=e172]: Need two models for a catalog shoot next month.
                    - generic [ref=e173]:
                      - generic [ref=e174]: "QA: Awaiting your response."
                      - generic [ref=e175]: now
                      - generic [ref=e176]: "1"
                    - generic [ref=e177]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e179]'
                      - generic [ref=e188]: Inquiry
                      - 'generic "SLA: fresh" [ref=e189]'
                      - generic [ref=e190]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 Inquiry SLA: fresh awaiting you" [ref=e191] [cursor=pointer]':
                  - img [ref=e194]
                  - generic [ref=e197]:
                    - generic "Cora Cuevas" [ref=e199]
                    - generic [ref=e201]: Need two models for a catalog shoot next month.
                    - generic [ref=e202]:
                      - generic [ref=e203]: "QA: Awaiting your response."
                      - generic [ref=e204]: now
                    - generic [ref=e205]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e207]'
                      - generic [ref=e216]: Inquiry
                      - 'generic "SLA: fresh" [ref=e217]'
                      - generic [ref=e218]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 1h 1 Inquiry SLA: fresh awaiting you" [ref=e219] [cursor=pointer]':
                  - img [ref=e222]
                  - generic [ref=e225]:
                    - generic "Cora Cuevas" [ref=e227]
                    - generic [ref=e229]: Need two models for a catalog shoot next month.
                    - generic [ref=e230]:
                      - generic [ref=e231]: "QA: Awaiting your response."
                      - generic [ref=e232]: 1h
                    - generic [ref=e233]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e235]'
                      - generic [ref=e244]: Inquiry
                      - 'generic "SLA: fresh" [ref=e245]'
                      - generic [ref=e246]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 17h 1 Inquiry SLA: aging awaiting you" [ref=e247] [cursor=pointer]':
                  - img [ref=e250]
                  - generic [ref=e253]:
                    - generic "Nadia Varela" [ref=e255]
                    - generic [ref=e257]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e258]:
                      - generic [ref=e259]: "QA: Awaiting your response."
                      - generic [ref=e260]: 17h
                    - generic [ref=e261]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e263]'
                      - generic [ref=e272]: Inquiry
                      - 'generic "SLA: aging" [ref=e273]'
                      - generic [ref=e274]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 18h 2 3 Booked" [ref=e275] [cursor=pointer]':
                  - img [ref=e278]
                  - generic [ref=e281]:
                    - generic "Nadia Varela" [ref=e283]
                    - generic [ref=e285]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e286]:
                      - generic [ref=e287]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e288]: 18h
                      - generic [ref=e289]: "2"
                    - generic [ref=e290]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e292]'
                      - generic [ref=e301]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 22h 2 3 Booked" [ref=e302] [cursor=pointer]':
                  - img [ref=e305]
                  - generic [ref=e308]:
                    - generic "Nadia Varela" [ref=e310]
                    - generic [ref=e312]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e313]:
                      - generic [ref=e314]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e315]: 22h
                      - generic [ref=e316]: "2"
                    - generic [ref=e317]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e319]'
                      - generic [ref=e328]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 23h 2 3 Booked" [ref=e329] [cursor=pointer]':
                  - img [ref=e332]
                  - generic [ref=e335]:
                    - generic "Nadia Varela" [ref=e337]
                    - generic [ref=e339]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e340]:
                      - generic [ref=e341]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e342]: 23h
                      - generic [ref=e343]: "2"
                    - generic [ref=e344]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e346]'
                      - generic [ref=e355]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e356] [cursor=pointer]':
                  - img [ref=e359]
                  - generic [ref=e362]:
                    - generic "Nadia Varela" [ref=e364]
                    - generic [ref=e366]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e367]:
                      - generic [ref=e368]: "QA: Awaiting your response."
                      - generic [ref=e369]: 23h
                      - generic [ref=e370]: "1"
                    - generic [ref=e371]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e373]'
                      - generic [ref=e382]: Offer
                      - 'generic "SLA: aging" [ref=e383]'
                      - generic [ref=e384]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e385] [cursor=pointer]':
                  - img [ref=e388]
                  - generic [ref=e391]:
                    - generic "Nadia Varela" [ref=e393]
                    - generic [ref=e395]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e396]:
                      - generic [ref=e397]: "QA: Awaiting your response."
                      - generic [ref=e398]: 23h
                      - generic [ref=e399]: "1"
                    - generic [ref=e400]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e402]'
                      - generic [ref=e411]: Offer
                      - 'generic "SLA: aging" [ref=e412]'
                      - generic [ref=e413]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e414] [cursor=pointer]':
                  - img [ref=e417]
                  - generic [ref=e420]:
                    - generic "Nadia Varela" [ref=e422]
                    - generic [ref=e424]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e425]:
                      - generic [ref=e426]: "QA: Awaiting your response."
                      - generic [ref=e427]: 23h
                      - generic [ref=e428]: "1"
                    - generic [ref=e429]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e431]'
                      - generic [ref=e440]: Offer
                      - 'generic "SLA: aging" [ref=e441]'
                      - generic [ref=e442]: awaiting you
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
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 Inquiry SLA: aging awaiting you" [ref=e501] [cursor=pointer]':
                  - img [ref=e504]
                  - generic [ref=e507]:
                    - generic "Nadia Varela" [ref=e509]
                    - generic [ref=e511]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e512]:
                      - generic [ref=e513]: "QA: Awaiting your response."
                      - generic [ref=e514]: 23h
                    - generic [ref=e515]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e517]'
                      - generic [ref=e526]: Inquiry
                      - 'generic "SLA: aging" [ref=e527]'
                      - generic [ref=e528]: awaiting you
                - generic [ref=e529]: This week
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e530] [cursor=pointer]':
                  - img [ref=e533]
                  - generic [ref=e536]:
                    - generic "Cora Cuevas" [ref=e538]
                    - generic [ref=e540]: Need two models for a catalog shoot next month.
                    - generic [ref=e541]:
                      - generic [ref=e542]: "QA: Awaiting your response."
                      - generic [ref=e543]: 2d
                    - generic [ref=e544]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e546]'
                      - generic [ref=e555]: Inquiry
                      - 'generic "SLA: overdue" [ref=e556]'
                      - generic [ref=e557]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e558] [cursor=pointer]':
                  - img [ref=e561]
                  - generic [ref=e564]:
                    - generic "Cora Cuevas" [ref=e566]
                    - generic [ref=e568]: Need two models for a catalog shoot next month.
                    - generic [ref=e569]:
                      - generic [ref=e570]: "QA: Awaiting your response."
                      - generic [ref=e571]: 2d
                    - generic [ref=e572]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e574]'
                      - generic [ref=e583]: Inquiry
                      - 'generic "SLA: overdue" [ref=e584]'
                      - generic [ref=e585]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e586] [cursor=pointer]':
                  - img [ref=e589]
                  - generic [ref=e592]:
                    - generic "Cora Cuevas" [ref=e594]
                    - generic [ref=e596]: Need two models for a catalog shoot next month.
                    - generic [ref=e597]:
                      - generic [ref=e598]: "QA: Awaiting your response."
                      - generic [ref=e599]: 2d
                    - generic [ref=e600]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e602]'
                      - generic [ref=e611]: Inquiry
                      - 'generic "SLA: overdue" [ref=e612]'
                      - generic [ref=e613]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Booking confirmed — check logistics tab. 2d 2 3 Booked" [ref=e614] [cursor=pointer]':
                  - img [ref=e617]
                  - generic [ref=e620]:
                    - generic "Cora Cuevas" [ref=e622]
                    - generic [ref=e624]: Need two models for a catalog shoot next month.
                    - generic [ref=e625]:
                      - generic [ref=e626]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e627]: 2d
                      - generic [ref=e628]: "2"
                    - generic [ref=e629]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e631]'
                      - generic [ref=e640]: Booked
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e641] [cursor=pointer]':
                  - img [ref=e644]
                  - generic [ref=e647]:
                    - generic "Cora Cuevas" [ref=e649]
                    - generic [ref=e651]: Need two models for a catalog shoot next month.
                    - generic [ref=e652]:
                      - generic [ref=e653]: "QA: Awaiting your response."
                      - generic [ref=e654]: 2d
                      - generic [ref=e655]: "1"
                    - generic [ref=e656]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e658]'
                      - generic [ref=e667]: Offer
                      - 'generic "SLA: overdue" [ref=e668]'
                      - generic [ref=e669]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e670] [cursor=pointer]':
                  - img [ref=e673]
                  - generic [ref=e676]:
                    - generic "Cora Cuevas" [ref=e678]
                    - generic [ref=e680]: Need two models for a catalog shoot next month.
                    - generic [ref=e681]:
                      - generic [ref=e682]: "QA: Awaiting your response."
                      - generic [ref=e683]: 2d
                      - generic [ref=e684]: "1"
                    - generic [ref=e685]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e687]'
                      - generic [ref=e696]: Offer
                      - 'generic "SLA: overdue" [ref=e697]'
                      - generic [ref=e698]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e699] [cursor=pointer]':
                  - img [ref=e702]
                  - generic [ref=e705]:
                    - generic "Cora Cuevas" [ref=e707]
                    - generic [ref=e709]: Need two models for a catalog shoot next month.
                    - generic [ref=e710]:
                      - generic [ref=e711]: "QA: Awaiting your response."
                      - generic [ref=e712]: 2d
                    - generic [ref=e713]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e715]'
                      - generic [ref=e724]: Inquiry
                      - 'generic "SLA: overdue" [ref=e725]'
                      - generic [ref=e726]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e727] [cursor=pointer]':
                  - img [ref=e730]
                  - generic [ref=e733]:
                    - generic "Cora Cuevas" [ref=e735]
                    - generic [ref=e737]: Need two models for a catalog shoot next month.
                    - generic [ref=e738]:
                      - generic [ref=e739]: "QA: Awaiting your response."
                      - generic [ref=e740]: 2d
                    - generic [ref=e741]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e743]'
                      - generic [ref=e752]: Inquiry
                      - 'generic "SLA: overdue" [ref=e753]'
                      - generic [ref=e754]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e755] [cursor=pointer]':
                  - img [ref=e758]
                  - generic [ref=e761]:
                    - generic "Cora Cuevas" [ref=e763]
                    - generic [ref=e765]: Need two models for a catalog shoot next month.
                    - generic [ref=e766]:
                      - generic [ref=e767]: "QA: Awaiting your response."
                      - generic [ref=e768]: 2d
                    - generic [ref=e769]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e771]'
                      - generic [ref=e780]: Inquiry
                      - 'generic "SLA: overdue" [ref=e781]'
                      - generic [ref=e782]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e783] [cursor=pointer]':
                  - img [ref=e786]
                  - generic [ref=e789]:
                    - generic "Cora Cuevas" [ref=e791]
                    - generic [ref=e793]: Need two models for a catalog shoot next month.
                    - generic [ref=e794]:
                      - generic [ref=e795]: "QA: Awaiting your response."
                      - generic [ref=e796]: 2d
                    - generic [ref=e797]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e799]'
                      - generic [ref=e808]: Inquiry
                      - 'generic "SLA: overdue" [ref=e809]'
                      - generic [ref=e810]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e811] [cursor=pointer]':
                  - img [ref=e814]
                  - generic [ref=e817]:
                    - generic "Cora Cuevas" [ref=e819]
                    - generic [ref=e821]: Need two models for a catalog shoot next month.
                    - generic [ref=e822]:
                      - generic [ref=e823]: "QA: Awaiting your response."
                      - generic [ref=e824]: 2d
                    - generic [ref=e825]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e827]'
                      - generic [ref=e836]: Inquiry
                      - 'generic "SLA: overdue" [ref=e837]'
                      - generic [ref=e838]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e839] [cursor=pointer]':
                  - img [ref=e842]
                  - generic [ref=e845]:
                    - generic "Cora Cuevas" [ref=e847]
                    - generic [ref=e849]: Need two models for a catalog shoot next month.
                    - generic [ref=e850]:
                      - generic [ref=e851]: "QA: Awaiting your response."
                      - generic [ref=e852]: 2d
                    - generic [ref=e853]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e855]'
                      - generic [ref=e864]: Inquiry
                      - 'generic "SLA: overdue" [ref=e865]'
                      - generic [ref=e866]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e867] [cursor=pointer]':
                  - img [ref=e870]
                  - generic [ref=e873]:
                    - generic "Cora Cuevas" [ref=e875]
                    - generic [ref=e877]: Need two models for a catalog shoot next month.
                    - generic [ref=e878]:
                      - generic [ref=e879]: "QA: Awaiting your response."
                      - generic [ref=e880]: 2d
                    - generic [ref=e881]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e883]'
                      - generic [ref=e892]: Inquiry
                      - 'generic "SLA: overdue" [ref=e893]'
                      - generic [ref=e894]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e895] [cursor=pointer]':
                  - img [ref=e898]
                  - generic [ref=e901]:
                    - generic "Cora Cuevas" [ref=e903]
                    - generic [ref=e905]: Need two models for a catalog shoot next month.
                    - generic [ref=e906]:
                      - generic [ref=e907]: "QA: Awaiting your response."
                      - generic [ref=e908]: 2d
                    - generic [ref=e909]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e911]'
                      - generic [ref=e920]: Inquiry
                      - 'generic "SLA: overdue" [ref=e921]'
                      - generic [ref=e922]: awaiting you
            - separator "Resize jobs list" [ref=e923]
            - generic [ref=e926]:
              - generic [ref=e927]:
                - generic [ref=e928]:
                  - button "Back to my jobs" [ref=e929] [cursor=pointer]:
                    - img [ref=e930]
                  - generic [ref=e932]:
                    - heading "Cora Cuevas · Need two models for a catalog shoot next month. Guest" [level=1] [ref=e933]:
                      - generic [ref=e934]:
                        - text: Cora Cuevas
                        - generic [ref=e935]: · Need two models for a catalog shoot next month.
                      - generic [ref=e937]: Guest
                    - generic [ref=e939]: via QA Journeys (48-case fixture)
                  - generic [ref=e940]:
                    - 'button "Status: Inquiry. Tap for details." [ref=e941] [cursor=pointer]': Inquiry
                    - button "Search this conversation" [ref=e942] [cursor=pointer]:
                      - img [ref=e943]
                    - button "More actions" [ref=e947] [cursor=pointer]:
                      - img [ref=e949]
                - 'progressbar "Stage 1 of 4: Inquiry" [ref=e954]':
                  - generic [ref=e957]: Inquiry
                  - generic [ref=e960]: Offer
                  - generic [ref=e963]: Booked
                  - generic [ref=e966]: Wrapped
              - generic [ref=e967]:
                - tablist [ref=e968]:
                  - tab "Activity" [selected] [ref=e969] [cursor=pointer]:
                    - img [ref=e971]
                    - generic [ref=e974]: Activity
                  - tab "Lineup" [ref=e975] [cursor=pointer]:
                    - generic [ref=e976]: Lineup
                  - tab "Offer" [ref=e977] [cursor=pointer]:
                    - img [ref=e979]
                    - generic [ref=e982]: Offer
                  - tab "Details" [ref=e983] [cursor=pointer]:
                    - generic [ref=e984]: Details
                  - tab "Files" [ref=e985] [cursor=pointer]:
                    - img [ref=e987]
                    - generic [ref=e991]: Files
                - generic [ref=e992]:
                  - img [ref=e993]
                  - text: Waiting for the coordinator to set up your offer.
                - generic [ref=e996]:
                  - button "Search this thread" [ref=e999] [cursor=pointer]:
                    - img [ref=e1000]
                  - generic [ref=e1004]:
                    - generic [ref=e1005]: No activity yet
                    - generic [ref=e1006]: Offers, payments and booking confirmations will appear here as the job progresses.
              - generic [ref=e1007]:
                - generic [ref=e1008]: Coordinator invited you. Accept, hold, or decline?
                - button "Decline" [ref=e1009] [cursor=pointer]
                - button "Accept" [ref=e1010] [cursor=pointer]
                - button "Dismiss next-action nudge" [ref=e1011] [cursor=pointer]: ×
    - dialog [ref=e1012]:
      - separator "Resize drawer" [ref=e1013]
      - banner [ref=e1014]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e1015]:
          - button "Copy link to this drawer" [ref=e1017] [cursor=pointer]:
            - img [ref=e1018]
          - generic [ref=e1021]:
            - button "compact size" [ref=e1023] [cursor=pointer]:
              - img [ref=e1024]
            - button "half size" [ref=e1028] [cursor=pointer]:
              - img [ref=e1029]
            - button "full size" [ref=e1033] [cursor=pointer]:
              - img [ref=e1034]
          - button "Close" [ref=e1037] [cursor=pointer]:
            - img [ref=e1038]
    - status
  - alert [ref=e1041]
```

# Test source

```ts
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
  299 |     await expect(addLine).toBeVisible({ timeout: 20_000 });
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
> 378 |     await expect(row).toBeVisible({ timeout: 40_000 });
      |                       ^ Error: expect(locator).toBeVisible() failed
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
  400 |   const after = await latestSentDirectoryInquiry();
  401 |   expect(after?.inquiryId).toBe(awaiting!.inquiryId);
  402 |   expect(after?.offerStatus, "offer stays sent until the client also accepts").toBe("sent");
  403 |   expect(after?.inquiryStatus, "inquiry stays offer_pending until the client accepts").toMatch(
  404 |     /offer_pending|coordination/,
  405 |   );
  406 | 
  407 |   await page.screenshot({
  408 |     path: testInfo.outputPath("c08-tal-accept.png"),
  409 |     fullPage: true,
  410 |   });
  411 | });
  412 | 
  413 | test("C08-CUS accept: claimed client approves the sent offer", async ({ page }, testInfo) => {
  414 |   test.setTimeout(180_000);
  415 |   const ready = await latestOfferReadyForClientAccept();
  416 |   expect(ready, "a sent offer must wait on the claimed client after talent approve").not.toBeNull();
  417 |   expect(ready?.contactEmail, "claimed client email must exist").toMatch(/@impronta\.test$/);
  418 |   expect(ready?.offerStatus).toBe("sent");
  419 |   expect(ready?.inquiryStatus).toMatch(/offer_pending|coordination/);
  420 | 
  421 |   const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  422 |   await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  423 |   if (/\/onboarding\/role/.test(page.url())) {
  424 |     const chooseClient = page.getByRole("button", { name: /i'm a client/i });
  425 |     await expect(chooseClient).toBeVisible();
  426 |     await chooseClient.click();
  427 |     await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  428 |     await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
  429 |     await page.goto(messagesPath);
  430 |   }
  431 |   await expect(page).toHaveURL(
  432 |     new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`),
  433 |     { timeout: 40_000 },
  434 |   );
  435 |   await expect(page.getByRole("heading", { name: /no client account here/i })).toHaveCount(0);
  436 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  437 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  438 | 
  439 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  440 |   if (await offerTab.isVisible().catch(() => false)) {
  441 |     await offerTab.click();
  442 |   }
  443 |   const approve = page.getByRole("button", { name: /approve & lock/i });
  444 |   await expect(approve.first()).toBeVisible({ timeout: 40_000 });
  445 |   await approve.first().click();
  446 |   await expect(approve.nth(1)).toBeVisible({ timeout: 15_000 });
  447 |   await approve.nth(1).click();
  448 |   await expect(
  449 |     page.getByText(
  450 |       /you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i,
  451 |     ).first(),
  452 |   ).toBeVisible({ timeout: 30_000 });
  453 | 
  454 |   const approvals = await inquiryOfferApprovals(ready!.offerId);
  455 |   const talent = approvals.find((row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID);
  456 |   const client = approvals.find((row) => row.role === "client");
  457 |   expect(talent?.status, "talent approval must stay accepted").toBe("accepted");
  458 |   expect(client?.status, "client approval must be accepted").toBe("accepted");
  459 | 
  460 |   const offer = await latestInquiryOffer(ready!.inquiryId);
  461 |   expect(offer?.status, "all parties accepted so the offer must flip to accepted").toBe("accepted");
  462 |   const persisted = await latestGuestDirectoryInquiry(ready!.contactEmail!);
  463 |   expect(persisted?.status, "inquiry must be approved once every party accepts").toBe("approved");
  464 | 
  465 |   await page.screenshot({
  466 |     path: testInfo.outputPath("c08-cus-accept.png"),
  467 |     fullPage: true,
  468 |   });
  469 | });
  470 | 
```