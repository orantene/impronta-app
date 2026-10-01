/**
 * AUTHORED OVERLAYS: committed files that say "the code now reflects the
 * editor-authored design up to version N". One file per design,
 * `<slug>.overlay.json`, with at least `{ "authoredVersion": N }`.
 *
 * Client-safe static registry (no fs at runtime, so bundling sees every file).
 * Register a new overlay by importing its JSON here. None exist yet: every
 * lookup returns null, which the sync rule reads as version 0.
 */
export interface AuthoredOverlay {
  authoredVersion: number;
}

const OVERLAYS: Readonly<Record<string, unknown>> = {};

function isOverlay(value: unknown): value is AuthoredOverlay {
  if (!value || typeof value !== "object") return false;
  const v = (value as { authoredVersion?: unknown }).authoredVersion;
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/** The committed overlay for `slug`, or null when absent or malformed. */
export function loadAuthoredOverlay(
  slug: string,
  registry: Readonly<Record<string, unknown>> = OVERLAYS,
): AuthoredOverlay | null {
  const raw = Object.prototype.hasOwnProperty.call(registry, slug) ? registry[slug] : undefined;
  return isOverlay(raw) ? raw : null;
}

/** `authoredVersion` of the committed overlay; 0 when there is none. */
export function authoredOverlayVersion(slug: string): number {
  return loadAuthoredOverlay(slug)?.authoredVersion ?? 0;
}
