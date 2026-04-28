"use client";

/**
 * Admin Shell — Clickable High-Fidelity Prototype
 *
 * This is a fake-but-real SaaS experience for the Tulala/Impronta admin
 * surface. It is NOT wired to any backend — every drawer, click, and
 * state change runs in local React Context (`ProtoProvider`).
 *
 * Architecture (5-file split):
 *   page.tsx         — entry point (this file). Mounts the provider tree.
 *   _state.tsx       — types, mock data, ProtoProvider, useProto, tokens
 *   _primitives.tsx  — Icon library, atoms, cards, drawer/modal shells, ToastHost
 *   _pages.tsx       — ControlBar, WorkspaceTopbar, all surface/page renderers
 *   _drawers.tsx     — DrawerRoot dispatcher, every drawer body, UpgradeModal
 *
 * Four prototype dimensions (set via the dark ControlBar at the top):
 *   Surface           — workspace · talent · client · platform
 *   Plan              — free · studio · agency · network
 *   Role              — viewer → editor → coordinator → admin → owner
 *   TalentRelationship — alsoTalent on/off (am I a talent on this roster?)
 *
 * State is bidirectionally synced with the URL query string via
 * `replaceState`, so a refresh keeps your scene and you can paste a link
 * to a teammate.
 *
 * Dev-handoff documentation lives at `web/docs/admin-redesign/dev-handoff.md`.
 */

import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import { ProtoProvider, useProto, COLORS, FONTS } from "./_state";
import { ToastHost, BackToTop, OfflineBanner, ShortcutsModal } from "./_primitives";
import { ControlBar, MobileBottomNav, SurfaceRouter } from "./_pages";
import { DrawerRoot, UpgradeModal } from "./_drawers";
import { CommandPalette } from "./_palette";
import { MOCK_CONVERSATIONS } from "./_talent";

// ─── Toast bridge (reads from context, passes to dumb host) ──────────

function ToastBridge() {
  const { state, dismissToast } = useProto();
  return <ToastHost toasts={state.toasts} onDismiss={dismissToast} />;
}

/**
 * Browser tab title reflects total unread count. e.g. "(3) Tulala" so
 * the talent sees at a glance from another tab that something needs
 * them. Reads talent-surface MOCK_CONVERSATIONS for the count.
 */
function TabTitleBridge() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const unread = MOCK_CONVERSATIONS.reduce((s, c) => s + (c.unreadCount || 0), 0);
    const base = "Tulala";
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, []);
  return null;
}

/**
 * Audit item #6 — hide the dev-only PROTOTYPE control bar (Surface /
 * Plan / Role pickers) unless `?dev=1` is on the URL. Demos look like
 * the real product by default; engineers add `?dev=1` to switch
 * dimensions during testing.
 *
 * The visibility flag is also written to a CSS variable so sticky
 * descendants (IdentityBar, mode-shell topbars/sidebars) can adjust
 * their `top` offset without prop-drilling. See `--proto-cbar` below.
 */
function useDevControlBar() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(new URLSearchParams(window.location.search).get("dev") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  return show;
}

function DevOnlyControlBar({ show }: { show: boolean }) {
  if (!show) return null;
  return <ControlBar />;
}


// ─── Error boundary (#26) ─────────────────────────────────────────────
// Catches render-time exceptions and shows a friendly fallback page.

