"use server";

/**
 * admin-platform-default-theme.ts — super-admin action for the platform DEFAULT
 * THEME (Site Default) edited in Builder Lab → Site Defaults.
 *
 * The Site Default is the Modern 2026 theme that every NEW tenant + NEW talent
 * page inherits. A super-admin can re-skin it here (apply a preset, edit key
 * tokens) and every site provisioned afterwards starts on the new look.
 *
 * Pattern mirrors admin-platform-currency.ts: platform-admin gated, `{ ok, error }`
 * result. The DB read/write lives in the server-only lib
 * `@/lib/platform/default-theme` so this action file stays free of a raw
 * untenanted `.from(...)` (the no-untenanted-from ratchet).
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import {
  loadPlatformDefaultTheme,
  writePlatformDefaultTheme,
  type PlatformDefaultTheme,
  type PlatformThemeSurface,
} from "@/lib/platform/default-theme";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";
import {
  normalizeComponentStyleDefaults,
  type ComponentStyleDefaults,
} from "@/lib/site-admin/builder-node/component-style-defaults";

/**
 * Load the current platform default theme. Gated to super-admins (the Lab is
 * already super-admin gated, but this is the action a client component calls).
 */
export async function loadPlatformDefaultThemeAction(
  surface: PlatformThemeSurface = "workspace",
): Promise<
  | { ok: true; theme: PlatformDefaultTheme }
  | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Platform admin access required." };
  }
  const theme = await loadPlatformDefaultTheme(surface);
  return { ok: true, theme };
}

/**
 * Persist the platform default theme (Save/Publish from the Site Defaults
 * editor). Tokens + component styles are re-validated/normalized in the lib
 * write. New sites provisioned after this read the updated default.
 */
export async function savePlatformDefaultThemeAction(input: {
  surface?: PlatformThemeSurface;
  tokens: Record<string, string>;
  componentStyles: ComponentStyleDefaults;
  presetSlug: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Platform admin access required." };
  }

  // Defence-in-depth: validate/normalize before handing to the lib (which also
  // validates). A payload that validates to zero tokens is a bug, not a wipe.
  const tokens = validateThemePatch(input.tokens).normalized;
  if (Object.keys(tokens).length === 0) {
    return { ok: false, error: "No valid tokens to save." };
  }
  const componentStyles = normalizeComponentStyleDefaults(input.componentStyles);

  const result = await writePlatformDefaultTheme(
    input.surface ?? "workspace",
    session.user.id,
    {
      tokens,
      componentStyles,
      presetSlug: input.presetSlug,
    },
  );
  if (!result.ok) return { ok: false, error: CLIENT_ERROR.update };
  return { ok: true };
}
