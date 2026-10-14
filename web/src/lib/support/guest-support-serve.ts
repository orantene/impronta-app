/** Guest support must refuse, not degrade, when the cookie is unsigned. */
export function guestSupportMayServe(signingEnabled: boolean): boolean {
  return signingEnabled === true;
}

/**
 * Whether the marketing "ask a question" entry will actually open a panel.
 * The launcher always mounts (only the floating "?" is gated by the FAB flag,
 * see #3537), so only guest support availability matters. The /support hero CTA
 * hides when this is false (a button that fires an event nobody listens to is dead).
 */
export function marketingAskMayServe(signingEnabled: boolean): boolean {
  return guestSupportMayServe(signingEnabled);
}
