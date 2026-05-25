"use client";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import {
  TalentDashboardPage,
  TalentPageHeader,
} from "@/components/talent/talent-dashboard-primitives";
import { Coins } from "lucide-react";
import { EarningsLedger } from "./EarningsLedger";
import { MoneyAgencyCards } from "./MoneyAgencyCards";
import { MoneyKpiStrip } from "./MoneyKpiStrip";

export function MoneyPage() {
  const { openDrawer } = useAdminShell();

  return (
    <TalentDashboardPage>
      <TalentPageHeader
        icon={Coins}
        title="Money"
        description="Your earnings, agency relationships, and payout history in one place."
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
              onClick={() => openDrawer("talent-add-event", { mode: "work" })}
            >
              + Log work
            </button>
            <button
              type="button"
              className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background"
              onClick={() => openDrawer("talent-payouts")}
            >
              Payout settings
            </button>
          </div>
        }
      />

      <MoneyKpiStrip />
      <MoneyAgencyCards />
      <EarningsLedger />

      <section className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
        <h3 className="text-sm font-semibold text-rose-800">Leave an agency</h3>
        <p className="mt-1 text-sm text-rose-900/80">
          Ending representation is permanent and will cancel any active holds or bookings assigned
          through that agency.
        </p>
        <button
          type="button"
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50"
          onClick={() => openDrawer("talent-leave-agency")}
        >
          Manage representation →
        </button>
      </section>
    </TalentDashboardPage>
  );
}
