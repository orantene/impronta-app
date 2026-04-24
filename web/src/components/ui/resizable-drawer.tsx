"use client";

/**
 * ResizableDrawer — right-side drawer with a three-step expand cycle and a
 * left-edge drag handle for free-resize.
 *
 * Built for canvas-adjacent panels like the edit-mode Publish drawer where
 * the operator wants a compact view most of the time but occasionally needs
 * the whole viewport (publish history, diff, large diagnostics). The size
 * model mirrors what platform-grade editors ship:
 *
 *   Normal (400 px) ⇄ Expanded (720 px) ⇄ Fullscreen (viewport)
 *
 * Cycle forward via the Expand button; dragging the left edge escapes the
 * preset and sets an explicit custom width. The next Expand click re-enters
 * the preset cycle. Escape and backdrop-click close unless the caller sets
 * `preventClose` (useful while a publish round-trip is in flight).
 *
 * The drawer renders its own backdrop and is positioned below a fixed top
 * bar via `topOffset` (defaults to 52 px — the edit-mode topbar height).
 * Children slot into a flex column; callers supply `header`, `body`, and
 * `footer` (optional). The expand / fullscreen / close controls live in a
 * platform-managed row at the very top-right so the caller's header copy
 * stays clean.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SizeMode = "normal" | "expanded" | "fullscreen";

const PRESET_WIDTH: Record<Exclude<SizeMode, "fullscreen">, number> = {
  normal: 400,
  expanded: 720,
};

const MIN_WIDTH = 320;
const MAX_WIDTH_SAFETY = 2400;

interface ResizableDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Title text rendered in the header slot caller. */
  header?: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  /** Topbar height the drawer should start below. Defaults to 52 (edit mode). */
  topOffset?: number;
  /** Disables close-on-backdrop + escape + close button. */
  preventClose?: boolean;
  /** Starting size mode. Defaults to "normal". */
  defaultSize?: SizeMode;
  /** Aria label for the drawer region. */
  ariaLabel?: string;
  /** data-edit-overlay value for the main aside — helps the selection
   *  layer skip pointer math that would otherwise fight the drawer. */
  overlayKey?: string;
}

