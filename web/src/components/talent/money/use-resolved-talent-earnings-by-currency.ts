"use client";

import { useAdminShell } from "@/components/admin/shell/internal/state";
// Client-safe types module (no `server-only` marker). The server loader
// lives in `earnings-by-currency.ts` and is invoked from layout.tsx only.
import {
  EMPTY_TALENT_EARNINGS_BY_CURRENCY,
  type TalentEarningsByCurrency,
} from "@/lib/talent/earnings-by-currency-types";

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