class ErrorBoundary extends Component<
  { children: ReactNode },
  { caught: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { caught: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { caught: err };
  }
  render() {
    if (this.state.caught) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: 16,
            fontFamily: "system-ui, sans-serif",
            padding: 32,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Something broke</h1>
          <p style={{ fontSize: 14, color: "rgba(11,11,13,0.6)", margin: 0 }}>
            {this.state.caught.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: "10px 22px",
              background: "#0F4F3E",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Page entry ──────────────────────────────────────────────────────

export default function AdminShellPrototypePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <ProtoProvider>
          <PrototypeRoot />
        </ProtoProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

function PrototypeRoot() {
  const defaultShow = useDevControlBar();
  const [showDevBar, setShowDevBar] = useState(defaultShow);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Sync once the URL-param check resolves (runs after mount)
  useEffect(() => { setShowDevBar(defaultShow); }, [defaultShow]);

  // ⌘? / ? opens the keyboard shortcuts modal (#18)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target?.matches("input, textarea, select, [contenteditable]");
      if (e.key === "?" && !inInput) setShortcutsOpen(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <ProtoProviderInnerOriginal showDevBar={showDevBar} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {/* Floating toggle — always visible so users can reveal/hide the
          prototype control bar without touching the URL. */}
      <button
        type="button"
        title={showDevBar ? "Hide prototype controls" : "Show prototype controls"}
        onClick={() => setShowDevBar((v) => !v)}
        style={{
          position: "fixed",
          bottom: 18,
          left: 18,
          zIndex: 9999,
          width: 36,
          height: 36,
          borderRadius: 10,
          background: showDevBar ? "#1a1a1f" : "rgba(11,11,13,0.85)",
          border: "1.5px solid rgba(255,255,255,0.14)",
          color: "#fff",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(8px)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.28)",
          transition: "background .15s, transform .1s",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: -0.3,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        ⚙
      </button>
    </>
  );
}

function ProtoProviderInnerOriginal({ showDevBar }: { showDevBar: boolean }) {
  return (
    <>
        {/* Global keyboard-focus styling for the prototype. Scoped via
            `.tulala-shell` so we don't leak into other prototypes. Uses
            :focus-visible so mouse clicks don't trigger the ring. */}
        <style>{`
          .tulala-shell button:focus-visible,
          .tulala-shell a:focus-visible,
          .tulala-shell [role="button"]:focus-visible,
          .tulala-shell input:focus-visible,
          .tulala-shell textarea:focus-visible,
          .tulala-shell select:focus-visible {
            outline: 2px solid ${COLORS.accent};
            outline-offset: 2px;
          }
          .tulala-shell button:focus:not(:focus-visible) {
            outline: none;
          }
          /* Audit #4 — acting-as chevron rotates 180° on chip hover. */
          .tulala-shell .tulala-acting-chip:hover .tulala-acting-chevron {
            transform: rotate(180deg);
          }
          /* Skip-to-main: invisible until focused. Lets keyboard users
             jump past the dark prototype ControlBar and into the surface. */
          .tulala-shell .skip-to-main {
            position: absolute;
            left: -9999px;
            top: auto;
            width: 1px;
            height: 1px;
            overflow: hidden;
            z-index: 100;
          }
          .tulala-shell .skip-to-main:focus-visible {
            position: fixed;
            left: 12px;
            top: 12px;
            width: auto;
            height: auto;
            background: ${COLORS.ink};
            color: #fff;
            padding: 8px 14px;
            border-radius: 8px;
            font-family: ${FONTS.body};
            font-size: 13px;
            font-weight: 600;
            text-decoration: none;
            outline: 2px solid ${COLORS.accent};
            outline-offset: 2px;
          }
          /* Respect users who've asked the OS to dial down motion.
             Drawer slides, toast slide-in, and every transition collapses
             to ~instant. Functional state still updates; only the animation
             vanishes. */
          @media (prefers-reduced-motion: reduce) {
            .tulala-shell *,
            .tulala-shell *::before,
            .tulala-shell *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
              scroll-behavior: auto !important;
            }
          }
          /* ──────────────────────────────────────────────────────────────
             Mobile / tablet responsive layer. The prototype is built with
             inline desktop styles; these rules override at narrow widths
             via [data-tulala-*] attributes attached to the relevant nodes.
             Every override uses !important because inline styles win
             otherwise.

             Breakpoints:
               ≤ 1024px — tablet (some grid collapse)
               ≤ 720px  — small tablet / large phone
               ≤ 540px  — phone

             Goal: every surface reads cleanly without horizontal scroll
             on a 360–414px viewport.
             ────────────────────────────────────────────────────────────── */

          /* Tablet: 4-col hero strips drop to 2-col; 3-col panels stay 3 */
          @media (max-width: 1024px) {
            .tulala-shell [data-tulala-grid="4"] {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
          }

          /* Small tablet / large phone: one main column; tighter padding;
             topbars wrap into two rows; ControlBar shrinks. */
          @media (max-width: 720px) {
            .tulala-shell {
              overflow-x: hidden;
            }
            /* Surface main padding compresses */
            .tulala-shell [data-tulala-surface-main] {
              padding: 18px 14px 48px !important;
            }
            /* All grid variants collapse to single column */
            .tulala-shell [data-tulala-grid="2"],
            .tulala-shell [data-tulala-grid="3"],
            .tulala-shell [data-tulala-grid="4"],
            .tulala-shell [data-tulala-grid="auto"] {
              grid-template-columns: 1fr !important;
              gap: 10px !important;
            }
            /* PageHeader: actions wrap to a row below the title */
            .tulala-shell [data-tulala-page-header] {
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 12px !important;
              margin-bottom: 18px !important;
            }
            .tulala-shell [data-tulala-page-header-actions] {
              justify-content: flex-start !important;
              flex-wrap: wrap !important;
            }
            /* Buttons inside the actions slot get natural-width content so
               labels never wrap mid-word. */
            .tulala-shell [data-tulala-page-header-actions] > * {
              flex-shrink: 0 !important;
            }
            /* H1 scales down */
            .tulala-shell [data-tulala-h1] {
              font-size: 24px !important;
              letter-spacing: -0.4px !important;
            }
            /* App topbars: tenant chip on top row, page nav on second row */
            .tulala-shell [data-tulala-app-topbar] {
              padding: 0 14px !important;
            }
            .tulala-shell [data-tulala-app-topbar-row] {
              flex-wrap: wrap !important;
              row-gap: 0 !important;
              gap: 10px !important;
              height: auto !important;
              padding: 8px 0 !important;
            }
            .tulala-shell [data-tulala-topbar-divider] {
              display: none !important;
            }
            /* Hide the in-topbar page nav on mobile — the bottom tab bar
               replaces it (better thumb reach + native pattern). */
            .tulala-shell [data-tulala-app-topbar-nav] {
              display: none !important;
            }
            /* Workspace sidebar shell — collapse 232px+1fr grid to single
               column on mobile and hide the left rail. The bottom tab
               bar replaces nav, same as topbar shell. */
            .tulala-shell [data-tulala-workspace-grid] {
              grid-template-columns: 1fr !important;
            }
            .tulala-shell [data-tulala-app-sidebar] {
              display: none !important;
            }
            /* Workspace topbar — also drop nav-style chips inside. */
            .tulala-shell [data-tulala-workspace-topbar] [data-tulala-app-topbar-nav] {
              display: none !important;
            }
          }
          /* Page-transition fade-up — used by both talent + workspace
             routers. Lives at root scope so the keyframe is available
             everywhere inside .tulala-shell. */
          @keyframes tulala-page-fade {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-tulala-talent-page-anim],
            [data-tulala-workspace-page-anim] {
              animation: none !important;
            }
          }
          @media (max-width: 720px) {
            /* placeholder so the brace count remains correct after the
               page-fade rules above. The next rule continues here. */
            .tulala-shell [data-tulala-mobile-placeholder] { display: none; }
            /* Workspace surface main padding tightens on mobile so cards
               aren't squeezed by 28px of side gutters. */
            .tulala-shell [data-tulala-workspace-grid] > main,
            .tulala-shell [data-tulala-workspace-grid] [data-tulala-surface-main] {
              padding: 14px 14px 60px !important;
            }
            /* Show the mobile bottom tab bar */
            .tulala-shell [data-tulala-mobile-bottom-nav] {
              display: block !important;
            }
            /* Lift the toast stack above the bottom tab bar — at mobile,
               default bottom: 20 lands directly on the 56px tabs. */
            .tulala-shell [data-tulala-toast-host] {
              bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important;
            }
            /* Pad surface main so its last item isn't hidden under the bar.
               Also clamp side padding from desktop's 28px → 14px so cards
               can use the full mobile viewport width. */
            .tulala-shell [data-tulala-surface-main] {
              padding: 14px 14px calc(64px + env(safe-area-inset-bottom, 0px)) !important;
              max-width: 100% !important;
              min-width: 0 !important;
              box-sizing: border-box !important;
              overflow-x: hidden !important;
            }
            /* Workspace topbar — hide nav chips inside (already covered by
               data-tulala-app-topbar-nav rule above). Also: when the
               topbar uses tenant-meta + entity-meta chips on desktop,
               those collapse to icon-only on mobile. */
            .tulala-shell [data-tulala-app-topbar-row] {
              padding: 0 14px !important;
            }
            /* Cards / tiles wider than viewport collapse to 100%. Many
               workspace dashboards use min-width: 280-360 on internal
               cards which overflow at 375. */
            .tulala-shell [data-tulala-surface-main] [style*="min-width: 280"],
            .tulala-shell [data-tulala-surface-main] [style*="min-width: 320"],
            .tulala-shell [data-tulala-surface-main] [style*="min-width: 360"],
            .tulala-shell [data-tulala-surface-main] [style*="min-width: 400"] {
              min-width: 0 !important;
            }
            /* Wide desktop grids (3-up, 4-up cards) collapse to 1 column.
               Inline styles use grid-template-columns with explicit widths
               or repeat(N, ...) — wildcard-target by setting !important. */
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: repeat(3"],
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: repeat(4"],
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: 1fr 1fr 1fr"],
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: 1fr 1fr 1fr 1fr"] {
              grid-template-columns: 1fr !important;
            }
            /* 2-column grids → also 1 column at narrowest */
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: 1fr 1fr"] {
              grid-template-columns: 1fr !important;
            }
            /* Tables — let them scroll horizontally rather than overflow. */
            .tulala-shell [data-tulala-surface-main] table {
              display: block;
              overflow-x: auto;
              max-width: 100%;
            }
            .tulala-shell [data-tulala-app-topbar-right] {
              margin-left: auto !important;
            }
            /* Hide just the plan + entity meta chips on mobile (they're
               still reachable via the tenant-summary drawer); keep the
               avatar + tenant name visible. */
            .tulala-shell [data-tulala-tenant-meta] {
              display: none !important;
            }
            /* Drawers go full-bleed */
            .tulala-shell [data-tulala-drawer-panel] {
              width: 100vw !important;
              max-width: 100vw !important;
            }
            .tulala-shell [data-tulala-drawer-body] {
              padding: 16px 14px 20px !important;
            }
            /* Plan-compare drawer is a wide N×M table that can't collapse
               cleanly to one column. At mobile, give the inner grids a
               fixed min-width and let users swipe horizontally. The sticky
               column header in row-1 scrolls with the body as a unit. */
            .tulala-shell [data-tulala-plan-compare-grid] {
              min-width: 720px;
            }
            .tulala-shell [data-tulala-plan-compare-header],
            .tulala-shell [data-tulala-plan-compare-body] {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            /* Compare-drawer footer collapses to a single CTA row — only
               the primary "Upgrade" path matters on mobile. */
            .tulala-shell [data-tulala-plan-compare-footer] {
              grid-template-columns: 1fr !important;
              gap: 8px !important;
            }
            .tulala-shell [data-tulala-plan-compare-footer] > div:first-child {
              order: 99;
              padding: 4px 0 !important;
            }
            /* Drawer size toolbar (compact/half/full) is meaningless on
               mobile — there's only one viable size. Hide it. */
            .tulala-shell [data-tulala-drawer-size-toolbar] {
              display: none !important;
            }
            /* Drawer footer shrinks padding on mobile */
            .tulala-shell [data-tulala-drawer-footer] {
              padding: 12px 14px !important;
              flex-wrap: wrap !important;
              gap: 8px !important;
            }
            .tulala-shell [data-tulala-modal-overlay] > div {
              max-width: 96vw !important;
            }
            /* Prototype ControlBar: sit inside a horizontal scroller so it
               occupies one short row instead of stacking 5+ rows tall. */
            .tulala-shell > header[role="banner"] {
              flex-wrap: nowrap !important;
              overflow-x: auto !important;
              padding: 6px 12px !important;
              gap: 10px !important;
            }
            .tulala-shell > header[role="banner"] > * {
              flex-shrink: 0 !important;
            }
          }

          /* Information-density mode. Set from useProto via a doc-level
             data attribute. Compact tightens table-style row paddings
             and gaps without overwriting type sizes — comfortable stays
             the default. Targets list rows that opt in by setting the
             [data-tulala-row] attribute on themselves. */
          /* Hide the Next.js dev "N" badge that floats over the bottom-
             left corner. It overlaps the avatar / first column of the
             mobile bottom tab bar in the prototype. Selectors target the
             various names Next has used across versions. */
          [data-nextjs-toast],
          [data-next-mark],
          .__next-dev-overlay-icon,
          #__next-build-watcher,
          nextjs-portal {
            display: none !important;
          }
          /* Typing-indicator dot animation. Used by <TypingIndicator>
             (#11). Three dots pulse opacity in sequence. */
          @keyframes tulalaTypingDot {
            0%, 80%, 100% { opacity: 0.25; }
            40% { opacity: 1; }
          }
          /* Skeleton shimmer — left-to-right gradient sweep. */
          @keyframes tulalaSkeleton {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          [data-tulala-density="compact"] .tulala-shell [data-tulala-row] {
            padding-top: 8px !important;
            padding-bottom: 8px !important;
          }
          [data-tulala-density="compact"] .tulala-shell [data-tulala-grid] {
            gap: 8px !important;
          }
          /* Messages page — premium mobile pattern. Two-pane layout
             collapses to a single-pane stack at <720px. The list is
             shown by default; tapping a conversation flips to the
             thread; back arrow returns to list. Identity bar +
             talent topbar stay sticky above. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-messages-shell] {
              grid-template-columns: 1fr !important;
              border: none !important;
              border-radius: 0 !important;
              /* 100dvh handles iOS dynamic URL bar; --proto-kb is set
                 by a visualViewport listener so the shell shrinks when
                 the soft keyboard opens (audit P0 — keyboard avoidance). */
              height: calc(100dvh - var(--proto-cbar, 50px) - 56px - 52px - var(--proto-kb, 0px)) !important;
              max-height: calc(100dvh - var(--proto-cbar, 50px) - 56px - 52px - var(--proto-kb, 0px)) !important;
              min-height: 0 !important;
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="list"] [data-tulala-thread-pane],
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="list"] [data-tulala-thread-info-sidebar] {
              display: none !important;
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] [data-tulala-list-pane] {
              display: none !important;
            }
            /* Single-pane: thread fills viewport, no right info sidebar
               by default — ensure thread pane spans full width when
               sidebar isn't collapsed yet via the toggle. */
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] {
              grid-template-columns: 1fr !important;
            }
            /* Inner thread+info grid (1fr 320px desktop) collapses to a
               single column at mobile — the info sidebar slides up as a
               bottom sheet (position:fixed below) and shouldn't reserve
               grid space. */
            .tulala-shell [data-tulala-thread-grid] {
              grid-template-columns: 1fr !important;
            }
            /* Info sidebar at mobile = premium bottom sheet (not a
               full-screen overlay). Slides up from bottom with rounded
               top corners + drag-handle pill + soft shadow. Caps at
               80vh so the user can still see thread context above. */
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] [data-tulala-thread-info-sidebar] {
              position: fixed !important;
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              top: auto !important;
              max-height: 80vh !important;
              border-left: none !important;
              border-top: 1px solid rgba(11,11,13,0.08) !important;
              border-radius: 18px 18px 0 0 !important;
              z-index: 200 !important;
              box-shadow: 0 -10px 40px rgba(11,11,13,0.18) !important;
              animation: tulala-sheet-up .26s cubic-bezier(.4,.0,.2,1) !important;
              padding-bottom: env(safe-area-inset-bottom, 0px) !important;
            }
            /* Drag-handle pill at top of the bottom sheet — pure visual
               affordance hinting the sheet is dismissable. Tap × to close. */
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] [data-tulala-thread-info-sidebar]::before {
              content: "";
              position: sticky;
              top: 0;
              display: block;
              width: 36px;
              height: 4px;
              border-radius: 999px;
              background: rgba(11,11,13,0.18);
              margin: 8px auto 0;
              z-index: 1;
            }
            /* Mobile back button reveals at narrow widths */
            .tulala-shell .tulala-mobile-back {
              display: inline-flex !important;
            }
            /* Mobile FAB sits comfortably above the bottom tab bar +
               safe-area inset. */
            .tulala-shell button[aria-label^="Messages ·"][style*="position: fixed"] {
              bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
            }
            /* Composer mobile: input taller for thumb comfort, button
               touch zones grown, attach popover spans full viewport
               width above the composer. */
            .tulala-shell [data-tulala-thread-pane] form input,
            .tulala-shell [data-tulala-thread-pane] input[placeholder="Message…"],
            .tulala-shell [data-tulala-thread-pane] textarea[placeholder="Message…"] {
              padding: 12px 0 !important;
              font-size: 16px !important; /* iOS won't auto-zoom on focus when ≥16 */
            }
            /* Composer trigger buttons (attach +, voice 🎙️): grow to
               40px hit area. Smart-replies ✨ toggle hides at mobile
               per audit E4 — frees real estate, smart-replies still
               accessible on tablet+. */
            .tulala-shell [data-tulala-thread-pane] [aria-label="Attach"],
            .tulala-shell [data-tulala-thread-pane] [aria-label="Voice note"] {
              width: 40px !important;
              height: 40px !important;
            }
            .tulala-shell [data-tulala-thread-pane] [aria-label^="Hide smart"],
            .tulala-shell [data-tulala-thread-pane] [aria-label^="Show smart"] {
              display: none !important;
            }
            .tulala-shell [data-tulala-thread-pane] [aria-label="Send"] {
              width: 40px !important;
              height: 40px !important;
            }
            /* Thread header on mobile: condense padding so it doesn't
               eat 60px of vertical space when stacked under the
               identity bar. */
            .tulala-shell [data-tulala-thread-pane] > div:first-child {
              padding: 10px 14px !important;
            }
            /* Bottom-sheet info panel: pad past the safe-area inset and
               give the close button + first heading more breathing room. */
            .tulala-shell [data-tulala-thread-info-sidebar] > div:first-child {
              padding: 16px 18px 12px !important;
            }
            /* Message bubbles: larger font for readability over arm's
               length. Targets the rounded chat-bubble shapes used by
               text messages (18px corners with one nub). */
            .tulala-shell [data-tulala-thread-pane] [style*="border-radius: 18px 18px 18px 6px"],
            .tulala-shell [data-tulala-thread-pane] [style*="border-radius: 18px 18px 6px 18px"],
            .tulala-shell [data-tulala-thread-pane] [style*="border-radius: 16px 16px 4px 16px"],
            .tulala-shell [data-tulala-thread-pane] [style*="border-radius: 16px 16px 16px 4px"] {
              font-size: 14.5px !important;
              line-height: 1.45 !important;
            }
            /* Action message cards (rate input, transport, etc.) clamp
               to viewport width at mobile. */
            .tulala-shell [data-tulala-thread-pane] [style*="max-width: 380px"],
            .tulala-shell [data-tulala-thread-pane] [style*="max-width: 360px"],
            .tulala-shell [data-tulala-thread-pane] [style*="max-width: 320px"] {
              max-width: calc(100vw - 48px) !important;
            }
            /* Message bubbles use more of the viewport on mobile. */
            .tulala-shell [data-tulala-thread-pane] [style*="max-width: 70%"] {
              max-width: 88% !important;
            }
            /* Conversation list rows: 44px minimum vertical tap area
               (Apple HIG / Material). Scoped to the list-body buttons
               (conversation rows) — NOT the header chips/filter pills. */
            .tulala-shell [data-tulala-list-pane] > div:nth-child(2) > button {
              min-height: 56px !important;
            }
            /* Audit P0-1 — filter chips become a horizontal scroll
               strip on phone instead of wrapping to 2-3 rows that eat
               list real estate. Edge-fade hints overflow. */
            .tulala-shell [data-tulala-msg-filter-chips] {
              flex-wrap: nowrap !important;
              overflow-x: auto !important;
              scroll-snap-type: x mandatory !important;
              -webkit-overflow-scrolling: touch !important;
              padding-bottom: 2px !important;
              scrollbar-width: none !important;
              mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%) !important;
              -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%) !important;
            }
            .tulala-shell [data-tulala-msg-filter-chips]::-webkit-scrollbar { display: none !important; }
            .tulala-shell [data-tulala-msg-filter-chips] > button {
              flex-shrink: 0 !important;
              scroll-snap-align: start !important;
            }
            /* Audit P1-7 — bump conversation row typography above iOS
               minimum (12px). Stage chip 9.5 → 10.5; preview/age 10.5/11
               → 12; client name 13 → 14. */
            .tulala-shell [data-tulala-conv-row-name] { font-size: 14px !important; }
            .tulala-shell [data-tulala-conv-row-age] { font-size: 11.5px !important; }
            .tulala-shell [data-tulala-conv-row-brief] { font-size: 12.5px !important; }
            .tulala-shell [data-tulala-conv-row-preview] { font-size: 12px !important; }
            .tulala-shell [data-tulala-conv-row-stage] { font-size: 10px !important; }
            /* Audit P1-6 — trim thread header on phone. Hide the
               in-thread search button + info-toggle (info still
               reachable via the ⋯ menu / bottom-sheet swipe). */
            .tulala-shell [data-tulala-thread-header] [aria-label="Search in thread"],
            .tulala-shell [data-tulala-thread-header] [aria-label="Hide info panel"],
            .tulala-shell [data-tulala-thread-header] [aria-label="Show info panel"] {
              display: none !important;
            }
          }
          @keyframes tulala-sheet-up {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          /* Pinned info row inside the messages page (legacy class — now
             always lives in the right sidebar; targeted here just in case
             it sneaks back). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-messages-shell] [data-tulala-app-topbar-row],
            .tulala-shell [data-tulala-messages-shell] [data-tulala-surface-main] {
              max-width: 100% !important;
            }
          }
          /* Talent surface main padding compresses on mobile so the
             messages shell can fill the viewport without margins. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main]:has([data-tulala-messages-shell]) {
              padding: 0 !important;
            }
          }
          /* Mobile tap-target floor. Apple HIG / Material both call for
             44×44 minimum hit area. A transparent ::before sits behind
             the control, expanding the hit-area without changing visual
             size. Opt-in via data-tulala-tap-pad on the small controls
             (chip pills, icon buttons, dot toggles). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-tap-pad] {
              position: relative;
            }
            .tulala-shell [data-tulala-tap-pad]::before {
              content: "";
              position: absolute;
              left: 50%;
              top: 50%;
              transform: translate(-50%, -50%);
              width: max(100%, 44px);
              height: max(100%, 44px);
              z-index: 0;
            }
          }
          /* Talent / workspace stat strips: wrap to 2-up grid at <720
             so 3 stats with vertical dividers don't overflow the row.
             Hide the inline dividers (they're abs-positioned 1px lines
             that look broken when the strip wraps). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-stat-strip] {
              flex-wrap: wrap !important;
              gap: 12px !important;
              padding: 12px 14px !important;
              row-gap: 12px !important;
            }
            .tulala-shell [data-tulala-stat-strip] > [data-tulala-stat-divider] {
              display: none !important;
            }
            .tulala-shell [data-tulala-stat-strip] > * {
              /* Audit P1-12 — stack to 1-col on phone instead of 2+1
                 leaving an awkward lone third item at full width. */
              flex-basis: 100% !important;
              flex-grow: 1 !important;
            }
          }
          /* Forecast tile: 3-up horizontal collapses to vertical stack
             at <720 so each metric is full-width and readable. The
             internal vertical 1px dividers turn into 1px horizontal
             dividers via flex-direction. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-forecast-tile] {
              flex-direction: column !important;
            }
            .tulala-shell [data-tulala-forecast-tile] > div[style*="width: 1px"] {
              width: 100% !important;
              height: 1px !important;
            }
          }
          /* Talent / surface H1 mobile typography. The big 30px display
             headline scales down to keep proportions on phone. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main] h1 {
              font-size: 26px !important;
              letter-spacing: -0.4px !important;
            }
          }
          @media (max-width: 540px) {
            .tulala-shell [data-tulala-surface-main] h1 {
              font-size: 22px !important;
              letter-spacing: -0.3px !important;
            }
          }
          /* Composer attach menu — at <720 expands to a full-width
             bottom sheet (anchored to the composer's bottom edge),
             not a 270px popover. 4-up grid for thumb-comfortable
             items + each tile sized 44px+ (Apple HIG). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-attach-menu] {
              left: 0 !important;
              right: 0 !important;
              border-radius: 14px 14px 0 0 !important;
              padding: 12px 14px !important;
              grid-template-columns: repeat(4, 1fr) !important;
              gap: 6px !important;
              animation: tulala-sheet-up .22s cubic-bezier(.4,.0,.2,1) !important;
            }
            .tulala-shell [data-tulala-attach-menu] > button {
              padding: 14px 6px !important;
              min-height: 64px !important;
            }
          }
          /* Identity bar mobile collapse — drop the lowest-priority
             utilities below 720px so the centerpiece (mode toggle +
             notifications) keeps room. Help, locale toggle, sign-out
             move to the avatar menu. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-identity-bar] {
              padding: 0 14px !important;
            }
            .tulala-shell [data-tulala-identity-bar] [aria-label="Help"],
            .tulala-shell [data-tulala-identity-bar] [aria-label="Sign out"],
            .tulala-shell [data-tulala-identity-bar] [role="group"][aria-label="Language"] {
              display: none !important;
            }
          }
          /* ─── PREMIUM MOBILE PASS ────────────────────────────────
             Audit J1–J8 + section A/B/C/D/E/F/G/H/I improvements.
             Mobile-only @media rules; desktop styles untouched. */

          /* Audit A2 — Mode toggle proportion at narrow widths.
             Tighter button padding so the pill sits comfortably inside
             the 56px identity bar at <720. Font also shrinks 12.5→12. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-identity-bar] [role="tablist"][aria-label="Switch between Talent and Workspace"] > button {
              padding: 0 10px !important;
              font-size: 12px !important;
            }
          }

          /* J4/J5 (audit C1+C2) — TalentTodayHero stacks vertically at
             <720. The right-column action buttons drop below the
             headline so the title doesn't wrap to 4 lines. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-talent-hero-row] {
              flex-direction: column !important;
              gap: 14px !important;
              align-items: stretch !important;
            }
            .tulala-shell [data-tulala-talent-hero-row] > div:last-child {
              align-self: flex-start !important;
            }
          }

          /* J8 (audit D2) — Conversation list filter chips: scroll
             horizontally instead of wrapping. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-list-pane] > div:first-child > div:nth-child(3) {
              flex-wrap: nowrap !important;
              overflow-x: auto !important;
              -webkit-overflow-scrolling: touch !important;
              scrollbar-width: none;
              padding-bottom: 2px;
            }
            .tulala-shell [data-tulala-list-pane] > div:first-child > div:nth-child(3)::-webkit-scrollbar {
              display: none;
            }
            .tulala-shell [data-tulala-list-pane] > div:first-child > div:nth-child(3) > button {
              flex-shrink: 0 !important;
            }
          }

          /* Audit A4 — At <380px the "Acme Models" label hides;
             only the green dot + chevron remain. */
          @media (max-width: 380px) {
            .tulala-shell [data-tulala-identity-bar] [data-tulala-acting-label] {
              display: none !important;
            }
          }
          /* Acting-as detail subline (€4.2k pending · 3 confirmed) hides
             at narrow widths to keep the identity bar uncluttered. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-identity-bar] [data-tulala-acting-detail] {
              display: none !important;
            }
          }

          /* Audit E1 — Thread header redesign for mobile. Hide search +
             ⋯ (rare on phone, accessible via info panel). Trust chip
             also hides — it's redundant in the header (lives in the
             info sidebar). Brief truncates with ellipsis instead of
             wrapping. Tighter gap, smaller stage pill. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-thread-pane] [aria-label="Search in thread"],
            .tulala-shell [data-tulala-thread-pane] [aria-label="Thread options"] {
              display: none !important;
            }
            .tulala-shell [data-tulala-thread-header] {
              gap: 10px !important;
              padding: 10px 14px !important;
              align-items: center !important;
            }
            .tulala-shell [data-tulala-thread-header-titlerow] {
              gap: 6px !important;
            }
            .tulala-shell [data-tulala-thread-header-trust] {
              display: none !important;
            }
            .tulala-shell [data-tulala-thread-header-stage] {
              font-size: 9px !important;
              padding: 2px 5px !important;
            }
          }
          /* Below 380px the stage pill drops too — only client name +
             brief remain in the title block. */
          @media (max-width: 380px) {
            .tulala-shell [data-tulala-thread-header-stage] {
              display: none !important;
            }
          }

          /* Audit B6 + H3 — Native-feeling press feedback. */
          @media (max-width: 720px) {
            .tulala-shell button:active:not([disabled]) {
              transform: scale(0.97);
              transition: transform .08s cubic-bezier(.4,0,.2,1);
            }
          }

          /* Audit F3 — Toast lifts above bottom nav. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-toast-host] {
              bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
              left: 12px !important;
              right: 12px !important;
            }
          }

          /* Audit C7 + I1 — Tap-target floor 56px on lists. Scoped to
             conversation rows (list body), not header chip buttons. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-list-pane] > div:nth-child(2) > button,
            .tulala-shell [data-tulala-row] {
              min-height: 56px !important;
            }
          }

          /* Audit B3 — Bottom-tab pill grows to 44×28 on mobile. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-mobile-bottom-nav] button > span:first-child {
              width: 44px !important;
              height: 28px !important;
            }
            .tulala-shell [data-tulala-mobile-bottom-nav] button > span:first-child > svg {
              width: 18px !important;
              height: 18px !important;
            }
            .tulala-shell [data-tulala-mobile-bottom-nav] button > span:last-child {
              font-size: 11.5px !important;
            }
          }

          /* Audit F1 — Drawer + form input min-height 44px / 15px. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-drawer-panel] input,
            .tulala-shell [data-tulala-drawer-panel] select,
            .tulala-shell [data-tulala-drawer-panel] textarea {
              min-height: 44px !important;
              font-size: 15px !important;
            }
          }

          /* Audit G5 — Subtle 1px shadow on white cards over cream
             surface (lifts them off the page on phone). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main] section[style*="background: rgb(255, 255, 255)"] {
              box-shadow: 0 1px 1px rgba(11,11,13,0.04);
            }
          }

          /* Phone-specific tightening — values, captions, and chip rows
             that still feel cramped at 720 get a final pass at 540. */
          @media (max-width: 540px) {
            .tulala-shell [data-tulala-h1] {
              font-size: 22px !important;
            }
            .tulala-shell [data-tulala-surface-main] {
              padding: 14px 12px 40px !important;
            }
            /* Identity bar phone — collapse brand, name, slash separator.
               Keep avatar (recognizable identity) + acting-as chip + mode
               toggle + bell. The mode toggle is the centerpiece; protect
               its width. */
            .tulala-shell [data-tulala-brand],
            .tulala-shell [data-tulala-id-divider],
            .tulala-shell [data-tulala-identity-name],
            .tulala-shell [data-tulala-id-slash] {
              display: none !important;
            }
            /* Tighten gaps so everything fits on a 360px viewport. */
            .tulala-shell [data-tulala-identity-bar] > div {
              gap: 8px !important;
            }
          }
          /* #1 — back button in page headers, mobile only */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-page-back] {
              display: inline-flex !important;
            }
          }

          /* #2 — tenant meta in avatar menu on mobile */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-tenant-meta-mobile] {
              display: flex !important;
            }
          }

          /* #4 FAB — show on mobile only */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-fab] {
              display: inline-flex !important;
            }
          }

          /* #13 — bottom tab label truncation at 320px. maxWidth 76 → 48
             so 5 tabs fit on a 320px screen without overflow. */
          @media (max-width: 340px) {
            .tulala-shell [data-tulala-mobile-bottom-nav] button > span:last-child {
              max-width: 48px !important;
              font-size: 10px !important;
            }
          }

          /* #15 — swipe-between-tabs: overscroll-x contain so accidental
             horizontal flicks don't navigate the browser history. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main] {
              overscroll-behavior-x: contain;
            }
          }

          /* #16 — 44px tap-target floor on narrow icon buttons at mobile. */
          @media (max-width: 720px) {
            .tulala-shell button[style*="width: 28px"],
            .tulala-shell button[style*="width: 26px"],
            .tulala-shell button[style*="width: 24px"],
            .tulala-shell button[style*="width: 32px"] {
              min-width: 44px !important;
              min-height: 44px !important;
            }
          }

          /* #17 — pull-to-refresh: contain overscroll-y to prevent native
             browser pull-to-refresh from firing accidentally inside the
             prototype. Real PTR needs a JS touch handler. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main] {
              overscroll-behavior-y: contain;
            }
          }

          /* #29 — ARIA live region pulse: a subtle opacity pulse when
             data-tulala-updating="true" so sighted users notice the update. */
          @keyframes tulalaLivePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
          [aria-live="polite"][data-tulala-updating="true"] {
            animation: tulalaLivePulse .5s ease 1;
          }

          /* #30 — keyboard focus style inside context menus. */
          .tulala-shell [role="menu"] [role="menuitem"]:focus-visible {
            background: rgba(15,79,62,0.08) !important;
            outline: none !important;
          }

          /* Print: strip the prototype chrome (dark ControlBar, drawer
             overlays, toast host, skip link) so the surface itself is what
             ends up on paper. */
          @media print {
            .tulala-shell .skip-to-main,
            .tulala-shell > header[role="banner"],
            .tulala-shell [data-tulala-drawer-overlay],
            .tulala-shell [data-tulala-drawer-panel],
            .tulala-shell [data-tulala-modal-overlay],
            .tulala-shell [data-tulala-toast-host] {
              display: none !important;
            }
            .tulala-shell {
              background: #fff !important;
            }
          }
        `}</style>
        <div
          className="tulala-shell"
          data-dev={showDevBar ? "1" : "0"}
          style={{
            // CSS var consumed by sticky descendants (IdentityBar +
            // mode-shell topbars/sidebars) so they offset correctly
            // whether the dev control bar is shown or hidden.
            ["--proto-cbar" as never]: showDevBar ? "50px" : "0px",
            background: COLORS.surface,
            minHeight: "100vh",
            fontFamily: FONTS.body,
            color: COLORS.ink,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Skip-to-main link for keyboard users (visible on focus only) */}
          <a href="#tulala-main" className="skip-to-main">
            Skip to main content
          </a>

          {/* Top: prototype control bar (dark, sticky). Hidden on
              non-dev URLs so the prototype demos look like the real
              product. Pass ?dev=1 to show it. */}
          <DevOnlyControlBar show={showDevBar} />

          {/* Below: the surface — workspace, talent, client, or platform */}
          <SurfaceRouter />

          {/* Layered on top: drawer overlay + drawer panel */}
          <DrawerRoot />

          {/* Layered on top: upgrade modal (cream header + plan unlocks) */}
          <UpgradeModal />

          {/* Layered on top: toast stack (bottom-right) */}
          <ToastBridge />
          <TabTitleBridge />

          {/* Offline banner — fixed at top, asserts connection loss (#23) */}
          <OfflineBanner />

          {/* Layered on top: command palette (⌘K / Ctrl+K) */}
          <CommandPalette />

          {/* Mobile-only bottom tab bar (hidden on desktop via CSS). */}
          <MobileBottomNav />

          {/* Floating "↑ Top" — appears after 600px of scroll. */}
          <BackToTop />
        </div>
    </>
  );
}
