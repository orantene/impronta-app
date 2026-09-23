/**
 * Shared payload builder for the built-in Looks. Every `looks/*.ts` entry
 * calls `buildBuiltinLookPayload(presetSlug)` so a Look's token map is
 * ALWAYS derived from `site-admin/presets/theme-presets.ts` (the
 * agency-side preset registry), never hand-typed — the two registries stay
 * in sync by construction.
 *
 * A Look may only own `color.*`, `typography.*` and `background.mode`
 * (`LOOK_OWNED_TOKEN_PREFIXES` / `LOOK_OWNED_TOKEN_KEYS`); a preset's other
 * keys (radius, shadow, spacing, motion, shell, template, directory.*,
 * profile.*, icon.family, ...) are agency-shell concerns a talent Look does
 * not touch, so they are filtered out here rather than left for
 * `validateLook` to reject.
 *
 * GAP FOUND + FIXED HERE: five of the six presets (every one except
 * `modern-2026`) rely on `background.mode` for their canvas colour and never
 * set `color.background` explicitly (see `theme-presets.ts`'s own comment on
 * why `color.background`'s registry default is `""` — "follow the active
 * background.mode"). `validateLook` requires `color.background` explicitly
 * (`LOOK_REQUIRED_TOKEN_KEYS`) because a Look is evaluated on its own, with
 * no `background.mode` CSS re-pin to fall back on.
 * `IMPLICIT_BACKGROUND_BY_PRESET_SLUG` below supplies that value from the
 * SAME preset's `previewSwatch.background` (the colour the preset already
 * advertises as its canvas), so every seeded Look states explicitly the
 * colour its source preset only implied.
 */
import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import { getThemePreset } from "@/lib/site-admin/presets/theme-presets";
import { isLookOwnedTokenKey } from "../../look-layer";
import { LOOK_MIN_INK_CONTRAST, LOOK_MIN_PRIMARY_CONTRAST } from "../../validate";
import type { LookPayload, ThemePreviewSwatch } from "../../types";

/**
 * `color.background` for presets that never set it explicitly, taken from
 * the preset's own `previewSwatch.background` (its already-declared canvas
 * colour for `background.mode`). `modern-2026` sets `color.background`
 * itself and is not listed.
 */
const IMPLICIT_BACKGROUND_BY_PRESET_SLUG: Record<string, string> = {
  neutral: "#ffffff",
  classic: "#ffffff",
  "editorial-bridal": "#f6f1ea",
  "studio-minimal": "#ffffff",
  "editorial-noir": "#0a0a0a",
};

/**
 * Build a Look payload from a `theme-presets.ts` slug: keep only the
 * Look-owned keys (colour + typography + background.mode), then fill in
 * `color.background` when the preset left it implicit. Throws at import
 * time (module load, not request time) if the slug is unknown or the
 * resulting Look fails contrast — a broken built-in must fail the build /
 * `builtins.test.ts`, never ship silently.
 */
export function buildBuiltinLookPayload(presetSlug: string): LookPayload {
  const preset = getThemePreset(presetSlug);
  if (!preset) {
    throw new Error(`buildBuiltinLookPayload: unknown theme preset "${presetSlug}".`);
  }
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(preset.tokens)) {
    if (isLookOwnedTokenKey(key)) tokens[key] = value;
  }
  if (!tokens["color.background"]) {
    const implicit = IMPLICIT_BACKGROUND_BY_PRESET_SLUG[presetSlug];
    if (!implicit) {
      throw new Error(
        `buildBuiltinLookPayload: preset "${presetSlug}" has no color.background and no implicit fallback registered.`,
      );
    }
    tokens["color.background"] = implicit;
  }

  const ink = tokens["color.ink"];
  const primary = tokens["color.primary"];
  const background = tokens["color.background"];
  const inkRatio = ink ? contrastRatio(ink, background) : null;
  const primaryRatio = primary ? contrastRatio(primary, background) : null;
  if (inkRatio !== null && inkRatio < LOOK_MIN_INK_CONTRAST) {
    throw new Error(
      `buildBuiltinLookPayload: preset "${presetSlug}" ink/background contrast ${inkRatio.toFixed(2)}:1 is below ${LOOK_MIN_INK_CONTRAST}:1 — adjust the LOOK (not the preset); see the module comment.`,
    );
  }
  if (primaryRatio !== null && primaryRatio < LOOK_MIN_PRIMARY_CONTRAST) {
    throw new Error(
      `buildBuiltinLookPayload: preset "${presetSlug}" primary/background contrast ${primaryRatio.toFixed(2)}:1 is below ${LOOK_MIN_PRIMARY_CONTRAST}:1 — adjust the LOOK (not the preset); see the module comment.`,
    );
  }

  return { tokens };
}

/**
 * Client-safe card-art swatch from a built Look's tokens. Every seeded Look
 * sets all five keys (verified by `builtins.test.ts`), so this never falls
 * back silently in production — the `|| "#000000"` guards are for a
 * hypothetical future Look that a test would catch, not a real gap today.
 */
export function swatchFromLookTokens(tokens: Readonly<Record<string, string>>): ThemePreviewSwatch {
  return {
    primary: tokens["color.primary"] || "#000000",
    secondary: tokens["color.secondary"] || "#000000",
    accent: tokens["color.accent"] || "#000000",
    background: tokens["color.background"] || "#ffffff",
    ink: tokens["color.ink"] || "#000000",
  };
}
