# Messages: what is built, what is proven, what is still open — brief for the designer (2026-09-17)

Paste into the chat that is designing the new Messages. It tells you what the engine and screens already do, so the design binds to real capabilities and shows the gaps as gaps.

---

You are designing the new Messages for Tulala (workspace back office + POS). The engine and a first-generation UI already exist and are on production; your design replaces the presentation, not the engine. Everything below is verified on the QA host or production this week (program session "Tulala workspace admin dashboard Development"; ask it anything, it can read production data read-only and merges through CI).

## 1. What exists and works today (design on top of this)

**Where Messages lives**
- Workspace destination `/admin/messages` (owner/manager/staff) and a rail row "Messages" inside EVERY POS mode (Counter, Floor, Door, Classes, Projects) with an unread badge (`/admin/pos?mode=<mode>&view=messages`). Mobile: reachable from the More sheet.
- Customer side: `/c/t/<token>` (signed thread link the business sends), `/c/<inquiryId>` (legacy), the pay page `/pay/<code>` links back to the conversation, and the guest QR menu/bill pages.

**Conversation model (engine, `lib/server-actions/messaging-engine.ts`, proven by WIRE-4.x and MSG-P1…P12)**
- A conversation = an inquiry thread: channel (web chat, e-mail, WhatsApp-native drawer exists, SMS not wired), customer identity (matched, captured, or anonymous), owner (assigned staff), state (needs reply / waiting on customer / resolved / lost), linked records (order, booking, session, event, project, reservation), reminders.
- Inbox filters: Needs me, Triage, Unread, All; search (`messagingSearch`); per-mode origin (a thread started from the Counter/Floor/Door knows its origin).
- Actions that exist and are proven: reply, internal note, assign owner, resolve/reopen, hand over, match/capture customer identity, link/unlink a record (with a "relink impact" preview), send options (shared draft), **request payment** (mints a payment link, customer pays on `/pay/<code>`, sale collected, thread gets the paid card), close as lost, schedule/cancel reminder, send offer (package/quote), guest draft add (customer adds items from the thread), issue visitor code, recover snapshot (after a failed send).
- Cards in the thread (11 kinds per the Messages Consolidation v2 spec): message, system, order, booking, payment request (open/paid/expired), offer, reminder, visit, ticket, identity capture, handover.
- Crons: reminder due + delivery retry (both proven, WIRE-4.5). Webhook inbound for e-mail/WhatsApp exists; the WhatsApp worker is NOT hosted (owner item), so WhatsApp threads are engine-only until then.
- Copy: EN/ES/FR catalogues (`web/messages/*.json`); refusals are sentences from `engine-refusals`, never codes.

**Screens that exist (first-gen, `web/src/components/admin/pos/messages/`)**: `MessagesShell` (3-pane: inbox list, thread pane, essentials panel), `InboxList`, `ThreadPane`, `EssentialsPanel` (customer, linked records, owner, state), `ActionsMenu` (bottom bar, 14 rows, scrolls, opens downward when room), `MessagingSheets` (send options, request payment, link record, reminder, handover, identity), `NewThreadLinkBanner` (copy/WhatsApp link after creating a thread), `IncomingToast`, `PhoneMessages` (390px stack). Board previews for the 103-screen handoff exist behind `/c/t/preview?board=MS02` in dev only.

**Boards already drawn**: the 103-screen "Messages in POS" handoff (MS01–MS31, MC01–MC20, MM01–MM06, CC01) rendered at `docs/plans/program/evidence/pos-messages/<Board>/board.png` and the PDF `~/Downloads/Tulala-POS-Messages-v2.pdf`. Your new design supersedes these; keep their information architecture unless you have a reason, and say so when you change it.

## 2. Defects found and fixed this week (so you do not design around bugs that are gone)
D-116/117/118 (six stub sheets now act on the engine), D-143 (replying from Needs-reply no longer drops the thread), D-144 (Actions menu overflow), D-145 + D-150 (payment request links back to the conversation, also when expired), Messages token kept after creating a thread (Copy link / WhatsApp banner).

## 3. What is still open (design these as real states, not as if they worked)
- **Polish pass not done**: the Messages screens had a first pass only; your design IS the second pass. Nothing pixel-level is sacred there.
- **WhatsApp/SMS live sending**: engine ready, provider not hosted; design the channel chip + "not connected" state.
- **Locale of the thread**: customer threads follow the workspace's first supported locale, not the visitor (D-151); design assumes per-thread locale but the engine will need that seam.
- **New-conversation `token` flows on mobile** (PhoneMessages) are thinner than desktop; MM01–MM06 boards were the guide.
- **Notifications**: unread badge per mode exists; push/e-mail digests to staff do not.
- **Attachments**: `MessageMedia` renders images; upload from the composer exists in the workspace, not yet on the POS thread pane.
- **Templates / canned replies**: not built (design them as a later door, greyed with a sentence, never as a fake).

## 4. Rules that bind the design
- Mobile first (390), tablet POS (1194x834), desktop (1440): three real layouts, not one squeezed.
- Every action has six states: empty, loading, ready, busy, refused (engine sentence), done. Refusals are sentences the reader can act on.
- Talent language: "client" not "buyer"; no "cart". USD display. No em dashes in product copy. Preset first, advanced hidden.
- Identity before payment: a payment request needs a customer or a captured identity; design the capture step inline.
- The design must map each control to an engine action in §1 (name it in the annotation). Anything without an engine action is drawn as "coming" and listed in §3.

## 5. Handoff back
Deliver boards as HTML/PNG per screen at the three sizes plus a one-page map "control → engine action / not yet". The program session then runs the Messages polish builder against your boards (it replaces `MessagesShell` & co. screen by screen, PR → four green checks → merge) and re-runs MSG-P1…P12 + WIRE-4.x on the QA host as the proof.
