# P2 — Payments E2E (Stripe sandboxes) · Track A

Canonical evidence lives in Project Context:

`/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/p2-payments-e2e.md`

**Scope:** US sandbox + TAL-93900 only. MX checklist item skipped (Oran 2026-10-02).

**PR:** [#2469](https://github.com/orantene/impronta-app/pull/2469) · `fix/payments-e2e` @ `0e8963c5f`

## A4 summary (code)

Seller-pays refunds must merge `booking_payouts.processing_fee_cents` via
`loadBookingCommissionSnapshotsForRefund` — the commission snapshot has no actual
fee column. Loader + static guards are covered in this branch; live A2–A5 still
need Oran’s Mac (`stripe login`) and :3001.
