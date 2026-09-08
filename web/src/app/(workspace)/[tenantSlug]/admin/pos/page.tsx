import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { logServerError } from "@/lib/server/safe-error";
import { listOpenPosSales, loadPosSale } from "@/lib/pos/draft";
import { currentShift } from "@/lib/pos/shift";
import { PosClient } from "./pos-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type Search = Promise<{ order?: string }>;

export default async function PosPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: Search;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const q = await searchParams;
  const orderId = typeof q.order === "string" ? q.order : null;
  const now = new Date().toISOString();
  const [open, saleLoad, catalog, shiftLoad, upcoming] = await Promise.all([
    listOpenPosSales(admin, scope.tenantId),
    orderId && /^[0-9a-f-]{36}$/i.test(orderId)
      ? loadPosSale(admin, { tenantId: scope.tenantId, orderId })
      : Promise.resolve(null),
    admin
      .from("talent_offerings")
      .select("id, title, amount_cents, kind, owner_kind, status")
      .eq("tenant_id", scope.tenantId)
      .eq("owner_kind", "workspace")
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    currentShift(admin, { tenantId: scope.tenantId }),
    admin
      .from("sessions")
      .select("id, offering_id, title, starts_at")
      .eq("tenant_id", scope.tenantId)
      .eq("status", "scheduled")
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(80),
  ]);
  if (catalog.error) logServerError("pos.page.catalog", catalog.error);
  if (upcoming.error) logServerError("pos.page.sessions", upcoming.error);

  const sale = saleLoad && saleLoad.ok ? saleLoad.sale : null;
  const sessionsByOffering = new Map<string, Array<{ id: string; title: string; startsAt: string }>>();
  for (const row of (upcoming.data ?? []) as Array<{
    id: string;
    offering_id: string | null;
    title: string | null;
    starts_at: string;
  }>) {
    if (!row.offering_id) continue;
    const list = sessionsByOffering.get(row.offering_id) ?? [];
    if (list.length >= 8) continue;
    list.push({
      id: row.id,
      title: row.title?.trim() || row.starts_at,
      startsAt: row.starts_at,
    });
    sessionsByOffering.set(row.offering_id, list);
  }
  const items = ((catalog.data ?? []) as Array<{
    id: string;
    title: string | null;
    amount_cents: number | null;
    kind: string | null;
  }>).map((row) => ({
    id: row.id,
    title: row.title ?? row.id.slice(0, 8),
    amountCents: row.amount_cents ?? 0,
    kind: row.kind,
    sessions: sessionsByOffering.get(row.id) ?? [],
  }));

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
        {tr("dashboard.pos.pageTitle")}
      </h1>
      <p style={{ color: "rgba(11,11,13,0.55)", marginTop: 6, marginBottom: 24 }}>
        {tr("dashboard.pos.pageIntro")}
      </p>
      <PosClient
        tenantSlug={tenantSlug}
        sale={sale}
        openSales={open.ok ? open.rows : []}
        catalog={items}
        copy={{
          newSale: tr("dashboard.pos.newSale"),
          openSales: tr("dashboard.pos.openSales"),
          guest: tr("dashboard.pos.guest"),
          items: tr("dashboard.pos.items"),
          discount: tr("dashboard.pos.discount"),
          deposit: tr("dashboard.pos.deposit"),
          outstanding: tr("dashboard.pos.outstanding"),
          prep: tr("dashboard.pos.prep"),
          payment: tr("dashboard.pos.payment"),
          next: tr("dashboard.pos.next"),
          collectCash: tr("dashboard.pos.collectCash"),
          collectCard: tr("dashboard.pos.collectCard"),
          cancel: tr("dashboard.pos.cancel"),
          contactHint: tr("dashboard.pos.contactHint"),
          email: tr("dashboard.pos.email"),
          phone: tr("dashboard.pos.phone"),
          applyCode: tr("dashboard.pos.applyCode"),
          sendToPrep: tr("dashboard.pos.sendToPrep"),
          emptyCatalog: tr("dashboard.pos.emptyCatalog"),
          emptyOpen: tr("dashboard.pos.emptyOpen"),
          amount: tr("dashboard.pos.amount"),
          tendered: tr("dashboard.pos.tendered"),
          change: tr("dashboard.pos.change"),
          shiftTitle: tr("dashboard.pos.shiftTitle"),
          shiftOpen: tr("dashboard.pos.shiftOpen"),
          shiftClose: tr("dashboard.pos.shiftClose"),
          shiftOpening: tr("dashboard.pos.shiftOpening"),
          shiftCounted: tr("dashboard.pos.shiftCounted"),
          shiftExpected: tr("dashboard.pos.shiftExpected"),
          shiftVariance: tr("dashboard.pos.shiftVariance"),
          shiftNone: tr("dashboard.pos.shiftNone"),
          shiftOpenHint: tr("dashboard.pos.shiftOpenHint"),
        }}
        shift={
          shiftLoad.ok && shiftLoad.shift
            ? {
                id: shiftLoad.shift.id,
                version: shiftLoad.shift.version,
                openingCashCents: shiftLoad.shift.openingCashCents,
                openedAt: shiftLoad.shift.openedAt,
              }
            : null
        }
      />
    </main>
  );
}
