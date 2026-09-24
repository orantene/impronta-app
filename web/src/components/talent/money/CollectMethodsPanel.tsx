"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

export function CollectMethodsPanel() {
  const copy = useDashboardText();
  return (
    <section className="mt-6 rounded-2xl border border-admin-border-soft bg-white p-4 font-admin-body">
      <h2 className="text-[16px] font-semibold text-admin-ink">{copy.t("How you collect")}</h2>
      <ul className="mt-3 space-y-2 text-[13px] text-admin-ink">
        <li>{copy.t("Card link")} · {copy.t("Collected")}</li>
        <li>{copy.t("Cash")} · {copy.t("Collected")}</li>
        <li>{copy.t("Transfer")} · {copy.t("Collected")}</li>
        <li>{copy.t("Tap to pay")} · {copy.t("not available")}</li>
      </ul>
      <p className="mt-3 text-[13px] text-admin-ink-muted">
        {copy.t("Cash and transfers are collected, never payouts. One retry replaces the old link.")}
      </p>
    </section>
  );
}
