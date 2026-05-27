"use client";

import { EARNINGS_ROWS, useAdminShell } from "@/components/admin/shell/internal/state";
import {
  mockTalentEarningsFromFixtures,
  type TalentEarnings,
} from "@/lib/talent/earnings-view";
import { useActiveTabEarnings } from "./TalentActiveEarningsContext";

export function useResolvedTalentEarnings(): TalentEarnings {
  // Both hooks must be called unconditionally (Rules of Hooks).
  const activeTabEarnings = useActiveTabEarnings();
  const { bridgeTalentEarnings, bridgeTalentAgencies } = useAdminShell();

  // When inside a MoneyPage currency tab, the active-tab context provides
  // the per-currency bundle. Sub-components (MoneyKpiStrip etc.) receive the
  // correct data for the selected tab without needing props.
  if (activeTabEarnings != null) {
    return activeTabEarnings;
  }

  if (bridgeTalentEarnings != null) {
    return bridgeTalentEarnings;
  }

  return mockTalentEarningsFromFixtures(EARNINGS_ROWS, bridgeTalentAgencies);
}
