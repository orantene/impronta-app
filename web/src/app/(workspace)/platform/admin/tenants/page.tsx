// Platform HQ — Tenants management center.
// Server Component. The platform layout enforces super_admin; all reads use
// the service-role client. Renders the interactive table + management drawer.

import { loadPlatformTenantList } from "../../tenant-management-data";
import { TenantsClient } from "./TenantsClient";
import { HQ, HQ_F, HQ_FD } from "./hq-kit";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

export const dynamic = "force-dynamic";

export default async function PlatformTenantsPage() {
  const rows = await loadPlatformTenantList();

  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const agencies = rows.filter((r) => r.entityType !== "hub").length;
  const hubs = rows.length - agencies;
  const overrides = rows.filter((r) => r.hasActiveOverride).length;
  const ownerless = rows.filter((r) => !r.hasOwner).length;

  const workspacesLabel = interpolate(
    t(
      rows.length === 1
        ? "dashboard.platform.tenants.summaryWorkspacesOne"
        : "dashboard.platform.tenants.summaryWorkspacesOther",
    ),
    { count: rows.length },
  );
  const agenciesLabel = interpolate(
    t(
      agencies === 1
        ? "dashboard.platform.tenants.summaryAgenciesOne"
        : "dashboard.platform.tenants.summaryAgenciesOther",
    ),
    { count: agencies },
  );
  const hubsLabel = interpolate(
    t(
      hubs === 1
        ? "dashboard.platform.tenants.summaryHubsOne"
        : "dashboard.platform.tenants.summaryHubsOther",
    ),
    { count: hubs },
  );

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h1
          style={{
            fontFamily: HQ_FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {t("dashboard.platform.tenants.pageTitle")}
        </h1>
        <p
          style={{
            fontFamily: HQ_F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {workspacesLabel} · {agenciesLabel} · {hubsLabel}
          {overrides > 0
            ? ` · ${interpolate(t("dashboard.platform.tenants.summaryOverride"), { count: overrides })}`
            : ""}
          {ownerless > 0
            ? ` · ${interpolate(t("dashboard.platform.tenants.summaryOwnerless"), { count: ownerless })}`
            : ""}
        </p>
      </div>

      <TenantsClient rows={rows} />
    </>
  );
}
