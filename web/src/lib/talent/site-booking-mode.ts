/**
 * TUL-685: how a service's booking mode reads next to the talent's site-wide
 * setting (`selling_defaults.bookingPosture`). PURE, display only. The real
 * resolver stays `resolveEffectiveBookingMode` (instant-book-gates.ts); this
 * mirrors its own-mode-then-site-default order so screens can show the
 * EFFECTIVE mode and flag a service that differs from the site setting.
 */
import {
  parseBookingPosture,
  PLATFORM_DEFAULT_BOOKING_POSTURE,
  type TalentBookingPosture,
} from "./selling-booking-settings";

export type SitePosture = { posture: TalentBookingPosture; source: "talent" | "platform" };

/** The site-wide mode and whether the talent chose it or it is the platform default. */
export function sitePostureOf(raw: unknown): SitePosture {
  const parsed = parseBookingPosture(raw);
  return parsed
    ? { posture: parsed, source: "talent" }
    : { posture: PLATFORM_DEFAULT_BOOKING_POSTURE, source: "platform" };
}

export type SiteBookingModeView = {
  effective: TalentBookingPosture;
  inherited: boolean;
  /** The service has its own mode AND it differs from the site setting. */
  overridesSite: boolean;
};

export function siteBookingModeView(
  ownMode: string | null | undefined,
  sitePosture: TalentBookingPosture,
): SiteBookingModeView {
  const own = parseBookingPosture(ownMode);
  if (!own) return { effective: sitePosture, inherited: true, overridesSite: false };
  return { effective: own, inherited: false, overridesSite: own !== sitePosture };
}

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

export function modeWord(mode: TalentBookingPosture, locale: string): string {
  if (isEs(locale)) return mode === "instant" ? "Inmediata" : mode === "request" ? "Por solicitud" : "Solo consulta";
  return mode === "instant" ? "Instant" : mode === "request" ? "Request" : "Inquiry";
}

export function overrideBadgeLabel(mode: TalentBookingPosture, locale: string): string {
  return `${isEs(locale) ? "Cambia el ajuste de tu sitio" : "Overrides your site setting"}: ${modeWord(mode, locale)}`;
}

export function inheritedModeLabel(mode: TalentBookingPosture, locale: string): string {
  return `${modeWord(mode, locale)} (${isEs(locale) ? "ajuste del sitio" : "site setting"})`;
}

export function overrideWarning(locale: string): string {
  return isEs(locale)
    ? "Este servicio se reserva distinto al ajuste de tu sitio."
    : "This service books differently from your site setting.";
}
