import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsPermissionsPage() {
  return (
    <DocsTopicTemplate
      title="Permissions & roles"
      description="Staff capabilities, separation of duties, and where to audit access."
      sections={[
        {
          eyebrow: "Roles",
          title: "Baseline matrix",
          body: "table",
          table: {
            columns: [
              { key: "role", label: "Role", sortable: true },
              { key: "access", label: "Typical access", sortable: true },
              { key: "risk", label: "Risk focus", sortable: true },
            ],
            rows: [
              { role: "Admin", access: "Full dashboard + destructive actions", risk: "Guard production toggles." },
              { role: "Staff", access: "Operational queues + content", risk: "PII in inquiries and clients." },
              { role: "Talent", access: "Self-service profile + media", risk: "Asset licensing accuracy." },
            ],
          },
        },
        {
          eyebrow: "Governance",
          title: "Reviews",
          body: "bullets",
          bullets: [
            "Quarterly access review for admin users.",
            "Document break-glass credentials separately from day-to-day accounts.",
          ],
        },
      ]}
    />
  );
}
