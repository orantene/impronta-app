/**
 * Client-canvas builder-tree bridge (W3 Sub-step B).
 *
 * The storefront body (`homepage-cms-sections.tsx`, where the canvas DOM lives)
 * renders in the page `{children}` slot. The in-place editor's `EditProvider`
 * is mounted as a SIBLING subtree by `<EditChromeMount>` in the root layout —
 * it does NOT wrap the body. React context therefore cannot cross from
 * `EditProvider` into the body, so `<ClientBuilderCanvas>` (which lives in the
 * body) cannot read `builderTree` straight off `useEditContext()`.
 *
 * This module is the minimal cross-subtree bridge: a process-singleton store
 * that `EditProvider` PUBLISHES the live `builderTree` into, and that
 * `<ClientBuilderCanvas>` SUBSCRIBES to via `useSyncExternalStore`. It is a
 * deliberately tiny slice of the Sub-step E selector store — scoped to exactly
 * the one value the client canvas needs.
 *
 * SAFETY: both the publish (EditProvider) and the subscribe (ClientBuilderCanvas)
 * are gated behind `isBuilderClientCanvasEnabled()`. With the flag OFF nothing
 * touches this store and the legacy server-render path is byte-identical.
 */
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";

type Listener = () => void;

let currentTree: BuilderNodeTree | null = null;
const listeners = new Set<Listener>();

/**
 * Publish the latest in-memory tree. Called from `EditProvider` (flag-gated).
 * Stores the reference as-is; the canvas's `React.memo` boundaries rely on
 * `Object.is` identity, so callers must pass the same immutable-update tree
 * they hold in state (not a clone).
 */
export function publishBuilderCanvasTree(tree: BuilderNodeTree | null): void {
  if (Object.is(currentTree, tree)) return;
  currentTree = tree;
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` subscribe — returns an unsubscribe fn. */
export function subscribeBuilderCanvasTree(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore` snapshot getter. Stable reference between publishes. */
export function getBuilderCanvasTreeSnapshot(): BuilderNodeTree | null {
  return currentTree;
}

// ── Canvas-mounted signal (builder-perf-2026, reload fix) ──────────────────
// `<ClientBuilderCanvas>` mounts ONLY in the freeform full-page branch of
// `homepage-cms-sections.tsx` (and only when edit mode + the flag are on). The
// per-edit refresh-skip in `edit-context` must therefore gate on whether a canvas
// is ACTUALLY mounted for THIS page — not merely on the build flag. On a
// curated-slot page the flag can be on yet NO canvas is mounted; skipping the
// refresh there (the old `isBuilderClientCanvasEnabled()`-only gate) would leave
// the server-rendered canvas stale with nothing to repaint it. A reference count
// (not a bool) tolerates a transient mount/unmount overlap during a re-render.
let mountedCanvasCount = 0;

/**
 * Register a mounted `<ClientBuilderCanvas>`. Call from a mount effect; the
 * returned fn decrements on unmount. Idempotent per caller via the effect cleanup.
 */
export function registerClientBuilderCanvasMount(): () => void {
  mountedCanvasCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mountedCanvasCount = Math.max(0, mountedCanvasCount - 1);
  };
}

/**
 * True when a FULL-PAGE `<ClientBuilderCanvas>` is mounted (freeform full-page
 * design) — it reflects the ENTIRE tree client-side, including curated sections
 * (as pre-rendered `section_embed` islands). So both builder-node edits AND
 * curated-prop edits repaint here and the per-edit `router.refresh()` is pure lag.
 * False on legacy/curated-slot pages (no full-page canvas) and when the flag is off.
 */
export function isClientBuilderCanvasMounted(): boolean {
  return mountedCanvasCount > 0;
}

// ── Section-children canvas signal (builder-perf-2026, curated-slot coverage) ──
// On a CURATED-SLOT page each section is server-rendered as `[curated <Component>]
// + [its freeform/role-bound builder children]`. `<ClientSectionChildren>` wraps
// ONLY the children, repainting them client-side on edit — so builder-node edits
// (text colour/size/bold, the common case) skip the refresh and feel instant. The
// curated server `<Component>` is NOT reflected here, so a curated-PROP edit still
// needs a server refresh — which is why this is a SEPARATE signal from the
// full-page one: `edit-context` lets builder-tree edits skip when EITHER signal is
// set, but keeps the curated-prop dispatch refreshing unless the FULL-PAGE canvas
// is mounted.
let mountedSectionChildrenCount = 0;

/** Register a mounted `<ClientSectionChildren>`. Returns the unmount decrementer. */
export function registerSectionChildrenCanvasMount(): () => void {
  mountedSectionChildrenCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mountedSectionChildrenCount = Math.max(0, mountedSectionChildrenCount - 1);
  };
}

/**
 * True when at least one `<ClientSectionChildren>` is mounted — i.e. a curated
 * section's builder CHILDREN repaint client-side, so a builder-node edit can skip
 * the per-edit refresh. Does NOT imply curated `<Component>` props are reflected.
 */
