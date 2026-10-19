import { formatDashboardMoney } from "@/lib/money/dashboard-money-format";
import { normalizeEmailLocale } from "./email-copy";

/**
 * Display-only refund line for the booking-cancelled notices (TUL-1268 item 3).
 * It restates what `cancelBookingSet` already computed (`refundableCents` from
 * the talent's published policy); it never decides, moves or promises money.
 *
 * Client voice for the guest, third person for the talent and the coordinator.
 * No agency words in the client copy and no em dashes anywhere.
 */
export type CancelRefundInput = {
  audience: "client" | "talent" | "workspace";
  locale: string | null | undefined;
  /** Sum of paid transactions on the order; null when unknown. */
  paidCents: number | null;
  /** Policy refund; null when it could not be computed. */
  refundCents: number | null;
  currency: string | null | undefined;
};

const COPY = {
  en: {
    client: {
      refund: "Refund: {amount}, according to the cancellation policy.",
      kept: "Refund: none. Your payment is kept under the cancellation policy.",
      none: "No payment had been taken, so there is nothing to refund.",
      unknown: "Any refund follows the cancellation policy.",
    },
    staff: {
      refund: "Refund to the client: {amount}, according to the cancellation policy.",
      kept: "Refund to the client: none. The payment is kept under the cancellation policy.",
      none: "No payment had been taken, so there is nothing to refund.",
      unknown: "Any refund follows the cancellation policy.",
    },
  },
  es: {
    client: {
      refund: "Reembolso: {amount}, según la política de cancelación.",
      kept: "Reembolso: ninguno. Tu pago se conserva según la política de cancelación.",
      none: "No se había cobrado ningún pago, así que no hay nada que reembolsar.",
      unknown: "Cualquier reembolso sigue la política de cancelación.",
    },
    staff: {
      refund: "Reembolso al cliente: {amount}, según la política de cancelación.",
      kept: "Reembolso al cliente: ninguno. El pago se conserva según la política de cancelación.",
      none: "No se había cobrado ningún pago, así que no hay nada que reembolsar.",
      unknown: "Cualquier reembolso sigue la política de cancelación.",
    },
  },
} as const;

export function bookingRefundLine(input: CancelRefundInput): string {
  const locale = normalizeEmailLocale(input.locale);
  const c = COPY[locale][input.audience === "client" ? "client" : "staff"];
  const code = (input.currency ?? "").trim().toUpperCase();
  const paid = input.paidCents;
  const refund = input.refundCents;
  if (paid === null || refund === null) return c.unknown;
  if (paid <= 0) return c.none;
  if (refund <= 0) return c.kept;
  if (!/^[A-Z]{3}$/.test(code)) return c.unknown;
  return c.refund.replace("{amount}", formatDashboardMoney(refund / 100, code, locale));
}
