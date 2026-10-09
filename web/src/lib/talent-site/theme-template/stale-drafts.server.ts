import "server-only";

/**
 * THEME CORE P1: loads the facts the pure classifier needs (open drafts, base
 * snapshots, release rows, site counts) and the first-publish dry-run
 * summary. Read-only: no writes. The caller gates on platform admin.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectSites } from "../theme-releases/manager/release-manager.server";
import type { DesignPayload } from "../theme-catalog/types";
import { THEME_DRAFT_COLUMNS, mapDraftRow, type ThemeDraftRow } from "./drafts-pure";
import { previewThemeDraftPublish } from "./publish.server";
import {
  classifyStaleDrafts,
  summarizeFirstPublish,
  type DesignHistoryFact,
  type FirstPublishSummary,
  type StaleDraftFact,
  type StaleDraftRow,
} from "./stale-drafts";

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

async function historyFor(
  admin: SupabaseClient,
  design: string,
): Promise<{
  fact: DesignHistoryFact;
  snapshotVersions: number[];
  realByVersion: Array<{ version: number | null; sites: number }>;
}> {
  const snaps = await admin.from("talent_theme_versions").select("version").eq("design", design);
  if (snaps.error && !(snaps.error.code && MISSING_TABLE.has(snaps.error.code))) {
    throw new Error(`snapshots: ${snaps.error.message}`);
  }
  const rels = await admin.from("talent_theme_releases").select("to_version, status").eq("design_slug", design);
  if (rels.error && !(rels.error.code && MISSING_TABLE.has(rels.error.code))) {
    throw new Error(`releases: ${rels.error.message}`);
  }
  const snapshotVersions = ((snaps.data ?? []) as Array<{ version: number }>).map((s) => s.version);
  const live = ((rels.data ?? []) as Array<{ to_version: number; status: string }>).filter(
    (r) => r.status !== "archived",
  );
  const sites = await collectSites(admin, design);
  const real = new Map<number | null, number>();
  for (const s of sites) {
    if (s.isDemo) continue;
    real.set(s.pinnedVersion, (real.get(s.pinnedVersion) ?? 0) + 1);
  }
  const realByVersion = [...real.entries()]
    .map(([version, count]) => ({ version, sites: count }))
    .sort((a, b) => (b.version ?? -1) - (a.version ?? -1));
  return {
    fact: {
      design,
      latestSnapshot: snapshotVersions.length ? Math.max(...snapshotVersions) : null,
      releaseRows: live.length,
      latestReleased: live.length ? Math.max(...live.map((r) => r.to_version)) : null,
      realSites: realByVersion.reduce((n, s) => n + s.sites, 0),
      demoSites: sites.filter((s) => s.isDemo).length,
    },
    snapshotVersions,
    realByVersion,
  };
}

/** Every open draft, classified. Throws on a failed read (an empty list must never mean "all clear"). */
export async function loadStaleDrafts(admin: SupabaseClient, now: Date = new Date()): Promise<StaleDraftRow[]> {
  const { data, error } = await admin.from("talent_theme_drafts").select(THEME_DRAFT_COLUMNS).eq("status", "open");
  if (error) {
    if (error.code && MISSING_TABLE.has(error.code)) return [];
    throw new Error(`drafts: ${error.message}`);
  }
  const drafts = ((data ?? []) as unknown as ThemeDraftRow[]).map(mapDraftRow);
  const facts: StaleDraftFact[] = [];
  const histories: DesignHistoryFact[] = [];
  for (const d of drafts) {
    const base = await admin
      .from("talent_theme_versions")
      .select("payload")
      .eq("design", d.design)
      .eq("version", d.baseVersion)
      .maybeSingle();
    if (base.error) throw new Error(`base snapshot: ${base.error.message}`);
    facts.push({
      design: d.design,
      rev: d.rev,
      baseVersion: d.baseVersion,
      updatedAt: d.updatedAt,
      payload: d.payload,
      basePayload: (base.data as { payload?: DesignPayload } | null)?.payload ?? null,
    });
    histories.push((await historyFor(admin, d.design)).fact);
  }
  return classifyStaleDrafts({ drafts: facts, histories, now });
}

/** No writes: what the first publish would change for the design's real sites. */
export async function loadFirstPublishSummary(
  admin: SupabaseClient,
  design: string,
): Promise<{ ok: true; summary: FirstPublishSummary } | { ok: false; error: string; errorEs: string }> {
  const h = await historyFor(admin, design);
  const plan = await previewThemeDraftPublish(admin, design);
  if (!plan.ok) return { ok: false, error: plan.error, errorEs: plan.errorEs };
  return {
    ok: true,
    summary: summarizeFirstPublish({
      design,
      releaseRows: h.fact.releaseRows,
      realSitesByVersion: h.realByVersion,
      snapshotVersions: h.snapshotVersions,
      items: plan.value.items,
      contentOnly: plan.value.contentOnly,
    }),
  };
}
