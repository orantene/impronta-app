# Admin Pipeline Deep QA — 2026-05-07

QA pass of the Inquiry → Booking pipeline across the four surfaces reachable
from the admin-shell prototype (`/prototypes/admin-shell/`).
Branch: `claude/zealous-khayyam-f78651`

---

## Methodology

- Code audit of `_messages.tsx`, `_pages.tsx`, `_drawers.tsx`, `_data-bridge.ts`
- Cross-referenced with canonical server actions in `admin-inquiries.ts`, `admin-bookings.ts`, `messages/actions.ts`
- Live browser inspection via Chrome MCP against localhost dev server
- DB verification via Supabase Management API

---

## Surface A — Messages list + composer

### A1 WORKING — Inbox list loads real inquiry data
`_data-bridge.ts:loadInquiriesForMessages` runs 7 parallel queries against
`inquiries`, `inquiry_messages`, `inquiry_message_reads`, `inquiry_participants`,
`inquiry_offers`. Returns `WorkspaceInquiryForMessages[]` which are passed as
`initialBridgeData` to `ProtoProvider`. Prototype consumes real rows.

### A2 WORKING — Filter chips use real data
`_messages.tsx:1791–1800` — "Needs me", "Unread", stage-bucket chips all filter
against real `nextActionBy`, `unreadGroup`, `unreadPrivate` values from the
bridge. No mock overrides.

### A3 **P0 BLOCKED** — sendMessage writes to in-memory only; never reaches DB
**File:** `_messages.tsx:2444–2453`

```tsx
onSend={(text) => {
  appendLocalMessage(threadKey, text);  // in-memory only
  toast("Message sent");               // false confirmation
}}
```

Real server action `sendMessage(tenantSlug, inquiryId, threadType, body)` exists
at `(workspace)/[tenantSlug]/admin/messages/actions.ts:27` and writes to
`inquiry_messages`. It is never called from the prototype shell.

**Fix:** Import `sendMessage`, add `inquiryId`/`tenantSlug`/`threadType` props
to `AdminMessageStream`, call real action inside `startTransition`, keep
`appendLocalMessage` as optimistic UI.

### A4 WORKING — Smart reply chips
`SMART_REPLIES_FOR_LAST` maps to `adminSmartCtx` derived from `stageBucket`.
Display only (no send side-effects), so stub is acceptable here.

---

## Surface B — Inquiry detail (tabs: Client · Talent · Offer · Files · Booking)

### B1 WORKING — Stage funnel renders from real data
`JobStageFunnel` at `_messages.tsx:3804–3866` renders `role="progressbar"`,
stage derived from `inquiry.stage` (real DB field). Display correct.

### B2 **P0 BLOCKED** — No stage transition buttons
The admin workspace header has no buttons to advance inquiry status
(`submitted → reviewing → offer_pending → approved → booked`). The canonical
server action `quickPatchInquiryStatus` exists at `admin-inquiries.ts:1659`.
Coordinator cannot move deals forward without navigating to a separate surface.

### B3 **P1 BLOCKED** — Offer tab is entirely mock-based
`OfferTab` reads from in-memory `__offerStash` / `applyOfferOverride`. No
bridge query fetches from `inquiry_offers`. All CTAs (Send offer, Approve,
Submit rate, Counter) call `toast()` or mutate in-memory state only.

Real `inquiry_offers` table exists; `loadInquiriesForMessages` selects
`inquiry_offers` but only uses `status` for the badge — not to populate the tab.

### B4 **P1 BLOCKED** — Files tab shows mock data
`FilesTab` at `_messages.tsx:11557+` reads from `MOCK_FILES_FOR_CONV[key]`.
Real `inquiry_attachments` table exists but is not queried.

### B5 WORKING — Booking/Project tab uses real inquiry fields
`AdminBookingTab` at `_messages.tsx:~10000` receives `toInquiry(inquiry)` which
maps real `RichInquiry` fields. Correct data for confirmed bookings.

---

## Surface C — Calendar

### C1 WORKING — Calendar events load from real DB
`_data-bridge.ts:loadCalendarEvents` queries `inquiries WHERE event_date IS NOT NULL`.
Returns ISO date strings for the calendar cells. DB confirmed 0 active inquiries
have `event_date` set → correctly shows empty calendar for May 2026.

### C2 WORKING — Month navigation is client-side React state
`_pages.tsx` calendar uses `useState` for current month. Correct.

### C3 **P1 BLOCKED** — "New booking" CTA is toast-only stub
Calendar header "New booking" button calls `useSaveAndClose("Booking created")`.
`NewBookingDrawer` in `_drawers.tsx:13440` has uncontrolled inputs and no server
action call. Real `createManualBooking` / `createBooking` action exists at
`admin-inquiries.ts:829`.

---

## Surface D — Bookings / Work detail

### D1 WORKING — convertInquiryToBooking is a real transactional action
`admin-bookings.ts:64` — writes atomically to `agency_bookings` + `booking_talent`,
updates inquiry status. Full implementation exists.

### D2 **P1 BLOCKED** — WorkPage() in prototype shell reads mock inquiries
`_pages.tsx:WorkPage()` calls `getInquiries(state.plan)` which returns the
in-memory `RICH_INQUIRIES` mock list for the work-tab cards. Real bookings from
`agency_bookings` are not fetched.

### D3 **P1 ISSUE** — Direct URL navigation to canonical work page renders blank
Navigating browser to `/impronta/admin/work/<uuid>` via the prototype shell
renders blank. The SPA prototype likely intercepts this route before the Next.js
segment handler at `/(workspace)/[tenantSlug]/admin/work/[id]/page.tsx` can run.
Canonical page is fully wired (payment state machine, dispute actions).

---

## Priority summary

| ID  | Severity | Description                                          |
|-----|----------|------------------------------------------------------|
| A3  | P0       | sendMessage → DB (messages never persist)            |
| B2  | P0       | Stage transition buttons missing in admin workspace  |
| B3  | P1       | Offer tab mock-only                                  |
| B4  | P1       | Files tab mock-only                                  |
| C3  | P1       | New booking drawer stub                              |
| D2  | P1       | Work tab reads mock bookings                         |
| D3  | P1       | Canonical work page unreachable via prototype nav    |

---

## Fixes in this pass

### Fix 1 — A3: Wire sendMessage to real DB action
**File:** `_messages.tsx` (`AdminMessageStream`)

Added `inquiryId`, `tenantSlug`, `threadType` props. Imported `sendMessage`
from `messages/actions.ts`. `onSend` now calls the real server action via
`startTransition` with optimistic `appendLocalMessage` pre-call. Error toasts
on failure.

---

## Deferred / not in scope for this pass

- B2 (stage transition buttons) — needs new UI component design decision
- B3 (offer tab) — large bridge extension + OfferTab rewrite
- B4 (files tab) — requires `inquiry_attachments` bridge query + upload infra
- C3 (new booking drawer) — requires full form controlled-state rewrite
- D2 (work tab mock bookings) — needs `agency_bookings` bridge query
- D3 (canonical work page routing) — prototype SPA routing investigation

---

## Verification

- DB reads confirmed via Supabase Management API
- Typecheck: pre-existing worktree dependency errors only — no new errors from this pass
