/**
 * canvas-drop-candidates.ts — the DOM-measure half of the canvas drag.
 *
 * Extracted from `selection-layer.tsx` (builder-2027 P1 / 1C) so the hot path
 * can be unit-tested and instrumented on its own. `resolveCanvasNodeDrop` (in
 * `builder-node/canvas-node-drop.ts`) is the pure decision half; this module is
 * everything that has to touch the live DOM to feed it.
 *
 * THE COST MODEL, AND WHY IT IS SHAPED LIKE THIS
 * ──────────────────────────────────────────────
 * A full scan costs, for a page with N rendered `[data-builder-node-id]`
 * elements of which C are containers and R total direct-child rows:
 *
 *   1 querySelectorAll  +  C + R getBoundingClientRect  +  C x (C-1) contains()
 *
 * On a ~540-node page C is far smaller than N (most nodes are leaves: text,
 * image, button), so the containment scan is O(C^2), not O(N^2). The
 * getBoundingClientRect calls are the real cost: each one can force a synchronous
 * layout flush.
 *
 * That is why NOTHING here runs per drag frame. `SelectionLayer` snapshots the
 * candidate list ONCE at drag-start and hit-tests the cached bands per frame;
 * the snapshot is refreshed only on the two inputs that move viewport rects
 * (canvas scroll, window resize), and those refreshes are coalesced to one per
 * animation frame by `createCanvasDropIndexRefresher` below — a drag autoscroll
 * emits many scroll events per frame and each one used to pay a full rescan.
 *
 * `readCanvasDropScanStats()` reports the DOM-operation counters the perf test
 * asserts on. Counting operations rather than wall-clock is deliberate: under
 * jsdom `getBoundingClientRect` is a cheap stub, so a millisecond number there
 * would measure nothing about a real browser. The operation COUNT is the same in
 * both, and it is the quantity the optimisation actually changes.
 */
import {
  BUILDER_NODE_REGISTRY,
  type BuilderNode,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import type { CanvasDropCandidate } from "@/lib/site-admin/builder-node/canvas-node-drop";
import type { NodeCapabilityContext } from "@/lib/site-admin/builder-node/node-capabilities";

import { isStructuralOrSelfLocked } from "./selection-layer-node-caps";

/**
 * Flatten the tree into an id->node Map ONCE. The hot DOM-measure loops used to
 * call a full-tree `findBuilderNodeById` per element (O(N.tree) per scan) and
 * again per OTHER element in the depth loop (O(N^2.tree)). One Map turns each
 * lookup into O(1).
 */
export function buildBuilderNodeMap(
  tree: BuilderNodeTree,
): Map<string, BuilderNode> {
  const map = new Map<string, BuilderNode>();
  const stack = [...tree];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    map.set(current.id, current);
    if ("children" in current && Array.isArray(current.children)) {
      for (const child of current.children) stack.push(child);
    }
  }
  return map;
}

// ── instrumentation ─────────────────────────────────────────────────────────
// Counters for the perf guard. Incrementing three integers is free next to the
// layout flush each measured call can trigger, so this stays on in production
// rather than hiding behind a flag that would let the guard drift from reality.

interface CanvasDropScanStats {
  /** Full `collectCanvasDropCandidates` runs. */
  scans: number;
  /** `getBoundingClientRect` calls (the layout-flush risk). */
  rectReads: number;
  /** `Node.contains` calls in the depth scan. */
  containsChecks: number;
}

const stats: CanvasDropScanStats = {
  scans: 0,
  rectReads: 0,
  containsChecks: 0,
};

export function readCanvasDropScanStats(): Readonly<CanvasDropScanStats> {
  return { ...stats };
}

export function resetCanvasDropScanStats(): void {
  stats.scans = 0;
  stats.rectReads = 0;
  stats.containsChecks = 0;
}

/**
 * Walk the live DOM to build the drop-candidate list for `resolveCanvasNodeDrop`.
 * Every rendered `[data-builder-node-id]` whose node accepts children becomes a
 * candidate; depth = ancestor-candidate count; `locked` covers role-bound /
 * curated nodes (which own their structure) and the explicit `node.locked` flag.
 * Child rows are the candidate's DIRECT builder-node children (by id), in
 * document order, with their vertical bands.
 */
