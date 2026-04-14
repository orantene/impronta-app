import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsClientsPage() {
  return (
    <DocsTopicTemplate
      title="Clients & inquiries"
      description="How client accounts interact with inquiries, bookings, and agency operations."
      sections={[
        {
          eyebrow: "Operations",
          title: "Workflow map",
          body: "table",
          table: {
            columns: [
              { key: "flow", label: "Flow", sortable: true },
              { key: "owner", label: "Owner", sortable: true },
              { key: "dashboard", label: "Dashboard", sortable: true },
            ],
            rows: [
              { flow: "New inquiry", owner: "Sales / bookers", dashboard: "Inquiries queue" },
              { flow: "Hold → confirm", owner: "Operations", dashboard: "Booking detail + client thread" },
              { flow: "Client portal", owner: "Client", dashboard: "Client workspace (when enabled)" },
            ],
          },
        },
        {
          eyebrow: "AI assist",
          title: "Drafting",
          body: "bullets",
          bullets: [
            "Inquiry draft assistant accelerates first responses while keeping staff review mandatory.",
            "Pair with WhatsApp or email templates where configured.",
          ],
        },
      ]}
    />
  );
}
