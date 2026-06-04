/**
 * workspace-layout — pure persistence + magnet-snap math for the builder's
 * floating edit chrome (Photoshop-style dockable workspace).
 *
 * Two concerns, no React, no DOM mutation (read-only `window.localStorage` via
 * the injectable `storage` param so the logic is unit-testable):
 *
 *   1. PIN / SAVE + RESET — `loadWorkspaceLayout` / `saveWorkspaceLayout` /
 *      `clearWorkspaceLayout` persist each floating panel's translate offset
 *      to a single versioned localStorage key. When a saved layout exists the
 *      panels restore to it on load instead of snapping to their home anchor.
 *      With NO saved layout the offsets are session-only (the pre-existing
 *      snap-home-on-refresh default) — nothing here changes that until the
 *      operator pins.
 *
 *   2. MAGNET DOCK — `computeMagnetSnap` nudges a panel's proposed top-left so
 *      that, while dragging, an edge that comes within ~THRESHOLD px of a
 *      screen edge (left / right / top) OR of the matching edge of another
 *      panel snaps flush to it. Returns the adjusted top-left plus which guides
 *      fired (for optional visual feedback). Pure geometry over rects.
 *
 * The offset stored per panel is the SAME `{ x, y }` translate the
 * `useFloatingDrag` hook applies via `transform: translate(...)`. Panels are
 * addressed by a stable string id ("navigator", "inspector", …) so the schema
 * extends to all six chrome panels without a migration.
 */

export interface PanelOffset {
  x: number;
  y: number;
}

export interface WorkspaceLayoutV1 {
  version: 1;
  /** Panel id → persisted translate offset. */
  panels: Record<string, PanelOffset>;
}

/** Versioned storage key. Bump the suffix (and `version`) on a breaking shape change. */
export const WORKSPACE_LAYOUT_STORAGE_KEY =
  "impronta.editChrome.workspaceLayout.v1";

const WORKSPACE_LAYOUT_VERSION = 1 as const;

/** Magnet pull radius (px). An edge within this distance of a guide snaps to it. */
export const MAGNET_THRESHOLD_PX = 18;

/** Minimal storage surface so callers can inject a stub (or skip in SSR). */
export interface LayoutStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validate + coerce an unknown blob into a typed offset, or null if malformed. */
function parsePanelOffset(input: unknown): PanelOffset | null {
  if (typeof input !== "object" || input == null) return null;
  const raw = input as { x?: unknown; y?: unknown };
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return null;
  // Round on the way in so a hand-edited / legacy float can't reintroduce
  // sub-pixel transforms that blur text.
  return { x: Math.round(raw.x), y: Math.round(raw.y) };
}

/**
 * Parse a raw JSON string into a validated layout, or null when absent /
 * malformed / wrong version. Never throws.
 */
export function parseWorkspaceLayout(raw: string | null): WorkspaceLayoutV1 | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed == null) return null;
  const blob = parsed as { version?: unknown; panels?: unknown };
  if (blob.version !== WORKSPACE_LAYOUT_VERSION) return null;
  if (typeof blob.panels !== "object" || blob.panels == null) return null;

  const panels: Record<string, PanelOffset> = {};
  for (const [panelId, value] of Object.entries(
    blob.panels as Record<string, unknown>,
  )) {
    const offset = parsePanelOffset(value);
    if (offset) panels[panelId] = offset;
  }
  return { version: WORKSPACE_LAYOUT_VERSION, panels };
}

/** Serialize a layout to the exact persisted JSON shape. */
export function serializeWorkspaceLayout(
  panels: Record<string, PanelOffset>,
): string {
  const normalized: Record<string, PanelOffset> = {};
  for (const [panelId, offset] of Object.entries(panels)) {
    normalized[panelId] = { x: Math.round(offset.x), y: Math.round(offset.y) };
  }
  const layout: WorkspaceLayoutV1 = {
    version: WORKSPACE_LAYOUT_VERSION,
    panels: normalized,
  };
  return JSON.stringify(layout);
}

/** Read + validate the saved layout. Returns null when none / unreadable. */
export function loadWorkspaceLayout(
  storage: LayoutStorage | null | undefined,
): WorkspaceLayoutV1 | null {
  if (!storage) return null;
  try {
    return parseWorkspaceLayout(storage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY));
  } catch {
    // Storage access can throw (private mode / disabled). Treat as "no layout".
    return null;
  }
}

/**
 * Persist the given per-panel offsets. Returns true on success. Best-effort:
 * a storage failure (quota / private mode) returns false rather than throwing,
 * so the in-session drag still works.
 */
