/** Guest support must refuse, not degrade, when the cookie is unsigned. */
export function guestSupportMayServe(signingEnabled: boolean): boolean {
  return signingEnabled === true;
}

/**
 * Whether the marketing "ask a question" entry will actually open a panel:
 * the launcher mount renders only when the FAB flag is on AND guest support may
 * serve. The /support hero CTA must hide when this is false (a button that
 * fires an event nobody listens to is a dead button).
 */
export function marketingAskMayServe(fabEnabled: boolean, signingEnabled: boolean): boolean {
  return fabEnabled === true && guestSupportMayServe(signingEnabled);
}
