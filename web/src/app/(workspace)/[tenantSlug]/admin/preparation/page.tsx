import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { listBoard } from "@/lib/preparation/tickets";
import { tenantTimezone } from "@/lib/spaces/venues";
import { venueZoneLabel } from "@/lib/spaces/venue-clock";
import { interpolate } from "@/i18n/interpolate";
import { PreparationClient } from "./prep-client";
import { preparationCopy } from "./prep-copy";

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
  // A promise time is the KITCHEN's clock. Same read path and same reasoning
  // as the floor: see `lib/spaces/venue-clock.ts`.
  const timeZone = await tenantTimezone(scope.tenantId);
  const zoneNote = interpolate(tr("dashboard.preparation.timesInZone"), {
    zone: venueZoneLabel(timeZone, locale, new Date()),
  });

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
          timeZone={timeZone}
          zoneNote={zoneNote}
          tickets={board.tickets}
          copy={preparationCopy(tr)}
        />
      )}
    </main>
  );
}
