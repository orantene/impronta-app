/**
 * Mobile room for the floating guest-chat bubble on the light profile layout.
 *
 * The bubble (`[data-guest-chat-launcher]`) is body-level, fixed bottom-right
 * (right 16px, 56px wide). On phones it sat on top of the share block
 * ("Compartir este perfil") and of the sticky inquiry bar. Two pieces of
 * reserved space, both below the `lg` breakpoint only (desktop is unchanged):
 *
 *  - SHARE_GUTTER_CLASS: right gutter on the share row so its icons wrap
 *    short of the bubble's column wherever the page is scrolled.
 *  - LAUNCHER_LIFT_CSS: lift the bubble above the fixed sticky inquiry bar
 *    (bar ~76px incl. margin) plus the safe-area inset.
 */
export const SHARE_GUTTER_CLASS = "pr-20 lg:pr-0";

export const LAUNCHER_LIFT_CSS =
  "@media (max-width:1023.98px){body:has([data-profile-sticky-bar=\"visible\"]) [data-guest-chat-launcher]{bottom:calc(88px + env(safe-area-inset-bottom,0px)) !important}}";
