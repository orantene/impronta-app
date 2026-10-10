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
import type { OfferingDeliveryWhere } from "@/lib/talent/offering-request-detail";

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
  /**
   * TUL-516 E2: delivery place. Client-place / remote must never promise
   * "pay at the studio". Omit / empty keeps the studio wording (legacy).
   */
  where?: readonly OfferingDeliveryWhere[] | null;
};

/** In-person pay place for free + pay-at-visit: studio vs visit vs agreed. */
export function whoStepPayAtPlaceLine(
  where: readonly OfferingDeliveryWhere[] | null | undefined,
  locale: string,
): { who: string; done: string } {
  const es = locale.toLowerCase().startsWith("es");
  const list = Array.isArray(where) ? where : [];
  if (list.includes("client")) {
    return es
      ? {
          who: "No se cobra nada ahora. El pago se realiza en la visita.",
          done: "Recibirás la confirmación por correo. El pago se realiza en la visita.",
        }
      : {
          who: "Nothing is charged now. Pay at the visit.",
          done: "You will get the confirmation by email. Pay at the visit.",
        };
  }
  if (list.length === 1 && list[0] === "remote") {
    return es
      ? {
          who: "No se cobra nada ahora. El pago se realiza según lo acordado.",
          done: "Recibirás la confirmación por correo. El pago se realiza según lo acordado.",
        }
      : {
          who: "Nothing is charged now. Payment is as agreed.",
          done: "You will get the confirmation by email. Payment is as agreed.",
        };
  }
  return es
    ? {
        who: "No se cobra nada ahora. El pago se realiza en el estudio.",
        done: "Recibirás la confirmación por correo. El pago se realiza en el estudio.",
      }
    : {
        who: "Nothing is charged now. Pay at the studio.",
        done: "You will get the confirmation by email. Pay at the studio.",
      };
}

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
  return whoStepPayAtPlaceLine(input.where, input.locale).who;
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
  locale: string;
  where?: readonly OfferingDeliveryWhere[] | null;
}): string {
  const effective = resolveOfferingPolicy(input.offering, input.sellingDefaults);
  return whoStepPaymentCopy({
    reserveMode: effective.reserveMode,
    depositPct: effective.depositPct,
    allowPayInPerson: input.allowPayInPerson,
    onlineCollectReady: input.onlineCollectReady,
    locale: input.locale,
    where: input.where,
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
  return whoStepPayAtPlaceLine(input.where, input.locale).done;
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
  where?: readonly OfferingDeliveryWhere[] | null;
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
          locale: input.locale,
          where: input.where,
        });
  return {
    whoAction,
    whoCtaText,
    paymentFixture,
  };
}
