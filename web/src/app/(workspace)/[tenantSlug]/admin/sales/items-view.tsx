/**
 * items-view.tsx — the "By item" table on the Sales board: one row per
 * offering and currency, straight from the stored order-line amounts
 * (`loadSalesByItem`). Display only; token classes only.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import type { SalesItemRow } from "@/lib/sales/by-item";

const TH = "px-[12px] py-[10px] text-left text-admin-11 font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted first:pl-[18px] last:pr-[18px]";
const TD = "px-[12px] py-[14px] align-middle text-admin-12h leading-[1.2] first:pl-[18px] last:pr-[18px]";

export function SalesItemsTable({ rows, t }: { rows: readonly SalesItemRow[]; t: (key: string) => string }) {
  return (
    <div data-testid="sales-items" className="overflow-x-auto rounded-[14px] border border-admin-border bg-admin-card">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>{t("colItem")}</th>
            <th className={`${TH} text-right`}>{t("colQuantity")}</th>
            <th className={`${TH} text-right`}>{t("colGross")}</th>
            <th className={`${TH} text-right`}>{t("colRefunded")}</th>
            <th className={`${TH} text-right`}>{t("colNet")}</th>
            <th className={`${TH} text-right`}>{t("colOrders")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-sales-item-row className="border-t border-admin-border-soft">
              <td className={`${TD} font-semibold text-admin-ink`}>
                {r.title || t("itemUnnamed")}
                {r.offeringId === null ? <span className="ml-[6px] font-normal text-admin-ink-muted">{t("itemCustom")}</span> : null}
              </td>
              <td className={`${TD} text-right tabular-nums`}>{r.quantity}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatOrderMoney(r.grossCents, r.currency)}</td>
              <td className={`${TD} text-right tabular-nums text-admin-ink-muted`}>{r.refundedCents > 0 ? formatOrderMoney(r.refundedCents, r.currency) : "—"}</td>
              <td className={`${TD} text-right font-semibold tabular-nums text-admin-ink`}>{formatOrderMoney(r.netCents, r.currency)}</td>
              <td className={`${TD} text-right tabular-nums text-admin-ink-muted`}>{r.orderCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
