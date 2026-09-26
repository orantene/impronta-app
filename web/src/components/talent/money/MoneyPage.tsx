"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/shell/internal/talent/shared/page-chrome-1";
import { LEDGER_CONTRACT_CLOCK } from "@/lib/money/september-ledger-contract";

import { MoneyBreakdownPanel } from "./MoneyBreakdownPanel";
import { MoneySpine, MoneySpineHeaderActions } from "./MoneySpine";

/**
 * Talent Money — Stage C visual spine (M2–M5). Driven by the M1 September
 * ledger fixture + read model. M5 opens `mc_breakdown` in-page (not a second
 * September totals source).
 */
export function MoneyPage() {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  if (breakdownOpen) {
    return <MoneyBreakdownPanel onBack={() => setBreakdownOpen(false)} />;
  }

  return (
    <>
      <PageHeader
        title="Money"
        subtitle={`${LEDGER_CONTRACT_CLOCK.tenantFixture} · amounts in ${LEDGER_CONTRACT_CLOCK.currency}`}
        actions={<MoneySpineHeaderActions />}
      />
      <MoneySpine onViewBreakdown={() => setBreakdownOpen(true)} />
    </>
  );
}
