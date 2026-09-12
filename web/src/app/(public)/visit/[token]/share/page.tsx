import { notFound } from "next/navigation";

import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { guestVisitBill } from "@/lib/visits/guest-order";
import { loadOpenVisitByToken } from "@/lib/visits/qr";

import { GuestShareClient } from "./share-client";

export const dynamic = "force-dynamic";

export default async function GuestVisitSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const [bill, visit] = await Promise.all([
    guestVisitBill(admin, { tenantId: host.tenantId, token }),
    loadOpenVisitByToken(admin, { tenantId: host.tenantId, publicToken: token }),
  ]);
  if (!bill.ok || !visit.ok) notFound();

  return (
    <GuestShareClient
      token={token}
      tableCode={visit.tableCode ?? ""}
      currency={bill.currency}
      totalCents={bill.totalCents}
      paidCents={bill.paidCents}
      owedCents={bill.owedCents}
      lines={visit.lines}
      copy={{
        title: tr("dashboard.visit.share.title"),
        tableLine: tr("dashboard.visit.share.tableLine"),
        myItems: tr("dashboard.visit.share.myItems"),
        splitEven: tr("dashboard.visit.share.splitEven"),
        anAmount: tr("dashboard.visit.share.anAmount"),
        payCard: tr("dashboard.visit.share.payCard"),
        alreadyPaid: tr("dashboard.visit.share.alreadyPaid"),
        leftover: tr("dashboard.visit.share.leftover"),
        back: tr("dashboard.visit.share.back"),
        empty: tr("dashboard.visit.empty"),
        total: tr("dashboard.visit.total"),
        paid: tr("dashboard.visit.share.paid"),
        owed: tr("dashboard.visit.share.owed"),
      }}
      tRefusal={(key) => tr(key)}
    />
  );
}
