"use client";

import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { PlanChangeBreakdown, PlanChangePromo } from "@/lib/billing/plan-change-policy";

/**
 * TUL-831 · the proration line items shown BEFORE the customer confirms:
 * credit for unused time, the new plan's charge, any promo discount, the total
 * due today and the next renewal amount. Presentation only; every number comes
 * from the Stripe preview invoice (see plan-change-breakdown.ts).
 */
export function PlanChangeLines({
  breakdown,
  currency,
  planName,
  promo,
  lang,
}: {
  breakdown: PlanChangeBreakdown;
  currency: string;
  planName: string;
  promo: PlanChangePromo | null;
  lang: "en" | "es";
}) {
  const t = useT();
  const money = (cents: number) => formatDashboardMoneyCents(cents, currency);
  const rows: Array<{ key: string; label: string; value: string; strong?: boolean }> = [];
  if (breakdown.credit > 0) {
    rows.push({ key: "credit", label: t("dashboard.adminShared.planChange.lines.credit"), value: `-${money(breakdown.credit)}` });
  }
  if (breakdown.charge > 0) {
    rows.push({
      key: "charge",
      label: interpolate(t("dashboard.adminShared.planChange.lines.charge"), { plan: planName }),
      value: money(breakdown.charge),
    });
  }
  if (breakdown.discount > 0) {
    rows.push({
      key: "discount",
      label: interpolate(t("dashboard.adminShared.planChange.lines.discount"), { code: promo?.code ?? "" }),
      value: `-${money(breakdown.discount)}`,
    });
  }
  rows.push({ key: "total", label: t("dashboard.adminShared.planChange.lines.total"), value: money(breakdown.total), strong: true });
  if (breakdown.renewal !== null) {
    rows.push({ key: "renewal", label: t("dashboard.adminShared.planChange.lines.renewal"), value: money(breakdown.renewal) });
  }
  return (
    <dl className="flex flex-col gap-1 rounded-md border p-3 text-sm" data-testid="plan-change-lines" aria-label={t("dashboard.adminShared.planChange.lines.title")}>
      {promo ? (
        <p className="pb-1 text-xs text-muted-foreground" role="status">
          {interpolate(t("dashboard.adminShared.planChange.promo.applied"), { code: promo.code, label: promo.label[lang] })}
        </p>
      ) : null}
      {rows.map((r) => (
        <div key={r.key} className={r.strong ? "flex justify-between gap-3 border-t pt-1 font-semibold" : "flex justify-between gap-3"} data-line={r.key}>
          <dt>{r.label}</dt>
          <dd className="tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
