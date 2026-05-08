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
- **rev 2 (26c5a89f)** — added D1 atomicity finding, missing offer backend
  inventory, PaymentTab + WorkPage wiring gaps, talent + client pov sections,
  drawer inventory, full marathon plan with phases + risks + DoD
- **rev 3 (68497784)** — Phase 1 progress: D1 compensating cleanup, B2
  stage transition menu, D2 WorkPage real bridge data, C3 NewBookingDrawer
  wired, NewInquiryDrawer redundant toast removed. Discovered the engine is
  more complete than rev 2 catalogued: `clientAcceptOffer`, `submitApproval`,
  `convertToBooking` already exist in `inquiry-engine.ts`, and the proper
  atomic `engine_convert_to_booking` RPC is in DB. B3's "missing actions"
  is reduced to just `talentSubmitRate` (still missing).
- **rev 4 (b9fd134d)** — full marathon: B2 final (convert-to-booking
  via atomic RPC), B6 PaymentTab live state + 5 wired transitions,
  B3 OfferTab LiveOfferPanel + create/send/approve/reject, B4 FilesTab
  LiveFilesPanel + soft-delete, ClientProfileDrawer → createClientAccount,
  TalentProfileDrawer → updateTalentIdentity. New `_pipeline-actions.ts`
  module hosts the engine wrappers. D3 root cause identified
  (architectural fix deferred). B8 lineup wiring deferred (UI rewrite scope).
- **rev 10 (this commit)** — close every remaining item from rev 9:
  - **Bulk Nudge** — `bulkNudgeInquiries` posts a coordinator-attributed
    system message into the **group** thread on each selected inquiry.
    Talent participants pick it up via the existing unread-count
    plumbing, no separate notifications system required.
  - **Theme / SEO / Navigation / Languages / Domain drawers** — all
    five wired through `patchAgencySettingsNamespace` /
    `loadAgencySettingsNamespace`. Each drawer:
    1. Loads its namespace from `agencies.settings` JSONB on mount
    2. Renders controlled inputs/toggles
    3. Saves on click via `startTransition`
    4. Toasts on success / failure, closes the drawer, refreshes router
  - **Deployment notes** — new `docs/deploy/pipeline-runtime-config.md`
    covering Stripe env + webhook setup, Supabase realtime publication +
    RLS requirements, the `agencies.settings` JSONB schema, the
    consistent UUID-guard pattern for synthetic mock ids, and Stripe
    Connect deferred-piece notes.
  - **Bridge layer split** — explicitly deferred. The pipeline is
    functionally complete; splitting `_data-bridge.ts` is pure
    organization with non-trivial churn risk across all importers and
    no functional improvement. Recorded as tech debt.
- **rev 9 (62f574ef)** — close every "out of scope" item from rev 8:
  - **Drag-to-reschedule calendar** — `rescheduleInquiry` action wraps
    `inquiries.event_date` patch. CalendarPage cells are drop targets;
    event chips are draggable with the inquiry id payload. Synthetic
    mock events get a friendly "demo events can't be rescheduled" toast.
  - **Bulk restore from archived view** — added "Archived" filter chip
    + restore-aware bulk button (becomes "Restore" when filter is
    archived). Wraps the existing `bulkSetInquiryArchived` with a flipped
    boolean.
  - **Bulk Reassign to me** — new `bulkReassignInquiriesToMe` wrapper
    iterates `assignInquiryToCurrentStaff` per row. Inbox bulk Reassign
    button now persists.
  - **Stripe checkout scaffold** — full integration:
    • `lib/payments/stripe-checkout.ts` — `createCheckoutSessionForTransaction`
      builds a Stripe Checkout session for a `booking_transactions` row.
      Mock-mode fallback when `STRIPE_SECRET_KEY` isn't set so the
      prototype demo still works end-to-end.
    • `/api/webhooks/stripe/route.ts` — webhook handler verifies signature
      via `STRIPE_WEBHOOK_SECRET`, dispatches `checkout.session.completed`
      → `markPaid(transactionId)`. Refuses unsigned events with 503.
    • `/checkout/success` + `/checkout/cancel` pages.
    • `startInquiryCheckout` in client-pipeline.ts → resolves active
      transaction, builds session, returns URL. ClientProjectDetail's
      "Pay invoice" / "Verify card" CTAs now redirect to Stripe.
  - **Realtime subscription hook** — `web/src/hooks/use-inquiry-realtime.ts`
    subscribes to Postgres-changes events on `inquiries`,
    `inquiry_messages`, `inquiry_offers`, `booking_transactions`
    scoped by tenant_id (or source_tenant_id for transactions).
    Debounced `router.refresh()` on each event keeps the shell in sync.
    Mounted via `<RealtimeBridge />` inside ProtoProvider.
  - **Settings drawer canonical actions** — `patchAgencySettingsNamespace`
    + `loadAgencySettingsNamespace` in `_pipeline-actions.ts` patch
    namespaces inside the existing `agencies.settings` JSONB. Wired
    `StorefrontVisibilityDrawer` and `FilterConfigDrawer` to load on
    mount + save on click. `ToggleRow` extended with controllable
    `onChange`. Other settings drawers (theme/SEO/navigation/
    languages/domain) can adopt the same pattern as schemas firm up.
