/**
 * TUL-639: the ONE rule for a site's main call to action. It follows how the
 * talent sells, and no theme hardcodes its own wording:
 *
 *   instant booking          Reservar cita / Book an appointment
 *   request or quote only    Solicitar / Request
 *   message-first trades     Escríbeme / Message me
 *
 * Pure. Used by the new-site shell seed and the demo fixtures. Existing sites
 * keep whatever text they saved: nothing here rewrites a saved label.
 */
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";

export type MainCtaMode = "instant" | "request" | "message";

const LABELS: Record<MainCtaMode, { es: string; en: string }> = {
  instant: { es: "Reservar cita", en: "Book an appointment" },
  request: { es: "Solicitar", en: "Request" },
  message: { es: "Escríbeme", en: "Message me" },
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

/** Which mode an English seeded label belongs to, or null when it is not a seeded main-CTA label. */
export function mainCtaModeOfSeededLabel(label: string): MainCtaMode | null {
  const l = label.trim().toLowerCase();
  for (const mode of MAIN_CTA_MODES) if (LABELS[mode].en.toLowerCase() === l) return mode;
  return null;
}
