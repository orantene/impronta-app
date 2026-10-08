/**
 * Phase 0 F1: THE one place that decides what a guest is told about a booking.
 *
 * Booking status and payment status are separate, and confirmation depends on
 * the offering's policy:
 *
 *   - Request (approval required): REQUESTED. Payment never implies acceptance.
 *   - Pay at visit / free: CONFIRMED on submit; payment is due at the visit.
 *   - Deposit: HELD until the deposit settles (webhook), then CONFIRMED with a
 *     balance due at the visit.
 *   - Full: HELD until settled, then CONFIRMED + paid.
 *   - Returned from Stripe, webhook not settled yet: PROCESSING. Never confirmed.
 *   - Paid after the hold lapsed: NOT auto-confirmed. "Payment received, time
 *     no longer held" (the capacity-lost compensation path reconciles it).
 *
 * Real fields read by callers: `booking_transactions.status`,
 * `booking_transactions.checkout_type`, `booking_transactions.gross_amount_cents`,
 * `booking_transactions.currency`, `orders.status`, `orders.hold_expires_at`,
 * `orders.total_cents`; plus the offering's `reserveMode` / `allowPayInPerson`
 * and intent on the sheet.
 *
 * No refund promises in any copy here.
 */

import { formatMoney } from "@/lib/talent/offerings-money";

export type GuestBookingState =
  | "requested"
  | "held"
  | "processing"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "needs_attention";

export type GuestPaymentState =
  | "none"
  | "due_at_visit"
  | "awaiting"
  | "processing"
  | "deposit_paid"
  | "paid"
  | "failed";

export type GuestBookingPresentationInput = {
  bookingMode: "request" | "instant";
  /** Offering policy. `deposit` / `full` collect online; `free` does not. */
  reserveMode: "free" | "deposit" | "full" | null;
  /** True when the guest pays at the visit (no online collection). */
  payAtVisit: boolean;
  /** `orders.status`, when known. */
  orderStatus: string | null;
  /** `booking_transactions.status`, when known. */
  transactionStatus: string | null;
  /** `orders.hold_expires_at`, when known. */
  holdExpiresAt: string | null;
  /** True on /checkout/success: the guest came back from Stripe. */
  returnedFromCheckout?: boolean;
  /** Settled amount (`booking_transactions.gross_amount_cents`). */
  paidCents?: number | null;
  /** `orders.total_cents`. */
  totalCents?: number | null;
  currency?: string | null;
  now: Date;
  locale: string;
};

export type GuestBookingPresentation = {
  bookingState: GuestBookingState;
  paymentState: GuestPaymentState;
  headline: string;
  detail: string | null;
};

const SETTLED_TX = new Set(["paid", "payout_pending", "payout_sent"]);
const DEAD_TX = new Set(["failed", "cancelled"]);
const SETTLED_ORDER = new Set(["paid", "fulfilled"]);

