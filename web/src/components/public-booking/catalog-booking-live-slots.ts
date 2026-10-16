/**
 * Live public-slot fetch for CatalogBookingSheet.
 * Duration is base offering + selected extras (BUF-5).
 */

import { isDevGuestCaptchaSkipHostname } from "@/lib/scheduling/guest-captcha-dev-skip";
import { publicSlotsUrl } from "@/lib/scheduling/public-slots-workspace";

import { LIVE_SLOT_STRIP_DAYS } from "./catalog-booking-logic";

export type CatalogSlotsResult = {
  slots: string[];
  timezone: string;
  /** YYYY-MM-DD sent as `?from=` — the live strip starts on this day. */
  fromYmd?: string;
  /** Talent home city for the zone chip when the IANA namesake differs. */
  placeCity?: string | null;
  /** Why the API returned no slots (`no_booking_hours`, `fully_booked`, ...); only sent when empty. */
  reason?: string | null;
};

export type CatalogSlotsFn = (
  offeringId: string,
  durationMinutes: number,
) => Promise<CatalogSlotsResult>;

export function shouldSkipGuestCaptchaOnHost(): boolean {
  if (typeof window === "undefined") return false;
  if (!isDevGuestCaptchaSkipHostname(window.location.hostname)) return false;
  // Mirrors instant-book-guest: only with the same flag that unlocks /dev.
  return (
    process.env.NEXT_PUBLIC_TULALA_ALLOW_DEV_SURFACES === "1" ||
    process.env.NODE_ENV === "development"
  );
}

/**
 * TUL-861: the booking window matches the profile's "available N of next 30
 * days" line, so the two surfaces never describe different horizons.
 */
export const CATALOG_LIVE_SLOT_DAYS = LIVE_SLOT_STRIP_DAYS;

/** Empty-state copy: a quiet day is not "nothing in the whole window". */
export function catalogEmptyWhenCopy(es: boolean, otherDayHasTimes: boolean, reason?: string | null): { title: string; body: string } {
  if (otherDayHasTimes) {
    return es
      ? { title: "Sin horarios este día.", body: "Elige otro día con horarios disponibles." }
      : { title: "No times this day.", body: "Pick another day that has times." };
  }
  if (reason === "no_booking_hours" || reason === "hours_unreadable") {
    return es
      ? { title: "Aún no hay horarios publicados.", body: "Este talento todavía no abre su agenda en línea. Envía una solicitud con el día que te gustaría y te responderá." }
      : { title: "No times are published yet.", body: "This talent has not opened an online calendar yet. Send a request with the day you would like and they will reply." };
  }
  if (reason === "fully_booked") {
    return es
      ? { title: "Agenda llena por ahora.", body: `No quedan huecos en los próximos ${CATALOG_LIVE_SLOT_DAYS} días. Envía una solicitud y te avisan si se libera uno.` }
      : { title: "Fully booked for now.", body: `Nothing is left in the next ${CATALOG_LIVE_SLOT_DAYS} days. Send a request and they will tell you if a spot opens.` };
  }
  return es
    ? { title: "Sin horarios disponibles.", body: `No hay huecos en los próximos ${CATALOG_LIVE_SLOT_DAYS} días. Prueba otra fecha o consulta.` }
    : { title: "No times available.", body: `Nothing is open in the next ${CATALOG_LIVE_SLOT_DAYS} days. Try another day or send a question.` };
}

export async function fetchLiveSlots(
  offeringId: string,
  durationMinutes: number,
): Promise<CatalogSlotsResult> {
  const fromYmd = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    offering: offeringId,
    from: fromYmd,
    days: String(CATALOG_LIVE_SLOT_DAYS),
    duration: String(durationMinutes),
  });
  const res = await fetch(publicSlotsUrl(params), { cache: "no-store" });
  const body = (await res.json()) as { slots?: string[]; timezone?: string; placeCity?: string; reason?: string };
  if (!res.ok) return { slots: [], timezone: "UTC", fromYmd };
  return {
    slots: Array.isArray(body.slots) ? body.slots : [],
    timezone: typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC",
    placeCity: typeof body.placeCity === "string" && body.placeCity.trim() ? body.placeCity.trim() : null,
    reason: typeof body.reason === "string" ? body.reason : null,
    fromYmd,
  };
}