- **rev 8 (151e2016)** — closing the in-scope items:
  - **Offer line-item editor** — new `OfferDraftEditor` component
    inside `LiveOfferPanel` (rendered when offer.status==="draft").
    Per-line dropdown picks roster talent, edits units / unit_price /
    talent_cost / pricing_unit. Header inputs for total + fee. Saves
    via `saveOfferDraft` → engine `updateOfferDraft`. Auto-recomputes
    line totals on units/price change. Loads via `loadOfferDraft`.
  - **Per-transaction payout receiver picker** — new
    `PayoutReceiverPicker` inside the Payouts section of PaymentTab.
    Loads candidates via `loadInquiryPayoutReceiverCandidates`, sets
    via `setInquiryPayoutReceiver` (wraps
    `setTransactionPayoutReceiver`). Renders only when transaction is
    `paid` or `payout_pending` and only for admin pov.
  - **Lineup drag-to-reorder** — LiveLineupPanel rows are now
    HTML5-draggable. Reorders are optimistic; persisted via
    `reorderInquiryLineup` → engine `reorderRoster`. On failure, the
    panel reloads from DB so local state matches server.
  - **Bulk inquiry archive** — the existing `AdminInboxList` bulk
    Archive button now persists to `inquiry_user_flags` for selected
    real-UUID rows in one bulk round-trip via `bulkSetInquiryArchived`.
    Synthetic mock rows still toggle local-only.
- **rev 7 (14bb9090)** — finishing pass:
  - **G-pass (client surface)** — `clientApproveCurrentOffer` /
    `clientRejectCurrentOffer` / `sendInquiryMessageAsClient` in new
    `lib/server-actions/client-pipeline.ts`. ClientProjectDetail header
    CTA dispatches Approve/Reject by label heuristic for real inquiry
    UUIDs. Shared `ConversationTab.DraftComposer` now routes by
    threadKey suffix — `:client` → client send, `:talent` → talent send.
  - **F-remainder** — Hold "Confirm" / "Release" reuse the engine
    Accept/Decline path (talent committing the hold = accepting the
    invitation; releasing = declining). Booked-stage action-confirm
    posts an explicit ack message into the group thread.
  - **B4 upload** — `uploadInquiryAttachment` server action accepts
    FormData with a File, uploads to the `inquiry-files` bucket
    (path `{tenant_id}/{inquiry_id}/{uuid}-{filename}` matching the
    storage RLS), creates the `inquiry_attachments` row. Compensating
    delete on metadata-insert failure. LiveFilesPanel surfaces an
    Upload button + hidden file input with 100 MB cap.
  - **B8 talent picker** — Add-by-UUID input replaced with a real
    roster picker. Filters out talent already on the lineup, supports
    free-text search, and only surfaces real-UUID roster rows so the
    add action will succeed.
  - **Settings drawers deferred** — no canonical actions exist for
    theme/SEO/navigation/languages/visibility/filters; building those
    is a separate phase orthogonal to the inquiry-pipeline marathon.
- **rev 6 (9674de4a)** — F-pass (talent surface):
  - **Talent shell now hits real DB** — bridge already loaded
    `effectiveTalentInquiries` via `loadTalentInquiries`; this pass wires
    the action side. Synthetic mock conv ids (`c1`..`c12`) keep the
    toast-only stubs for the demo flow.
  - **Accept / Decline** — `ConversationActionPin` calls
    `acceptInquiryInvitation` / `declineInquiryInvitation` via the new
    `lib/server-actions/talent-pipeline.ts` (engine roster actions).
  - **Submit rate** — `SubmitRateSheet.onSubmit` ALSO calls
    `submitMyRateForInquiry` which resolves offer + line item internally,
    so the prototype doesn't need to know either id. Engine permission
    enforcement (`submitTalentRate` checks talent_profile_id ownership).
  - **Talent message send** — `DraftComposer` in `ConversationDetail`
    calls `sendInquiryMessageAsTalent` (group thread) for real inquiry
    UUIDs; participant gating is enforced inside the action.
  - QA via preview deferred to manual — the SPA's command palette
    overlay wasn't easily dismissible from `preview_eval`. Typecheck +
    untracked-imports both clean.
