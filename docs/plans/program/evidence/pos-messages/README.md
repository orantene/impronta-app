# POS Messages evidence

**PDF handoff:** `Tulala-POS-Messages-v2.pdf` was not on this machine
(`/Users/oranpersonal/Downloads/…` is a local path). `board.png` pages
cannot be rendered here. Live screenshots wait on the integrator mounting
`MessagesClient` in `PosFrame` (seam 2) and a local next on qa-journeys.

Verdict key: **matched** / **partial** / **not-wired**.

| Board | Verdict | Note |
|---|---|---|
| MS01 | not-wired | rail + toast implemented in `MessagesShell`; integrator adds rail row |
| MS02 | partial | inbox / thread / essentials live in `MessagesShell` |
| MS02B | partial | focused thread collapses both columns |
| MS03 | partial | empty / no results / failed load keep the typed draft |
| MS04–MS06 | partial | capture + match + assign actions exist; sheets are compact |
| MS07–MS10 | partial | send-options families follow the active mode |
| MS11–MS13 | partial | link / offer send wrap existing writers |
| MS14–MS15 | partial | `messagingRequestPayment` + `/pay/<code>` MC15–MC20 |
| MS16 | partial | follow-up filter + close as lost |
| MS17 | not-wired | post-purchase change reuses package-2 writers; card UI is the next paint |
| MS18 | partial | `diffDraft()` + version refusals |
| MS19/MS19B/MS20 | partial | snapshot + recover RPC + checkout_locked code |
| MS21–MS26 | partial | start / note / delivery / resolve / search / reminders |
| MS30 | partial | agency recovery uses the same recover RPC |
| MS31 | not-wired | portrait is CSS flex; no 834x1194 capture |
| MC01–MC14 | partial | `renderCard` + `/c/t/<token>` (D-POS-82) |
| MC15–MC20 | partial | `CheckoutView` |
| CC01 | partial | checkout unknown / expired / cancelled states |
| MM01–MM06 | partial | `compact` phone shell |
| P1/P2/P5/P6/P7/P8/P11/P12 | not-wired | Playwright files exist; need isolated next + seam 2 |

Counts: matched 0 · partial 28 · not-wired 75 of 103.

Per-board folders (`docs/plans/program/evidence/pos-messages/<board>/board.png`
+ `live.png`) are created when the PDF and a mounted till are available.
