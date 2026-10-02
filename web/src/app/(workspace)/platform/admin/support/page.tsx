import { loadHqSupportQueue } from "@/lib/support/load-hq";
import { loadHqFeatureRequests } from "@/lib/support/feature-requests";
import { loadHqInsightsDashboard } from "@/lib/support/insights/load";
import { loadSupportCannedReplies } from "@/lib/platform/support-canned";
import { SupportHqShell } from "./SupportHqShell";
import { NotificationPermissionCard } from "./NotificationPermissionCard";
import { isSupportDeskEnabled } from "@/lib/support/desk-flag";

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
        deskEnabled={isSupportDeskEnabled()}
      />
    </>
  );
}
