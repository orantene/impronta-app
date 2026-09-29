import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import {
  loadTalentStarterMedia,
  loadTalentStarterProfileData,
} from "@/lib/talent-site/server/load-starter-data";
import {
  buildTemplatePreviewHydration,
  type TemplatePreviewHydration,
} from "@/lib/talent-site/templates/preview-hydration";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  loadMaxSiteByProfileId,
  loadMaxSiteDesignSlug,
  loadMaxSitePages,
} from "@/lib/talent-site/server/load-max-site";
import type { DemoPreviewSource } from "./demo-preview-source";

/**
 * P4 — render a gallery-meta demo talent's content read-only in the theme
 * preview. `source` comes ONLY from `resolveDemoPreviewSource` (the
 * gallery-meta allow-list), never from a raw id. Requires a signed-in talent.
 * Returns null on any miss so the route falls back to its normal hydration.
 * Preview rendering writes nothing; the demo guard blocks booking taps.
 */
export async function resolveDemoPreviewHydration(
  source: DemoPreviewSource,
): Promise<(TemplatePreviewHydration & { demoTalentProfileId: string }) | null> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("profile_code", source.profileCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logServerError("template-preview.demo.lookup", error);
    return null;
  }
  const id = (data as { id?: string } | null)?.id;
  if (!id) return null;
  const profile = await loadTalentStarterProfileData(id);
  if (!profile) return null;
  const media = await loadTalentStarterMedia(id, profile.displayName);
  // The demo's id rides along so the preview can bind its live widgets
  // (services, portfolio, reviews, visit) exactly as the demo site does.
  return {
    ...buildTemplatePreviewHydration({ profile, media }, { isReal: false }),
    demoTalentProfileId: id,
  };
}

/**
 * The demo talent's SAVED page (its published shell + home body), so the
 * preview shows the demo exactly as its own site does: her headline, eyebrow,
 * lede and photos as edited in the builder, not the design's template copy.
 * Only when the demo's site wears THIS design; null otherwise (the caller
 * then renders the design tree). Read-only.
 */
export async function loadDemoSavedTrees(
  demoTalentProfileId: string,
  designSlug: string,
): Promise<{ shellTree: BuilderNode[]; homeTree: BuilderNode[] } | null> {
  const [slug, site, pages] = await Promise.all([
    loadMaxSiteDesignSlug(demoTalentProfileId),
    loadMaxSiteByProfileId(demoTalentProfileId),
    loadMaxSitePages(demoTalentProfileId),
  ]);
  if (slug !== designSlug || !site) return null;
  const home = pages.find((p) => p.isHome);
  const body = home ? (Array.isArray(home.blocksPublished) ? home.blocksPublished : home.blocks) : null;
  const shell = Array.isArray(site.shellPublished) ? site.shellPublished : site.shellTree;
  if (!Array.isArray(body) || body.length === 0 || !Array.isArray(shell)) return null;
  return { shellTree: shell as BuilderNode[], homeTree: body as BuilderNode[] };
}
