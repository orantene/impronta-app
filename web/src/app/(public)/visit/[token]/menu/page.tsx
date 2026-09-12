import { notFound } from "next/navigation";

import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { guestVisitMenu } from "@/lib/visits/guest-order";
import { loadOpenVisitByToken } from "@/lib/visits/qr";

import { GuestMenuClient } from "./menu-client";

export const dynamic = "force-dynamic";

export default async function GuestVisitMenuPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const [menu, visit] = await Promise.all([
    guestVisitMenu(admin, { tenantId: host.tenantId, token }),
    loadOpenVisitByToken(admin, { tenantId: host.tenantId, publicToken: token }),
  ]);
  if (!menu.ok || !visit.ok) notFound();

  const lineIds = visit.lines.map((line) => line.id);
  let offers: Array<{ lineId: string; offeringId: string; label: string }> = [];
  if (lineIds.length > 0) {
    const offered = await admin
      .from("order_line_substitute_offers")
      .select("line_id, offered_offering_id, status")
      .eq("tenant_id", host.tenantId)
      .in("line_id", lineIds)
      .eq("status", "offered");
    const rows = (offered.data ?? []) as Array<{ line_id: string; offered_offering_id: string }>;
    const offeringIds = [...new Set(rows.map((row) => row.offered_offering_id))];
    const titles = new Map<string, string>();
    if (offeringIds.length > 0) {
      const offs = await admin.from("talent_offerings").select("id, title").eq("tenant_id", host.tenantId).in("id", offeringIds);
      for (const row of (offs.data ?? []) as Array<{ id: string; title: string }>) titles.set(row.id, row.title);
    }
    offers = rows.map((row) => ({
      lineId: row.line_id,
      offeringId: row.offered_offering_id,
      label: titles.get(row.offered_offering_id) ?? row.offered_offering_id,
    }));
  }

  return (
    <GuestMenuClient
      token={token}
      tableCode={visit.tableCode ?? ""}
      holderName={null}
      currency={visit.currency}
      items={menu.items}
      offers={offers}
      copy={{
        title: tr("dashboard.visit.menu.title"),
        tableLine: tr("dashboard.visit.menu.tableLine"),
        viewOrder: tr("dashboard.visit.menu.viewOrder"),
        submit: tr("dashboard.visit.menu.submit"),
        submitted: tr("dashboard.visit.menu.submitted"),
        orderMore: tr("dashboard.visit.menu.orderMore"),
        askBill: tr("dashboard.visit.menu.askBill"),
        empty: tr("dashboard.visit.menu.empty"),
        add: tr("dashboard.visit.menu.add"),
        offerTitle: tr("dashboard.visit.menu.offerTitle"),
        acceptOffer: tr("dashboard.visit.menu.acceptOffer"),
        back: tr("dashboard.visit.menu.back"),
      }}
      tRefusal={(key) => tr(key)}
    />
  );
}
