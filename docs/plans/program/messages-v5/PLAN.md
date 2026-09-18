# Messages v5.1 · Execution plan (2026-09-17)

Goal: replace the presentation of Messages (workspace, POS, mobile, client link) with the v5.1 boards, on the existing messaging engine, with the fewest agents and no rework. Design of record: artifact MFiCnt6i2mssBNodewHgRS (boards D01–D23, C01–C02, M01–M10, Coverage audit, Lifecycle, Control map).

## Principle 0 · Messages is a front door to the POS engine, not a second system

Messages creates nothing of its own. Every action in a thread calls the writer the POS already uses, and every state in a thread is read from the record the POS already keeps:

| In the thread | What it really is |
|---|---|
| Add items / shared draft | the POS draft order (`lib/pos/draft.ts`, `pos_mutate_draft_line`, `expectedVersion`) |
| Send choices / times / tables / tickets | cards over `scheduling/public-slots`, `reservation-hold`, `admission_holds`, capacity pools |
| Offer | `inquiry_offers` versions, `engine_send_offer`, `amendment_send` |
| Confirm booking / order | `convertToBooking`, `createPurchase`, `reserve_resource_set`, with the availability recheck |
| Request payment / collect here / cash | `payment_links` + `/pay/code`, `pos_reserve_collection`, `markInquiryPaidInCash` |
| Fulfilment (preparing, ready, picked up, seated, checked in) | kitchen ticket, table state, admissions, read only in Messages |
| Cancel / reschedule / refund | `cancel_booking_set`, `reschedule_booking_set`, `lib/payments/refunds` |
| Calendar (business + each talent) | written by the same confirm; Messages never writes calendar rows |
| Conversation lifecycle | follows the record: open while a record is open or money is owed, auto-resolves after fulfilment (2 days orders/appointments, 7 days events), "Book again" duplicates the last lines into a new POS draft |

Lane rule: a lane that needs a new writer stops and files it as a seam for review; it does not add one. Reviewers reject any PR that inserts into orders, bookings, admissions, payments or calendar tables from Messages code.

## Operating rules (binding)

