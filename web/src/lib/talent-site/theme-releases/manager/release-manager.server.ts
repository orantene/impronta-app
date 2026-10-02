import "server-only";

/**
 * THEME RELEASES (Phase 3): Builder Lab release manager, server side.
 * Service-role only; the actions file gates on platform admin first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { flipCatalogToRelease, loadReleaseDesign } from "../release-design.server";
import { loadThemeVersionSource } from "../theme-versions.server";
import { authoredOverlayVersion } from "@/lib/talent-site/theme-catalog/collection/authored";
import { publishDemoSite, reapplyDemoDesignAtVersion } from "@/lib/talent-site/server/demo-pipeline.server";
import { THEME_DEMOS } from "@/lib/talent-site/theme-catalog/theme-demos";
import { isMissingTable, listReleases, setChannel, setRollout } from "../releases.server";
import type { ReleaseChannel, ThemeRelease } from "../types";
import { executeChannelChange, executeResyncDemos, type ChannelChangeResult } from "./channel";
import {
  buildDryRunReport,
  orderDemosFirst,
  siteResultFromError,
  siteResultFromReport,
  type DryRunReport,
  type SiteDryRunResult,
} from "./dry-run";
import { applyDemosWithPorts, talentSitesOnly } from "./demos";
import { fanOutWithPorts } from "./fan-out";
import type { BellRow, UpdateRow } from "./notify";
import { supersedeOlderBells } from "../theme-bells.server";
import { makeBaseResolver } from "./base-resolver.server";
import { mergeSite, writeMergedDraft, type SiteRef } from "./merge-site.server";
import { runAutoImprove } from "../talent-update/auto-improve.server";
import { makeSiteMerge } from "../talent-update/talent-update.server";

const CHUNK = 100;

export interface DesignOverview {
  slug: string;
  title: string;
  version: number;
  sitesByVersion: Array<{ version: number | null; sites: number }>;
  totalSites: number;
  openReleases: Array<Pick<ThemeRelease, "id" | "from_version" | "to_version" | "channel" | "status" | "rollout_pct">>;
}

export async function loadDesignsOverview(admin: SupabaseClient): Promise<DesignOverview[]> {
  const { data: designs, error } = await admin
    .from("talent_theme_catalog")
    .select("slug, title, version")
    .eq("kind", "design")
    .order("sort_order", { ascending: true });
  if (error) {
    logServerError("themeReleaseManager.designs", error);
    return [];
  }
  const { data: sites, error: sitesErr } = await admin
    .from("talent_sites")
    .select("theme_design_slug, theme_design_version")
    .not("theme_design_slug", "is", null);
  if (sitesErr) {
    logServerError("themeReleaseManager.designSites", sitesErr);
    return [];
  }
  const bySlug = new Map<string, Map<number | null, number>>();
  for (const s of sites ?? []) {
    const slug = s.theme_design_slug as string;
    const v = typeof s.theme_design_version === "number" ? s.theme_design_version : null;
    const m = bySlug.get(slug) ?? new Map<number | null, number>();
    m.set(v, (m.get(v) ?? 0) + 1);
    bySlug.set(slug, m);
  }
  const out: DesignOverview[] = [];
  for (const d of designs ?? []) {
    const slug = d.slug as string;
    const m = bySlug.get(slug) ?? new Map<number | null, number>();
    const releases = (await listReleases(admin, slug)).filter((r) => r.status !== "archived");
    out.push({
      slug,
      title: d.title as string,
      version: d.version as number,
      sitesByVersion: [...m.entries()]
        .map(([version, count]) => ({ version, sites: count }))
        .sort((a, b) => (b.version ?? -1) - (a.version ?? -1)),
      totalSites: [...m.values()].reduce((a, b) => a + b, 0),
      openReleases: releases.map((r) => ({
        id: r.id,
        from_version: r.from_version,
        to_version: r.to_version,
        channel: r.channel,
        status: r.status,
        rollout_pct: r.rollout_pct,
      })),
    });
  }
  return out;
}

export async function loadRelease(admin: SupabaseClient, id: string): Promise<ThemeRelease | null> {
  const { data, error } = await admin.from("talent_theme_releases").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (!isMissingTable(error)) logServerError("themeReleaseManager.release", error);
    return null;
  }
  return (data as ThemeRelease | null) ?? null;
}

/** Every site on a design. Demo = `talent_profiles.is_demo = true` (never is_test_account). */
export async function collectSites(admin: SupabaseClient, designSlug: string): Promise<SiteRef[]> {
  const { data: sites, error } = await admin
    .from("talent_sites")
    .select("id, talent_profile_id, theme_design_version, site_published_at")
    .eq("theme_design_slug", designSlug);
  // Throws: an empty list would read as "no sites" in a dry run or a fan-out.
  if (error) throw new Error(`sites: ${error.message}`);
  const rows = sites ?? [];
  const profiles = new Map<string, { code: string; userId: string; name: string; locale: string | null; isDemo: boolean }>();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const ids = rows.slice(i, i + CHUNK).map((r) => r.talent_profile_id as string);
    const { data, error: pErr } = await admin
      .from("talent_profiles")
      .select("id, profile_code, user_id, display_name, preferred_locale, is_demo")
      .in("id", ids)
      .is("deleted_at", null);
    if (pErr) throw new Error(`profiles: ${pErr.message}`);
    for (const p of data ?? []) {
      profiles.set(p.id as string, {
        code: p.profile_code as string,
        userId: p.user_id as string,
        name: (p.display_name as string | null) ?? (p.profile_code as string),
        locale: (p.preferred_locale as string | null) ?? null,
        isDemo: p.is_demo === true,
      });
    }
  }
  const refs: SiteRef[] = [];
  for (const s of rows) {
    const p = profiles.get(s.talent_profile_id as string);
    if (!p) continue;
    refs.push({
      siteId: s.id as string,
      talentProfileId: s.talent_profile_id as string,
      userId: p.userId,
      profileCode: p.code,
      displayName: p.name,
      locale: p.locale,
      pinnedVersion: typeof s.theme_design_version === "number" ? s.theme_design_version : null,
      isDemo: p.isDemo,
      published: Boolean(s.site_published_at),
    });
  }
  return orderDemosFirst(refs);
}

