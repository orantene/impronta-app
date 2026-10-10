/**
 * Shared hero booking CTA for every theme (TUL-516 W3-4).
 * Theme seeds never invent a per-talent booking button: they reuse this row
 * (`Book an appointment` → `#book`). Locale + site CTA mode rewrite the label
 * via `SEEDED_MODE_COPY` in design-label-locale.
 */
import { TALENT_BOOK_HREF } from "@/lib/talent-site/contact-channels";

import type { HeroCtaRow } from "./section-kit-hero-parts";

/** Mode-dependent seed label (instant → Reservar cita, inquiry → Escríbeme). */
export const HERO_BOOK_LABEL = "Book an appointment";

/** Opens the shared booking sheet (`#book`), never chat and never scroll-only `#services`. */
export const HERO_BOOK_HREF = TALENT_BOOK_HREF;

/** Ghost companion: jump to the menu without opening the sheet. */
export const HERO_SEE_SERVICES_LABEL = "See services";
export const HERO_SEE_SERVICES_HREF = "#services";

/** Primary booking + ghost See services — used by Maison, Gridline, Solace, Mono, Frame. */
export function sharedHeroBookingCtaRow(): HeroCtaRow {
  return {
    primaryLabel: HERO_BOOK_LABEL,
    primaryHref: HERO_BOOK_HREF,
    secondaryLabel: HERO_SEE_SERVICES_LABEL,
    secondaryHref: HERO_SEE_SERVICES_HREF,
  };
}
