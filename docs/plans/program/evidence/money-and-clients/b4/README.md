# B4 — `booking_activity_log` for talent agenda actions

**Branch:** `cursor/mc-b4-activity-log-d350`  
**Scope:** Phase 1.5 / Stage B4 — agenda mutations write through `lib/server/commercial-audit.ts`; attention stops text-matching `"Reschedule pending."`.

## Writers

After successful (non-`already`) mutations, talent agenda actions call `logBookingActivity` with existing `BOOKING_AUDIT` event types and `surface: "talent_agenda"`:

| Action | File | Event | Payload highlights |
|---|---|---|---|
| No-show | `booking-actions.ts` | `STATUS_CHANGED` | `from` → `no_show` |
| Complete | `booking-actions.ts` | `STATUS_CHANGED` | `from` → `completed` |
| Cash collected | `booking-actions.ts` | `PAYMENT_STATE_CHANGED` | cash method + status |
| Transfer awaiting | `booking-actions.ts` | `PAYMENT_STATE_CHANGED` | `awaiting: true` |
| Transfer received | `booking-actions.ts` | `PAYMENT_STATE_CHANGED` | `transfer_confirmed: true` |
| Propose reschedule | `reschedule-actions.ts` | `STATUS_CHANGED` | `kind: "reschedule_proposed"` |
| Decline reschedule | `reschedule-actions.ts` | `STATUS_CHANGED` | `kind: "reschedule_declined"` |
| Accept reschedule | `reschedule-actions.ts` | `STATUS_CHANGED` | `kind: "rescheduled"` (+ windows) |
| Cancel | `cancel-actions.ts` | `STATUS_CHANGED` | `to: "cancelled"` + refundableCents |

`ownBookingGate` / `requireOwnBooking` now return `userId` for the audit actor.

## Reads

- `load.ts` batch-reads `booking_activity_log` via service-role elevation (same pattern as money joins), maps rows with `summarizeCommercialEvent`.
- Removed history synthesis of `"Reschedule pending."`. Pending reschedule attention still comes from `booking_reschedule_requests` → `tradeSection.payload`.
- `derive.ts` / `attention-cta.ts` no longer match history text for reschedule.
- `buildAgendaListItemFromAgendaItem` passes history through; booking record renders a History section when present.

## Verification

```bash
cd web
NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test \
  src/lib/talent-agenda/g1-load-attention.test.ts \
  src/lib/talent-agenda/attention-cta.test.ts \
  src/lib/talent-agenda/a3-honesty.test.ts \
  src/lib/talent-agenda/b4-activity-log.static.test.ts
# → 33 pass / 0 fail

npm run typecheck   # exit recorded at gate time
npm run lint        # exit recorded at gate time
```

No migration (table + autofill already exist). No new engines.