- One integration branch `program/messages-v5` off `origin/main`. Every lane = one worktree under the session scratchpad, branch `work/msg-<lane>`, one PR into the integration branch. Final PR `program/messages-v5 → main` runs the four required checks; nothing is admin-merged, nothing pushes the production pointer by hand.
- Machine: at most ONE heavy agent (dev server, scoped tsc, Playwright) + light agents (unit tests, lint) at a time. Dev servers need a lease (CPU governor). Never `next build` locally.
- Schema: migrations to the isolated Supabase branch first, objects proven, then production with `scripts/apply-migration.mjs --apply-pending` BEFORE the code merges. Version numbers sort after the current last migration; run the collision check.
- Design gate: new UI lives in `web/src/components/messages-v5/**` and `web/src/lib/messages-v5/**`. Token classes only; no new inline styles (ratchet rule); no dark green (#0f4f3e) anywhere; primary = solid green white text; destructive = solid red.
- Every control maps to a named engine action (Control map). Anything without one is drawn greyed with a sentence, never a fake button.
- Definition of done per lane: (1) scoped tsc + lint + unit lanes green with real exit codes, (2) board/live screenshot pair in `docs/plans/program/evidence/messages-v5/<board>/`, (3) six states shown (empty, loading, ready, busy, refused, done), (4) i18n keys EN/ES/FR, (5) a one-line decision entry if the lane chose anything.
- No agent does browser QA. Agents ship on tests and screenshot evidence; the integrator (me) does every live check.
- QA writes only to the fixture tenant on the QA host (`staging-qa-journeys`), never to Impronta or any real tenant.

## Model assignment

| Kind of work | Model | Why |
|---|---|---|
| Engine seams that decide semantics (thread type, confirm-with-recheck, merge, record sync) | Opus | one wrong rule breaks every surface |
| Shared UI kit (tokens, cards, composer, sheets) | Opus | everything else is built from it |
| Thread + composer, items picker, client link | Opus | load-bearing interaction |
| Inbox, context panel, offer editor, payment sheets, POS dock, channels, history, i18n, cutover flags, dead-code removal | Sonnet | mechanical against an existing engine and a finished kit |
| Migrations proof, race scripts, e2e specs | Sonnet, verified by me on the isolated DB | cloud agents cannot prove DB objects |
| Integration merges ("merge hand") | Opus | keeps both intents on conflicts |
| Live QA, board-vs-live, sign-off | Me | rule |

## Phase 0 · Engine seams (week 1, 4 lanes in parallel, 2 heavy max)

| Lane | Model | Deliverable | Engine touch | Migration |
|---|---|---|---|---|
| S1 Thread type rule | Opus | `messagingReply` writes client-visible staff replies where every client reader reads; internal notes stay `internal_note`; POS/workspace/client readers agree. Static test: no client reader returns `internal_note`. | messaging-engine.ts, lib/messaging/thread.ts, client readers | none |
| S2 Records + states | Opus | `createPurchase`, `convertToBooking`, ticket mint, reservation create write `conversation_records`; `paymentState` / `fulfilmentState` derived and kept fresh; inbox chips read real state. | lib/orders/purchase.ts, inquiry-engine-booking.ts, inbox.ts | add columns/trigger on conversation_records |
| S3 Confirm with recheck | Opus | `messagingConfirmRecord(inquiryId, source: offer | draft)`: recheck people/capacity, create project + talent bookings or order, link records, history line; refusal names the conflict, creates nothing. | new action over convertToBooking / createPurchase / capacity | none |
| S4 Rename, history, merge, tasks | Sonnet (merge part reviewed by Opus) | `messagingRename` + history line; `loadConversationHistory` (action log + record events); `messagingMerge(dupId, intoId)` moves messages, closes dup, logs both; `deriveTasks(state)` for the task list. | messaging-engine.ts, inquiry_action_log | none (merge uses existing tables) |
| S5 Lines | Opus | Draft/offer lines carry author (client | staff), confirmed flag, price snapshot, discount, tax; diff sheet shows who changed what. | lib/pos/draft.ts, offer line items | add columns |
| S6 Money from the thread | Sonnet | `messagingCancelRecord` (policy + fee), `messagingRefund` (full/partial/keep + reason), cash "record as paid outside" on the POS path; permission keys `messages.discount`, `messages.refund`, `messages.close_lost`, `messages.notes.read`. | wrappers over cancel_booking_set, refunds.ts, markInquiryPaidInCash; W22 role matrix | permissions seed |
| S7 Small fixes | Sonnet | voice `message_kind` → allowed kind; thread-token TTL = 30 days after last record date; realtime: tenant subscription patches rows + toast (no full refresh); POS poll removed. | voice-notes.ts, thread-token.ts, use-inquiry-realtime.ts | none |

Exit: unit lanes green (inquiry-workspace, notifications, money, tenant-isolation), migrations applied to isolated + production, race scripts for merge and confirm (double confirm = one record).

## Phase 1 · Shared kit (week 1–2, 1 lane, Opus, heavy)

`components/messages-v5/kit/`: tokens.css (the v5.1 colour system), StateTags (three families), Card (category grammar + ladder), MessageBubble (grouping, delivery state, quote), NextStepBar / NextStepBlock, Composer (Reply/Note, Send via, attach, voice, states), Sheet (desktop right sheet, mobile 60/92/full), OptionRow (selected/unselected), Pickers (ItemsPicker with kind chips + availability), LineEditor, PaymentLadder, RefusalLine, Skeletons, Empty. Dev-only preview route renders each kit piece in all states (extends the existing `/c/t/preview?board=` idea). Exit: preview screenshots match boards D01/D05/D07/M02/M03/M05 at 1440/1194/390.

## Phase 2 · Screens (weeks 2–3, three waves of four lanes; each wave: 1 Opus heavy + 3 Sonnet light)

Wave A
- L1 Inbox (Sonnet): workspace desktop/tablet/phone, segments Needs action/Waiting/All, chips, Filter sheet on phone, grouping, unread stripe, toast. Boards D01–D03, D11, M01, M10.
- L2 Thread + composer (Opus): header, three-family chips, stream with cards, next-step bar/block, composer states, Send via control, internal note, refusals. Boards D01, D04, D10, D16, D22, M02, M08.
- L3 Context panel + Details (Sonnet): summary, Client, Items (label per business), Money, collapsed Files/Notes/Follow-up; drawer at 1194; one-scroll Details sheet on phone; Client sheet with matches and phone-taken refusal. Boards D01, D11, D15, M04.
- L4 History, tasks, rename, merge UI (Sonnet): D13, D14, D23, M09.

Wave B
- L5 Items picker + line editor + send choices (Opus): D05, D17, M03; the three send paths.
- L6 Offer editor, versions, compare, conflict (Sonnet): D06, D18, M05.
- L7 Payment request, ladder, cancel/refund sheets (Sonnet): D07, D20, M05, M10.
- L8 Confirm booking/order sheet (Sonnet, on S3): D19, M09, D08 confirm.

Wave C
- L9 Client link (Opus): /c/t/token thread with choices, offer accept/change/decline, pay return, confirmed card, change request, ticket link. Boards C01, C02.
- L10 POS dock + phone POS (Sonnet): dock beside the sale, This customer/Inbox, Return to sale, preserved state, POS bottom bar. Boards D12, M06.
- L11 Tables, tickets, times cards (Sonnet): D09, D21 card variants over existing engines.
- L12 i18n + copy sweep + dead code (Sonnet): EN/ES/FR keys for every new string; remove the "Needs me" and "Services" leftovers; delete the dead talent prototype stack and mock maps in a separate PR.

Merge hand (Opus) after each wave: rebase lanes onto the integration branch, resolve with both intents, run the full unit lanes.

## Phase 3 · Cutover (week 4)

- Feature flag `messages_v5` per tenant (platform_settings), default off. `/admin/messages` and `/admin/pos?view=messages` render the new shell when on; the old shells stay untouched until QA passes.
- Turn on for the QA fixture tenants only. After sign-off: on for Impronta, then all; delete old shells (`admin-1..4`, machinery-*, POS MessagesShell v1) in one removal PR.

## Phase 4 · QA (me; nothing merges to main before this passes)

1. Rerun MSG-P1…P12 and WIRE-4.x on the QA host.
2. New specs `MSG-V5-01…24`, one per money workflow step from the Coverage audit ten-step table (start, action, busy, success, refusal, record, client view, workspace view, POS view, history).
3. Board-vs-live screenshot pairs for every board at its width (1440, 1194, 390); differences listed and fixed in the lane's components.
4. Live walk on the fixture tenant: agency story (inquiry → items → choices → offer v1..v3 → accept → deposit → confirm → change → balance → refund), restaurant story (menu → basket → confirm → pay at pickup → kitchen → picked up), salon story (times → hold → deposit → reschedule → cancel), channels story (WhatsApp fail → SMS link).
5. Exit: all specs green with real exit codes, zero board mismatches above cosmetic, deploy:smoke green after the pointer advances.

## Owner decisions needed before Phase 0 starts (yes/no each)

1. Conversation lifecycle follows the record (open while work or money is open; auto-resolve 2 days after orders/appointments, 7 days after events; a later message starts a new conversation with a Book again card; two live events = two conversations on one client; 30 days only for chat with no record; "Same person?" only when identity is uncertain).
2. No partial acceptance of an offer.
3. Choices never book; picks hold only times and seats; staff confirm.
4. Confirm before payment only when the offer has no deposit rule, else with a typed override reason.
5. Client can correct their own name from the link.
6. Client link lives until 30 days after the last record date.
7. Tasks are derived from state; no free-text tasks in v1.
8. Venue contacts are notes, not participants, in v1.
9. Primary green: the mockup's #2b8a63, or the live #0f4f3e.
10. Old shells stay behind a per-tenant flag until QA passes, then one removal PR.
11. Seams, then kit, then screens.
12. Live QA by the integrator only, on the fixture tenant.
13. Book again is a real card and action in v1 (new draft, new charges, old record untouched).
14. Auto-resolve grace periods 2 / 7 days, adjustable per business later.

## Budget

| Phase | Agents | Heavy slots | Calendar |
|---|---|---|---|
| 0 Seams | 4 Opus + 3 Sonnet | 2 | 3–4 days |
| 1 Kit | 1 Opus | 1 | 2–3 days |
| 2 Screens | 3 Opus + 9 Sonnet, 3 waves | 1 per wave | 8–10 days |
| 3 Cutover | 1 Sonnet | 0 | 1 day |
| 4 QA | me | 1 | 3–4 days |
