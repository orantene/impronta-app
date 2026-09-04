/**
 * The four surfaces this allow-list can speak about, and the narrowing that
 * decides whether it may speak at all.
 *
 * Extracted from `surface-allow-list.ts`; that file is now the barrel and
 * remains the import path for every consumer.
 */

export type HostKind = "agency" | "app" | "hub" | "marketing";

const SURFACE_HOST_KINDS: readonly HostKind[] = [
  "agency",
  "app",
  "hub",
  "marketing",
];

/**
 * Narrow a resolved host context kind (which also carries `not_found` and
 * `talent_site`) to one of the four surfaces this allow-list describes.
 * Callers that need to answer "does this path exist on this host?" use it to
 * decide whether the allow-list can speak at all.
 */
export function isSurfaceHostKind(kind: string): kind is HostKind {
  return (SURFACE_HOST_KINDS as readonly string[]).includes(kind);
}
