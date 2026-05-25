"use client";

import { EARNINGS_ROWS, useAdminShell } from "@/components/admin/shell/internal/state";
import {
  mockTalentEarningsFromFixtures,
  type TalentEarnings,
} from "@/lib/talent/earnings-view";

export function useResolvedTalentEarnings(): TalentEarnings {
  const { bridgeTalentEarnings, bridgeTalentAgencies } = useAdminShell();

  if (bridgeTalentEarnings != null) {
    return bridgeTalentEarnings;
  }

  return mockTalentEarningsFromFixtures(EARNINGS_ROWS, bridgeTalentAgencies);
}
