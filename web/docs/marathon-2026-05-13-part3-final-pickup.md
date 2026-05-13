# Marathon 2026-05-13 (part 3) — final pickup note

**Branch:** `phase-1`
**End-of-session improvement-plan scorecard:** see below. Originally 28 audit items + Sprint 0 P0s; almost all are closed or accounted for.

## What shipped this marathon (across all 3 legs)

**Sprint 0 (live-test P0s — landed in earlier sessions):**
- S0.1 offer drafting hang (RLS bypass + Promise.race timeout)
- S0.2 Project tab talent mismatch (`useLiveLineupOverride` hook)
- S0.4 notifications RLS (SECURITY DEFINER RPC)
- S0.6 booking-gate on action chrome
- S0.7 status menu vocabulary

**A-series:**
- ✅ A1 — admin manual inquiry now emits `INQUIRY_SUBMITTED`
- ✅ A2 / A3 / A4 — client offer surface (shipped as Phase A PR 4)
- ✅ A5 — Reassign Coordinator wired
- ✅ A6 — verified false flag (audit line refs were stale)
- ✅ A8 — `revalidatePath` on offer mutations
- ✅ A9 — admin notifications bell on real `user_notifications`

**B-series:**
- ✅ B1 — talent holds engine + admin pipeline wrappers
- ✅ B3 — booking cancel + reschedule engine actions
- ✅ B4 — booking close (wrap) engine action
- ✅ B6 — duplicateBooking UI already wired (verified)
- ✅ B7 — talent counter-rate signal action
- ✅ B9 — notification prefs UI already shipped (verified)
- ✅ B10 — realtime refresh on client thread

**C-series:**
- ✅ C1 — dead-chrome sweep (5 "Coming soon" buttons → toast)
- ✅ C3 — silent load-failure paths now toast
- ✅ C4 — Accept/Decline double-submit guards
- ✅ C5 — rate-limited retry-after copy
- ✅ C6 — a11y on ReservationThread (Sheet + Pill)
- ✅ C7 — mobile polish (swipe-down dismiss, drag handle)
- ✅ C8 — talent thread deep-link (PinThenRedirect bridge)
- ✅ C9 — empty + loading state skeletons

## Still open (deliberately deferred)

These two are too large for a clean shipping rhythm — they need dedicated focused PRs, not in-marathon work.

### A7 — Admin triage queue
**Why deferred:** This is a new TOP-LEVEL surface for the admin shell — a sortable list of inquiries that need a coordinator's eye, ordered by SLA urgency. It needs:
- A new page route under `/admin/triage` (or a Triage tab in the existing admin shell)
- A view-model that aggregates `inquiries` rows + their `inquiry_participants` + last-activity timestamps + SLA computation
- A UI grid with bulk-action support (assign / archive / nudge — already partially built in messages.tsx bulk toolbar)
- Read RLS already handled (`is_staff_of_tenant`)

**Scope estimate:** ~6-8 hours focused work. Best done as its own PR.

**Where to start:** Look at the existing bulk-action selection mode in `messages.tsx` (around line 2150 — `bulkNudgeInquiries`, `bulkReassignInquiriesToMe`, `bulkSetInquiryArchived`). The triage queue should be a NEW surface that shows the same rows in a denser, SLA-sorted layout. Reuse those actions.

### B2 — Call sheet editor
**Why deferred:** Even bigger build. A call sheet is a structured document with:
- Date / time blocks (call time, wrap time, breaks)
- Locations (venue, parking, holding, hair/makeup)
- Contact list (coordinator, photographer, MUA, talent contacts)
- Talent line items with their individual call times
- Transport notes
- File attachments (mood board, references, contracts)

Today the audit's mark for B2 is the dashed "Coming soon" button I shipped in C1 — when tapped it toasts "Production sheet editor lands with the calendar pipeline." That toast is the contract — when the editor ships, it lives on the booking detail page (not the inquiry page) and renders/exports a printable PDF callsheet.

**Scope estimate:** ~8-12 hours for v1 (without PDF export — that's another 2-3 hours).

**Where to start:**
1. Schema: new tables `call_sheets`, `call_sheet_time_blocks`, `call_sheet_contacts`. Or simpler v1: a single JSONB column on `agency_bookings.call_sheet_payload` with a schema validated at the action layer.
2. New surface: `web/src/app/(workspace)/[tenantSlug]/admin/bookings/[id]/call-sheet/page.tsx` (RSC) + a client editor.
3. Reuse `LogisticsTab` data where it overlaps (call_time, wrap_time, location).
4. Hook the "Edit call sheet" button in `LogisticsTab` to navigate there (replacing the C1 toast).

## What's blocked

- **B5 — Stripe automation** — needs Stripe Connect platform application + KYC + live keys + webhook endpoint configuration. Documented at length in `marathon-2026-05-13-part2-pickup-note.md`.
- **B8 — Inquiry-received confirmation email** — needs `RESEND_API_KEY` in production env vars + email-template wiring.
- **Phase D — Trust** — needs Stripe Identity setup.

## Phase scorecard

| Phase | Status |
|-------|--------|
| **A — Thread** | ✅ Complete |
| **B — Money** | 🟡 Foundation + commission engine done; **Stripe Connect ops still required** |
| **C — Client Surface** | ✅ Complete (shipped as Phase A PR 4) |
| **D — Trust** | ⏸ Blocked on Stripe Identity |
| **E — The Page** | ⏸ Partial — talent surface polish pure-code-doable |
| **F — Hybrid + Network** | ⏸ Mandatory focused Opus-high session |
| **G — Discovery + Embeds** | ✅ Complete |

## Recommended next-marathon order

In priority by remaining business leverage:

1. **A7 — Admin triage queue** — biggest UX gap for power-user admins. Self-contained.
2. **B2 — Call sheet editor** — biggest UX gap for booked projects. Self-contained.
3. **Phase E partial — talent page editor polish** — per `project_talent_surface_launch.md`. No Stripe needed for the editor itself; billing wires later.
4. **Phase F — Hybrid + Network** — only with a focused Opus-high session reserved for it.
5. **B-series Stripe wires** — when you spin up the platform Stripe account.

## How to QA what shipped this marathon

Same recipe as `part2-pickup-note.md`:

```
cd web && rm -rf .next && npm run dev   # if Turbopack panic'd earlier
```

Then sign in as `qa-admin@impronta.test` / `Impronta-QA-Admin-2026!` and exercise:

1. **A1** — Create a manual inquiry via admin's +New form → check `inquiry_events` for an INQUIRY_SUBMITTED row (was missing before)
2. **A9** — Click the bell → see real notifications (not the 5 hardcoded mocks)
3. **B1** — Place a hold via `placeTalentHold` (called from a future UI; for now exercise via server console)
4. **B3/B4** — Try `cancelBookingAction` + `closeBookingAction` against a confirmed booking
5. **C5** — Trigger a rate limit (spam the same engine call) → toast now shows "try again in Xs"
6. **C6** — Open any sheet on the new ReservationThread (with `?rt=1`), Tab through it, Esc to close, Shift+Tab back
7. **C7** — On a mobile viewport, open a sheet, swipe down → snap dismisses past 30%
8. **C8** — Visit `/<tenant>/talent/inbox/<thread-id>` → talent inbox opens to that thread
9. **C9** — Open a panel with no data yet → see skeleton, not a blank flash

---

Next session: pick A7 or B2. Both are well-scoped enough to ship in one focused marathon if Opus high is reserved for them.
