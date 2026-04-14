import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsSearchPage() {
  return (
    <DocsTopicTemplate
      title="Search & ranking"
      description="How hybrid retrieval, rerank, and quality modes shape guest results."
      sections={[
        {
          eyebrow: "Search system",
          title: "Pipeline overview",
          description: "Lexical + vector retrieval merge before optional LLM rerank.",
          body: "table",
          table: {
            columns: [
              { key: "stage", label: "Stage", sortable: true },
              { key: "role", label: "Role", sortable: true },
              { key: "operator", label: "Operator notes", sortable: true },
            ],
            rows: [
              { stage: "Retrieve", role: "Hybrid candidates", operator: "Tune fields and taxonomy before expecting semantic lift." },
              { stage: "Fuse", role: "Quality v2 merge", operator: "Improves stability when vocabulary drifts from roster tokens." },
              { stage: "Rerank", role: "LLM ordering", operator: "Best on shortlists; watch latency budgets." },
            ],
          },
        },
        {
          eyebrow: "Observability",
          title: "Where to look",
          body: "bullets",
          bullets: [
            "AI workspace → Search logs for request-level failures and timing.",
            "Match preview for qualitative checks on ranking and explanations.",
            "Analytics → AI / Search for aggregate trends once wired to production traffic.",
          ],
        },
      ]}
    />
  );
}
