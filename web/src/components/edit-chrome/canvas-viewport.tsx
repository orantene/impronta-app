"use client";

/**
 * Canvas viewport tools — 4C (#29 zoom/pan/fit + #31 rulers/guides).
 *
 * THREE pieces, all self-contained within this file:
 *
 * 1. ZOOM / PAN  (#29)
 *    • `CanvasViewportProvider` — React context holding the zoom level (0.25–2)
 *      and persisting it in sessionStorage per device tier.
 *    • `CanvasZoomStyle`  — renders a <style> tag that applies
 *      `transform: scale(zoom)` with `transform-origin: top center` to the
 *      live storefront DOM (outside the `[data-edit-chrome]` portal).
 *    • `CanvasZoomControls` — bottom-right HUD: Fit, 100%, +/−, zoom-to-selection.
 *    • Space+drag pan — global pointer handler that scrolls the viewport when
 *      Space is held; cursor switches to `grab` / `grabbing`.
 *
 *    WHY transform-on-body is safe for selection-layer:
 *      `getBoundingClientRect()` already returns VISUAL (post-transform) coordinates
 *      in viewport px.  `clientX/Y` from pointer events are also viewport px.
 *      Both are in the same coordinate system regardless of any CSS transform on
 *      an ancestor — so rings, hit-testing, drag, resize, and spacing handles all
 *      continue to work correctly at every zoom level with zero changes to
 *      selection-layer.
 *
 * 2. RULERS  (#31)
 *    • `CanvasRulers` — optional top (horizontal) + left (vertical) rulers, 20px
 *      wide each, with tick marks scaled to zoom.  The ruler zero-point is the
 *      document origin (0, 0), adjusted for scroll.  Guides can be dragged out of
 *      each ruler (pointer-down on the ruler then move into the canvas).
 *    • Rulers are hidden when `showRulers` is false.  Toggle via the HUD or ⌘R.
 *
 * 3. GUIDES  (#31)
 *    • Session-scoped per-page guide store (no DB — sessionStorage, keyed by pageId).
 *    • `CanvasGuides` renders semi-transparent guide lines at their stored px positions.
 *    • Dragging a guide repositions it; dragging it back onto the ruler removes it.
 *    • Blocks snap to the nearest guide within GUIDE_SNAP_PX when the move / resize
 *      handles are active.  The snap utility `findGuideSnap` is exported for
 *      selection-layer consumers.
 *
 * COORDINATE NOTES:
 *   • Guide positions are stored in DOCUMENT coordinates (px from the document
 *     origin at zoom=1), so they're zoom-invariant.
 *   • For rendering, document-px → viewport-px = (guideDocPx - scrollOffset) * zoom
 *     (plus the ruler gutter offset).
 *   • For hit-testing while dragging, viewport-px → document-px reverses that.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CANVAS_FLOATING_BAR, CHROME, CHROME_RADII, Z_INDEX } from "./kit/tokens";
import { BUILDER_VISUAL } from "./inspectors/kit/tokens";
import {
  DEFAULT_WORKSPACE_CANVAS_MODE,
  resolveCanvasAvailableWidth,
  resolveCanvasHudLeftInset,
} from "./workspace-layout";

// ── constants ──────────────────────────────────────────────────────────────

/**
 * Neutral hover wash for zoom-bar buttons. Violet is reserved for the ACTIVE
 * state (as on the text toolbar), so hover stays neutral or the two read alike.
 */
const ZOOM_BTN_HOVER_BG = "rgba(24, 24, 27, 0.05)";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;
const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

// ── context ────────────────────────────────────────────────────────────────

export interface CanvasGuide {
  id: string;
  axis: "x" | "y";
  /** Position in document-px at zoom=1, from the document origin. */
  positionPx: number;
}

interface CanvasViewportState {
  /** Current zoom level (1.0 = 100%). */
  zoom: number;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (z: number) => void;
  /** Fit the entire page into the available viewport. */
  fitPage: () => void;
  showRulers: boolean;
  toggleRulers: () => void;
  guides: ReadonlyArray<CanvasGuide>;
  addGuide: (g: Omit<CanvasGuide, "id">) => void;
  moveGuide: (id: string, positionPx: number) => void;
  removeGuide: (id: string) => void;
}

const CanvasViewportContext = createContext<CanvasViewportState | null>(null);

export function useCanvasViewport(): CanvasViewportState {
  const ctx = useContext(CanvasViewportContext);
  if (!ctx) throw new Error("useCanvasViewport must be used inside CanvasViewportProvider");
  return ctx;
}

