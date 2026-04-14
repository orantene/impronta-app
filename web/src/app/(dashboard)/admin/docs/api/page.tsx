import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsApiPage() {
  return (
    <DocsTopicTemplate
      title="API & integrations"
      description="Server actions, Supabase surfaces, and external providers that power the platform."
      sections={[
        {
          eyebrow: "Integration map",
          title: "Systems",
          body: "table",
          table: {
            columns: [
              { key: "system", label: "System", sortable: true },
              { key: "usage", label: "Usage", sortable: true },
              { key: "notes", label: "Notes", sortable: true },
            ],
            rows: [
              { system: "Supabase", usage: "Auth, data, storage hooks", notes: "RLS policies gate client vs staff scopes." },
              { system: "OpenAI", usage: "Embeddings + optional chat", notes: "Required for semantic search baseline." },
              { system: "Anthropic", usage: "Optional chat provider", notes: "Switch in AI settings when keys present." },
            ],
          },
        },
        {
          eyebrow: "Extending",
          title: "Developer guidelines",
          body: "bullets",
          bullets: [
            "Prefer server actions for mutations that touch privileged keys.",
            "Never expose service-role tokens to the browser bundle.",
          ],
        },
      ]}
    />
  );
}
