/**
 * Support Desk product entry (`support.tulala.digital/desk` and app-host `/desk`).
 * Reuses HQ queue loaders + actions. Master switch: `SUPPORT_DESK_ENABLED`.
 */

import { SupportDeskShell } from "@/components/support-desk/SupportDeskShell";
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

  const data = await loadDeskPage({
    ticketId: sp.ticket ?? null,
    loginNext,
  });

  return (
    <SupportDeskShell
      rows={data.rows}
      cannedReplies={data.cannedReplies}
      initialTicketId={data.initialTicketId}
      selfUserId={data.selfUserId}
    />
  );
}