// Nullable version for consumers that tolerate no provider (e.g. DeviceFrameSurface)
export function useMaybeCanvasViewport(): CanvasViewportState | null {
  return useContext(CanvasViewportContext);
}

// ── storage helpers ────────────────────────────────────────────────────────

function readZoom(key: string): number {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return 1;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
  } catch {
    return 1;
  }
}
function writeZoom(key: string, zoom: number) {
  try {
    sessionStorage.setItem(key, String(zoom));
  } catch {
    // Quota / private-mode — degrade silently.
  }
}

function readGuidesForPage(pageKey: string): CanvasGuide[] {
  try {
    const raw = sessionStorage.getItem(`canvas-guides:${pageKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is CanvasGuide =>
        g != null &&
        typeof (g as CanvasGuide).id === "string" &&
        ((g as CanvasGuide).axis === "x" || (g as CanvasGuide).axis === "y") &&
        typeof (g as CanvasGuide).positionPx === "number",
    );
  } catch {
    return [];
  }
}
function writeGuidesForPage(pageKey: string, guides: ReadonlyArray<CanvasGuide>) {
  try {
    sessionStorage.setItem(`canvas-guides:${pageKey}`, JSON.stringify(guides));
  } catch {
    // Quota — degrade silently.
  }
}

function newGuideId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── provider ───────────────────────────────────────────────────────────────

export function CanvasViewportProvider({
  children,
  pageId,
}: {
  children: ReactNode;
  /** Page id for guide persistence key; null on first paint. */
  pageId: string | null;
}) {
  const zoomKey = "canvas-viewport:zoom";
  const [zoom, setZoomState] = useState<number>(1);
  const [showRulers, setShowRulers] = useState(false);
  const [guides, setGuides] = useState<CanvasGuide[]>([]);
  const pageIdRef = useRef<string | null>(null);

  // Hydrate zoom from sessionStorage after mount (SSR-safe).
  useEffect(() => {
    setZoomState(readZoom(zoomKey));
  }, []);

  // Load guides when pageId resolves (deferred composition load).
  useEffect(() => {
    if (!pageId || pageId === pageIdRef.current) return;
    pageIdRef.current = pageId;
    setGuides(readGuidesForPage(pageId));
  }, [pageId]);

  // Persist guides whenever they change.
  useEffect(() => {
    if (!pageId) return;
    writeGuidesForPage(pageId, guides);
  }, [guides, pageId]);

  const setZoom = useCallback((z: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
    setZoomState(clamped);
    writeZoom(zoomKey, clamped);
  }, []);

  const zoomIn = useCallback(() => {
    setZoomState((prev) => {
      // Step to the next preset above current.
      const next =
        ZOOM_PRESETS.find((p) => p > prev + 0.001) ??
        Math.min(ZOOM_MAX, Math.round((prev + ZOOM_STEP) * 100) / 100);
      writeZoom(zoomKey, next);
      return next;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState((prev) => {
      const next =
        [...ZOOM_PRESETS].reverse().find((p) => p < prev - 0.001) ??
        Math.max(ZOOM_MIN, Math.round((prev - ZOOM_STEP) * 100) / 100);
      writeZoom(zoomKey, next);
      return next;
    });
  }, []);

  const zoomTo = useCallback(
    (z: number) => {
      setZoom(z);
      // Scroll to top so the page is fully visible after a zoom-to.
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    [setZoom],
  );

  const fitPage = useCallback(() => {
    if (typeof window === "undefined") return;
    const available = resolveCanvasAvailableWidth(DEFAULT_WORKSPACE_CANVAS_MODE);
    // Use the unscaled document width. document.documentElement.scrollWidth
    // reflects the rendered layout, which at zoom=1 is the real page width.
    // At zoom>1 the content is larger; we need the natural (zoom=1) width, so
    // temporarily query without the transform by reading scrollWidth /
    // current-zoom.  The body's scrollWidth grows with the transform only if
    // `transform: scale` changes the scroll area, which CSS typically does not
    // honour — scrollWidth stays at the original layout dimension regardless.
    const pageWidth = document.documentElement.scrollWidth;
    const fit = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((available / pageWidth) * 100) / 100));
    setZoom(fit);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [setZoom]);

  const toggleRulers = useCallback(() => {
    setShowRulers((v) => !v);
  }, []);

  const addGuide = useCallback((g: Omit<CanvasGuide, "id">) => {
    setGuides((prev) => [...prev, { ...g, id: newGuideId() }]);
  }, []);

  const moveGuide = useCallback((id: string, positionPx: number) => {
    setGuides((prev) =>
      prev.map((g) => (g.id === id ? { ...g, positionPx } : g)),
    );
  }, []);

  const removeGuide = useCallback((id: string) => {
    setGuides((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      zoom,
      setZoom,
      zoomIn,
      zoomOut,
      zoomTo,
      fitPage,
      showRulers,
      toggleRulers,
      guides,
      addGuide,
      moveGuide,
      removeGuide,
    }),
    [
      zoom,
      setZoom,
      zoomIn,
      zoomOut,
      zoomTo,
      fitPage,
      showRulers,
      toggleRulers,
      guides,
      addGuide,
      moveGuide,
      removeGuide,
    ],
  );

  return (
    <CanvasViewportContext.Provider value={value}>
      {children}
    </CanvasViewportContext.Provider>
  );
}

// ── zoom style injection ───────────────────────────────────────────────────

/**
 * Injects a `<style>` block that scales the live storefront DOM (everything
 * outside `[data-edit-chrome]` and `[data-edit-iframe-host]`).
 *
 * WHY a <style> tag instead of an inline `style` on the body: the body has
 * `data-edit-chrome` siblings that must NOT be scaled (fixed chrome), and the
 * body element itself is owned by Next.js / the storefront. A targeted CSS
 * rule limits the blast radius.
 *
 * `transform-origin: top center` keeps the top of the page pinned and
 * horizontally centred, matching how Figma / Webflow handle zoom-out.
 * The `margin-bottom` correction prevents the scroll bar from disappearing
 * when zooming out (the scaled block still occupies scroll height because
 * CSS transform doesn't affect layout — we add a spacer via `pb` on a
 * pseudo-element that we cannot do here, so we accept that scroll area may
 * undercount slightly at low zoom levels).
 *
 * `getBoundingClientRect()` returns VISUAL post-transform coordinates, which
 * is exactly what the selection-layer uses for ring placement and hit-testing.
 * No coordinate adjustments needed in selection-layer.
 */
export function CanvasZoomStyle({ zoom }: { zoom: number }) {
  // `:not(:has([data-edit-chrome]))` — same nested-mount guard as edit-shell's
  // device body-clip. On the storefront the chrome is a body-direct child so
  // this is a no-op; on non-homepage surfaces (Lab / workspace / talent pages)
  // the editor is mounted deep inside the page tree, so without this guard a
  // zoom!=1 would scale the ENTIRE platform-admin app (the body-direct child
  // that contains the chrome) instead of just the canvas. The in-editor canvas
  // region is scaled directly by marker so the canvas still zooms there.
  //
  // ── `isolation: isolate` is NOT part of the zoom, and is emitted at EVERY
  // zoom level including 100% ────────────────────────────────────────────────
  // An operator can give any canvas node a `z-index` up to 999 (the clamp lives
  // in `registry.ts` and `canvas-z-order.ts`; `Z_INDEX.canvasContentMax` names
  // it). Without a stacking context around the canvas, that 999 lands in the
  // ROOT stacking context and paints over the inspector dock (85), the drawers
  // (87/88), the top bar (90) — every panel. That is the owner's "the panels
  // are always behind".
  //
  // `transform: scale()` already created that stacking context, which is why
  // the bug only showed at 100% zoom, where the old `if (zoom === 1) return
  // null` emitted nothing at all. `isolation: isolate` creates the same
  // stacking context with NO layout, paint, or containing-block effect (unlike
  // `transform`, it does not become a containing block for `position: fixed`,
  // so a sticky/fixed element inside the canvas keeps behaving as it does on
  // the published page). Canvas z-indices now order canvas content against
  // canvas content, and nothing else.
  //
  // ── HONESTY NOTE for `position: fixed` (the operator-facing consequence) ───
  // At zoom === 1 the rule below emits `isolation` ONLY, so the canvas has NO
  // transform in the ancestry and a `position: fixed` block pins to the real
  // viewport — the canvas tells the truth, which is the default state.
  //
  // At zoom !== 1 the `transform: scale()` we add here IS a containing block for
  // fixed descendants, so a fixed block re-anchors to the canvas root while
  // zoomed. We keep it that way on purpose: the alternative — dropping zoom for
  // any page that contains one fixed block — takes a core canvas tool away from
  // the whole page because of a single element, which is a worse trade than a
  // known, stated deviation. So it is STATED, not hidden: the Position control
  // prints the caveat whenever Fixed is selected (PositionLayoutSection), and
  // `mobile-health.ts` raises a "Trapped fixed block" issue for the PUBLISHED
  // page version of the same trap (an ancestor with a blur / filter / transform)
  // and names the ancestor. Do not add a transform here at zoom === 1 without
  // reading that note first — it would make the canvas silently wrong.
  const zoomRules =
    zoom === 1
      ? ""
      : `
        transform: scale(${zoom}) !important;
        transform-origin: top center !important;`;
  return (
    <style>{`
      body > *:not([data-edit-chrome]):not([data-edit-iframe-host]):not(:has([data-edit-chrome])) {
        isolation: isolate !important;${zoomRules}
      }
      [data-in-editor-canvas-region] {
        isolation: isolate !important;${zoomRules}
      }
    `}</style>
  );
}

// ── space-drag pan ─────────────────────────────────────────────────────────

/**
 * `CanvasSpacePan` — holds Space to enter pan mode, then drag to scroll.
 *
 * This is a DOM-level side-effect component: it adds window event listeners
 * and mutates `document.body.style.cursor`. It mounts once inside
 * `EditShellInner` and is invisible (no rendered DOM).
 *
 * The component respects `prefers-reduced-motion` by checking the media
 * query — if the user has enabled reduced motion we skip the cursor change
 * (it still scrolls, just without the cursor mutation).
 */
export function CanvasSpacePan() {
  const panRef = useRef<{
    spaceDown: boolean;
    dragging: boolean;
    lastX: number;
    lastY: number;
    pointerId: number | null;
  }>({
    spaceDown: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    pointerId: null,
  });

  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mq.matches;
    const onChange = () => {
      prefersReducedMotion.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const state = panRef.current;

    function setCursor(kind: "grab" | "grabbing" | "") {
      if (prefersReducedMotion.current) return;
      document.body.style.cursor = kind || "";
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      // Don't intercept Space when typing in inputs / contenteditable.
      const tgt = e.target as HTMLElement | null;
      if (!tgt) return;
      const tag = tgt.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tgt.isContentEditable ||
        tgt.closest('[contenteditable="true"]')
      )
        return;
      if (state.spaceDown) return; // already held
      e.preventDefault();
      state.spaceDown = true;
      setCursor("grab");
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      state.spaceDown = false;
      state.dragging = false;
      state.pointerId = null;
      setCursor("");
    }

    function onPointerDown(e: PointerEvent) {
      if (!state.spaceDown) return;
      if (e.button !== 0) return;
      state.dragging = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.pointerId = e.pointerId;
      setCursor("grabbing");
      e.preventDefault();
    }

    function onPointerMove(e: PointerEvent) {
      if (!state.dragging || state.pointerId !== e.pointerId) return;
      const dx = e.clientX - state.lastX;
      const dy = e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      window.scrollBy(-dx, -dy);
    }

    function onPointerUp(e: PointerEvent) {
      if (state.pointerId !== e.pointerId) return;
      state.dragging = false;
      state.pointerId = null;
      if (state.spaceDown) setCursor("grab");
      else setCursor("");
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      document.body.style.cursor = "";
    };
  }, []);

  return null;
}

