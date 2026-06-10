// Platform HQ — Tenant detail (full page).
// Deep-work surface for one workspace: the same management sections as the
// drawer, expanded. Service-role access — the platform layout enforces
// super_admin.

import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTenantManagementDetail } from "../../../tenant-management-data";
import { TenantDetailPageBody } from "./TenantDetailPageBody";
import { HQ, HQ_F, HQ_FD, HQ_FM, PlanChip, StatusChip, EntityChip } from "../hq-kit";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

const headerLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 12px",
  borderRadius: 8,
  background: HQ.cardSoft,
  border: `1px solid ${HQ.borderSoft}`,
  color: HQ.ink,
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: HQ_F,
  textDecoration: "none",
};

export default async function PlatformTenantDetailPage({
  params,
}: {
  params: PageParams;
}) {
  const { id } = await params;
  const detail = await loadTenantManagementDetail(id);
  if (!detail) notFound();

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/platform/admin/tenants"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: HQ.inkMuted,
            fontSize: 12,
            fontFamily: HQ_F,
            textDecoration: "none",
            marginBottom: 12,
          }}
        >
          ← All tenants
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontFamily: HQ_FD,
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: -0.5,
                color: HQ.ink,
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {detail.name}
            </h1>
            <div
              style={{
                marginTop: 6,
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontFamily: HQ_FM, fontSize: 12, color: HQ.inkMuted }}>
                {detail.slug}
              </span>
              <span style={{ color: HQ.inkDim }}>·</span>
              <PlanChip plan={detail.plan} />
              <StatusChip status={detail.status} />
              <EntityChip entityType={detail.entityType} />
              {detail.override && (
                <span style={{ fontSize: 11, color: HQ.green, fontWeight: 600 }}>
                  ● override active
                </span>
              )}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: HQ.inkMuted }}>
              {detail.owner
                ? `Owner — ${detail.owner.displayName} · ${detail.owner.email}`
                : "No owner assigned"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <a
              href={detail.urls.publicSite}
              target="_blank"
              rel="noreferrer"
              style={headerLink}
            >
              Public site ↗
            </a>
            <a
              href={detail.urls.adminDashboard}
              target="_blank"
              rel="noreferrer"
              style={headerLink}
            >
              Admin ↗
            </a>
            <Link href={`/platform/admin/tenants/${detail.id}/catalog`} style={headerLink}>
              Catalog →
            </Link>
            <Link
              href={`/platform/admin/tenants/${detail.id}/registration-fields`}
              style={headerLink}
            >
              Registration fields →
            </Link>
          </div>
        </div>
      </div>

      <TenantDetailPageBody detail={detail} />
    </div>
  );
}