export function collectCanvasDropCandidates(
  tree: BuilderNodeTree,
  ctx: NodeCapabilityContext,
): CanvasDropCandidate[] {
  if (typeof document === "undefined") return [];
  stats.scans += 1;
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-builder-node-id]"),
  );
  const idToEl = new Map<string, HTMLElement>();
  for (const el of elements) {
    const id = el.getAttribute("data-builder-node-id");
    if (id && !idToEl.has(id)) idToEl.set(id, el);
  }
  const nodeById = buildBuilderNodeMap(tree);

  // FIRST pass: resolve only the CONTAINER elements (a drop parent must have
  // children.type not "none" and a non-zero box). The depth loop then iterates
  // THIS small container set, not every [data-builder-node-id] element.
  const containerEls: {
    el: HTMLElement;
    id: string;
    node: BuilderNode;
    rect: DOMRect;
  }[] = [];
  for (const el of elements) {
    const id = el.getAttribute("data-builder-node-id");
    if (!id) continue;
    const node = nodeById.get(id);
    if (!node) continue;
    // Guard an unknown/corrupt node.kind (registry entry missing): treat it as a
    // non-container so it's never offered as a drop target, instead of crashing.
    const childrenPolicy = BUILDER_NODE_REGISTRY[node.kind]?.children;
    if (!childrenPolicy || childrenPolicy.type === "none") continue;
    stats.rectReads += 1;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    containerEls.push({ el, id, node, rect });
  }

  const candidates: CanvasDropCandidate[] = [];
  for (const { el, id, node, rect } of containerEls) {
    // Depth = how many OTHER CONTAINER candidates contain this one.
    let depth = 0;
    for (const other of containerEls) {
      if (other.el === el) continue;
      stats.containsChecks += 1;
      if (other.el.contains(el)) depth += 1;
    }

    const locked = isStructuralOrSelfLocked(node, ctx);

    const childRows =
      "children" in node && Array.isArray(node.children)
        ? node.children.flatMap((child) => {
            const childEl = idToEl.get(child.id);
            if (!childEl) return [];
            stats.rectReads += 1;
            const childRect = childEl.getBoundingClientRect();
            return [
              { nodeId: child.id, top: childRect.top, bottom: childRect.bottom },
            ];
          })
        : [];

    candidates.push({
      nodeId: id,
      kind: node.kind,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      depth,
      locked,
      children: childRows,
    });
  }
  return candidates;
}

/**
 * Coalesce scroll/resize-driven rescans to at most one per animation frame.
 *
 * A pointer drag near the viewport edge runs an autoscroll rAF loop; each tick
 * scrolls the container, and the capture-phase `scroll` listener fired a full
 * `collectCanvasDropCandidates` per event. Browsers can also emit several scroll
 * events between two paints. Every one of those rescans was thrown away by the
 * next one before anything read it, and each one paid C + R
 * getBoundingClientRect calls with a layout flush behind them.
 *
 * `request()` is safe to call as often as the events arrive: the work runs once,
 * in the frame the result is actually needed. `cancel()` drops a pending frame
 * so a finished gesture cannot rebuild an index nobody will read.
 *
 * `raf`/`caf` are injectable so the test can drive frames deterministically
 * instead of racing a real animation clock.
 */
export function createCanvasDropIndexRefresher(
  run: () => void,
  raf: (cb: () => void) => number = typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number,
  caf: (handle: number) => void = typeof cancelAnimationFrame === "function"
    ? (handle) => cancelAnimationFrame(handle)
    : (handle) => clearTimeout(handle as unknown as NodeJS.Timeout),
): { request: () => void; cancel: () => void } {
  let pending: number | null = null;
  return {
    request() {
      if (pending !== null) return;
      pending = raf(() => {
        pending = null;
        run();
      });
    },
    cancel() {
      if (pending === null) return;
      caf(pending);
      pending = null;
    },
  };
}
