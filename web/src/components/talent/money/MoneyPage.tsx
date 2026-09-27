"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/shell/internal/talent/shared/page-chrome-1";
import { LEDGER_CONTRACT_CLOCK } from "@/lib/money/september-ledger-contract";

import { MoneyBreakdownPanel } from "./MoneyBreakdownPanel";
import { MoneySpine, MoneySpineHeaderActions } from "./MoneySpine";
import { MoneyEarningsPage } from "./MoneyEarningsPage";

/**
 * The spine below still reads the September ledger FIXTURE (one demo business's
 * figures). Until it reads each talent's own ledger it is opt-in for demo/QA
 * builds only; real talents get MoneyEarningsPage (their actual earnings).
 */
const SPINE_FIXTURE_ENABLED = process.env.NEXT_PUBLIC_TALENT_MONEY_SPINE_FIXTURE === "1";

/**
 * Talent Money — Stage C visual spine (M2–M5). Driven by the M1 September
 * ledger fixture + read model. M5 opens `mc_breakdown` in-page (not a second
 * September totals source).
 */
export function MoneyPage() {
  if (!SPINE_FIXTURE_ENABLED) return <MoneyEarningsPage />;
  return <MoneySpineFixturePage />;
}

function MoneySpineFixturePage() {
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
