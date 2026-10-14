/**
 * Who-step payment honesty copy for CatalogBookingSheet.
 * Display-only — mirrors reserveMode / allowPayInPerson; never a security gate.
 *
 * `reserveMode` / `depositPct` must be the EFFECTIVE values from
 * `resolveOfferingPolicy` (the public loader applies it via
 * `withEffectivePolicy`), so a talent-default deposit is stated here exactly
 * as checkout charges it. `whoStepPaymentCopyFor` does that for a raw row.
 */

import { resolveOfferingPolicy } from "@/lib/talent/offering-policy-resolver";

import type { OfferingReserveMode } from "@/lib/talent/offerings-types";
import {
  resolveWhoPrimaryAction,
  whoStepPrimaryLabel,
  type CatalogSheetBookingSettings,
} from "@/lib/talent/selling-booking-settings";

export type WhoStepPaymentCopyInput = {
  reserveMode: OfferingReserveMode;
  allowPayInPerson: boolean;
  depositPct: number | null;
  /**
   * When false and online collection is required, tell the guest payment
   * setup is unavailable instead of promising checkout or studio pay.
   * Omit / true when readiness is unknown (keep mode-accurate copy).
   */
  onlineCollectReady?: boolean;
  /**
   * GRK-066: when the service happens at the client's place, never say
   * "at the studio" / "en el estudio" for pay-in-person copy.
   */
  payAtClientPlace?: boolean;
  locale: string;
};

/** True when this offering expects online collection at confirm time. */
export function offeringRequiresOnlineCollect(input: {
  reserveMode: OfferingReserveMode;
  allowPayInPerson: boolean;
}): boolean {
  if (input.reserveMode === "deposit" || input.reserveMode === "full") return true;
  // free + in-person forbidden still needs online collect if they somehow confirm
  return input.reserveMode === "free" && input.allowPayInPerson === false;
}

/**
 * Fixture line under the who-step contact fields.
 * Cases: pay at appointment · deposit now · full now · online unavailable.
 */
export function whoStepPaymentCopy(input: WhoStepPaymentCopyInput): string {
  const es = input.locale.toLowerCase().startsWith("es");
  const needsOnline = offeringRequiresOnlineCollect(input);
  if (needsOnline && input.onlineCollectReady === false) {
    return es
      ? "El pago en línea no está disponible por ahora. Envía una consulta para continuar."
      : "Online payment is not available right now. Send an inquiry to continue.";
  }
  if (input.reserveMode === "deposit") {
    const pct =
      typeof input.depositPct === "number" &&
      Number.isFinite(input.depositPct) &&
      input.depositPct > 0 &&
      input.depositPct < 100
        ? Math.round(input.depositPct)
        : null;
    if (pct != null) {
      return es
        ? `Se cobra una seña del ${pct}% ahora. El resto se paga según lo acordado.`
        : `A ${pct}% deposit is charged now. The rest is paid as agreed.`;
    }
    return es
      ? "Se cobra una seña ahora. El resto se paga según lo acordado."
      : "A deposit is charged now. The rest is paid as agreed.";
  }
  if (input.reserveMode === "full") {
    return es
      ? "Se cobra el total ahora para confirmar la cita."
      : "Full payment is charged now to confirm the appointment.";
  }
  // free
  if (input.allowPayInPerson === false) {
    return es
      ? "El pago se cobra en línea al confirmar."
      : "Payment is collected online when you confirm.";
  }
  if (input.payAtClientPlace) {
    return es
      ? "No se cobra nada ahora. El pago se realiza el día del servicio."
      : "Nothing is charged now. Pay on the day of the service.";
  }
  return es
    ? "No se cobra nada ahora. El pago se realiza en el estudio."
    : "Nothing is charged now. Pay at the studio.";
}

/**
 * The payment line for a RAW offering row plus the talent's selling defaults:
 * resolves the effective deposit first, so the copy and the charge agree.
 */
export function whoStepPaymentCopyFor(input: {
  offering: { reserveMode: OfferingReserveMode; depositPct: number | null; cancellationHours: number | null };
  sellingDefaults: unknown;
  allowPayInPerson: boolean;
  onlineCollectReady?: boolean;
  payAtClientPlace?: boolean;
  locale: string;
}): string {
  const effective = resolveOfferingPolicy(input.offering, input.sellingDefaults);
  return whoStepPaymentCopy({
    reserveMode: effective.reserveMode,
    depositPct: effective.depositPct,
    allowPayInPerson: input.allowPayInPerson,
    onlineCollectReady: input.onlineCollectReady,
    payAtClientPlace: input.payAtClientPlace,
    locale: input.locale,
  });
}

