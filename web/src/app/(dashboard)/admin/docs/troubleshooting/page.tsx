import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsTroubleshootingPage() {
  return (
    <DocsTopicTemplate
      title="Troubleshooting"
      description="First-response checklist for degraded AI, search, or publishing workflows."
      sections={[
        {
          eyebrow: "Signals",
          title: "Symptom → check",
          body: "table",
          table: {
            columns: [
              { key: "symptom", label: "Symptom", sortable: true },
              { key: "check", label: "Check", sortable: true },
              { key: "tool", label: "Tool", sortable: true },
            ],
            rows: [
              { symptom: "Empty AI results", check: "Embeddings + flags", tool: "AI workspace + logs" },
              { symptom: "Slow rerank", check: "Provider latency + model", tool: "Search logs + settings" },
              { symptom: "Stale directory", check: "Public toggle + cache", tool: "Site settings + revalidate paths" },
            ],
          },
        },
        {
          eyebrow: "Escalation",
          title: "When to escalate",
          body: "bullets",
          bullets: [
            "Repeated provider 5xx after key rotation → infra + secrets audit.",
            "Data mismatch between admin and public → RLS / build cache investigation.",
          ],
        },
      ]}
    />
  );
}
