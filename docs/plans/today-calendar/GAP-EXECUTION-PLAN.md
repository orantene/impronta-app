# Talent Agenda V2 — Gap closure execution plan

Audience: implementing agent (Cursor). Owner: Oran. Written 2026-09-24.
Parent plan: [`CURSOR-EXECUTION-PLAN.md`](./CURSOR-EXECUTION-PLAN.md). Audit source: post-Wave-8 review on `feat/tc-phase0`.

**Goal:** Close every critical and medium gap between “code-complete skeleton” and the parent plan’s definition of done. Do not invent new product scope. Do not write to live Jor.

---

## 0. Read this first

### 0.1 What already shipped (do not rebuild)

| Area | Status |
|---|---|
| `TALENT_AGENDA_V2` flag + allow-list | Done |
| `loadTalentAgenda` layout wiring (flag on only) | Done (incomplete fields — see G2) |
| Pure derive + Jor fixture numbers | Done |
| `TRADE_PROFILES` + trade-walk matrix | Done |
| Migration `20260924213837_talent_agenda_v2_phase1.sql` applied | Done |
| Today/Calendar/Attention/Availability V2 screens (structure) | Done |
| Mobile tab hide + safe-area sticky bars | Done |
| Legacy delete | Deferred — still [`ROLLOUT.md`](./ROLLOUT.md) Step 4 after ≥7d green |

### 0.2 Non-negotiable rules (same as parent)

- Branch off latest `origin/main`: `feat/tc-gap-<id>` (or continue on `feat/tc-phase0` only if the owner says so).
- One PR per task below. Merge in order within a phase.
- Gate: `cd web && npm run typecheck && npm run lint` (+ unit lanes touched). Never raw `tsc` / `eslint`.
- Migrations additive; `npm run db:push` before merge when a task adds SQL.
- Live QA writes nothing to real tenants. Seed / allow-list QA only.
- No em dashes in user-facing copy. Every new string EN + ES.
- Flag off leaves legacy pages unchanged.

### 0.3 Severity key

| Tag | Meaning |
|---|---|
| **P0** | Broken or falsely “done” — ships lies to the talent |
| **P1** | Plan incomplete — wrong numbers / missing attention / dead CTA |
| **P2** | Polish, process, fidelity |

---

## 1. Phase G0 — Stop the lies (P0)

Ship these before any beta allow-list expansion.

### G0.1 New booking writes a commercial record (**P0**)

**Problem:** `createOwnSlotBooking` inserts only `talent_bookings` and `void`s `paymentChoice`. No `agency_bookings`, no money, payment UI is fake.

**Do:**

1. Route New booking (and Rebook) through `createManualBooking` **or** extend `createOwnSlotBooking` to create `agency_bookings` + `booking_talent` + `talent_bookings` in one path (same busy check + alternatives as T1.2).
2. Honor `paymentChoice`:
   - `received` → set `payment_status` honestly (paid / partial rules) without inventing Stripe money
   - `request_link` → leave unpaid and surface “payment link still needed”
   - `due_later` → unpaid / due at appointment
3. Use buffer from `talent_booking_hours.buffer_after_min` (fallback trade profile), not hard-coded 15.

**Files:** `web/src/lib/talent-agenda/create-slot.ts`, `AgendaNewBooking.tsx`, `AgendaRebookSuggestion.tsx`, `admin-bookings.ts` if reused.

**Acceptance:**

- Success creates both commercial + calendar rows.
- Conflict returns ≤3 alternatives that fit length + buffer.
- Selecting “Record payment received” yields `payment_status` that `derivePaymentState` does not treat as `none`.
- Unit test: success both rows; conflict alternatives; paymentChoice not discarded.

**Tests:** extend create-slot / admin-bookings lane; fixture assert money on loaded item after save (QA seed or integration).

---

### G0.2 Hold convert is real (**P0**)

**Problem:** `AgendaHoldFlows.handleConvert` only sets a message. No booking is created.

**Do:**

1. Find or add the real convert path (existing hold → confirmed booking / `agency_bookings`). Prefer the scheduling engine path used elsewhere; do not invent a second one.
2. Wire `handleConvert` to that action with working / success / failure / back.
3. On success, item leaves hold state; Today/Attention refresh shows Confirmed.

**Files:** `AgendaHoldFlows.tsx`, hold / booking actions under `web/src/lib/talent-agenda/` or `talent-calendar/`.

**Acceptance:** Confirm on a QA hold creates a booking (or firm conversion) and updates the read model. Failure leaves the hold and shows why.

**Tests:** action unit/integration; HoldFlows no longer contains “Engine wiring in progress.”

---

### G0.3 Hold release uses the hold action (**P0**)

**Problem:** Release calls `cancelBookingWithRefund({ bookingId: holdId })`. Hold ids are not booking ids.

**Do:**

