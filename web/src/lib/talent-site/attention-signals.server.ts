import "server-only";

/**
 * TUL-392 — loads the talent's derived Attention signals (theme update
 * waiting, site needs publish) for the talent layout.
 *
 * Read-only on purpose: `loadTalentUpdateNotices` lazily fans out and closes
 * rows, which a layout read must not do. Never throws; null means "unknown",
 * so the shell keeps the inbox-only Attention count.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { goLiveHasPending } from "@/components/talent/site/maison-setup/go-live-pending";
import {
  buildTalentAttentionSignals,
  pickOpenThemeUpdates,
  type OpenThemeUpdate,
  type TalentAttentionSignal,
} from "@/lib/notifications/attention-signals";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadGoLiveSummary } from "@/lib/talent-site/history/history.server";

async function loadOpenThemeUpdates(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<OpenThemeUpdate[]> {
  const { data: rows, error } = await admin
    .from("talent_site_theme_updates")
    .select("release_id")
    .eq("talent_profile_id", talentProfileId)
    .eq("state", "available");
  if (error) throw error;
  const releaseIds = [...new Set(((rows ?? []) as Array<{ release_id: string }>).map((r) => r.release_id))];
  if (releaseIds.length === 0) return [];

  const [relRes, siteRes] = await Promise.all([
    admin
      .from("talent_theme_releases")
      .select("design_slug, to_version, channel, status")
      .in("id", releaseIds),
    admin
      .from("talent_sites")
      .select("theme_design_version")
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle(),
  ]);
  if (relRes.error) throw relRes.error;
  if (siteRes.error) throw siteRes.error;
  const releases = (relRes.data ?? []) as Array<{
    design_slug: string;
    to_version: number;
    channel: string;
    status: string;
  }>;
  const pin = (siteRes.data as { theme_design_version?: number | null } | null)?.theme_design_version;
  const pinned = typeof pin === "number" ? pin : null;

  const slugs = [...new Set(releases.map((r) => r.design_slug))];
  const titles = new Map<string, string>();
  if (slugs.length > 0) {
    // supabase-read-unchecked-ok: the title is decoration; the slug stands in.
    const { data } = await admin
      .from("talent_theme_catalog")
      .select("slug, title")
      .eq("kind", "design")
      .in("slug", slugs);
    for (const row of (data ?? []) as Array<{ slug: string; title: string | null }>) {
      if (row.title) titles.set(row.slug, row.title);
    }
  }
  return pickOpenThemeUpdates(releases, pinned, titles);
}

export async function loadTalentAttentionSignals(
  talentProfileId: string,
): Promise<TalentAttentionSignal[] | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  try {
    const [themeUpdates, goLive] = await Promise.all([
      loadOpenThemeUpdates(admin, talentProfileId),
      loadGoLiveSummary(admin, talentProfileId, "en"),
    ]);
    return buildTalentAttentionSignals({
      themeUpdates,
      sitePublish:
        goLive && goLiveHasPending(goLive)
          ? { draftRev: goLive.draftRev, firstPublish: goLive.firstPublish != null }
          : null,
    });
  } catch (err) {
    logServerError("talentAttentionSignals.load", err);
    return null;
  }
}
