"use client";

// ─── Overlay primitives ──────────────────────────────────────────────
//
// Popover / OfflineBanner / ConfirmModal / ShortcutsModal / ModalPopover.
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDashboardText } from "../dashboard-i18n";
import { COLORS, FONTS, RADIUS } from "../state";

// ─── Popover ─────────────────────────────────────────────────────────
/**
 * Hover/focus-triggered popover with a 200ms open delay (vs. the 700ms
 * browser-native title=). Used for richer tooltips on chips, badges,
 * status icons, drawer toolbar buttons, anywhere we previously relied on
 * `title=` for explanations.
 *
 * Pattern: wrap a single trigger child. Children render normally; a
 * floating panel appears above (or below if no room) on hover/focus.
 *
 * Keyboard: focus opens, blur closes, Escape closes.
 */
export function Popover({
  children,
  content,
  placement = "top",
  delayMs = 200,
}: {
  children: ReactNode;
  content: ReactNode;
  placement?: "top" | "bottom";
  delayMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const measureAndOpen = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 9999;
    const rawX = rect.left + rect.width / 2;
    const clampedX = Math.max(148, Math.min(vw - 148, rawX));
    setCoords({
      x: clampedX,
      y: placement === "top" ? rect.top : rect.bottom,
    });
    setOpen(true);
  };
  const scheduleOpen = () => {
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      measureAndOpen();
      timerRef.current = null;
    }, delayMs);
  };
  const cancelAndClose = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  };
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      ref={triggerRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={scheduleOpen}
      onMouseLeave={cancelAndClose}
      onFocus={scheduleOpen}
      onBlur={cancelAndClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancelAndClose();
      }}
    >
      {children}
      {/* Render the tooltip in `position: fixed` from the document root so
          it escapes any `overflow: hidden` ancestor (drawer body,
          horizontal-scroll containers, etc). Without this it gets
          clipped on plan-compare's mobile horizontal scroller. */}
      {open && coords && (
        <span
          role="tooltip"
          style={{
            position: "fixed",
            zIndex: 1000,
            left: coords.x,
            top: coords.y,
            transform:
              placement === "top"
                ? "translate(-50%, calc(-100% - 8px))"
                : "translate(-50%, 8px)",
            background: COLORS.fill,
            color: "#fff",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
            lineHeight: 1.4,
            padding: "6px 10px",
            borderRadius: 7,
            whiteSpace: "normal",
            maxWidth: 280,
            boxShadow: "0 6px 18px rgba(11,11,13,0.18)",
            pointerEvents: "none",
          }}
        >
          {content}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              [placement === "top" ? "bottom" : "top"]: -3,
              width: 8,
              height: 8,
              background: COLORS.fill,
            }}
          />
        </span>
      )}
    </span>
  );
}


// ─── OfflineBanner (#23) ─────────────────────────────────────────────
// Detects browser offline/online events and shows a sticky banner.

export function OfflineBanner() {
  const copy = useDashboardText();
  // Always start `false` so the server-rendered HTML and the client's first
  // paint agree. We sync the real `navigator.onLine` state in the effect
  // below — matters because on the client this component mounts BEFORE
  // hydration commits, and reading navigator at construction time produced
  // SSR/CSR mismatches whenever the browser was momentarily offline.
  const [offline, setOffline] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // Sync to current state on mount (covers the "loaded while offline" case).
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOffline(true);
    }
    const go = () => { setOffline(false); setRetrying(false); };
    const gone = () => setOffline(true);
    window.addEventListener("online", go);
    window.addEventListener("offline", gone);
    return () => { window.removeEventListener("online", go); window.removeEventListener("offline", gone); };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        background: COLORS.fill,
        color: "#fff",
        fontFamily: FONTS.body,
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "9px 16px",
        zIndex: 9999,
        animation: "tulala-page-fade .2s ease",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
      {copy.t("Connection lost · retrying…")}
      <button
        type="button"
        onClick={() => { setRetrying(true); setTimeout(() => setRetrying(false), 1500); }}
        style={{
          marginLeft: 4,
          background: "rgba(255,255,255,0.14)",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          fontFamily: FONTS.body,
          fontSize: 12,
          fontWeight: 600,
          padding: "3px 10px",
          cursor: "pointer",
        }}
      >
        {retrying ? copy.t("Retrying…") : copy.t("Retry now")}
      </button>
    </div>
  );
}


