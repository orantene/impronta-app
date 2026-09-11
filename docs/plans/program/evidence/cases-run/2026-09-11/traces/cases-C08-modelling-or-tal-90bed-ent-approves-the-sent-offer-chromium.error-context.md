# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-TAL accept: talent approves the sent offer
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:334:5

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
                    - generic [ref=e114]: "24"
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
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 17h 1 Inquiry SLA: aging awaiting you" [ref=e134] [cursor=pointer]':
                  - img [ref=e137]
                  - generic [ref=e140]:
                    - generic "Nadia Varela" [ref=e142]
                    - generic [ref=e144]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e145]:
                      - generic [ref=e146]: "QA: Awaiting your response."
                      - generic [ref=e147]: 17h
                    - generic [ref=e148]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e150]'
                      - generic [ref=e159]: Inquiry
                      - 'generic "SLA: aging" [ref=e160]'
                      - generic [ref=e161]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 17h 2 3 Booked" [ref=e162] [cursor=pointer]':
                  - img [ref=e165]
                  - generic [ref=e168]:
                    - generic "Nadia Varela" [ref=e170]
                    - generic [ref=e172]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e173]:
                      - generic [ref=e174]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e175]: 17h
                      - generic [ref=e176]: "2"
                    - generic [ref=e177]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e179]'
                      - generic [ref=e188]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 22h 2 3 Booked" [ref=e189] [cursor=pointer]':
                  - img [ref=e192]
                  - generic [ref=e195]:
                    - generic "Nadia Varela" [ref=e197]
                    - generic [ref=e199]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e200]:
                      - generic [ref=e201]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e202]: 22h
                      - generic [ref=e203]: "2"
                    - generic [ref=e204]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e206]'
                      - generic [ref=e215]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Booking confirmed — check logistics tab. 22h 2 3 Booked" [ref=e216] [cursor=pointer]':
                  - img [ref=e219]
                  - generic [ref=e222]:
                    - generic "Nadia Varela" [ref=e224]
                    - generic [ref=e226]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e227]:
                      - generic [ref=e228]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e229]: 22h
                      - generic [ref=e230]: "2"
                    - generic [ref=e231]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e233]'
                      - generic [ref=e242]: Booked
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 22h 1 2 Offer SLA: aging awaiting you" [ref=e243] [cursor=pointer]':
                  - img [ref=e246]
                  - generic [ref=e249]:
                    - generic "Nadia Varela" [ref=e251]
                    - generic [ref=e253]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e254]:
                      - generic [ref=e255]: "QA: Awaiting your response."
                      - generic [ref=e256]: 22h
                      - generic [ref=e257]: "1"
                    - generic [ref=e258]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e260]'
                      - generic [ref=e269]: Offer
                      - 'generic "SLA: aging" [ref=e270]'
                      - generic [ref=e271]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 22h 1 2 Offer SLA: aging awaiting you" [ref=e272] [cursor=pointer]':
                  - img [ref=e275]
                  - generic [ref=e278]:
                    - generic "Nadia Varela" [ref=e280]
                    - generic [ref=e282]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e283]:
                      - generic [ref=e284]: "QA: Awaiting your response."
                      - generic [ref=e285]: 22h
                      - generic [ref=e286]: "1"
                    - generic [ref=e287]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e289]'
                      - generic [ref=e298]: Offer
                      - 'generic "SLA: aging" [ref=e299]'
                      - generic [ref=e300]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 22h 1 2 Offer SLA: aging awaiting you" [ref=e301] [cursor=pointer]':
                  - img [ref=e304]
                  - generic [ref=e307]:
                    - generic "Nadia Varela" [ref=e309]
                    - generic [ref=e311]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e312]:
                      - generic [ref=e313]: "QA: Awaiting your response."
                      - generic [ref=e314]: 22h
                      - generic [ref=e315]: "1"
                    - generic [ref=e316]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e318]'
                      - generic [ref=e327]: Offer
                      - 'generic "SLA: aging" [ref=e328]'
                      - generic [ref=e329]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 22h 1 2 Offer SLA: aging awaiting you" [ref=e330] [cursor=pointer]':
                  - img [ref=e333]
                  - generic [ref=e336]:
                    - generic "Nadia Varela" [ref=e338]
                    - generic [ref=e340]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e341]:
                      - generic [ref=e342]: "QA: Awaiting your response."
                      - generic [ref=e343]: 22h
                      - generic [ref=e344]: "1"
                    - generic [ref=e345]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e347]'
                      - generic [ref=e356]: Offer
                      - 'generic "SLA: aging" [ref=e357]'
                      - generic [ref=e358]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 22h 1 2 Offer SLA: aging awaiting you" [ref=e359] [cursor=pointer]':
                  - img [ref=e362]
                  - generic [ref=e365]:
                    - generic "Nadia Varela" [ref=e367]
                    - generic [ref=e369]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e370]:
                      - generic [ref=e371]: "QA: Awaiting your response."
                      - generic [ref=e372]: 22h
                      - generic [ref=e373]: "1"
                    - generic [ref=e374]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e376]'
                      - generic [ref=e385]: Offer
                      - 'generic "SLA: aging" [ref=e386]'
                      - generic [ref=e387]: awaiting you
                - 'button "Nadia Varela A brand shoot with one model, to be collected at the desk. QA: Awaiting your response. 22h 1 Inquiry SLA: aging awaiting you" [ref=e388] [cursor=pointer]':
                  - img [ref=e391]
                  - generic [ref=e394]:
                    - generic "Nadia Varela" [ref=e396]
                    - generic [ref=e398]: A brand shoot with one model, to be collected at the desk.
                    - generic [ref=e399]:
                      - generic [ref=e400]: "QA: Awaiting your response."
                      - generic [ref=e401]: 22h
                    - generic [ref=e402]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e404]'
                      - generic [ref=e413]: Inquiry
                      - 'generic "SLA: aging" [ref=e414]'
                      - generic [ref=e415]: awaiting you
                - generic [ref=e416]: This week
                - 'button "Pin Cora Cuevas Mark unread Cora Cuevas Archive Cora Cuevas Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [active] [ref=e417] [cursor=pointer]':
                  - generic [ref=e418]:
                    - button "Pin Cora Cuevas" [ref=e419]:
                      - img [ref=e420]
                    - button "Mark unread Cora Cuevas" [ref=e422]:
                      - img [ref=e423]
                    - button "Archive Cora Cuevas" [ref=e425]:
                      - img [ref=e426]
                  - img [ref=e431]
                  - generic [ref=e434]:
                    - generic "Cora Cuevas" [ref=e436]
                    - generic [ref=e438]: Need two models for a catalog shoot next month.
                    - generic [ref=e439]:
                      - generic [ref=e440]: "QA: Awaiting your response."
                      - generic [ref=e441]: 2d
                    - generic [ref=e442]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e444]'
                      - generic [ref=e453]: Inquiry
                      - 'generic "SLA: overdue" [ref=e454]'
                      - generic [ref=e455]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e456] [cursor=pointer]':
                  - img [ref=e459]
                  - generic [ref=e462]:
                    - generic "Cora Cuevas" [ref=e464]
                    - generic [ref=e466]: Need two models for a catalog shoot next month.
                    - generic [ref=e467]:
                      - generic [ref=e468]: "QA: Awaiting your response."
                      - generic [ref=e469]: 2d
                    - generic [ref=e470]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e472]'
                      - generic [ref=e481]: Inquiry
                      - 'generic "SLA: overdue" [ref=e482]'
                      - generic [ref=e483]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e484] [cursor=pointer]':
                  - img [ref=e487]
                  - generic [ref=e490]:
                    - generic "Cora Cuevas" [ref=e492]
                    - generic [ref=e494]: Need two models for a catalog shoot next month.
                    - generic [ref=e495]:
                      - generic [ref=e496]: "QA: Awaiting your response."
                      - generic [ref=e497]: 2d
                    - generic [ref=e498]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e500]'
                      - generic [ref=e509]: Inquiry
                      - 'generic "SLA: overdue" [ref=e510]'
                      - generic [ref=e511]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Booking confirmed — check logistics tab. 2d 2 3 Booked" [ref=e512] [cursor=pointer]':
                  - img [ref=e515]
                  - generic [ref=e518]:
                    - generic "Cora Cuevas" [ref=e520]
                    - generic [ref=e522]: Need two models for a catalog shoot next month.
                    - generic [ref=e523]:
                      - generic [ref=e524]: "QA: Booking confirmed — check logistics tab."
                      - generic [ref=e525]: 2d
                      - generic [ref=e526]: "2"
                    - generic [ref=e527]:
                      - 'progressbar "Stage 3 of 4: Booked" [ref=e529]'
                      - generic [ref=e538]: Booked
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e539] [cursor=pointer]':
                  - img [ref=e542]
                  - generic [ref=e545]:
                    - generic "Cora Cuevas" [ref=e547]
                    - generic [ref=e549]: Need two models for a catalog shoot next month.
                    - generic [ref=e550]:
                      - generic [ref=e551]: "QA: Awaiting your response."
                      - generic [ref=e552]: 2d
                      - generic [ref=e553]: "1"
                    - generic [ref=e554]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e556]'
                      - generic [ref=e565]: Offer
                      - 'generic "SLA: overdue" [ref=e566]'
                      - generic [ref=e567]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 2 Offer SLA: overdue awaiting you" [ref=e568] [cursor=pointer]':
                  - img [ref=e571]
                  - generic [ref=e574]:
                    - generic "Cora Cuevas" [ref=e576]
                    - generic [ref=e578]: Need two models for a catalog shoot next month.
                    - generic [ref=e579]:
                      - generic [ref=e580]: "QA: Awaiting your response."
                      - generic [ref=e581]: 2d
                      - generic [ref=e582]: "1"
                    - generic [ref=e583]:
                      - 'progressbar "Stage 2 of 4: Offer" [ref=e585]'
                      - generic [ref=e594]: Offer
                      - 'generic "SLA: overdue" [ref=e595]'
                      - generic [ref=e596]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e597] [cursor=pointer]':
                  - img [ref=e600]
                  - generic [ref=e603]:
                    - generic "Cora Cuevas" [ref=e605]
                    - generic [ref=e607]: Need two models for a catalog shoot next month.
                    - generic [ref=e608]:
                      - generic [ref=e609]: "QA: Awaiting your response."
                      - generic [ref=e610]: 2d
                    - generic [ref=e611]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e613]'
                      - generic [ref=e622]: Inquiry
                      - 'generic "SLA: overdue" [ref=e623]'
                      - generic [ref=e624]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e625] [cursor=pointer]':
                  - img [ref=e628]
                  - generic [ref=e631]:
                    - generic "Cora Cuevas" [ref=e633]
                    - generic [ref=e635]: Need two models for a catalog shoot next month.
                    - generic [ref=e636]:
                      - generic [ref=e637]: "QA: Awaiting your response."
                      - generic [ref=e638]: 2d
                    - generic [ref=e639]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e641]'
                      - generic [ref=e650]: Inquiry
                      - 'generic "SLA: overdue" [ref=e651]'
                      - generic [ref=e652]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e653] [cursor=pointer]':
                  - img [ref=e656]
                  - generic [ref=e659]:
                    - generic "Cora Cuevas" [ref=e661]
                    - generic [ref=e663]: Need two models for a catalog shoot next month.
                    - generic [ref=e664]:
                      - generic [ref=e665]: "QA: Awaiting your response."
                      - generic [ref=e666]: 2d
                    - generic [ref=e667]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e669]'
                      - generic [ref=e678]: Inquiry
                      - 'generic "SLA: overdue" [ref=e679]'
                      - generic [ref=e680]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e681] [cursor=pointer]':
                  - img [ref=e684]
                  - generic [ref=e687]:
                    - generic "Cora Cuevas" [ref=e689]
                    - generic [ref=e691]: Need two models for a catalog shoot next month.
                    - generic [ref=e692]:
                      - generic [ref=e693]: "QA: Awaiting your response."
                      - generic [ref=e694]: 2d
                    - generic [ref=e695]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e697]'
                      - generic [ref=e706]: Inquiry
                      - 'generic "SLA: overdue" [ref=e707]'
                      - generic [ref=e708]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e709] [cursor=pointer]':
                  - img [ref=e712]
                  - generic [ref=e715]:
                    - generic "Cora Cuevas" [ref=e717]
                    - generic [ref=e719]: Need two models for a catalog shoot next month.
                    - generic [ref=e720]:
                      - generic [ref=e721]: "QA: Awaiting your response."
                      - generic [ref=e722]: 2d
                    - generic [ref=e723]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e725]'
                      - generic [ref=e734]: Inquiry
                      - 'generic "SLA: overdue" [ref=e735]'
                      - generic [ref=e736]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e737] [cursor=pointer]':
                  - img [ref=e740]
                  - generic [ref=e743]:
                    - generic "Cora Cuevas" [ref=e745]
                    - generic [ref=e747]: Need two models for a catalog shoot next month.
                    - generic [ref=e748]:
                      - generic [ref=e749]: "QA: Awaiting your response."
                      - generic [ref=e750]: 2d
                    - generic [ref=e751]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e753]'
                      - generic [ref=e762]: Inquiry
                      - 'generic "SLA: overdue" [ref=e763]'
                      - generic [ref=e764]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e765] [cursor=pointer]':
                  - img [ref=e768]
                  - generic [ref=e771]:
                    - generic "Cora Cuevas" [ref=e773]
                    - generic [ref=e775]: Need two models for a catalog shoot next month.
                    - generic [ref=e776]:
                      - generic [ref=e777]: "QA: Awaiting your response."
                      - generic [ref=e778]: 2d
                    - generic [ref=e779]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e781]'
                      - generic [ref=e790]: Inquiry
                      - 'generic "SLA: overdue" [ref=e791]'
                      - generic [ref=e792]: awaiting you
                - 'button "Cora Cuevas Need two models for a catalog shoot next month. QA: Awaiting your response. 2d 1 Inquiry SLA: overdue awaiting you" [ref=e793] [cursor=pointer]':
                  - img [ref=e796]
                  - generic [ref=e799]:
                    - generic "Cora Cuevas" [ref=e801]
                    - generic [ref=e803]: Need two models for a catalog shoot next month.
                    - generic [ref=e804]:
                      - generic [ref=e805]: "QA: Awaiting your response."
                      - generic [ref=e806]: 2d
                    - generic [ref=e807]:
                      - 'progressbar "Stage 1 of 4: Inquiry" [ref=e809]'
                      - generic [ref=e818]: Inquiry
                      - 'generic "SLA: overdue" [ref=e819]'
                      - generic [ref=e820]: awaiting you
            - separator "Resize jobs list" [ref=e821]
            - generic [ref=e824]:
              - generic [ref=e825]:
                - generic [ref=e826]:
                  - button "Back to my jobs" [ref=e827] [cursor=pointer]:
                    - img [ref=e828]
                  - generic [ref=e830]:
                    - heading "Cora Cuevas · Need two models for a catalog shoot next month. Guest" [level=1] [ref=e831]:
                      - generic [ref=e832]:
                        - text: Cora Cuevas
                        - generic [ref=e833]: · Need two models for a catalog shoot next month.
                      - generic [ref=e835]: Guest
                    - generic [ref=e837]: via QA Journeys (48-case fixture)
                  - generic [ref=e838]:
                    - 'button "Status: Inquiry. Tap for details." [ref=e839] [cursor=pointer]': Inquiry
                    - button "Search this conversation" [ref=e840] [cursor=pointer]:
                      - img [ref=e841]
                    - button "More actions" [ref=e845] [cursor=pointer]:
                      - img [ref=e847]
                - 'progressbar "Stage 1 of 4: Inquiry" [ref=e852]':
                  - generic [ref=e855]: Inquiry
                  - generic [ref=e858]: Offer
                  - generic [ref=e861]: Booked
                  - generic [ref=e864]: Wrapped
              - generic [ref=e865]:
                - tablist [ref=e866]:
                  - tab "Activity" [selected] [ref=e867] [cursor=pointer]:
                    - img [ref=e869]
                    - generic [ref=e872]: Activity
                  - tab "Lineup" [ref=e873] [cursor=pointer]:
                    - generic [ref=e874]: Lineup
                  - tab "Offer" [ref=e875] [cursor=pointer]:
                    - img [ref=e877]
                    - generic [ref=e880]: Offer
                  - tab "Details" [ref=e881] [cursor=pointer]:
                    - generic [ref=e882]: Details
                  - tab "Files" [ref=e883] [cursor=pointer]:
                    - img [ref=e885]
                    - generic [ref=e889]: Files
                - generic [ref=e890]:
                  - img [ref=e891]
                  - text: Waiting for the coordinator to set up your offer.
                - generic [ref=e894]:
                  - button "Search this thread" [ref=e897] [cursor=pointer]:
                    - img [ref=e898]
                  - generic [ref=e902]:
                    - generic [ref=e903]: No activity yet
                    - generic [ref=e904]: Offers, payments and booking confirmations will appear here as the job progresses.
              - generic [ref=e905]:
                - generic [ref=e906]: Coordinator invited you. Accept, hold, or decline?
                - button "Decline" [ref=e907] [cursor=pointer]
                - button "Accept" [ref=e908] [cursor=pointer]
                - button "Dismiss next-action nudge" [ref=e909] [cursor=pointer]: ×
    - dialog [ref=e910]:
      - separator "Resize drawer" [ref=e911]
      - banner [ref=e912]:
        - generic:
          - generic:
            - heading [level=2]
        - generic [ref=e913]:
          - button "Copy link to this drawer" [ref=e915] [cursor=pointer]:
            - img [ref=e916]
          - generic [ref=e919]:
            - button "compact size" [ref=e921] [cursor=pointer]:
              - img [ref=e922]
            - button "half size" [ref=e926] [cursor=pointer]:
              - img [ref=e927]
            - button "full size" [ref=e931] [cursor=pointer]:
              - img [ref=e932]
          - button "Close" [ref=e935] [cursor=pointer]:
            - img [ref=e936]
    - status
  - alert [ref=e939]
