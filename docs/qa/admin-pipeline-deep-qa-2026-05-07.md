# Admin Pipeline Deep QA — 2026-05-07 (rev 2)

QA pass of the Inquiry → Booking pipeline across the admin/talent/client surfaces
reachable from the admin-shell prototype (`/prototypes/admin-shell/`).

Branch: `claude/zealous-khayyam-f78651`

> **rev 2 expansion:** rev 1 was admin-only. rev 2 adds talent + client povs, the
> full canonical-action inventory, the booking-conversion atomicity finding, and
> a full marathon work plan with priority + sequencing.

---

## TL;DR

The prototype shell renders real DB data on the **read** side (inbox, calendar,
inquiry detail header) but almost every **write** path is a `toast()` stub or
in-memory `appendLocalMessage` / `applyOfferOverride`. Most of the canonical
server actions already exist and are well-shaped — the work is wiring, not
building, with a few exceptions called out below.

**Already-wired (working):**
- `sendMessage` (this pass — A3)
- `createAgencyInquiry` (NewInquiryDrawer — `_messages.tsx:8607`)
- Inbox list, inbox filters, calendar, stage funnel display, inquiry header

**Critical bugs / missing backend (must build, not just wire):**
- `convertInquiryToBooking` is **not atomic** — sequential inserts; partial-failure leaves orphaned bookings or missing talent rows
- Offer flow is missing **acceptOffer / counterOffer / approveOffer / talentSubmitRate** server actions entirely (only `createOffer / sendOffer / updateOfferDraft / clientRejectOffer` exist)
- Stage transition UI does not exist anywhere (no buttons → `quickPatchInquiryStatus`)

**Stubs (canonical action exists; just needs wiring):**
- ~16 `useSaveAndClose` toast-only drawers in `_drawers.tsx`
- `PaymentTab` (admin pov) — every CTA toast-only despite full payment state-machine being built at `/admin/work/[id]/actions.ts`
- `WorkPage()` (bookings tab) — uses mock `getInquiries(state.plan)` despite `loadBookings` existing in the bridge
- Files tab — `MOCK_FILES_FOR_CONV`; no `inquiry_attachments` query
- Offer tab — `applyOfferOverride` (in-memory) + `__offerStash`; no `inquiry_offers` reads/writes

---

## Methodology

- Code audit of `_messages.tsx`, `_pages.tsx`, `_drawers.tsx`, `_data-bridge.ts`, `_state.tsx`
- Cross-referenced canonical server actions in `lib/server-actions/admin-{inquiries,bookings,inquiry-roster}.ts`, `lib/inquiry/inquiry-engine-offers.ts`, `(workspace)/[tenantSlug]/admin/{messages,work/[id]}/actions.ts`
- Live browser inspection via Chrome MCP against localhost dev server (`qa-admin@impronta.test`)
- DB verification via Supabase Management API

Surfaces audited:
- **A. Messages list + composer** (admin pov)
- **B. Inquiry detail tabs** (admin pov: Client, Talent, Offer, Logistics, Payment, Files, Booking)
- **C. Calendar**
- **D. Bookings / Work tab + canonical work-detail page**
- **E. Overview / top-bar metrics**
- **F. Talent pov (TalentJobShell)**
- **G. Client pov (ClientProjectShell)**
- **H. Drawers inventory** (across `_drawers.tsx`)

---

## Surface A — Messages list + composer

| ID | Sev | Status   | Description                                          | Evidence                                              |
|----|-----|----------|------------------------------------------------------|-------------------------------------------------------|
| A1 | —   | ✅ works | Inbox loads real inquiries via bridge                | `_data-bridge.ts:loadInquiriesForMessages`            |
| A2 | —   | ✅ works | Filter chips wired to real `nextActionBy/unread*`    | `_messages.tsx:1791–1800`                             |
| A3 | P0  | ✅ fixed | `sendMessage` → real DB action                       | `_messages.tsx:2444` (cc724be4)                       |
| A4 | —   | ✅ works | Smart reply chips (display only)                     | `SMART_REPLIES_FOR_LAST`                              |
| A5 | P2  | ⏳ stub  | "Mark thread read" not wired to `markThreadRead`     | `markThreadRead` exists in `messages/actions.ts:90+`  |
| A6 | P2  | ⏳ stub  | New-inquiry searchbar quick actions toast-only       | `_pages.tsx:419` (Pin), `_pages.tsx:430` (Archive)    |

