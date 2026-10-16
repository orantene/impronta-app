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
