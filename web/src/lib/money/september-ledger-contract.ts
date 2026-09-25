/**
 * LEDGER-CONTRACT aggregate constants — September 2026 / Jor Beauty / MXN.
 *
 * Source: docs store `LEDGER-CONTRACT.md` (visual-spec mc_defs + mc_ledger).
 * Tests and fixtures MUST import these; do not hardcode alternate totals in UI tests.
 */

export const LEDGER_CONTRACT_CLOCK = {
  /** Wed 23 Sep 2026, 09:50 Cancún — same as Today/Calendar. */
  label: "Wed 23 Sep 2026, 09:50, Cancún",
  periodLabel: "1–23 September 2026",
  currency: "MXN",
  tenantFixture: "Jor Beauty",
} as const;

/** Aggregate assertions from LEDGER-CONTRACT.md (major units). */
export const LEDGER_CONTRACT_AGGREGATES = {
  collected_gross: 18450,
  payments_count: 24,
  by_method: {
    card: 12300,
    cash: 4150,
    transfer: 2000,
  },
  recorded_outside_tulala: 6150,
  refunded: 120,
  collected_after_refunds: 18330,
  outstanding_total: 3420,
  outstanding_overdue: 620,
  outstanding_today: 2000,
  outstanding_later: 800,
  due_by_today: 2620,
  platform_paid_out: 7751,
  next_payout_estimated: 5784,
  payouts_count: 4,
  outstanding_count: 4,
} as const;

/**
 * Reconciliation identity (`mc_breakdown`) — fixture placeholders for fees.
 * Live fees come from Stripe balance transactions (M5).
 */
export const LEDGER_CONTRACT_RECONCILIATION = {
  waiting_on_1_sep: 1860,
  card: 12300,
  refund: 120,
  fees_placeholder: 289,
  paid_out: 7751,
  waiting_for_fri_25: 6000,
} as const;