export function isSectionChildrenCanvasMounted(): boolean {
  return mountedSectionChildrenCount > 0;
}

/** True when ANY client canvas (full-page OR section-children) reflects builder-node edits. */
export function isAnyBuilderNodeCanvasMounted(): boolean {
  return mountedCanvasCount > 0 || mountedSectionChildrenCount > 0;
}

// ── Storefront-body canvas signal (wave-2 cms-page canvas) ─────────────────
// The freeform cms_page storefront route (`/p/[[...slug]]`) now mounts a
// `<ClientBuilderCanvas>` IN the page body while edit mode is active — the same
// hosting the homepage has always had. `EditShell` for the cms_page surface also
// mounts `<InEditorCanvasRegion>` (built for the chrome-only hosts: Builder Lab,
// talent pages), which would paint the SAME tree a second time below the
// storefront footer. This signal is how the region knows a body canvas exists
// for the current page and must not double-paint. It is a SEPARATE counter from
// the full-page one above because the region's own canvas increments that one —
// gating on it would self-suppress. Subscribable so the region reacts if the
// body canvas mounts after the shell (auto-enter engage → RSC refresh).
let storefrontBodyCanvasCount = 0;
const storefrontBodyCanvasListeners = new Set<Listener>();

/** Register a STOREFRONT-BODY-hosted canvas. Call from a mount effect; the
 *  returned fn decrements on unmount. */
export function registerStorefrontBodyCanvasMount(): () => void {
  storefrontBodyCanvasCount += 1;
  for (const listener of storefrontBodyCanvasListeners) listener();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    storefrontBodyCanvasCount = Math.max(0, storefrontBodyCanvasCount - 1);
    for (const listener of storefrontBodyCanvasListeners) listener();
  };
}

/** `useSyncExternalStore` subscribe for the storefront-body signal. */
export function subscribeStorefrontBodyCanvas(listener: Listener): () => void {
  storefrontBodyCanvasListeners.add(listener);
  return () => {
    storefrontBodyCanvasListeners.delete(listener);
  };
}

/** True when the page body (storefront `/p` route) hosts the full-page canvas. */
export function isStorefrontBodyCanvasMounted(): boolean {
  return storefrontBodyCanvasCount > 0;
}

// ── Server-rendered storefront body signal (stale-body fix, 2026-08-15) ────
// The `/p/[[...slug]]` freeform route can be in edit mode WITHOUT mounting
// `<StorefrontBodyCanvas>` (client-canvas flag off, or the capability check
// failed) — the visible body is then a pure SERVER render. Before this signal,
// that configuration resurrected the pre-#1029 double paint (the in-editor
// region painted the same tree again below the footer) with a WORSE twist: the
// region's `<ClientBuilderCanvas>` incremented `mountedCanvasCount`, so the
// per-edit `router.refresh()` safety net in edit-context concluded "a canvas
// repaints this page" and skipped — repainting only the hidden region copy
// while the body the operator was looking at stayed stale on EVERY tree edit
// ("I save and nothing changes"). Reproduced 2026-08-15 on /p/wave2-canvas for
// BOTH the single-node inspector lane and the bulk style lane.
//
// The server page registers this marker (via <StorefrontBodyServerMarker/>)
// whenever it renders the body server-side in edit mode. The region reads
// `isStorefrontBodyPresent()` (canvas OR server render) to suppress its
// duplicate paint; with the region suppressed, `mountedCanvasCount` correctly
// stays 0 for the page and the refresh safety net repaints the visible body.
// DELIBERATELY a separate counter from the canvas one: this marker must never
// make `isClientBuilderCanvasMounted()` / `isAnyBuilderNodeCanvasMounted()`
// true — claiming a live canvas exists is exactly the lie that caused the
// stale body.
let storefrontBodyServerRenderCount = 0;

/** Register a SERVER-RENDERED storefront body (edit mode, no body canvas).
 *  Call from a mount effect; the returned fn decrements on unmount. */
export function registerServerRenderedStorefrontBody(): () => void {
  storefrontBodyServerRenderCount += 1;
  for (const listener of storefrontBodyCanvasListeners) listener();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    storefrontBodyServerRenderCount = Math.max(
      0,
      storefrontBodyServerRenderCount - 1,
    );
    for (const listener of storefrontBodyCanvasListeners) listener();
  };
}

/**
 * True when the storefront page body paints the tree AT ALL — as the live
 * body canvas OR as a server render. Either way the in-editor region must not
 * paint the same tree a second time below the footer. Shares the
 * storefront-body listener set, so `subscribeStorefrontBodyCanvas` observes
 * both signals.
 */
export function isStorefrontBodyPresent(): boolean {
  return storefrontBodyCanvasCount > 0 || storefrontBodyServerRenderCount > 0;
}