- **rev 5 (add17e2b)** — gap-closing pass:
  - **D3 fixed** — shell is now route-aware. `ConditionalPrototypeRoot`
    detects canonical paths (currently `/admin/work/[id]`) and skips the
    SPA overlay so the canonical page renders.
  - **`talentSubmitRate` moved to engine** — proper permissions (staff or
    self-only), version safety, OFFER_DRAFT_UPDATED event, activity log.
  - **`counterOffer` engine helper** — supersedes a rejected offer with
    a fresh draft inheriting currency. Wrapped as `counterOfferAction`,
    surfaced in LiveOfferPanel when offer.status === "rejected".
  - **Transaction creation + payout state machine fully wired** —
    PaymentTab now exposes Create draft / Request payment / Mark received /
    Initiate payout / Mark payout sent / Mark disputed / Mark failed /
    Cancel. Each visible only at the correct prior status.
  - **ClientProfileDrawer edit path** — wires `updateAdminClientProfile`
    when the row id is a real auth user UUID.
  - **B8 lineup** — `LiveLineupPanel` lists real `inquiry_participants`
    rows and exposes Remove + Add by talent UUID (full picker deferred).
  - **A5 markThreadRead** — fires on Client/Talent tab open in
    `AdminInquiryDetail` for real inquiries.
  - **A6 pin/archive/manuallyUnread** — local toggles now also persist
    to `inquiry_user_flags` for real inquiries; `archiveInquiry` exposed
    and wired to the inbox row Archive quick action.
  - **D4 duplicateBooking** — `LiveBookingActions` panel in the Booking
    tab calls the canonical action via wrapper.

---

## Marathon progress — what shipped

| Commit | ID | Description |
|--------|----|-------------|
| cc724be4 | A3 | sendMessage → real DB action (admin Client + Talent threads) |
| 26c5a89f | docs | QA doc rev 2 — full marathon plan |
| 7a65cdba | D1 | convertInquiryToBooking compensating cleanup on talent-insert failure |
| 7a65cdba | B2 | StageTransitionMenu in AdminInquiryDetail header → quickPatchInquiryStatus |
| 20d2c44a | D2 | WorkPage uses effectiveMessagesInquiries + effectiveBookings from bridge |
| 20d2c44a | C3 | NewBookingDrawer → createManualBooking server action |
| 68497784 | docs+H | NewInquiryDrawer toast cleanup (composer already wires createAgencyInquiry) |
| (this)   | B2 | convert-to-booking now uses atomic engine_convert_to_booking RPC |
| (this)   | B6 | PaymentTab loads live transaction state + 5 wired actions (markReceived/Pending/Disputed/Failed/cancel) |
| (this)   | B3 | OfferTab LiveOfferPanel + CreateOfferButton (create/send/approve/reject wired) |
| (this)   | B4 | FilesTab LiveFilesPanel + soft-delete via inquiry_attachments |
| (this)   | H  | ClientProfileDrawer → createClientAccount (new mode) |
| (this)   | H  | TalentProfileDrawer → updateTalentIdentity (uuid-guarded for mock fallback) |
| b9fd134d | new | `_pipeline-actions.ts` module — engine wrappers + load helpers |
| (this)   | D3  | `ConditionalPrototypeRoot` — shell skips SPA overlay on canonical routes |
| (this)   | engine | `submitTalentRate` + `counterOffer` added to `inquiry-engine-offers.ts` |
| (this)   | B6  | Create draft / Request payment / Initiate payout / Mark payout sent wired |
| (this)   | H   | ClientProfileDrawer edit path → `updateAdminClientProfile` |
| (this)   | B8  | `LiveLineupPanel` — list + remove + add via real `inquiry_participants` |
| (this)   | A5  | markThreadRead fires on Client/Talent tab open |
| (this)   | A6  | pin/archive/manuallyUnread persist to `inquiry_user_flags` for real inquiries |
| add17e2b | D4  | `LiveBookingActions` — Duplicate booking wrapper |
| 9674de4a | F1  | `talent-pipeline.ts` — accept / decline / submit-rate / send-message wrappers |
| 9674de4a | F2  | `ConversationActionPin` calls real engine for Accept / Decline / Submit rate |
| 9674de4a | F3  | `SubmitRateSheet.onSubmit` persists to DB via `submitMyRateForInquiry` |
| 9674de4a | F4  | `DraftComposer` (talent pov) writes to inquiry_messages.group |
| 14bb9090 | G1  | `client-pipeline.ts` — approve / reject / send-message wrappers (client pov) |
| 14bb9090 | G2  | `ClientProjectDetail` CTA dispatches Approve/Reject for real inquiries |
| 14bb9090 | G3  | `ConversationTab` shared composer routes by threadKey suffix |
| 14bb9090 | F-r | Hold/Confirm reuse engine Accept/Decline; action-confirm posts ack message |
| 14bb9090 | B4u | `uploadInquiryAttachment` server action + LiveFilesPanel upload affordance |
| 14bb9090 | B8p | LiveLineupPanel uses real roster picker (search + filter on-lineup) |
| 151e2016 | B3e | `OfferDraftEditor` — coordinator line-item editor wraps `updateOfferDraft` |
| 151e2016 | B6r | `PayoutReceiverPicker` — per-transaction receiver wraps `setTransactionPayoutReceiver` |
| 151e2016 | B8r | LiveLineupPanel rows are draggable; reorder wraps `reorderRoster` |
| 151e2016 | A6b | Bulk inbox Archive persists to `inquiry_user_flags` via `bulkSetInquiryArchived` |
| 62f574ef | C-d | `rescheduleInquiry` action + calendar drag-to-reschedule |
| 62f574ef | A6r | "Archived" filter chip + restore-aware bulk button |
| 62f574ef | A6n | `bulkReassignInquiriesToMe` wired to inbox Reassign |
| 62f574ef | Pay | Stripe Checkout: session helper + webhook handler + success/cancel pages + client `startInquiryCheckout` |
| 62f574ef | Rt  | `useInquiryRealtime` hook + `<RealtimeBridge />` mounted in shell |
| 62f574ef | Set | `patchAgencySettingsNamespace` + visibility/filters drawers wired |
| (this)   | Nud | `bulkNudgeInquiries` — bulk Nudge posts system message into group thread |
| (this)   | Thm | ThemeFoundationsDrawer wired |
| (this)   | Seo | SeoDrawer wired |
| (this)   | Nav | NavigationDrawer wired |
| (this)   | Lng | TranslationsDrawer (Languages) wired |
| (this)   | Dom | DomainDrawer wired |
| (this)   | Doc | `docs/deploy/pipeline-runtime-config.md` — Stripe env, realtime RLS, settings schema |

