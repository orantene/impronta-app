/**
 * TUL-808 / TUL-841: where a service happens follows where the person works.
 *
 * Onboarding asks "Where do you work?" (studio, home, or I go to the client).
 * A service must carry that answer as `attributes.where`, otherwise the editor
 * shows "At my studio" for a cleaning business and the public booking sheet
 * never asks for a service address (the sheet asks only when `where` includes
 * "client"). Pure: shared by the onboarding writer, the service editor and the
 * defaults screen.
 */

export type ServiceWhere = "studio" | "client" | "remote" | "agreed";
export type PlaceMode = "studio" | "home" | "client";

export const ALL_SERVICE_WHERE: readonly ServiceWhere[] = ["studio", "client", "remote", "agreed"];

export function isPlaceMode(v: unknown): v is PlaceMode {
  return v === "studio" || v === "home" || v === "client";
}

/** The `where` a new service gets from the person's place. "At home" is the person's own place, like a studio. */
export function whereForPlace(mode: PlaceMode | null | undefined): ServiceWhere[] {
  return mode === "client" ? ["client"] : ["studio"];
}

/**
 * The choices the editor offers. A person who goes to the client (a cleaning
 * business) is never offered "At my studio"; a choice already set on the item
 * stays visible so it can be removed.
 */
export function whereChoicesForPlace(mode: PlaceMode | null | undefined, current: readonly ServiceWhere[] = []): ServiceWhere[] {
  if (mode !== "client") return [...ALL_SERVICE_WHERE];
  return ALL_SERVICE_WHERE.filter((w) => w !== "studio" || current.includes("studio"));
}

/** What an item with no `where` of its own starts with: the saved default, else the place, else the studio. */
export function defaultWhere(savedDefault: readonly string[] | null | undefined, mode: PlaceMode | null | undefined): ServiceWhere[] {
  const saved = (savedDefault ?? []).filter((w): w is ServiceWhere => (ALL_SERVICE_WHERE as readonly string[]).includes(w));
  if (saved.length > 0) return saved;
  return whereForPlace(mode);
}
