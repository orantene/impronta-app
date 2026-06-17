/**
 * Custom breakpoint registry — author-defined widths beyond fixed tablet/mobile.
 *
 * Builder 2026 M4: operators can add tiers (e.g. 1280, 1536) that sync with
 * style-panel viewport editing and device preview frames.
 */

export interface BuilderBreakpoint {
  id: string;
  label: string;
  /** Min viewport width (px) this breakpoint applies from. */
  minWidth: number;
  /**
   * The base tier — the desktop default that every override inherits from.
   * Exactly one registry tier is `isBase`. The inspector never edits the base
   * as an "override"; it is the canvas of overrides.
   */
  isBase?: boolean;
  /**
   * Whether the inspector may author per-tier overrides for this tier AND the
   * node renderer emits a matching responsive bucket at render time.
   *
   * This is the single switch that reconciles the editable inspector tiers with
   * the tiers the renderer actually supports (RESP-1): the InspectorViewportRail
   * renders a device button only for non-base tiers where `editable` is true,
   * and the override-detection loops iterate exactly these ids. `tablet`/`mobile`
   * are render-backed today (render.tsx emits their `@media` buckets). `wide`/
   * `compact` exist as canvas-preview-only tiers — kept in the registry so the
   * device-preview frame + `naturalWidthForDevice` still resolve them — but are
   * NOT editable until render.tsx grows their `@media` buckets (the deferred
   * follow-on noted in the plan). Saved `breakpoints[wide|compact]` buckets are
   * forward-compatible: flipping `editable: true` here lights them up everywhere
   * at once, with no further type or rail change.
   */
  editable?: boolean;
}

export const DEFAULT_BUILDER_BREAKPOINTS: ReadonlyArray<BuilderBreakpoint> = [
  { id: "mobile", label: "Mobile", minWidth: 0, editable: true },
  { id: "tablet", label: "Tablet", minWidth: 768, editable: true },
  { id: "desktop", label: "Desktop", minWidth: 1024, isBase: true },
  { id: "wide", label: "Wide", minWidth: 1280 },
  { id: "compact", label: "Compact phone", minWidth: 0 },
] as const;

/** The single base (desktop) tier id every override inherits from. */
export function baseBreakpointId(
  breakpoints: ReadonlyArray<BuilderBreakpoint> = DEFAULT_BUILDER_BREAKPOINTS,
): string {
  return breakpoints.find((bp) => bp.isBase)?.id ?? "desktop";
}

/**
 * Ids of the non-base tiers the inspector may author overrides for AND the
 * renderer emits buckets for — the single source the rail + override loops read.
 *
 * Ordered largest-to-smallest by `minWidth` (e.g. `tablet` before `mobile`),
 * which is BOTH the natural authoring order (desktop → tablet → mobile) AND the
 * legacy override-detection precedence: when a field is overridden on multiple
 * tiers, the first match wins, and the previous hardcoded loop checked
 * `['tablet','mobile']` in that order. Preserving it keeps the override badge
 * byte-stable for fields overridden on more than one tier.
 */
export function editableOverrideTierIds(
  breakpoints: ReadonlyArray<BuilderBreakpoint> = DEFAULT_BUILDER_BREAKPOINTS,
): string[] {
  return breakpoints
    .filter((bp) => !bp.isBase && bp.editable)
    .slice()
    .sort((a, b) => b.minWidth - a.minWidth)
    .map((bp) => bp.id);
}

/** True when `device` is the base tier (no override bucket — edits the default). */
export function isBaseBreakpoint(
  device: string,
  breakpoints: ReadonlyArray<BuilderBreakpoint> = DEFAULT_BUILDER_BREAKPOINTS,
): boolean {
  return device === baseBreakpointId(breakpoints);
}

/**
 * The exact ordered set of tier ids the InspectorViewportRail offers a device
 * button for: the base tier first, then every editable non-base tier ordered
 * largest-to-smallest (desktop → tablet → mobile), matching the legacy device
 * rail. The rail derives its buttons from THIS list (the single reconciled
 * source), so a test can assert the editable inspector tiers match the registry
 * without rendering React. RESP-1.
 */
export function inspectorRailTierIds(
  breakpoints: ReadonlyArray<BuilderBreakpoint> = DEFAULT_BUILDER_BREAKPOINTS,
): string[] {
  return [baseBreakpointId(breakpoints), ...editableOverrideTierIds(breakpoints)];
}

const STORAGE_KEY = "impronta.editChrome.customBreakpoints.v1";
export const BUILDER_BREAKPOINTS_CHANGED = "impronta.editChrome.breakpointsChanged";

export function loadCustomBreakpoints(): BuilderBreakpoint[] {
  if (typeof window === "undefined") return [...DEFAULT_BUILDER_BREAKPOINTS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_BUILDER_BREAKPOINTS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_BUILDER_BREAKPOINTS];
    const out: BuilderBreakpoint[] = [];
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as BuilderBreakpoint).id === "string" &&
        typeof (item as BuilderBreakpoint).label === "string" &&
        typeof (item as BuilderBreakpoint).minWidth === "number"
      ) {
        out.push(item as BuilderBreakpoint);
      }
    }
    return out.length > 0 ? out : [...DEFAULT_BUILDER_BREAKPOINTS];
  } catch {
    return [...DEFAULT_BUILDER_BREAKPOINTS];
  }
}

export function saveCustomBreakpoints(breakpoints: BuilderBreakpoint[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(breakpoints));
    window.dispatchEvent(new Event(BUILDER_BREAKPOINTS_CHANGED));
  } catch {
    // best-effort
  }
}

export function naturalWidthForDevice(
  device: string,
  breakpoints: ReadonlyArray<BuilderBreakpoint> = DEFAULT_BUILDER_BREAKPOINTS,
): number {
  const fallback: Record<string, number> = {
    desktop: 1280,
    wide: 1200,
    tablet: 834,
    mobile: 390,
    compact: 414,
  };
  const match = breakpoints.find((bp) => bp.id === device);
  if (match && match.minWidth > 0 && device !== "mobile" && device !== "compact") {
    return match.minWidth;
  }
  return fallback[device] ?? 1280;
}

export function breakpointLabelForDevice(
  device: string,
  breakpoints: ReadonlyArray<BuilderBreakpoint> = DEFAULT_BUILDER_BREAKPOINTS,
): string {
  return breakpoints.find((bp) => bp.id === device)?.label ?? device;
}

/** Resolve the active breakpoint id for a given viewport width. */
export function breakpointForWidth(
  width: number,
  breakpoints: ReadonlyArray<BuilderBreakpoint> = DEFAULT_BUILDER_BREAKPOINTS,
): string {
  let active = breakpoints[0]?.id ?? "desktop";
  for (const bp of breakpoints) {
    if (width >= bp.minWidth) active = bp.id;
  }
  return active;
}
