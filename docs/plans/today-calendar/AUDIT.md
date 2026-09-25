# Today / Calendar Agenda V2 — Audit

Verified on `origin/main` at 2026-09-24 (`feat/tc-phase0` branched from current main).
Branch: `feat/tc-phase0`.

## Wave 8 status (2026-09-24)

Skeleton code-complete on `feat/tc-phase0` for T9.1–T9.6 readiness, but post-audit gaps remain.

**Next:** execute [`GAP-EXECUTION-PLAN.md`](./GAP-EXECUTION-PLAN.md) (G0–G5) before expanding the allow-list.

- Focused flows hide mobile tab bar (`bookings-new`, `booking-record`, `calendar-availability`, `attention`).
- Sticky action bars use `env(safe-area-inset-bottom)`.
- Evidence dir: `docs/plans/program/evidence/today-calendar/`.
- Legacy Today/Calendar delete remains **ROLLOUT Step 4** (separate PR after ≥7 days green).

See `ROLLOUT.md`.

## Before screenshots

Deferred: no local talent session was available at audit time. Capture `/talent/today` and `/talent/calendar` at 1440 and 390 on a seeded QA talent once T0.2 lands, and store under `docs/plans/program/evidence/today-calendar/before/`.

## Intake storage decision (T0.1 / D6)

`agency_bookings` has no `metadata` jsonb column. Use additive column `agency_bookings.intake_status text null` (`none | pending | complete | waived`) plus optional `intake_sent_at timestamptz`. Prefer this over a new `booking_intake` table for status + resend only.

---

## Findings (file:line)

### Shell and routing — EXISTS

| Item | Citation |
|---|---|
| `TalentPage` includes today / calendar / bookings | `web/src/components/admin/shell/internal/state/types.ts:57-76` |
| `TALENT_SEGMENT_MAP` | `web/src/app/(workspace)/talent/layout.tsx:40-63` |
| Sidebar groups | `web/src/components/admin/shell/internal/talent.tsx:72-82` |
| `TalentRouter` today / calendar / bookings | `talent.tsx:283-285`, `:317-319`, `:348-354` |
| Bookings routed but not in sidebar groups | BUG (nav gap) |

### Today — EXISTS with mock fallback

| Item | Citation |
|---|---|
| `TodayPage.tsx` uses `useTalentConversations` | `…/talent/pages/TodayPage.tsx:54` |
| Mock when no bridge | `…/talent/shared/conversation-adapter-1.tsx:94-112` |
| `NeedsReplySection` | `…/talent/shared/today-3.tsx:165-209`; used `TodayPage.tsx:431-436` |
| Studio short-circuit | `TodayPage.tsx:204` → `StudioToday` |

### Calendar — partial follow-up

| Item | Citation |
|---|---|
| Day view hard-coded to day 14 | `…/talent/shared/calendar-1.tsx:500-503` |
| Fixture fallback when no bridge | `CalendarPage.tsx:173-303` |
| Month click → `booking-record` wiring | DONE T1.10 |

### Drawers — BUG fixture / stub

| Item | Citation |
|---|---|
| `TalentBookingDetailDrawer` reads `TALENT_BOOKINGS` only | `…/talent-drawers/today.tsx:192-197` |
| `TalentAddEventDrawer` saves nothing | `…/talent-drawers/events.tsx:160-231` |

### createManualBooking — DONE T1.2

| Item | Citation |
|---|---|
| Function | `web/src/lib/server-actions/admin-bookings.ts:917` |
| Inserts `agency_bookings` + `booking_talent` | `:1003-1068` |
| Busy check + `talent_bookings` mirror | DONE T1.2 |

### saveBookingHours — DONE T1.1

| Item | Citation |
|---|---|
| Exceptions preserved through parse and upsert | DONE T1.1 |

### /pay/[code] Stripe — DONE T1.6

| Item | Citation |
|---|---|
| Checkout session create now sends idempotency key | DONE T1.6 |

### Status enums — DONE T1.3

| Item | Citation |
|---|---|
| `booking_status`: tentative, confirmed, completed, cancelled, draft, in_progress, archived | `database.types.ts` + migrations |
| `talent_bookings` CHECK: confirmed, completed, cancelled | `supabase/migrations/20260513081325_talent_calendar_v1.sql:44-45` |
| `no_show` | DONE T1.3 |

### Holds — DONE T1.5

| Item | Citation |
|---|---|
| Place / release only | `web/src/lib/talent-calendar/hold-actions.ts` |
| Expire cron extends once when payment is still pending | DONE T1.5 |

### Travel / client tz / metadata — partial follow-up

| Item | Citation |
|---|---|
| `travel_before_min` / `travel_after_min` | DONE T1.7 |
| `client_timezone` | DONE T2.5 |
| No metadata jsonb; logistics notes exist | `transport_notes`, `call_sheet_payload`, etc. |

### Flag patterns to mirror — EXISTS

| Pattern | Citation |
|---|---|
| Env + allowlist | `web/src/lib/site-admin/site-shell-flag.ts` |
| Studio V2 (separate; do not reuse) | `web/src/components/talent/studio/flag.ts` |

### setTalentPage today / calendar call sites

- today: `state/context.tsx:1882`, `StudioMessageActions.tsx:43,58`, `TalentWorkFlowsPage.tsx:82`, `TalentClientsPage.tsx:88`
- calendar: `TodayPage.tsx:409,474`, `StudioToday.tsx:59`, `TalentWorkFlowsPage.tsx:70`, `wave2.tsx:3531`, `week-rhythm-1.tsx:112`, `availability.tsx:157`

---

## CTA → server action map (Phase 1 exit target)

| CTA family | Server function | Status |
|---|---|---|
| Save hours / exceptions | `saveBookingHours` | DONE T1.1 |
| Manual New booking | `createManualBooking` | DONE T1.2 busy check + talent_bookings mirror |
| No-show | `markBookingNoShow` | DONE T1.3 |
| Complete | `completeBooking` | DONE T1.4 |
| Hold checking extend | expire-calendar-holds cron | DONE T1.5 |
| Pay card retry | `/pay/[code]` session | DONE T1.6 |
| Travel in busy | `loadBusyIntervals` | DONE T1.7 |
| Reschedule with fee | `proposeReschedule` / `respondToReschedule` | DONE T1.8 (accept stubs fee path) |
| Cancel with refund | `cancelBookingWithRefund` → `cancelBookingSetAction` | DONE T1.9 |
| Month grid open | flag-off click | DONE T1.10 → talent-booking-detail |
| Accept request | `confirmRecord` / engine convert | EXISTS |
| Payment link | `createPaymentLink` / links.ts | EXISTS |
| Cash settle | `settleAtDoor` | EXISTS |
| Block time | `createTalentAvailabilityBlock` | EXISTS |
| Hold place / release | `hold-actions.ts` | EXISTS (+ T1.5 extend) |
