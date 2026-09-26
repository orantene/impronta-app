/**
 * Talent selling defaults for prep time + booking sheet CTA posture.
 * Stored in `talent_profiles.selling_defaults` (JSON). Pure parse/resolve.
 */

export const TALENT_BOOKING_POSTURES = ["on_demand", "inquiry"] as const;
export type TalentBookingPosture = (typeof TALENT_BOOKING_POSTURES)[number];

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
  bookingPosture: "on_demand",
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

  const bookingPosture = isOneOf(obj.bookingPosture, TALENT_BOOKING_POSTURES)
    ? obj.bookingPosture
    : DEFAULTS.bookingPosture;

  let whoPrimaryCta = isOneOf(obj.whoPrimaryCta, WHO_PRIMARY_CTAS)
    ? obj.whoPrimaryCta
    : DEFAULTS.whoPrimaryCta;

  // Inquiry posture never confirms silently — coerce confirm_now → contact.
  if (bookingPosture === "inquiry" && whoPrimaryCta === "confirm_now") {
    whoPrimaryCta = "contact";
  }

  return { bufferBeforeMin, bookingPosture, whoPrimaryCta };
}

/**
 * Who-step primary action.
 * Path A (confirm) only when on-demand + Confirm now + offering can write.
 * Everything else opens the front-door chat (Path B).
 */
export function resolveWhoPrimaryAction(input: {
  bookingPosture: TalentBookingPosture;
  whoPrimaryCta: WhoPrimaryCta;
  offeringIntent: "instant" | "request";
}): "confirm" | "chat" {
  if (input.bookingPosture === "inquiry") return "chat";
  if (input.whoPrimaryCta === "contact" || input.whoPrimaryCta === "check_availability") {
    return "chat";
  }
  // confirm_now + on_demand
  return input.offeringIntent === "instant" ? "confirm" : "chat";
}

/** Force request-style sheet intent when talent posture is inquiry. */
export function forceRequestIntent(bookingPosture: TalentBookingPosture): boolean {
  return bookingPosture === "inquiry";
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
  bookingPosture: "on_demand",
  whoPrimaryCta: "confirm_now",
};

/**
 * Label for the who-step primary. When action is chat but the talent still
 * has Confirm now selected (e.g. request-only offering), keep the prior
 * chat CTA rather than promising a confirmation.
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
  return es ? "Chateá ahora" : "Chat now";
}
