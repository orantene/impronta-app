/**
 * THEME CORE P1: the pure planner behind `scripts/theme-releases/repair-stale-theme-state.mts`.
 * No I/O. The script reads, calls `planRepair`, prints every row / site by
 * profile code + slug, and (only with --apply --yes) writes exactly the plan.
 *
 * What it plans (state and numbers only, never a site tree):
 *   supersede          open update rows whose release is at or below the site's pin
 *   catalogFixes       catalog rows whose number lags the latest snapshot AND whose
 *                      stored payload already equals that snapshot (version-only drift)
 *   catalogHeld        catalog rows that lag but carry an OLDER payload: untouched
 *                      (only "Make default" flips payload + number together)
 *   missingSnapshots   sites pinned to a version with no snapshot (report only)
 *   backfillCandidates (design, version 1) pairs a code seed could fill (the script
 *                      writes them only with --backfill-v1-snapshots)
 *   stampMismatch      sites whose LIVE shell stamp differs from the pin (report only)
 */
import { kidsOf, readOrigin } from "./origin";
import { planSupersede, type SupersedeChange } from "./superseded-rows";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** Real talent whose site this tool must never read, plan or touch. */
export const PROTECTED_PROFILE_CODES: readonly string[] = ["TAL-93938"];

export interface RepairSite {
  siteId: string;
  profileCode: string;
  siteSlug: string | null;
  isDemo: boolean;
  designSlug: string | null;
  pin: number | null;
  /** Highest design-origin version stamped on the LIVE shell (null = none / unreadable). */
  liveStamp: number | null;
}

export interface RepairRow {
  id: string;
  siteId: string;
  releaseId: string;
  state: string;
  report: Record<string, unknown> | null;
}

export interface RepairRelease {
  id: string;
  designSlug: string;
  toVersion: number;
}

export interface RepairCatalogRow {
  slug: string;
  version: number;
  /** Stable key of the stored payload (equal keys = equal payloads). */
  payloadKey: string;
}

export interface RepairSnapshot {
  design: string;
  version: number;
  payloadKey: string;
}

export interface RepairInput {
  sites: ReadonlyArray<RepairSite>;
  rows: ReadonlyArray<RepairRow>;
  releases: ReadonlyArray<RepairRelease>;
  catalog: ReadonlyArray<RepairCatalogRow>;
  snapshots: ReadonlyArray<RepairSnapshot>;
  /** Designs the code can seed a snapshot for (slug set). */
  seedableDesigns: ReadonlySet<string>;
}

export interface SupersedeItem extends SupersedeChange {
  siteId: string;
  profileCode: string;
  siteSlug: string | null;
  designSlug: string;
  toVersion: number;
  pin: number;
  before: { state: string; report: Record<string, unknown> | null };
}

export interface StampMismatch {
  profileCode: string;
  siteSlug: string | null;
  isDemo: boolean;
  designSlug: string;
  pin: number;
  live: number;
  /** Live older than the pin: the pin moved without a publish. */
  kind: "STALE-PUBLISH" | "LIVE-AHEAD";
}

export interface RepairPlan {
  protectedSkipped: string[];
  supersede: SupersedeItem[];
  catalogFixes: Array<{ slug: string; from: number; to: number }>;
  catalogHeld: Array<{ slug: string; version: number; latest: number }>;
  missingSnapshots: Array<{ profileCode: string; siteSlug: string | null; isDemo: boolean; designSlug: string; pin: number }>;
  backfillCandidates: Array<{ design: string; version: number; sites: string[]; seedable: boolean }>;
  stampMismatch: StampMismatch[];
}

/** Highest design-origin version stamped anywhere in a tree; null when none is stamped. */
export function maxStampVersion(tree: unknown): number | null {
  let max: number | null = null;
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes as BuilderNode[]) {
      if (!n || typeof n !== "object") continue;
      const v = readOrigin(n)?.version;
      if (typeof v === "number" && (max === null || v > max)) max = v;
      walk(kidsOf(n));
    }
  };
  walk(tree);
  return max;
}

export function planRepair(input: RepairInput): RepairPlan {
  const isProtected = (code: string) => PROTECTED_PROFILE_CODES.includes(code);
  const protectedSkipped = input.sites.filter((s) => isProtected(s.profileCode)).map((s) => s.profileCode);
  const sites = input.sites.filter((s) => !isProtected(s.profileCode));
  const relById = new Map(input.releases.map((r) => [r.id, r]));

  const supersede: SupersedeItem[] = [];
  for (const site of sites) {
    if (!site.designSlug || site.pin === null) continue;
    const mine = input.rows
      .filter((r) => r.siteId === site.siteId)
      .map((r) => {
        const rel = relById.get(r.releaseId);
        return {
          id: r.id,
          state: r.state,
          report: r.report,
          toVersion: rel && rel.designSlug === site.designSlug ? rel.toVersion : null,
        };
      });
    for (const c of planSupersede(site.pin, mine)) {
      const src = mine.find((m) => m.id === c.id)!;
      supersede.push({
        ...c,
        siteId: site.siteId,
        profileCode: site.profileCode,
        siteSlug: site.siteSlug,
        designSlug: site.designSlug,
        toVersion: src.toVersion as number,
        pin: site.pin,
        before: { state: src.state, report: src.report },
      });
    }
  }

  const latestByDesign = new Map<string, RepairSnapshot>();
  for (const s of input.snapshots) {
    const cur = latestByDesign.get(s.design);
    if (!cur || s.version > cur.version) latestByDesign.set(s.design, s);
  }
  const catalogFixes: RepairPlan["catalogFixes"] = [];
  const catalogHeld: RepairPlan["catalogHeld"] = [];
  for (const c of input.catalog) {
    const latest = latestByDesign.get(c.slug);
    if (!latest || latest.version <= c.version) continue;
    if (latest.payloadKey === c.payloadKey) catalogFixes.push({ slug: c.slug, from: c.version, to: latest.version });
    else catalogHeld.push({ slug: c.slug, version: c.version, latest: latest.version });
  }

  const have = new Set(input.snapshots.map((s) => `${s.design}@${s.version}`));
  const missingSnapshots: RepairPlan["missingSnapshots"] = [];
  const backfill = new Map<string, RepairPlan["backfillCandidates"][number]>();
  const stampMismatch: StampMismatch[] = [];
  for (const s of sites) {
    if (!s.designSlug || s.pin === null) continue;
    if (!have.has(`${s.designSlug}@${s.pin}`)) {
      missingSnapshots.push({ profileCode: s.profileCode, siteSlug: s.siteSlug, isDemo: s.isDemo, designSlug: s.designSlug, pin: s.pin });
      if (s.pin === 1) {
        const key = `${s.designSlug}@1`;
        const entry = backfill.get(key) ?? { design: s.designSlug, version: 1, sites: [], seedable: input.seedableDesigns.has(s.designSlug) };
        entry.sites.push(s.profileCode);
        backfill.set(key, entry);
      }
    }
    if (s.liveStamp !== null && s.liveStamp !== s.pin) {
      stampMismatch.push({
        profileCode: s.profileCode,
        siteSlug: s.siteSlug,
        isDemo: s.isDemo,
        designSlug: s.designSlug,
        pin: s.pin,
        live: s.liveStamp,
        kind: s.liveStamp < s.pin ? "STALE-PUBLISH" : "LIVE-AHEAD",
      });
    }
  }
  return { protectedSkipped, supersede, catalogFixes, catalogHeld, missingSnapshots, backfillCandidates: [...backfill.values()], stampMismatch };
}