export function saveWorkspaceLayout(
  storage: LayoutStorage | null | undefined,
  panels: Record<string, PanelOffset>,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      WORKSPACE_LAYOUT_STORAGE_KEY,
      serializeWorkspaceLayout(panels),
    );
    return true;
  } catch {
    return false;
  }
}

/** Remove the saved layout (Reset to default). Best-effort; never throws. */
export function clearWorkspaceLayout(
  storage: LayoutStorage | null | undefined,
): void {
  if (!storage) return;
  try {
    storage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
  } catch {
    // Nothing to do — a failed clear just leaves the prior layout in place.
  }
}

/** Look up one panel's saved offset, or null if the layout has no entry for it. */
export function savedOffsetForPanel(
  layout: WorkspaceLayoutV1 | null,
  panelId: string,
): PanelOffset | null {
  if (!layout) return null;
  return layout.panels[panelId] ?? null;
}

// ── magnet snapping ──────────────────────────────────────────────────────────

export interface SnapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MagnetGuides {
  /** A vertical guide line was hit (panel's left or right edge snapped). */
  x: boolean;
  /** A horizontal guide line was hit (panel's top edge snapped). */
  y: boolean;
}

export interface MagnetSnapResult {
  /** Snapped top-left to render the panel at. */
  left: number;
  top: number;
  /** Which axes snapped — for optional guide-line UI. */
  guides: MagnetGuides;
}

export interface ComputeMagnetSnapInput {
  /** The panel's PROPOSED top-left (home + raw drag delta), before snapping. */
  proposed: { left: number; top: number };
  /** The panel's size — assumed constant during a drag. */
  size: { width: number; height: number };
  /** Viewport size, for screen-edge snapping. */
  viewport: { width: number; height: number };
  /** Other on-screen panels to edge-align against (exclude the dragged one). */
  others: ReadonlyArray<SnapRect>;
  /** Pull radius. Defaults to {@link MAGNET_THRESHOLD_PX}. */
  threshold?: number;
}

/**
 * Snap a dragged panel's proposed top-left to nearby guides. On each axis the
 * NEAREST candidate within `threshold` wins; if nothing is in range the
 * proposed value passes through unchanged. Candidates:
 *
 *   X axis — panel LEFT edge → screen left (0) | any other panel's left/right.
 *            panel RIGHT edge → screen right (vw) | any other panel's left/right.
 *   Y axis — panel TOP edge → screen top (0) | any other panel's top/bottom.
 *
 * (Right/bottom screen edges only constrain via the right/bottom panel edges,
 * matching the brief's "left / right / top" magnet feel.)
 */
export function computeMagnetSnap({
  proposed,
  size,
  viewport,
  others,
  threshold = MAGNET_THRESHOLD_PX,
}: ComputeMagnetSnapInput): MagnetSnapResult {
  const { width } = size;

  // ---- X axis: consider snapping the LEFT edge and the RIGHT edge ----------
  const leftEdgeTargets: number[] = [0];
  const rightEdgeTargets: number[] = [viewport.width];
  for (const r of others) {
    leftEdgeTargets.push(r.left, r.left + r.width);
    rightEdgeTargets.push(r.left, r.left + r.width);
  }

  let bestLeft = proposed.left;
  let bestDx = threshold + 1; // strictly-better-than gate
  let snappedX = false;

  // Left edge → each left-edge target.
  for (const target of leftEdgeTargets) {
    const candidateLeft = target;
    const dist = Math.abs(proposed.left - candidateLeft);
    if (dist <= threshold && dist < bestDx) {
      bestDx = dist;
      bestLeft = candidateLeft;
      snappedX = true;
    }
  }
  // Right edge → each right-edge target (convert to a left coordinate).
  const proposedRight = proposed.left + width;
  for (const target of rightEdgeTargets) {
    const dist = Math.abs(proposedRight - target);
    if (dist <= threshold && dist < bestDx) {
      bestDx = dist;
      bestLeft = target - width;
      snappedX = true;
    }
  }

  // ---- Y axis: snap the TOP edge -------------------------------------------
  const topEdgeTargets: number[] = [0];
  for (const r of others) {
    topEdgeTargets.push(r.top, r.top + r.height);
  }

  let bestTop = proposed.top;
  let bestDy = threshold + 1;
  let snappedY = false;
  for (const target of topEdgeTargets) {
    const dist = Math.abs(proposed.top - target);
    if (dist <= threshold && dist < bestDy) {
      bestDy = dist;
      bestTop = target;
      snappedY = true;
    }
  }

  return {
    left: Math.round(bestLeft),
    top: Math.round(bestTop),
    guides: { x: snappedX, y: snappedY },
  };
}
