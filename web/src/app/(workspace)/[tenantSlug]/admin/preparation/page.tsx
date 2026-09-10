import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { listBoard } from "@/lib/preparation/tickets";
import { PreparationClient } from "./prep-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function PreparationPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const board = await listBoard(admin, scope.tenantId);

  return (
    <main className="mx-auto max-w-[1180px] px-7 py-8">
      <h1 className="m-0 text-[26px] font-semibold text-foreground">
        {tr("dashboard.preparation.pageTitle")}
      </h1>
      <p className="mb-6 mt-1.5 text-sm text-muted-foreground">
        {tr("dashboard.preparation.pageIntro")}
      </p>
      {!board.ok ? (
        <p className="text-sm text-destructive">{tr("dashboard.preparation.unavailable")}</p>
      ) : (
        <PreparationClient
          locale={locale}
          tickets={board.tickets}
          copy={{
            empty: tr("dashboard.preparation.empty"),
            acknowledge: tr("dashboard.preparation.acknowledge"),
            ready: tr("dashboard.preparation.ready"),
            handoff: tr("dashboard.preparation.handoff"),
            revision: tr("dashboard.preparation.revision"),
            destination: tr("dashboard.preparation.destination"),
            destinationTable: tr("dashboard.preparation.destinationTable"),
            destinationPickup: tr("dashboard.preparation.destinationPickup"),
            destinationCounter: tr("dashboard.preparation.destinationCounter"),
            statusQueued: tr("dashboard.preparation.statusQueued"),
            statusAcknowledged: tr("dashboard.preparation.statusAcknowledged"),
            statusReady: tr("dashboard.preparation.statusReady"),
            amended: tr("dashboard.preparation.amended"),
            handedOff: tr("dashboard.preparation.handedOff"),
            promisedBy: tr("dashboard.preparation.promisedBy"),
          }}
        />
      )}
    </main>
  );
}