1. Call `releaseOwnTalentHold(holdId)` from `attention-actions.ts`.
2. Keep refund/cancel path only for real `agency_bookings` ids on the booking record.

**Files:** `AgendaHoldFlows.tsx` (and any peek CTA that releases holds).

**Acceptance:** Release deletes/expires the hold; calendar gap frees; no bogus booking cancel.

**Tests:** releaseOwnTalentHold already exists — add UI wiring test or static assert that HoldFlows imports `releaseOwnTalentHold`, not cancel-with-refund for holds.

---

## 2. Phase G1 — Read model completeness (P1)

Without these, numbers and Attention are wrong even when UI looks right.

### G1.1 Load travel, intake, payment links, reschedule requests

**Problem:** Migration columns/tables exist; `load.ts` does not select them. Travel never enters `occupiedInterval`. Intake attention never fires. Pending reschedules never appear. Hold-linked payment link expiry is weak.

**Do:**

1. Select `travel_before_min` / `travel_after_min` from agency (and/or talent_bookings); set `where.travelMin` (and before if the type supports it).
2. Select `intake_status` / `intake_sent_at`; populate `tradeSection` intake payload when pending.
3. Load `payment_links` for bookings/holds in range; feed `derivePaymentState` (awaiting / checking / expired).
4. Load `booking_reschedule_requests` where `status = 'pending'`; surface in `needsAttention` with a clear CTA.
5. Resolve agency display name (tenant/agency table) instead of hard-coded `"Agency"`.

**Files:** `load.ts`, `derive.ts` / `needsAttention`, types if needed.

**Acceptance:**

- Free gaps shrink when travel is set.
- Pending intake appears in Needs attention.
- Pending reschedule appears in Needs attention.
- Agency chip shows real name when available.

**Tests:** unit with fixture rows; extend `jor-week` or add a small load-mapper test with fake rows (no live DB required for mapper).

---

### G1.2 Buffer / hours in conflict check

**Problem:** create-slot pads with 15 min always.

**Do:** Read hours for the talent; use `buffer_after_min` (and trade default). Document override when hours missing.

**Depends on:** G0.1 (same code path).

**Acceptance:** Masseuse with 20 min buffer gets 20 min padding in conflict + alternatives.

---

## 3. Phase G2 — Money and quote honesty (P1)

### G2.1 Finish and collect — transfer + card

**Problem:** Transfer copy says “awaiting” but nothing is written. Card never opens `/pay/[code]` or creates a link. Cash uses `payment_status` only (acceptable if labeled honestly; plan preferred `settleAtDoor` when POS/order exists).

**Do:**

1. **Cash:** Keep honest talent cash settle **or** call `settleAtDoor` when a door/order shell exists for that booking; never invent Stripe money. Copy must match the path.
2. **Transfer:** Write an explicit awaiting state (transaction or payment_status + history note). Second action “Mark transfer received” → paid.
3. **Card:** Create/reuse payment link via existing `createPaymentLink`; show link/QR; open secure page on talent phone; webhook still confirms.

**Files:** `AgendaFinishCollect.tsx`, `booking-actions.ts`, payments helpers.

**Acceptance:** Each method has working / success / failure / back. Transfer unfinished ≠ overdue-by-complete unless “Not paid yet” was chosen.

**Tests:** action tests per method; no screenshot-only “done.”

---

### G2.2 Event + project quotes write real offers

**Problem:** Event quote optionally blocks a date; no `inquiry_offers`. Project quote is local status text.

**Do:**

1. Event (`T7.2`): create offer via existing `inquiry_offers` path; optional hold/prep blocks only as designed.
2. Project (`T7.3`): draft offer + deliverables with `due_at`; no appointment row.
3. Status copy: nothing reserved until accept (except optional hold).

**Files:** `AgendaQuotes.tsx`, server actions for offers/deliverables.

**Acceptance:** DB rows exist after Send; Calendar/Today show project deadlines when due_at set.

---

### G2.3 Pay request currency + copy

**Problem:** “Amount (USD)” while tenants often use MXN; `$` hard-coded in reschedule fee.

**Do:** Use booking/tenant currency code and symbol helper already used elsewhere. EN/ES strings via agenda catalog.

---

## 4. Phase G3 — Record, CTAs, i18n (P1)

### G3.1 Booking record uses `TradeSections`

**Problem:** Inline key→value dump; plan §T6.4 wants section renderers (event, performance, intake+resend, estimate, project, tz).

**Do:** Replace crude renderer with `TradeSections.tsx`. Wire intake resend action. Show both talent + client times when `clientTz` set.

**Acceptance:** Chef/dancer/design records show the right section fields from load payload; no trade-name `if` in the page.

---

### G3.2 No-show UI gated until start

**Problem:** Server blocks early; More menu still offers Mark no-show.

**Do:** Disable with reason beside the control until `starts_at < now` (use agenda clock helper). Destructive stays under More.

---

