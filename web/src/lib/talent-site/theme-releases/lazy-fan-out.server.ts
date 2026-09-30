import "server-only";

/**
 * THEME RELEASES (F108): lazy fan-out. "Open to talents" creates update rows
 * once, for the sites that exist at that moment. A site that lands below an
 * open release later (a new apply, a restore of an older design, a site made
 * before fan-out) would never hear about it. `ensureSiteThemeUpdates` closes
 * that gap: for every OPEN release (optin / default, published, not paused)
 * whose to-version is above the site's pin, and the site is inside the
 * rollout bucket and is not a demo, make sure the update row (+ bell) exists.
 * Idempotent (fanOutWithPorts skips existing rows / bells). Best-effort:
 * callers never fail because of it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { fanOutWithPorts, type FanOutPorts } from "./manager/fan-out";
import type { BellRow, FanOutSite, UpdateRow } from "./manager/notify";
import type { ThemeRelease } from "./types";

export type OpenRelease = Pick<ThemeRelease, "id" | "design_slug" | "to_version" | "rollout_pct" | "channel" | "status">;

export function isOpenRelease(r: Pick<ThemeRelease, "channel" | "status">): boolean {
  return r.status === "published" && (r.channel === "optin" || r.channel === "default");
}

/** PURE core (ports injected): fan the site out to every open release it sits below. */
export async function ensureUpdatesWithPorts(
  ports: FanOutPorts,
  site: FanOutSite & { pinnedVersion: number | null; isDemo: boolean },
  releases: ReadonlyArray<OpenRelease>,
): Promise<{ updates: number; bells: number }> {
  if (site.isDemo) return { updates: 0, bells: 0 };
  let updates = 0;
  let bells = 0;
  for (const r of releases) {
    if (!isOpenRelease(r)) continue;
    const f = await fanOutWithPorts(ports, r, [site]);
    updates += f.updates;
    bells += f.bells;
  }
  return { updates, bells };
}

function adminPorts(admin: SupabaseClient): FanOutPorts {
  return {
    existingUpdateSiteIds: async (releaseId) => {
      const { data, error } = await admin
        .from("talent_site_theme_updates")
        .select("talent_site_id")
        .eq("release_id", releaseId);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r) => r.talent_site_id as string));
    },
    existingBellUserIds: async (releaseId) => {
      const { data, error } = await admin
        .from("user_notifications")
        .select("user_id")
        .eq("origin_event_id", releaseId);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r) => r.user_id as string));
    },
    insertUpdates: async (rows: UpdateRow[]) => {
      const { error } = await admin.from("talent_site_theme_updates").insert(rows as never);
      if (error) throw new Error(error.message);
    },
    insertBells: async (rows: BellRow[]) => {
      const { error } = await admin.from("user_notifications").insert(rows as never);
      if (error) throw new Error(error.message);
    },
  };
}

export async function ensureSiteThemeUpdates(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<{ updates: number; bells: number }> {
  const none = { updates: 0, bells: 0 };
  try {
    const { data: site, error: siteErr } = await admin
      .from("talent_sites")
      .select("id, theme_design_slug, theme_design_version")
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    if (siteErr) {
      logServerError("themeUpdate.lazyFanOut.site", siteErr);
      return none;
    }
    const slug = (site as { theme_design_slug?: string | null } | null)?.theme_design_slug;
    if (!site || !slug) return none;
    const pinned = (site as { theme_design_version?: number | null }).theme_design_version;
    const pinnedVersion = typeof pinned === "number" ? pinned : null;

    const { data: rels, error: rErr } = await admin
      .from("talent_theme_releases")
      .select("id, design_slug, to_version, rollout_pct, channel, status")
      .eq("design_slug", slug)
      .eq("status", "published")
      .in("channel", ["optin", "default"])
      .gt("to_version", pinnedVersion ?? 0);
    if (rErr) {
      logServerError("themeUpdate.lazyFanOut.releases", rErr);
      return none;
    }
    const releases = (rels ?? []) as OpenRelease[];
    if (releases.length === 0) return none;

    const [profRes, titleRes] = await Promise.all([
      admin
        .from("talent_profiles")
        .select("user_id, preferred_locale, is_demo")
        .eq("id", talentProfileId)
        .maybeSingle(),
      // supabase-read-unchecked-ok: the title is decoration; the slug stands in.
      admin.from("talent_theme_catalog").select("title").eq("kind", "design").eq("slug", slug).maybeSingle(),
    ]);
    const prof = profRes.data as { user_id?: string; preferred_locale?: string | null; is_demo?: boolean } | null;
    if (!prof?.user_id) return none;
    return await ensureUpdatesWithPorts(
      adminPorts(admin),
      {
        siteId: (site as { id: string }).id,
        talentProfileId,
        userId: prof.user_id,
        designTitle: ((titleRes.data as { title?: string } | null)?.title ?? "").trim() || slug,
        locale: prof.preferred_locale ?? null,
        pinnedVersion,
        isDemo: prof.is_demo === true,
      },
      releases.sort((a, b) => a.to_version - b.to_version),
    );
  } catch (err) {
    logServerError("themeUpdate.lazyFanOut", err);
    return none;
  }
}
