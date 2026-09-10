import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { listFloor } from "@/lib/visits/floor";
import { TablesClient } from "./tables-client";

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
          tables={floor.tables}
          copy={{
            empty: tr("dashboard.tables.empty"),
            close: tr("dashboard.tables.close"),
            sale: tr("dashboard.tables.sale"),
            occupied: tr("dashboard.tables.occupied"),
            free: tr("dashboard.tables.free"),
            held: tr("dashboard.tables.held"),
            minSpend: tr("dashboard.tables.minSpend"),
            move: tr("dashboard.tables.move"),
            openTab: tr("dashboard.tables.openTab"),
            seatParty: tr("dashboard.tables.seatParty"),
            partySizeLabel: tr("dashboard.tables.partySizeLabel"),
            confirmSeat: tr("dashboard.tables.confirmSeat"),
            cancel: tr("dashboard.tables.cancel"),
            heldForNamed: tr("dashboard.tables.heldForNamed"),
            heldUnnamed: tr("dashboard.tables.heldUnnamed"),
            heldArriving: tr("dashboard.tables.heldArriving"),
            heldLate: tr("dashboard.tables.heldLate"),
            partySizeShort: tr("dashboard.tables.partySizeShort"),
            elapsedMinutes: tr("dashboard.tables.elapsedMinutes"),
            dueBy: tr("dashboard.tables.dueBy"),
            overdueBy: tr("dashboard.tables.overdueBy"),
            turnMinutesLabel: tr("dashboard.tables.turnMinutesLabel"),
            moveHeading: tr("dashboard.tables.moveHeading"),
            joinHeading: tr("dashboard.tables.joinHeading"),
            joinNeeded: tr("dashboard.tables.joinNeeded"),
            noFreeTables: tr("dashboard.tables.noFreeTables"),
            noJoinOptions: tr("dashboard.tables.noJoinOptions"),
            joinedWith: tr("dashboard.tables.joinedWith"),
            needsReset: tr("dashboard.tables.needsReset"),
            needsResetSince: tr("dashboard.tables.needsResetSince"),
            markReset: tr("dashboard.tables.markReset"),
            refusal: {
              not_found: tr("dashboard.tables.refusal.notFound"),
              wrong_tenant: tr("dashboard.tables.refusal.wrongTenant"),
              already_open: tr("dashboard.tables.refusal.alreadyOpen"),
              invalid: tr("dashboard.tables.refusal.invalid"),
              party_too_small: tr("dashboard.tables.refusal.partyTooSmall"),
              party_too_large: tr("dashboard.tables.refusal.partyTooLarge"),
              not_combinable: tr("dashboard.tables.refusal.notCombinable"),
              joined_unavailable: tr("dashboard.tables.refusal.joinedUnavailable"),
              joined_visit: tr("dashboard.tables.refusal.joinedVisit"),
              not_open: tr("dashboard.tables.refusal.notOpen"),
              outstanding: tr("dashboard.tables.refusal.outstanding"),
              already_closed: tr("dashboard.tables.refusal.alreadyClosed"),
              version_conflict: tr("dashboard.tables.refusal.versionConflict"),
              not_allowed: tr("dashboard.tables.refusal.notAllowed"),
              unavailable: tr("dashboard.tables.refusal.unavailable"),
            },
          }}
        />
      )}
    </main>
  );
}
