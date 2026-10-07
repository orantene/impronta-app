# Ask Oran — leftover Jor test data cleanup

Live talent profile: `TAL-JORGBEAUTY`. Shared production Supabase (`pluhdapdnuiulvxmyspd`).  
Source: [CURSOR-NEXT Track F](./cursor-next-2026-10-02.md).  
Report: [track-f-cleanup-2026-10-02.md](./track-f-cleanup-2026-10-02.md).

---

## Oran decision (2026-10-02)

**Approved**, with constraints:

1. **First:** refund order `345d9103` in **Stripe test mode** (confirm test keys; never live).
2. **Then:** delete only the listed inquiries, guest emails, related QA PathA Bozo bookings, and the order after refund.
3. Post exact ids deleted into the Track F report.
4. If refund fails → **do not delete**; report blocker.

---

## Cleanup status

| Step | Status |
|---|---|
| Refund `345d9103` (Stripe test) | **Done** 2026-10-02 · `re_3ULslA7Oqi82ykAI1qTC82tD` succeeded |
| Delete listed rows | **Done** — 1 Bozo booking, 5 inquiries, 1 order, 11 of 14 guest rows (3 blocked by unlisted orders) |
| Exact ids deleted | Posted in [track-f-cleanup-2026-10-02.md](./track-f-cleanup-2026-10-02.md) §4 |

Unblock: paste [mac-local-agent-kickoff.md](./mac-local-agent-kickoff.md) into Oran’s local Cursor agent. Never paste secret values into chat.

---

## Target list (short ids from CURSOR-NEXT — expand to full UUIDs before delete)

### Inquiries (5)

| Short id | Notes |
|---|---|
| `6af9b754` | leftover QA inquiry |
| `836960a0` | leftover QA inquiry |
| `61735472` | leftover QA inquiry |
| `3659993f` | leftover QA inquiry |
| `fefe09e1` | leftover QA inquiry |

### Guest records (9 emails)

- `qa-jor-booking-a@impronta.test`
- `qa-jor-booking-b@impronta.test`
- `qa-jor-booking-c@impronta.test`
- `qa-jor-booking-d@impronta.test`
- `qa-jor-booking-e@impronta.test`
- `qa-jor-booking-f@impronta.test`
- `qa-jor-booking-g@impronta.test`
- `qa-jor-booking-h@impronta.test`
- `qa-jor-booking-i@impronta.test`

### Order (refund first)

| Short id | Notes |
|---|---|
| `345d9103` | refund in Stripe **test** mode, then delete |

### QA PathA Bozo bookings

- Label: **"QA PathA Bozo"** · window **28 Sep 2026**
- No booking UUIDs in source — resolve by label + date on live Jor after refund succeeds
