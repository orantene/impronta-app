# Messages & Inquiries in the POS — integrator contract

Package: POS Messages. UI session mounts `MessagesClient`. This file is the
contract: readers, actions, refusal codes, and the seams the integrator applies.
Nothing here authorizes a production migration apply.

Refusals are codes. Sentences live in `dashboard.pos.messages.refusal.*`
(en / es / fr). Actions return `{ ok: false, reason }` and never English prose.

Three states stay separate: conversation (`needs_reply` | `awaiting_customer` |
`resolved`), opportunity (nullable), and per-record chips. A resolved thread
never cancels a record. A paid order never resolves a thread.

## Readers

| Name | File | Input | Output |
|---|---|---|---|
| `loadMessagingInbox` | `lib/messaging/inbox.ts` | `{ tenantId, locationSlug, filter, actorUserId }` | rows + unreadCount |
| `loadMessagingThread` | `lib/messaging/thread.ts` | `{ tenantId, inquiryId }` | messages |
| `loadMessagingEssentials` | `lib/messaging/essentials.ts` | `{ tenantId, inquiryId }` | customer / linked / notes |
| `matchCustomers` | `lib/messaging/match-customers.ts` | name/email/phone + customer rows | phone / name_only / new |
| `diffDraft` | `lib/messaging/diff-draft.ts` | base, theirs, yours snapshots | previous / theirs / yours |
| `renderCard` | `lib/messaging/cards.ts` | kind + payload + audience | operator / customer / SMS |
| `signThreadToken` / `verifyThreadToken` / `publicThreadPath` | `lib/messaging/thread-token.ts` | inquiry + tenant | `/c/t/<token>` |

## Actions (`web/src/lib/server-actions/messaging-engine.ts`)

`messagingReply`, `messagingInternalNote`, `messagingAssignOwner`,
`messagingResolve`, `messagingReopen`, `messagingHandOver`,
`messagingStartConversation` (web chat refused: customer opens it),
`messagingMatchCustomers`, `messagingCaptureIdentity`,
`messagingLinkRecord`, `messagingUnlinkRecord`, `messagingRelinkImpact`,
`messagingSendOptions`, `messagingEnsureSharedDraft`,
`messagingRequestPayment` (reuses `createPaymentLink` + the same
`operation_key`), `messagingCloseLost`, `messagingScheduleReminder`,
`messagingCancelReminder`, `messagingSearch`, `messagingRecoverSnapshot`,
`messagingSendOffer` (package-2 `sendOffer`), `messagingGuestDraftAdd`,
`messagingIssueVisitorCode`.

## Schema (isolated first)

Migration `20261231222000_pos_messaging_state.sql`: inquiries columns,
`conversation_records`, `conversation_identity`, `message_delivery`,
`checkout_snapshots`, `scheduled_messages`, widened `message_kind`,
version-locked RPCs. `orders.inquiry_id` already exists.

## Integration seams

The integrator applies these. This package does not edit the named files.

### 1. Rail destination — `web/src/lib/pos/modes.ts`

Import: none from this package (data only).
Props: add `"messages"` to every `POS_MODE_META[mode].destinations` (same slot,
same unread count).
One-line diff: `destinations: [..., "messages"]` on each mode.

### 2. Mount — `admin/pos/page.tsx` + `mode-clients.tsx`

Import: `import { MessagesClient } from "./messages-client"`.
Props: `{ mode, locationSlug, tenantId, adminBasePath, returnHref, returnLabel }`.
One-line diff: when `?view=messages` (or the rail row), render
`<MessagesClient … />` inside the mode's `PosFrame`. Header link:
"Back to sale #N · $X · N lines" / "Back to Today".

### 3. Origin on orders

A draft opened from Messages sets `orders.source_channel = 'messages'`.
Integrator: Orders / Receipts / kitchen ticket show
"from Messages · paid by link" when `source_channel = 'messages'` (P1·12).

### 4. Workspace Messages chips

Import: `readConversationState`, `readOpportunityState` from
`@/lib/messaging/state`.
Props: the inquiry row.
One-line diff: render the three families as separate chips; do not merge them.

### 5. Mobile More sheet

The existing "Messages" row opens `MessagesClient` with `compact`.
One-line diff: `compact` prop true at 390px.

### 6. Public `/c/t/[token]` vs existing `/c/[inquiryId]`

New page: `web/src/app/(public)/c/t/[token]/page.tsx` (signed thread token).
Existing: `web/src/app/c/[inquiryId]/page.tsx` (guest cookie + UUID).
Next 16 refuses two `/c/[*]` patterns, so cards ship at `/c/t/<token>`
(D-POS-89). Integrator later: dispatch UUID → current guest thread and
`v1.` token → `publicThreadPath`; do not delete the cookie path.
One-line diff in the existing page: if `inquiryId.startsWith("v1.")` then
`redirect(publicThreadPath(inquiryId))`.

### 7. Crons

`GET /api/cron/messaging-reminders` and `GET /api/cron/messaging-delivery-retry`
(CRON_SECRET). Integrator: add both to `vercel.json` crons. Prefix `/api/cron`
is already shared.

### 8. Webhooks

`POST /api/webhooks/messaging/:channel` (`whatsapp` | `sms` | `email`),
HMAC `x-messaging-signature`. `/api/webhooks/` is already reachable.

### 9. Test lanes (do not widen baselines here)

Add to an existing lane or a new `test:messaging` wired into `ci`:
`src/lib/messaging/*.test.ts` and `src/lib/messaging/refusals.static.test.ts`.

### 10. Unread badge

`loadMessagingInbox(…).unreadCount` is the rail badge for `messages`.
Pass it as `counts.messages` on `PosFrame`.

## Gates (this package, 2026-09-11)

Real exit codes on `cursor/pos-messages-444f`:

| Lane | Exit |
|---|---|
| typecheck | 0 |
| lint | 0 |
| test:money | 0 |
| test:commands | 0 |
| test:tenant-isolation | 0 |
| test:size-ratchet | 0 |
| test:phase1-i18n | 0 |
| test:design-system | 0 |
| test:inquiry-workspace | 0 |
| messaging unit (`src/lib/messaging/*.test.ts`) | 0 (13/13; not wired into `package.json`) |

Isolated apply, race scripts, and Playwright need the isolated env + seam 2. Not run here.