```

# Test source

```ts
  263 |   }
  264 |   const alreadyOnLineup = page.getByText(/qa journeys talent/i);
  265 |   if (!(await alreadyOnLineup.isVisible().catch(() => false))) {
  266 |     const addTalent = page.getByRole("button", { name: /^add talent$/i });
  267 |     await expect(addTalent).toBeVisible({ timeout: 20_000 });
  268 |     await addTalent.click();
  269 |     const rosterSearch = page.getByPlaceholder(/search roster/i);
  270 |     await expect(rosterSearch).toBeVisible({ timeout: 10_000 });
  271 |     await rosterSearch.fill("QA Journeys");
  272 |     await page.getByRole("button", { name: /qa journeys talent/i }).click();
  273 |     await expect(page.getByText(/invited|added to lineup/i).first()).toBeVisible({
  274 |       timeout: 20_000,
  275 |     });
  276 |   }
  277 | 
  278 |   await page.getByRole("tab", { name: /^offer$/i }).click();
  279 |   const startOffer = page.getByRole("button", { name: /start drafting offer/i });
  280 |   if (await startOffer.isVisible().catch(() => false)) {
  281 |     await startOffer.click();
  282 |     await expect(page.getByText(/offer draft created/i)).toBeVisible({
  283 |       timeout: 20_000,
  284 |     });
  285 |   }
  286 | 
  287 |   const addLine = page.getByRole("button", { name: /\+ add line item/i });
  288 |   await expect(addLine).toBeVisible({ timeout: 20_000 });
  289 |   const talentSelect = page
  290 |     .locator("select")
  291 |     .filter({ has: page.locator("option", { hasText: /qa journeys talent/i }) });
  292 |   if ((await talentSelect.count()) === 0) {
  293 |     await addLine.click();
  294 |   }
  295 |   await expect(talentSelect.first()).toBeVisible({ timeout: 10_000 });
  296 |   await talentSelect.first().selectOption({ label: "QA Journeys Talent" });
  297 |   const rate = page.locator('input[placeholder="rate"]').first();
  298 |   await expect(rate).toBeVisible({ timeout: 10_000 });
  299 |   await rate.fill("800");
  300 |   await page.getByRole("button", { name: /^save draft$/i }).click();
  301 |   await expect(page.getByText(/saved ·/i).first()).toBeVisible({ timeout: 20_000 });
  302 | 
  303 |   const sendOffer = page.getByRole("button", { name: /^send to client$/i });
  304 |   await expect(sendOffer).toBeEnabled({ timeout: 20_000 });
  305 |   await sendOffer.click();
  306 |   await expect(
  307 |     page.getByText(/send offer done|awaiting client and talent approval/i).first(),
  308 |   ).toBeVisible({ timeout: 30_000 });
  309 | 
  310 |   expect(
  311 |     await latestGuestDirectoryInquiry(marker),
  312 |     "C08-OP send guest inquiry must still exist on qa-journeys",
  313 |   ).not.toBeNull();
  314 |   const sent = await latestSentDirectoryInquiry();
  315 |   expect(sent, "a sent offer must exist on qa-journeys").not.toBeNull();
  316 |   expect(sent?.offerStatus, "offer must be sent on qa-journeys").toBe("sent");
  317 |   expect(sent?.sentAt, "sent_at must be stamped").not.toBeNull();
  318 |   expect(Number(sent?.totalClientPrice ?? 0)).toBeGreaterThan(0);
  319 |   expect(sent?.contactEmail ?? "").toMatch(/c08-op-/);
  320 |   expect(sent?.inquiryStatus).toMatch(/offer_pending|coordination/);
  321 |   const lines = await inquiryOfferLines(sent!.offerId);
  322 |   expect(lines.length, "sent offer must have a priced line").toBeGreaterThan(0);
  323 |   expect(lines.some((line) => line.talentProfileId === QA_JOURNEYS_TALENT_ID)).toBe(true);
  324 |   expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBeGreaterThan(0);
  325 |   const approvals = await inquiryOfferApprovalCount(sent!.offerId);
  326 |   expect(approvals, "send must seed at least the priced talent approval").toBeGreaterThan(0);
  327 | 
  328 |   await page.screenshot({
  329 |     path: testInfo.outputPath("c08-op-send.png"),
  330 |     fullPage: true,
  331 |   });
  332 | });
  333 | 
  334 | test("C08-TAL accept: talent approves the sent offer", async ({ page }, testInfo) => {
  335 |   test.setTimeout(180_000);
  336 |   const awaiting = await latestSentOfferAwaitingTalent();
  337 |   expect(awaiting, "a sent offer must still wait on QA Journeys Talent").not.toBeNull();
  338 |   expect(awaiting?.offerStatus).toBe("sent");
  339 |   expect(awaiting?.inquiryStatus).toMatch(/offer_pending|coordination/);
  340 | 
  341 |   await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
  342 |   await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
  343 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  344 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  345 |   await expect(page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i })).toHaveCount(0);
  346 |   await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  347 | 
  348 |   const approve = page.getByRole("button", { name: /approve offer/i });
  349 |   if (!(await approve.isVisible().catch(() => false))) {
  350 |     await page.goto("/talent/inbox");
  351 |     await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  352 |     const allChip = page.getByRole("button", { name: /^all$/i });
  353 |     if (await allChip.isVisible().catch(() => false)) {
  354 |       await allChip.click();
  355 |     }
  356 |     const row = page
  357 |       .locator("[data-tulala-inbox-row]")
  358 |       .filter({ hasText: /cora cuevas/i })
  359 |       .first();
  360 |     await expect(row).toBeVisible({ timeout: 40_000 });
  361 |     await row.click();
  362 |   }
