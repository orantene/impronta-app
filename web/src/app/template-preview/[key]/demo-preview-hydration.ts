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
): Promise<TemplatePreviewHydration | null> {
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
  return buildTemplatePreviewHydration({ profile, media }, { isReal: false });
}
