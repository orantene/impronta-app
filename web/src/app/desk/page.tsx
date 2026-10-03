/**
 * Support Desk product entry (`support.tulala.digital/desk` and app-host `/desk`).
 * Mirrors Platform HQ Support via `SupportDeskPortal` → `SupportHqShell`.
 * Master switch: `SUPPORT_DESK_ENABLED` (default OFF on Vercel).
 */

import { SupportDeskForbidden } from "@/components/support-desk/SupportDeskForbidden";
import { SupportDeskPortal } from "@/components/support-desk/SupportDeskPortal";
import { loadDeskPage } from "@/lib/support/desk/load-desk-page";
import { SUPPORT_DESK_HOST_PATH } from "@/lib/support/desk/desk-url";

export const dynamic = "force-dynamic";

export default async function SupportDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.ticket) params.set("ticket", sp.ticket);
  if (sp.view) params.set("view", sp.view);
  const qs = params.toString();
  const loginNext = qs
    ? `${SUPPORT_DESK_HOST_PATH}?${qs}`
    : SUPPORT_DESK_HOST_PATH;

  const result = await loadDeskPage({
    ticketId: sp.ticket ?? null,
    view: sp.view ?? null,
    loginNext,
  });

  if (!result.ok) {
    return <SupportDeskForbidden email={result.email} />;
  }

  const data = result.data;
  const openCount = data.rows.filter((r) => r.ticket.status === "open").length;

  return (
    <SupportDeskPortal
      rows={data.rows}
      insights={data.insights}
      cannedReplies={data.cannedReplies}
      ideas={data.ideas}
      initialOpenCount={openCount}
      initialTicketId={data.initialTicketId}
      initialView={data.initialView}
    />
  );
}
