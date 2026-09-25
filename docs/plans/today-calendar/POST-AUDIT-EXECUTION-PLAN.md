# Post-audit execution plan — Agenda V2 honesty + Services unblock

Audience: implementing agent (Cursor). Owner: Oran. Written 2026-09-24.
Sources: honesty audit on `feat/tc-phase0` @ `450cb77c4`; Services PR [#2244](https://github.com/orantene/impronta-app/pull/2244); Agenda PR [#2245](https://github.com/orantene/impronta-app/pull/2245).
Parent plans: [`GAP-EXECUTION-PLAN.md`](./GAP-EXECUTION-PLAN.md), [`CURSOR-EXECUTION-PLAN.md`](./CURSOR-EXECUTION-PLAN.md), [`ROLLOUT.md`](./ROLLOUT.md), Services worktree `docs/plans/services-rebuild/`.

**Goal:** Close every P0/P1 gap the audit found before beta allow-list expansion. Demote premature DONE stamps. Do not invent product scope. Do not write to live Jor. Phase 7 live-band swap only after an explicit owner “swap.”

**Branching:** Continue on `feat/tc-phase0` for Agenda tasks (owner already using this branch), **or** cut `feat/tc-audit-<id>` off latest `origin/main` after #2244 merges. Services fixes stay on `feat/services-rebuild` until #2244 is green and merged. One PR per phase below when practical; P0 may ship as one PR.

**Gates (every commit):** `cd web && npm run typecheck && npm run lint` + the unit files you touch. Never raw `tsc` / `eslint`.

---

## 0. Status snapshot (do not skip)

| Track | State | Blocker |
|---|---|---|
| Services [#2244](https://github.com/orantene/impronta-app/pull/2244) | OPEN; Structural **FAIL**; Talent Website E2E **FAIL** | Must green Structural before merge |
| Agenda [#2245](https://github.com/orantene/impronta-app/pull/2245) | OPEN; tip `450cb77c4` | Local: 1 failing unit (`g2-finish-collect`); P0 honesty/security below |
| Services P7 live `#servicios` | Not started | Explicit owner “swap” only |
| Gap plan G0–G4 “DONE” | Overstated | This plan supersedes those stamps until A0–A3 green |

Premature DONE in [`GAP-EXECUTION-PLAN.md`](./GAP-EXECUTION-PLAN.md) and [`ROLLOUT.md`](./ROLLOUT.md) Step 0 “G0–G4 code ready” must be demoted as part of **A5.1** (below: A3.3).

---

## Severity key

| Tag | Meaning |
|---|---|
| **P0** | Security hole or product lie — do not expand allow-list |
| **P1** | Acceptance incomplete — wrong numbers / dead CTA / incomplete i18n |
| **P2** | Process, evidence, polish |

---

## Track A — Agenda honesty (primary)

### Phase A0 — Stop the lies and close the holes (**P0**)

Ship before any other Agenda polish and before ROLLOUT Step 1.

#### A0.1 Ownership on every booking writer (**P0**)

**Problem:** `booking-actions.ts` exports service-role mutators with no `getUser` / talent ownership check. UI calls them directly (`AgendaFinishCollect`, `AgendaBookingRecord`). Any authenticated caller who can invoke the action can mutate any `agency_bookings` id.

**Do:**

1. Add a shared `assertTalentOwnsBooking(bookingId)` (via `booking_talent` + signed-in talent profile), same pattern as `attention-actions.ts`.
2. Call it at the top of: `markBookingNoShow`, `completeBooking`, `recordBookingCashCollected`, `recordBookingTransferAwaiting`, `markBookingTransferReceived`, `createAgendaBookingPayLink`.
3. Prefer exporting only `*Own*` wrappers from the barrel; keep raw writers private or server-internal.
4. Unit/static test: foreign `bookingId` → `unauthorized`.

**Files:** `web/src/lib/talent-agenda/booking-actions.ts`, `attention-actions.ts`, `index.ts`, UI imports if wrappers change.

**Acceptance:** Unsigned or other-talent `bookingId` cannot complete / cash / transfer / no-show / mint pay link. Own booking still works.

---

#### A0.2 Scope `talent_bookings` mirrors by id (**P0**)

**Problem:** No-show and complete update `talent_bookings` by ±1 minute `starts_at` window with no `id` / `talent_profile_id` filter — can flip unrelated talents’ rows.

**Do:**

1. Update by `talent_bookings.id = bookingId` (shared id with `agency_bookings`) and/or `.eq("talent_profile_id", …)`.
2. Remove global time-window updates.
3. Test: two fixtures same start minute → only the target row flips.

**Files:** `booking-actions.ts`.

**Acceptance:** Completing booking A never changes booking B’s calendar row.

---

#### A0.3 `request_link` honesty (**P0**)

**Problem:** New booking “Request a payment link” only writes an internal note. No link, no Attention CTA.

**Do (pick one path; do not leave the radio as-is):**

- **Preferred:** After commercial insert, mint link when `order_id` exists **or** create the minimal order shell then mint via `createAgendaBookingPayLink` / `createPaymentLink`; surface URL in success UI; leave unpaid until paid.
- **Fallback:** Rename choice + copy to “I’ll collect later / request a link later” and remove any implication that a link was created.

**Files:** `create-slot.ts`, `AgendaNewBooking.tsx`, possibly pay-link helpers.

**Acceptance:** Selecting the payment-link choice either produces a real `/pay/<code>` URL, or the UI never claims a link was created.

---

#### A0.4 Adjust lines: persist or remove (**P0**)

**Problem:** Finish & collect UI collects adjustment lines; `completeBooking` does `void input.adjustLines` while copy says they are recorded.

**Do (pick one):**

- **Persist:** Write lines to the commercial record (invoice/line table already used elsewhere, or `agency_bookings` notes + total adjust with honest money math).
- **Remove:** Drop the Adjust lines UI and copy until a real writer exists.

**Files:** `AgendaFinishCollect.tsx`, `booking-actions.ts`.

**Acceptance:** No UI that claims lines were recorded when the server discarded them.

---

#### A0.5 Fix broken unit assert (**P0** / gate)

**Problem:** `g2-finish-collect.test.ts` expects `/no_order|No order/`; UI now uses `copy.t("Card needs a linked order")`. Suite fails 1 test.

**Do:** Update assert to the current key/string; keep asserts for transfer + pay-link writers.

**Acceptance:** `npx tsx --test src/lib/talent-agenda/g2-finish-collect.test.ts` passes.

---

### Phase A1 — Finish, quotes, attention (**P1**)

#### A1.1 Card finish path for manual bookings (**P1**)

**Problem:** Manual slots never set `order_id` → Finish & collect Card always “needs linked order.”

**Do:**

1. On create-slot (and convert-hold if needed), attach or create an order shell when payment may be collected online; **or**
2. Finish Card creates the order then mints the link in one action; show URL/QR on success.

**Acceptance:** A QA manual booking can complete with Card and get a live `/pay/<code>` without a prior POS order.

---

#### A1.2 Mark transfer received only for transfers (**P1**)

**Problem:** Button shows for any `completed` + `awaiting_deposit` (open card links too).

**Do:** Gate on `payment_method === "transfer"` (pass through view-model from load) or history/trade payload. Hide for card-awaiting.

**Files:** `load.ts`, `view-model.ts`, `AgendaBookingRecord.tsx`, types if needed.

**Acceptance:** Open pay-link awaiting does not show “Mark transfer received.”

---

#### A1.3 Project quote deadlines on Calendar/Today (**P1**)

**Problem:** `createOwnProjectQuote` inserts `booking_deliverables.due_at` but `loadTalentAgenda` only loads deliverables for `talent_bookings` ids in range — project drafts have no calendar mirror → deadlines never appear.

**Do:**

1. Load deliverables for the talent via `booking_talent` join (not only talent_bookings ids); **or**
2. Create a non-blocking calendar/deadline row on quote save; **or**
3. Add a dedicated query: deliverables for bookings where talent is on `booking_talent`.

**Acceptance:** After Send on a project quote with a due date, Today/Calendar show a deadline item in range.

---

#### A1.4 Event quote is a draft, not a send (**P1**)

**Problem:** Fake `Quote draft` / `@tulala.local` contact; button says “Send quote.”

**Do:** Rename to “Save draft” (EN+ES) until a real client contact + send path exists; or collect real client name/email and use the existing inquiry send path.

**Acceptance:** Copy matches what the DB write does. No pretend client email in production paths without labeling as draft.

---

#### A1.5 Attention CTAs for intake + reschedule (**P1**)

**Problem:** Items rank in `needsAttention` but `resolveAttentionCta` has no intake/reschedule kinds → generic Open.

**Do:** Add CTA kinds + labels (view intake / resend when wired; respond to reschedule). Wire peek/Today primary action.

**Files:** `attention-cta.ts`, Today/Attention UI, `agenda-i18n.ts`.

**Acceptance:** Pending intake and pending reschedule show a specific CTA, not only Open.

---

#### A1.6 Intake Resend: wire or remove (**P1**)

**Problem:** TradeSections shows Resend; load never sets `resendUrl`.

**Do:** Implement resend action + payload fields, **or** hide Resend until the form link exists.

**Acceptance:** No dead Resend control on record.

---

#### A1.7 Talent-safe cancel (**P1**)

**Problem:** Booking record Cancel calls staff-only `cancelBookingSetAction` → fails for talent.

**Do:** Talent-owned cancel (reuse engine with talent auth) **or** hide Cancel with honest reason until the path exists.

**Acceptance:** Talent Cancel either works end-to-end or is not offered.

---

#### A1.8 Travel before ≠ after (**P1**)

**Problem:** `travelMin = max(before, after)` pads both sides of `occupiedInterval`.

**Do:** Extend occupied interval to use `travelBeforeMin` and `travelAfterMin` (types + derive + load), or document single-field semantics and store only one pad intentionally.

**Acceptance:** Free gaps shrink correctly when only before or only after is set.

---

### Phase A2 — i18n, shell, currency (**P1**)

#### A2.1 Currency labels everywhere (**P1**)

**Do:**

1. Remove leftover EN key `"Amount (USD)"` or make EN say MXN/tenant currency.
2. Replace `$` hard-codes on Finish lines, cancel/refund copy, reschedule fee with currency helper / booking currency.
3. Prefer tenant/booking `currency_code` on creates (not always `"MXN"`) when known.

**Files:** `agenda-i18n.ts`, `AgendaFinishCollect.tsx`, `AgendaBookingRecord.tsx`, `AgendaRescheduleSheet.tsx`, create-slot/quote inserts.

**Acceptance:** Toggle ES — no “USD” leftovers on pay/finish/cancel. Amounts show the booking currency.

---

#### A2.2 Finish G3.3 flow i18n (**P1**)

**Do:** Route Quotes, Rebook, BookingRecord chrome (`Message`, `Accept`, `When`, `Finish and collect`, quote form labels) and calendar list chips (`Requests ${n}`) through `useAgendaCopy` / catalog. EN + ES. No em dashes in user-facing strings.

**Acceptance:** ES walk of New / Finish / Hold / Pay / Quotes / Reschedule / Rebook / Record — no English leftovers for catalogued keys.

---

#### A2.3 Finish G3.4 TaskShell (**P1**)

**Do:** Wrap New booking, Quotes, Rebook in `TaskShell` (same pattern as Finish/Hold/Pay/Reschedule). Extend `g3-polish.static.test.ts`.

**Acceptance:** All focused flows use TaskShell; safe-area sticky actions preserved.

---

### Phase A3 — Tests and evidence (**P1/P2**)

#### A3.1 Replace static-only contracts with real behavior tests (**P1**)

**Do:**

| Topic | Minimum test |
|---|---|
| Ownership | Foreign bookingId → unauthorized |
| Mirror scope | Only target `talent_bookings` row updates |
| Transfer ≠ overdue | Keep derive test; add load-mapper with `payment_method=transfer` |
| Project deadline | Fixture/load path shows deadline when due_at set |
| Adjust lines | Persist asserted **or** UI absence asserted |

Delete or shrink pure `readFileSync` theater where a real test now covers the claim.

---

#### A3.2 Playwright evidence once (**P2**)

**Do:** Run `e2e/talent-agenda-smoke.spec.ts` with QA creds; land screenshots under `docs/plans/program/evidence/today-calendar/`. Check ROLLOUT Step 0 Playwright box only after that.

**Acceptance:** At least one PNG set committed; README not the only file in the evidence folder.

---

#### A3.3 Demote DONE stamps (**P2**)

**Do:**

1. In [`GAP-EXECUTION-PLAN.md`](./GAP-EXECUTION-PLAN.md), change overstated DONE headers to `PARTIAL — see POST-AUDIT-EXECUTION-PLAN.md` for G0.1, G1.1, G2.1–G2.3, G3.1, G3.3–G3.4, G4.2–G4.3.
2. In [`ROLLOUT.md`](./ROLLOUT.md), uncheck “Gap closure G0–G4” until A0–A2 green; leave Playwright unchecked until A3.2.

**Acceptance:** Docs no longer claim ship-ready for items this plan still owns.

---

### Phase A4 — Rollout (unchanged contract)

Only after A0–A2 green on QA allow-list:

1. Owner review vs prototype PDF.
2. [`ROLLOUT.md`](./ROLLOUT.md) Steps 1–3 (beta → all → Jor **read-only**).
3. Step 4 legacy delete = separate PR after ≥7 days green.

---

## Track B — Services unblock (parallel)

### B0.1 Diagnose and fix #2244 Structural failure (**P0** for merge)

**Do:**

1. Open Structural run log for PR #2244; identify failing lane (typecheck / lint / enrolled unit / size ratchet / etc.).
2. Fix on `feat/services-rebuild`; push; wait for Structural **SUCCESS**.
3. Talent Website E2E: if failures are timeouts/chunk-load only, note flake in PR; do not block merge unless Structural or required checks demand green E2E. Re-run once if flake-only.

**Acceptance:** Structural green; PR mergeable under branch rules.

---

### B0.2 Merge #2244 then rebase Agenda (**P1**)

**Do:**

1. Merge #2244 to `main` when Structural green.
2. `git fetch origin && git rebase origin/main` on `feat/tc-phase0` (or recreate branch).
3. Resolve conflicts; re-run typecheck/lint; push #2245.

**Acceptance:** Agenda branch contains services marathon; both trees compile.

---

### B0.3 Keep junk out of PRs (**P2**)

**Do:** Do not commit `supabase/migrations/20261231284000_services_rebuild.sql` unless it is a real reviewed migration. Park under `.tmp` or delete if orphaned from the marathon. Do not commit prototype HTML/PDF.

---

### B1 — Phase 7 live band (only after owner says “swap”) (**P1** gated)

**Do (exact owner instruction required):**

1. Swap Jor live `#servicios` → `services_catalog` (fingerprint baseline / restore on failure — follow Services REPORT / marathon; restore commit `79ef2414` if that remains the documented rollback).
2. Verify Select opens CatalogBookingSheet.
3. Record post-swap fingerprint + evidence.
4. On failure: restore previous band immediately; stop.

**Acceptance:** Live Select books through catalog sheet; or band restored and incident noted. No silent half-swap.

---

## Ordered checklist (merge order)

```
A0.5  Fix g2-finish-collect assert (unblocks CI confidence)
A0.1  Ownership on booking-actions
A0.2  talent_bookings mirror by id
A0.3  request_link honesty
A0.4  Adjust lines persist or remove
B0.1  #2244 Structural green
B0.2  Merge #2244; rebase #2245
A1.1  Card finish + order shell
A1.2  Transfer-only Mark received
A1.3  Project deadlines in load
A1.4  Event quote draft copy
A1.5  Attention CTAs intake/reschedule
A1.6  Intake Resend wire or hide
A1.7  Talent-safe cancel
A1.8  Travel before/after
A2.1  Currency cleanup
A2.2  Remaining flow i18n
A2.3  TaskShell on New/Quotes/Rebook
A3.1  Real unit/integration tests
A3.2  Playwright evidence
A3.3  Demote DONE stamps in GAP + ROLLOUT
A4    ROLLOUT Steps 1–3
B1    Services P7 swap (explicit “swap” only)
```

**Parallelism:** B0.* can run alongside A0.*. A1.4–A1.8 can parallel after A0. A2.* after A1.1–A1.3. A3.2 needs QA creds. B1 never parallels anything that writes Jor.

---

## Definition of done (this plan)

- No exported booking writer without talent ownership.
- No `talent_bookings` updates by naked time window.
- No payment-link / adjust-line / intake-resend UI that lies.
- Project due dates appear on agenda when set.
- Attention CTAs match intake/reschedule urgency.
- Finish Card works for a manual QA booking (or Card is hidden with reason).
- EN+ES on all focused flows; currency labels honest.
- Agenda unit lane green including ownership tests.
- Playwright evidence landed once.
- GAP/ROLLOUT docs match reality.
- #2244 merged or superseded; #2245 rebase-clean.
- Services P7 only after explicit swap; restore path proven if swap fails.
- Flag off still unchanged. Legacy delete still deferred. No live Jor writes except owner-directed P7.

---

## Out of scope (do not pull in)

- Deleting legacy Today/Calendar (ROLLOUT Step 4).
- New product surfaces not in the prototype.
- Inventing Stripe money or settling without a real path.
- Writing to Jor home / `#servicios` without “swap.”
- Force-pushing `main` or bypassing Structural.
