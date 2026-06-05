"use client";

/**
 * Thin React context used by MoneyPage to scope a per-currency
 * `TalentEarnings` bundle to the currently active tab.
 *
 * Sub-components (MoneyKpiStrip, MoneyAgencyCards, EarningsLedger) call
 * `useResolvedTalentEarnings()` which checks this context first, then falls
 * back to the bridge value. This lets the tabs architecture work without
 * adding props to every sub-component or touching the main shell context.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { TalentEarnings } from "@/lib/talent/earnings-types";

export const TalentActiveEarningsContext = createContext<TalentEarnings | null>(null);

export function TalentActiveEarningsProvider({
  earnings,
  children,
}: {
  earnings: TalentEarnings;
  children: ReactNode;
}) {
  return (
    <TalentActiveEarningsContext.Provider value={earnings}>
      {children}
    </TalentActiveEarningsContext.Provider>
  );
}

/** Hook, returns the active-tab earnings bundle, or null if outside a tab context. */
export function useActiveTabEarnings(): TalentEarnings | null {
  return useContext(TalentActiveEarningsContext);
}
