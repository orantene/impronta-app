/**
 * Talent selling defaults for prep time + booking sheet CTA posture.
 * Stored in `talent_profiles.selling_defaults` (JSON). Pure parse/resolve.
 */

/**
 * Talent default booking mode (the mode a service INHERITS when its own
 * `talent_offerings.booking_mode` is null). Three values, same as a service.
 *
 * LEGACY `on_demand` (the default before WSF-B, and the parser's fallback
 * when nothing was stored) meant INSTANT: only `inquiry` forced request.
 * The parser maps `on_demand` to `instant` (auditor ruling 2026-09-28), and
 * an unset default also reads as instant, as it did. Readiness (PR C) may
 * still fall an effective instant back to request. Nothing writes
 * `on_demand` any more.
 */
export const TALENT_BOOKING_POSTURES = ["instant", "request", "inquiry"] as const;
export type TalentBookingPosture = (typeof TALENT_BOOKING_POSTURES)[number];

/** Platform default when the talent never chose (= the old on_demand fallback). */
export const PLATFORM_DEFAULT_BOOKING_POSTURE: TalentBookingPosture = "instant";

/** Read one stored posture value, mapping legacy values. Null = not set / unknown. */
export function parseBookingPosture(raw: unknown): TalentBookingPosture | null {
  if (raw === "on_demand") return "instant";
  return isOneOf(raw, TALENT_BOOKING_POSTURES) ? raw : null;
}

export const WHO_PRIMARY_CTAS = ["confirm_now", "contact", "check_availability"] as const;
export type WhoPrimaryCta = (typeof WHO_PRIMARY_CTAS)[number];

export type SellingBookingSettings = {
  /** Prep minutes blocked before each start (slot engine `bufferBeforeMin`). */
  bufferBeforeMin: number | null;
  /** Talent-wide: on-demand book vs push to contact/inquiry. */
  bookingPosture: TalentBookingPosture;
  /** Who-step primary label (+ matching Path A confirm vs Path B chat). */
  whoPrimaryCta: WhoPrimaryCta;
};

const DEFAULTS: SellingBookingSettings = {
  bufferBeforeMin: null,
  bookingPosture: PLATFORM_DEFAULT_BOOKING_POSTURE,
  whoPrimaryCta: "confirm_now",
};

function isOneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

/** Read booking-related keys from a raw selling_defaults blob. */
export function parseSellingBookingSettings(raw: unknown): SellingBookingSettings {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  if (!obj) return { ...DEFAULTS };

  const bufferBeforeMin =
    typeof obj.bufferBeforeMin === "number" && Number.isFinite(obj.bufferBeforeMin)
      ? Math.max(0, Math.trunc(obj.bufferBeforeMin))
      : null;

  const bookingPosture = parseBookingPosture(obj.bookingPosture) ?? DEFAULTS.bookingPosture;

  // No inquiry coercion any more: the default only governs services that
  // inherit. A service with its own instant mode books instantly (§1), and
  // resolveWhoPrimaryAction already sends every non-instant service to chat.
  const whoPrimaryCta = isOneOf(obj.whoPrimaryCta, WHO_PRIMARY_CTAS)
    ? obj.whoPrimaryCta
    : DEFAULTS.whoPrimaryCta;

  return { bufferBeforeMin, bookingPosture, whoPrimaryCta };
}

/**
 * Who-step primary action.
 * Path A (confirm) only when the offering's EFFECTIVE intent is instant
 * (resolved by deriveOfferingCta / resolveEffectiveBookingMode, which already
 * applied the talent default) and the talent kept Confirm now.
 * Everything else opens the front-door chat (Path B).
 */
export function resolveWhoPrimaryAction(input: {
  whoPrimaryCta: WhoPrimaryCta;
  offeringIntent: "instant" | "request";
}): "confirm" | "chat" {
  if (input.whoPrimaryCta === "contact" || input.whoPrimaryCta === "check_availability") {
    return "chat";
  }
  return input.offeringIntent === "instant" ? "confirm" : "chat";
}

export function whoPrimaryCtaLabel(kind: WhoPrimaryCta, locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  switch (kind) {
    case "contact":
      return es ? "Contactar" : "Contact";
    case "check_availability":
      return es ? "Consultar disponibilidad" : "Check availability";
    case "confirm_now":
    default:
      return es ? "Confirmar cita" : "Confirm now";
  }
}

export type CatalogSheetBookingSettings = {
  bookingPosture: TalentBookingPosture;
  whoPrimaryCta: WhoPrimaryCta;
};

export const DEFAULT_SHEET_BOOKING_SETTINGS: CatalogSheetBookingSettings = {
  bookingPosture: PLATFORM_DEFAULT_BOOKING_POSTURE,
  whoPrimaryCta: "confirm_now",
};

/**
 * Label for the who-step primary. When action is chat but the talent still
 * has Confirm now selected (e.g. request-only offering), use inquiry-submit
 * vocabulary — not "Chat now", which over-promises a live chat and under-sells
 * the request the sheet just collected (GRK-057).
 */
export function whoStepPrimaryLabel(input: {
  action: "confirm" | "chat";
  whoPrimaryCta: WhoPrimaryCta;
  locale: string;
}): string {
  if (input.action === "confirm") {
    return whoPrimaryCtaLabel("confirm_now", input.locale);
  }
  if (input.whoPrimaryCta === "contact" || input.whoPrimaryCta === "check_availability") {
    return whoPrimaryCtaLabel(input.whoPrimaryCta, input.locale);
  }
  const es = input.locale.toLowerCase().startsWith("es");
  return es ? "Enviar consulta" : "Send inquiry";
}

/**
 * When-step time group label. Inquiry/chat paths ask for a preferred time
 * (not an exact hold) — AUD-004.
 */
export function whenStepTimeGroupLabel(input: {
  action: "confirm" | "chat";
  locale: string;
}): string {
  const es = input.locale.toLowerCase().startsWith("es");
  if (input.action === "chat") {
    return es ? "Horario preferido" : "Preferred time";
  }
  return es ? "Elige un horario" : "Pick a time";
}

/** Choose-step CTA when advancing to the when step. */
export function chooseStepContinueLabel(input: {
  action: "confirm" | "chat";
  locale: string;
  needsOption: boolean;
}): string {
  const es = input.locale.toLowerCase().startsWith("es");
  if (input.needsOption) {
    return es ? "Elige una opción" : "Choose an option";
  }
  if (input.action === "chat") {
    return es ? "Continuar: horario preferido" : "Continue: preferred time";
  }
  return es ? "Continuar: elegir horario" : "Continue: pick a time";
}
