/**
 * September 2026 Money ledger fixture (Jor Beauty / MXN).
 *
 * Mirrors LEDGER-CONTRACT.md / prototype `MCP_` · `MCR_` · `MCO_` · `mcOwed`.
 * Shared by Money / Today / Clients read-model tests (PR M1).
 */

import type {
  MoneyLedgerInput,
  MoneyOutstandingRow,
  MoneyPaymentRow,
  MoneyPayoutRow,
  MoneyRefundRow,
} from "./money-read-model";
import { LEDGER_CONTRACT_CLOCK } from "./september-ledger-contract";

/** Payments `MCP_` — amounts in major MXN units. */
export const SEPTEMBER_LEDGER_PAYMENTS: readonly MoneyPaymentRow[] = [
  {
    id: "P16",
    day: 1,
    clientName: "Camila Torres",
    forLabel: "Acrylic refill",
    method: "cash",
    payoutId: null,
    amount: 700,
  },
  {
    id: "P01",
    day: 2,
    clientName: "Regina Vega",
    forLabel: "Russian volume 4D",
    method: "card",
    payoutId: "PO-0904",
    amount: 1500,
  },
  {
    id: "P02",
    day: 3,
    clientName: "Lucía Mendoza",
    forLabel: "Acrylic refill",
    method: "card",
    payoutId: "PO-0911",
    amount: 700,
  },
  {
    id: "P03",
    day: 5,
    clientName: "Ana Lucía Peña",
    forLabel: "Classic extensions",
    method: "card",
    payoutId: "PO-0911",
    amount: 1100,
  },
  {
    id: "P17",
    day: 6,
    clientName: "Mónica Ruiz",
    forLabel: "Spa pedicure",
    method: "cash",
    payoutId: null,
    amount: 620,
  },
  {
    id: "P22",
    day: 7,
    clientName: "Ximena Soto",
    forLabel: "Lash lift and tint",
    method: "transfer",
    payoutId: null,
    amount: 750,
  },
  {
    id: "P04",
    day: 8,
    clientName: "Paty Luna",
    forLabel: "Brow lamination",
    method: "card",
    payoutId: "PO-0911",
    amount: 600,
  },
  {
    id: "P05",
    day: 9,
    clientName: "Mara Pineda",
    forLabel: "Brow design and wax",
    method: "card",
    payoutId: "PO-0911",
    amount: 280,
  },
  {
    id: "P06",
    day: 10,
    clientName: "Valeria Ruiz",
    forLabel: "Gel polish · hands",
    method: "card",
    payoutId: "PO-0918",
    amount: 550,
  },
  {
    id: "P18",
    day: 11,
    clientName: "Lucía Mendoza",
    forLabel: "Russian manicure",
    method: "cash",
    payoutId: null,
    amount: 620,
  },
  {
    id: "P07",
    day: 12,
    clientName: "Mónica Ruiz",
    forLabel: "Sculpted acrylic · full set",
    method: "card",
    payoutId: "PO-0918",
    amount: 950,
  },
  {
    id: "P19",
    day: 14,
    clientName: "Paty Luna",
    forLabel: "Gel polish · feet",
    method: "cash",
    payoutId: null,
    amount: 600,
  },
  {
    id: "P08",
    day: 15,
    clientName: "Daniela Ortiz",
    forLabel: "Russian manicure",
    method: "card",
    payoutId: "PO-0918",
    amount: 620,
    refundId: "R01",
  },
  {
    id: "P23",
    day: 16,
    clientName: "Valeria Ruiz",
    forLabel: "Lash refill",
    method: "transfer",
    payoutId: null,
    amount: 650,
  },
  {
    id: "P20",
    day: 17,
    clientName: "Ximena Soto",
    forLabel: "Sculpted acrylic · full set",
    method: "cash",
    payoutId: null,
    amount: 950,
  },
  {
    id: "P21",
    day: 18,
    clientName: "Fernanda Gil",
    forLabel: "Brow lamination + nail art",
    method: "cash",
    payoutId: null,
    amount: 660,
  },
  {
    id: "P09",
    day: 18,
    clientName: "Karla Reyes",
    forLabel: "Russian volume 4D",
    method: "card",
    payoutId: "PO-0925",
    amount: 1500,
  },
  {
    id: "P11",
    day: 19,
    clientName: "Valeria Ruiz",
    forLabel: "Gel polish · hands, Wed 23 (paid ahead)",
    method: "card",
    payoutId: "PO-0925",
    amount: 550,
    bookingId: "BK-2281",
  },
  {
    id: "P10",
    day: 19,
    clientName: "Regina Vega",
    forLabel: "Deposit · Russian volume 4D, Wed 23",
    method: "card",
    payoutId: "PO-0925",
    amount: 450,
    bookingId: "BK-2284",
  },
  {
    id: "P12",
    day: 20,
    clientName: "Ana Lucía Peña",
    forLabel: "Deposit · Classic extensions, Thu 24",
    method: "card",
    payoutId: "PO-0925",
    amount: 300,
    bookingId: "BK-2279",
  },
  {
    id: "P24",
    day: 21,
    clientName: "Karla Reyes",
    forLabel: "Gel polish · feet",
    method: "transfer",
    payoutId: null,
    amount: 600,
  },
  {
    id: "P13",
    day: 21,
    clientName: "Mónica Ruiz",
    forLabel: "Russian volume 4D",
    method: "card",
    payoutId: "PO-0925",
    amount: 1500,
  },
  {
    id: "P15",
    day: 22,
    clientName: "Fernanda Gil",
    forLabel: "Classic extensions",
    method: "card",
    payoutId: "PO-0925",
    amount: 1100,
  },
  {
    id: "P14",
    day: 22,
    clientName: "Mara Pineda",
    forLabel: "Brow lamination",
    method: "card",
    payoutId: "PO-0925",
    amount: 600,
    bookingId: "BK-2273",
  },
];

