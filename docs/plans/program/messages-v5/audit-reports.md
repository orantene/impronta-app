# Messages shells audit, evidence with file:line (origin/main @ 80337cb15, 2026-09-17)

Paths relative to `web/src` unless stated. Four read-only agents, one per area. Facts only.

## A. Admin workspace

Three admin surfaces read the same `inquiries` / `inquiry_messages` rows:

| Surface | Mount | Data | Send path |
|---|---|---|---|
| Workspace classic shell `AdminOperationsShell` | `app/(workspace)/[tenantSlug]/admin/messages/page.tsx:5-7` → `page-modules/WorkspaceShell.tsx:575-583` → `page-modules/InboxPage.tsx:39-48` | bridge `inquiries` adapted in `state/context.tsx:592-720, 1970-1973` | inquiry engine via `admin/messages/actions.ts:28-92` |
| POS `pos/messages/MessagesShell` | `admin/pos/page.tsx:271-283`; **also the workspace page under 720px** `InboxPage.tsx:44-46` → `messages/phone-workspace-messages.tsx:19-28`; WhatsApp drawer `components/admin/channels/WhatsAppDrawer.tsx:195-200` | `lib/messaging/inbox.ts` via `messagingLoadInbox` | `lib/server-actions/messaging-engine.ts` with channel adapters |
| Canonical `/admin/messages/[inquiryId]` | `admin/messages/[inquiryId]/page.tsx:46-291` | direct Supabase reads, `thread_type='private'` only (66-223) | raw insert `[inquiryId]/actions.ts:61-71` |

- Live thread renderer is `admin-2.tsx` (`AdminInquiryDetail`); `admin-3.tsx` only under `?rt=1` (`admin-2.tsx:183-184, 234-236`).
- **Thread-type inversion:** POS writes customer replies `thread_type:"group"` and internal notes `"private"` (`messaging-engine.ts:728-731`); the workspace reads `private` as the Client tab and `group` as the Group tab (`admin-2.tsx:571-600`).
- Filters (`admin-1.tsx:81-96`): All · Needs me · Triage · Unread · Handoffs · Coordinating · Inquiry · Offer pending · Approved · Booked · Past · Archived. Default `needs-me` (`AdminOperationsShell.tsx:70`). Sort tiers `:138-157`. Keyboard j/k/e/r (`admin-1.tsx:126-181`). Bulk Nudge/Archive/Reassign (`admin-1.tsx:406-503`).
- Row = seven signals: avatar+trust badge, brief+NEW+age, client·date·city+lineup chip, status line (inline EN/ES ternaries `:343-376`), messaging state chips, funnel, coord avatar (`AdminOperationsShell.tsx:298-556`).
- Click → state only, no URL (`:62, 208`); `?inquiry=` has no consumer; deep link is a one-shot in-memory pin (`conversation-pending.ts:17-23`).
- Arrival: workspace `useInquiryRealtime(tenantId)` → debounced `router.refresh()` (`admin-shell-client.tsx:193-203`, `hooks/use-inquiry-realtime.ts:27-91`), no toast. POS: `setInterval` 12s (`MessagesShell.tsx:176-182`) + `IncomingToast` (`:165-168, 600-609`).
- Sidebar badge from `loadTotalUnreadMessages` once per layout (`admin/layout.tsx:159,174`; `workspace-nav.ts:138`).
- Header (`talent-1.tsx:362-540`, `admin-2.tsx:310-368`): pencil `EditJobSheet`, `ProposeTimeButton`, coordinator chip → `ReassignCoordinatorSheet`, `StageTransitionMenu` "Move to" (`admin-1.tsx:519-646`), thread search, `OverflowMenu` = all "coming soon" (`chat-interactions/OverflowMenu.tsx:49-56`).
- Tabs (`shared/machinery-1.tsx:89-162`): Client · Group · Activity · Lineup · Offer · Payment (approved+) · Details · Files. Offer `!` badge and Files list read mocks (`machinery-10.tsx:371-383`, `machinery-15.tsx:59-60,180`); admin "add file" is a toast (`:196-199`). Payment tab (`machinery-6.tsx:239`) has request/mark states, `CashSettleControls` → `markInquiryPaidInCash` (`payment-cash-settle.tsx`), `PayoutReceiverPicker`.
- Composer `DraftComposer` (`machinery-16.tsx:637-1041`): single-line input, per-thread draft, English-only smart chips, @mentions (`admin-4.tsx:72-83`), paperclip → `uploadInquiryAttachmentSigned` (`admin-4.tsx:468-497`), voice, Send-as-workspace toggle (`admin-4.tsx:90,454`).
- POS composer `ThreadPane.tsx:80-130`: Customer|Note segment; `ActionsMenu` 13 rows (`action-items.ts:14-28`); send-options families per mode (`sheets/MessagingSheets.tsx:482-488`).
- Mobile: `useCompactViewport(720)` (`pos/messages/use-compact-viewport.ts:13-24`); `PhoneMessages` has no back button in thread view; three payment buttons open the same sheet (`phone/PhoneMessages.tsx:110-121`).
- Status vocabulary: DB status → stage with `reviewing`/`closed_lost` falling to `draft` (`context.tsx:593-601`) while Move-to targets them (`admin-1.tsx:520-531`). Five copies of the bucket switch (`AdminOperationsShell.tsx:73-82, 307-312`; `admin-1.tsx:65-73`; `admin-2.tsx:202-207`; `admin-3.tsx:176-181`). `StatusSheet` infers offer/payment by substring on a localized label (`admin-2.tsx:738-749`).
- `conversation-stash.ts`: localStorage stores for mock offers, notes, local echo, pin/unread/archive flags, handoff queue, seen set, mock id map.

