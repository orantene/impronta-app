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

Locator: getByRole('button', { name: /approve offer/i })
Expected: visible
Timeout: 40000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 40000ms
  - waiting for getByRole('button', { name: /approve offer/i })

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
        - button "Notifications · 16 unread" [ref=e29] [cursor=pointer]:
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
                    - generic [ref=e114]: "34"
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
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 1 Inquiry SLA: fresh awaiting you" [ref=e192] [cursor=pointer]':
                  - img [ref=e195]
                  - generic [ref=e198]:
                    - generic "Cora Cuevas" [ref=e200]
                    - generic [ref=e202]: Need two models for a catalog shoot next month.
                    - generic [ref=e203]:
                      - generic [ref=e204]: "QA: Awaiting your response."
                      - generic [ref=e205]: now
                      - generic [ref=e206]: "1"
                    - generic [ref=e207]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e209]'
                      - generic [ref=e218]: Inquiry
                      - 'generic "SLA: fresh" [ref=e219]'
                      - generic [ref=e220]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 Inquiry SLA: fresh awaiting you" [ref=e221] [cursor=pointer]':
                  - img [ref=e224]
                  - generic [ref=e227]:
                    - generic "Cora Cuevas" [ref=e229]
                    - generic [ref=e231]: Need two models for a catalog shoot next month.
                    - generic [ref=e232]:
                      - generic [ref=e233]: "QA: Awaiting your response."
                      - generic [ref=e234]: now
                    - generic [ref=e235]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e237]'
                      - generic [ref=e246]: Inquiry
                      - 'generic "SLA: fresh" [ref=e247]'
                      - generic [ref=e248]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 1 Inquiry SLA: fresh awaiting you" [ref=e249] [cursor=pointer]':
                  - img [ref=e252]
                  - generic [ref=e255]:
                    - generic "Cora Cuevas" [ref=e257]
                    - generic [ref=e259]: Need two models for a catalog shoot next month.
                    - generic [ref=e260]:
                      - generic [ref=e261]: "QA: Awaiting your response."
                      - generic [ref=e262]: now
                      - generic [ref=e263]: "1"
                    - generic [ref=e264]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e266]'
                      - generic [ref=e275]: Inquiry
                      - 'generic "SLA: fresh" [ref=e276]'
                      - generic [ref=e277]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 Inquiry SLA: fresh awaiting you" [ref=e278] [cursor=pointer]':
                  - img [ref=e281]
                  - generic [ref=e284]:
                    - generic "Cora Cuevas" [ref=e286]
                    - generic [ref=e288]: Need two models for a catalog shoot next month.
                    - generic [ref=e289]:
                      - generic [ref=e290]: "QA: Awaiting your response."
                      - generic [ref=e291]: now
                    - generic [ref=e292]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e294]'
                      - generic [ref=e303]: Inquiry
                      - 'generic "SLA: fresh" [ref=e304]'
                      - generic [ref=e305]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 2 Offer SLA: fresh awaiting you" [ref=e306] [cursor=pointer]':
                  - img [ref=e309]
                  - generic [ref=e312]:
                    - generic "Cora Cuevas" [ref=e314]
                    - generic [ref=e316]: Need two models for a catalog shoot next month.
                    - generic [ref=e317]:
                      - generic [ref=e318]: "QA: Awaiting your response."
                      - generic [ref=e319]: now
                      - generic [ref=e320]: "1"
                    - generic [ref=e321]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e323]'
                      - generic [ref=e332]: Offer
                      - 'generic "SLA: fresh" [ref=e333]'
                      - generic [ref=e334]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 2 Offer SLA: fresh awaiting you" [ref=e335] [cursor=pointer]':
                  - img [ref=e338]
                  - generic [ref=e341]:
                    - generic "Cora Cuevas" [ref=e343]
                    - generic [ref=e345]: Need two models for a catalog shoot next month.
                    - generic [ref=e346]:
                      - generic [ref=e347]: "QA: Awaiting your response."
                      - generic [ref=e348]: now
                      - generic [ref=e349]: "1"
                    - generic [ref=e350]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e352]'
                      - generic [ref=e361]: Offer
                      - 'generic "SLA: fresh" [ref=e362]'
                      - generic [ref=e363]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 1h 1 Inquiry SLA: fresh awaiting you" [ref=e364] [cursor=pointer]':
                  - img [ref=e367]
                  - generic [ref=e370]:
                    - generic "Cora Cuevas" [ref=e372]
                    - generic [ref=e374]: Need two models for a catalog shoot next month.
                    - generic [ref=e375]:
                      - generic [ref=e376]: "QA: Awaiting your response."
                      - generic [ref=e377]: 1h
                    - generic [ref=e378]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e380]'
                      - generic [ref=e389]: Inquiry
                      - 'generic "SLA: fresh" [ref=e390]'
                      - generic [ref=e391]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 18h 1 Inquiry SLA: aging awaiting you" [ref=e392] [cursor=pointer]':
                  - img [ref=e395]
                  - generic [ref=e398]:
                    - generic "Nadia Varela" [ref=e400]
                    - generic [ref=e402]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e403]:
                      - generic [ref=e404]: "QA: Awaiting your response."
                      - generic [ref=e405]: 18h
                    - generic [ref=e406]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e408]'
                      - generic [ref=e417]: Inquiry
                      - 'generic "SLA: aging" [ref=e418]'
                      - generic [ref=e419]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 18h 2 3 Booked" [ref=e420] [cursor=pointer]':
                  - img [ref=e423]
                  - generic [ref=e426]:
                    - generic "Nadia Varela" [ref=e428]
                    - generic [ref=e430]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e431]:
                      - generic [ref=e432]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e433]: 18h
                      - generic [ref=e434]: "2"
                    - generic [ref=e435]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e437]'
                      - generic [ref=e446]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 23h 2 3 Booked" [ref=e447] [cursor=pointer]':
                  - img [ref=e450]
                  - generic [ref=e453]:
                    - generic "Nadia Varela" [ref=e455]
                    - generic [ref=e457]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e458]:
                      - generic [ref=e459]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e460]: 23h
                      - generic [ref=e461]: "2"
                    - generic [ref=e462]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e464]'
                      - generic [ref=e473]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 23h 2 3 Booked" [ref=e474] [cursor=pointer]':
                  - img [ref=e477]
                  - generic [ref=e480]:
                    - generic "Nadia Varela" [ref=e482]
                    - generic [ref=e484]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e485]:
                      - generic [ref=e486]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e487]: 23h
                      - generic [ref=e488]: "2"
                    - generic [ref=e489]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e491]'
                      - generic [ref=e500]: Booked
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
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e588] [cursor=pointer]':
                  - img [ref=e591]
                  - generic [ref=e594]:
                    - generic "Nadia Varela" [ref=e596]
                    - generic [ref=e598]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e599]:
                      - generic [ref=e600]: "QA: Awaiting your response."
                      - generic [ref=e601]: 23h
                      - generic [ref=e602]: "1"
                    - generic [ref=e603]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e605]'
                      - generic [ref=e614]: Offer
                      - 'generic "SLA: aging" [ref=e615]'
                      - generic [ref=e616]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 2 Offer SLA: aging awaiting you" [ref=e617] [cursor=pointer]':
                  - img [ref=e620]
                  - generic [ref=e623]:
                    - generic "Nadia Varela" [ref=e625]
                    - generic [ref=e627]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e628]:
                      - generic [ref=e629]: "QA: Awaiting your response."
                      - generic [ref=e630]: 23h
                      - generic [ref=e631]: "1"
                    - generic [ref=e632]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e634]'
                      - generic [ref=e643]: Offer
                      - 'generic "SLA: aging" [ref=e644]'
                      - generic [ref=e645]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 Inquiry SLA: aging awaiting you" [ref=e646] [cursor=pointer]':
                  - img [ref=e649]
                  - generic [ref=e652]:
                    - generic "Nadia Varela" [ref=e654]
                    - generic [ref=e656]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e657]:
                      - generic [ref=e658]: "QA: Awaiting your response."
                      - generic [ref=e659]: 23h
                    - generic [ref=e660]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e662]'
                      - generic [ref=e671]: Inquiry
                      - 'generic "SLA: aging" [ref=e672]'
                      - generic [ref=e673]: awaiting you
                - generic [ref=e674]: This week
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e675] [cursor=pointer]':
                  - img [ref=e678]
                  - generic [ref=e681]:
                    - generic "Cora Cuevas" [ref=e683]
                    - generic [ref=e685]: Need two models for a catalog shoot next month.
                    - generic [ref=e686]:
                      - generic [ref=e687]: "QA: Awaiting your response."
                      - generic [ref=e688]: 2d
                    - generic [ref=e689]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e691]'
                      - generic [ref=e700]: Inquiry
                      - 'generic "SLA: overdue" [ref=e701]'
                      - generic [ref=e702]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e703] [cursor=pointer]':
                  - img [ref=e706]
                  - generic [ref=e709]:
                    - generic "Cora Cuevas" [ref=e711]
                    - generic [ref=e713]: Need two models for a catalog shoot next month.
                    - generic [ref=e714]:
                      - generic [ref=e715]: "QA: Awaiting your response."
                      - generic [ref=e716]: 2d
                    - generic [ref=e717]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e719]'
                      - generic [ref=e728]: Inquiry
                      - 'generic "SLA: overdue" [ref=e729]'
                      - generic [ref=e730]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e731] [cursor=pointer]':
                  - img [ref=e734]
                  - generic [ref=e737]:
                    - generic "Cora Cuevas" [ref=e739]
                    - generic [ref=e741]: Need two models for a catalog shoot next month.
                    - generic [ref=e742]:
                      - generic [ref=e743]: "QA: Awaiting your response."
                      - generic [ref=e744]: 2d
                    - generic [ref=e745]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e747]'
                      - generic [ref=e756]: Inquiry
                      - 'generic "SLA: overdue" [ref=e757]'
                      - generic [ref=e758]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e759] [cursor=pointer]':
                  - img [ref=e762]
                  - generic [ref=e765]:
                    - generic "Cora Cuevas" [ref=e767]
                    - generic [ref=e769]: Need two models for a catalog shoot next month.
                    - generic [ref=e770]:
                      - generic [ref=e771]: "QA: Awaiting your response."
                      - generic [ref=e772]: 2d
                    - generic [ref=e773]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e775]'
                      - generic [ref=e784]: Inquiry
                      - 'generic "SLA: overdue" [ref=e785]'
                      - generic [ref=e786]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Booking confirmed — check logistics tab. 2d 2 3 Booked" [ref=e787] [cursor=pointer]':
                  - img [ref=e790]
                  - generic [ref=e793]:
                    - generic "Cora Cuevas" [ref=e795]
                    - generic [ref=e797]: Need two models for a catalog shoot next month.
                    - generic [ref=e798]:
                      - generic [ref=e799]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e800]: 2d
                      - generic [ref=e801]: "2"
                    - generic [ref=e802]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e804]'
                      - generic [ref=e813]: Booked
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e814] [cursor=pointer]':
                  - img [ref=e817]
                  - generic [ref=e820]:
                    - generic "Cora Cuevas" [ref=e822]
                    - generic [ref=e824]: Need two models for a catalog shoot next month.
                    - generic [ref=e825]:
                      - generic [ref=e826]: "QA: Awaiting your response."
                      - generic [ref=e827]: 2d
                      - generic [ref=e828]: "1"
                    - generic [ref=e829]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e831]'
                      - generic [ref=e840]: Offer
                      - 'generic "SLA: overdue" [ref=e841]'
                      - generic [ref=e842]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e843] [cursor=pointer]':
                  - img [ref=e846]
                  - generic [ref=e849]:
                    - generic "Cora Cuevas" [ref=e851]
                    - generic [ref=e853]: Need two models for a catalog shoot next month.
                    - generic [ref=e854]:
                      - generic [ref=e855]: "QA: Awaiting your response."
                      - generic [ref=e856]: 2d
                      - generic [ref=e857]: "1"
                    - generic [ref=e858]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e860]'
                      - generic [ref=e869]: Offer
                      - 'generic "SLA: overdue" [ref=e870]'
                      - generic [ref=e871]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e872] [cursor=pointer]':
                  - img [ref=e875]
                  - generic [ref=e878]:
                    - generic "Cora Cuevas" [ref=e880]
                    - generic [ref=e882]: Need two models for a catalog shoot next month.
                    - generic [ref=e883]:
                      - generic [ref=e884]: "QA: Awaiting your response."
                      - generic [ref=e885]: 2d
                    - generic [ref=e886]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e888]'
                      - generic [ref=e897]: Inquiry
                      - 'generic "SLA: overdue" [ref=e898]'
                      - generic [ref=e899]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e900] [cursor=pointer]':
                  - img [ref=e903]
                  - generic [ref=e906]:
                    - generic "Cora Cuevas" [ref=e908]
                    - generic [ref=e910]: Need two models for a catalog shoot next month.
                    - generic [ref=e911]:
                      - generic [ref=e912]: "QA: Awaiting your response."
                      - generic [ref=e913]: 2d
                    - generic [ref=e914]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e916]'
                      - generic [ref=e925]: Inquiry
                      - 'generic "SLA: overdue" [ref=e926]'
                      - generic [ref=e927]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e928] [cursor=pointer]':
                  - img [ref=e931]
                  - generic [ref=e934]:
                    - generic "Cora Cuevas" [ref=e936]
                    - generic [ref=e938]: Need two models for a catalog shoot next month.
                    - generic [ref=e939]:
                      - generic [ref=e940]: "QA: Awaiting your response."
                      - generic [ref=e941]: 2d
                    - generic [ref=e942]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e944]'
                      - generic [ref=e953]: Inquiry
                      - 'generic "SLA: overdue" [ref=e954]'
                      - generic [ref=e955]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e956] [cursor=pointer]':
                  - img [ref=e959]
                  - generic [ref=e962]:
                    - generic "Cora Cuevas" [ref=e964]
                    - generic [ref=e966]: Need two models for a catalog shoot next month.
                    - generic [ref=e967]:
                      - generic [ref=e968]: "QA: Awaiting your response."
                      - generic [ref=e969]: 2d
                    - generic [ref=e970]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e972]'
                      - generic [ref=e981]: Inquiry
                      - 'generic "SLA: overdue" [ref=e982]'
                      - generic [ref=e983]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e984] [cursor=pointer]':
                  - img [ref=e987]
                  - generic [ref=e990]:
                    - generic "Cora Cuevas" [ref=e992]
                    - generic [ref=e994]: Need two models for a catalog shoot next month.
                    - generic [ref=e995]:
                      - generic [ref=e996]: "QA: Awaiting your response."
                      - generic [ref=e997]: 2d
                    - generic [ref=e998]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1000]'
                      - generic [ref=e1009]: Inquiry
                      - 'generic "SLA: overdue" [ref=e1010]'
                      - generic [ref=e1011]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e1012] [cursor=pointer]':
                  - img [ref=e1015]
                  - generic [ref=e1018]:
                    - generic "Cora Cuevas" [ref=e1020]
                    - generic [ref=e1022]: Need two models for a catalog shoot next month.
                    - generic [ref=e1023]:
                      - generic [ref=e1024]: "QA: Awaiting your response."
                      - generic [ref=e1025]: 2d
                    - generic [ref=e1026]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1028]'
                      - generic [ref=e1037]: Inquiry
                      - 'generic "SLA: overdue" [ref=e1038]'
                      - generic [ref=e1039]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e1040] [cursor=pointer]':
                  - img [ref=e1043]
                  - generic [ref=e1046]:
                    - generic "Cora Cuevas" [ref=e1048]
                    - generic [ref=e1050]: Need two models for a catalog shoot next month.
                    - generic [ref=e1051]:
                      - generic [ref=e1052]: "QA: Awaiting your response."
                      - generic [ref=e1053]: 2d
                    - generic [ref=e1054]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1056]'
                      - generic [ref=e1065]: Inquiry
                      - 'generic "SLA: overdue" [ref=e1066]'
                      - generic [ref=e1067]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e1068] [cursor=pointer]':
                  - img [ref=e1071]
                  - generic [ref=e1074]:
                    - generic "Cora Cuevas" [ref=e1076]
                    - generic [ref=e1078]: Need two models for a catalog shoot next month.
                    - generic [ref=e1079]:
                      - generic [ref=e1080]: "QA: Awaiting your response."
                      - generic [ref=e1081]: 2d
                    - generic [ref=e1082]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1084]'
                      - generic [ref=e1093]: Inquiry
                      - 'generic "SLA: overdue" [ref=e1094]'
                      - generic [ref=e1095]: awaiting you
            - separator "Resize jobs list" [ref=e1096]
            - generic [ref=e1099]:
              - generic [ref=e1100]:
                - generic [ref=e1101]:
                  - button "Back to my jobs" [ref=e1102] [cursor=pointer]:
                    - img [ref=e1103]
                  - generic [ref=e1105]:
                    - heading "Cora Cuevas · Need two models for a catalog shoot next month. Guest" [level=1] [ref=e1106]:
                      - generic [ref=e1107]:
                        - text: Cora Cuevas
                        - generic [ref=e1108]: · Need two models for a catalog shoot next month.
                      - generic [ref=e1110]: Guest
                    - generic [ref=e1112]: via QA Journeys (48-case fixture)
                  - generic [ref=e1113]:
                    - 'button "Status: Inquiry. Tap for details." [ref=e1114] [cursor=pointer]': Inquiry
                    - button "Search this conversation" [ref=e1115] [cursor=pointer]:
                      - img [ref=e1116]
                    - button "More actions" [ref=e1120] [cursor=pointer]:
                      - img [ref=e1122]
                - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1127]':
                  - generic [ref=e1130]: Inquiry
                  - generic [ref=e1133]: Offer
                  - generic [ref=e1136]: Booked
                  - generic [ref=e1139]: Wrapped
              - generic [ref=e1140]:
                - tablist [ref=e1141]:
                  - tab "Activity" [ref=e1142] [cursor=pointer]:
                    - img [ref=e1144]
                    - generic [ref=e1147]: Activity
                  - tab "Lineup" [ref=e1148] [cursor=pointer]:
                    - generic [ref=e1149]: Lineup
                  - tab "Offer" [active] [selected] [ref=e1150] [cursor=pointer]:
                    - img [ref=e1152]
                    - generic [ref=e1155]: Offer
                  - tab "Details" [ref=e1156] [cursor=pointer]:
                    - generic [ref=e1157]: Details
                  - tab "Files" [ref=e1158] [cursor=pointer]:
                    - img [ref=e1160]
                    - generic [ref=e1164]: Files
                - generic [ref=e1166]:
                  - region "Payouts" [ref=e1167]:
                    - img [ref=e1169]
                    - generic [ref=e1171]:
                      - generic [ref=e1172]: Payouts
                      - generic [ref=e1173]: Connect your bank to receive payouts
                      - generic [ref=e1174]: Set up Stripe Express once and we'll auto-transfer your share of every booking. Stripe handles the bank + tax info.
                      - link "Connect Stripe →" [ref=e1175] [cursor=pointer]:
                        - /url: /qa-journeys/talent/settings/payouts
                  - generic [ref=e1176]:
                    - generic [ref=e1177]: Submit your rate
                    - generic [ref=e1178]: The coordinator is waiting on your number. You'll see the agency fee + platform fee deducted before take-home, so quote what you actually need to walk out with, plus a small margin for usage.
                    - generic [ref=e1179]: No offer yet. Your coordinator will send one when it's ready.
              - 'button "Show next action: Accept" [ref=e1181] [cursor=pointer]': ↑ Accept
    - dialog [ref=e1182]:
      - separator "Resize drawer" [ref=e1183]
      - banner [ref=e1184]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e1185]:
          - button "Copy link to this drawer" [ref=e1187] [cursor=pointer]:
            - img [ref=e1188]
          - generic [ref=e1191]:
            - button "compact size" [ref=e1193] [cursor=pointer]:
              - img [ref=e1194]
            - button "half size" [ref=e1198] [cursor=pointer]:
              - img [ref=e1199]
            - button "full size" [ref=e1203] [cursor=pointer]:
              - img [ref=e1204]
          - button "Close" [ref=e1207] [cursor=pointer]:
            - img [ref=e1208]
    - status
  - alert [ref=e1211]