---

## Surface B — Inquiry detail tabs

### B1 — Stage funnel (header)
✅ Renders correctly from real `inquiry.stage`. Display only.

### B2 — Stage transitions
**P0 BUILD** — No UI exists to advance an inquiry through the pipeline. The
canonical action `quickPatchInquiryStatus` (`admin-inquiries.ts:1659`) accepts
status updates but no button or menu in the prototype calls it. Coordinator
literally cannot move a deal forward without leaving the prototype.

### B3 — Offer tab
**P0 PARTIAL BUILD + WIRE** — The prototype's `OfferTab` (`_messages.tsx:9983`)
reads from in-memory `__offerStash` and mutates via `applyOfferOverride`. The
canonical actions are partially built:

| Action            | Backend exists? | Wired?  |
|-------------------|-----------------|---------|
| `createOffer`     | ✅ `inquiry-engine-offers.ts:116` | ❌ |
| `sendOffer`       | ✅ `inquiry-engine-offers.ts:191` | ❌ |
| `updateOfferDraft`| ✅ `inquiry-engine-offers.ts:267` | ❌ |
| `clientRejectOffer`| ✅ `inquiry-engine-offers.ts:398` | ❌ |
| `clientApproveOffer` | ❌ MISSING | — |
| `talentSubmitRate`   | ❌ MISSING | — |
| `talentAcceptOffer`  | ❌ MISSING | — |
| `counterOffer`       | ❌ MISSING | — |

The `inquiry_offers` table is read at `_data-bridge.ts:loadInquiriesForMessages`
but only for the badge stage label — never to populate the OfferTab.

### B4 — Files tab
**P1 BUILD + WIRE** — `FilesTab` (`_messages.tsx:11578`) reads `MOCK_FILES_FOR_CONV`.
`inquiry_attachments` table is referenced in zero bridge functions. No
`uploadAttachment` / `deleteAttachment` server action found.

### B5 — Logistics tab
**P2 STUB** — Every button is `toast()` (`_messages.tsx:7404` onwards):
- "Edit call sheet", "Open map", "Add transport", "Messaging coordinator" — all stubbed.
- No backing `call_sheets` table reference found.

### B6 — Payment tab (admin pov)
**P0 WIRE** — `PaymentTab` (`_messages.tsx:7436`) is fully toast-stubbed (`Pay invoice flow`, `Send reminder`).

The full payment state machine **is built** at
`/admin/work/[id]/actions.ts` — 12 actions exist:
- `createTransactionDraftAction`, `requestPaymentAction`, `markPendingAction`
- `selectPayoutReceiverAction`, `markPaidAction`, `initiatePayoutAction`
- `markPayoutSentAction`, `cancelTransactionAction`, `markFailedAction`
- `markDisputedAction`, `markRefundedAction`, `createAgencyPayoutAccountAction`

None are called from `PaymentTab` in the prototype shell.

### B7 — Booking/Project tab
✅ `AdminBookingTab` (`_messages.tsx:6710`) renders real inquiry fields via `toInquiry(inquiry)`.

### B8 — Talent lineup (right rail)
Roster-modify actions exist (`rosterAddTalent`, `rosterRemoveParticipant`,
`rosterMoveParticipant` in `admin-inquiry-roster.ts`). Prototype calls?
**Not yet audited** — needs grep pass.

---

## Surface C — Calendar

| ID | Sev | Status   | Description                                          | Evidence                                              |
|----|-----|----------|------------------------------------------------------|-------------------------------------------------------|
| C1 | —   | ✅ works | Calendar events from real inquiries                  | `_data-bridge.ts:loadCalendarEvents`                  |
| C2 | —   | ✅ works | Month navigation via React state                     | `_pages.tsx:CalendarPage`                             |
| C3 | P1  | ⏳ stub  | "New booking" CTA toast-only; canonical exists       | `createManualBooking` at `admin-bookings.ts:1070`     |
| C4 | P2  | ⏳ stub  | Drag-to-reschedule not implemented                   | calendar event click is `setPage("messages")` only    |
| C5 | P2  | ⏳ stub  | Status counters in StatusStrip aggregate mock + real | `_pages.tsx:CalendarPage` `allMonthEvents` flat       |

