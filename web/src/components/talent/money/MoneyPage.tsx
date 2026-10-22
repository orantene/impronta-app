"use client";

import { MoneyHomePage } from "./MoneyHomePage";

/**
 * Talent Money: the real per-talent earnings page, always.
 *
 * The September ledger FIXTURE spine (MoneySpine and its panels, drawers and
 * read model, ~100 KB of source) used to ride in this module behind
 * NEXT_PUBLIC_TALENT_MONEY_SPINE_FIXTURE=1. It is no longer imported here, so
 * it is out of the admin bundle (TUL-1178). Do not re-import it from client
 * code; src/lib/money/money-spine.static.test.ts pins that.
 */
export function MoneyPage() {
  return <MoneyHomePage />;
}
