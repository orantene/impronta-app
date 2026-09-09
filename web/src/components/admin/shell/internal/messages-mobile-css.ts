/**
 * Messages-surface mobile stylesheet (≤720px).
 *
 * Extracted verbatim from `admin-shell-client.tsx`, which the structural
 * quality gate caps at 2430 lines — this block is 360 of them and is a
 * self-contained concern, so it lives on its own rather than pushing the
 * shell file further over its budget.
 *
 * Injected into the same `<style>` element it used to sit inside, so the
 * cascade order (and therefore which `!important` wins) is unchanged.
 * Contains no interpolation by design: keep it a plain string so it stays
 * greppable and diffable as CSS.
 */
export const MESSAGES_MOBILE_CSS = `
             talent topbar stay sticky above. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-messages-shell] {
              grid-template-columns: 1fr !important;
              border: none !important;
              border-radius: 0 !important;
              /* 100dvh handles iOS dynamic URL bar; --proto-kb is set
                 by a visualViewport listener so the shell shrinks when
                 the soft keyboard opens (audit P0 — keyboard avoidance). */
              height: calc(100dvh - var(--proto-cbar, 50px) - 56px - var(--tulala-mobile-nav-h, 65px) - var(--proto-kb, 0px)) !important;
              max-height: calc(100dvh - var(--proto-cbar, 50px) - 56px - var(--tulala-mobile-nav-h, 65px) - var(--proto-kb, 0px)) !important;
              min-height: 0 !important;
            }
            /* 2026-style native-app slide transition between list and
               thread. Both panes are stacked via grid (same row + col)
               and animated via transform — much smoother than display
               toggling, GPU-accelerated, no layout thrash. The active
               pane sits at translateX(0); the inactive pane sits off
               the right edge and slides in. iOS push-navigation feel. */
            .tulala-shell [data-tulala-messages-shell] {
              grid-template-columns: 1fr !important;
            }
            .tulala-shell [data-tulala-messages-shell] [data-tulala-list-pane],
            .tulala-shell [data-tulala-messages-shell] [data-tulala-thread-pane] {
              grid-row: 1 !important;
              grid-column: 1 !important;
              transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1) !important;
              will-change: transform;
              backface-visibility: hidden;
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="list"] [data-tulala-list-pane] {
              transform: translateX(0);
              z-index: 2;
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="list"] [data-tulala-thread-pane] {
              transform: translateX(100%);
              z-index: 1;
              pointer-events: none;
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] [data-tulala-list-pane] {
              transform: translateX(-30%);
              z-index: 1;
              pointer-events: none;
              opacity: 0.4;
              filter: brightness(0.92);
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] [data-tulala-thread-pane] {
              transform: translateX(0);
              z-index: 2;
              box-shadow: -8px 0 24px -8px rgba(11,11,13,0.18);
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="list"] [data-tulala-thread-info-sidebar] {
              display: none !important;
            }
            /* Respect reduced-motion preference. */
            @media (prefers-reduced-motion: reduce) {
              .tulala-shell [data-tulala-messages-shell] [data-tulala-list-pane],
              .tulala-shell [data-tulala-messages-shell] [data-tulala-thread-pane] {
                transition: none !important;
              }
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
            /* Mobile inbox tab — the "door" back to the list, pinned to the
               left edge at mid-height. It is kept HIDDEN: the thread header
               already shows a back arrow at this breakpoint (rule below), so
               the door is a second route to the same place that permanently
               floats on top of the conversation. One back affordance, and
               the messages get their full width. */
            .tulala-shell [data-tulala-mobile-inbox-tab] {
              display: none !important;
            }
            /* Workspace messages WhatsApp-style header: show back arrow,
               hide desktop-only trust chip + status chip to keep the bar
               clean for thumb-driven nav. */
            .tulala-shell [data-tulala-thread-back] {
              display: inline-flex !important;
            }
            .tulala-shell [data-tulala-header-trust-desktop],
            .tulala-shell [data-tulala-header-status-desktop] {
              display: none !important;
            }
            /* Mobile FAB sits comfortably above the bottom tab bar +
               safe-area inset. */
            .tulala-shell button[aria-label^="Messages ·"][style*="position: fixed"] {
              bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
            }
            /* Feedback FAB is hidden on mobile — the "Send feedback"
               action lives inside the bottom-nav More menu instead, so
               we never cover content with a floating button. The panel
               itself still opens via the same FeedbackButton component
               (it listens to a "tulala-open-feedback" custom event). */
            .tulala-shell [data-tulala-feedback-btn] > button[aria-label="Send feedback"] {
              display: none !important;
            }
            /* AI helpbot lifts above the bottom nav on mobile (Feedback
               is no longer floating, so we just clear the 64px tab bar
               + a comfortable gap). */
            .tulala-shell [data-tulala-ai-helpbot] {
              bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
            }
            /* Account menu trigger (avatar + hamburger) — make sure the
               whole pill is at least 36px tall on mobile for thumb taps. */
            .tulala-shell [data-tulala-account-menu-root] > button {
              min-height: 36px !important;
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
            /* ── Touch-target floor ──────────────────────────────────
               The inbox filter chips (31px tall) and the thread's tab
               strip (39px) were both under the 44px thumb target. */
            .tulala-shell [data-tulala-inbox-chips] > * {
              min-height: 44px !important;
            }
            /* Bulk-select toggle. Pin / Mark-unread / Archive live in a
               hover-reveal pill that touch can never summon, so on mobile
               this button is the way into Archive + Nudge — it must not be
               a 20px-tall sliver. */
            .tulala-shell [data-tulala-inbox-bulk-toggle] {
              min-height: 44px !important;
              padding-inline: 12px !important;
            }
            .tulala-shell [data-tulala-thread-tabs] button {
              min-height: 44px !important;
            }
            /* Thread-header back arrow was a 26x26 sliver — the single most
               tapped control in the thread. */
            .tulala-shell [data-tulala-thread-back],
            .tulala-shell [data-tulala-back-btn] {
              width: 44px !important;
              height: 44px !important;
              min-width: 44px !important;
              min-height: 44px !important;
              border-radius: 10px !important;
              margin-top: 0 !important;
            }
            /* Remaining sub-44px controls in the thread: the composer mic
               (its aria-label is "Record voice note", not "Voice note", so
               the rule above never matched it), the lineup summary row, and
               the next-action nudge bar's CTA + dismiss. */
            .tulala-shell [data-tulala-thread-pane] [aria-label="Record voice note"] {
              width: 44px !important;
              height: 44px !important;
            }
            .tulala-shell [data-tulala-next-action-bar] button {
              min-height: 44px !important;
              min-width: 44px !important;
            }
            .tulala-shell [data-tulala-inbox-search] input {
              min-height: 44px !important;
            }
            /* Lineup summary ("1 talent · 0/1 accepted") opens the Lineup
               tab, so it is a control, not a caption. */
            .tulala-shell [data-tulala-header-meta-extras] button {
              min-height: 44px !important;
            }
            /* The stage menu is anchored right:0 to its trigger. On desktop
               the trigger sits at the right edge so the menu opens inward;
               on mobile the trigger is the FIRST item on its row, so the
               same anchor threw the menu off the left edge of the screen. */
            .tulala-shell [data-tulala-stage-menu] {
              right: auto !important;
              left: 0 !important;
            }
            /* ── Horizontal strips actually scroll ───────────────────
               Both rails overflow at 375px (chips 700px of content in a
               346px rail; tabs 506px in 345px). They scrolled, but with
               a visible scrollbar, no momentum, and each drag also
               dragged the pane behind them. */
            .tulala-shell [data-tulala-inbox-chips],
            .tulala-shell [data-tulala-thread-tabs] {
              overflow-x: auto !important;
              flex-wrap: nowrap !important;
              -webkit-overflow-scrolling: touch;
              overscroll-behavior-x: contain;
              scrollbar-width: none;
              scroll-padding-inline: 12px;
            }
            .tulala-shell [data-tulala-inbox-chips]::-webkit-scrollbar,
            .tulala-shell [data-tulala-thread-tabs]::-webkit-scrollbar {
              display: none;
            }
            /* Same trailing fade as the thread action bar, so a rail that
               runs past the edge reads as scrollable rather than cut. */
            .tulala-shell [data-tulala-inbox-chips],
            .tulala-shell [data-tulala-thread-tabs] {
              -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
              mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
            }
            /* The two per-message affordances ship with different chrome —
               a 40px outlined circle next to a bare arrow. Match them. */
            .tulala-shell [data-msg-actions] button {
              min-width: 40px;
              min-height: 40px;
              border: none !important;
              background: transparent !important;
              box-shadow: none !important;
            }
            /* Support launcher is pinned mid-right (top:62%), which on a
               phone parks it right on top of the conversation. Dock it
               above the bottom nav instead of over the content.
               NOT scoped to .tulala-shell: the launcher is mounted as a
               sibling of the shell, so a scoped selector never matches. */
            [data-tulala-support-launcher] {
              top: auto !important;
              transform: none !important;
              bottom: calc(var(--tulala-mobile-nav-h, 65px) + 12px) !important;
            }
            /* …and it lands exactly where the inbox's bulk action bar
               appears, covering "Reassign". The bar is in a different
               subtree, so :has() on the root is what relates them. */
            html:has([data-tulala-bulk-bar]) [data-tulala-support-launcher] {
              display: none !important;
            }
            /* Inside a conversation the bottom of the screen is already the
               composer plus the "Reply to client" nudge bar, and the docked
               launcher lands on top of that CTA. Stand it down while the
               thread pane is open; support is still reachable from More. */
            html:has([data-tulala-messages-shell][data-mobile-pane="thread"])
              [data-tulala-support-launcher] {
              display: none !important;
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
`;