> 363 |   await expect(approve).toBeVisible({ timeout: 40_000 });
      |                         ^ Error: expect(locator).toBeVisible() failed
  364 |   await approve.click();
  365 |   await expect(
  366 |     page.getByText(/offer approved|waiting on client|awaiting client/i).first(),
  367 |   ).toBeVisible({ timeout: 30_000 });
  368 | 
  369 |   const approvals = await inquiryOfferApprovals(awaiting!.offerId);
  370 |   const talent = approvals.find(
  371 |     (row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID,
  372 |   );
  373 |   const client = approvals.find((row) => row.role === "client");
  374 |   expect(talent?.status, "talent approval must be accepted").toBe("accepted");
  375 |   expect(client?.status, "client approval must still be pending").toBe("pending");
  376 | 
  377 |   const after = await latestSentDirectoryInquiry();
  378 |   expect(after?.inquiryId).toBe(awaiting!.inquiryId);
  379 |   expect(after?.offerStatus, "offer stays sent until the client also accepts").toBe("sent");
  380 |   expect(after?.inquiryStatus, "inquiry stays offer_pending until the client accepts").toMatch(
  381 |     /offer_pending|coordination/,
  382 |   );
  383 | 
  384 |   await page.screenshot({
  385 |     path: testInfo.outputPath("c08-tal-accept.png"),
  386 |     fullPage: true,
  387 |   });
  388 | });
  389 | 
  390 | test("C08-CUS accept: claimed client approves the sent offer", async ({ page }, testInfo) => {
  391 |   test.setTimeout(180_000);
  392 |   const ready = await latestOfferReadyForClientAccept();
  393 |   expect(ready, "a sent offer must wait on the claimed client after talent approve").not.toBeNull();
  394 |   expect(ready?.contactEmail, "claimed client email must exist").toMatch(/@impronta\.test$/);
  395 |   expect(ready?.offerStatus).toBe("sent");
  396 |   expect(ready?.inquiryStatus).toMatch(/offer_pending|coordination/);
  397 | 
  398 |   const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  399 |   await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  400 |   if (/\/onboarding\/role/.test(page.url())) {
  401 |     const chooseClient = page.getByRole("button", { name: /i'm a client/i });
  402 |     await expect(chooseClient).toBeVisible();
  403 |     await chooseClient.click();
  404 |     await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  405 |     await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
  406 |     await page.goto(messagesPath);
  407 |   }
  408 |   await expect(page).toHaveURL(
  409 |     new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`),
  410 |     { timeout: 40_000 },
  411 |   );
  412 |   await expect(page.getByRole("heading", { name: /no client account here/i })).toHaveCount(0);
  413 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  414 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  415 | 
  416 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  417 |   if (await offerTab.isVisible().catch(() => false)) {
  418 |     await offerTab.click();
  419 |   }
  420 |   const approve = page.getByRole("button", { name: /approve & lock/i });
  421 |   await expect(approve.first()).toBeVisible({ timeout: 40_000 });
  422 |   await approve.first().click();
  423 |   await expect(approve.nth(1)).toBeVisible({ timeout: 15_000 });
  424 |   await approve.nth(1).click();
  425 |   await expect(
  426 |     page.getByText(
  427 |       /you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i,
  428 |     ).first(),
  429 |   ).toBeVisible({ timeout: 30_000 });
  430 | 
  431 |   const approvals = await inquiryOfferApprovals(ready!.offerId);
  432 |   const talent = approvals.find((row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID);
  433 |   const client = approvals.find((row) => row.role === "client");
  434 |   expect(talent?.status, "talent approval must stay accepted").toBe("accepted");
  435 |   expect(client?.status, "client approval must be accepted").toBe("accepted");
  436 | 
  437 |   const offer = await latestInquiryOffer(ready!.inquiryId);
  438 |   expect(offer?.status, "all parties accepted so the offer must flip to accepted").toBe("accepted");
  439 |   const persisted = await latestGuestDirectoryInquiry(ready!.contactEmail!);
  440 |   expect(persisted?.status, "inquiry must be approved once every party accepts").toBe("approved");
  441 | 
  442 |   await page.screenshot({
  443 |     path: testInfo.outputPath("c08-cus-accept.png"),
  444 |     fullPage: true,
  445 |   });
  446 | });
  447 | 
```