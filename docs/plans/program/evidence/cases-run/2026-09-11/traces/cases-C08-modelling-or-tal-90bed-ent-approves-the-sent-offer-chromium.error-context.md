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
                    - generic [ref=e114]: "30"
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
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 Inquiry SLA: fresh awaiting you" [ref=e163] [cursor=pointer]':
                  - img [ref=e166]
                  - generic [ref=e169]:
                    - generic "Cora Cuevas" [ref=e171]
                    - generic [ref=e173]: Need two models for a catalog shoot next month.
                    - generic [ref=e174]:
                      - generic [ref=e175]: "QA: Awaiting your response."
                      - generic [ref=e176]: now
                    - generic [ref=e177]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e179]'
                      - generic [ref=e188]: Inquiry
                      - 'generic "SLA: fresh" [ref=e189]'
                      - generic [ref=e190]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 1 Inquiry SLA: fresh awaiting you" [ref=e191] [cursor=pointer]':
                  - img [ref=e194]
                  - generic [ref=e197]:
                    - generic "Cora Cuevas" [ref=e199]
                    - generic [ref=e201]: Need two models for a catalog shoot next month.
                    - generic [ref=e202]:
                      - generic [ref=e203]: "QA: Awaiting your response."
                      - generic [ref=e204]: now
                      - generic [ref=e205]: "1"
                    - generic [ref=e206]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e208]'
                      - generic [ref=e217]: Inquiry
                      - 'generic "SLA: fresh" [ref=e218]'
                      - generic [ref=e219]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. now 1 Inquiry SLA: fresh awaiting you" [ref=e220] [cursor=pointer]':
                  - img [ref=e223]
                  - generic [ref=e226]:
                    - generic "Cora Cuevas" [ref=e228]
                    - generic [ref=e230]: Need two models for a catalog shoot next month.
                    - generic [ref=e231]:
                      - generic [ref=e232]: "QA: Awaiting your response."
                      - generic [ref=e233]: now
                    - generic [ref=e234]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e236]'
                      - generic [ref=e245]: Inquiry
                      - 'generic "SLA: fresh" [ref=e246]'
                      - generic [ref=e247]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 1h 1 Inquiry SLA: fresh awaiting you" [ref=e248] [cursor=pointer]':
                  - img [ref=e251]
                  - generic [ref=e254]:
                    - generic "Cora Cuevas" [ref=e256]
                    - generic [ref=e258]: Need two models for a catalog shoot next month.
                    - generic [ref=e259]:
                      - generic [ref=e260]: "QA: Awaiting your response."
                      - generic [ref=e261]: 1h
                    - generic [ref=e262]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e264]'
                      - generic [ref=e273]: Inquiry
                      - 'generic "SLA: fresh" [ref=e274]'
                      - generic [ref=e275]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 17h 1 Inquiry SLA: aging awaiting you" [ref=e276] [cursor=pointer]':
                  - img [ref=e279]
                  - generic [ref=e282]:
                    - generic "Nadia Varela" [ref=e284]
                    - generic [ref=e286]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e287]:
                      - generic [ref=e288]: "QA: Awaiting your response."
                      - generic [ref=e289]: 17h
                    - generic [ref=e290]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e292]'
                      - generic [ref=e301]: Inquiry
                      - 'generic "SLA: aging" [ref=e302]'
                      - generic [ref=e303]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 18h 2 3 Booked" [ref=e304] [cursor=pointer]':
                  - img [ref=e307]
                  - generic [ref=e310]:
                    - generic "Nadia Varela" [ref=e312]
                    - generic [ref=e314]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e315]:
                      - generic [ref=e316]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e317]: 18h
                      - generic [ref=e318]: "2"
                    - generic [ref=e319]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e321]'
                      - generic [ref=e330]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 22h 2 3 Booked" [ref=e331] [cursor=pointer]':
                  - img [ref=e334]
                  - generic [ref=e337]:
                    - generic "Nadia Varela" [ref=e339]
                    - generic [ref=e341]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e342]:
                      - generic [ref=e343]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e344]: 22h
                      - generic [ref=e345]: "2"
                    - generic [ref=e346]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e348]'
                      - generic [ref=e357]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 23h 2 3 Booked" [ref=e358] [cursor=pointer]':
                  - img [ref=e361]
                  - generic [ref=e364]:
                    - generic "Nadia Varela" [ref=e366]
                    - generic [ref=e368]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e369]:
                      - generic [ref=e370]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e371]: 23h
                      - generic [ref=e372]: "2"
                    - generic [ref=e373]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e375]'
                      - generic [ref=e384]: Booked
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
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 23h 1 Inquiry SLA: aging awaiting you" [ref=e530] [cursor=pointer]':
                  - img [ref=e533]
                  - generic [ref=e536]:
                    - generic "Nadia Varela" [ref=e538]
                    - generic [ref=e540]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e541]:
                      - generic [ref=e542]: "QA: Awaiting your response."
                      - generic [ref=e543]: 23h
                    - generic [ref=e544]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e546]'
                      - generic [ref=e555]: Inquiry
                      - 'generic "SLA: aging" [ref=e556]'
                      - generic [ref=e557]: awaiting you
                - generic [ref=e558]: This week
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e559] [cursor=pointer]':
                  - img [ref=e562]
                  - generic [ref=e565]:
                    - generic "Cora Cuevas" [ref=e567]
                    - generic [ref=e569]: Need two models for a catalog shoot next month.
                    - generic [ref=e570]:
                      - generic [ref=e571]: "QA: Awaiting your response."
                      - generic [ref=e572]: 2d
                    - generic [ref=e573]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e575]'
                      - generic [ref=e584]: Inquiry
                      - 'generic "SLA: overdue" [ref=e585]'
                      - generic [ref=e586]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e587] [cursor=pointer]':
                  - img [ref=e590]
                  - generic [ref=e593]:
                    - generic "Cora Cuevas" [ref=e595]
                    - generic [ref=e597]: Need two models for a catalog shoot next month.
                    - generic [ref=e598]:
                      - generic [ref=e599]: "QA: Awaiting your response."
                      - generic [ref=e600]: 2d
                    - generic [ref=e601]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e603]'
                      - generic [ref=e612]: Inquiry
                      - 'generic "SLA: overdue" [ref=e613]'
                      - generic [ref=e614]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e615] [cursor=pointer]':
                  - img [ref=e618]
                  - generic [ref=e621]:
                    - generic "Cora Cuevas" [ref=e623]
                    - generic [ref=e625]: Need two models for a catalog shoot next month.
                    - generic [ref=e626]:
                      - generic [ref=e627]: "QA: Awaiting your response."
                      - generic [ref=e628]: 2d
                    - generic [ref=e629]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e631]'
                      - generic [ref=e640]: Inquiry
                      - 'generic "SLA: overdue" [ref=e641]'
                      - generic [ref=e642]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e643] [cursor=pointer]':
                  - img [ref=e646]
                  - generic [ref=e649]:
                    - generic "Cora Cuevas" [ref=e651]
                    - generic [ref=e653]: Need two models for a catalog shoot next month.
                    - generic [ref=e654]:
                      - generic [ref=e655]: "QA: Awaiting your response."
                      - generic [ref=e656]: 2d
                    - generic [ref=e657]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e659]'
                      - generic [ref=e668]: Inquiry
                      - 'generic "SLA: overdue" [ref=e669]'
                      - generic [ref=e670]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Booking confirmed — check logistics tab. 2d 2 3 Booked" [ref=e671] [cursor=pointer]':
                  - img [ref=e674]
                  - generic [ref=e677]:
                    - generic "Cora Cuevas" [ref=e679]
                    - generic [ref=e681]: Need two models for a catalog shoot next month.
                    - generic [ref=e682]:
                      - generic [ref=e683]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e684]: 2d
                      - generic [ref=e685]: "2"
                    - generic [ref=e686]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e688]'
                      - generic [ref=e697]: Booked
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e698] [cursor=pointer]':
                  - img [ref=e701]
                  - generic [ref=e704]:
                    - generic "Cora Cuevas" [ref=e706]
                    - generic [ref=e708]: Need two models for a catalog shoot next month.
                    - generic [ref=e709]:
                      - generic [ref=e710]: "QA: Awaiting your response."
                      - generic [ref=e711]: 2d
                      - generic [ref=e712]: "1"
                    - generic [ref=e713]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e715]'
                      - generic [ref=e724]: Offer
                      - 'generic "SLA: overdue" [ref=e725]'
                      - generic [ref=e726]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e727] [cursor=pointer]':
                  - img [ref=e730]
                  - generic [ref=e733]:
                    - generic "Cora Cuevas" [ref=e735]
                    - generic [ref=e737]: Need two models for a catalog shoot next month.
                    - generic [ref=e738]:
                      - generic [ref=e739]: "QA: Awaiting your response."
                      - generic [ref=e740]: 2d
                      - generic [ref=e741]: "1"
                    - generic [ref=e742]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e744]'
                      - generic [ref=e753]: Offer
                      - 'generic "SLA: overdue" [ref=e754]'
                      - generic [ref=e755]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e756] [cursor=pointer]':
                  - img [ref=e759]
                  - generic [ref=e762]:
                    - generic "Cora Cuevas" [ref=e764]
                    - generic [ref=e766]: Need two models for a catalog shoot next month.
                    - generic [ref=e767]:
                      - generic [ref=e768]: "QA: Awaiting your response."
                      - generic [ref=e769]: 2d
                    - generic [ref=e770]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e772]'
                      - generic [ref=e781]: Inquiry
                      - 'generic "SLA: overdue" [ref=e782]'
                      - generic [ref=e783]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e784] [cursor=pointer]':
                  - img [ref=e787]
                  - generic [ref=e790]:
                    - generic "Cora Cuevas" [ref=e792]
                    - generic [ref=e794]: Need two models for a catalog shoot next month.
                    - generic [ref=e795]:
                      - generic [ref=e796]: "QA: Awaiting your response."
                      - generic [ref=e797]: 2d
                    - generic [ref=e798]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e800]'
                      - generic [ref=e809]: Inquiry
                      - 'generic "SLA: overdue" [ref=e810]'
                      - generic [ref=e811]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e812] [cursor=pointer]':
                  - img [ref=e815]
                  - generic [ref=e818]:
                    - generic "Cora Cuevas" [ref=e820]
                    - generic [ref=e822]: Need two models for a catalog shoot next month.
                    - generic [ref=e823]:
                      - generic [ref=e824]: "QA: Awaiting your response."
                      - generic [ref=e825]: 2d
                    - generic [ref=e826]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e828]'
                      - generic [ref=e837]: Inquiry
                      - 'generic "SLA: overdue" [ref=e838]'
                      - generic [ref=e839]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e840] [cursor=pointer]':
                  - img [ref=e843]
                  - generic [ref=e846]:
                    - generic "Cora Cuevas" [ref=e848]
                    - generic [ref=e850]: Need two models for a catalog shoot next month.
                    - generic [ref=e851]:
                      - generic [ref=e852]: "QA: Awaiting your response."
                      - generic [ref=e853]: 2d
                    - generic [ref=e854]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e856]'
                      - generic [ref=e865]: Inquiry
                      - 'generic "SLA: overdue" [ref=e866]'
                      - generic [ref=e867]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e868] [cursor=pointer]':
                  - img [ref=e871]
                  - generic [ref=e874]:
                    - generic "Cora Cuevas" [ref=e876]
                    - generic [ref=e878]: Need two models for a catalog shoot next month.
                    - generic [ref=e879]:
                      - generic [ref=e880]: "QA: Awaiting your response."
                      - generic [ref=e881]: 2d
                    - generic [ref=e882]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e884]'
                      - generic [ref=e893]: Inquiry
                      - 'generic "SLA: overdue" [ref=e894]'
                      - generic [ref=e895]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e896] [cursor=pointer]':
                  - img [ref=e899]
                  - generic [ref=e902]:
                    - generic "Cora Cuevas" [ref=e904]
                    - generic [ref=e906]: Need two models for a catalog shoot next month.
                    - generic [ref=e907]:
                      - generic [ref=e908]: "QA: Awaiting your response."
                      - generic [ref=e909]: 2d
                    - generic [ref=e910]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e912]'
                      - generic [ref=e921]: Inquiry
                      - 'generic "SLA: overdue" [ref=e922]'
                      - generic [ref=e923]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e924] [cursor=pointer]':
                  - img [ref=e927]
                  - generic [ref=e930]:
                    - generic "Cora Cuevas" [ref=e932]
                    - generic [ref=e934]: Need two models for a catalog shoot next month.
                    - generic [ref=e935]:
                      - generic [ref=e936]: "QA: Awaiting your response."
                      - generic [ref=e937]: 2d
                    - generic [ref=e938]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e940]'
                      - generic [ref=e949]: Inquiry
                      - 'generic "SLA: overdue" [ref=e950]'
                      - generic [ref=e951]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e952] [cursor=pointer]':
                  - img [ref=e955]
                  - generic [ref=e958]:
                    - generic "Cora Cuevas" [ref=e960]
                    - generic [ref=e962]: Need two models for a catalog shoot next month.
                    - generic [ref=e963]:
                      - generic [ref=e964]: "QA: Awaiting your response."
                      - generic [ref=e965]: 2d
                    - generic [ref=e966]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e968]'
                      - generic [ref=e977]: Inquiry
                      - 'generic "SLA: overdue" [ref=e978]'
                      - generic [ref=e979]: awaiting you
            - separator "Resize jobs list" [ref=e980]
            - generic [ref=e983]:
              - generic [ref=e984]:
                - generic [ref=e985]:
                  - button "Back to my jobs" [ref=e986] [cursor=pointer]:
                    - img [ref=e987]
                  - generic [ref=e989]:
                    - heading "Cora Cuevas · Need two models for a catalog shoot next month. Guest" [level=1] [ref=e990]:
                      - generic [ref=e991]:
                        - text: Cora Cuevas
                        - generic [ref=e992]: · Need two models for a catalog shoot next month.
                      - generic [ref=e994]: Guest
                    - generic [ref=e996]: via QA Journeys (48-case fixture)
                  - generic [ref=e997]:
                    - 'button "Status: Inquiry. Tap for details." [ref=e998] [cursor=pointer]': Inquiry
                    - button "Search this conversation" [ref=e999] [cursor=pointer]:
                      - img [ref=e1000]
                    - button "More actions" [ref=e1004] [cursor=pointer]:
                      - img [ref=e1006]
                - 'progressbar "Stage 1 of 4: Inquiry" [ref=e1011]':
                  - generic [ref=e1014]: Inquiry
                  - generic [ref=e1017]: Offer
                  - generic [ref=e1020]: Booked
                  - generic [ref=e1023]: Wrapped
              - generic [ref=e1024]:
                - tablist [ref=e1025]:
                  - tab "Activity" [selected] [ref=e1026] [cursor=pointer]:
                    - img [ref=e1028]
                    - generic [ref=e1031]: Activity
                  - tab "Lineup" [ref=e1032] [cursor=pointer]:
                    - generic [ref=e1033]: Lineup
                  - tab "Offer" [ref=e1034] [cursor=pointer]:
                    - img [ref=e1036]
                    - generic [ref=e1039]: Offer
                  - tab "Details" [ref=e1040] [cursor=pointer]:
                    - generic [ref=e1041]: Details
                  - tab "Files" [ref=e1042] [cursor=pointer]:
                    - img [ref=e1044]
                    - generic [ref=e1048]: Files
                - generic [ref=e1049]:
                  - img [ref=e1050]
                  - text: Waiting for the coordinator to set up your offer.
                - generic [ref=e1053]:
                  - button "Search this thread" [ref=e1056] [cursor=pointer]:
                    - img [ref=e1057]
                  - generic [ref=e1061]:
                    - generic [ref=e1062]: No activity yet
                    - generic [ref=e1063]: Offers, payments and booking confirmations will appear here as the job progresses.
              - generic [ref=e1064]:
                - generic [ref=e1065]: Coordinator invited you. Accept, hold, or decline?
                - button "Decline" [ref=e1066] [cursor=pointer]
                - button "Accept" [ref=e1067] [cursor=pointer]
                - button "Dismiss next-action nudge" [ref=e1068] [cursor=pointer]: ×
    - dialog [ref=e1069]:
      - separator "Resize drawer" [ref=e1070]
      - banner [ref=e1071]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e1072]:
          - button "Copy link to this drawer" [ref=e1074] [cursor=pointer]:
            - img [ref=e1075]
          - generic [ref=e1078]:
            - button "compact size" [ref=e1080] [cursor=pointer]:
              - img [ref=e1081]
            - button "half size" [ref=e1085] [cursor=pointer]:
              - img [ref=e1086]
            - button "full size" [ref=e1090] [cursor=pointer]:
              - img [ref=e1091]
          - button "Close" [ref=e1094] [cursor=pointer]:
            - img [ref=e1095]
    - status
  - alert [ref=e1098]
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
  302 |   await expect(addLine.or(talentSelect.first())).toBeVisible({ timeout: 20_000 });
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