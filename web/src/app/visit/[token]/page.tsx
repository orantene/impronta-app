import type { Metadata } from "next";
import Link from "next/link";

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

import { VisitBill, VisitNotice } from "./visit-bill";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your table",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ token: string }> };

/**
 * The table QR's guest page: Q01 "Table QR landing" (`Q01_TableQR`) with the
 * bill of Q05 (`Q05_PayAtTable`) under it.
 *
 * Ordering and pay-my-share live on `/visit/[token]/menu` and
 * `/visit/[token]/share`. This landing stays the welcome + bill.
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
          <Link
            href={`/visit/${token}/menu`}
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-[12px] bg-admin-brand text-[15px] font-semibold text-admin-card"
          >
            {tr("dashboard.visit.startOrdering")}
          </Link>
          <p className="m-0 mt-3 text-[12px] leading-[1.45] text-admin-ink-muted">{tr("dashboard.visit.identityNote")}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-admin-surface-alt px-2.5 py-1 text-[11.5px] font-semibold text-admin-ink-muted">{tr("dashboard.visit.chipTableOrder")}</span>
            <span className="rounded-full bg-admin-surface-alt px-2.5 py-1 text-[11.5px] font-semibold text-admin-ink-muted">{tr("dashboard.visit.chipNotPayment")}</span>
          </div>
        </section>

        <VisitBill token={token} tr={tr} code={code} partySize={loaded.partySize} lines={loaded.lines} currency={loaded.currency} total={total} />
      </div>
    </main>
  );
}