/** READ-ONLY: merge the release into every site on the design, in memory. */
export async function runDryRun(
  admin: SupabaseClient,
  release: ThemeRelease,
): Promise<{ ok: true; report: DryRunReport } | { ok: false; error: string }> {
  const design = await loadReleaseDesign(admin, release);
  if (!design) return { ok: false, error: "Design not found in the catalog." };
  const sites = await collectSites(admin, release.design_slug);
  const resolveBase = makeBaseResolver(admin, release);
  const results: SiteDryRunResult[] = [];
  for (const site of sites) {
    const meta = {
      siteId: site.siteId,
      profileCode: site.profileCode,
      displayName: site.displayName,
      isDemo: site.isDemo,
      pinnedVersion: site.pinnedVersion,
    };
    try {
      const m = await mergeSite(admin, release, design, site, release.items, resolveBase);
      results.push(
        m.ok
          ? siteResultFromReport({ ...meta, noBase: m.noBase }, m.result.report)
          : siteResultFromError(meta, m.error),
      );
    } catch (err) {
      logServerError("themeReleaseManager.dryRun", err);
      results.push(siteResultFromError(meta, err instanceof Error ? err.message : "Merge failed."));
    }
  }
  const report = buildDryRunReport(release, results);
  const { error } = await admin
    .from("talent_theme_releases")
    .update({ dry_run_report: report, updated_at: new Date().toISOString() } as never)
    .eq("id", release.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, report };
}

/**
 * "Publish to demos": EVERY site on the design whose profile is a demo
 * (`is_demo = true`), whatever its pinned version. Exact base: the merge.
 * No exact base: the full design re-applied (demo content and seeded style
 * kept). Live demos are then published and revalidated.
 */
async function applyToDemos(
  admin: SupabaseClient,
  release: ThemeRelease,
): Promise<{ ok: true; applied: number; warnings: string[] } | { ok: false; error: string }> {
  const design = await loadReleaseDesign(admin, release);
  if (!design) return { ok: false, error: "Design not found in the catalog." };
  const liveCodes = new Set(THEME_DEMOS.filter((d) => d.live).map((d) => d.profileCode));
  const sites = (await collectSites(admin, release.design_slug)).map((s) => ({
    ...s,
    live: liveCodes.has(s.profileCode) || s.published,
  }));
  const resolveBase = makeBaseResolver(admin, release);
  const r = await applyDemosWithPorts(
    {
      merge: async (site) => {
        // Whole update (no item filter): demos take everything the merge allows.
        const m = await mergeSite(admin, release, design, site, undefined, resolveBase);
        if (!m.ok) return m;
        return {
          ok: true,
          noBase: m.noBase,
          write: () => writeMergedDraft(admin, site, m.homePageId, m.result, design, release.to_version),
        };
      },
      reapply: (site) =>
        reapplyDemoDesignAtVersion(
          admin,
          {
            siteId: site.siteId,
            talentProfileId: site.talentProfileId,
            profileCode: site.profileCode,
            userId: site.userId,
            displayName: site.displayName,
          },
          design,
        ),
      publish: (site) =>
        publishDemoSite(admin, {
          siteId: site.siteId,
          talentProfileId: site.talentProfileId,
          profileCode: site.profileCode,
          userId: site.userId,
        }),
      onError: (_site, err) => logServerError("themeReleaseManager.demo", err),
    },
    sites,
    release.to_version,
  );
  if (r.failures.length > 0) return { ok: false, error: r.failures.join(" | ") };
  return { ok: true, applied: r.applied, warnings: r.warnings };
}

