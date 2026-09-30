import "server-only";

/**
 * THEME RELEASES (Phase 3): the merge base for one site. The exact payload of
 * the site's PINNED version: its `talent_theme_versions` snapshot, or the
 * release's saved from_version payload when the site sits on from_version.
 * Anything else is null (unknownBase: only new blocks can be offered).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";
import { loadThemeVersionPayload } from "../theme-versions.server";
import type { ThemeRelease } from "../types";

export type BaseResolver = (pinnedVersion: number | null) => Promise<DesignPayload | null>;

/** Per-run resolver: snapshot of the pinned version (cached), else the saved from_version payload. */
export function makeBaseResolver(
  admin: SupabaseClient,
  release: Pick<ThemeRelease, "design_slug" | "from_version" | "base_payload">,
): BaseResolver {
  const cache = new Map<number, DesignPayload | null>();
  return async (pinned) => {
    if (pinned === null) return null;
    if (!cache.has(pinned)) {
      let payload = await loadThemeVersionPayload(admin, release.design_slug, pinned);
      if (!payload && pinned === release.from_version && release.base_payload && typeof release.base_payload === "object") {
        payload = release.base_payload as DesignPayload;
      }
      cache.set(pinned, payload);
    }
    return cache.get(pinned) ?? null;
  };
}
