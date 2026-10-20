/**
 * TUL-639: the ONE rule for a site's main call to action. It follows how the
 * talent sells, and no theme hardcodes its own wording:
 *
 *   instant booking          Reservar cita / Book an appointment
 *   request or quote only    Solicitar cita / Request an appointment
 *   message-first trades     Escríbeme / Message me
 *   goods or packages        Comprar / Buy (opens the shop or catalog)
 *
 * Pure. Used by the new-site shell seed and the demo fixtures. Existing sites
 * keep whatever text they saved: nothing here rewrites a saved label.
 */
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";

export type MainCtaMode = "instant" | "request" | "message" | "buy";

const LABELS: Record<MainCtaMode, { es: string; en: string }> = {
  instant: { es: "Reservar cita", en: "Book an appointment" },
  // Request mode matches Maison: Solicitar cita / Request an appointment.
  request: { es: "Solicitar cita", en: "Request an appointment" },
  message: { es: "Escríbeme", en: "Message me" },
  // Talents selling goods or packages: opens the shop / catalog, never booking wording.
  buy: { es: "Comprar", en: "Buy" },
};

export const MAIN_CTA_MODES = Object.keys(LABELS) as MainCtaMode[];

export function mainCtaLabel(mode: MainCtaMode, locale: string | null | undefined): string {
  const lang = (locale ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
  return LABELS[mode][lang];
}

/** The talent-wide booking posture (`selling-booking-settings`) as a main CTA mode. */
export function mainCtaModeFromPosture(posture: TalentBookingPosture): MainCtaMode {
  return posture === "instant" ? "instant" : posture === "request" ? "request" : "message";
}

/** A service's mode (`instant | request | quote`) as a main CTA mode. A quote is a request. */
export function mainCtaModeFromServiceMode(mode: "instant" | "request" | "quote"): MainCtaMode {
  return mode === "instant" ? "instant" : "request";
}

/** A site-wide CTA mode (`resolveSiteCtaMode`) as a main CTA mode. */
export function mainCtaModeFromSiteMode(mode: "instant" | "request" | "inquiry" | "buy"): MainCtaMode {
  return mode === "inquiry" ? "message" : mode;
}
