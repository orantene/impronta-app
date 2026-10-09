import { GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX } from "./mini-chat-styles";

/** Height of the round guest-chat launcher (TalentProfileChatLauncher). */
export const GUEST_CHAT_LAUNCHER_HEIGHT_PX = 52;
/** Breathing room between page content and the launcher. */
export const GUEST_CHAT_LAUNCHER_GAP_PX = 12;

/**
 * AUD-037 / AUD-025 family: the fixed launcher sits over the page bottom on a
 * phone and can cover the last row's CTA. Reserve launcher height + offset +
 * gap at the bottom of the page so the last content can scroll clear of it.
 *
 * TUL-516: this sets `--floating-launcher-clearance` only. Body padding is
 * `max(bar, launcher, consent)` in `floating-chrome-stack` so the sticky bar
 * never loses to a smaller fixed launcher pad (F3/F5).
 */
export const GUEST_CHAT_LAUNCHER_CLEARANCE_PX =
  GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX + GUEST_CHAT_LAUNCHER_HEIGHT_PX + GUEST_CHAT_LAUNCHER_GAP_PX;

export const GUEST_CHAT_LAUNCHER_CLEARANCE_CSS = `@media (max-width: 480px){body:has([data-guest-chat-launcher]){--floating-launcher-clearance:calc(${GUEST_CHAT_LAUNCHER_CLEARANCE_PX}px + env(safe-area-inset-bottom,0px));}}`;
