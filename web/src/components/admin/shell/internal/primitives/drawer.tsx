"use client";

// ─── DrawerShell + ModalShell + SizeIcon ─────────────────────────────
//
// Extracted from primitives.tsx — Phase 1f decomposition. The byte-
// stable public surface (DrawerShell, ModalShell, SizeIcon, DrawerSize,
// DRAWER_SIZE_PX) is re-exported via the primitives.tsx barrel.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  COLORS,
  FONTS,
  TRANSITION,
  Z,
  useAdminShell,
} from "../state";
import { HelpPanel, hasHelp, hasOpenedHelp, markHelpOpened } from "../help";
import { Icon } from "./icons";
import { lockScroll, unlockScroll } from "./shared";
import { useViewport } from "./hooks";
import { Popover } from "./overlays";

/**
 * Map a DrawerId to a human-readable label for the breadcrumb. Exhaustive
 * lookup is overkill given there are ~150 ids — instead we humanize the
 * id by replacing dashes with spaces and falling back to the id itself.
 */
function drawerIdToLabel(id: string | null): string {
  if (!id) return "previous";
  return id
    .split("-")
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

// ─── DrawerShell ─────────────────────────────────────────────────────
// Resizable + size-mode-aware. Three preset sizes (compact / half / full)
// switchable from header buttons; a draggable left edge lets users fine-tune.

export type DrawerSize = "compact" | "half" | "full";

export const DRAWER_SIZE_PX: Record<DrawerSize, (vw: number) => number> = {
  compact: () => 520,
  half: (vw) => Math.round(vw * 0.5),
  full: (vw) => Math.round(vw * 0.92),
};

export function DrawerShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
  defaultSize = "compact",
  resizable = true,
  toolbar,
  canClose = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  defaultSize?: DrawerSize;
  resizable?: boolean;
  /** Optional extra header content (e.g., status chips) shown next to the title. */
  toolbar?: ReactNode;
  /** When false, Esc shows a "save first" warning instead of closing. */
  canClose?: boolean;
}) {
  const [size, setSize] = useState<DrawerSize>(defaultSize);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  // WS-12.6 — capture the focused element at the moment the drawer opens
  // so we can return focus to it when the drawer closes (WCAG 2.4.3).
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Drawer back-stack: when a previous drawer is below in the chain we
  // render a small "← Back" anchor so users can pop instead of close-and-
  // reopen. Pulled directly from context — no per-drawer wiring needed.
  const proto = useAdminShell();
  const previousDrawer = proto.drawerStack[proto.drawerStack.length - 1];
  // WS-2.1 — drawer size toolbar (compact / half / full) is meaningless
  // on phones because the panel auto-clamps to 96vw regardless. Hide
  // it below 768px to recover header space + reduce noise.
  //
  // `useViewport()` returns "desktop" on the server but the actual
  // viewport on the client. Without the `mounted` gate below, server
  // renders the toolbar (desktop) while client renders the close button
  // (phone) → React reports a hydration mismatch and the surrounding
  // Suspense boundary stays stuck in its hidden SSR shell. Gating on
  // `mounted` defers the viewport-dependent render to a post-hydration
  // effect so SSR and first CSR agree.
  const viewport = useViewport();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const showSizeToolbar = mounted && resizable && viewport !== "phone";

  // ── Help panel state ────────────────────────────────────────────
  // Auto-look up the help entry for the currently-open drawer. The
  // ⓘ button only renders when an entry exists. Resets to closed
  // every time the drawer changes.
  const currentDrawerId = proto.state.drawer.drawerId;
  const helpAvailable = hasHelp(currentDrawerId);
  const helpPanelId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  // Tracks whether the user has ever opened help for this drawer in
  // this session. Drives the small "new" dot on the icon.
  const [helpSeen, setHelpSeen] = useState(() => hasOpenedHelp(currentDrawerId));
  useEffect(() => {
    setHelpOpen(false);
    setHelpSeen(hasOpenedHelp(currentDrawerId));
  }, [currentDrawerId]);
  const toggleHelp = () => {
    const next = !helpOpen;
    setHelpOpen(next);
    if (next && currentDrawerId) {
      markHelpOpened(currentDrawerId);
      setHelpSeen(true);
    }
  };

  // Reset size when drawer reopens (so a fullscreen leftover doesn't bleed in)
  useEffect(() => {
    if (open) {
      setSize(defaultSize);
      setCustomWidth(null);
    }
  }, [open, defaultSize]);

  // WS-12.6 — auto-focus first interactive element when drawer opens (#28),
  // and return focus to the trigger element when it closes (WCAG 2.4.3).
  useEffect(() => {
    if (open) {
      // Capture the element that had focus before the drawer opened.
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      const raf = requestAnimationFrame(() => {
        if (!panelRef.current) return;
        const first = panelRef.current.querySelector<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
        );
        first?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // Drawer just closed — return focus to the trigger.
      const target = returnFocusRef.current;
      if (target && typeof target.focus === "function") {
        requestAnimationFrame(() => target.focus({ preventScroll: true }));
      }
      returnFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (canClose) {
          onClose();
        } else {
          proto.toast("Save your changes first, or click × to discard.");
        }
      }
      // Tab focus trap — keep keyboard focus inside the drawer panel so
      // users don't tab into the surface behind the backdrop.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, onClose, canClose]);

  // "?" key toggles the help panel — separate effect so scroll-lock
  // dependencies stay stable. Skipped when the user is typing in an
  // input/textarea/select.
  useEffect(() => {
    if (!open || !helpAvailable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      // Don't hijack Cmd+? (macOS Help menu), Ctrl+?, Alt+? — those
      // belong to the browser/OS. Plain Shift+? (the natural way to
      // type "?" on US layouts) is the only modifier we accept.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (target?.isContentEditable ?? false);
      if (isTyping) return;
      e.preventDefault();
      toggleHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, helpAvailable, toggleHelp]);

  // Drag-to-dismiss on mobile (#14): a right-swipe ≥ 80px from the left
  // edge closes the drawer. Works alongside the existing desktop resize.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0]!.clientX;
      startY = e.touches[0]!.clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0]!.clientX - startX;
      const dy = Math.abs(e.changedTouches[0]!.clientY - startY);
      if (dx > 80 && dy < 60) onClose();
    };
    const panel = panelRef.current;
    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchend", onTouchEnd);
    };
  }, [open, onClose]);

  // Drag-to-resize from the left edge
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.min(
        Math.max(window.innerWidth - e.clientX, 380),
        Math.round(window.innerWidth * 0.96),
      );
      setCustomWidth(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  // Resolve the actual rendered width
  const resolvedWidth = (() => {
    if (typeof window === "undefined") return width;
    if (customWidth) return customWidth;
    if (size === "compact") return Math.max(width, 380);
    return DRAWER_SIZE_PX[size](window.innerWidth);
  })();

  return (
    <>
      {/* backdrop — kept light so the surface behind stays legible (helps
          orient the user) and so the drawer feels like a layered panel
          rather than a modal takeover. */}
      <div
        onClick={onClose}
        aria-hidden
        data-tulala-drawer-overlay
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.28)",
          zIndex: Z.drawerBackdrop,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .2s ease",
        }}
      />
      {/* panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-tulala-drawer-panel
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100dvh",
          width: resolvedWidth,
          maxWidth: "96vw",
          background: COLORS.surface,
          borderLeft: `1px solid ${COLORS.border}`,
          zIndex: Z.drawerPanel,
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: dragging
            ? "none"
            : "transform .25s cubic-bezier(.4,.0,.2,1), width .2s cubic-bezier(.4,.0,.2,1)",
          boxShadow: open ? "0 30px 60px -20px rgba(11,11,13,0.45)" : "none",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        {/* drag handle on the left edge */}
        {resizable && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            aria-label="Resize drawer"
            role="separator"
            style={{
              position: "absolute",
              top: 0,
              left: -3,
              width: 6,
              height: "100%",
              cursor: "ew-resize",
              zIndex: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(11,11,13,0.06)";
            }}
            onMouseLeave={(e) => {
              if (!dragging) e.currentTarget.style.background = "transparent";
            }}
          />
        )}
        <header
          data-tulala-drawer-header
          style={{
            padding: "16px 22px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div className="flex-1 min-w-0">
            {/* Mobile-only "back" link — sits ABOVE the title so it doesn't
                eat horizontal space. Tiny arrow + muted "Back" label;
                whole drawer is the destination, no need for a big pill. */}
            <button
              type="button"
              onClick={onClose}
              data-tulala-drawer-mobile-back
              aria-label="Close drawer and return to page"
              style={{
                display: "none", // mobile CSS reveals it
                alignItems: "center",
                gap: 3,
                background: "transparent",
                border: "none",
                padding: "0 0 6px",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: 500,
                color: COLORS.inkMuted,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            {previousDrawer && (
              <button
                type="button"
                onClick={proto.popDrawer}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: COLORS.inkMuted,
                  marginBottom: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
              >
                <span aria-hidden className="text-xs">←</span>
                Back to {drawerIdToLabel(previousDrawer.drawerId)}
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, letterSpacing: -0.3, margin: 0, lineHeight: 1.2 }} className="text-admin-ink">
                {title}
              </h2>
              {toolbar}
            </div>
            {description && (
              <p style={{ fontFamily: FONTS.body, fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 }} className="text-admin-ink-muted">
                {description}
              </p>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {/* Auto-rendered "Copy link" button — drawer state is already
                in the URL via AdminShellProvider, so this turns every drawer
                into a shareable link with one click. */}
            <Popover content="Copy link to this drawer">
              <button
                type="button"
                aria-label="Copy link to this drawer"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  navigator.clipboard?.writeText(window.location.href);
                  proto.toast("Link copied — anyone with access lands here.");
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: `1px solid ${COLORS.borderSoft}`,
                  background: "#fff",
                  color: COLORS.inkMuted,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  marginRight: 4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.color = COLORS.ink;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.borderSoft;
                  e.currentTarget.style.color = COLORS.inkMuted;
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3.5-3.5a5 5 0 0 0-7.07-7.07l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7.07 0l-3.5 3.5a5 5 0 0 0 7.07 7.07l1-1" />
                </svg>
              </button>
            </Popover>
            {/* Auto-rendered "What is this?" button — only shows when an
                entry exists in the help registry. Pulls drawer id from
                proto state so individual drawer components don't have
                to wire anything. Press "?" to toggle without clicking. */}
            {helpAvailable && (
              <>
                {/* Keyframe for the "unread help" indicator — emitted
                    once per drawer-open here (vs. once per dot render
                    if it lived inside the dot span). The reduced-
                    motion override stops the animation entirely for
                    users who request it; the dot stays visible (just
                    static) so the affordance isn't lost.

                    Also defines the keyboard focus-visible ring on the
                    help button. Inline-style props can't express
                    :focus-visible, so we co-locate the rule here. */}
                <style>{`@keyframes tulalaHelpDotPulse { 0%, 100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } } @media (prefers-reduced-motion: reduce) { [data-tulala-help-dot] { animation: none !important; } } [data-tulala-help-btn]:focus-visible { outline: 2px solid ${COLORS.brand}; outline-offset: 2px; }`}</style>
              <Popover content={helpOpen ? "Hide help · ?" : "About this view · ?"}>
                <button
                  type="button"
                  data-tulala-help-btn
                  aria-label={title ? `About: ${title}` : "About this view"}
                  aria-controls={helpPanelId}
                  aria-expanded={helpOpen}
                  onClick={toggleHelp}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: `1px solid ${helpOpen ? COLORS.border : COLORS.borderSoft}`,
                    background: helpOpen ? COLORS.accentSoft : "#fff",
                    color: helpOpen ? COLORS.accent : COLORS.inkMuted,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    marginRight: 4,
                    position: "relative",
                    transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!helpOpen) {
                      e.currentTarget.style.borderColor = COLORS.border;
                      e.currentTarget.style.color = COLORS.ink;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!helpOpen) {
                      e.currentTarget.style.borderColor = COLORS.borderSoft;
                      e.currentTarget.style.color = COLORS.inkMuted;
                    }
                  }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                  {/* "Never opened in this session" indicator. Hides
                      the moment the user clicks (markHelpOpened).
                      Pulse runs 5 cycles (~9s) then settles into a
                      steady dot — infinite pulse drains battery and
                      trains people to tune it out. */}
                  {!helpSeen && (
                    <span
                      aria-hidden
                      data-tulala-help-dot
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        // Indigo = informational/system signal per the
                        // semantic color memo. Coral is reserved for
                        // "your move" actions and would dilute that
                        // signal if we used it for "unread help".
                        background: COLORS.indigo,
                        boxShadow: "0 0 0 2px #fff",
                        animation: "tulalaHelpDotPulse 1.8s ease-in-out 5",
                        animationFillMode: "both",
                        transformOrigin: "center",
                      }}
                    />
                  )}
                </button>
              </Popover>
              </>
            )}
            {showSizeToolbar && (
              <div
                data-tulala-drawer-size-toolbar
                style={{
                  display: "inline-flex",
                  background: "rgba(11,11,13,0.04)",
                  borderRadius: 8,
                  padding: 2,
                  marginRight: 6,
                }}
              >
                {(["compact", "half", "full"] as DrawerSize[]).map((s) => {
                  const active = (customWidth === null && size === s);
                  const tip =
                    s === "compact"
                      ? "Side drawer"
                      : s === "half"
                        ? "Half-page"
                        : "Full-page";
                  return (
                    <Popover key={s} content={tip}>
                      <button
                        onClick={() => {
                          setCustomWidth(null);
                          setSize(s);
                        }}
                        aria-label={`${s} size`}
                        style={{
                          background: active ? "#fff" : "transparent",
                          boxShadow: active
                            ? "0 1px 3px rgba(11,11,13,0.10)"
                            : "none",
                          border: "none",
                          padding: "5px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          color: active ? COLORS.ink : COLORS.inkMuted,
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        <SizeIcon variant={s} />
                      </button>
                    </Popover>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: COLORS.inkMuted,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.borderSoft;
                e.currentTarget.style.color = COLORS.inkMuted;
              }}
            >
              <Icon name="x" size={14} stroke={1.8} />
            </button>
          </div>
        </header>
        {/* Slide-down help panel — only renders when an entry exists in
            the registry (helpAvailable gates the toolbar button). Lives
            outside the scrollable body so it doesn't push the form off-
            screen but stays attached to the header. */}
        <HelpPanel
          drawerId={currentDrawerId}
          open={helpOpen}
          panelId={helpPanelId}
          onJumpTo={(id) => {
            setHelpOpen(false);
            proto.openDrawer(id);
          }}
        />
        <div
          data-tulala-drawer-body
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px 24px",
          }}
        >
          {children}
        </div>
        {footer && (
          <footer
            data-tulala-drawer-footer
            style={{
              padding: "14px 22px",
              paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}

export function SizeIcon({ variant }: { variant: DrawerSize }) {
  // Each variant fills a different proportion of the right side of the
  // viewport rectangle — readable at a glance even at 14px. The empty
  // rectangle is the page; the filled portion is where the drawer lands.
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
  } as const;
  if (variant === "compact") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <rect x="11" y="3.5" width="2.5" height="9" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (variant === "half") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <rect x="8" y="3.5" width="5.5" height="9" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // full
  return (
    <svg {...common}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <rect x="3.5" y="4" width="9" height="8" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── ModalShell ──────────────────────────────────────────────────────

export function ModalShell({
  open,
  onClose,
  children,
  width = 540,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      data-tulala-modal-overlay
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.36)",
        zIndex: Z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width,
          maxWidth: "96vw",
          maxHeight: "92dvh",
          background: COLORS.card,
          borderRadius: 16,
          boxShadow: "0 30px 80px -20px rgba(11,11,13,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

