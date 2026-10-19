/**
 * TUL-1158: the floating account button must agree with the site header. When
 * a staff/talent (business) session is active on this site the header offers
 * "Cerrar sesión", so a dock button saying "Iniciar sesión" contradicts it.
 * The dock hides in that case; the header owns the session control.
 */
export function shouldHideAccountDock(
  variant: "dock" | "header",
  me: { signedIn: boolean; signedInAs?: string },
): boolean {
  return variant === "dock" && !me.signedIn && me.signedInAs === "business";
}

/**
 * The dock sits one layer BELOW the chat launcher (z 95). They share the
 * bottom-right corner and, when sticky chrome lifts the launcher, overlap;
 * the account button was later in the DOM at the same z-index and swallowed
 * taps on the bubble.
 */
export const ACCOUNT_DOCK_Z_INDEX = 94;

/**
 * TUL-1207: at 390px the fixed 44px dock (right edge) passed over the save
 * hearts that sit in the top-right corner of the right-column directory cards.
 * On narrow screens it moves to the left edge, which no card control uses. TUL-1225: the left
 * chat launcher (54px, bottom 24px) tops out at y766 of 844, so the dock rides 6px higher than the
 * shared 88px offset (94px) to leave a 16px gap between the two tap targets instead of 10px.
 */
export const DOCK_NARROW_SIDE_CSS =
  '[data-client-account-trigger="dock"]{right:auto!important;left:max(16px,env(safe-area-inset-left))!important;bottom:calc(94px + env(safe-area-inset-bottom))!important}';