// ─── ConfirmModal (#8) ────────────────────────────────────────────────
// Lightweight "Are you sure?" overlay for destructive actions.

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      data-tulala-modal-overlay
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.40)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "24px 24px 20px",
          maxWidth: 360,
          width: "100%",
          fontFamily: FONTS.body,
          boxShadow: "0 24px 60px rgba(11,11,13,0.28)",
          animation: "tulala-page-fade .18s ease",
        }}
      >
        <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, margin: "0 0 8px" }} className="text-admin-ink">
          {title}
        </h2>
        <p style={{ fontSize: 14, margin: "0 0 20px", lineHeight: 1.5 }} className="text-admin-ink-muted">
          {message}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.ink,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              background: COLORS.red,
              border: "none",
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── ShortcutsModal (#18) ────────────────────────────────────────────
// ⌘? keyboard cheatsheet. Triggered by pressing ? anywhere in the app.

// Every entry here must be a WORKING shortcut — this panel previously
// advertised ⌘N / ⌘F / ⌘/ / E / R with no handlers behind them, and
// "G R" for a binding that is actually G T (workspace.tsx keyboard
// layer). Re-add an entry only together with its implementation.
const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["C"], label: "New inquiry (compose)" },
  { keys: ["G", "O"], label: "Go to Overview" },
  { keys: ["G", "I"], label: "Go to Messages" },
  { keys: ["G", "C"], label: "Go to Calendar" },
  { keys: ["G", "T"], label: "Go to Roster" },
  { keys: ["J"], label: "Focus next thread (Messages)" },
  { keys: ["K"], label: "Focus previous thread (Messages)" },
  { keys: ["⏎"], label: "Open focused thread" },
  { keys: ["E"], label: "Archive focused thread (Messages)" },
  { keys: ["R"], label: "Reply: focus the composer (Messages)" },
  { keys: ["Esc"], label: "Close drawer / modal" },
  { keys: ["?"], label: "This shortcuts panel" },
];

