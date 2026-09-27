/**
 * Who-step payment honesty copy for CatalogBookingSheet.
 * Display-only — mirrors reserveMode / allowPayInPerson; never a security gate.
 */

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
      ? "El pago en línea no está disponible por ahora. Enviá una consulta para continuar."
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
  return es
    ? "No se cobra nada ahora. El pago se realiza en el estudio."
    : "Nothing is charged now. Pay at the studio.";
}

/** Resolve who-step action, CTA label, and payment fixture together. */
export function resolveWhoStepPaymentUi(input: {
  reserveMode: OfferingReserveMode;
  allowPayInPerson: boolean;
  depositPct: number | null;
  onlineCollectReady?: boolean;
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
        bookingPosture: input.bookingSettings.bookingPosture,
        whoPrimaryCta: input.bookingSettings.whoPrimaryCta,
        offeringIntent: input.offeringIntent,
      });
  const whoCtaText = paymentSetupBlocksConfirm
    ? es
      ? "Enviar consulta"
      : "Send inquiry"
    : whoStepPrimaryLabel({
        action: whoAction,
        whoPrimaryCta: input.bookingSettings.whoPrimaryCta,
        locale: input.locale,
      });
  return {
    whoAction,
    whoCtaText,
    paymentFixture: whoStepPaymentCopy({
      reserveMode: input.reserveMode,
      allowPayInPerson: input.allowPayInPerson,
      depositPct: input.depositPct,
      onlineCollectReady: input.onlineCollectReady,
      locale: input.locale,
    }),
  };
}
