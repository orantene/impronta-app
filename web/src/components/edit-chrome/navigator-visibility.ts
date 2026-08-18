/**
 * Navigator eye cycle. The schema already stores always / desktop-only /
 * mobile-only / hidden; the row control used to toggle only always ↔ hidden.
 */

export type NavigatorSectionVisibility =
  | "always"
  | "desktop-only"
  | "mobile-only"
  | "hidden";

const CYCLE: readonly NavigatorSectionVisibility[] = [
  "always",
  "desktop-only",
  "mobile-only",
  "hidden",
];

export function nextSectionVisibility(
  current: NavigatorSectionVisibility | null | undefined,
): NavigatorSectionVisibility {
  const index = CYCLE.indexOf(current ?? "always");
  return CYCLE[(index + 1) % CYCLE.length] ?? "always";
}