export const SEPTEMBER_LEDGER_REFUNDS: readonly MoneyRefundRow[] = [
  {
    id: "R01",
    day: 16,
    ofPaymentId: "P08",
    clientName: "Daniela Ortiz",
    amount: 120,
    payoutId: "PO-0918",
    why: "No cuticle work; price lowered $620 → $500",
  },
];

/**
 * Payouts `MCO_`. Gross includes carry where noted in LEDGER-CONTRACT.
 * Net = gross − refund − fees.
 */
export const SEPTEMBER_LEDGER_PAYOUTS: readonly MoneyPayoutRow[] = [
  {
    id: "PO-0904",
    day: 4,
    state: "paid",
    includes: ["P01"],
    gross: 3360, // P01 1500 + carry 1860
    refund: 0,
    fees: 121,
    net: 3239,
  },
  {
    id: "PO-0911",
    day: 11,
    state: "paid",
    includes: ["P02", "P03", "P04", "P05"],
    gross: 2680,
    refund: 0,
    fees: 96,
    net: 2584,
  },
  {
    id: "PO-0918",
    day: 18,
    state: "paid",
    includes: ["P06", "P07", "P08"],
    gross: 2120,
    refund: 120,
    fees: 72,
    net: 1928,
  },
  {
    id: "PO-0925",
    day: 25,
    state: "scheduled",
    includes: ["P09", "P10", "P11", "P12", "P13", "P14", "P15"],
    gross: 6000,
    refund: 0,
    fees: 216,
    net: 5784,
    estimated: true,
  },
];

/**
 * Outstanding from bookings (`mcOwed`).
 * Lucía BK-2274: agreed 620, paid 0, left 620 (overdue) — aggregate source of truth.
 * Sofía hold $300 and Impronta AG-118 $4,500 are intentionally absent.
 */
export const SEPTEMBER_LEDGER_OUTSTANDING: readonly MoneyOutstandingRow[] = [
  {
    bookingId: "BK-2274",
    clientName: "Lucía Mendoza",
    scope: "overdue",
    agreed: 620,
    paid: 0,
    left: 620,
  },
  {
    bookingId: "BK-2284",
    clientName: "Regina Vega",
    scope: "today",
    agreed: 1500,
    paid: 450,
    left: 1050,
  },
  {
    bookingId: "BK-2286",
    clientName: "Camila Torres",
    scope: "today",
    agreed: 950,
    paid: 0,
    left: 950,
  },
  {
    bookingId: "BK-2279",
    clientName: "Ana Lucía Peña",
    scope: "later",
    agreed: 1100,
    paid: 300,
    left: 800,
  },
];

export function septemberLedgerFixture(): MoneyLedgerInput {
  return {
    currency: LEDGER_CONTRACT_CLOCK.currency,
    payments: SEPTEMBER_LEDGER_PAYMENTS,
    refunds: SEPTEMBER_LEDGER_REFUNDS,
    payouts: SEPTEMBER_LEDGER_PAYOUTS,
    outstanding: SEPTEMBER_LEDGER_OUTSTANDING,
  };
}
