# Selection-layer cost audit

**Area:** Selection / overlay DOM measurement  
**File:** `web/src/components/edit-chrome/selection-layer.tsx` (6 397 lines)  
**Audit date:** 2026-06-05  
**Analyst:** Sonnet 4.6 sub-agent

---

## Current state

The selection layer manages four distinct DOM-scan / measurement operations. Three
of them have already received partial mitigations; one remains a raw O(N²) each
time it fires.

---

### Operation 1 — `collectCanvasDropCandidates` (lines 362–437)

**Trigger:** Called once at drag-start via `rebuildCanvasDropIndex` (line 1408),
then again on every `scroll`/`resize` during the drag, and as a fallback inside
`computeCanvasNodeDrop` (line 1432) if the cache is somehow cold.

**Cost per call:**

```
elements = querySelectorAll("[data-builder-node-id]")       → 1 full DOM walk  (O(N))
for each element el:
    getAttribute(...)                                       → O(1)
    findBuilderNodeById(tree, id)                           → O(T) tree search
    getBoundingClientRect()                                 → forced layout reflow
    for each OTHER element other:                           → O(N) inner loop
        getAttribute(...)
        findBuilderNodeById(tree, otherId)                  → O(T)
        other.contains(el)                                  → O(log depth)
for each candidate's children:
    idToEl.get(child.id)                                    → O(1) via Map
    getBoundingClientRect()                                 → forced layout
```

**Complexity:** O(N² × T) where N = number of `[data-builder-node-id]` elements
and T = builder-tree depth for `findBuilderNodeById`. The comment at line 387 says
"Cheap O(n²) over the (small) candidate set" — but `elements` is the FULL node
list (leaves included), not just the container candidates. On a rich freeform
design with 60 nodes (5 containers, 55 leaves), the depth loop at lines 389–401
iterates over all 60 elements for each of the 60 candidates = 3 600 `.contains()`
calls per collection. Each `.contains()` forces the browser to walk the DOM
ancestor chain.

Every call also forces **N+C synchronous reflows** (one `getBoundingClientRect`
per node + one per child of each container) — the exact layout-thrash pattern.

**Partial mitigation in place:** The candidate list is cached per drag gesture
(`canvasDropIndexRef`, lines 1405, 1737–1756), so `computeCanvasNodeDrop` on
`dragover` (which fires 60 times/s) hits the cache, not the DOM. The raw call
happens once at drag-start and on scroll/resize during the drag only.

---

### Operation 2 — `buildMarqueeIndex` (lines 1212–1225)

**Trigger:** Called once at `pointerdown` (marquee start, line 1267), then again
on every `scroll`/`resize` while the marquee is active (line 1257).

**Cost per call:**

```
querySelectorAll("[data-builder-node-id]")    → full DOM walk O(N)
for each element:
    getAttribute + findBuilderNodeById        → O(T)
    getBoundingClientRect()                   → forced layout
```

**Complexity:** O(N × T). One reflow per node. No containment quadratic — this
one is truly O(N).

**Partial mitigation in place:** Index is built once at gesture start
(`marqueeIndexRef`, line 1267) and reused per `pointermove` frame via rAF
coalescing (line 1230). Only rebuilt on scroll/resize.

---

### Operation 3 — `computeDrop` for section reorder (lines 1760–1821)

**Trigger:** Called on **every `pointermove`** while the section drag is active
(lines 1827–1866) AND on every tick of the auto-scroll rAF loop (line 1942).

**Cost per call:**

```
querySelectorAll("[data-cms-section][data-section-id][data-slot-key]")
                                              → full DOM walk O(S)
for each section element:
    3× getAttribute                           → O(1)
    getBoundingClientRect()                   → forced layout
```

**Complexity:** O(S) with S = section count. Because it runs inside
`onPointerMove` (not inside a rAF), it forces a synchronous layout reflow on
**every mouse-move event** (potentially 60–120 per second at 120 Hz) and on
**every auto-scroll tick**. This is the worst operational hot-path: no cache, no
rAF throttle, no early exit.

Unlike the canvas-node drag path (which has `canvasDropIndexRef`), the section
reorder path has **no index cache at all**.

---

### Operation 4 — imperative rAF tracking loop (lines 2206–2277)