## B. Talent

- Route: `app/(workspace)/talent/messages/page.tsx:11-13` redirects to `/talent/inbox`; `[id]` pins then redirects (`_pin-then-redirect.tsx:28-32`). Renders `TalentJobShell` (`messages.tsx:69-73`). Data `loadTalentInquiriesAllAgencies` (`talent/layout.tsx:170`) adapted by `conversation-adapter-1.tsx:93-113`.
- Layout `TalentJobShell.tsx:106-113`; rail 240–560px persisted (`inbox-layout-1.tsx:53-76`). Chips All / Inquiry / Hold / Booked / Past / Coordinating (`:496-503`).
- Row facts hard-coded: preview "Awaiting your response." (`conversation-adapter-1.tsx:75-79`); `yourRate` from mock Proxy → "—" (`inbox-layout-1.tsx:32-35`); source never mapped (`:51-82`); archived rows never filtered.
- Unread: `markTalentInquiryThreadRead` (`talent/inbox/[id]/actions.ts:153`) is never called. Arrival: one fetch per open (`machinery-16.tsx:132-139`), refresh only after voice send (`:142-145, 562`); a sent text does not render until thread switch.
- Mobile ≤720: fixed single column, `data-mobile-pane` translate (`messages-mobile-css.ts:45-64`).
- Header `talent-1.tsx:55-340`: take-home popover uses hard-coded 80/15/5 split (`:78-83, 268-285`); thread search gets `messages={[]}`; overflow all "coming soon".
- Stage map `conversation-adapter-1.tsx:35-42`; labels `talent-1.tsx:24-47`; duplicate in `TalentJobShell.tsx:236-242`.
- Action bar `talent-2.tsx:574-681`: inquiry → accept/decline invitation; hold → Approve offer / Decline via `respondToInquiryOffer` → `talentRespondToOffer` (`lib/server-actions/talent-pipeline.ts:107-135`, `inquiry-engine-approvals.ts:196`). Coordinator at inquiry/hold with no mock offer gets no actions (`machinery-6.tsx:686-706`).
- Tabs `machinery-1.tsx:182-247`. Offer for plain talent = own take-home only (`machinery-12.tsx:514-598`), correct. Lineup read-only from `conv.participants` which the adapter never sets. Files list mocks only (`machinery-15.tsx:58`); uploads never listed.
- Dead: `TalentReservationView` (`talent-2.tsx:774-971`, `?rt=1`), `talent/pages/messages/{ThreadSidebar,ThreadParts,Bubbles,Bubbles2,Composer}` (only via unused `ConversationThread`), `TalentMessagesFab`, `[tenantSlug]/talent/inbox/InboxShell.tsx`.
- Only inquiries via `inquiry_participants role='talent'` (`_data-bridge/talent-inquiries-all-agencies.ts:43-69`).

## C. Client

