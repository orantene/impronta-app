/**
 * Copy for the talent's "Confirm booking and request payment" control (es + en).
 * Pure, locale-keyed like `talentDecisionCopy`; `fr` and anything else read English.
 */

import type { ConfirmBookingError } from "./talent-confirm-booking";

export type ConfirmBookingCopy = {
  readonly button: string;
  readonly retryButton: string;
  readonly dialogTitle: string;
  /** Body with a `{amount}` placeholder: booking + payment request. */
  readonly dialogBody: string;
  readonly dialogBodyRetry: string;
  /** Nothing is collected online: booking only. */
  readonly dialogBodyInPerson: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly done: string;
  readonly doneInPerson: string;
  readonly toastOk: string;
  readonly toastOkInPerson: string;
  readonly errors: Readonly<Record<ConfirmBookingError, string>>;
};

const EN: ConfirmBookingCopy = {
  button: "Confirm booking and request payment",
  retryButton: "Retry payment request",
  dialogTitle: "Confirm booking",
  dialogBody: "The booking will be created and the payment request will be sent to the client for {amount}.",
  dialogBodyRetry: "The booking already exists. The payment request will be sent to the client again for {amount}.",
  dialogBodyInPerson: "The booking will be created. The client pays in person.",
  confirm: "Confirm",
  cancel: "Not now",
  done: "Booking confirmed · payment requested",
  doneInPerson: "Booking confirmed · the client pays in person",
  toastOk: "Booking confirmed and payment requested",
  toastOkInPerson: "Booking confirmed",
  errors: {
    not_owner: "Only the talent who sells this booking can confirm it.",
    not_accepted: "The client has not accepted the offer yet.",
    already_converted: "This booking was already confirmed.",
    payment_link_failed: "The booking was created, but the payment request failed. You can retry it.",
    booking_failed: "The booking could not be created. Nothing was charged.",
    unavailable: "This is not available right now. Try again in a moment.",
    impersonating: "You are viewing as another user. Exit to make changes.",
  },
};

const ES: ConfirmBookingCopy = {
  button: "Confirmar reserva y pedir pago",
  retryButton: "Reintentar solicitud de pago",
  dialogTitle: "Confirmar reserva",
  dialogBody: "Se creará la reserva y se enviará la solicitud de pago al cliente por {amount}.",
  dialogBodyRetry: "La reserva ya existe. Se enviará de nuevo la solicitud de pago al cliente por {amount}.",
  dialogBodyInPerson: "Se creará la reserva. El cliente paga en persona.",
  confirm: "Confirmar",
  cancel: "Ahora no",
  done: "Reserva confirmada · pago solicitado",
  doneInPerson: "Reserva confirmada · el cliente paga en persona",
  toastOk: "Reserva confirmada y pago solicitado",
  toastOkInPerson: "Reserva confirmada",
  errors: {
    not_owner: "Solo el talento que vende esta reserva puede confirmarla.",
    not_accepted: "El cliente todavía no aceptó la oferta.",
    already_converted: "Esta reserva ya estaba confirmada.",
    payment_link_failed: "La reserva se creó, pero la solicitud de pago falló. Puedes reintentarla.",
    booking_failed: "No se pudo crear la reserva. No se cobró nada.",
    unavailable: "No está disponible en este momento. Inténtalo de nuevo en un momento.",
    impersonating: "Estás viendo como otro usuario. Sal para hacer cambios.",
  },
};

export function confirmBookingCopy(locale: string): ConfirmBookingCopy {
  return locale.startsWith("es") ? ES : EN;
}

export function fillAmount(template: string, amount: string): string {
  return template.replace("{amount}", amount);
}
