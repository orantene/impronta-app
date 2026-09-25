"use client";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings } from "@/lib/talent/earnings-types";
import { useActiveTabEarnings } from "./TalentActiveEarningsContext";

/**
 * Resolve the active earnings bundle for Money sub-components.
 * A4: never fall back to EARNINGS_ROWS fixtures (defect #8). Empty bridge → empty totals.
 */
export function useResolvedTalentEarnings(): TalentEarnings {
  const activeTabEarnings = useActiveTabEarnings();
  const { bridgeTalentEarnings } = useAdminShell();

  if (activeTabEarnings != null) {
    return activeTabEarnings;
  }

  if (bridgeTalentEarnings != null) {
    return bridgeTalentEarnings;
  }

  return EMPTY_TALENT_EARNINGS;
}
