/**
 * FeeLines — presentational fee breakdown shown to clients (checkout, receipt,
 * Messages payment card). Pure: give it the lines, it renders them. Fee lines
 * are SHOWN to clients (owner decision), and fees are non-refundable.
 *
 * `t` is the dashboard translator (pass `useDashboardText().t`); the identity
 * default keeps the component testable without a locale provider.
 */

import { formatFeeMoney, PLATFORM_FEE_RATE, type FeeLines as FeeLinesData } from "@/lib/billing/fee-payer-setting";

export function FeeLines({
  lines,
  t = (s) => s,
  locale = "en",
  estimate = false,
}: {
  lines: FeeLinesData;
  t?: (s: string) => string;
  locale?: string;
  /** Prefix amounts with "about" when the numbers are a preview. */
  estimate?: boolean;
}) {
  const fmt = (m: number) => formatFeeMoney(m, lines.currency, locale);
  const rows: { key: string; label: string; value: string; strong?: boolean }[] = [
    { key: "service", label: t("Service"), value: fmt(lines.serviceMinor) },
    {
      key: "platform",
      label: `${t("Platform fee")} (${PLATFORM_FEE_RATE * 100}%)`,
      value: fmt(lines.platformFeeMinor),
    },
  ];
  if (lines.feePayer === "client" && lines.clientProcessingMinor > 0) {
    rows.push({ key: "processing", label: t("Card processing"), value: fmt(lines.clientProcessingMinor) });
  }
  rows.push({ key: "total", label: t("Total"), value: fmt(lines.clientTotalMinor), strong: true });

  return (
    <div data-testid="fee-lines" className="font-admin-body text-[13.5px] text-admin-ink">
      <dl className="m-0">
        {rows.map((r) => (
          <div
            key={r.key}
            data-fee-line={r.key}
            className={`flex justify-between gap-3 py-1 ${r.strong ? "border-t border-admin-border-soft pt-2 font-bold" : ""}`}
          >
            <dt>{r.label}</dt>
            <dd className="m-0 whitespace-nowrap">
              {estimate ? `${t("about")} ` : ""}
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-admin-ink-muted">{t("Fees are non-refundable.")}</p>
    </div>
  );
}
