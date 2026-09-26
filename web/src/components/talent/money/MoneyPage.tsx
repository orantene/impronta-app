"use client";

import { PageHeader } from "@/components/admin/shell/internal/talent/shared/page-chrome-1";
import { LEDGER_CONTRACT_CLOCK } from "@/lib/money/september-ledger-contract";

import { MoneySpine, MoneySpineHeaderActions } from "./MoneySpine";

/**
 * Talent Money — Stage C M2 visual spine (`mc_money` / outstanding / payouts /
 * payment detail). Driven by the M1 September ledger fixture + read model.
 * Live loaders replace the fixture in later PRs; no second September totals.
 */
export function MoneyPage() {
  return (
    <>
      <PageHeader
        title="Money"
        subtitle={`${LEDGER_CONTRACT_CLOCK.tenantFixture} · amounts in ${LEDGER_CONTRACT_CLOCK.currency}`}
        actions={<MoneySpineHeaderActions />}
      />
      <MoneySpine />
    </>
  );
}