async function fanOut(admin: SupabaseClient, release: ThemeRelease): Promise<{ updates: number; bells: number }> {
  const { data: d, error: dErr } = await admin
    .from("talent_theme_catalog")
    .select("title")
    .eq("kind", "design")
    .eq("slug", release.design_slug)
    .maybeSingle();
  if (dErr) throw new Error(`design title: ${dErr.message}`);
  const title = (d?.title as string | undefined) ?? release.design_slug;
  const sites = talentSitesOnly(await collectSites(admin, release.design_slug)).map((s) => ({
    siteId: s.siteId,
    talentProfileId: s.talentProfileId,
    userId: s.userId,
    designTitle: title,
    locale: s.locale,
    pinnedVersion: s.pinnedVersion,
  }));
  return fanOutWithPorts(
    {
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
    },
    release,
    sites,
  );
}

/** Re-run the demo update (any channel after draft; fresh dry run required). */
export async function resyncDemos(admin: SupabaseClient, release: ThemeRelease) {
  return executeResyncDemos(release, { applyToDemos: () => applyToDemos(admin, release) });
}

/** Guarded channel change (dry run required); effects then persist. */
export async function changeChannel(
  admin: SupabaseClient,
  release: ThemeRelease,
  target: ReleaseChannel,
): Promise<ChannelChangeResult> {
  return executeChannelChange(release, target, {
    applyToDemos: () => applyToDemos(admin, release),
    fanOut: () => fanOut(admin, release),
    flipCatalog: async () => {
      const r = await flipCatalogToRelease(admin, release);
      return r.ok ? { ok: true } : r;
    },
    persist: async (channel) => {
      const r = await setChannel(admin, release.id, channel);
      return r.ok ? { ok: true } : r;
    },
    authoredState: async () => {
      const r = await loadThemeVersionSource(admin, release.design_slug, release.to_version);
      if (!r.ok) return r;
      return { ok: true, snapshot: r.snapshot, overlayVersion: authoredOverlayVersion(release.design_slug) };
    },
    autoImprove: () => autoImproveAll(admin, release),
  });
}

/** Phase 4: safe items onto untouched parts of every site draft (history "Improved by Tulala"). */
async function autoImproveAll(admin: SupabaseClient, release: ThemeRelease) {
  // supabase-read-unchecked-ok: the title is decoration; the slug stands in.
  const { data: d } = await admin
    .from("talent_theme_catalog")
    .select("title")
    .eq("kind", "design")
    .eq("slug", release.design_slug)
    .maybeSingle();
  const title = (d?.title as string | undefined) ?? release.design_slug;
  // Demos are updated by Publish to demos; only talents and QA users are auto-improved.
  const sites = talentSitesOnly(await collectSites(admin, release.design_slug));
  return runAutoImprove(
    { admin, merge: makeSiteMerge(admin) },
    { ...release, channel: "default", status: "published" },
    title,
    sites,
  );
}

/**
 * F126: pause / resume. Pausing is status only (talents stop seeing it).
 * RESUMING runs the same fan-out as a rollout raise, so sites that became
 * eligible while it was paused (rollout raised, new sites) get their row and
 * bell now. Returns the counts for the "Done" message.
 */
export async function setReleasePaused(
  admin: SupabaseClient,
  release: ThemeRelease,
  paused: boolean,
): Promise<{ ok: true; updates: number; bells: number } | { ok: false; error: string }> {
  if (release.status === "archived") return { ok: false, error: "This release is archived." };
  const open = release.channel === "optin" || release.channel === "default";
  const status = paused ? "paused" : open ? "published" : "draft";
  const { error } = await admin
    .from("talent_theme_releases")
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("id", release.id);
  if (error) return { ok: false, error: error.message };
  if (paused || status !== "published") return { ok: true, updates: 0, bells: 0 };
  const fresh = await loadRelease(admin, release.id);
  if (!fresh) return { ok: true, updates: 0, bells: 0 };
  return { ok: true, ...(await fanOut(admin, fresh)) };
}

/** Rollout %: after the release is open, newly in-bucket sites get their notice. */
export async function changeRollout(
  admin: SupabaseClient,
  release: ThemeRelease,
  pct: number,
): Promise<{ ok: true; updates: number; bells: number } | { ok: false; error: string }> {
  const saved = await setRollout(admin, release.id, pct);
  if (!saved.ok) return saved;
  const open = release.channel === "optin" || release.channel === "default";
  if (!open || release.status !== "published") return { ok: true, updates: 0, bells: 0 };
  const fresh = await loadRelease(admin, release.id);
  if (!fresh) return { ok: true, updates: 0, bells: 0 };
  const f = await fanOut(admin, fresh);
  return { ok: true, ...f };
}
