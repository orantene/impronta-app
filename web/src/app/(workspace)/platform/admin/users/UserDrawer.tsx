"use client";

/**
 * Platform Admin — user detail drawer.
 *
 * Slides in from the right when a row in the users table is opened. Shows the
 * person's identity, account status, and full membership list (every agency
 * and hub they belong to, with role + plan-tier chips). The data is already
 * loaded in the parent — no extra fetch.
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HQ, HQ_F, HQ_FD, HQ_FM, PlanChip, PLAN_TIER_LABEL_KEY, SectionLabel } from "../tenants/hq-kit";
import { MembershipRoleChip, TypeChip, TYPE_LABEL_KEY, MEMBERSHIP_ROLE_LABEL_KEY } from "./user-chips";
import { confirmPlatformUserEmail } from "./actions";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { ActivitySection } from "./UserActivitySection";
import { AdminNotesSection } from "./AdminNotesSection";
import { AuditHistorySection } from "./AuditHistorySection";
import { TalentRecordSection } from "./TalentRecordSection";
import { WorkspaceMembershipsSection } from "./WorkspaceMembershipsSection";
import { AdminActionsSection } from "./AdminActionsSection";
import { BillingSection } from "./BillingSection";
import type { PlatformUserRow } from "../../platform-data";

function classifyType(appRole: string | null): string {
  if (appRole === "super_admin") return "super_admin";
  if (appRole === "talent") return "talent";
  if (appRole === "client") return "client";
  return "staff";
}

export function UserDrawer({
  user,
  onClose,
}: {
  user: PlatformUserRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, onClose]);

  if (!user) return null;

  const typeKey = classifyType(user.appRole);

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
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }}
      />

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
                {user.displayName}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: HQ.inkDim,
                  fontFamily: HQ_FM,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.kind === "human"
                  ? user.email
                  : t("dashboard.platform.users.drawer.noLoginSubtitle")}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("dashboard.platform.users.drawer.close")}
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

          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TypeChip type={typeKey} label={t(TYPE_LABEL_KEY[typeKey] ?? TYPE_LABEL_KEY.client)} />
            {user.workspaceAdminCount > 0 && (
              <span
                style={{
                  fontSize: 10.5,
                  color: HQ.green,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
                title={t("dashboard.platform.users.drawer.workspaceOperatorTitle")}
              >
                ● {t("dashboard.platform.users.drawer.workspaceOperator")}
              </span>
            )}
            {user.kind === "human" && !user.emailConfirmed && (
              <span
                style={{
                  fontSize: 10,
                  color: HQ.amber,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                ● {t("dashboard.platform.users.drawer.emailUnconfirmed")}
              </span>
            )}
            {user.kind === "unclaimed_talent" && (
              <span
                style={{
                  fontSize: 10,
                  color: HQ.inkDim,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
                title={t("dashboard.platform.users.drawer.unclaimedTitle")}
              >
                ● {t("dashboard.platform.users.drawer.unclaimed")}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {/* Stats strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <StatTile label={t("dashboard.platform.users.drawer.statWorkspaces")} value={user.workspaceCount} hint={user.workspaceAdminCount > 0 ? interpolate(t("dashboard.platform.users.drawer.statAdminSuffix"), { count: user.workspaceAdminCount }) : undefined} />
            <StatTile label={t("dashboard.platform.users.drawer.statHubs")} value={user.hubCount} />
            <StatTile label={t("dashboard.platform.users.drawer.statTotalSites")} value={user.tenantCount} />
          </div>

          {/* Identity */}
          <section style={{ marginBottom: 18 }}>
            <SectionLabel>{t("dashboard.platform.users.drawer.identity")}</SectionLabel>
            <div
              style={{
                marginTop: 8,
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 12.5,
                color: HQ.inkMuted,
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "6px 12px",
              }}
            >
              <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.appRole")}</span>
              <span style={{ color: HQ.ink, fontFamily: HQ_FM, fontSize: 11.5 }}>
                {user.appRole ?? "—"}
              </span>
              <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.status")}</span>
              <span style={{ color: HQ.ink }}>
                {user.kind === "human" ? (user.accountStatus ?? "—") : t("dashboard.platform.users.drawer.statusUnclaimed")}
              </span>
              <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.joined")}</span>
              <span style={{ color: HQ.ink }}>{user.createdAt}</span>
              <span style={{ color: HQ.inkDim }}>
                {user.kind === "human" ? t("dashboard.platform.users.drawer.userId") : t("dashboard.platform.users.drawer.talentId")}
              </span>
              <span style={{ color: HQ.inkMuted, fontFamily: HQ_FM, fontSize: 11 }}>
                {user.id}
              </span>
              {user.kind === "human" && (
                <>
                  <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.lastSeen")}</span>
                  <span
                    style={{ color: HQ.ink }}
                    title={user.lastSignInAtIso ?? undefined}
                  >
                    {user.lastSignInAt ?? "—"}
                  </span>
                </>
              )}
              {user.kind === "human" && (
                <>
                  <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.email")}</span>
                  <span style={{ color: HQ.ink, fontFamily: HQ_FM, fontSize: 11 }}>
                    {user.email}
                  </span>
                </>
              )}
              {user.kind === "human" && (
                <>
                  <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.emailConfirmedLabel")}</span>
                  <span
                    style={{
                      color: user.emailConfirmed ? HQ.green : HQ.amber,
                      fontWeight: 600,
                    }}
                  >
                    {user.emailConfirmed ? t("dashboard.platform.users.drawer.yes") : t("dashboard.platform.users.drawer.noUnconfirmed")}
                  </span>
                </>
              )}
              <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.testAccount")}</span>
              <span
                style={{
                  color: user.isTestAccount ? HQ.amber : HQ.ink,
                  fontWeight: user.isTestAccount ? 600 : undefined,
                }}
              >
                {user.isTestAccount ? t("dashboard.platform.users.drawer.yes") : t("dashboard.platform.users.drawer.no")}
              </span>
              {user.publishedGlobally !== null && (
                <>
                  <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.profilePublished")}</span>
                  <span
                    style={{
                      color: user.publishedGlobally ? HQ.green : HQ.inkDim,
                      fontWeight: user.publishedGlobally ? 600 : undefined,
                    }}
                  >
                    {user.publishedGlobally ? t("dashboard.platform.users.drawer.yes") : t("dashboard.platform.users.drawer.no")}
                  </span>
                </>
              )}
              {user.talentProfileId && (
                <>
                  <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.talentProfileId")}</span>
                  <span style={{ color: HQ.ink, fontFamily: HQ_FM, fontSize: 11 }}>
                    {user.talentProfileId}
                  </span>
                </>
              )}
            </div>
            {user.kind === "human" && !user.emailConfirmed && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await confirmPlatformUserEmail(user.id);
                    if (res.ok) router.refresh();
                  })
                }
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid rgba(229,181,103,0.35)`,
                  background: "rgba(229,181,103,0.10)",
                  color: HQ.amber,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: HQ_F,
                  cursor: pending ? "wait" : "pointer",
                  opacity: pending ? 0.6 : 1,
                }}
              >
                {pending ? t("dashboard.platform.users.drawer.confirmingEmail") : t("dashboard.platform.users.drawer.confirmEmail")}
              </button>
            )}
          </section>

          {/* Origin & Provenance */}
          <OriginSection user={user} />

          {/* Talent Record (C.3) */}
          <TalentRecordSection user={user} />

          {/* Billing & Subscriptions (C.4) */}
          <BillingSection user={user} />

          {/* Workspace & Hub Memberships (C.5) */}
          <WorkspaceMembershipsSection user={user} />

          {/* Activity & Support Context */}
          <ActivitySection user={user} />

          {/* Admin Notes */}
          <AdminNotesSection user={user} />

          {/* Audit History (C.9) */}
          <AuditHistorySection user={user} />

          {/* Admin Actions (C.8) */}
          <AdminActionsSection user={user} />
        </div>
      </aside>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: HQ.inkDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 20,
          fontWeight: 600,
          color: HQ.ink,
          fontFamily: HQ_FD,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            marginTop: 2,
            fontSize: 10.5,
            color: HQ.green,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function MembershipList({
  items,
  empty,
}: {
  items: PlatformUserRow["memberships"];
  empty: string;
}) {
  const t = useT();
  if (items.length === 0) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "14px",
          background: HQ.cardSoft,
          border: `1px dashed ${HQ.borderSoft}`,
          borderRadius: 10,
          fontSize: 12.5,
          color: HQ.inkDim,
          textAlign: "center",
        }}
      >
        {empty}
      </div>
    );
  }
  return (
    <ul style={{ marginTop: 8, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
      {items.map((m) => (
        <li
          key={m.tenantId}
          style={{
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link
              href={`/platform/admin/tenants/${m.tenantId}`}
              style={{
                color: HQ.ink,
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              {m.name}
            </Link>
            <div style={{ color: HQ.inkDim, fontFamily: HQ_FM, fontSize: 10.5 }}>
              {m.slug}
            </div>
          </div>
          <PlanChip plan={m.plan} label={PLAN_TIER_LABEL_KEY[m.plan] ? t(PLAN_TIER_LABEL_KEY[m.plan]) : undefined} />
          <MembershipRoleChip role={m.role} label={MEMBERSHIP_ROLE_LABEL_KEY[m.role] ? t(MEMBERSHIP_ROLE_LABEL_KEY[m.role]) : undefined} />
        </li>
      ))}
    </ul>
  );
}

const ORIGIN_LABEL_KEY: Record<string, string> = {
  agency_signup: "dashboard.platform.users.origin.agency",
  studio_signup: "dashboard.platform.users.origin.studio",
  platform_admin_signup: "dashboard.platform.users.origin.platform",
  self_signup: "dashboard.platform.users.origin.self",
  claim_invite: "dashboard.platform.users.origin.claim_invite",
};

function OriginSection({ user }: { user: PlatformUserRow }) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);

  const originLabel = user.originKind
    ? t(ORIGIN_LABEL_KEY[user.originKind] ?? "dashboard.platform.users.origin.unknown")
    : t("dashboard.platform.users.origin.unknown");

  const originColor = user.originKind
    ? {
        agency_signup: HQ.green,
        studio_signup: HQ.inkMuted,
        platform_admin_signup: HQ.inkMuted,
        self_signup: HQ.inkMuted,
        claim_invite: HQ.amber,
      }[user.originKind] ?? HQ.inkDim
    : HQ.inkDim;

  const hasOriginData =
    user.originKind || user.originCreatedByUserId || user.originWorkspaceId;

  return (
    <section style={{ marginBottom: 18 }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: HQ.ink,
          fontFamily: HQ_FM,
          letterSpacing: 0.2,
          textTransform: "uppercase",
          marginBottom: 8,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 11 }}>{isOpen ? "▼" : "▶"}</span>
        {t("dashboard.platform.users.drawer.originTitle")}
      </div>

      {isOpen && (
        <div
          style={{
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 12.5,
            color: HQ.inkMuted,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "6px 12px",
          }}
        >
          {!hasOriginData ? (
            <span
              style={{
                gridColumn: "1 / -1",
                color: HQ.inkDim,
                textAlign: "center",
                padding: "6px 0",
              }}
            >
              {t("dashboard.platform.users.drawer.originNoData")}
            </span>
          ) : (
            <>
              <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.origin")}</span>
              <div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: `${originColor}15`,
                    color: originColor,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  {originLabel}
                </span>
              </div>

              <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.createdBy")}</span>
              <span
                style={{
                  color: HQ.ink,
                  fontFamily: HQ_FM,
                  fontSize: 11.5,
                  wordBreak: "break-all",
                }}
                title={user.originCreatedByUserId ?? undefined}
              >
                {user.originCreatedByUserId ?? "—"}
              </span>

              <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.viaWorkspace")}</span>
              <span
                style={{
                  color: HQ.ink,
                  fontFamily: HQ_FM,
                  fontSize: 11.5,
                  wordBreak: "break-all",
                }}
                title={user.originWorkspaceId ?? undefined}
              >
                {user.originWorkspaceId ?? "—"}
              </span>

              <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.drawer.createdAt")}</span>
              <span style={{ color: HQ.ink }}>
                {user.createdAtIso
                  ? (() => {
                      const d = new Date(user.createdAtIso);
                      const abs = d.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      const now = new Date();
                      const diffMs = now.getTime() - d.getTime();
                      const diffDays = Math.floor(diffMs / 86400000);
                      let rel = t("dashboard.platform.users.drawer.relToday");
                      if (diffDays === 1) rel = t("dashboard.platform.users.drawer.relYesterday");
                      else if (diffDays > 1 && diffDays < 7)
                        rel = interpolate(t("dashboard.platform.users.drawer.relDaysAgo"), { count: diffDays });
                      else if (diffDays >= 7 && diffDays < 30)
                        rel = interpolate(t("dashboard.platform.users.drawer.relWeeksAgo"), { count: Math.floor(diffDays / 7) });
                      else if (diffDays >= 30)
                        rel = interpolate(t("dashboard.platform.users.drawer.relMonthsAgo"), { count: Math.floor(diffDays / 30) });
                      return `${abs} (${rel})`;
                    })()
                  : "—"}
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
