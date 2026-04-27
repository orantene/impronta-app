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

import { Suspense, useEffect, useState } from "react";
import { ProtoProvider, useProto, COLORS, FONTS } from "./_state";
import { ToastHost, BackToTop } from "./_primitives";
import { ControlBar, MobileBottomNav, SurfaceRouter } from "./_pages";
import { DrawerRoot, UpgradeModal } from "./_drawers";
import { CommandPalette } from "./_palette";

// ─── Toast bridge (reads from context, passes to dumb host) ──────────

function ToastBridge() {
  const { state, dismissToast } = useProto();
  return <ToastHost toasts={state.toasts} onDismiss={dismissToast} />;
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


// ─── Page entry ──────────────────────────────────────────────────────

export default function AdminShellPrototypePage() {
  return (
    <Suspense fallback={null}>
      <ProtoProvider>
        <PrototypeRoot />
      </ProtoProvider>
    </Suspense>
  );
}

function PrototypeRoot() {
  const showDevBar = useDevControlBar();
  return (
    <ProtoProviderInnerOriginal showDevBar={showDevBar} />
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
              height: calc(100vh - var(--proto-cbar, 50px) - 56px - 52px) !important;
              max-height: calc(100vh - var(--proto-cbar, 50px) - 56px - 52px) !important;
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
            /* Composer mobile: input taller for thumb comfort, attach
               popover spans full viewport width above the composer. */
            .tulala-shell [data-tulala-thread-pane] form input,
            .tulala-shell [data-tulala-thread-pane] input[placeholder="Message…"] {
              padding: 12px 0 !important;
              font-size: 15px !important;
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
               (Apple HIG / Material). */
            .tulala-shell [data-tulala-list-pane] button {
              min-height: 56px !important;
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
