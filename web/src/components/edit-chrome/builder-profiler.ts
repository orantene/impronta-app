/**
 * builder-profiler.ts — flag-gated, no-op-in-prod profiling instrumentation
 * for the page builder (Marathon W0-T6).
 *
 * This is a MEASUREMENT aid, not a fix. It exists so the authenticated
 * profiling run (W0-T7) can produce hard per-commit numbers (chrome-vs-canvas
 * split, commit counts, actualDuration long-poles) WITHOUT the React DevTools
 * extension and even on a stock production build.
 *
 * ── Why this lives in its own standalone file ──────────────────────────────
 * The two builder shared-core files (`edit-context.tsx`, ~6.4k LOC, and
 * `render.tsx`, ~3.4k LOC) are single-writer and serialize the whole marathon.
 * Adding a profiler probe INSIDE either of them would create a Wave-0 diff
 * that every Wave 1+ rebase has to carry. So all profiling logic is here, and
 * the `<React.Profiler>` mounts live only at the chrome root + the canvas
 * mount point via the `BuilderProfilerBoundary` client wrapper.
 *
 * ── No-op contract ─────────────────────────────────────────────────────────
 * Everything is gated on `NEXT_PUBLIC_BUILDER_PROFILE === "1"`. The env var is
 * build-time inlined by Next, so when it is unset:
 *   - `isBuilderProfileEnabled()` is `false`,
 *   - `BuilderProfilerBoundary` renders its children with ZERO `<Profiler>`
 *     wrappers (literally no extra React node),
 *   - `installBuilderProfileGlobal()` / `recordProfilerCommit()` early-return.
 * Net effect in normal prod: zero Profiler mounts, zero global, zero overhead.
 */

/** A single React commit row captured from a `<Profiler onRender>` callback. */
export interface BuilderProfilerSample {
  /** Profiler id — "edit-chrome" (the provider chrome) or "builder-canvas". */
  id: string;
  /** "mount" on first render, "update" on every subsequent commit. */
  phase: "mount" | "update" | "nested-update";
  /** Time React spent rendering this commit's subtree (the headline cost). */
  actualDuration: number;
  /** Estimated time to render the whole subtree without memoization. */
  baseDuration: number;
  /** When React started rendering this update. */
  startTime: number;
  /** When React committed this update. */
  commitTime: number;
}

/** Ring-buffer cap — generous enough for a full multi-interaction session. */
const RING_CAP = 4000;

/**
 * Build-time flag check. `NEXT_PUBLIC_*` is inlined by Next, so this folds to a
 * constant `false` in a normal prod build and the bundler can dead-code the
 * rest of the profiler away at the call sites that guard on it.
 */
export function isBuilderProfileEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BUILDER_PROFILE === "1";
}

interface BuilderProfileGlobal {
  /** All captured commit samples since the last clear(). */
  samples: BuilderProfilerSample[];
  /** Append one sample (used by the Profiler onRender callback). */
  push: (sample: BuilderProfilerSample) => void;
  /** Wipe the buffer — call before an interaction to isolate its commits. */
  clear: () => void;
  /**
   * Dump the buffer as CSV. The operator runs an interaction, then
   * `copy(window.__builderProfile.dump())` from the console and pastes the
   * rows into the findings dir.
   */
  dump: () => string;
  /**
   * Per-id summary for a quick read: commit count, total/median/worst
   * actualDuration. Handy for "how many commits did this gesture produce and
   * how heavy was the worst one" without leaving the console.
   */
  summary: () => Record<
    string,
    {
      commits: number;
      totalMs: number;
      medianMs: number;
      worstMs: number;
    }
  >;
}

declare global {
  interface Window {
    __builderProfile?: BuilderProfileGlobal;
  }
}

function toCsv(samples: ReadonlyArray<BuilderProfilerSample>): string {
  const header = "id,phase,actualDuration,baseDuration,startTime,commitTime";
  const rows = samples.map(
    (s) =>
      `${s.id},${s.phase},${s.actualDuration.toFixed(3)},${s.baseDuration.toFixed(
        3,
      )},${s.startTime.toFixed(3)},${s.commitTime.toFixed(3)}`,
  );
  return [header, ...rows].join("\n");
}

function median(nums: ReadonlyArray<number>): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Install (idempotently) the `window.__builderProfile` global. No-op when the
 * flag is off or when called on the server. Safe to call from every mount of
 * the boundary — the first call wins, the rest are cheap returns.
 */
export function installBuilderProfileGlobal(): void {
  if (!isBuilderProfileEnabled()) return;
  if (typeof window === "undefined") return;
  if (window.__builderProfile) return;

  const samples: BuilderProfilerSample[] = [];
  window.__builderProfile = {
    samples,
    push(sample) {
      samples.push(sample);
      // Keep memory bounded across a long session by dropping the oldest rows.
      if (samples.length > RING_CAP) {
        samples.splice(0, samples.length - RING_CAP);
      }
    },
    clear() {
      samples.length = 0;
    },
    dump() {
      return toCsv(samples);
    },
    summary() {
      const byId: Record<string, number[]> = {};
      for (const s of samples) {
        (byId[s.id] ??= []).push(s.actualDuration);
      }
      const out: ReturnType<BuilderProfileGlobal["summary"]> = {};
      for (const [id, durations] of Object.entries(byId)) {
        out[id] = {
          commits: durations.length,
          totalMs: Number(durations.reduce((a, b) => a + b, 0).toFixed(3)),
          medianMs: Number(median(durations).toFixed(3)),
          worstMs: Number(Math.max(...durations).toFixed(3)),
        };
      }
      return out;
    },
  };
}

/**
 * The `onRender` handler to pass to a `<React.Profiler>`. No-op when the flag
 * is off (so even if a boundary mounts a Profiler in a misconfigured build,
 * the callback does nothing). Lazily installs the global on first commit.
 */
export function recordProfilerCommit(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
): void {
  if (!isBuilderProfileEnabled()) return;
  if (typeof window === "undefined") return;
  if (!window.__builderProfile) installBuilderProfileGlobal();
  window.__builderProfile?.push({
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  });
}