| Surface | Route | Identity | Thread read | Liveness | Composer |
|---|---|---|---|---|---|
| A signed-in shell | `client/messages/page.tsx` | session (`:43-49`) | `private` (`:105`; `api/client/messages/route.ts:36`) | realtime per thread (`ClientMessagesShell.tsx:328-368`), no poll fallback | rich |
| B guest dock | `app/t/[profileCode]/_chat/*` | guest cookie | `private` (`guest-chat-actions.ts:559`) | 4s poll (`MiniChatPanel.tsx:136,379-446`) | yes |
| C guest full window | `app/c/[inquiryId]/page.tsx` | guest cookie; owner redirected to A (`:60-84`) | same as B | 4s poll | yes |
| D POS token thread | `app/(public)/c/t/[token]/page.tsx` | signed token 30d (`lib/messaging/thread-token.ts:6,35-63`) | all types minus `internal_note` (`lib/messaging/thread.ts:26-33,66-71`) | none | none (phone form only) |
| E admin-shell client POV | `ClientProjectShell.tsx`, `client-1.tsx` | mock | mock | n/a | unreachable (`InboxPage.tsx:47` only `pov="admin"`) |

- Shell A: filters `all|needs-me|active|booked|past` (`client-thread-adapter.ts:38-53`; rejected/expired/converted/draft only under All). Tabs Chat · Lineup · Offer · Details · Files (`:801-807`); no Payment tab, cards in chat. `balance_due` rendered but not in `CLIENT_ACTIVITY_KINDS` (`:820-829`, `:3570-3587`). Pins + presence on `group` while messages are `private` (`:880-881, 904`). `renderClientChatCard` returns null for `order`/`menu_order`/unknown kinds (`:3505-3605`). Offer tab `DecisionRibbon` only when `status==="sent"` (`OfferTab.tsx:100,129-137,612-655`); Counter is a message, not a state (`:707-710`). Lineup `is_frozen` hardcoded false (`:2729-2731`); English compare `"No lineup yet"` gates a banner (`:2753`).
- PayNowSheet = PaymentIntent (`components/chat-cards/PayNowSheet.tsx:22-23,172-183`) vs `/pay/[code]` Checkout Session (`pay/[code]/page.tsx:167-213`): two rails.
- Continuity: guest→signed-in claim relink works (`lib/auth/guest-claim-relink.ts:60-90`). Break: POS replies land in `group` (`messaging-engine.ts:728`), A/B/C read `private`. Break: storefront chat_with_us sends guests to `/c/t/<token>` with no composer (`chat-with-us.core.ts:152-153`). Break: D visitor code never stored (`messaging-engine.ts:700-701`).
- Hard-coded English in `ChatCard.tsx:206-208,261,307,312,351,396,530,635`; two i18n namespaces for one page.

## D. Data model and engines (relevant to the design)

- Spine: a thread is an `inquiries` row; no `conversations` table. Messaging columns `supabase/migrations/20261231222000_pos_messaging_state.sql:8-17`. `conversation_records` (`:61-63`), `conversation_identity` (`:85-97`), `message_delivery` (`:111-126`), `checkout_snapshots` (`:140-152`), `scheduled_messages` (`:169-192`), full `message_kind` CHECK (`:217-248`).
- Catalog: single `talent_offerings` table, `kind IN (service, package, product)` (`20260708161910:10-52`); package = kind `package` + `offering_components` (`20261231220000:6-17`, `lib/catalog/packages.ts`); variants double as ticket tiers (`20261229000364:33-45`).
- Reservation = order + admission (`lib/reservations/reserve.ts:4-7`), does not open a thread. Appointments `talent_bookings`/`talent_holds`; RPCs `reschedule_booking_set`, `cancel_booking_set`. Sessions + seat pools + waitlist. Events/admissions. Orders `orders.inquiry_id` nullable; `createPurchase` opens a thread only when `openThread` (`lib/orders/purchase.ts:730-766`).
- Payment links `payment_links` (`20261231205000:35-55`), `/pay/[code]`, `messagingRequestPayment` uses the conversation version (`messaging-engine.ts:438`).
- Bug: `voice-notes.ts:124` inserts `message_kind:"voice"` not in the CHECK list.
- Channels: web_chat live, email live (Resend), sms stub always `channel_unavailable` (`channels/sms.ts:9-16`), whatsapp outbox drained by an external worker not hosted.
- `conversation_records` is never written by `createPurchase`; `recordChips.paymentState/fulfilmentState` always null (`inbox.ts:~219-237`).
- State derivation `lib/messaging/state.ts:24-61` plus DB trigger `messaging_derive_opportunity_state` (`20261231222000:297-337`).
