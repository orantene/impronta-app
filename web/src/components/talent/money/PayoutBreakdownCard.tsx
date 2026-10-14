"use client";

/**
 * "What you get" card on the talent Money page (TUL-1061): gross, Tulala
 * commission, net payout and when the money arrives. Figures come from the
 * month's card payments; copy is ES/EN through the dashboard translator.
 */

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { payoutArrival, talentPayoutBreakdown } from "@/lib/money/talent-payout-breakdown";

export function PayoutBreakdownCard({
  grossCents,
  netCents,
  currency,
}: {
  grossCents: number;
  netCents: number;
  currency: string;
}) {
  const { t, locale } = useDashboardText();
  const b = talentPayoutBreakdown({ grossCents, netCents });
  if (!b || b.grossCents === 0) return null;
  const arrival = payoutArrival({ currency });
  const money = (c: number) => formatDashboardMoneyCents(c, currency, locale);
  const rows: { key: string; label: string; value: string; strong?: boolean }[] = [
    { key: "gross", label: t("Your price"), value: money(b.grossCents) },
    {
      key: "commission",
      label: t("Tulala commission"),
      value: b.tulalaCommissionCents > 0 ? `- ${money(b.tulalaCommissionCents)}` : money(0),
    },
  ];
  if (b.otherDeductionsCents > 0) {
    rows.push({ key: "other", label: t("Workspace commission and card fees"), value: `- ${money(b.otherDeductionsCents)}` });
  }
  rows.push({ key: "net", label: t("Your payout"), value: money(b.netCents), strong: true });
  return (
    <section data-testid="payout-breakdown" className="rounded-[12px] border border-admin-border-soft bg-white p-4">
      <h3 className="font-admin-body text-[14px] font-semibold text-admin-ink">{t("What you get")}</h3>
      <dl className="m-0 mt-2 font-admin-body text-[13.5px] text-admin-ink">
        {rows.map((r) => (
          <div
            key={r.key}
            data-payout-line={r.key}
            className={`flex justify-between gap-3 py-1 ${r.strong ? "border-t border-admin-border-soft pt-2 font-bold" : ""}`}
          >
            <dt>{r.label}</dt>
            <dd className="m-0 whitespace-nowrap tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p data-testid="payout-arrival" className="mt-2 font-admin-body text-[12.5px] text-admin-ink-muted">
        {t("Payouts reach your bank about {n} business days after Tulala sends them.").replace("{n}", String(arrival.businessDays))}{" "}
        {t("If your payout account is a recipient account, funds become available 24 hours later.")}
      </p>
      <p className="mt-1 font-admin-body text-[12px] text-admin-ink-muted">
        {t("Your client pays Tulala's service fee on top of your price. It is never taken from you.")}
      </p>
    </section>
  );
}
