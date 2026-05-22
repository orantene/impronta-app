// Platform HQ — Tenants management center.
// Server Component. The platform layout enforces super_admin; all reads use
// the service-role client. Renders the interactive table + management drawer.

import { loadPlatformTenantList } from "../../tenant-management-data";
import { TenantsClient } from "./TenantsClient";
import { HQ, HQ_F, HQ_FD } from "./hq-kit";

export const dynamic = "force-dynamic";

export default async function PlatformTenantsPage() {
  const rows = await loadPlatformTenantList();

  const agencies = rows.filter((r) => r.entityType !== "hub").length;
  const hubs = rows.length - agencies;
  const overrides = rows.filter((r) => r.hasActiveOverride).length;
  const ownerless = rows.filter((r) => !r.hasOwner).length;

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
          Tenants
        </h1>
        <p
          style={{
            fontFamily: HQ_F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {rows.length} workspace{rows.length === 1 ? "" : "s"} · {agencies}{" "}
          {agencies === 1 ? "agency" : "agencies"} · {hubs}{" "}
          {hubs === 1 ? "hub" : "hubs"}
          {overrides > 0 ? ` · ${overrides} on plan override` : ""}
          {ownerless > 0 ? ` · ${ownerless} without an owner` : ""}
        </p>
      </div>

      <TenantsClient rows={rows} />
    </>
  );
}