export function ResizableDrawer({
  open,
  onClose,
  header,
  body,
  footer,
  topOffset = 52,
  preventClose = false,
  defaultSize = "normal",
  ariaLabel = "Drawer",
  overlayKey = "resizable-drawer",
}: ResizableDrawerProps) {
  const [size, setSize] = useState<SizeMode>(defaultSize);
  // Free-resize width. `null` → use preset. Set by drag; cleared by any
  // preset click so operators can always snap back to a canonical width.
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  // Dragging flag pins the cursor + disables transitions for a tight feel.
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  // Reset preset each time the drawer opens so a second open starts clean.
  // Custom widths deliberately *don't* persist across opens — the preset
  // cycle is the "home" state, and drag is an in-session escape hatch.
  useEffect(() => {
    if (open) {
      setSize(defaultSize);
      setCustomWidth(null);
    }
  }, [open, defaultSize]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !preventClose) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, preventClose]);

  // Drag-to-resize. Pointer events track outside the handle so the cursor
  // doesn't hiccup at the edge; rAF isn't needed because React batches
  // setState and the only reflow is the drawer's own width.
  const onHandleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (size === "fullscreen") return;
      const currentWidth =
        customWidth ??
        PRESET_WIDTH[size as Exclude<SizeMode, "fullscreen">];
      dragStateRef.current = {
        startX: e.clientX,
        startWidth: currentWidth,
      };
      setDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [size, customWidth],
  );

  const onHandleMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st) return;
    // Dragging the LEFT edge: rightward pointer move → narrower drawer.
    const delta = st.startX - e.clientX;
    const next = Math.max(
      MIN_WIDTH,
      Math.min(
        MAX_WIDTH_SAFETY,
        Math.min(window.innerWidth - 80, st.startWidth + delta),
      ),
    );
    setCustomWidth(next);
  }, []);

  const onHandleUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = null;
    setDragging(false);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Already released — no-op.
    }
  }, []);

  const cycleSize = useCallback(() => {
    setCustomWidth(null);
    setSize((s) => (s === "normal" ? "expanded" : s === "expanded" ? "fullscreen" : "normal"));
  }, []);

  const toggleFullscreen = useCallback(() => {
    setCustomWidth(null);
    setSize((s) => (s === "fullscreen" ? "normal" : "fullscreen"));
  }, []);

  if (!open) return null;

  const widthStyle: React.CSSProperties = (() => {
    if (size === "fullscreen") return { width: "100vw" };
    if (customWidth !== null) return { width: `${customWidth}px` };
    return { width: `${PRESET_WIDTH[size as Exclude<SizeMode, "fullscreen">]}px` };
  })();

  const expandLabel =
    size === "normal" ? "Expand" : size === "expanded" ? "Fullscreen" : "Collapse";
  const expandTitle =
    size === "normal"
      ? "Expand to 720px"
      : size === "expanded"
        ? "Go fullscreen"
        : "Back to 400px";

  return (
    <div
      data-edit-overlay={`${overlayKey}-backdrop`}
      className="fixed inset-0 z-[115] bg-black/20 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !preventClose) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-label={ariaLabel}
        data-edit-overlay={overlayKey}
        className={`fixed right-0 z-[116] flex flex-col border-l border-black/10 bg-white shadow-2xl ${
          dragging ? "" : "transition-[width] duration-200"
        }`}
        style={{
          top: `${topOffset}px`,
          height: `calc(100vh - ${topOffset}px)`,
          ...widthStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left-edge resize handle. 6 px visible, 14 px hit target via negative
            margin on the ::before wedge. Dragging flips cursor to col-resize
            across the window via pointer capture. */}
        {size !== "fullscreen" ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize drawer"
            tabIndex={-1}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className={`absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize select-none transition-colors ${
              dragging
                ? "bg-zinc-900/20"
                : "bg-transparent hover:bg-zinc-900/10"
            }`}
          />
        ) : null}

        {/* Platform-managed control row. Stays pinned at the top-right so
            the caller's own header (title / subtitle / context chips) lives
            independently and doesn't need to budget for these buttons. */}
        <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white/80 p-0.5 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={cycleSize}
            title={expandTitle}
            aria-label={expandLabel}
            className="inline-flex size-7 items-center justify-center rounded text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            {size === "fullscreen" ? (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 4H4v5" />
                <path d="M15 20h5v-5" />
                <path d="M4 9l6 6" />
                <path d="M20 15l-6-6" />
              </svg>
            ) : (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 3h6v6" />
                <path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" />
                <path d="M3 21l7-7" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={
              size === "fullscreen" ? "Exit fullscreen" : "Fullscreen"
            }
            aria-label={size === "fullscreen" ? "Exit fullscreen" : "Fullscreen"}
            className="inline-flex size-7 items-center justify-center rounded text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {size === "fullscreen" ? (
                <>
                  <path d="M9 3v6H3" />
                  <path d="M21 9h-6V3" />
                  <path d="M15 21v-6h6" />
                  <path d="M3 15h6v6" />
                </>
              ) : (
                <>
                  <path d="M3 9V3h6" />
                  <path d="M21 9V3h-6" />
                  <path d="M15 21h6v-6" />
                  <path d="M9 21H3v-6" />
                </>
              )}
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={preventClose}
            title="Close"
            aria-label="Close"
            className="inline-flex size-7 items-center justify-center rounded text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {header ? (
          <header className="shrink-0 border-b border-zinc-100 px-5 py-4 pr-28">
            {header}
          </header>
        ) : null}

        <div className="flex-1 overflow-y-auto">{body}</div>

        {footer ? (
          <footer className="shrink-0 border-t border-zinc-100 px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