/**
 * Who-step primary label when the guest can still confirm.
 * Online collect → "Continue to payment"; pay-at-studio → confirm vocabulary.
 */
export function whoStepConfirmCtaLabel(input: {
  needsOnlineCollect: boolean;
  locale: string;
  whoPrimaryCta: CatalogSheetBookingSettings["whoPrimaryCta"];
}): string {
  const es = input.locale.toLowerCase().startsWith("es");
  if (input.needsOnlineCollect) {
    return es ? "Continuar al pago" : "Continue to payment";
  }
  return whoStepPrimaryLabel({
    action: "confirm",
    whoPrimaryCta: input.whoPrimaryCta,
    locale: input.locale,
  });
}

/**
 * Done-step next-action line after a real write (or honest demo note elsewhere).
 * Restates payment posture so "confirmed" never implies paid when it is not.
 */
export function doneStepNextActionCopy(input: WhoStepPaymentCopyInput & {
  wrote: boolean;
  isRequest: boolean;
}): string {
  const es = input.locale.toLowerCase().startsWith("es");
  if (input.isRequest) {
    return es
      ? "Queda pendiente de confirmación."
      : "This stays pending until it is confirmed.";
  }
  if (!input.wrote) {
    return es
      ? "Recibirás la confirmación por correo."
      : "You will get the confirmation by email.";
  }
  const needsOnline = offeringRequiresOnlineCollect(input);
  if (needsOnline && input.onlineCollectReady === false) {
    return es
      ? "El pago en línea no está disponible. Escribe para continuar."
      : "Online payment is not available. Message to continue.";
  }
  if (needsOnline) {
    return es
      ? "Sigue al pago para terminar la reserva. El horario se libera si el pago no se completa."
      : "Continue to payment to finish the booking. The time is released if payment is not completed.";
  }
  if (input.payAtClientPlace) {
    return es
      ? "Recibirás la confirmación por correo. El pago se realiza el día del servicio."
      : "You will get the confirmation by email. Pay on the day of the service.";
  }
  return es
    ? "Recibirás la confirmación por correo. El pago se realiza en el estudio."
    : "You will get the confirmation by email. Pay at the studio.";
}

/** Resolve who-step action, CTA label, and payment fixture together. */
export function resolveWhoStepPaymentUi(input: {
  reserveMode: OfferingReserveMode;
  allowPayInPerson: boolean;
  depositPct: number | null;
  onlineCollectReady?: boolean;
  /** GRK-066: client's place → pay-on-the-day copy, not studio. */
  payAtClientPlace?: boolean;
  locale: string;
  offeringIntent: "instant" | "request";
  bookingSettings: CatalogSheetBookingSettings;
}): { whoAction: "confirm" | "chat"; whoCtaText: string; paymentFixture: string } {
  const es = input.locale.toLowerCase().startsWith("es");
  const needsOnline = offeringRequiresOnlineCollect(input);
  const paymentSetupBlocksConfirm = needsOnline && input.onlineCollectReady === false;
  const whoAction = paymentSetupBlocksConfirm
    ? "chat"
    : resolveWhoPrimaryAction({
        whoPrimaryCta: input.bookingSettings.whoPrimaryCta,
        offeringIntent: input.offeringIntent,
      });
  const whoCtaText = paymentSetupBlocksConfirm
    ? es
      ? "Enviar consulta"
      : "Send inquiry"
    : whoAction === "confirm"
      ? whoStepConfirmCtaLabel({
          needsOnlineCollect: needsOnline,
          locale: input.locale,
          whoPrimaryCta: input.bookingSettings.whoPrimaryCta,
        })
      : whoStepPrimaryLabel({
          action: whoAction,
          whoPrimaryCta: input.bookingSettings.whoPrimaryCta,
          locale: input.locale,
        });
  // Inquiry / chat path: never promise studio pay or an exact hold — the
  // talent replies to confirm the preferred time (AUD-004).
  const paymentFixture =
    whoAction === "chat" && !paymentSetupBlocksConfirm
      ? es
        ? "Te respondemos para confirmar el horario."
        : "We'll reply to confirm the time."
      : whoStepPaymentCopy({
          reserveMode: input.reserveMode,
          allowPayInPerson: input.allowPayInPerson,
          depositPct: input.depositPct,
          onlineCollectReady: input.onlineCollectReady,
          payAtClientPlace: input.payAtClientPlace,
          locale: input.locale,
        });
  return {
    whoAction,
    whoCtaText,
    paymentFixture,
  };
}
