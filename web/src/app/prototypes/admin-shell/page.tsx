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

import { Suspense } from "react";
import { ProtoProvider, useProto, COLORS, FONTS } from "./_state";
import { ToastHost } from "./_primitives";
import { ControlBar, MobileBottomNav, SurfaceRouter } from "./_pages";
import { DrawerRoot, UpgradeModal } from "./_drawers";
import { CommandPalette } from "./_palette";

// ─── Toast bridge (reads from context, passes to dumb host) ──────────

function ToastBridge() {
  const { state, dismissToast } = useProto();
  return <ToastHost toasts={state.toasts} onDismiss={dismissToast} />;
}


// ─── Page entry ──────────────────────────────────────────────────────

export default function AdminShellPrototypePage() {
  return (
    <Suspense fallback={null}>
      <ProtoProvider>
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
            /* Show the mobile bottom tab bar */
            .tulala-shell [data-tulala-mobile-bottom-nav] {
              display: block !important;
            }
            /* Lift the toast stack above the bottom tab bar — at mobile,
               default bottom: 20 lands directly on the 56px tabs. */
            .tulala-shell [data-tulala-toast-host] {
              bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important;
            }
            /* Pad surface main so its last item isn't hidden under the bar */
            .tulala-shell [data-tulala-surface-main] {
              padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)) !important;
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
          /* Phone-specific tightening — values, captions, and chip rows
             that still feel cramped at 720 get a final pass at 540. */
          @media (max-width: 540px) {
            .tulala-shell [data-tulala-h1] {
              font-size: 22px !important;
            }
            .tulala-shell [data-tulala-surface-main] {
              padding: 14px 12px 40px !important;
            }
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
          style={{
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

          {/* Top: prototype control bar (dark, sticky) */}
          <ControlBar />

          {/* Below: the surface — workspace, talent, client, or platform */}
          <SurfaceRouter />

          {/* Layered on top: drawer overlay + drawer panel */}
          <DrawerRoot />

          {/* Layered on top: upgrade modal (cream header + plan unlocks) */}
          <UpgradeModal />

          {/* Layered on top: toast stack (bottom-right) */}
          <ToastBridge />

          {/* Layered on top: command palette (⌘K / Ctrl+K) */}
          <CommandPalette />

          {/* Mobile-only bottom tab bar (hidden on desktop via CSS). */}
          <MobileBottomNav />
        </div>
      </ProtoProvider>
    </Suspense>
  );
}
