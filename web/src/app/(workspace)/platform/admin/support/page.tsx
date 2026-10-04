import { redirect } from "next/navigation";

import { loadHqSupportQueue } from "@/lib/support/load-hq";
import { loadHqFeatureRequests } from "@/lib/support/feature-requests";
import { loadHqInsightsDashboard } from "@/lib/support/insights/load";
import { loadSupportCannedReplies } from "@/lib/platform/support-canned";
import { SupportHqShell } from "./SupportHqShell";
import { NotificationPermissionCard } from "./NotificationPermissionCard";
import { isSupportDeskEnabled } from "@/lib/support/desk-flag";
import { supportDeskPortalRedirectHref } from "@/lib/support/desk/desk-url";

export const dynamic = "force-dynamic";

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; view?: string }>;
}) {
  const { ticket: openTicketId, view } = await searchParams;

  // When Desk is enabled, retire this page: Support nav lands on the portal.
  if (isSupportDeskEnabled()) {
    redirect(
      supportDeskPortalRedirectHref({
        ticketId: openTicketId ?? null,
        view: view ?? null,
      }),
    );
  }

  const [rows, insights, cannedReplies, ideas] = await Promise.all([
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
        deskEnabled={false}
      />
    </>
  );
}