// ── keyboard zoom ──────────────────────────────────────────────────────────

/**
 * `CanvasKeyboardZoom` — ⌘= / ⌘+ zoom in, ⌘- zoom out, ⌘0 100%, ⌘⇧F fit.
 * Also handles the ⌘R ruler toggle.
 *
 * Separate from CanvasSpacePan so each concern has a single effect.
 */
export function CanvasKeyboardZoom() {
  const { zoomIn, zoomOut, zoomTo, fitPage, toggleRulers } = useCanvasViewport();

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      if (!tgt) return;
      const tag = tgt.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tgt.isContentEditable ||
        tgt.closest('[contenteditable="true"]')
      )
        return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key;

      if (key === "=" || key === "+") {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (key === "-") {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (key === "0") {
        e.preventDefault();
        zoomTo(1);
        return;
      }
      // ⌘⇧F — fit page.
      if (e.shiftKey && (key === "f" || key === "F")) {
        e.preventDefault();
        fitPage();
        return;
      }
      // ⌘R — toggle rulers.
      if (key === "r" || key === "R") {
        e.preventDefault();
        toggleRulers();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, zoomTo, fitPage, toggleRulers]);

  return null;
}

// ── zoom controls HUD ──────────────────────────────────────────────────────

/**
 * `CanvasZoomControls` — bottom-left floating pill with:
 *   − button · zoom % display (click to reset to 100%) · + button · Fit · Rulers toggle
 *
 * Pinned to `bottom-[24px] left-[…]` accounting for the navigator rail and
 * inspector dock so it doesn't overlap them.
 */
