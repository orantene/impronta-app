/**
 * Per-ticket route: `/desk/45` opens ticket #45 (the number in the email
 * subject), same gate and shell as `/desk`.
 */

import { notFound } from "next/navigation";

import { SupportDeskForbidden } from "@/components/support-desk/SupportDeskForbidden";
import { SupportDeskPortal } from "@/components/support-desk/SupportDeskPortal";
import { loadDeskPage } from "@/lib/support/desk/load-desk-page";
import { SUPPORT_DESK_HOST_PATH } from "@/lib/support/desk/desk-url";

export const dynamic = "force-dynamic";

export default async function SupportDeskTicketPage({
  params,
}: {
  params: Promise<{ ticketNumber: string }>;
}) {
  const { ticketNumber } = await params;
  if (!/^\d{1,9}$/.test(ticketNumber)) notFound();
  const n = Number(ticketNumber);

  const result = await loadDeskPage({
    ticketNumber: n,
    view: null,
    loginNext: `${SUPPORT_DESK_HOST_PATH}/${n}`,
  });
  if (!result.ok) return <SupportDeskForbidden email={result.email} />;

  const data = result.data;
  if (!data.initialTicketId) notFound();
  return (
    <SupportDeskPortal
      rows={data.rows}
      insights={data.insights}
      cannedReplies={data.cannedReplies}
      ideas={data.ideas}
      initialOpenCount={data.rows.filter((r) => r.ticket.status === "open").length}
      initialTicketId={data.initialTicketId}
      initialView={data.initialView}
    />
  );
}
