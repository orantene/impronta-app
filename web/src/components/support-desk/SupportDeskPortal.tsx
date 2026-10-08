/**
 * Support Desk portal — mirrors Platform HQ Support (`SupportHqShell`).
 *
 * Product guts stay in `platform/admin/support/*`. This file is host chrome
 * only (brand bar + light admin surface (`.desk-light`, TUL-31)). Reuse HQ Support — no parallel inbox.
 */

import { SupportHqShell } from "@/app/(workspace)/platform/admin/support/SupportHqShell";
import { NotificationPermissionCard } from "@/app/(workspace)/platform/admin/support/NotificationPermissionCard";
import { HQ, HQ_F, HQ_FD } from "@/app/(workspace)/platform/admin/tenants/hq-kit";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import type { HqQueueRow } from "@/lib/support/load-hq";
import type { HqFeatureRequestRow } from "@/lib/support/feature-request-types";
import type { HqInsightsDashboard } from "@/lib/support/insights/types";
import type { SupportCannedReply } from "@/lib/platform/support-canned";

export async function SupportDeskPortal({
  rows,
  insights,
  cannedReplies,
  ideas,
  initialOpenCount,
  initialTicketId,
  initialView,
}: {
  rows: HqQueueRow[];
  insights: HqInsightsDashboard;
  cannedReplies: SupportCannedReply[];
  ideas: HqFeatureRequestRow[];
  initialOpenCount: number;
  initialTicketId: string | null;
  initialView: "queue" | "insights" | "ideas";
}) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <div
      className="platform-admin-root desk-light"
      style={{
        minHeight: "100dvh",
        background: HQ.bg,
        color: HQ.ink,
        fontFamily: HQ_F,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 48,
          padding: "0 28px",
          borderBottom: `1px solid ${HQ.border}`,
          background: HQ.card,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "grid",
            placeItems: "center",
            width: 24,
            height: 24,
            borderRadius: 6,
            background: HQ.ink,
            color: HQ.bg,
            fontFamily: HQ_FD,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          T
        </span>
        <span
          style={{
            fontFamily: HQ_FD,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: -0.2,
            color: HQ.ink,
          }}
        >
          {t("dashboard.platform.support.deskBrand")}
        </span>
      </header>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 28px 48px" }}>
        <NotificationPermissionCard />
        <SupportHqShell
          rows={rows}
          insights={insights}
          cannedReplies={cannedReplies}
          ideas={ideas}
          initialOpenCount={initialOpenCount}
          initialTicketId={initialTicketId}
          initialView={initialView}
          deskEnabled={false}
        />
      </div>
    </div>
  );
}
