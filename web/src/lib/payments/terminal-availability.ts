/**
 * Card-present terminals. Existing Stripe support is online collection only.
 * The pilot is online card + cash recorded as a method. Point lands later.
 */

import type { TerminalAvailability } from "./collection";

export function reportTerminalAvailability(): TerminalAvailability {
  return { available: false, reason: "point_not_landed" };
}

export function stripeTerminalSupported(): boolean {
  return false;
}
