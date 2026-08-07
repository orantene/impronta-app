export const AUTH_POPUP_MESSAGE_TYPE = "impronta:auth-popup-result";

export type AuthPopupMessage = {
  type: typeof AUTH_POPUP_MESSAGE_TYPE;
  success: boolean;
  destination?: string;
  error?: string;
};

/**
 * Send the opener to the destination the popup came back with.
 *
 * The destination may be ABSOLUTE. `/auth/callback` runs on whatever host
 * Google returned to, which can be the marketing apex, and `/admin`,
 * `/client`, `/talent` and `/onboarding/*` do not exist there. The callback
 * therefore host-checks the destination and hands back an app-host URL when
 * the current surface would 404 it. `router.push` is for in-app paths, so an
 * absolute URL gets a real navigation instead.
 *
 * Without this the popup sign-in on tulala.digital/register ended on
 * "Page not found".
 */
export function navigateToAuthPopupDestination(
  destination: string,
  router: { push: (href: string) => void },
): void {
  if (/^https?:\/\//i.test(destination)) {
    window.location.assign(destination);
    return;
  }
  router.push(destination);
}
