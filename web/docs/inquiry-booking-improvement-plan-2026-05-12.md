# Inquiry → Booking Improvement Plan — 2026-05-12

**Status:** Audit complete + live-test findings merged 2026-05-12 PM. Execution starting.
**Scope:** Full inquiry-to-booking pipeline + messages surfaces (admin / client / talent).
**Audit method:** 6 parallel deep-dive agents + 1 live-browser test pass.

This doc is the source-of-truth handoff package. Each item is self-contained: file paths, engine state, acceptance criteria. Hand any item to an agent without re-explaining context.

---

## TL;DR

The plumbing is solid. Engine, schema, RLS, send/receive all real. The gaps are almost entirely **last-mile UI wiring of existing engine actions** plus **client-side product gaps** (client cannot accept an offer, cannot see talent, cannot see offer details). The funnel literally cannot close end-to-end from the client side today.

Live testing surfaced two additional P0s: **offer drafting hangs** (button stuck on "Starting…", page becomes unstable) and **Project tab reads from a different talent source than Live lineup** (top shows 3 talent, Project says "No talent yet"). Plus an RLS bug blocking notification inserts on talent assignment.

Two-day focused sprint clears the P0/P1 list and gets to a working end-to-end booking flow.

---

## Sprint 0 — Live-test P0s (added 2026-05-12 PM)

These came out of live-browser testing of the admin messages workspace. Take precedence over the original A1–A9 list.

### S0.1. Offer "Start drafting offer" hangs forever — **P0 funnel blocker**

**Symptom:** Admin clicks "Start drafting offer" → button switches to "Starting…" and never resolves. Page/browser becomes unstable.
**Impact:** Bridge from inquiry → booking is broken. No offer can be created from the UI.
**Suspected root causes:**
- Missing `await` in the action chain.
- `createOffer()` engine call hanging on a DB lock or RLS recursion.
- React state set on unmounted component / infinite re-render loop after action returns.
- Version conflict not surfaced; action returns `{ conflict: true }` but UI handler doesn't know how to handle it.
- Server action returns but `revalidatePath` causes navigation that interrupts the optimistic UI.

**Files to inspect:**
- `web/src/components/admin/shell/internal/messages.tsx` — find "Start drafting offer" button + its onClick handler
- `web/src/lib/inquiry/inquiry-engine-offers.ts:115–181` — `createOffer()`
- Server action wrapping `createOffer` (search `_pipeline-actions.ts` or similar)

**Fix path:**
1. Reproduce with browser devtools open (Network + Console).
2. Check if action POST returns 200/500/never.
3. If returns: trace why UI doesn't unstick.
4. If never returns: trace engine for hang.
5. Add explicit error toast + button reset on any non-success outcome.

**Acceptance:** "Start drafting offer" returns within 2s with either a draft offer ID + UI transition to Offer tab, or a clear error toast and button reset.

---

### S0.2. Project tab talent mismatch — **P0 trust breaker**

**Symptom:** Top of inquiry workspace shows "Live lineup (3)" with three talent. Project tab below shows "No talent on this job yet."
**Impact:** Admin cannot trust what they see. Two parallel data sources for the same concept.

**Suspected root cause:** Live lineup chip reads from `inquiry_participants` where `role='talent'`. Project tab `<AdminBookingTab>` (likely at messages.tsx:2538) reads from a legacy field — `inquiries.talent` JSONB column, `inquiry_talent` table (dropped per commit `259ca531`), or a mock fallback.

**Files to inspect:**
- `web/src/components/admin/shell/internal/messages.tsx` — find `AdminBookingTab` component, its data prop, where Project tab talent renders
- The data bridge that loads inquiry context
- Confirm both surfaces consume `inquiry_participants` filtered by `role='talent' AND status IN ('invited','active')`

**Fix:** Unify on `inquiry_participants` as the single source. Update Project tab data binding to match Live lineup chip.

**Acceptance:** Add a talent → both Live lineup count AND Project tab roster update to the same N. Numbers always match.

---

### S0.3. "View lineup" drawer is parallel/legacy — **P1 consolidation**

**Symptom:** Project tab's "View lineup" button opens a separate drawer that feels disconnected from the Live lineup panel at the top. Different statuses, possibly different actions.

**Fix:** Make the drawer (`LineupDrawer`) consume the same data + actions as Live lineup. Or remove the drawer and inline the lineup editor in Project tab.

**Acceptance:** One canonical lineup view. Whichever surface admin opens, same data, same actions.

---

### S0.4. Notifications RLS blocks insert on talent assignment — **P1 silent failure**