---

## Surface D — Bookings / Work tab + canonical detail

### D1 — Booking conversion atomicity
**P0 BUILD** — `convertInquiryToBooking` (`admin-bookings.ts:64`) is **NOT
ATOMIC**. Sequence:
1. `INSERT INTO agency_bookings`
2. Loop: `INSERT INTO booking_talent` (one per talent — can partial-fail mid-loop)
3. `recalculateBookingTotals`
4. `UPDATE inquiries SET status='converted'`

If any step after (1) fails, the booking exists but is missing talent rows or
the inquiry is left in `submitted/approved` while a booking already exists for
it. There is no `BEGIN TRANSACTION` and no Postgres stored procedure.

User charter explicitly listed atomic transactions for booking conversion as
**non-negotiable** — this is a P0.

**Fix path:** wrap in a Postgres function (`convert_inquiry_to_booking_v1`)
called via `supabase.rpc(...)`, or use a single multi-statement transaction
through the service-role client.

### D2 — Work tab uses mock data
**P1 WIRE** — `WorkPage()` at `_pages.tsx:4302` calls `getInquiries(state.plan)`
which returns the in-memory `RICH_INQUIRIES` mock list. The bridge function
`loadBookings` exists at `_data-bridge.ts:845` (joins `inquiries` ↔
`agency_bookings` ↔ transactions). Just not consumed.

### D3 — Direct URL nav to canonical work page
**P1 INVESTIGATE** — `/impronta/admin/work/<uuid>` renders blank when
navigated to. Likely the prototype SPA layout intercepts the route. The
canonical page at `/(workspace)/[tenantSlug]/admin/work/[id]/page.tsx` is
fully wired with the payment state machine; users just can't reach it.

### D4 — Bulk booking ops
**P2 STUB** — `duplicateBooking` exists at `admin-bookings.ts:1240` but no
prototype UI calls it.

---

## Surface E — Overview / top-bar metrics

| ID | Sev | Status   | Description                                          |
|----|-----|----------|------------------------------------------------------|
| E1 | —   | ✅ works | `pendingApprovals` count (fixed in 1ec71... G11 pass) |
| E2 | P2  | ⏳ verify | Other top-bar metrics (talent count, open inquiries) — confirm wired to bridge, not RICH_INQUIRIES |
| E3 | P2  | ⏳ stub  | Self-registration banner — already deferred; needs `verification_requests` table query |

---

## Surface F — Talent pov (TalentJobShell)

`function TalentJobShell()` at `_messages.tsx:2750`. **Audit incomplete.** Known:
- Big actions (Accept / Decline / Hold) — wiring status unverified
- "Submit rate" CTA — backend action missing (B3)
- Calendar tile, earnings tile — read mocks
- Job header reads from MOCK_CONVERSATIONS, not real inquiries

**Action:** schedule an F-pass before fixing offer accept/counter (touch the same code paths).

---

## Surface G — Client pov (ClientProjectShell)

`function ClientProjectShell()` at `_messages.tsx:4186`. **Audit incomplete.** Known:
- Approve / Counter buttons — backend `clientApproveOffer` does not exist
- "Pay invoice" — toast stub (`_messages.tsx:7448`)
- Talent lineup display — reads MOCK_CONVERSATIONS

---

## Surface H — Drawers inventory (`_drawers.tsx`)

16 `useSaveAndClose` toast-only stubs:

| Line   | Drawer                          | Canonical action exists? |
|--------|---------------------------------|--------------------------|
| 1348   | Theme drawer                    | unknown                  |
| 10568  | Domain settings                 | unknown                  |
| 11008  | Profile drawer                  | `updateTalentIdentity` ✅ |
| 12906  | "Your profile" drawer           | unknown                  |
| 13018  | **Send offer** drawer           | `sendOffer` ✅          |
| 13218  | **New inquiry** drawer (manual) | `createManualInquiry` ✅ |
| 13442  | **New booking** drawer          | `createManualBooking` ✅ |
| 13488  | **New client** drawer           | `createClientAccount` ✅ |
| 14589  | Navigation drawer               | unknown                  |
| 14691  | Languages drawer                | unknown                  |
| 14736  | SEO drawer                      | unknown                  |
| 18463  | Visibility drawer               | unknown                  |
| 18542  | Filters drawer                  | unknown                  |
| 18723  | Generic save                    | unknown                  |
| 19396  | **Default payout receiver**     | `selectPayoutReceiverAction` ✅ |
| 22195  | Email branding                  | `updateAgencyBranding` ✅ |

