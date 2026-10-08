/**
 * Demo preview safety (Maison audit P0). The theme preview renders with no
 * tenant and no `catalogBookingLive`, so services_catalog mounts its booking
 * sheet in `mode="demo"` (render.tsx: `catalogBookingLive ? "live" : "demo"`)
 * and nothing is written. This guard adds the visible half: taps on booking /
 * inquiry controls show "Demo only · nothing was booked", and links that would
 * leave the preview (a real /book page, WhatsApp, mail) are blocked.
 */

export const PREVIEW_DEMO_NOTE = {
  en: "Demo only · nothing was booked",
  es: "Solo demo · no se reservó nada",
} as const;

export function previewDemoNote(locale: "en" | "es"): string {
  return PREVIEW_DEMO_NOTE[locale === "es" ? "es" : "en"];
}

/** Minimal element surface so the classifier is unit-testable without a DOM. */
export type GuardElement = {
  closest(selector: string): GuardElement | null;
  getAttribute(name: string): string | null;
};

/** Booking / inquiry islands rendered in demo mode. */
export const DEMO_BOOKING_SELECTOR =
  '[data-booking-mode="demo"], [data-catalog-booking="demo"], [data-catalog-purchase-mode="demo"]';

export type PreviewClickVerdict =
  /** Stop the navigation and show the note. */
  | "block"
  /** Let the demo control run (it writes nothing) and show the note. */
  | "note"
  | null;

export function classifyPreviewClick(target: GuardElement | null): PreviewClickVerdict {
  if (!target) return null;
  const anchor = target.closest("a[href]");
  if (anchor) {
    const href = (anchor.getAttribute("href") ?? "").trim();
    // In-page anchors keep working (menu → #services etc.).
    if (href === "" || href.startsWith("#")) return null;
    return "block";
  }
  const control = target.closest("button, [role='button']");
  if (control && control.closest(DEMO_BOOKING_SELECTOR)) return "note";
  return null;
}
