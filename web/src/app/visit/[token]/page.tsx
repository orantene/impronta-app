import type { Metadata } from "next";

import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { logServerError } from "@/lib/server/safe-error";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import { tenantTimezone } from "@/lib/spaces/venues";
import { loadOpenVisitByToken } from "@/lib/visits/qr";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your table",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ token: string }> };

/**
 * The table QR's guest page: Q01 "Table QR landing" (`Q01_TableQR`) with the
 * bill of Q05 (`Q05_PayAtTable`) under it, read-only.
 *
 * WHAT IS REAL. The code on the tent resolves to the CURRENT visit (never
 * the table), so the page greets the party by its table, says when the
 * visit started and for how many, and lists what is on the check with the
 * total in the check's own currency. Ordering from the phone and paying at
 * the table have no engine yet (D-POS-49): `Start ordering`, `Pay all` and
 * `Pay my share` are drawn disabled over one sentence each, never a button
 * that does nothing. A closed visit says so (the link stops working when
 * the table is reset).
 */
export default async function GuestVisitPage({ params }: Params) {
  const { token } = await params;
  const host = await getPublicHostContext();
  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);

  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) {
    return <VisitNotice title={tr("dashboard.visit.inactive")} body={tr("dashboard.visit.askStaff")} />;
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return <VisitNotice title={tr("dashboard.visit.inactive")} body={tr("dashboard.visit.askStaff")} />;
  }

  const loaded = await loadOpenVisitByToken(admin, { tenantId: host.tenantId, publicToken: token });
  if (!loaded.ok) {
    const title = loaded.reason === "ended" ? tr("dashboard.visit.ended") : tr("dashboard.visit.inactive");
    return <VisitNotice title={title} body={tr("dashboard.visit.askStaff")} />;
  }

  // The venue's name over the page and its clock for the visit's start.
  const [venueRead, timeZone] = await Promise.all([
    admin.from("agencies").select("display_name").eq("id", host.tenantId).maybeSingle(),
    tenantTimezone(host.tenantId),
  ]);
  if (venueRead.error) logServerError("visit.page.venue", venueRead.error);
  const venueName = (venueRead.data as { display_name?: string | null } | null)?.display_name ?? "";

  const code = loaded.tableCode ?? "";
  const started = loaded.openedAtIso ? venueHhmm(loaded.openedAtIso, timeZone, locale) : null;
  const visitLine = [
    started ? interpolate(tr("dashboard.visit.startedAt"), { time: started }) : null,
    loaded.partySize != null ? interpolate(tr("dashboard.visit.guests"), { n: loaded.partySize }) : null,
  ]
    .filter((x): x is string => Boolean(x))
    .join(" · ");
  const total = formatOrderMoney(loaded.totalCents, loaded.currency);

  return (
    <main className="min-h-screen bg-admin-surface px-4 pb-10 pt-5 text-admin-ink">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3.5">
        <header>
          <p className="m-0 text-[15px] font-semibold text-admin-ink">{venueName}</p>
          <p className="m-0 text-[13px] text-admin-ink-muted">{interpolate(tr("dashboard.visit.tableLine"), { code })}</p>
        </header>

        <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-4">
          <h1 className="m-0 text-[17px] font-semibold text-admin-ink" style={{ fontSize: "17px" }}>
            {interpolate(tr("dashboard.visit.welcome"), { code })}
          </h1>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.45] text-admin-ink-muted">{tr("dashboard.visit.intro")}</p>
          <dl className="m-0 mt-3 border-t border-admin-border-soft text-[13.5px]">
            <div className="flex items-baseline justify-between gap-3 border-b border-admin-border-soft py-2">
              <dt className="text-admin-ink-muted">{tr("dashboard.visit.yourVisit")}</dt>
              <dd className="m-0 font-semibold text-admin-ink">{visitLine || tr("dashboard.visit.title")}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-admin-ink-muted">{tr("dashboard.visit.server")}</dt>
              <dd className="m-0 font-semibold text-admin-ink">{tr("dashboard.visit.serverNone")}</dd>
            </div>
          </dl>
          <button
            type="button"
            disabled
            title={tr("dashboard.visit.orderingReason")}
            aria-describedby="visit-ordering-reason"
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-[12px] bg-admin-brand text-[15px] font-semibold text-admin-card disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tr("dashboard.visit.startOrdering")}
          </button>
          <p id="visit-ordering-reason" className="m-0 mt-2 text-[12.5px] text-admin-ink-muted">
            {tr("dashboard.visit.orderingReason")}
          </p>
          <p className="m-0 mt-3 text-[12px] leading-[1.45] text-admin-ink-muted">{tr("dashboard.visit.identityNote")}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-admin-surface-alt px-2.5 py-1 text-[11.5px] font-semibold text-admin-ink-muted">{tr("dashboard.visit.chipTableOrder")}</span>
            <span className="rounded-full bg-admin-surface-alt px-2.5 py-1 text-[11.5px] font-semibold text-admin-ink-muted">{tr("dashboard.visit.chipNotPayment")}</span>
          </div>
        </section>

        <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-4" data-visit-bill>
          <h2 className="m-0 text-[17px] font-semibold text-admin-ink">{tr("dashboard.visit.yourBill")}</h2>
          <p className="m-0 text-[13px] text-admin-ink-muted">
            {[code ? interpolate(tr("dashboard.visit.tableCode"), { code }) : null, loaded.partySize != null ? interpolate(tr("dashboard.visit.guests"), { n: loaded.partySize }) : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {loaded.lines.length === 0 ? (
            <p className="m-0 mt-3 text-[14px] text-admin-ink-muted">{tr("dashboard.visit.empty")}</p>
          ) : (
            <ul className="m-0 mt-2 list-none p-0">
              {loaded.lines.map((line) => (
                <li key={line.id} className="flex items-center gap-3 border-b border-admin-border-soft py-2.5 text-[15px]">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-admin-surface-alt px-1.5 text-[13px] font-bold text-admin-ink">
                    {line.units}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold text-admin-ink">{line.label}</span>
                  <span className="font-semibold tabular-nums text-admin-ink">{formatOrderMoney(line.totalCents, loaded.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-baseline justify-between gap-3 py-2 text-[17px] font-bold text-admin-ink">
            <span>{tr("dashboard.visit.total")}</span>
            <span className="text-[24px] tabular-nums">{total}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled title={tr("dashboard.visit.payReason")} className="inline-flex h-12 items-center justify-center rounded-[12px] bg-admin-brand text-[15px] font-semibold text-admin-card disabled:cursor-not-allowed disabled:opacity-40">
              {interpolate(tr("dashboard.visit.payAll"), { amount: total })}
            </button>
            <button type="button" disabled title={tr("dashboard.visit.payReason")} className="inline-flex h-12 items-center justify-center rounded-[12px] border-[1.5px] border-admin-brand bg-admin-card text-[15px] font-semibold text-admin-brand disabled:cursor-not-allowed disabled:opacity-40">
              {tr("dashboard.visit.payShare")}
            </button>
          </div>
          <p className="m-0 mt-2 text-[12px] leading-[1.45] text-admin-ink-muted">{tr("dashboard.visit.payReason")}</p>
        </section>
      </div>
    </main>
  );
}

function VisitNotice({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-admin-surface px-4 text-admin-ink">
      <section className="w-full max-w-[420px] rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-6 text-center">
        <h1 className="m-0 text-[20px] font-semibold text-admin-ink">{title}</h1>
        <p className="m-0 mt-2 text-[14px] text-admin-ink-muted">{body}</p>
      </section>
    </main>
  );
}
