import { DeskShell } from "@/components/support-desk/DeskShell";
import { loadDeskPage } from "@/components/support-desk/load-desk-page";

export const dynamic = "force-dynamic";

export default async function DeskTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const data = await loadDeskPage({
    ticketId,
    loginNext: `/desk/${ticketId}`,
  });
  return (
    <DeskShell
      rows={data.rows}
      cannedReplies={data.cannedReplies}
      initialTicketId={data.initialTicketId}
      basePath="/desk"
    />
  );
}
