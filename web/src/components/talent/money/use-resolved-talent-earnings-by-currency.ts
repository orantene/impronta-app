"use client";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import {
  EMPTY_TALENT_EARNINGS_BY_CURRENCY,
  type TalentEarningsByCurrency,
} from "@/lib/talent/earnings-by-currency";

/**
 * Returns the full multi-currency earnings result from the bridge.
 * Falls back to an empty `TalentEarningsByCurrency` in mock mode
 * (mock mode = no bridge, Money page shows EARNINGS_ROWS fixtures via
 * `useResolvedTalentEarnings` inside sub-components instead).
 */
export function useResolvedTalentEarningsByCurrency(): TalentEarningsByCurrency {
  const { bridgeTalentEarningsByCurrency } = useAdminShell();
  return bridgeTalentEarningsByCurrency ?? EMPTY_TALENT_EARNINGS_BY_CURRENCY;
}