The 6 in **bold** are pipeline-critical. The rest are admin/settings polish.

---

## Canonical action inventory

Server actions that **already exist** but are not (or only partially) wired:

**`lib/server-actions/admin-inquiries.ts`** (28 exports — sample):
- `createAgencyInquiry` ✅ wired
- `updateInquiry`, `updateInquiryClientInfo`, `updateInquiryLocation`, `updateInquiryRequestDetails` — ❌
- `addInquiryTalent`, `removeInquiryTalent`, `moveInquiryTalent` — ❌
- `quickPatchInquiryStatus` — ❌ (B2 blocker)
- `assignInquiryToCurrentStaff` — ❌
- `createBooking`, `createManualInquiry` — ❌
- `createClientAccount`, `createClientAccountContact`, `updateClientLocation` — ❌

**`lib/server-actions/admin-bookings.ts`**:
- `convertInquiryToBooking` — exists but NOT atomic (D1)
- `updateBooking`, `quickUpdateBookingPeek` — ❌
- `createManualBooking` — ❌
- `saveBookingTalentRow`, `addBookingTalentRow`, `deleteBookingTalentRow` — ❌
- `duplicateBooking` — ❌

**`lib/server-actions/admin-inquiry-roster.ts`**:
- `rosterAddTalent`, `rosterRemoveParticipant`, `rosterMoveParticipant` — ❌

**`lib/inquiry/inquiry-engine-offers.ts`**:
- `createOffer`, `sendOffer`, `updateOfferDraft`, `clientRejectOffer` — ❌
- (missing) `clientApproveOffer`, `counterOffer`, `talentSubmitRate`, `talentAcceptOffer`

**`(workspace)/[tenantSlug]/admin/work/[id]/actions.ts`** — 12 payment actions: all built, none wired into prototype.

**`(workspace)/[tenantSlug]/admin/messages/actions.ts`**:
- `sendMessage` ✅ wired (A3 — this pass)
- `markThreadRead`, `fetchMessages` — ❌

---

## Marathon plan

**Sequencing principle:** unblock pipeline-critical paths first (write side > read side > polish), then collapse the deferred deck. Every step lands a localhost-tested commit; we never push to Vercel mid-marathon. Each step ends with typecheck + untracked-imports check.

### Phase 1 — Pipeline-critical writes (P0)

1. **D1 atomicity** — wrap `convertInquiryToBooking` in a Postgres function
   `convert_inquiry_to_booking_v1(...)` invoked via `supabase.rpc`. Move the
   inquiry insert + talent loop + status update inside one transaction.
   Migrate via Supabase Management API SQL. Test: induce talent-row failure,
   verify booking insert is rolled back.

2. **B2 stage transitions** — add a `StageTransitionMenu` component to the
   `AdminInquiryDetail` header with valid-next-state options. Wire to
   `quickPatchInquiryStatus`. Localhost test: walk an inquiry submitted →
   reviewing → offer_pending → approved → booked, verify DB state after each.

3. **B3 missing offer actions** — build:
   - `clientApproveOffer(tenantSlug, offerId)` — sets `offer.status='accepted'`, advances inquiry to `approved`
   - `counterOffer(tenantSlug, offerId, counterPayload)` — creates a new offer version
   - `talentSubmitRate(tenantSlug, offerId, rateRow)` — writes to offer rows
   - `talentAcceptOffer(tenantSlug, offerId, talentId)` — flips the per-talent acceptance
   Pattern: mirror `clientRejectOffer` shape exactly.

4. **B3 wire OfferTab** to real data. Replace `MOCK_OFFER_FOR_CONV` /
   `__offerStash` reads with bridge data; replace `applyOfferOverride` calls
   with the four new actions + the four already-built ones.

