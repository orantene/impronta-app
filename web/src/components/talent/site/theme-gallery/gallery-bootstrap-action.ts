"use server";

/**
 * Theme gallery bootstrap (0.C). One round trip for `TalentMaxSiteManager`:
 * is the gallery on for this talent, and if so, the tier-filtered catalog
 * (via 0.B's `loadTalentThemeCatalog` contract) plus the site's current
 * design/look selection so the gallery opens pre-selected.
 *
 * Kept in `theme-gallery/` (this role's own directory) rather than added to
 * `site-management-actions.ts` / `site-management-types.ts`, which this pass
 * does not touch. `TALENT_THEME_GALLERY_ENABLED` off (or a failed gate)
 * degrades to `{ enabled: false }` so the manager falls back to the old
 * `TemplateGallery` silently, never a thrown error.
 */
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/talent-site/server/site-action-gate";
import { loadTalentThemeCatalog } from "@/lib/talent-site/theme-catalog/load-catalog.server";
import type { GalleryCatalogEntry } from "./types";

export type ThemeGalleryBootstrap =
  | { enabled: false }
  | {
      enabled: true;
      talentProfileId: string;
      designs: GalleryCatalogEntry[];
      looks: GalleryCatalogEntry[];
      currentDesignSlug: string | null;
      currentLookSlug: string | null;
    };

export type ThemeGalleryBootstrapResult =
  | { ok: true; data: ThemeGalleryBootstrap }
  | { ok: false; error: string };

export async function loadThemeGalleryBootstrapAction(): Promise<ThemeGalleryBootstrapResult> {
  if (!isTalentThemeGalleryEnabled()) {
    return { ok: true, data: { enabled: false } };
  }

  // Free → personalSiteEdit ONLY when the Maison theme flag is on. Otherwise
  // keep today's Web Office gate (personalSiteSections) so flag-off production
  // is unchanged (TALENT_THEME_GALLERY_ENABLED is already on in prod).
  const g = await gate(
    isTalentMaisonThemeEnabled() ? "personalSiteEdit" : "personalSiteSections",
  );
  if (!g.ok) {
    // Not entitled / not signed in — the manager's own gate already handles the
    // upsell; this bootstrap just degrades to the old gallery rather than
    // surfacing a second error.
    return { ok: true, data: { enabled: false } };
  }

  try {
    const catalog = await loadTalentThemeCatalog({ planKey: g.planKey });

    let currentDesignSlug: string | null = null;
    let currentLookSlug: string | null = null;
    const admin = createServiceRoleClient();
    if (admin) {
      const { data, error } = await admin
        .from("talent_sites")
        .select("theme_design_slug, theme_look_slug")
        .eq("talent_profile_id", g.talentProfileId)
        .maybeSingle();
      if (error) {
        logServerError("themeGallery.bootstrap.currentSelection", error);
      } else if (data) {
        const row = data as { theme_design_slug: string | null; theme_look_slug: string | null };
        currentDesignSlug = row.theme_design_slug ?? null;
        currentLookSlug = row.theme_look_slug ?? null;
      }
    }

    return {
      ok: true,
      data: {
        enabled: true,
        talentProfileId: g.talentProfileId,
        designs: catalog.designs,
        looks: catalog.looks,
        currentDesignSlug,
        currentLookSlug,
      },
    };
  } catch (err) {
    logServerError("themeGallery.bootstrap.catalog", err);
    // Catalog load failed (e.g. 0.B not deployed yet) — degrade to the old
    // gallery rather than breaking the manager page.
    return { ok: true, data: { enabled: false } };
  }
}