**Symptom:** Talent gets added successfully, server logs show `notifications` insert blocked by RLS policy. Talent will only see the job when they log in, not via notification surface.
**Impact:** Talent doesn't get the in-app notification ping.

**Fix path:**
1. Find the RLS policy on `notifications` table (in `supabase/migrations/`).
2. Engine writes notifications via `engine_emit_event` or `notifyUsers` listener — confirm whether it's calling under user auth or with SECURITY DEFINER.
3. Likely fix: SECURITY DEFINER on the notification-insert RPC, or update the policy to allow inserts when triggered by an inquiry event.

**Acceptance:** Adding a talent → notification row created with `recipient_user_id = talent_user_id` → talent sees it in NotificationsDrawer (once that's wired per A9) or via inbox unread badge.

---

### S0.5. `RESEND_API_KEY` missing in production check — **P1 ops**

**Symptom:** Locally, email notifications skipped due to missing `RESEND_API_KEY`. Fine for dev, but confirm production has it set.

**Action:** Verify `RESEND_API_KEY` is set in Vercel project env (production scope). Per `project_vercel_deployment.md`, confirm with `vercel env ls --scope oran-tenes-projects`.

---

### S0.6. Booking-only actions visible on inquiry state — **P1 mode gating**

**Symptom:** "Duplicate booking" button appears before any booking exists. Other booking-stage actions also leak into inquiry stage.

**Fix:** Gate all booking-stage actions behind `inquiry.status IN ('booked', 'converted', 'completed')`. If shown earlier, display tooltip: "Available after booking is created."

**Files:**
- `web/src/components/admin/shell/internal/messages.tsx` — search "Duplicate booking", "PaymentTab", "LogisticsTab", "BookingTab"
- Gate via the existing `stage` variable in `buildInquiryTabs`.

**Acceptance:** On an `inquiry` status row, booking-only actions are hidden or show locked-state tooltip with reason.

---

### S0.7. Status language inconsistency — **P2 vocabulary**

**Symptom:** Funnel chip says `Inquiry → Offer → Booked → Wrapped`. "Move to" menu has `Start review` and `Mark lost`. Two vocabularies.

**Fix:** Unify on ONE status model:
- Display: `Inquiry → Review → Offer → Booked → Wrapped` (or `Closed`)
- "Move to" menu options must match these labels exactly.
- Engine `inquiry_status` enum values are the source; UI labels should map deterministically.

**Files:**
- Search "Mark lost", "Start review" in `messages.tsx`
- Cross-reference with `inquiry_status` enum in `supabase/migrations/`

**Acceptance:** Same five (or four) words used everywhere — list, menu, badges, history.

---

### S0.8. Coordinator multi-tier UI (primary / secondary) — **P1 new feature**

**Per user direction:**
- Separate "Add coordinator" action from "Add talent" (don't conflate roles).
- Support secondary coordinators (multiple allowed) in addition to one primary.
- Promote a secondary to primary.
- Cannot remove primary without selecting a replacement.

**Engine state:** `inquiry_engine-coordinator.ts` has `assignCoordinator()` / `declineCoordinatorAssignment()`. Schema has `inquiry_participants.role='coordinator'` with unique-active-primary constraint.

**Schema gap:** Need to distinguish primary vs secondary. Either:
- Extend `inquiry_participants` with `coordinator_tier ENUM('primary','secondary')`, OR
- Use existing `inquiry_coordinators` legacy table that already has `role='primary'|'secondary'` (per audit findings).

**UI work:**
- Replace the unreachable Reassign modal (messages.tsx:6658–6794) with a Coordinator panel that lists primary + secondaries.
- Add coordinator picker (workspace staff search).
- Add "Promote to primary" + "Remove" actions, with the no-orphan-primary guard.

**Acceptance:** Admin can see 1 primary + N secondaries on an inquiry; can add/remove/promote without breaking the engine constraint.

---

### S0.9. Repeated "Reply to client" CTAs → contextual per-tab — **P2 polish**

**Symptom:** Bottom of every tab shows "Reply to client" even when tab context is Talent group / Offer / Project / Files.

**Fix:** Per-tab CTA:
- Client tab → **Reply to client**
- Talent group → **Message talent group**
- Offer → **Continue offer** (or **Save draft** / **Send to client**)
- Project → **Update project details** (only if any field changed)
- Files → **Upload file**

**Files:** `messages.tsx` — composer wrapper that renders per active tab.

---

### S0.10. "Next action" strip — **P2 navigation aid**

**Per user direction:** Compact strip at top of inquiry workspace showing the next operationally-required step.

Examples by stage:
- `submitted` → "Assign coordinator" / "Review brief"
- `coordination` (no talent) → "Add talent to lineup"
- `coordination` (talent invited, none accepted) → "Awaiting talent acceptance — N/M responded"
- `coordination` (≥1 accepted) → "Draft offer"
- `offer_pending` → "Awaiting client decision (sent X ago)"
- `approved` → "Convert to booking"
- `booked` (no call sheet) → "Create call sheet"
- `booked` (no payment) → "Request deposit"

**Files:** new `InquiryNextAction` component, mounted at top of `<AdminInquiryWorkspace>` (just below the funnel chip).

---

### S0.11. Message visibility labels — **P2 transparency**

**Per user direction:** Show who can see each message: "Visible to client" / "Internal" / "Talent group".

**Fix:** Add small subtitle/badge on each message bubble indicating thread type. Already known per thread — `thread_type IN ('client', 'talent', 'internal')`. Just surface it.

---

### S0.12. Project tab → full operational summary — **P2 information density**

**Per user direction:** Project tab should be the one-stop view:
- Venue / address (map embed)
- Schedule (date, call time, wrap, prep)
- Assigned talent (roster, statuses)
- Coordinator(s)
- Files (latest 3 + "see all")
- Notes (internal)
- Booking status + payment status (if booked)

Today it has lineup, coordinator, schedule, location — but lineup is mismatched (S0.2) and other sections aren't operationally rich enough.

---

### S0.13. Talent status badges — **P2 clarity**

**Per user direction:** Each talent row should clearly show status: `invited`, `accepted`, `held`, `declined`, `booked`.

**State:** `inquiry_participants.status` has `invited|active|declined|removed`. `held` is the new concept tied to S0.2 + B1 (availability/hold system). `booked` is implied when inquiry status is `booked` AND talent is `active`.

**Fix:** Add color-coded pill on each talent row in both Live lineup chip and Project tab roster.

---

### S0.14. Workflow visualization — **P2 onboarding**

**Per user direction:** Make the workflow explicit somewhere visible:
1. New inquiry
2. Review
3. Shortlist talent
4. Confirm availability
5. Draft offer
6. Send to client
7. Client approves
8. Convert to booking
9. Collect deposit / payment
10. Final payment / payout

**Fix:** Add to the funnel chip with all 10 steps, or a small linear progress indicator at the top of the inquiry workspace.

---

### S0.15. Offer auto-seed — **P1 friction removal**

**Per user direction:** When admin clicks "Start drafting offer", the offer should auto-seed with:
- Line items for each accepted talent (one row per talent).
- Inquiry's event date / location pre-filled.
- Workspace default rate / pricing unit per talent profile.
- Currency from workspace settings.

**Files:** `inquiry-engine-offers.ts:115` `createOffer()` — accepts initial line items but the action wrapper may not pass them. Confirm.

---

## Sprint 0 priority order (execution)

1. **S0.1** Fix offer-drafting hang (funnel blocker)
2. **S0.2** Fix Project tab talent mismatch (trust blocker)
3. **A6** Wire admin Add/Remove/Swap in drawer (already next on existing list)
4. **A5 / S0.8** Coordinator UI (Reassign modal + new primary/secondary panel)
5. **S0.4** Notifications RLS fix
6. **S0.6** Gate booking-only actions
7. **S0.5** Verify production `RESEND_API_KEY`
8. **S0.15** Offer auto-seed
9. **S0.7** Status language unification
10. **S0.3** Consolidate "View lineup" drawer
11. **S0.9-S0.14** UX polish

Original A1–A9, B1–B10, C1–C9 follow Sprint 0.

---

---

## A. Critical breakers (P0)

### A1. Admin "Create inquiry" form bypasses the engine

**File:** `web/src/lib/server-actions/admin-inquiries.ts:1412` (the manual-create path)
**Symptom:** Admin-created inquiries land in `status='new'` with NO `inquiry_participants` rows, NO default `requirement_group`, NO events emitted, NO notifications fired. Public/guest submissions correctly use `submitInquiry()`.
**Downstream effect:** Talent-add later fails because there's no requirement group (the M5.6 NOT NULL constraint). The defensive auto-create-requirement-group fallback at `inquiry-engine-roster.ts:139–155` covers this at runtime, but it's a band-aid; the root is admin-form bypass.

**Fix:**
- Route `web/src/components/admin/admin-new-inquiry-sheet.tsx` submission through `submitInquiry()` engine instead of direct DB insert.
- Verify initial `status='submitted'`, participant rows for client + auto-coordinator + invited talent, default requirement group.
- Keep the "find or create client" + "manual contact snapshot" sections — those are valid pre-engine work.

**Acceptance:**
- New admin-created inquiry has `inquiry_participants` rows for client + coordinator (status='invited').
- `inquiry_events` row written for `INQUIRY_SUBMITTED`.
- Adding a talent immediately after works without the auto-create-requirement-group fallback firing.

---

### A2. Client cannot accept, reject, or counter an offer

**Engine state:** ✅ Fully built. `clientAcceptOffer()` / `clientRejectOffer()` / `counterOffer()` all wired in `web/src/lib/inquiry/inquiry-engine-offers.ts`.
**UI state:** ❌ Zero. Client sees "Offer pending" badge on inquiry list, no buttons anywhere.
**Files to touch:** `web/src/app/(workspace)/[tenantSlug]/client/inquiries/[id]/page.tsx` — currently renders only message thread.

**Fix:**
- New component `ClientOfferPanel` on the inquiry detail page.
- Shows offer summary: total, line items (talent / pricing / units), notes, currency.
- Three buttons when `status==='offer_pending'`: **Accept** / **Counter** / **Decline**.
- Counter opens a textarea + "what would you change?" prompt; submits via `counterOffer()`.
- Decline opens a textarea + reason; submits via `clientRejectOffer()`.

**Acceptance:**
- Client can click Accept → inquiry moves to `approved` → engine emits event → admin sees real-time.
- Client can click Decline → offer marked rejected → inquiry returns to `coordination`.
- Counter creates a new draft offer, notifies coordinator, inquiry returns to `coordination`.

---

### A3. Client cannot see offer details

**Same surface as A2.** Bundle with it. Client inquiry detail must render: total client price, currency, line items (talent name + role + rate breakdown), coordinator fee (if disclosed to client per workspace setting), notes. Reuse the OfferTab data shape from `messages.tsx`.

---

### A4. Client cannot see which talent was matched

**File:** `web/src/app/(workspace)/[tenantSlug]/client/inquiries/[id]/page.tsx`
**Fix:** Render read-only talent roster strip above the thread. Avatars + names + (optional) acceptance status. Pull from `inquiry_participants` where `role='talent'` and `status IN ('invited', 'active')`.

**Acceptance:** Client sees who they're negotiating about.

---

### A5. Reassign Coordinator modal is built but unreachable

**File:** `web/src/components/admin/shell/internal/messages.tsx`
- Modal: lines 6658–6794 (picker, handoff note textarea, notify toggle, availability check) — production-ready
- Button: line 6879 — permanently `disabled` with title "Coordinator handoff needs a live reassignment workflow"
- Engine: ✅ `assignCoordinator()` in `web/src/lib/inquiry/inquiry-engine-coordinator.ts`

**Fix:**
1. Create server action `reassignCoordinatorAction` wrapping `assignCoordinator()`.
2. Remove `disabled` from the button at 6879; wire `onClick` to open modal, then submit via action.
3. On success: close modal, toast, post system message in talent thread ("[Name] is the new coordinator").

**Acceptance:** Admin reassigns coordinator end-to-end; talent thread shows system message; old coordinator no longer sees admin actions on inquiry.

---

### A6. Admin Add / Remove / Swap talent buttons are dead in the drawer

**File:** `web/src/components/admin/shell/internal/messages.tsx`
- Add talent: line 8249, disabled "Client talent requests need a live coordinator workflow"
- Swap: line 8261, disabled "Swap requests need a live coordinator workflow"
- Remove: line 13155, disabled "Use the live lineup manager to remove talent"
- Coordinator change request: line 6489, disabled "Coming soon"

**Engine + actions:** ✅ Already shipped:
- `web/src/lib/server-actions/admin-inquiry-roster.ts` — `rosterAddTalent`, `rosterRemoveParticipant`, `rosterMoveParticipant`
- `web/src/lib/inquiry/inquiry-engine-roster.ts`
- Standalone editor UI: `web/src/components/admin/inquiry-talent-editor.tsx`

**Fix:** Wire the dead buttons to call the existing actions. Either:
- Inline (preferred): replace `disabled` with handlers that open small picker modals.
- Or: clicking opens the existing `inquiry-talent-editor.tsx` in a sheet/drawer.

**Note on Swap:** No atomic engine action exists. Either:
- Make Swap = Remove + Add as two sequential calls (UX risk if first succeeds, second fails).
- Add a new `swapTalent()` engine call that does both inside one tx.

**Acceptance:** Admin clicks Add talent in drawer → picker → talent appears in roster → participant row created with `status='invited'` → talent inbox shows the invite.

---

### A7. No admin triage queue

**State:** New inquiries land in `/admin/messages` (which redirects from `/admin/work`). There's no `/admin/inquiries/new`, no triage board, no "new leads" widget. Admin can miss new inquiries.

**Fix:** New route `/admin/inquiries/inbox` (or extend Overview page):
- Lists inquiries with `status IN ('submitted', 'coordination')` ordered by `created_at DESC`.
- Each row: contact name, company, event date, requested talent count, time-since-submitted badge ("2h ago").
- Quick actions per row: **Assign coordinator** (if not auto-assigned), **Open**, **Snooze**.
- Empty state copy already exists from commit `0eadd5e5`.

**Acceptance:** New inquiry arrives → admin sees it on triage queue within 1 click of login.

---

### A8. Offer mutations don't `revalidatePath`

**File:** `web/src/lib/inquiry/inquiry-engine-offers.ts` — `updateOfferDraft`, `sendOffer`, `counterOffer`, `clientRejectOffer`
**Symptom:** Two admin tabs editing same inquiry → stale state with no warning. Or: client accepts in one tab, other client tab still shows "Offer pending".

**Fix:** Wrap each offer-mutating server action with `revalidatePath` for:
- `/${tenantSlug}/admin/messages` + `/${tenantSlug}/admin/inquiries/${id}` (or wherever the inquiry detail lives)
- `/${tenantSlug}/client/inquiries/${id}` + `/${tenantSlug}/client/inquiries`

Same pattern that `sendMessageAction` uses ([admin/messages/actions.ts:27](web/src/app/(workspace)/[tenantSlug]/admin/messages/actions.ts)).

**Acceptance:** Save offer in tab A → switch to tab B → see latest offer without manual refresh.

---

### A9. Notifications drawer is fixture data, not live

**File:** `web/src/components/admin/shell/internal/drawers.tsx` → `NotificationsDrawer()`
**State:** Reads hardcoded `NOTIFICATIONS` const. The `notifications` table is being written by events, but UI never queries it. "Demo · prototype data" badge was added; live wire-up wasn't.

**Fix:**
- Add server query `loadAdminNotifications(tenantSlug, userId, { limit, after })` → reads from `notifications` table.
- `NotificationsDrawer` accepts the list as prop instead of `NOTIFICATIONS` const.
- Add `markRead(notificationId)` action that updates `read_at`.
- Remove the demo badge once live.

**Acceptance:** Admin assigns coordinator → coordinator opens app → sees a real "You were assigned as coordinator on [Inquiry]" notification in drawer.

---

## B. Missing pipeline stages (P1)

### B1. No availability / hold system

**State:** Zero. Search for "hold" / "availability" returns nothing. Talent gets invited cold; two coordinators can lock the same talent for the same date and neither will know.
**Cost:** Visible only when both clients accept and you have to explain double-booking to one.

**Fix (scoped, MVP):**
- New table `talent_holds`: `id, talent_profile_id, inquiry_id, starts_at, ends_at, status (soft|firm|released), placed_by_user_id, expires_at, notes`.
- On `addTalentToRoster`: optionally create a soft hold (default off for free tier, default on for Studio/Agency).
- On `acceptTalentInvitation`: promote to firm hold.
- On `decline` / `roster_remove` / inquiry-archive: auto-release.
- Admin UI: "Check availability" button on roster picker that queries existing holds for date range.

**Acceptance:** Adding a talent already on firm hold for overlapping dates produces a clear warning with link to the conflicting inquiry.

---

### B2. No call sheet editor

**File:** `web/src/components/admin/shell/internal/messages.tsx:7645` — "Edit call sheet · Coming soon"
**State:** Schedule / call time / wrap / transport / hotel are stored as `pinned` JSONB on the conversation object. No `call_sheets` table.

**Fix:**
- Decision: stash in JSONB column on `agency_bookings.call_sheet_data` (cheap), or formalize a `call_sheets` table (cleaner for revisions/audit).
- Editor modal: time pickers, address autocomplete (already have Google Places per [project_location_input.md](~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_location_input.md)), transport text, lodging text, contacts list.
- Talent gets read-only view via `TalentLogisticsTab`.
- Re-emit notification on publish.

**Acceptance:** Admin edits call sheet on booked inquiry → talent sees updated details + gets notified.

---

### B3. No booking cancellation / reschedule

**State:** Only path is `archiveInquiry`. No reschedule, no post-booking talent swap, no fan-out notification.

**Fix:**
- `cancelBooking(bookingId, reason)` server action + RPC.
- `rescheduleBooking(bookingId, newStartsAt, newEndsAt, reason)`.
- Both fan out notifications to all participants.
- UI: dropdown menu on booking detail "Cancel" / "Reschedule" / "Change talent".

**Acceptance:** Admin cancels a booking → all participants get notification + system message; inquiry status reflects cancelled.

---

### B4. No post-booking close flow

**State:** Booking enum has `in_progress`, `completed` — nothing transitions to either. No completion checklist.

**Fix (minimal):**
- Add `completeBooking(bookingId, notes)` action.
- UI: "Mark complete" button on booking detail after `ends_at`.
- Optional: capture signed agreement upload, capture talent + client review fields (deferred).

**Acceptance:** Past-dated booking can be marked complete; status flips, downstream "Reach" / "repeat client" surfaces can read from it.

---

### B5. Stripe / payment automation

**State:** `booking_transactions.provider='manual'`. All transitions clicked by hand.
**Scope:** Big lift (3–5 days). Defer until A1–A9 + B1 + B2 land.

**Fix sketch:**
- Stripe Connect onboarding for workspace owners + talent payout accounts.
- `createPaymentIntent(bookingId)` action; client checkout flow.
- Webhook handler `/api/stripe/webhook` → updates `booking_transactions.status` on payment events.
- Invoice PDF generation (Resend supports attachments).

---

### B6. `duplicateBooking()` action exists, no UI

**File:** `web/src/components/admin/shell/internal/messages.tsx:837` — server action exists for rebooking.
**Fix:** Add "Duplicate" / "Rebook this client" button on closed-booking drawer and `/admin/bookings` list row.

---

### B7. No talent rate counter UI

**State:** `submitTalentRate()` exists in `inquiry-engine-offers.ts:454`. UI is accept-or-decline-invite only.
**Fix:** When talent accepts invite on an offer-stage inquiry, show "Your rate" inline editor on Offer tab. Talent submits rate → coordinator sees it on their offer draft.

---

### B8. No inquiry-received confirmation email to client

**File:** `web/src/lib/inquiry/inquiry-notifications.ts`
**State:** Three emails wired (offer sent, booking confirmed, talent invited). Inquiry-submitted has no email.

**Fix:** Add `sendInquiryReceivedNotification(inquiryId)` that fires on `INQUIRY_SUBMITTED` event. Subject: "We got your inquiry — [Company]". Body: reference number, summary of what they asked for, "what happens next" (24h response promise).

**Acceptance:** Client submits inquiry → confirmation email arrives within 1 minute.

---

### B9. No notification preferences UI

**State:** `user_prefs.notification_prefs` JSONB column exists. No settings page reads or writes it.
**Fix:** Add `/settings/notifications` for each role: toggle email + push per event type. Default all-on. Engine reads this before calling `notifyUsers()`.

---

### B10. Real-time only on messages, not events / status / participants

**State:** Supabase realtime subscribes to `inquiry_messages` in `_ParticipantThreadShell.tsx`. Status flips, new participants, offer state changes all require manual refresh.

**Fix:**
- Add subscription on `inquiry_events` filtered to current inquiry / participant.
- Add subscription on `inquiry_participants` (status changes — accept/decline visible in real-time to admin).
- Throttle: collapse rapid bursts to 1 update per 2s.

**Acceptance:** Talent clicks Accept → admin's open browser tab updates the talent's status badge within 2s without refresh.

---

## C. UI/UX polish sweep (P2)

### C1. Dead chrome — toast-or-die

Audit every `disabled` button in `web/src/components/admin/shell/internal/messages.tsx` + client layout + talent inbox.
**Policy:**
- If feature is < 2 weeks away: leave button visible, `toast.info("Coming in Phase X — [short reason]")` on click. NEVER silent.
- If > 2 weeks: hide the button entirely.
- No `disabled` without an explanatory tooltip.

**Specific dead buttons to address:**
- Admin: lines 6489, 7594, 8213, 14200, 14245
- Client: notification bell, help (?), EN/ES toggle in `web/src/app/(workspace)/[tenantSlug]/client/layout.tsx:270–289`
- Talent: messages.tsx:8145 (schedule send), 8090 (thread options menu), talent.tsx:7129 (snooze/pin/archive), talent.tsx:10092 (bulk action bar)

---

### C2. Mock data without "Demo" badges

`messages.tsx` uses `MOCK_CONVERSATIONS`, `MOCK_THREAD`, `MOCK_OFFER_FOR_CONV`, `MOCK_FILES_FOR_CONV`, `MY_TALENT_PROFILE`. Only NotificationsDrawer has the "Demo" badge.

**Fix:** Add the same prototype-data badge anywhere a `MOCK_*` const drives a visible surface. Or replace with real data + remove the const.

---

### C3. Silent offer-save failures

`updateOfferDraft` returns `{ success: false, conflict: true, reason: "version_conflict" }`. UI handler is optional, so saves can silently fail if caller forgets to handle it.

**Fix:** In `handleActionResult` (or wherever the offer drawer uses it), map `conflict: true` → modal: "Offer changed since you opened it. [Reload]". Don't lose user's local edits — let them copy to clipboard before reload.

---

### C4. Double-submit on accept/decline

**State:** Accept/decline buttons not optimistically disabled. User can click twice; first wins, second hits version conflict silently.
**Fix:** Set `pending` state + `disabled` + spinner on click. Re-enable on response or 10s timeout.

---

### C5. Rate-limited action UI

**State:** Engine returns `{ rateLimited: true, retryAfterMs }`. No UI uses it.
**Fix:** Toast with countdown "Try again in 14s" + disable button until ready.

---

### C6. Accessibility on message thread

**Gaps:** No `aria-live` on new messages, no `aria-busy` on async buttons, no live region on file-upload status. Edit-chrome got SR hints; messages didn't.
**Fix:**
- `<div role="log" aria-live="polite">` wrapping message list.
- `aria-busy={isSending}` on send button.
- `<span aria-live="polite">` on upload status line.

---

### C7. Mobile

- Offer builder is desktop-only — needs stacked card view at <768px.
- Admin inbox row breaks under 320px (gridTemplateColumns "1fr auto" wraps awkwardly).
- Client inquiry detail two-column layout has no flex-wrap; right rail collides on small screens.

---

### C8. Talent thread deep-link

**File:** `web/src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/page.tsx:10–17` — redirects to inbox.
**Fix:** Render the thread detail at that route. Sync URL to selected-thread state.

---

### C9. Empty + loading state gaps

- **Admin messages** thread: no skeleton while loading older messages (just a disabled button).
- **Client offer panel** (when built per A2): needs explicit empty state for "no active offer yet".
- **Talent offer detail**: no skeleton while offer hydrates.

---

## D. Coordinator + talent management matrix

| Operation | Engine | Action wrapper | UI | Status |
|---|---|---|---|---|
| Assign coordinator | ✅ `assignCoordinator()` | ❌ missing | ⚠️ modal built, unreachable | **A5** |
| Reassign coordinator | ✅ same | ❌ missing | ⚠️ same modal | **A5** |
| Remove coordinator | ✅ `declineCoordinatorAssignment()` | ❌ missing | ❌ no UI | Build small dropdown |
| Add talent to roster | ✅ | ✅ `rosterAddTalent` | ✅ editor + ❌ dead drawer button | **A6** |
| Remove talent | ✅ | ✅ `rosterRemoveParticipant` | ✅ editor + ❌ dead drawer button | **A6** |
| Reorder talent | ✅ | ✅ `rosterMoveParticipant` | ✅ in editor | OK |
| Swap talent (atomic) | ❌ | ❌ | ❌ dead button | New engine action |
| Promote talent → coordinator | ⚠️ schema allows, permission blocks | — | — | **Policy decision** |

**Policy note on talent → coordinator:**
- Schema allows the same `user_id` to hold both roles via `inquiry_participants`.
- Permission gate in `web/src/lib/inquiry/inquiry-permissions.ts:21` restricts `assign_coordinator` to `agency_staff` / `super_admin`.
- A talent who is *also* workspace staff (hybrid mode per [project_workspace_talent_hybrid.md](~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_workspace_talent_hybrid.md)) can coordinate.
- A pure talent (not staff) cannot. To allow this, either loosen the permission check or add a "staff associate" minor role.
- Recommend: keep current restriction; add to hybrid-mode build (Phase X).

---

## E. Helpers + features to add (delight + speed)

Not blocking but high ROI:

1. **Keyboard nav inbox**: `j`/`k` between threads, `r` reply, `e` archive, `Cmd+Enter` send.
2. **`@mentions`** in talent group thread → notify specific coordinator/talent.
3. **Saved canned replies** for admin — smart-reply chips currently only show on first open. Make persistent + editable per workspace.
4. **Inbox search** — currently no in-thread or cross-inquiry message search.
5. **"Mark all read"** bulk action wired to existing `inquiry_mark_thread_read` RPC.
6. **Browser tab unread badge** — `(3) Tulala` in `<title>`.
7. **Quick-assign coordinator chip** on every triage queue row.
8. **Talent quick-reply chips** in invite ("Accept", "Hold", "Decline — conflict") so they don't have to type.
9. **Offer template library** — admin saves frequently-used offer shape, one-click load.
10. **Inquiry → booking pre-flight checklist** that surfaces missing data (no event date, no rate, no talent accepted) before allowing convert.
11. **Drag-and-drop file attach** + actually wire the paperclip at `messages.tsx:14200`.
12. **Per-inquiry pinned summary** at top of thread — date, location, rate, status — so new participants don't scroll.
13. **Auto-archive N days post-completion** + "Reactivate" action.
14. **Repeat-client widget** — "You've booked Sara 3x for this client" on new inquiry intake.
15. **Public inquiry confirmation page** with reference number + "what happens next" copy.

---

## F. Execution order (recommended)

### Sprint 1 — Unblock the funnel (1–2 days)
Goal: a client can submit, see an offer, accept, and become a booking — all from the client UI.

1. **A1** — Fix admin Create inquiry to use engine (3h)
2. **A2 + A3 + A4** — Build client offer panel with roster strip (1d)
3. **A6** — Wire admin Add/Remove talent in drawer (2h)
4. **A5** — Wire Reassign Coordinator modal (2h)
5. **A8** — Add revalidatePath to offer mutations (1h)
6. **B8** — Inquiry-received confirmation email (1h)

### Sprint 2 — Triage + trust (1 day)
7. **A7** — Build admin triage queue (4h)
8. **A9** — Wire notifications drawer to live table (4h)
9. **C1** — Dead-chrome sweep: toast-or-hide (1h)
10. **C8** — Talent thread deep-link fix (1h)

### Sprint 3 — Real-time + robustness (1 day)
11. **B10** — Real-time on events + status (4h)
12. **C3 + C4 + C5** — Silent failure / double-submit / rate-limit fixes (3h)
13. **C6** — A11y sweep on message thread (1h)

### Sprint 4 — Pipeline depth (2–3 days)
14. **B2** — Call sheet editor (1d)
15. **B1** — Availability / hold system (2d)
16. **B3** — Booking cancel / reschedule (1d)
17. **B4** — Post-booking close flow (4h)
18. **B6** — Wire duplicateBooking UI (1h)
19. **B7** — Talent rate counter UI (4h)

### Sprint 5 — New features (5+ days)
20. **B5** — Stripe Connect (3–5d)
21. **B9** — Notification preferences UI (4h)
22. **C2** — Replace mock data with real OR mark with Demo badge (varies)
23. **C7** — Mobile passes on offer builder + inbox + client inquiry (1d)
24. Items from E (helpers) — pick top 5

---

## G. Agent handoff notes

### Per-item contract for agent prompts
When spawning an agent to fix a specific item, include:
1. The item code (A1, B2, etc.) and exact file paths from this doc.
2. The "Acceptance" criteria from this doc.
3. Reminder to: rebase first, single migration, TS+lint gate before commit, no force-push (per [CLAUDE.md](../../CLAUDE.md)).
4. Localhost-first QA (per [feedback_dev_workflow.md](~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/feedback_dev_workflow.md)).
5. Every async state visible (per [feedback_admin_edit_ux.md](~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/feedback_admin_edit_ux.md)).

### Cross-cutting QA checklist (every PR)
- [ ] Send/receive still works for admin, client, talent (smoke `web/e2e/smoke.spec.ts`).
- [ ] No new dead-chrome / disabled buttons without tooltip.
- [ ] `revalidatePath` called on mutating actions.
- [ ] System message emitted for state changes that participants should know about.
- [ ] No mock data introduced without "Demo" badge.
- [ ] `cd web && npx tsc --noEmit && npm run lint` clean.

---

## H. Out of scope (intentionally deferred)

- Reviews / testimonials capture (post-booking) — wait until A1–B7 land.
- Inbound API / public widget for inquiry submission — wait until SaaS multi-tenant Phase.
- Multi-language inquiry forms (EN/ES toggle in client header is dead chrome today) — deferred until i18n charter ratified.
- AI query interpretation on admin manual form — engine has `interpreted_query` column; no UI plumbing yet. Defer until Phase 6 skill targeting matures.

---

## I. References

**Source audits (all run 2026-05-12):**
- Admin messages audit
- Client messages audit
- Talent messages audit
- Coordinator + roster mgmt audit
- Inquiry creation + triage audit
- Talent assignment + offer audit
- Booking conversion + logistics audit
- Notifications + events audit
- Edge cases + error states audit

**Related memory:**
- `project_inquiry_flow_spec.md` — pipeline statuses, role behavior
- `project_client_dashboard_status.md` — client surface state
- `project_admin_workspace_vision.md` — admin operations console direction
- `feedback_admin_edit_ux.md` — every async state must be visible
- `feedback_dev_workflow.md` — localhost first
- `feedback_pre_launch_shipping.md` — ship straight to prod
- `project_workspace_talent_hybrid.md` — context for talent ↔ coordinator role overlap
- `project_trust_the_loop_audit.md` — prior cleanup landed 2026-05-12

**Related plans on disk:**
- `web/docs/builder-execution-plan-2026.md`
- `web/docs/builder-execution-batches.md`
- `web/docs/phase-0-qa-registered-host.md`