5. **B6 wire PaymentTab** to the existing 12-action payment state machine.
   Match the canonical work-detail page's UX so behavior is identical.

### Phase 2 — Pipeline-critical reads (P1)

6. **D2 wire WorkPage** to `loadBookings`. Replace the mock `getInquiries` call.
7. **D3 investigate** — find the layout / route shadowing that blocks
   `/admin/work/[id]`. Probable fix: register the route with the prototype
   SPA's page resolver, or short-circuit the SPA when the path matches the
   canonical pattern.
8. **B4 wire FilesTab** — extend bridge with `loadInquiryAttachments`; build
   `uploadAttachment` / `deleteAttachment` actions if missing.

### Phase 3 — Drawer wiring sweep (P1/P2)

For each toast-only drawer with a real action, replace `useSaveAndClose` with
controlled-form + `startTransition + serverAction` + reusable error toast.
Order:
9. **C3 New booking drawer** → `createManualBooking`
10. **H send-offer drawer** (line 13018) → `sendOffer`
11. **H new-inquiry drawer (manual)** → `createManualInquiry`
12. **H new-client drawer** → `createClientAccount`
13. **H default-payout-receiver drawer** → `selectPayoutReceiverAction`

### Phase 4 — Talent + Client povs (P2)

14. **F-pass** — full audit of `TalentJobShell`. Wire Accept/Decline/Hold to
    real talent-side actions (built in step 3). Replace MOCK_CONVERSATIONS
    reads with talent-scoped bridge query.
15. **G-pass** — full audit of `ClientProjectShell`. Wire Approve/Counter to
    real client-side actions (built in step 3).

### Phase 5 — Polish (P2)

16. **C5 calendar status strip** — exclude mock fallback when bridge data is
    present (avoid double-counting).
17. **B5 LogisticsTab** — defer or stub-out remaining toast-only buttons with
    "coming soon" copy until call_sheets table direction is resolved.
18. **A5 markThreadRead** — fire on tab open / scroll-to-bottom.
19. **E2 verify** other overview metrics (talent count, open inquiries) all
    use bridge.
20. **D4** add bulk booking ops menu → `duplicateBooking`.

### Phase 6 — Hardening

21. Audit RLS for every newly-wired action (inquiries, offers, bookings,
    transactions all enforce `tenant_id` correctly).
22. End-to-end smoke test: create inquiry → suggest talent → send offer →
    approve → convert to booking → mark paid → initiate payout. Verify each
    step has a real DB write.

---

## Risks / unknowns to resolve early

- **Postgres transaction semantics from supabase-js** — does the service-role
  client expose multi-statement transactions, or do we need an RPC? This blocks
  D1.
- **`call_sheets` / inquiry attachments tables** — confirm schema before
  building Files / Logistics actions.
- **Offer versioning model** — is `inquiry_offers` versioned (new row per
  counter) or mutable? Check existing `clientRejectOffer` for the shape.
- **Permissions matrix** — confirm `agency.workspace.edit` capability covers
  the new offer actions before exposing UI.
- **Prototype routing intercept (D3)** — find the layout file owning the SPA
  fallback before designing the canonical page integration.

---

## Definition of done (per fix)

A fix is "done" when:
1. Real data writes to DB (verify via Management API query)
2. UI reflects the write after `router.refresh()` / state subscription
3. Error path renders a toast (not a silent failure)
4. Typecheck passes (no new errors in changed files)
5. Untracked-imports check clean
6. QA-doc row updated to ✅ with commit SHA
7. Localhost-tested with `qa-admin@impronta.test`

No Vercel push until the marathon completes its full run and the user gives go.

---

## Verification (this rev)

- All DB / action references confirmed via grep
- Live browser inspection on localhost
- Typecheck: pre-existing worktree dependency errors only — no new errors from this rev's edits

---

## Changelog

- **rev 1 (cc724be4)** — initial doc + sendMessage fix (A3)
- **rev 2 (this commit)** — added D1 atomicity finding, missing offer backend
  inventory, PaymentTab + WorkPage wiring gaps, talent + client pov sections,
  drawer inventory, full marathon plan with phases + risks + DoD
