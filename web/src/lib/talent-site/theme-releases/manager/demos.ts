/**
 * THEME RELEASES: "Publish to demos" orchestration behind ports (pure).
 *
 * Demos (`talent_profiles.is_demo = true`) are platform presentation profiles:
 * every demo site on the design updates AUTOMATICALLY, whatever its pinned
 * version. A demo with an exact base takes the three-way merge; a demo with no
 * exact base gets the full design re-applied at the new version (its content
 * and seeded demo style are kept; demo content is ours). Live demos are then
 * published and revalidated. Talents and QA users (`is_demo = false`) are never
 * passed in here.
 */
export interface DemoSiteLike {
  siteId: string;
  profileCode: string;
  pinnedVersion: number | null;
  isDemo: boolean;
  /** Published site or a live demo in THEME_DEMOS: publish after the update. */
  live: boolean;
}

export type DemoMergeAttempt =
  | { ok: true; noBase: boolean; write: () => Promise<void> }
  | { ok: false; error: string };

export interface DemoPorts<S extends DemoSiteLike> {
  merge: (site: S) => Promise<DemoMergeAttempt>;
  reapply: (site: S) => Promise<void>;
  publish: (site: S) => Promise<{ warning?: string }>;
  onError?: (site: S, err: unknown) => void;
}

export interface DemoRunResult {
  applied: number;
  merged: number;
  reapplied: number;
  skipped: number;
  warnings: string[];
  failures: string[];
}

/** Demos only, behind the target version, in the given (demos-first) order. */
export function selectDemoTargets<S extends DemoSiteLike>(sites: ReadonlyArray<S>, toVersion: number): S[] {
  return sites.filter((s) => s.isDemo && (s.pinnedVersion ?? 0) < toVersion);
}

export async function applyDemosWithPorts<S extends DemoSiteLike>(
  ports: DemoPorts<S>,
  sites: ReadonlyArray<S>,
  toVersion: number,
): Promise<DemoRunResult> {
  const targets = selectDemoTargets(sites, toVersion);
  const out: DemoRunResult = {
    applied: 0,
    merged: 0,
    reapplied: 0,
    skipped: sites.filter((s) => s.isDemo).length - targets.length,
    warnings: [],
    failures: [],
  };
  for (const site of targets) {
    try {
      const m = await ports.merge(site);
      if (!m.ok) throw new Error(m.error);
      if (m.noBase) {
        await ports.reapply(site);
        out.reapplied += 1;
      } else {
        await m.write();
        out.merged += 1;
      }
      if (site.live) {
        const pub = await ports.publish(site);
        if (pub.warning) out.warnings.push(pub.warning);
      }
      out.applied += 1;
    } catch (err) {
      ports.onError?.(site, err);
      out.failures.push(`${site.profileCode}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  return out;
}

/** Notices, bells and auto-improve go to talents and QA users only, never demos. */
export function talentSitesOnly<S extends { isDemo: boolean }>(sites: ReadonlyArray<S>): S[] {
  return sites.filter((s) => !s.isDemo);
}
