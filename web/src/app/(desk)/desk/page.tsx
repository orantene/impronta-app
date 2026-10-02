import { DeskShell } from "@/components/support-desk/DeskShell";
import { loadDeskPage } from "@/components/support-desk/load-desk-page";

export const dynamic = "force-dynamic";

export default async function DeskPage() {
  const data = await loadDeskPage({ loginNext: "/desk" });
  return (
    <DeskShell
      rows={data.rows}
      cannedReplies={data.cannedReplies}
      initialTicketId={data.initialTicketId}
      basePath="/desk"
    />
  );
}
