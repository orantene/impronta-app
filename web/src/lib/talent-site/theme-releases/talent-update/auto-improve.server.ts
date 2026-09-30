import "server-only";

/**
 * THEME RELEASES (Phase 4): "Improved by Tulala".
 *
 * When a release reaches channel `default`, its safe items (code,
 * token-default, variant-default) land on every site's DRAFT, on untouched
 * parts only: the merge keeps every node / token she edited. Each site gets
 * one `auto_improve` history entry (actor `tulala`, undoable). The pinned
 * version is NOT moved, so the opt-in rest of the release stays on offer.
 * Nothing goes live: publish stays hers.
 *
 * Idempotent per (site, release): a site that already has the entry, or that
 * already sits on the release version, is skipped. A draft_rev race skips the
 * site (it is retried on the next run), never overwrites.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { applyThemeUpdateToDraft } from "@/lib/talent-site/history/history.server";
import { dryRunIsFresh } from "../manager/dry-run";
import type { SiteRef } from "../manager/merge-site.server";
import { autoImproveSummary } from "./copy";
import type { MergeFn, TalentRelease, UpdateContext } from "./talent-update.server";
import { autoImproveItems, isEmptyMerge, nextTokenOrigin } from "./view";

export interface AutoImproveResult {
  improved: number;
  skipped: number;
  failures: string[];
  /** Set when the run refused before touching any site. */
  refused?: string;
}

async function alreadyImproved(admin: SupabaseClient, siteId: string, releaseId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("talent_site_history")
    .select("id")
    .eq("site_id", siteId)
    .eq("kind", "auto_improve")
    .eq("report->>releaseId", releaseId)
    .limit(1);
  // A failed read counts as "done": never risk a second entry.
  if (error) return true;
  return (data ?? []).length > 0;
}

async function siteState(
  admin: SupabaseClient,
  siteId: string,
): Promise<{ draftRev: number; tokenOrigin: Record<string, string> | null; slug: string | null } | null> {
  const { data, error } = await admin
    .from("talent_sites")
    .select("draft_rev, theme_token_origin, site_slug")
    .eq("id", siteId)
    .maybeSingle();
  if (error || !data) return null;
  const s = data as { draft_rev: number | null; theme_token_origin: Record<string, string> | null; site_slug: string | null };
  return {
    draftRev: typeof s.draft_rev === "number" ? s.draft_rev : 0,
    tokenOrigin: s.theme_token_origin && typeof s.theme_token_origin === "object" ? s.theme_token_origin : null,
    slug: s.site_slug,
  };
}

export async function runAutoImprove(
  deps: { admin: SupabaseClient; merge: MergeFn },
  release: TalentRelease & { dry_run_report?: unknown },
  designTitle: string,
  sites: ReadonlyArray<SiteRef>,
  opts: { onlyDemos?: boolean } = {},
): Promise<AutoImproveResult> {
  const out: AutoImproveResult = { improved: 0, skipped: 0, failures: [] };
  const items = autoImproveItems(Array.isArray(release.items) ? release.items : []);
  if (release.channel !== "default" || items.length === 0) return out;
  // Server guard: no talent draft is touched without a fresh, clean dry run.
  const fresh = dryRunIsFresh({ ...release, dry_run_report: release.dry_run_report ?? null });
  if (!fresh.ok) return { ...out, refused: fresh.error };
  if (fresh.report.summary.errors > 0) {
    return { ...out, refused: `${fresh.report.summary.errors} site(s) failed the dry run.` };
  }
  const hasCode = items.some((i) => i.type === "code");
  // Demos first: a broken merge shows on a demo before any talent draft.
  const ordered = [...sites].sort((a, b) => Number(b.isDemo) - Number(a.isDemo));
  for (const site of ordered) {
    if (opts.onlyDemos && !site.isDemo) continue;
    if ((site.pinnedVersion ?? 0) >= release.to_version || (await alreadyImproved(deps.admin, site.siteId, release.id))) {
      out.skipped += 1;
      continue;
    }
    try {
      const st = await siteState(deps.admin, site.siteId);
      if (!st) throw new Error("site not found");
      const ctx: UpdateContext = {
        updateId: "",
        state: "available",
        siteId: site.siteId,
        siteSlug: st.slug,
        talentProfileId: site.talentProfileId,
        displayName: site.displayName,
        pinnedVersion: site.pinnedVersion,
        draftRev: st.draftRev,
        tokenOrigin: st.tokenOrigin,
        designTitle,
        release,
      };
      const m = await deps.merge(ctx, items);
      if (!m.ok) throw new Error(m.error);
      if (!m.homePageId) throw new Error("home page not found");
      const report = m.result.report;
      // Nothing visible and no code fix to announce: no entry.
      if (isEmptyMerge(report) && !hasCode) {
        out.skipped += 1;
        continue;
      }
      const res = await applyThemeUpdateToDraft(deps.admin, {
        siteId: site.siteId,
        homePageId: m.homePageId,
        expectedDraftRev: st.draftRev,
        shell: m.result.trees.shell ?? [],
        home: m.result.trees.home ?? [],
        tokens: m.result.tokens,
        report,
        designName: designTitle,
        fromVersion: null,
        toVersion: null,
        releaseId: release.id,
        updateId: null,
        kind: "auto_improve",
        actor: "tulala",
        actorId: null,
        summary: autoImproveSummary(designTitle, report.applied.length + report.added.length),
        tokenOrigin: nextTokenOrigin(st.tokenOrigin, report),
      });
      if (!res.ok) {
        out.skipped += 1;
        if (res.code !== "conflict") out.failures.push(`${site.profileCode || site.siteId}: ${res.error}`);
        continue;
      }
      out.improved += 1;
    } catch (err) {
      logServerError("themeUpdate.autoImprove", err);
      out.failures.push(`${site.profileCode || site.siteId}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  return out;
}