export function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const copy = useDashboardText();
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      data-tulala-modal-overlay
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.36)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.t("Keyboard shortcuts")}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "22px 24px 20px",
          maxWidth: 440,
          width: "100%",
          fontFamily: FONTS.body,
          boxShadow: "0 24px 60px rgba(11,11,13,0.28)",
          animation: "tulala-page-fade .18s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 500, margin: 0 }} className="text-admin-ink">
            {copy.t("Keyboard shortcuts")}
          </h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: COLORS.inkMuted }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="grid gap-0.5">
          {SHORTCUTS.map(({ keys, label }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                borderRadius: 8,
              }}
            >
              <span className="text-admin-ink text-admin-13">{copy.t(label)}</span>
              <span className="inline-flex gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 26,
                      height: 22,
                      padding: "0 6px",
                      background: COLORS.surfaceAlt,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 5,
                      fontFamily: FONTS.body,
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.ink,
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─── WS-4 ModalPopover primitive ────────────────────────────────────────────
//
// A lighter-weight overlay than a full drawer. Renders as a centered (or
// anchor-relative) floating panel with a dim backdrop. Use for:
//   – Quick-confirm / short-form interactions that don't warrant a drawer
//   – Pickers, context-menus, and inline detail views
//   – ~30 draw reclassifications in WS-4 (demotions from full drawers)
//
// API:
//   <ModalPopover
//     open={bool}
//     onClose={fn}
//     title="Optional header"
//     size="sm" | "md" | "lg"          // default "md"
//     closeOnBackdrop={bool}           // default true
//     anchorRect={DOMRect}             // optional — position near anchor
//     footer={<ReactNode>}             // optional — sticky bottom area
//   >
//     ...body...
//   </ModalPopover>
//
// Keyboard: Esc closes. Focus trap: first focusable element on open.
// ─────────────────────────────────────────────────────────────────────────────

export type ModalPopoverSize = "sm" | "md" | "lg";

const POPOVER_WIDTH: Record<ModalPopoverSize, number> = {
  sm: 320,
  md: 480,
  lg: 640,
};

/** Calculated position for an anchored popover. */
function resolveAnchorPosition(
  anchor: DOMRect,
  popoverWidth: number,
  popoverMaxHeight: number,
): CSSProperties {
  const vw = typeof window !== "undefined" ? window.innerWidth  : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const gap = 8; // px gap between anchor and popover

  // Prefer below; if not enough room, go above
  const spaceBelow = vh - anchor.bottom - gap;
  const spaceAbove = anchor.top - gap;
  const goBelow    = spaceBelow >= Math.min(popoverMaxHeight, 240) || spaceBelow >= spaceAbove;

  // Align left edge with anchor; clamp to viewport
  let left = anchor.left;
  if (left + popoverWidth > vw - 8) left = vw - popoverWidth - 8;
  if (left < 8) left = 8;

  return goBelow
    ? { top: anchor.bottom + gap, left }
    : { bottom: vh - anchor.top + gap, left };
}

export function ModalPopover({
  open,
  onClose,
  title,
  size = "md",
  closeOnBackdrop = true,
  anchorRect,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalPopoverSize;
  closeOnBackdrop?: boolean;
  anchorRect?: DOMRect | null;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const width    = POPOVER_WIDTH[size];

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus first focusable child on open
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    el?.focus();
  }, [open]);

  if (!open) return null;

  const isAnchored = !!anchorRect;
  const anchorStyles: CSSProperties = isAnchored
    ? resolveAnchorPosition(anchorRect!, width, 480)
    : {};

  // Overlay style — dim full viewport when not anchored
  const overlayStyle: CSSProperties = {
    position:        "fixed",
    inset:           0,
    zIndex:          1100,
    display:         "flex",
    alignItems:      isAnchored ? "flex-start" : "center",
    justifyContent:  isAnchored ? "flex-start" : "center",
    background:      isAnchored ? "transparent" : "rgba(0,0,0,0.35)",
    padding:         isAnchored ? 0 : "24px 16px",
  };

  const panelStyle: CSSProperties = {
    position:        isAnchored ? "fixed" : "relative",
    width,
    maxWidth:        "calc(100vw - 32px)",
    maxHeight:       isAnchored ? 480 : "calc(100vh - 48px)",
    background:      COLORS.surface,
    borderRadius:    RADIUS.xl,
    boxShadow:       "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.10)",
    border:          `1px solid ${COLORS.border}`,
    display:         "flex",
    flexDirection:   "column",
    overflow:        "hidden",
    ...anchorStyles,
  };

  return (
    // Backdrop
    <div
      style={overlayStyle}
      data-tulala-modal-popover="overlay"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Popover"}
        data-tulala-modal-popover="panel"
        style={panelStyle}
      >
        {/* Header */}
        {title && (
          <div
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "14px 16px 12px",
              borderBottom:   `1px solid ${COLORS.border}`,
              flexShrink:     0,
            }}
          >
            <span className="text-admin-ink text-sm font-semibold">
              {title}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none",
                border:     "none",
                cursor:     "pointer",
                padding:    "2px 4px",
                color:      COLORS.inkMuted,
                fontSize:   18,
                lineHeight: 1,
                borderRadius: RADIUS.sm,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div
          data-tulala-modal-popover-body
          style={{
            flex:       "1 1 auto",
            overflowY:  "auto",
            padding:    "16px",
          }}
        >
          {children}
        </div>

        {/* Optional footer */}
        {footer && (
          <div
            style={{
              flexShrink:  0,
              padding:     "12px 16px",
              borderTop:   `1px solid ${COLORS.border}`,
              display:     "flex",
              gap:         8,
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

