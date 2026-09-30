import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";

/**
 * F96 - the builder's Publish and the "Review and publish" flow must be ONE
 * publish. `talent_sites.site_published_at` is the source of truth for "the
 * site is live"; a builder publish on a never-published site used to flip
 * `talent_pages.status` only, leaving the chip on Draft and the URL dead.
 *
 * `delegateFirstPublish` runs the canonical `publishMaxSiteAction` (pages +
 * shell bake + `site_published_at` + theme + history) when the site has never
 * gone live. After the first publish it returns `delegated: false` and the
 * builder keeps its own per-surface publish path.
 */
export type FirstPublishDelegation =
  | { ok: true; delegated: boolean }
  | { ok: false; error: string };

export async function delegateFirstPublish(
  sb: SupabaseClient,
  talentProfileId: string,
  deps: { publishSite?: typeof publishMaxSiteAction } = {},
): Promise<FirstPublishDelegation> {
  const { data } = await sb
    .from("talent_sites")
    .select("site_published_at")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  const row = data as { site_published_at: string | null } | null;
  if (!row || row.site_published_at) return { ok: true, delegated: false };
  const res = await (deps.publishSite ?? publishMaxSiteAction)();
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, delegated: true };
}
