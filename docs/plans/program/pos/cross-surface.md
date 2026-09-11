# Cross-surface destinations

For each journey, where the same record is reached, in what role, and how the operator returns. Records are shared (`orders`, `agency_bookings`, `sessions`, `admissions`, reservations/visits, `customers`); links are stable IDs; return preserves the operator's context (POS mode, selected sale/table/booking).

| Journey | Website / public profile | Customer confirmation & portal | Workspace | POS & tools | Talent |
|---|---|---|---|---|---|
| Counter sale | — | receipt by text/email (M13); D07 | Sales (order), Payments | C03…M13; Orders C21; Receipts M14 | — |
| Guest QR order | table QR → Q01 | Q03 tracking; Q05 bill | Orders | T21 accept; T09; T26 prep | — |
| Appointment | `booking_widget` section; talent profile Book | A07 manage; SMS/email | Calendar, Sales, Customers timeline | B01 day view; A01–A06 booking; Collect | A08 Today/Calendar; assignment accept |
| Class / pass | timetable widget (task W-T03) | K04 wallet; A07-style manage | Classes/sessions, Sales | C19/K01 enroll; B05 check-in; K03 pass | A08 session view |
| Reservation | reservation block (task W-T03) | R04 manage; confirmation | Reservations book, Calendar, Sales | T01 floor; R01 create; T05…T24 | — |
| Event tickets | `event_listing` + ticket selector (task) | E08 ticket; portal Purchases; transfer | Events (occurrence), Sales, Guests | E01–E12; G01–G06 gate/box office | performer assignment |
| Package / membership / gift | package widget (task) | portal Passes/Purchases | Catalog, Sales | P01–P06 | — |
| Agency milestone | inquiry form; talent card | O05 project; offer acceptance | Projects (inquiries/offers/projects), Payments | O01–O03 office | O04 assignment; Earnings |
| Refund | — | notice; portal status | Payments, Sales | M16–M19 | — |

Rules kept: configuration lives in the workspace (catalog, hours, layouts, policies); create-and-return for missing customer/catalog/resource records (save once, attach by ID, retry attachment without duplicating — C08→C10); business activity ≠ paid capability ≠ role ≠ vocabulary ≠ theme; leaving POS for Workspace closes nothing (drawer and held sales stay).
