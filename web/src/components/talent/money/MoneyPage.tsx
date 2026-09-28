"use client";

import { useMemo, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PageHeader } from "@/components/admin/shell/internal/talent/shared/page-chrome-1";
import type { MoneyAction } from "@/lib/money/money-actions";
import { buildMoneySpineView } from "@/lib/money/money-spine-view";
import { LEDGER_CONTRACT_CLOCK } from "@/lib/money/september-ledger-contract";

import { MoneyBreakdownPanel } from "./MoneyBreakdownPanel";
import { MoneyCorrectRecordSheet } from "./MoneyCorrectRecordSheet";
import { MoneyHomePage } from "./MoneyHomePage";
import { MoneyRecordPaymentSheet } from "./MoneyRecordPaymentSheet";
import { MoneyRefundSheet } from "./MoneyRefundSheet";
import { MoneyRequestPaymentSheet } from "./MoneyRequestPaymentSheet";
import { MoneySpine, MoneySpineHeaderActions } from "./MoneySpine";

/**
 * The spine below still reads the September ledger FIXTURE (one demo business's
 * figures). Until it reads each talent's own ledger it is opt-in for demo/QA
 * builds only; real talents get MoneyHomePage (mockup layout on their own data).
 */
const SPINE_FIXTURE_ENABLED = process.env.NEXT_PUBLIC_TALENT_MONEY_SPINE_FIXTURE === "1";

/**
 * Talent Money — Stage C visual spine (M2–M5) + Stage D entry sheets (AUD-018).
 * Driven by the M1 September ledger fixture + read model when the fixture flag
 * is on; otherwise the real per-talent earnings page.
 */
export function MoneyPage() {
  if (!SPINE_FIXTURE_ENABLED) return <MoneyHomePage />;
  return <MoneySpineFixturePage />;
}

function MoneySpineFixturePage() {
  const copy = useDashboardText();
  const view = useMemo(() => buildMoneySpineView(), []);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [action, setAction] = useState<MoneyAction | null>(null);

  if (breakdownOpen) {
    return <MoneyBreakdownPanel onBack={() => setBreakdownOpen(false)} />;
  }

  return (
    <>
      <PageHeader
        title={copy.t("Money")}
        subtitle={`${LEDGER_CONTRACT_CLOCK.tenantFixture} · ${copy.t("amounts in")} ${LEDGER_CONTRACT_CLOCK.currency}`}
        actions={
          <MoneySpineHeaderActions
            onRecord={() => setAction({ kind: "record" })}
            onRequest={() => setAction({ kind: "request" })}
          />
        }
      />
      <MoneySpine
        onViewBreakdown={() => setBreakdownOpen(true)}
        onOpenAction={setAction}
      />

      {action?.kind === "request" ? (
        <MoneyRequestPaymentSheet
          outstanding={view.outstanding}
          currency={view.currency}
          prefill={action.prefill}
          onClose={() => setAction(null)}
        />
      ) : null}
      {action?.kind === "record" ? (
        <MoneyRecordPaymentSheet
          outstanding={view.outstanding}
          currency={view.currency}
          prefill={action.prefill}
          onClose={() => setAction(null)}
        />
      ) : null}
      {action?.kind === "refund" ? (
        <MoneyRefundSheet detail={action.detail} onClose={() => setAction(null)} />
      ) : null}
      {action?.kind === "correct" ? (
        <MoneyCorrectRecordSheet
          payment={action.payment}
          onClose={() => setAction(null)}
        />
      ) : null}
    </>
  );
}
