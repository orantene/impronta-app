import { EDITORIAL_TYPE_SYSTEM_CSS, MAGAZINE_TYPE_SYSTEM_CSS } from "./design-type-system";
import { HIGHLIGHT_ACCENT_CSS, UTILITY_TYPE_SYSTEM_CSS } from "./design-type-system-utility";
import { UTILITY_BOOKING_CSS } from "./design-type-system-utility-booking";
import { MOTION_CSS } from "./motion-css";

/**
 * Type-system stylesheets. Always safe to mount: every rule is scoped to a
 * canvas root whose effective tokens set `type.system`, and every value is a
 * token var. The motion sheet (shared keyframes + the one reduced-motion rule)
 * is the exception: it is not design-specific, it covers every talent surface.
 */
export function TypeSystemStyle() {
  return (
    <>
      <style data-type-system-style="editorial">{EDITORIAL_TYPE_SYSTEM_CSS}</style>
      <style data-type-system-style="magazine">{MAGAZINE_TYPE_SYSTEM_CSS}</style>
      <style data-type-system-style="utility">{UTILITY_TYPE_SYSTEM_CSS}</style>
      <style data-type-system-style="utility-booking">{UTILITY_BOOKING_CSS}</style>
      <style data-type-system-style="highlight">{HIGHLIGHT_ACCENT_CSS}</style>
      <style data-type-system-style="motion">{MOTION_CSS.join("\n")}</style>
    </>
  );
}
