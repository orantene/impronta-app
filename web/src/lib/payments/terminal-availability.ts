/**
 * Card-present terminals. Stripe Checkout and cash are live collection paths.
 * Terminal code exists in stripe-terminal.ts; hardware and keys are separate.
 * Mercado Pago Point is a distinct adapter (`mercado-pago-collection.ts`).
 */

import type { TerminalAvailability } from "./collection";
import { reportStripeTerminalAvailability } from "./stripe-terminal";

export function reportTerminalAvailability(): TerminalAvailability {
  return reportStripeTerminalAvailability();
}

export { stripeTerminalSupported } from "./stripe-terminal";
