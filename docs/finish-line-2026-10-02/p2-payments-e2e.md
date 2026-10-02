# P2 — Payments E2E (Stripe sandboxes) · Track A

Canonical evidence + Mac runbook (Project Context):

- Evidence: `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/p2-payments-e2e.md`
- **Mac E2E runbook:** `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-a-mac-e2e-runbook.md`

**Scope:** US sandbox + TAL-93900 only. MX checklist skipped. Stripe CLI login done (`~/bin/stripe`, US Lavender Tunnel).

**PR:** [#2469](https://github.com/orantene/impronta-app/pull/2469) · `fix/payments-e2e` @ `046260d97`

## A4 summary (code)

Seller-pays refunds must merge `booking_payouts.processing_fee_cents` via
`loadBookingCommissionSnapshotsForRefund`. Live A2–A5: execute Mac runbook on pm-apply `:3001`.
