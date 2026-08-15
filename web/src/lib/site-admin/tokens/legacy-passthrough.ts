/**
 * Legacy theme keys that live INSIDE `agency_branding.theme_json` but are NOT
 * design tokens in `TOKEN_REGISTRY`.
 *
 * They are written by the settings / brand-library save paths as a PUBLIC
 * projection (e.g. `agencies.settings.branding.logo_url` mirrors into
 * `theme_json.logo_url` because `agency_branding` is publicly readable while
 * `agencies.settings` is staff-only) and are read at render time
 * (`shell-brand-logo.ts`, favicon serving, watermark pipeline).
 *
 * The design pipeline (`saveDesignDraft` / `publishDesign` /
 * `validateThemePatch`) is registry-strict: an unknown key rejects the save,
 * and a passing save writes ONLY the normalized registry keys. Two failure
 * modes fall out of that unless these keys are handled explicitly:
 *
 *   1. A stored draft carrying one of these keys hard-fails every merge save,
 *      kit apply, and publish ("This card kit could not be applied.",
 *      PUBLISH_NOT_READY) — bricking the Card Design studio for the tenant.
 *   2. A publish REPLACES `theme_json` with the normalized draft, silently
 *      stripping `logo_url` / `favicon_url` / `watermark_preset` from the
 *      live row until the next settings save re-mirrors them. That is how the
 *      Impronta logo vanished in the 2026-08-15 white-theme incident.
 *
 * Contract: the design pipeline treats these keys as opaque passthrough — it
 * never validates, edits, or drops them. Callers split them out before
 * registry validation and re-attach the STORED values on write.
 */

/** Keys the design pipeline must carry through untouched. */
export const LEGACY_THEME_PASSTHROUGH_KEYS: ReadonlySet<string> = new Set([
  "logo_url",
  "favicon_url",
  "watermark_preset",
]);

/**
 * Split a raw theme map into the registry-candidate slice (everything the
 * design pipeline validates) and the legacy passthrough slice (carried as-is).
 * Values are `unknown` because legacy entries are not all strings
 * (`watermark_preset` is a JSON object).
 */
export function splitLegacyThemeKeys(map: Record<string, unknown>): {
  registryCandidate: Record<string, unknown>;
  legacy: Record<string, unknown>;
} {
  const registryCandidate: Record<string, unknown> = {};
  const legacy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(map)) {
    if (LEGACY_THEME_PASSTHROUGH_KEYS.has(key)) legacy[key] = value;
    else registryCandidate[key] = value;
  }
  return { registryCandidate, legacy };
}