**Trigger:** Runs **every animation frame** while a single node is selected. The
loop calls `sync()` which calls `getSelectedBuilderNodeEl()` (a
`document.querySelector`) then `getBoundingClientRect()`.

**Cost per call:**

```
document.querySelector("[data-builder-node-id=<id>]")   → targeted O(1) in practice
getBoundingClientRect()                                  → forced layout
```

**Complexity:** O(1) per frame, but the reflow is forced 60 times/s. The reflow
cost depends on how many other elements have dirty style; with the full builder
canvas mounted and a scroll or handle-drag happening, this can stall the main
thread by 1–3 ms/frame.

There is a meaningful observation here: while the rAF loop itself is O(1), it is
**unconditional** — it runs even when the element has not moved (no scroll, no
resize, no drag). A `ResizeObserver` on the selected element would let the loop
skip the measurement when nothing has changed (the observer would fire only on
layout changes).

---

### Operation 5 — hover node rect (`scheduleRectRecompute`, lines 758–773)

**Trigger:** Fires on every `pointermove` → `setHoveredBuilderNodeId` → context
re-render → useEffect dep change → rAF. Practically: on every hover transition.

**Cost per call:**

```
document.querySelectorAll("[data-builder-node-id=<id>]")  → O(1) targeted
+ .find() with .closest() guard                           → O(depth × M)
getBoundingClientRect()                                   → forced layout
```

**Complexity:** O(1) targeted query + O(depth) ancestor walk. Low cost in
isolation, but the dep chain `pointermove → setHoveredBuilderNodeId → context
re-render → scheduleRectRecompute rAF` means a React render happens on every
hover change (this feeds back into the "whole-editor re-render" problem noted in
Sub-step E).

---

## Problems

### P1 — `computeDrop` has no index cache; forces layout on every pointermove (CRITICAL)

`computeDrop` (line 1760) calls `querySelectorAll` + `getBoundingClientRect` per
section on **every** `onPointerMove` and auto-scroll tick. A 20-section page
forces 20 reflows at potentially 120 Hz = 2 400 reflows/s during a section drag.
The canvas-node drag path already has a cache (`canvasDropIndexRef`); the section
reorder path does not.

### P2 — `collectCanvasDropCandidates` depth loop is O(N²) over all nodes, not just containers (HIGH)

Lines 389–401: the depth check iterates over `elements` (all N nodes), not just
the container candidates. On a 60-node page this is 3 600 `.contains()` calls per
collection. The comment claims "small candidate set" but the loop variable is
`other of elements`, the full list. Fix: build the candidate list first (filter to
containers), then run the depth check over only that filtered set.

### P3 — imperative rAF tracking loop runs unconditionally every frame (MEDIUM)

Lines 2258–2262: `overlayTrackRafRef` calls `getBoundingClientRect` 60 times/s
even when the selected element has not moved. A `ResizeObserver` + scroll
listener + dirty flag would let the loop skip measurement when the geometry is
stable.

### P4 — `selectedBuilderNodeRects` useMemo calls `getBoundingClientRect` inside render (MEDIUM)

Lines 2070–2085: `selectedBuilderNodeRects` is a `useMemo` that calls
`el.getBoundingClientRect()` for each selected node. `useMemo` runs inside the
React render phase, which means this reflow happens synchronously during React's
commit. On multi-select (e.g., 10 selected nodes) this is 10 forced reflows
during render. It should move out of render and into the rAF tracking loop or an
effect.

### P5 — `buildMarqueeIndex` calls `findBuilderNodeById` (O(T)) inside the per-element loop (LOW)

Lines 1212–1225: each element calls `findBuilderNodeById(builderTree, id)`, a
linear tree walk. On a 100-node tree with 80 elements in the query, this is 80
tree walks. A `Map<id, node>` built once from the tree (O(T) amortised to O(1)
per lookup) would reduce this from O(N×T) to O(N).

---

## Recommended replacement design

### R1 — Section reorder index cache (mirrors the canvas-node cache)

Build a `sectionDropIndexRef` at drag-start in `startDrag` (line 1980), exactly
like `canvasDropIndexRef` for the canvas-node path. Cache the section rects once;
refresh on scroll/resize. `computeDrop` reads the cache instead of querying the
DOM. Drop the `querySelectorAll` + `getBoundingClientRect` loop from the hot path
entirely.