function clock(iso: string, es: boolean): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(es ? "es-MX" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function deriveGuestBookingPresentation(
  input: GuestBookingPresentationInput,
): GuestBookingPresentation {
  const es = input.locale.toLowerCase().startsWith("es");
  const t = (en: string, sp: string) => (es ? sp : en);

  if (input.bookingMode === "request") {
    return {
      bookingState: "requested",
      paymentState: "none",
      headline: t("Request sent", "Solicitud enviada"),
      detail: t(
        "Nothing is confirmed until the talent accepts your request.",
        "Nada queda confirmado hasta que se acepte tu solicitud.",
      ),
    };
  }

  const collectsOnline =
    !input.payAtVisit && (input.reserveMode === "deposit" || input.reserveMode === "full");

  if (!collectsOnline) {
    if (input.orderStatus === "cancelled") {
      return {
        bookingState: "cancelled",
        paymentState: "none",
        headline: t("Booking cancelled", "Reserva cancelada"),
        detail: null,
      };
    }
    return {
      bookingState: "confirmed",
      paymentState: "due_at_visit",
      headline: t("Confirmed · pay at your visit", "Confirmada · pagas en tu cita"),
      detail: null,
    };
  }

  const isDeposit = input.reserveMode === "deposit";
  const txSettled = input.transactionStatus != null && SETTLED_TX.has(input.transactionStatus);
  const holdLapsed =
    input.holdExpiresAt != null && new Date(input.holdExpiresAt).getTime() <= input.now.getTime();

  if (txSettled) {
    const orderHolds =
      input.orderStatus == null || SETTLED_ORDER.has(input.orderStatus) || !holdLapsed;
    if (input.orderStatus === "cancelled" || !orderHolds) {
      return {
        bookingState: "needs_attention",
        paymentState: isDeposit ? "deposit_paid" : "paid",
        headline: t("Payment received, time no longer held", "Pago recibido, el horario ya no está apartado"),
        detail: t(
          "Your hold ended before the payment arrived. We will contact you about your booking.",
          "Tu horario se liberó antes de que llegara el pago. Te contactaremos sobre tu reserva.",
        ),
      };
    }
    if (isDeposit) {
      const cur = input.currency ?? "USD";
      const amounts =
        input.paidCents != null && input.totalCents != null && input.totalCents > input.paidCents
          ? {
              paid: formatMoney(input.paidCents, cur, input.locale),
              due: formatMoney(input.totalCents - input.paidCents, cur, input.locale),
            }
          : null;
      return {
        bookingState: "confirmed",
        paymentState: "deposit_paid",
        headline: amounts
          ? t(
              `Confirmed · ${amounts.paid} paid, ${amounts.due} due at the visit`,
              `Confirmada · ${amounts.paid} pagado, ${amounts.due} en tu cita`,
            )
          : t("Confirmed · deposit paid, the rest is due at the visit", "Confirmada · anticipo pagado, el resto en tu cita"),
        detail: null,
      };
    }
    return {
      bookingState: "confirmed",
      paymentState: "paid",
      headline: t("Confirmed · paid", "Confirmada · pagada"),
      detail: null,
    };
  }

  if (
    input.orderStatus === "cancelled"
    || (input.transactionStatus != null && DEAD_TX.has(input.transactionStatus))
  ) {
    return {
      bookingState: "cancelled",
      paymentState: "failed",
      headline: t("Payment not completed", "El pago no se completó"),
      detail: t("You were not charged and the time was released.", "No se hizo ningún cargo y el horario se liberó."),
    };
  }

  if (input.returnedFromCheckout) {
    return {
      bookingState: "processing",
      paymentState: "processing",
      headline: t("We're confirming your payment", "Estamos confirmando tu pago"),
      detail: t(
        "This usually takes a few seconds. This page updates on its own.",
        "Esto suele tardar unos segundos. Esta página se actualiza sola.",
      ),
    };
  }

  if (holdLapsed) {
    return {
      bookingState: "expired",
      paymentState: "awaiting",
      headline: t("Your hold expired", "Tu horario apartado expiró"),
      detail: t("Pick a time again to book.", "Elige un horario otra vez para reservar."),
    };
  }

  const until = input.holdExpiresAt ? clock(input.holdExpiresAt, es) : null;
  const action = isDeposit
    ? t("pay the deposit to confirm", "paga el anticipo para confirmar")
    : t("pay to confirm", "paga para confirmar");
  return {
    bookingState: "held",
    paymentState: "awaiting",
    headline: until
      ? t(`Held until ${until} · ${action}`, `Apartada hasta las ${until} · ${action}`)
      : t(`Held · ${action}`, `Apartada · ${action}`),
    detail: null,
  };
}

/** Map a transaction's `checkout_type` to the policy the presenter reads. */
export function reserveModeFromCheckoutType(checkoutType: string | null): "deposit" | "full" | null {
  if (checkoutType === "deposit") return "deposit";
  if (checkoutType === "full" || checkoutType === "balance") return "full";
  return null;
}

/** How many times the processing page refreshes itself before it stops asking. */
export const CHECKOUT_CONFIRM_POLL_MAX = 5;
export const CHECKOUT_CONFIRM_POLL_MS = 3000;
