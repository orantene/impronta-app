/**
 * Talent-level booking sheet CTA mode (selling_defaults.sheetCtaMode).
 *
 * Oran: button label + behavior depend on talent settings —
 * Contact / Confirm now / Check availability — after a shared who-step.
 * Path A confirms; Path B opens front-door chat with contact prefilled.
 */

export const SHEET_CTA_MODES = ["confirm_now", "contact", "check_availability"] as const;
export type SheetCtaMode = (typeof SHEET_CTA_MODES)[number];

export function parseSheetCtaMode(raw: unknown): SheetCtaMode | null {
  if (typeof raw !== "string") return null;
  return (SHEET_CTA_MODES as readonly string[]).includes(raw) ? (raw as SheetCtaMode) : null;
}

/**
 * Who-step primary opens chat (Path B) instead of writing a booking (Path A).
 * `confirm_now` only confirms when the offering is already instant; request
 * offerings still chat so we never fake a confirmation.
 */
export function sheetWhoUsesChat(
  mode: SheetCtaMode | null | undefined,
  intent: "request" | "instant",
): boolean {
  if (mode === "contact" || mode === "check_availability") return true;
  if (mode === "confirm_now") return intent !== "instant";
  return intent === "request";
}

/** Effective write intent for submitCatalogBooking / confirm(). */
export function sheetEffectiveIntent(
  mode: SheetCtaMode | null | undefined,
  intent: "request" | "instant",
): "request" | "instant" {
  return sheetWhoUsesChat(mode, intent) ? "request" : "instant";
}

export function sheetWhoPrimaryLabel(
  mode: SheetCtaMode | null | undefined,
  intent: "request" | "instant",
  locale: string,
): string {
  const es = locale.startsWith("es");
  const chat = sheetWhoUsesChat(mode, intent);
  if (!chat) {
    // ES matches mockup "Confirmar cita"; EN uses Oran's "Confirm now".
    return es ? "Confirmar cita" : "Confirm now";
  }
  if (mode === "contact") return es ? "Contactar" : "Contact";
  if (mode === "check_availability") {
    return es ? "Consultar disponibilidad" : "Check availability";
  }
  return es ? "Chateá ahora" : "Chat now";
}
