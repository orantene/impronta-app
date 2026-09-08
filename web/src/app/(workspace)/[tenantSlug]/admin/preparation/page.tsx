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
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
        {tr("dashboard.preparation.pageTitle")}
      </h1>
      <p style={{ color: "rgba(11,11,13,0.55)", marginTop: 6, marginBottom: 24 }}>
        {tr("dashboard.preparation.pageIntro")}
      </p>
      {!board.ok ? (
        <p>{tr("dashboard.preparation.unavailable")}</p>
      ) : (
        <PreparationClient
          tickets={board.tickets}
          copy={{
            empty: tr("dashboard.preparation.empty"),
            acknowledge: tr("dashboard.preparation.acknowledge"),
            ready: tr("dashboard.preparation.ready"),
            handoff: tr("dashboard.preparation.handoff"),
            revision: tr("dashboard.preparation.revision"),
            destination: tr("dashboard.preparation.destination"),
          }}
        />
      )}
    </main>
  );
}
