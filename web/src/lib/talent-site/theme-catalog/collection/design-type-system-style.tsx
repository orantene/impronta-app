import { EDITORIAL_TYPE_SYSTEM_CSS, MAGAZINE_TYPE_SYSTEM_CSS } from "./design-type-system";
import { HIGHLIGHT_ACCENT_CSS, UTILITY_TYPE_SYSTEM_CSS } from "./design-type-system-utility";
import { UTILITY_BOOKING_CSS } from "./design-type-system-utility-booking";
import { MOTION_CSS } from "./motion-css";

/**
 * Sheets `TypeSystemStyle` can emit. Public Max-site renders pass only the
 * sheets the active tokens need; the editor / unknown callers omit `systems`
 * and keep today's "mount everything" behavior.
 */
export type TypeSystemSheetId =
  | "editorial"
  | "magazine"
  | "utility"
  | "utility-booking"
  | "highlight"
  | "motion";

/**
 * Pick the type-system sheets a public canvas needs for `tokens`.
 *
 * Rules are scoped to `data-token-type-system` / accent attrs on the canvas
 * root, so shipping the other systems is pure HTML bloat (TUL-446: ~30 KB of
 * unused magazine/utility CSS on Maison editorial pages, doubled again in the
 * RSC flight payload).
 */
export function typeSystemSheetsForTokens(
  tokens: Readonly<Record<string, unknown>> | null | undefined,
): ReadonlyArray<TypeSystemSheetId> {
  const system = typeof tokens?.["type.system"] === "string" ? tokens["type.system"] : "editorial";
  const accent =
    typeof tokens?.["type.accent-style"] === "string" ? tokens["type.accent-style"] : null;
  const sheets: TypeSystemSheetId[] = ["motion"];
  if (system === "magazine") sheets.push("magazine");
  else if (system === "utility") {
    sheets.push("utility", "utility-booking");
  } else {
    sheets.push("editorial");
  }
  if (accent === "highlight") sheets.push("highlight");
  return sheets;
}

/**
 * Type-system stylesheets. Every rule is scoped to a canvas root whose
 * effective tokens set `type.system`, and every value is a token var. The
 * motion sheet (shared keyframes + the one reduced-motion rule) is the
 * exception: it is not design-specific, it covers every talent surface.
 *
 * @param systems When set, only those sheets mount. Omitted / null = all
 *   sheets (editor canvas, previews that flip designs, legacy callers).
 */
export function TypeSystemStyle({
  systems,
}: {
  systems?: ReadonlyArray<TypeSystemSheetId> | null;
} = {}) {
  const all = systems == null;
  const has = (id: TypeSystemSheetId) => all || systems.includes(id);
  return (
    <>
      {has("editorial") ? (
        <style data-type-system-style="editorial">{EDITORIAL_TYPE_SYSTEM_CSS}</style>
      ) : null}
      {has("magazine") ? (
        <style data-type-system-style="magazine">{MAGAZINE_TYPE_SYSTEM_CSS}</style>
      ) : null}
      {has("utility") ? (
        <style data-type-system-style="utility">{UTILITY_TYPE_SYSTEM_CSS}</style>
      ) : null}
      {has("utility-booking") ? (
        <style data-type-system-style="utility-booking">{UTILITY_BOOKING_CSS}</style>
      ) : null}
      {has("highlight") ? (
        <style data-type-system-style="highlight">{HIGHLIGHT_ACCENT_CSS}</style>
      ) : null}
      {has("motion") ? (
        <style data-type-system-style="motion">{MOTION_CSS.join("\n")}</style>
      ) : null}
    </>
  );
}
