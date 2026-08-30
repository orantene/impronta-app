/** Guest support must refuse, not degrade, when the cookie is unsigned. */
export function guestSupportMayServe(signingEnabled: boolean): boolean {
  return signingEnabled === true;
}
