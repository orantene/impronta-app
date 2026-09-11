/**
 * Purchases & balances (W41's fourth tab): every order this client placed,
 * one row each, the OWED column by the orders desk's rule so it adds up to
 * the balances card above it. A cancelled or refunded order reads zero and
 * its status says why.
 */

import Link from "next/link";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { purchaseOwedCents, purchasesByDate, type ClientRecord } from "@/lib/customers/client-record";
import { Card, dayLabel, orderStatusLabel, shortId } from "../../projects/_shared";

type Tr = (key: string) => string;

export function PurchasesTable({
  record,
  locale,
  tenantSlug,
  tr,
}: {
  record: ClientRecord;
  locale: string;
  tenantSlug: string;
  tr: Tr;
}) {
  const none = tr("dashboard.clientRecord.none");
  if (record.purchases.length === 0) {
    return (
      <Card padded>
        <p className="m-0 text-[13px] text-admin-ink-muted">{tr("dashboard.clientRecord.purchasesNone")}</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-x-auto">
      <table className="w-full caption-bottom border-collapse text-[13px]">
        <caption className="sr-only">{tr("dashboard.clientRecord.purchasesCaption")}</caption>
        <thead className="[&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.05em] [&_th]:text-admin-ink-muted">
          <tr>
            <th scope="col">{tr("dashboard.clientRecord.colRecord")}</th>
            <th scope="col">{tr("dashboard.clientRecord.colStatus")}</th>
            <th scope="col">{tr("dashboard.clientRecord.colWhen")}</th>
            <th scope="col">{tr("dashboard.clientRecord.colTotal")}</th>
            <th scope="col">{tr("dashboard.clientRecord.colOutstanding")}</th>
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-admin-border-soft [&_td]:px-4 [&_td]:py-[11px]">
          {purchasesByDate(record).map((p) => (
            <tr key={p.orderId}>
              <td>
                <Link href={`/${tenantSlug}/admin/orders?q=${shortId(p.orderId)}`} className="font-semibold text-admin-ink no-underline hover:underline">
                  {shortId(p.orderId)}
                </Link>
                <span className="block text-[12px] text-admin-ink-muted">{interpolate(tr("dashboard.clientRecord.lines"), { count: p.lineCount })}</span>
              </td>
              <td className="text-admin-ink-muted">{orderStatusLabel(p.status, tr)}</td>
              <td className="text-admin-ink-muted">{dayLabel(p.createdAt, record.timeZone, locale, none, { weekday: true })}</td>
              <td className="tabular-nums text-admin-ink">{formatOrderMoney(p.totalCents, p.currency)}</td>
              <td className="tabular-nums text-admin-ink">{formatOrderMoney(purchaseOwedCents(p), p.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
