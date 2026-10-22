/**
 * TUL-639 (Oran's decision, reconciled): each theme keeps its OWN seed CTA wording
 * (Folio "Consultar", Maison "Book an appointment", the platform shell "Inquire"...).
 * The booking label (Reservar cita / Book an appointment) shows ONLY when the site's
 * booking is instant: see `themeSeedCtaLabel`. The mode wordings below are the labels
 * a mode-following seed resolves to at render:
 *
 *   instant booking          Reservar cita / Book an appointment
 *   request or quote only    Solicitar cita / Request an appointment
 *   message-first trades     Escríbeme / Message me
 *   goods or packages        Comprar / Buy (opens the shop or catalog)
 *
 * Pure. Existing sites keep whatever text they saved: nothing here rewrites a saved label.
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

/**
 * The CTA label a new site seeds: the theme's own seed wording, except where booking is
 * instant, where it is the booking label. Request, message and buy modes never replace a
 * theme's wording here (the render-time mode pass still handles booking-worded seeds).
 */
export function themeSeedCtaLabel(
  themeSeedLabel: string,
  mode: MainCtaMode | null | undefined,
  locale: string | null | undefined,
): string {
  return mode === "instant" ? mainCtaLabel("instant", locale) : themeSeedLabel;
}
