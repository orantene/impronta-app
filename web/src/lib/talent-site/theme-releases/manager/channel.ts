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
import { checkChannelChange } from "./dry-run";

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
