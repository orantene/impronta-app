"use client";

/**
 * Platform Admin — tenant management drawer.
 *
 * Slides in from the right when a row in the tenants table is opened. Loads
 * the management detail on open, hosts the shared section stack, and offers
 * a jump to the full-page detail for deep work.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HQ,
  HQ_F,
  HQ_FD,
  HQ_FM,
  PlanChip,
  StatusChip,
  EntityChip,
  PLAN_TIER_LABEL_KEY,
  WORKSPACE_STATUS_LABEL_KEY,
} from "./hq-kit";
import { TenantSectionStack } from "./tenant-sections";
import { actionGetTenantManagementDetail } from "./actions";
import type { TenantManagementDetail } from "../../tenant-management-data";
import { useT } from "@/i18n/use-t";

export function TenantDrawer({
  tenantId,
  onClose,
  onChanged,
}: {
  tenantId: string | null;
  onClose: () => void;
  /** Fires after an in-drawer mutation, so the list can reconcile its row optimistically. */
  onChanged?: (tenantId: string) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [detail, setDetail] = useState<TenantManagementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    actionGetTenantManagementDetail(tenantId).then((res) => {
      if (cancelled) return;
      if (res.ok) setDetail(res.data);
      else setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tenantId, onClose]);

  const refetch = useCallback(async () => {
    if (!tenantId) return;
    const res = await actionGetTenantManagementDetail(tenantId);
    if (res.ok) setDetail(res.data);
    // Let the list reconcile its row immediately; the refresh below confirms it.
    onChanged?.(tenantId);
    // Refresh the table behind the drawer so the row reflects the change.
    router.refresh();
  }, [tenantId, router, onChanged]);

  if (!tenantId) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }}
      />

      {/* Panel */}
      <aside
        style={{
          position: "relative",
          width: "min(520px, 100vw)",
          height: "100%",
          background: HQ.bg,
          borderLeft: `1px solid ${HQ.border}`,
          display: "flex",
          flexDirection: "column",
          fontFamily: HQ_F,
          boxShadow: "-24px 0 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${HQ.borderSoft}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: HQ.ink,
                  fontFamily: HQ_FD,
                  letterSpacing: -0.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {detail?.name ?? t("dashboard.platform.tenants.drawerFallbackName")}
              </div>
              {detail && (
                <div
                  style={{
                    fontSize: 11.5,
                    color: HQ.inkDim,
                    fontFamily: HQ_FM,
                    marginTop: 1,
                  }}
                >
                  {detail.slug}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("dashboard.platform.tenants.cancel")}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: `1px solid ${HQ.borderSoft}`,
                background: "transparent",
                color: HQ.inkMuted,
                cursor: "pointer",
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {detail && (
            <>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <PlanChip
                  plan={detail.plan}
                  label={PLAN_TIER_LABEL_KEY[detail.plan] ? t(PLAN_TIER_LABEL_KEY[detail.plan]) : undefined}
                />
                <StatusChip
                  status={detail.status}
                  label={WORKSPACE_STATUS_LABEL_KEY[detail.status] ? t(WORKSPACE_STATUS_LABEL_KEY[detail.status]) : undefined}
                />
                <EntityChip
                  entityType={detail.entityType}
                  label={
                    detail.entityType === "hub"
                      ? t("dashboard.platform.tenants.entity.hub")
                      : t("dashboard.platform.tenants.entity.agency")
                  }
                />
                {detail.override && (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: HQ.green,
                      fontWeight: 600,
                    }}
                  >
                    ● {t("dashboard.platform.tenants.overrideActive")}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <a
                  href={detail.urls.publicSite}
                  target="_blank"
                  rel="noreferrer"
                  style={drawerLinkStyle}
                >
                  {t("dashboard.platform.tenants.linkPublicSite")}
                </a>
                <a
                  href={detail.urls.adminDashboard}
                  target="_blank"
                  rel="noreferrer"
                  style={drawerLinkStyle}
                >
                  {t("dashboard.platform.tenants.linkAdmin")}
                </a>
                <Link
                  href={`/platform/admin/tenants/${detail.id}`}
                  style={{
                    ...drawerLinkStyle,
                    background: HQ.greenSoft,
                    color: HQ.green,
                    borderColor: "rgba(93,211,160,0.3)",
                  }}
                >
                  {t("dashboard.platform.tenants.linkFullDetail")}
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {loading && (
            <div style={{ padding: "30px 0", textAlign: "center", color: HQ.inkMuted, fontSize: 13 }}>
              {t("dashboard.platform.tenants.loadingWorkspace")}
            </div>
          )}
          {error && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: HQ.redSoft,
                color: HQ.red,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          {detail && (
            <TenantSectionStack detail={detail} onChanged={refetch} mode="drawer" />
          )}
        </div>
      </aside>
    </div>
  );
}

const drawerLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 8,
  background: HQ.cardSoft,
  border: `1px solid ${HQ.borderSoft}`,
  color: HQ.ink,
  fontSize: 11.5,
  fontWeight: 600,
  fontFamily: HQ_F,
  textDecoration: "none",
};
