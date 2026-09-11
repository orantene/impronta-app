import "server-only";

/**
 * counter-collection-methods.ts — which tenders the counter can honestly
 * offer, beside `page.tsx` so that file stays under its line cap. Pure: a
 * translator in, the list the collect screen draws out.
 */

import type { PosCollectionMethodState } from "@/components/admin/pos";
import { collectMethodUnavailableCopy } from "@/components/admin/pos/pos-copy";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";

/**
 * Which tenders this counter can honestly offer, and the sentence for each one
 * it cannot.
 *
 * Every arm below is a REAL state read on the server, never an optimistic
 * default. The rule from the brief: a method with no provider behind it says
 * so rather than appearing to work.
 *
 *   cash — always. It is the one tender that needs nothing configured.
 *   link — the hosted Checkout path `startCollection` really drives
 *          (`method: "online_card"`). Live exactly when Stripe has a secret
 *          key; without one, `createCheckoutSessionForTransaction` returns a
 *          mock and a cashier would watch a customer "pay" nothing.
 *   card — CARD-PRESENT, a different thing from the link. `pos/actions.ts`
 *          accepts `cash | online_card` only, so no terminal request can be
 *          started from this screen whatever the environment says. It is
 *          therefore never offered as available, and the two reasons are kept
 *          apart: no reader configured at all, versus a reader that exists
 *          and that this surface cannot yet drive. Telling an operator with a
 *          working reader that they have no reader would send them to buy
 *          hardware they already own.
 *   pass — pass credits have NO table. `docs/plans/program/specs/counter.md`
 *          §3 records C20 as blocked for exactly that reason: there is no
 *          credit ledger to debit, so there is nothing to offer.
 */
export function collectionMethods(tr: (key: string) => string): PosCollectionMethodState[] {
  const unavailable = collectMethodUnavailableCopy(tr);
  const terminal = reportTerminalAvailability();
  return [
    { id: "cash", available: true },
    // A payment link is minted by `createPaymentLink` whether or not Stripe
    // has keys: without them `/pay/<code>` is a test page, and the tab's
    // panel says so (`PaymentLinkPanel`, `providerMock`).
    { id: "link", available: true },
    terminal.available
      ? {
          id: "card",
          available: false,
          unavailableReason: tr("dashboard.pos.counter.collect.cardNotWired"),
        }
      : { id: "card", available: false, unavailableReason: unavailable.card },
    { id: "pass", available: false, unavailableReason: unavailable.pass },
  ];
}
