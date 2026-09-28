/**
 * Money action sheet intents (AUD-018 / Stage D entry points).
 * Opened from Money chrome, Outstanding rows, and Payment detail.
 */

import type { MoneyOutstandingRow, MoneyPaymentRow } from "./money-read-model";
import type { PaymentDetailView } from "./money-spine-view";

export type MoneyAction =
  | { kind: "request"; prefill?: MoneyOutstandingRow | null }
  | { kind: "record"; prefill?: MoneyOutstandingRow | null }
  | { kind: "refund"; detail: PaymentDetailView }
  | { kind: "correct"; payment: MoneyPaymentRow };
