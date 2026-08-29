import { loadHqSupportQueue } from "@/lib/support/load-hq";
import { loadHqFeatureRequests } from "@/lib/support/feature-requests";
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
  const [{ ticket: openTicketId, view }, rows, insights, cannedReplies, ideas] = await Promise.all([
    searchParams,
    loadHqSupportQueue(),
    loadHqInsightsDashboard(),
    loadSupportCannedReplies(),
    loadHqFeatureRequests(),
  ]);
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const openCount = rows.filter((r) => r.ticket.status === "open").length;

  return (
    <>
      <NotificationPermissionCard />
      <SupportHqShell
        rows={rows}
        insights={insights}
        cannedReplies={cannedReplies}
        ideas={ideas}
        initialOpenCount={openCount}
        initialTicketId={openTicketId ?? null}
        initialView={view === "insights" ? "insights" : view === "ideas" ? "ideas" : "queue"}
      />
    </>
  );
}
