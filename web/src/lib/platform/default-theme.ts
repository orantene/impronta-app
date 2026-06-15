import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  getThemePreset,
  DEFAULT_THEME_PRESET_SLUG,
} from "@/lib/site-admin/presets/theme-presets";
import {
  normalizeComponentStyleDefaults,
  type ComponentStyleDefaults,
} from "@/lib/site-admin/builder-node/component-style-defaults";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";

/**
 * The platform DEFAULT THEME ("Site Default") — the Modern 2026 register that
 * every NEW tenant + NEW talent page inherits. Stored on the `platform_settings`
 * singleton (id = true) in `default_theme_tokens` / `default_component_styles` /
 * `default_theme_preset_slug`. A super-admin edits it in Builder Lab → Site
 * Defaults.
 *
 * Mirrors operating-currency.ts / commercial-defaults.ts: the raw
 * `.from("platform_settings")` reads + writes live in this server-only lib so the
 * action files stay free of an untenanted `.from(...)` (platform_settings has no
 * tenant_id by design). New columns are asserted via `.returns<T>()` because
 * database.types.ts is not regenerated this wave (a known repo gotcha).
 *
 * **Single read point.** Both new-tenant provisioning and new-talent-page
 * defaults read `loadPlatformDefaultTheme()` — never the preset constant
 * directly — so a super-admin edit is the one source of truth. The modern preset
 * is only the FALLBACK when the row/columns are still empty.
 */

export type PlatformDefaultTheme = {
  /** Validated token map (registry-accepted subset). */
  tokens: Record<string, string>;
  /** Per-component default styles (normalized to the node-style schema). */
  componentStyles: ComponentStyleDefaults;
  /** Slug of the preset the default is based on (display / round-trip only). */
  presetSlug: string;
};

/**
 * The code-side fallback = the `modern-2026` preset (kept in sync with the
 * migration seed). Used when the platform_settings columns are still empty or
 * the singleton can't be read. Derived once at module load.
 */
function modernFallback(): PlatformDefaultTheme {
  const preset = getThemePreset(DEFAULT_THEME_PRESET_SLUG);
  return {
    tokens: preset ? validateThemePatch(preset.tokens).normalized : {},
    componentStyles: normalizeComponentStyleDefaults(preset?.componentStyles ?? {}),
    presetSlug: DEFAULT_THEME_PRESET_SLUG,
  };
}

type PlatformDefaultThemeRow = {
  default_theme_tokens: unknown;
  default_component_styles: unknown;
  default_theme_preset_slug: string | null;
  // Per-surface TALENT override (Builder Lab → Site Defaults → Talent). NULL on
  // any column → the surface falls back to the shared (agency) default above.
  default_theme_tokens_talent: unknown;
  default_component_styles_talent: unknown;
  default_theme_preset_slug_talent: string | null;
};

/** Which surface's default to read/write. "workspace" = the shared default that
 *  every new tenant inherits (and the historical single default); "talent" = the
 *  talent-page override, which falls back to the shared default when unset. */
export type PlatformThemeSurface = "talent" | "workspace";

/**
 * Coerce a stored jsonb token blob into a string→string map. Non-string values
 * are dropped (the renderer only consumes string tokens).
 */
function asTokenMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

/**
 * The platform-wide default theme (the `platform_settings` singleton). Cached
 * per request. Falls back to the Modern 2026 preset when the row or columns are
 * empty (fresh DB / migration not yet applied) so callers always get a usable
 * theme. Stored tokens are re-validated against the registry as defence-in-depth.
 */
export const loadPlatformDefaultTheme = cache(
  async (
    surface: PlatformThemeSurface = "workspace",
  ): Promise<PlatformDefaultTheme> => {
    const fallback = modernFallback();
    try {
      const admin = createServiceRoleClient();
      if (!admin) return fallback;
      const { data } = await admin
        .from("platform_settings")
        .select(
          "default_theme_tokens, default_component_styles, default_theme_preset_slug, default_theme_tokens_talent, default_component_styles_talent, default_theme_preset_slug_talent",
        )
        .eq("id", true)
        .maybeSingle()
        .returns<PlatformDefaultThemeRow>();
      if (!data) return fallback;

      // The shared (agency) default — what every new tenant inherits, and the
      // talent fallback when no talent-specific override is set.
      const shared = ((): PlatformDefaultTheme => {
        if (data.default_theme_tokens == null) return fallback;
        const tokens = validateThemePatch(asTokenMap(data.default_theme_tokens)).normalized;
        if (Object.keys(tokens).length === 0) return fallback;
        return {
          tokens,
          componentStyles: normalizeComponentStyleDefaults(data.default_component_styles),
          presetSlug: data.default_theme_preset_slug ?? DEFAULT_THEME_PRESET_SLUG,
        };
      })();

      if (surface === "workspace") return shared;

      // Talent: prefer the talent override; fall back to the shared default.
      if (data.default_theme_tokens_talent != null) {
        const tTokens = validateThemePatch(
          asTokenMap(data.default_theme_tokens_talent),
        ).normalized;
        if (Object.keys(tTokens).length > 0) {
          return {
            tokens: tTokens,
            componentStyles: normalizeComponentStyleDefaults(
              data.default_component_styles_talent,
            ),
            presetSlug:
              data.default_theme_preset_slug_talent ?? DEFAULT_THEME_PRESET_SLUG,
          };
        }
      }
      return shared;
    } catch (err) {
      logServerError("platform.loadDefaultTheme", err);
      return fallback;
    }
  },
);

/**
 * Persist the platform default theme (singleton). Called by the super-admin
 * `use server` action AFTER it has gated the caller. Tokens + componentStyles
 * are validated/normalized here too (defence-in-depth) so a malformed payload
 * can't land in the singleton that seeds every new site.
 */
export async function writePlatformDefaultTheme(
  surface: PlatformThemeSurface,
  updatedBy: string,
  input: {
    tokens: Record<string, string>;
    componentStyles: ComponentStyleDefaults;
    presetSlug: string | null;
  },
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };

    const tokens = validateThemePatch(input.tokens).normalized;
    const componentStyles = normalizeComponentStyleDefaults(input.componentStyles);

    const surfacePatch =
      surface === "talent"
        ? {
            default_theme_tokens_talent: tokens,
            default_component_styles_talent: componentStyles,
            default_theme_preset_slug_talent: input.presetSlug,
          }
        : {
            default_theme_tokens: tokens,
            default_component_styles: componentStyles,
            default_theme_preset_slug: input.presetSlug,
          };

    const { error } = await admin
      .from("platform_settings")
      .update({
        ...surfacePatch,
        default_theme_updated_at: new Date().toISOString(),
        default_theme_updated_by: updatedBy,
      })
      .eq("id", true);
    if (error) {
      logServerError("platform.writeDefaultTheme", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeDefaultTheme", err);
    return { ok: false };
  }
}
