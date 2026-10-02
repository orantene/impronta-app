/**
 * Path A confirm orchestration helpers for CatalogBookingSheet.
 * Keeps the sheet under the max-lines gate.
 */

import type {
  InstantBookActionResult,
  InstantBookFormPayload,
} from "@/lib/server-actions/instant-book-types";
import { offeringRequiresOnlineCollect } from "@/lib/talent/who-step-payment-copy";
import type { OfferingReserveMode } from "@/lib/talent/offerings-types";
import type { OfferingTaskBrief } from "@/lib/talent/offering-task-brief";
import {
  demoReservationIso,
  resolveCatalogConfirmOutcome,
  submitCatalogBooking,
  type CatalogBookingMode,
} from "./catalog-booking-logic";

export type CatalogBookFn = (payload: InstantBookFormPayload) => Promise<InstantBookActionResult>;

export function catalogSlotLostMessage(locale: string): string {
  return locale.toLowerCase().startsWith("es")
    ? "Ese horario ya no está disponible. Elige otro."
    : "That time is no longer available. Pick another.";
}

export function catalogConfirmNetworkError(locale: string): string {
  return locale.toLowerCase().startsWith("es")
    ? "No se pudo guardar. Prueba de nuevo."
    : "Could not save. Please try again.";
}

export async function runCatalogConfirmWrite(input: {
  mode: CatalogBookingMode;
  intent: "request" | "instant";
  locale: string;
  tenantId: string | null;
  talentProfileId: string | null;
  offeringId: string;
  reserveMode: OfferingReserveMode;
  allowPayInPerson: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  variantId: string | null;
  addOnIds: string[];
  brief?: OfferingTaskBrief | null;
  liveStarts: string | null;
  liveTz: string;
  bookingDurationMinutes: number;
  day: Date;
  time: string | null;
  captchaToken: string | null;
  bookFn?: CatalogBookFn;
}): Promise<
  | { phase: "preview" }
  | { phase: "outcome"; outcome: ReturnType<typeof resolveCatalogConfirmOutcome> }
> {
  const submitted = await submitCatalogBooking(input.mode, input.intent, async () => {
    if (!input.tenantId || !input.talentProfileId) {
      const es = input.locale.toLowerCase().startsWith("es");
      return {
        ok: false as const,
        error: es
          ? "Falta el estudio para guardar la cita."
          : "This site is not ready to take bookings.",
      };
    }
    const reservation = input.liveStarts
      ? {
          startsAt: input.liveStarts,
          endsAt: new Date(
            new Date(input.liveStarts).getTime() + input.bookingDurationMinutes * 60_000,
          ).toISOString(),
          timezone: input.liveTz,
        }
      : input.time
        ? demoReservationIso(input.day, input.time, input.bookingDurationMinutes)
        : null;
    const run =
      input.bookFn ??
      (await import("@/lib/server-actions/instant-book-action")).createInstantBookingAction;
    return run({
      talentProfileId: input.talentProfileId,
      tenantId: input.tenantId,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      offeringId: input.offeringId,
      payInPerson: input.reserveMode === "free" && input.allowPayInPerson !== false,
      variantId: input.variantId,
      addOnIds: input.addOnIds,
      ...(input.brief ? { brief: input.brief } : {}),
      reservation,
      captchaToken: input.captchaToken,
      sourcePage: typeof window !== "undefined" ? window.location.pathname : null,
    });
  });
  if (!submitted.wrote) return { phase: "preview" };
  return {
    phase: "outcome",
    outcome: resolveCatalogConfirmOutcome({
      wrote: submitted.wrote,
      result: submitted.result,
      requiresOnlineCollect: offeringRequiresOnlineCollect({
        reserveMode: input.reserveMode,
        allowPayInPerson: input.allowPayInPerson,
      }),
      locale: input.locale,
    }),
  };
}