```

# Test source

```ts
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
  351 |   expect(awaiting?.contactEmail ?? "", "talent must open the just-sent C08 offer").toMatch(
  352 |     /c08-op-/,
  353 |   );
  354 | 
  355 |   await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
  356 |   await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
  357 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  358 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  359 |   await expect(page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i })).toHaveCount(0);
  360 |   await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  361 | 
  362 |   // Fresh send still shows Inquiry SLA until talent accepts the invite.
  363 |   const acceptInvite = page.getByRole("button", { name: /accept$/i });
  364 |   const approve = page.getByRole("button", { name: /approve offer/i });
  365 |   if (!(await approve.isVisible().catch(() => false))) {
  366 |     await expect(acceptInvite.first()).toBeVisible({ timeout: 20_000 });
  367 |     await acceptInvite.first().click();
  368 |   }
  369 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  370 |   if (await offerTab.isVisible().catch(() => false)) {
  371 |     await offerTab.click();
  372 |   }
> 373 |   await expect(approve).toBeVisible({ timeout: 40_000 });
      |                         ^ Error: expect(locator).toBeVisible() failed
  374 |   await approve.click();
  375 |   await expect(
  376 |     page.getByText(
  377 |       /offer approved|you've approved|approved the offer|waiting on client|you approved/i,
  378 |     ).first(),
  379 |   ).toBeVisible({ timeout: 30_000 });
  380 | 
  381 |   const approvals = await inquiryOfferApprovals(awaiting!.offerId);
  382 |   const talent = approvals.find(
  383 |     (row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID,
  384 |   );
  385 |   const client = approvals.find((row) => row.role === "client");
  386 |   expect(talent?.status, "talent approval must be accepted").toBe("accepted");
  387 |   expect(client?.status, "client approval must still be pending").toBe("pending");
  388 | 
  389 |   const after = await latestSentDirectoryInquiry();
  390 |   expect(after?.inquiryId).toBe(awaiting!.inquiryId);
  391 |   expect(after?.offerStatus, "offer stays sent until the client also accepts").toBe("sent");
  392 |   expect(after?.inquiryStatus, "inquiry stays offer_pending until the client accepts").toMatch(
  393 |     /offer_pending|coordination/,
  394 |   );
  395 | 
  396 |   await page.screenshot({
  397 |     path: testInfo.outputPath("c08-tal-accept.png"),
  398 |     fullPage: true,
  399 |   });
  400 | });
  401 | 
  402 | test("C08-CUS accept: claimed client approves the sent offer", async ({ page }, testInfo) => {
  403 |   test.setTimeout(180_000);
  404 |   const ready = await latestOfferReadyForClientAccept();
  405 |   expect(ready, "a sent offer must wait on the claimed client after talent approve").not.toBeNull();
  406 |   expect(ready?.contactEmail, "claimed client email must exist").toMatch(/@impronta\.test$/);
  407 |   expect(ready?.offerStatus).toBe("sent");
  408 |   expect(ready?.inquiryStatus).toMatch(/offer_pending|coordination/);
  409 | 
  410 |   const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  411 |   await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  412 |   if (/\/onboarding\/role/.test(page.url())) {
  413 |     const chooseClient = page.getByRole("button", { name: /i'm a client/i });
  414 |     await expect(chooseClient).toBeVisible();
  415 |     await chooseClient.click();
  416 |     await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  417 |     await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
  418 |     await page.goto(messagesPath);
  419 |   }
  420 |   await expect(page).toHaveURL(
  421 |     new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`),
  422 |     { timeout: 40_000 },
  423 |   );
  424 |   await expect(page.getByRole("heading", { name: /no client account here/i })).toHaveCount(0);
  425 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  426 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  427 | 
  428 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  429 |   if (await offerTab.isVisible().catch(() => false)) {
  430 |     await offerTab.click();
  431 |   }
  432 |   const approve = page.getByRole("button", { name: /approve & lock/i });
  433 |   await expect(approve.first()).toBeVisible({ timeout: 40_000 });
  434 |   await approve.first().click();
  435 |   await expect(approve.nth(1)).toBeVisible({ timeout: 15_000 });
  436 |   await approve.nth(1).click();
  437 |   await expect(
  438 |     page.getByText(
  439 |       /you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i,
  440 |     ).first(),
  441 |   ).toBeVisible({ timeout: 30_000 });
  442 | 
  443 |   const approvals = await inquiryOfferApprovals(ready!.offerId);
  444 |   const talent = approvals.find((row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID);
  445 |   const client = approvals.find((row) => row.role === "client");
  446 |   expect(talent?.status, "talent approval must stay accepted").toBe("accepted");
  447 |   expect(client?.status, "client approval must be accepted").toBe("accepted");
  448 | 
  449 |   const offer = await latestInquiryOffer(ready!.inquiryId);
  450 |   expect(offer?.status, "all parties accepted so the offer must flip to accepted").toBe("accepted");
  451 |   const persisted = await latestGuestDirectoryInquiry(ready!.contactEmail!);
  452 |   expect(persisted?.status, "inquiry must be approved once every party accepts").toBe("approved");
  453 | 
  454 |   await page.screenshot({
  455 |     path: testInfo.outputPath("c08-cus-accept.png"),
  456 |     fullPage: true,
  457 |   });
  458 | });
  459 | 
```