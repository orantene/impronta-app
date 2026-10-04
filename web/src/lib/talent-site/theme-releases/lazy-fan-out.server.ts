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
import { supersedeOlderBells } from "./theme-bells.server";
import { fanOutWithPorts, type FanOutPorts } from "./manager/fan-out";
import type { BellRow, FanOutSite, UpdateRow } from "./manager/notify";
import { hasCriticalCandidates, isOfferActionable, pinnedBaseKnown } from "./offer-actionable.server";
import { combineReleaseItems } from "./talent-update/view";
import type { ReleaseItem, ThemeRelease } from "./types";

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
      await supersedeOlderBells(admin, rows);
    },
  };
}

/**
 * F124: rows that say `applied` for a release ABOVE her pin are stale (a
 * restore or undo took her back). Put them back to `available`, keeping their
 * report (added blocks) and a note. Rows closed as nothing_applicable stay closed.
 */
export async function reopenAppliedRows(admin: SupabaseClient, siteId: string, aboveReleaseIds: string[]): Promise<number> {
  if (aboveReleaseIds.length === 0) return 0;
  const { data, error } = await admin
    .from("talent_site_theme_updates")
    .select("id, release_id, report")
    .eq("talent_site_id", siteId)
    .eq("state", "applied")
    .in("release_id", aboveReleaseIds);
  if (error) {
    logServerError("themeUpdate.reopen.read", error);
    return 0;
  }
  let n = 0;
  const applied = (data ?? []) as Array<{ id: string; release_id?: string; report?: Record<string, unknown> | null }>;
  // F129: a row closed nothing_applicable before critical fixes could reach noBase
  // sites is re-evaluated ONCE: reopened when its release has a critical item not yet
  // applied. The notice check then closes it again with criticalChecked when nothing changes.
  const itemsOf = new Map<string, ReleaseItem[]>();
  if (applied.some((r) => r.report?.reason === "nothing_applicable" && !r.report.criticalChecked)) {
    const { data: rels, error: rErr } = await admin.from("talent_theme_releases").select("id, items").in("id", aboveReleaseIds);
    if (rErr) logServerError("themeUpdate.reopen.items", rErr);
    for (const r of (rels ?? []) as Array<{ id: string; items?: ReleaseItem[] | null }>) itemsOf.set(r.id, Array.isArray(r.items) ? r.items : []);
  }
  for (const row of applied) {
    if (row.report?.reason === "nothing_applicable") {
      const added = Array.isArray(row.report.addedBlocks) ? (row.report.addedBlocks as string[]) : [];
      if (row.report.criticalChecked || !hasCriticalCandidates(itemsOf.get(row.release_id ?? "") ?? [], added)) continue;
    }
    const { error: upErr } = await admin
      .from("talent_site_theme_updates")
      .update({
        state: "available",
        report: (() => {
          const { reason: _r, ...rest } = row.report ?? {};
          void _r;
          return { ...rest, note: row.report?.reason === "nothing_applicable" ? "reopened_for_critical" : "reopened_after_restore" };
        })(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id)
      .eq("state", "applied");
    if (upErr) logServerError("themeUpdate.reopen.write", upErr);
    else n += 1;
  }
  return n;
}

async function newestFromVersion(admin: SupabaseClient, releaseId: string): Promise<number | null> {
  const { data, error } = await admin.from("talent_theme_releases").select("from_version").eq("id", releaseId).maybeSingle();
  if (error) return null;
  const v = (data as { from_version?: number } | null)?.from_version;
  return typeof v === "number" ? v : null;
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
    // F124: a restore / undo that lowered the pin reopens rows it had closed.
    await reopenAppliedRows(admin, (site as { id: string }).id, releases.map((r) => r.id));

    // F118: do not open an offer she could do nothing with (no bell, no row).
    const sortedRels = [...releases].sort((a, b) => a.to_version - b.to_version);
    const newest = sortedRels[sortedRels.length - 1]!;
    const [itemsRes, homeRes, known] = await Promise.all([
      admin.from("talent_theme_releases").select("to_version, items, from_version").in("id", releases.map((r) => r.id)),
      admin.from("talent_pages").select("blocks").eq("talent_profile_id", talentProfileId).eq("is_home", true).maybeSingle(),
      pinnedBaseKnown(admin, {
        designSlug: slug,
        pinned: pinnedVersion,
        releaseId: newest.id,
        baseFromVersion: (await newestFromVersion(admin, newest.id)) ?? 0,
      }),
    ]);
    if (!itemsRes.error && !homeRes.error && known !== null && Array.isArray(itemsRes.data)) {
      const items = combineReleaseItems(
        [...(itemsRes.data as Array<{ to_version: number; items?: ReleaseItem[] | null }>)].sort((a, b) => a.to_version - b.to_version),
      );
      const blocks = (homeRes.data as { blocks?: unknown } | null)?.blocks;
      if (!isOfferActionable({ hasBase: known, items, addedIds: [], homeBlocks: Array.isArray(blocks) ? (blocks as never) : [], criticalPossible: hasCriticalCandidates(items, []) })) {
        return none;
      }
    }

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
