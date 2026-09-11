import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { listFloor } from "@/lib/visits/floor";
import { tenantTimezone } from "@/lib/spaces/venues";
import { venueZoneLabel } from "@/lib/spaces/venue-clock";
import { interpolate } from "@/i18n/interpolate";
import { TablesClient } from "./tables-client";
import { tablesCopy } from "./tables-copy";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function TablesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const floor = await listFloor(admin, scope.tenantId);
  // The VENUE's zone, resolved through the one timezone read path
  // (`resolveTenantTimezone`'s ladder). Every instant this screen prints is
  // formatted in it, on the server and in the browser alike, so the markup the
  // server sends and the markup hydration produces are the same string.
  const timeZone = await tenantTimezone(scope.tenantId);
  const zoneNote = interpolate(tr("dashboard.tables.timesInZone"), {
    zone: venueZoneLabel(timeZone, locale, new Date()),
  });

  return (
    <main className="mx-auto max-w-[1180px] px-7 py-8">
      <h1 className="m-0 text-[26px] font-semibold text-foreground">
        {tr("dashboard.tables.pageTitle")}
      </h1>
      <p className="mb-6 mt-1.5 text-sm text-muted-foreground">
        {tr("dashboard.tables.pageIntro")}
      </p>
      {!floor.ok ? (
        <p className="text-sm text-destructive">{tr("dashboard.tables.unavailable")}</p>
      ) : (
        <TablesClient
          tenantSlug={tenantSlug}
          locale={locale}
          timeZone={timeZone}
          zoneNote={zoneNote}
          tables={floor.tables}
          copy={tablesCopy(tr)}
        />
      )}
    </main>
  );
}