## What's still open after rev 10

### Truly out of scope (config or refactor, not pipeline functionality)

- **Stripe production config** — code path is complete with mock-mode
  fallback. To go live, set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
  + register the webhook endpoint with Stripe. See
  `docs/deploy/pipeline-runtime-config.md`.
- **Stripe Connect (per-tenant payouts)** — current Checkout is
  single-account. Connect (Express or Standard) is a separate phase.
- **Realtime publication + RLS** — code is complete; deployment must
  ensure the `supabase_realtime` publication includes all four watched
  tables and that RLS allows the active session's SELECT. See
  deployment notes.
- **Bridge layer split** — `_data-bridge.ts` is 1900+ lines mixing
  concerns. Pure tech-debt cleanup; deferred because the churn risk
  across all importers outweighs zero functional benefit. Recommend
  doing it as a dedicated pass with full test coverage.
- **Talent-side file uploads** — the staff `uploadInquiryAttachment`
  path uses `requireStaffTenantAction`. A talent-side equivalent
  (with participant-role gating instead of staff capability) would
  let talent upload polaroids/contracts directly. Not built.

### UI polish / small follow-ups

- **B5 LogisticsTab** — toast stubs (call sheet etc.). Defer until
  `call_sheets` schema direction confirmed.
- **C4** — Drag-to-reschedule calendar (not implemented).
- **C5** — Calendar StatusStrip mock+real double-counting risk.
- **E2** — Verify other top-bar metrics (talent count, open inquiries) use
  bridge not RICH_INQUIRIES.
- **F-pass complete** — Accept/Decline/Submit-rate/message-send/Hold-
  Confirm/Action-confirm all hit DB. Still local-only: polaroid uploads
  (depends on B4-style upload but talent-side; can reuse the staff
  upload action for now since the bucket policy admits any authenticated
  user that's also tenant-staff — talent-side upload needs a parallel
  action with participant-role gating).
- **G-pass complete** — Approve/Reject + client message-send. Pay
  invoice still toast-only — needs a real Stripe checkout integration
  (genuinely new infra beyond the marathon's wiring scope).
- **H** — Remaining toast-only drawers in `_drawers.tsx` (theme, domain,
  navigation, languages, SEO, visibility, filters, email branding) —
  settings polish, not pipeline-critical.
- **Real-time refresh** — bridge data is loaded server-side and stays
  static between `router.refresh()` calls. Consider a Supabase realtime
  subscription on `inquiries`, `inquiry_offers`, `booking_transactions`
  for the active inquiry detail view.

### Architectural — for future cleanup

- **Bridge layer split** — `_data-bridge.ts` is large (1900+ lines) and
  mixes concerns (inquiries, offers, calendar, bookings, clients, roster).
  Splitting into per-domain files would keep churn contained.
- **Engine event wiring** — many engine actions emit events but the
  prototype isn't subscribed. Wire a single `useInquiryEventStream` hook
  that pushes engine events into a toast / activity feed.
