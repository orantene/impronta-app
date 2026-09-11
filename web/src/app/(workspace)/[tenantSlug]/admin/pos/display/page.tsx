import { notFound } from "next/navigation";

import { customerDisplayCopy, customerDisplayTipCopy } from "@/components/admin/pos/customer-display-copy";
import { engineRefusalCopy } from "@/components/admin/pos/pos-copy-engine";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { userHasCapability } from "@/lib/access";
import { enabledPosModesFromSettings, sellingModesAllowCounter } from "@/lib/pos/modes";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { PageRouteSyncer } from "../../_page-route-syncer";
import { DisplayClient } from "../display-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type Search = Promise<{ order?: string }>;

/**
 * `/admin/pos/display` — the customer display (design boards D01 to D08).
 *
 * A ROUTE IN THE COUNTER'S OWN FAMILY, BEHIND THE COUNTER'S OWN GATE. A
 * customer display is a device the workspace owns and signs in, not a
 * public page: there is no token in the address and no anonymous path, so
 * a URL that leaks shows nothing to anyone who is not this workspace's
 * staff. The same `booking.payment.request` capability that opens the till
 * opens this, and the same workspace switch that turns the counter off turns
 * this off with it, because a display with no counter behind it is a
 * screen that would say "your order will appear here" forever.
 *
 * The canonical-route matcher for `pos` claims every path under
 * `/admin/pos`, so this page renders as itself rather than under the
 * prototype shell; `PageRouteSyncer` tells the shell it is point-of-sale
 * chrome, exactly as the counter does on every arm.
 */
export default async function PosDisplayPage({ params, searchParams }: { params: PageParams; searchParams: Search }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("booking.payment.request", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const settingsRow = await admin
    .from("agencies")
    .select("display_name, settings")
    .eq("id", scope.tenantId)
    .maybeSingle();
  if (settingsRow.error) logServerError("pos.display.page.settings", settingsRow.error);
  const agencyRow = settingsRow.data as { display_name?: string | null; settings?: unknown } | null;
  const workspaceName = agencyRow?.display_name?.trim() || tenantSlug;

  if (!sellingModesAllowCounter(enabledPosModesFromSettings(agencyRow?.settings))) {
    return (
      <>
        <PageRouteSyncer page="pos" />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-[560px] flex-col justify-center gap-3 px-7 py-16">
          <h1 className="m-0 text-[22px] font-semibold text-admin-ink">{tr("dashboard.pos.counterOffTitle")}</h1>
          <p className="m-0 text-[14px] leading-relaxed text-admin-ink-muted">{tr("dashboard.pos.counterOffBody")}</p>
        </main>
      </>
    );
  }

  const q = await searchParams;
  const order = typeof q.order === "string" && /^[0-9a-f-]{36}$/i.test(q.order) ? q.order : null;

  return (
    <>
      <PageRouteSyncer page="pos" />
      <DisplayClient
        tenantId={scope.tenantId}
        workspaceName={workspaceName}
        initialOrderId={order}
        copy={customerDisplayCopy(tr)}
        tipCopy={customerDisplayTipCopy(tr)}
        engineRefusal={engineRefusalCopy(tr)}
      />
    </>
  );
}