```typescript
// At drag-arm:
sectionDropIndexRef.current = buildSectionDropIndex();
// On scroll/resize during drag:
sectionDropIndexRef.current = buildSectionDropIndex();
// In computeDrop:
const items = sectionDropIndexRef.current ?? buildSectionDropIndex();
```

**Impact:** Eliminates layout thrash on every pointermove during section reorder.

### R2 — Fix depth-loop scope in `collectCanvasDropCandidates`

Replace the `for (const other of elements)` loop at line 389 with iteration over
the `candidates` array that has already been filtered to containers only. Since
candidates are built in the same loop, build them in two passes: first pass
collects containers + their rects; second pass computes depth over the container
subset.

```typescript
// Pass 1: collect container elements + rects
const containerEls = elements.filter(el => {
  const id = el.getAttribute("data-builder-node-id");
  const node = nodeMap.get(id ?? "");
  return node && BUILDER_NODE_REGISTRY[node.kind].children.type !== "none";
});
// Pass 2: depth is now O(C²) where C = container count, not O(N²)
for (const el of containerEls) {
  let depth = containerEls.filter(other => other !== el && other.contains(el)).length;
  ...
}
```

Use a pre-built `Map<id, BuilderNode>` from the tree to avoid O(T) per lookup.

### R3 — Gate the rAF tracking loop with a dirty flag

Add a `geometryDirtyRef: React.MutableRefObject<boolean>`. Set it `true` from:
- the `ResizeObserver` on the selected element (already wired at line 815)
- the `scroll` listener (already wired at line 1155)
- `MutationObserver` attribute changes (already wired at line 817)

In `sync()` (line 2214): return early if `!geometryDirtyRef.current`; set it
`false` after reading.

```typescript
const sync = () => {
  if (!geometryDirtyRef.current) return;
  geometryDirtyRef.current = false;
  const el = getSelectedBuilderNodeEl() ?? getSelectedSectionEl();
  if (!el) return;
  const r = el.getBoundingClientRect();
  // ... write overlay refs
};
```

**Impact:** Eliminates the majority of `getBoundingClientRect` calls (those on
frames where the selected element has not moved), which is the common case during
idle editing.

### R4 — Move `selectedBuilderNodeRects` out of useMemo into an effect/rAF

Replace the `useMemo` at lines 2070–2093 with a `useRef` that is updated by the
rAF tracking loop (or a `useLayoutEffect` triggered by selection changes). This
removes forced reflows from the React render phase.

### R5 — Pre-build a node Map for `findBuilderNodeById` inside loops

In `buildMarqueeIndex` and `collectCanvasDropCandidates`, build a
`Map<string, BuilderNode>` once before the loop:

```typescript
function buildNodeMap(tree: BuilderNodeTree): Map<string, BuilderNode> {
  const map = new Map<string, BuilderNode>();
  const stack = [...tree];
  while (stack.length) {
    const node = stack.pop()!;
    map.set(node.id, node);
    if ("children" in node && Array.isArray(node.children)) stack.push(...node.children);
  }
  return map;
}
```

This reduces per-element lookup from O(T) to O(1).

---

## Sequencing

R1 is the highest-value fix (eliminates a raw hot-path layout thrash on every
pointermove) and touches only `computeDrop` + `startDrag` — zero risk to the
canvas-node drag path which already has its own cache. It is independent of all
other items.

R2 is a surgical change inside `collectCanvasDropCandidates` — the fix is
entirely local to that function's two passes.

R3 requires care: the `ResizeObserver` and `MutationObserver` are already wired
(lines 813–822), so the dirty-flag is just a short-circuit in `sync()`. Must
verify the flag gets set by all three sources (RO, MO, scroll) before landing.

R4 is the riskiest: `selectedBuilderNodeRects` feeds the multi-select bounding
box and the multi-select toolbar; moving it out of useMemo requires verifying
timing across render + rAF cycle. Do last.

R5 is pure refactor with no observable behaviour change; safe at any point.

**Wave order: R1 → R2 → R5 (parallel) → R3 → R4**
