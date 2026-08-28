import { loadHqSupportQueue } from "@/lib/support/load-hq";
import { loadHqInsightsDashboard } from "@/lib/support/insights/load";
import { loadSupportCannedReplies } from "@/lib/platform/support-canned";
import { HQ, HQ_F, HQ_FD } from "../tenants/hq-kit";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { SupportHqShell } from "./SupportHqShell";
import { NotificationPermissionCard } from "./NotificationPermissionCard";

export const dynamic = "force-dynamic";

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; view?: string }>;
}) {
  const [{ ticket: openTicketId, view }, rows, insights, cannedReplies] = await Promise.all([
    searchParams,
    loadHqSupportQueue(),
    loadHqInsightsDashboard(),
    loadSupportCannedReplies(),
  ]);
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const openCount = rows.filter((r) => r.ticket.status === "open").length;

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
          {t("dashboard.platform.support.pageTitle")}
        </h1>
        <p
          style={{
            fontFamily: HQ_F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {interpolate(t("dashboard.platform.support.pageSubtitle"), { count: openCount })}
        </p>
      </div>
      <NotificationPermissionCard />
      <SupportHqShell
        rows={rows}
        insights={insights}
        cannedReplies={cannedReplies}
        initialTicketId={openTicketId ?? null}
        initialView={view === "insights" ? "insights" : "queue"}
      />
    </>
  );
}
