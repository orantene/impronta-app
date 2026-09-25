"use client";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import {
  EMPTY_TALENT_EARNINGS_BY_CURRENCY,
  type TalentEarningsByCurrency,
} from "@/lib/talent/earnings-by-currency-types";

/**
 * Returns the full multi-currency earnings result from the bridge.
 * A4: no fixture fallback — empty / error only.
 */
export function useResolvedTalentEarningsByCurrency(): TalentEarningsByCurrency {
  const { bridgeTalentEarningsByCurrency } = useAdminShell();
  return bridgeTalentEarningsByCurrency ?? EMPTY_TALENT_EARNINGS_BY_CURRENCY;
}
