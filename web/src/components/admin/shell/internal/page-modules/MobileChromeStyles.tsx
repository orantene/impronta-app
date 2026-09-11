"use client";

/**
 * The phone's chrome, in one sheet (MW boards, 390px).
 *
 * What lives here is what the boards change ABOUT THE SHELL below 720px and
 * what no component can reach with its own classes: the identity bar's
 * height, the notifications popover and the record sheets becoming bottom
 * sheets, the surface's padding above the tab bar. Everything a component
 * owns (the Overview's stat grid, a record's KPI pair, the chip strips) is a
 * responsive class on that component instead.
 *
 * Rendered once by the identity bar's phone slot (IdentityBar-1.tsx), which
 * every workspace page mounts, the till included (POSHandheld keeps the top
 * bar and loses the tab bar). The
 * breakpoint is the shell's own (admin-shell-client.tsx uses 720px), so this
 * layer and that one always agree about what a phone is.
 */

export const MOBILE_BREAKPOINT_PX = 720;

export function MobileChromeStyles() {
  return (
    <style>{`
      @media (max-width: ${MOBILE_BREAKPOINT_PX}px) {
        /* MW00: the identity bar is the 52px top bar. */
        .tulala-shell [data-tulala-identity-bar] {
          height: 52px !important;
          padding: 0 12px !important;
          background: var(--color-admin-surface) !important;
          border-bottom: 1px solid var(--color-admin-border-soft) !important;
        }
        .tulala-shell [data-tulala-identity-bar] [data-tulala-identity-desktop] {
          display: none !important;
        }
        .tulala-shell [data-tulala-identity-bar] [data-tulala-identity-mobile] {
          display: flex !important;
        }
        /* The surface sits between the bar and the tabs; the tab bar is
           62px plus the home indicator. */
        .tulala-shell [data-tulala-workspace-grid] > div > main,
        .tulala-shell [data-tulala-surface-main] {
          padding: 14px 14px calc(78px + env(safe-area-inset-bottom, 0px)) !important;
        }
        /* MW35: the bell's popover is a bottom sheet, not a 380px card
           hung off the button. The bell clears its own top/left on a phone
           (notifications-hub.tsx) so these rules own the placement. */
        .tulala-shell [data-tulala-notifications-popover]:popover-open {
          position: fixed !important;
          inset: auto 0 0 0 !important;
          width: 100vw !important;
          max-width: 100vw !important;
          max-height: 82vh !important;
          border-radius: 20px 20px 0 0 !important;
          padding-bottom: env(safe-area-inset-bottom, 0px) !important;
        }
        /* W44/W48/W50 record sheets (Collect, Replace, Close, Record
           approval) become bottom sheets with full-width 50px buttons. */
        [data-record-overlay] {
          align-items: flex-end !important;
          justify-content: stretch !important;
        }
        [data-record-overlay] [data-record-sheet] {
          width: 100vw !important;
          max-width: 100vw !important;
          height: auto !important;
          max-height: 86vh !important;
          border-radius: 20px 20px 0 0 !important;
        }
        [data-record-overlay] [data-record-sheet] > div:first-child {
          padding: 18px 18px 10px !important;
        }
        [data-record-overlay] [data-record-sheet] > div:first-child::before {
          content: "";
          position: absolute;
          top: 8px;
          left: 50%;
          width: 38px;
          height: 4px;
          margin-left: -19px;
          border-radius: 999px;
          background: var(--color-admin-border-strong);
        }
        [data-record-overlay] [data-record-sheet] > div:nth-child(2) {
          padding: 0 18px 12px !important;
        }
        [data-record-overlay] [data-record-sheet] [data-record-sheet-footer] {
          flex-direction: column-reverse !important;
          align-items: stretch !important;
          gap: 8px !important;
          padding: 12px 18px max(26px, env(safe-area-inset-bottom, 0px)) !important;
        }
        [data-record-overlay] [data-record-sheet] [data-record-sheet-footer] > span {
          display: none !important;
        }
        [data-record-overlay] [data-record-sheet] [data-record-sheet-footer] a,
        [data-record-overlay] [data-record-sheet] [data-record-sheet-footer] button {
          width: 100% !important;
          height: 50px !important;
          border-radius: 12px !important;
          font-size: 15px !important;
        }
        /* A record's desktop toolbar (Edit · New · Collect) folds under the
           header; the phone's decisive action is the fixed action bar. */
        [data-mobile-hide] {
          display: none !important;
        }
        [data-mobile-stack] {
          flex-direction: column !important;
          align-items: stretch !important;
        }
        [data-tulala-workspace-page-anim] > * {
          min-width: 0;
        }
      }
    `}</style>
  );
}
