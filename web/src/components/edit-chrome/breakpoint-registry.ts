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
}

export const DEFAULT_BUILDER_BREAKPOINTS: ReadonlyArray<BuilderBreakpoint> = [
  { id: "mobile", label: "Mobile", minWidth: 0 },
  { id: "tablet", label: "Tablet", minWidth: 768 },
  { id: "desktop", label: "Desktop", minWidth: 1024 },
  { id: "wide", label: "Wide", minWidth: 1280 },
  { id: "compact", label: "Compact phone", minWidth: 0 },
] as const;

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
