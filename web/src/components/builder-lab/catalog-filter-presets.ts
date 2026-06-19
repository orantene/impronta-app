/**
 * catalog-filter-presets — pure preset (de)serialization + match predicate.
 *
 * No React, no localStorage — all logic here is pure and unit-testable. The
 * component owns the localStorage I/O (SSR-safe: only in effects/handlers).
 *
 * A preset captures the three orthogonal filter dimensions that a reviewer
 * would want to remember between sessions:
 *   • tab     — which gallery tab (or special view) is active
 *   • mode    — "all" | "hidden" | "customized"
 *   • surface — Connected-view sub-grouping ("agency" | "talent")
 *
 * `surface` is stored but is only relevant when `tab === "connected"`; for
 * every other tab it is preserved for symmetry but ignored by the predicates.
 */

export type FilterPresetMode = "all" | "hidden" | "customized";
export type FilterPresetSurface = "agency" | "talent";

export interface FilterPreset {
  /** Unique key — slug of the label, e.g. "awaiting-review". */
  key: string;
  /** Human-readable display name shown in the preset strip. */
  label: string;
  /** Gallery tab or special view this preset locks to. */
  tab: string | null;
  /** Filter mode. */
  mode: FilterPresetMode;
  /** Connected-view surface dimension (stored on every preset; honoured only
   *  when tab === "connected"). */
  surface: FilterPresetSurface;
}

/** The three state slices a preset snapshots / restores. */
export interface FilterState {
  tab: string | null;
  mode: FilterPresetMode;
  surface: FilterPresetSurface;
}

// ── Built-in presets ──────────────────────────────────────────────────────────
/** Factory: create a preset from a partial spec (key + label + overrides). */
export function makePreset(
  key: string,
  label: string,
  state: Partial<FilterState>,
): FilterPreset {
  return {
    key,
    label,
    tab: state.tab ?? null,
    mode: state.mode ?? "all",
    surface: state.surface ?? "agency",
  };
}

/** The hardwired presets that always appear in the strip (non-deletable). */
export const BUILT_IN_PRESETS: FilterPreset[] = [
  makePreset("all-components", "All", { tab: null, mode: "all" }),
  makePreset("awaiting-review", "Awaiting review", {
    tab: "page_templates",
    mode: "customized",
  }),
  makePreset("hidden-items", "Hidden", { tab: null, mode: "hidden" }),
  makePreset("customized", "Customized", { tab: null, mode: "customized" }),
];

// ── Serialization ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "lab_catalog_filter_presets_v1";
const ACTIVE_KEY = "lab_catalog_active_preset_v1";

export function serializePresets(presets: FilterPreset[]): string {
  return JSON.stringify(presets);
}

export function deserializePresets(raw: string): FilterPreset[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPreset);
  } catch {
    return [];
  }
}

function isValidPreset(p: unknown): p is FilterPreset {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.key === "string" &&
    typeof obj.label === "string" &&
    (obj.tab === null || typeof obj.tab === "string") &&
    (obj.mode === "all" || obj.mode === "hidden" || obj.mode === "customized") &&
    (obj.surface === "agency" || obj.surface === "talent")
  );
}

// ── Snapshot / restore ────────────────────────────────────────────────────────

/** Capture current filter state into a preset descriptor (key + label user-supplied). */
export function snapshotToPreset(
  key: string,
  label: string,
  state: FilterState,
): FilterPreset {
  return {
    key,
    label,
    tab: state.tab,
    mode: state.mode,
    surface: state.surface,
  };
}

/** Extract the FilterState from a preset (for restoring into component state). */
export function presetToState(preset: FilterPreset): FilterState {
  return {
    tab: preset.tab,
    mode: preset.mode,
    surface: preset.surface,
  };
}

// ── Match predicate ───────────────────────────────────────────────────────────

/**
 * Returns true when the given FilterState exactly matches the preset.
 * Used to highlight the active preset in the strip without needing React
 * or side effects.
 */
export function stateMatchesPreset(
  state: FilterState,
  preset: FilterPreset,
): boolean {
  if (state.tab !== preset.tab) return false;
  if (state.mode !== preset.mode) return false;
  // Surface only compared for the connected tab.
  if (state.tab === "connected" && state.surface !== preset.surface) return false;
  return true;
}

// ── localStorage helpers (called by the component — NOT during render) ─────────

export function loadCustomPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? deserializePresets(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: FilterPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializePresets(presets));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function loadActivePresetKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActivePresetKey(key: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (key === null) {
      window.localStorage.removeItem(ACTIVE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_KEY, key);
    }
  } catch {
    /* quota exceeded — ignore */
  }
}

/** Merge built-ins with persisted custom presets, built-ins first. */
export function mergePresets(custom: FilterPreset[]): FilterPreset[] {
  // De-dupe: custom keys that collide with built-in keys are dropped.
  const builtInKeys = new Set(BUILT_IN_PRESETS.map((p) => p.key));
  const filtered = custom.filter((p) => !builtInKeys.has(p.key));
  return [...BUILT_IN_PRESETS, ...filtered];
}

/** Generate a unique key from a label (slug + collision counter). */
export function labelToKey(label: string, existingKeys: string[]): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "preset";
  if (!existingKeys.includes(slug)) return slug;
  let i = 2;
  while (existingKeys.includes(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}