export function CanvasZoomControls({
  navigatorOpen,
  navigatorWidth,
  inspectorOpen,
}: {
  navigatorOpen: boolean;
  navigatorWidth: number;
  inspectorOpen: boolean;
}) {
  const { zoom, zoomIn, zoomOut, zoomTo, fitPage, showRulers, toggleRulers } =
    useCanvasViewport();

  const leftOffset = resolveCanvasHudLeftInset({
    mode: DEFAULT_WORKSPACE_CANVAS_MODE,
    navigatorOpen,
    navigatorWidth,
  });
  const rightOffset = inspectorOpen ? 12 : 12;

  return (
    <div
      data-edit-overlay="zoom-controls"
      className="pointer-events-auto fixed flex items-center"
      style={{
        bottom: CANVAS_FLOATING_BAR.bottom,
        left: leftOffset,
        zIndex: Z_INDEX.floatingControls,
        gap: 4,
        height: CANVAS_FLOATING_BAR.height,
        padding: "0 8px",
        background: CHROME.surface,
        borderRadius: CHROME_RADII.lg,
        border: `1px solid ${BUILDER_VISUAL.panelBorder}`,
        boxShadow: BUILDER_VISUAL.toolbarShadow,
        transition: "left 220ms cubic-bezier(0.32,0.72,0,1)",
        // Hide the HUD on small screens where the inspector rail is also hidden.
        display: "flex",
      }}
      aria-label="Canvas zoom controls"
    >
      {/* Zoom out */}
      <ZoomBtn title="Zoom out (⌘−)" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ZoomBtn>

      {/* Zoom % display — click to reset to 100% */}
      <button
        type="button"
        title="Click to reset to 100%"
        onClick={() => zoomTo(1)}
        className="inline-flex items-center justify-center border-none transition-colors"
        style={{
          height: CANVAS_FLOATING_BAR.buttonSize,
          minWidth: 52,
          borderRadius: CANVAS_FLOATING_BAR.buttonRadius,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: CHROME.muted,
          background: "transparent",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = ZOOM_BTN_HOVER_BG;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {Math.round(zoom * 100)}%
      </button>

      {/* Zoom in */}
      <ZoomBtn title="Zoom in (⌘+)" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ZoomBtn>

      {/* Divider */}
      <span
        aria-hidden
        style={{ width: 1, alignSelf: "stretch", background: CHROME.line, margin: "6px 2px", flexShrink: 0 }}
      />

      {/* Fit to page */}
      <ZoomBtn title="Fit page (⌘⇧F)" onClick={fitPage}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </ZoomBtn>

      {/* Rulers toggle */}
      <ZoomBtn
        title={showRulers ? "Hide rulers (⌘R)" : "Show rulers (⌘R)"}
        onClick={toggleRulers}
        active={showRulers}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 3h18v5H3zM3 3v18h5V3" />
          <line x1="8" y1="8" x2="8" y2="10" />
          <line x1="12" y1="8" x2="12" y2="10" />
          <line x1="16" y1="8" x2="16" y2="10" />
          <line x1="8" y1="12" x2="10" y2="12" />
          <line x1="8" y1="16" x2="10" y2="16" />
        </svg>
      </ZoomBtn>

      {/* Void right offset so the HUD doesn't slide under the inspector. */}
      <span style={{ width: Math.max(0, rightOffset - 12) > 0 ? 0 : 0 }} />
    </div>
  );
}

function ZoomBtn({
  children,
  title,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center border-none transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        height: CANVAS_FLOATING_BAR.buttonSize,
        width: CANVAS_FLOATING_BAR.buttonSize,
        borderRadius: CANVAS_FLOATING_BAR.buttonRadius,
        background: active ? BUILDER_VISUAL.accentBg : "transparent",
        color: active ? CHROME.accent : CHROME.muted,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = ZOOM_BTN_HOVER_BG;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? BUILDER_VISUAL.accentBg : "transparent";
      }}
    >
      {children}
    </button>
  );
}


// ── rulers + guides + guide snap — extracted to canvas-rulers-guides.tsx ──
// Re-exported here so existing imports of `canvas-viewport` still resolve.
export {
  CanvasRulers,
  CanvasGuides,
  findGuideSnap,
} from "./canvas-rulers-guides";
