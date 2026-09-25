"use client";

import type { ReactNode } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { PrimaryButton } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { PageHeader } from "@/components/admin/shell/internal/talent/shared/page-chrome-1";
import { AdminFinancialsCurrencyTabs } from "@/components/admin/applications/AdminFinancialsCurrencyTabs";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings } from "@/lib/talent/earnings-types";

import { CollectMethodsPanel } from "./CollectMethodsPanel";
import { EarningsLedger } from "./EarningsLedger";
import { MoneyAgencyCards } from "./MoneyAgencyCards";
import { MoneyKpiStrip } from "./MoneyKpiStrip";
import { TalentActiveEarningsProvider } from "./TalentActiveEarningsContext";
import { useResolvedTalentEarningsByCurrency } from "./use-resolved-talent-earnings-by-currency";

function MoneyPane({ earnings }: { earnings: TalentEarnings }) {
  return (
    <TalentActiveEarningsProvider earnings={earnings}>
      <MoneyKpiStrip />
      <div style={{ height: 24 }} />
      <MoneyAgencyCards />
      <div style={{ height: 24 }} />
      <EarningsLedger />
    </TalentActiveEarningsProvider>
  );
}

function MoneyLoadError({ message }: { message: string }) {
  return (
    <section
      style={{
        padding: "20px 18px",
        borderRadius: 12,
        border: `1px solid rgba(176,48,58,0.22)`,
        background: COLORS.criticalSoft,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.criticalDeep }}>
        Could not load Money
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.criticalDeep, opacity: 0.9 }}>
        {message} Refresh and try again. We are not showing $0 or demo numbers.
      </p>
    </section>
  );
}

export function MoneyPage() {
  const { openDrawer } = useAdminShell();
  const earningsByCurrency = useResolvedTalentEarningsByCurrency();

  const { byCurrency, currencies, defaultCurrency, loadError } = earningsByCurrency;
  const isMultiCurrency = byCurrency.length > 1;
  const hasBridgeData = byCurrency.length > 0;

  let earningsContent: ReactNode;

  if (loadError) {
    earningsContent = <MoneyLoadError message={loadError} />;
  } else if (isMultiCurrency) {
    const tabsChildren: Record<string, ReactNode> = {};
    for (const bundle of byCurrency) {
      tabsChildren[bundle.totals.currency] = <MoneyPane earnings={bundle} />;
    }
    earningsContent = (
      <AdminFinancialsCurrencyTabs
        currencies={currencies}
        defaultCurrency={defaultCurrency}
      >
        {tabsChildren}
      </AdminFinancialsCurrencyTabs>
    );
  } else if (hasBridgeData) {
    earningsContent = <MoneyPane earnings={byCurrency[0]!} />;
  } else {
    const empty: TalentEarnings = {
      ...EMPTY_TALENT_EARNINGS,
      totals: {
        ...EMPTY_TALENT_EARNINGS.totals,
        currency: (defaultCurrency || "MXN").toUpperCase(),
      },
    };
    earningsContent = <MoneyPane earnings={empty} />;
  }

  return (
    <>
      <PageHeader
        title="Money"
        subtitle="Your earnings, agency relationships and payout history, one place, every workspace."
        actions={
          <>
            <PrimaryButton size="sm" onClick={() => openDrawer("talent-payouts")}>
              Payout settings
            </PrimaryButton>
          </>
        }
      />

      {earningsContent}
      <CollectMethodsPanel />

      <section
        style={{
          marginTop: 24,
          padding: "14px 16px",
          background: `${COLORS.criticalSoft}`,
          border: `1px solid rgba(176,48,58,0.18)`,
          borderRadius: 12,
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: COLORS.criticalDeep,
                marginBottom: 4,
              }}
            >
              Leave an agency
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.criticalDeep, opacity: 0.85, lineHeight: 1.5 }}>
              Ending representation is permanent and cancels any active holds or bookings assigned through that agency.
            </div>
          </div>
          <button
            type="button"
            onClick={() => openDrawer("talent-leave-agency")}
            style={{
              flexShrink: 0,
              background: "#fff",
              border: `1px solid rgba(176,48,58,0.30)`,
              borderRadius: 8,
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.criticalDeep,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
          >
            Manage representation →
          </button>
        </div>
      </section>
    </>
  );
}