### G3.3 Flow screens i18n (EN + ES)

**Problem:** New booking, Finish/collect, Holds, Quotes, Reschedule, Rebook, Pay request are English-only. Calendar list chips hard-code “All / Requests / …”.

**Do:** Route every user-visible string through `useAgendaCopy` / `agenda-i18n` (and shell catalog where shared). Run `verify:ui-messages` if the key catalog is used for new keys.

**Acceptance:** Toggle ES — no English leftovers on those screens for catalogued keys.

---

### G3.4 Focused flows use `TaskShell`

**Problem:** `TaskShell` exists; Finish/collect, Hold, Reschedule, Pay, Rebook build ad-hoc wrappers.

**Do:** Wrap each focused flow in `TaskShell` (ModalShell ≥720, full-screen below). Keep safe-area sticky actions.

---

## 5. Phase G4 — Fixtures, evidence, process (P2)

### G4.1 Per-trade fixtures

**Problem:** Only `jor-week` (beauty). Parent §2.2 asked for TR.* weeks.

**Do:** Port one week fixture per trade kind (or minimal day that hits that trade’s sections). Assert trade-walk + one derive smoke per kind. Still no live Jor writes.

---

### G4.2 Replace shallow “journey” unit stubs

**Problem:** `journeys.test.ts` includes `Array.slice` contract theater.

**Do:** Delete shallow stubs. Add real unit/integration covering:

- accept request → attention count drops (derive + action)
- createOwnSlot / createManual conflict → alternatives
- release hold via `releaseOwnTalentHold`
- cash collect updates payment state
- cancel refund preview surfaces cents

---

### G4.3 Playwright with QA creds + evidence

**Problem:** Specs skip without `QA_TALENT_*`; CI never proves journeys.

**Do:**

1. Document required env in `ROLLOUT.md` Step 0.
2. Run smoke + T9.5 journeys on seeded QA; screenshots under `docs/plans/program/evidence/today-calendar/`.
3. Optional: CI job that runs only when secrets present (skip otherwise remains OK for open PRs).

---

### G4.4 Clean leftover placeholder money copy

**Problem:** `view-model.ts` still has “Phase 4” / “No data yet” helpers. Today mostly overrides via earnings — remove dead placeholders or mark internal-only.

---

### G4.5 Process note (not a code PR)

Parent plan said one PR per task; Wave 0–8 landed as one mega-branch. Going forward: **one gap task = one PR**. Prefer stacking `feat/tc-gap-g0-1` … rather than another omnibus.

---

## 6. Phase G5 — Rollout readiness (unchanged contract)

After G0–G3 are green on QA allow-list:

1. Owner reviews evidence screenshots vs PDF (parent DoD).
2. Follow [`ROLLOUT.md`](./ROLLOUT.md) Steps 1–3 (beta → all → Jor read-only click-through).
3. Step 4 (delete legacy) remains a **separate PR** after ≥7 days green — not part of gap closure.

---

## 7. Ordered checklist (merge order)

```
G0.1 New booking commercial record + paymentChoice + real buffer
G0.2 Hold convert real
G0.3 Hold release → releaseOwnTalentHold
G1.1 load.ts travel / intake / payment_links / reschedule / agency name
G1.2 (if not folded into G0.1) buffer from hours
G2.1 Finish & collect transfer + card (+ cash honesty)
G2.2 Event + project quotes → inquiry_offers / deliverables
G2.3 Currency labels
G3.1 TradeSections on record
G3.2 No-show UI gate
G3.3 Flow i18n
G3.4 TaskShell on focused flows
G4.1 Per-trade fixtures
G4.2 Real journey unit tests
G4.3 Playwright evidence
G4.4 Placeholder money cleanup
G5   Rollout per ROLLOUT.md (no legacy delete yet)
```

Parallelism: G3.* can parallel after G1.1. G4.* can parallel after G0. G2.2 can parallel G2.1 after G0.

---

## 8. Definition of done (gap closure)

- No scaffold messages on Confirm hold / New booking payment.
- New booking always has a commercial row when save succeeds.
- Hold release never calls booking-cancel with a hold id.
- Loader feeds travel, intake, payment links, pending reschedules; Attention reflects them.
- Finish & collect methods match their copy end to end.
- Quotes create real offer/deliverable rows.
- Record uses TradeSections; no-show disabled before start with reason.
- Flow screens EN+ES; focused flows use TaskShell.
- Shallow journey stubs gone; Playwright evidence captured at least once on QA.
- Flag off still unchanged. Legacy delete still deferred.

---

## 9. Out of scope (explicit)

- Deleting legacy Today/Calendar (ROLLOUT Step 4).
- Tap to Pay, session packages, couples massage, milestone payments, time tracking (parent §4 — stay `notSupported`).
- Writing to live Jor.
- Visual PDF 1:1 pixel pass beyond fixing structural lies (schedule a separate visual QA pass after G3).
