/**
 * THEME RELEASES (Phase 3): the channel change as ONE function with injected
 * effects, so the guard order is testable. `checkChannelChange` runs before
 * any effect; a refused change touches nothing.
 *
 *   demos   re-apply the design to demo sites through the merge, then persist
 *   optin   needs rollout > 0; create update rows + bell entries, then persist
 *   default fan out again (idempotent), then persist, then (Phase 4) the
 *           safe items land on untouched parts of every draft ("Improved by
 *           Tulala"); a failed auto-improve never undoes the channel change
 */
import type { ReleaseChannel, ThemeRelease } from "../types";
import { checkChannelChange, dryRunIsFresh } from "./dry-run";

export interface ChannelDeps {
  applyToDemos: () => Promise<{ ok: true; applied: number; warnings?: string[] } | { ok: false; error: string }>;
  fanOut: () => Promise<{ updates: number; bells: number }>;
  persist: (channel: ReleaseChannel) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * `default` only, BEFORE any other effect: move the catalog row to the
   * release's version (from the snapshot) so new applies get it. A failure
   * refuses the change and touches nothing else. Idempotent.
   */
  flipCatalog?: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Phase 4: runs after `default` persisted. */
  autoImprove?: () => Promise<{ improved: number; failures: string[] }>;
}

export type ChannelChangeResult =
  | { ok: true; channel: ReleaseChannel; demosApplied: number; updates: number; bells: number; warnings: string[] }
  | { ok: false; error: string };

export async function executeChannelChange(
  release: Pick<
    ThemeRelease,
    "id" | "to_version" | "items" | "dry_run_report" | "channel" | "status" | "rollout_pct"
  >,
  target: ReleaseChannel,
  deps: ChannelDeps,
): Promise<ChannelChangeResult> {
  const guard = checkChannelChange(release, target);
  if (!guard.ok) return guard;
  if (target === "optin" && release.rollout_pct <= 0) {
    return { ok: false, error: "Set a rollout % above 0 before opening to talents." };
  }
  if (target === "default" && deps.flipCatalog) {
    const flipped = await deps.flipCatalog();
    if (!flipped.ok) return flipped;
  }
  let demosApplied = 0;
  let updates = 0;
  let bells = 0;
  let warnings: string[] = [];
  if (target === "demos") {
    const r = await deps.applyToDemos();
    if (!r.ok) return r;
    demosApplied = r.applied;
    warnings = r.warnings ?? [];
  } else {
    // Demos are never behind talents: they update first, automatically.
    const r = await deps.applyToDemos();
    if (!r.ok) return r;
    demosApplied = r.applied;
    warnings = r.warnings ?? [];
    const f = await deps.fanOut();
    updates = f.updates;
    bells = f.bells;
  }
  const saved = await deps.persist(target);
  if (!saved.ok) return saved;
  if (target === "default" && deps.autoImprove) {
    const ai = await deps.autoImprove();
    warnings = [...warnings, ...ai.failures.map((f) => `Auto-improve ${f}`)];
  }
  return { ok: true, channel: target, demosApplied, updates, bells, warnings };
}

/**
 * "Re-sync demos": re-run the demo update on any channel after draft. Every
 * demo still below `to_version` is updated; talents are never touched. Needs a
 * fresh dry run with no failed sites, like every other channel action.
 */
export async function executeResyncDemos(
  release: Pick<ThemeRelease, "id" | "to_version" | "items" | "dry_run_report" | "channel" | "status">,
  deps: Pick<ChannelDeps, "applyToDemos">,
): Promise<{ ok: true; applied: number; warnings: string[] } | { ok: false; error: string }> {
  if (release.status === "archived") return { ok: false, error: "This release is archived." };
  if (release.status === "paused") return { ok: false, error: "This release is paused. Resume it first." };
  if (release.channel === "draft") return { ok: false, error: "Publish to demos first." };
  const fresh = dryRunIsFresh(release);
  if (!fresh.ok) return fresh;
  if (fresh.report.summary.errors > 0) {
    return { ok: false, error: `${fresh.report.summary.errors} site(s) failed the dry run. Fix or rerun.` };
  }
  const r = await deps.applyToDemos();
  return r.ok ? { ok: true, applied: r.applied, warnings: r.warnings ?? [] } : r;
}
