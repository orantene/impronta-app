/**
 * AUTHORED OVERLAYS: committed files that say "the code now reflects the
 * editor-authored design up to version N". One file per design,
 * `<slug>.overlay.json` (format: `overlay.ts` AuthoredOverlayFile), written by
 * `scripts/theme-authoring/pull-authored.mts`.
 *
 * Client-safe static registry (no fs at runtime, so bundling sees every file).
 * Register a new overlay by importing its JSON here (the pull script does it).
 */
import type { DesignPayload } from "../../types";
import { applyAuthoredOverlay, overlayPaletteOverrides, type AuthoredOverlayFile } from "./overlay";
import folioOverlay from "./folio.overlay.json";
// pull-authored:imports

export type { AuthoredOverlayFile } from "./overlay";

/** Minimal shape the sync rule needs; registered files are full AuthoredOverlayFile. */
export interface AuthoredOverlay {
  authoredVersion: number;
}

// The pull script inserts imports and entries at the pull-authored markers.
const OVERLAYS: Readonly<Record<string, unknown>> = {
  folio: folioOverlay,
  // pull-authored:entries
};

function isOverlay(value: unknown): value is AuthoredOverlay {
  if (!value || typeof value !== "object") return false;
  const v = (value as { authoredVersion?: unknown }).authoredVersion;
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function isOverlayFile(value: unknown): value is AuthoredOverlayFile {
  if (!isOverlay(value)) return false;
  const v = value as unknown as Record<string, unknown>;
  return (
    typeof v.codeHash === "string" &&
    typeof v.payloadHash === "string" &&
    !!v.tokenDefaults && typeof v.tokenDefaults === "object" &&
    !!v.props && typeof v.props === "object" &&
    Array.isArray(v.removed) &&
    Array.isArray(v.added) &&
    !!v.order && typeof v.order === "object" &&
    !!v.labelsEs && typeof v.labelsEs === "object" &&
    (v.palettes === undefined || (!!v.palettes && typeof v.palettes === "object"))
  );
}

/** The committed overlay for `slug`, or null when absent or malformed. */
export function loadAuthoredOverlay(
  slug: string,
  registry: Readonly<Record<string, unknown>> = OVERLAYS,
): AuthoredOverlay | null {
  const raw = Object.prototype.hasOwnProperty.call(registry, slug) ? registry[slug] : undefined;
  return isOverlay(raw) ? raw : null;
}

/** The full patch for `slug` (apply-able), or null when absent or not a full overlay file. */
export function loadAuthoredOverlayFile(
  slug: string,
  registry: Readonly<Record<string, unknown>> = OVERLAYS,
): AuthoredOverlayFile | null {
  const raw = Object.prototype.hasOwnProperty.call(registry, slug) ? registry[slug] : undefined;
  return isOverlayFile(raw) ? raw : null;
}

/** Every registered full overlay, by slug (CI test, label/token merges). */
export function registeredAuthoredOverlays(): ReadonlyArray<readonly [string, AuthoredOverlayFile]> {
  const out: Array<readonly [string, AuthoredOverlayFile]> = [];
  for (const slug of Object.keys(OVERLAYS)) {
    const o = loadAuthoredOverlayFile(slug);
    if (o) out.push([slug, o] as const);
  }
  return out;
}

/** `authoredVersion` of the committed overlay; 0 when there is none. */
export function authoredOverlayVersion(slug: string): number {
  return loadAuthoredOverlay(slug)?.authoredVersion ?? 0;
}

/**
 * `buildPayload` for a design: the raw code payload with its committed
 * overlay applied (canonical authored form), or the raw payload when no full
 * overlay is registered. Throws AuthoredOverlayError on a collision.
 */
export function buildWithAuthoredOverlay(slug: string, buildRaw: () => DesignPayload): DesignPayload {
  const overlay = loadAuthoredOverlayFile(slug);
  const raw = buildRaw();
  return overlay ? applyAuthoredOverlay(raw, overlay) : raw;
}

/** Committed palette colour overrides for `slug` (`paletteKey -> token -> value`); {} when none. */
export function authoredPaletteOverrides(slug: string): Readonly<Record<string, Record<string, string>>> {
  return overlayPaletteOverrides(loadAuthoredOverlayFile(slug));
}
