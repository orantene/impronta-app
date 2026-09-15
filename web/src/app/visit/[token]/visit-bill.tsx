import Link from "next/link";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";

type Tr = (key: string) => string;

export type VisitBillLine = { id: string; units: number; label: string; totalCents: number };

/**
 * The bill of Q05 (`Q05_PayAtTable`): rendered under the Q01 landing and, on
 * its own, at `/visit/[token]/bill`. One component so the two never drift.
 */
export function VisitBill({
  token,
  tr,
  code,
  partySize,
  lines,
  currency,
  total,
}: {
  token: string;
  tr: Tr;
  code: string;
  partySize: number | null;
  lines: readonly VisitBillLine[];
  currency: string;
  total: string;
}) {
  return (
    <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-4" data-visit-bill>
      <h2 className="m-0 text-[17px] font-semibold text-admin-ink">{tr("dashboard.visit.yourBill")}</h2>
      <p className="m-0 text-[13px] text-admin-ink-muted">
        {[code ? interpolate(tr("dashboard.visit.tableCode"), { code }) : null, partySize != null ? interpolate(tr("dashboard.visit.guests"), { n: partySize }) : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {lines.length === 0 ? (
        <p className="m-0 mt-3 text-[14px] text-admin-ink-muted">{tr("dashboard.visit.empty")}</p>
      ) : (
        <ul className="m-0 mt-2 list-none p-0">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center gap-3 border-b border-admin-border-soft py-2.5 text-[15px]">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-admin-surface-alt px-1.5 text-[13px] font-bold text-admin-ink">
                {line.units}
              </span>
              <span className="min-w-0 flex-1 font-semibold text-admin-ink">{line.label}</span>
              <span className="font-semibold tabular-nums text-admin-ink">{formatOrderMoney(line.totalCents, currency)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-baseline justify-between gap-3 py-2 text-[17px] font-bold text-admin-ink">
        <span>{tr("dashboard.visit.total")}</span>
        <span className="text-[24px] tabular-nums">{total}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link href={`/visit/${token}/share`} className="inline-flex h-12 items-center justify-center rounded-[12px] bg-admin-brand text-[15px] font-semibold text-admin-card">
          {interpolate(tr("dashboard.visit.payAll"), { amount: total })}
        </Link>
        <Link href={`/visit/${token}/share`} className="inline-flex h-12 items-center justify-center rounded-[12px] border-[1.5px] border-admin-brand bg-admin-card text-[15px] font-semibold text-admin-brand">
          {tr("dashboard.visit.payShare")}
        </Link>
      </div>
    </section>
  );
}

export function VisitNotice({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-admin-surface px-4 text-admin-ink">
      <section className="w-full max-w-[420px] rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-6 text-center">
        <h1 className="m-0 text-[20px] font-semibold text-admin-ink">{title}</h1>
        <p className="m-0 mt-2 text-[14px] text-admin-ink-muted">{body}</p>
      </section>
    </main>
  );
}
