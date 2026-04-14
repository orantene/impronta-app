import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsAnalyticsPage() {
  return (
    <DocsTopicTemplate
      title="Analytics"
      description="Executive, acquisition, marketplace, and AI search insights available inside the admin hub."
      sections={[
        {
          eyebrow: "Surface map",
          title: "Primary dashboards",
          body: "table",
          table: {
            columns: [
              { key: "area", label: "Area", sortable: true },
              { key: "question", label: "Answers", sortable: true },
              { key: "owner", label: "Typical owner", sortable: true },
            ],
            rows: [
              { area: "Executive", question: "Are we growing attention and revenue levers?", owner: "Leadership" },
              { area: "Traffic", question: "Which channels feed qualified visits?", owner: "Growth" },
              { area: "AI / Search", question: "Are AI surfaces healthy and performant?", owner: "Product + ops" },
            ],
          },
        },
        {
          eyebrow: "Instrumentation",
          title: "Before you trust a chart",
          body: "bullets",
          bullets: [
            "Confirm date ranges align with campaign launches.",
            "Cross-check anomalies with raw logs (AI search, inquiries).",
          ],
        },
      ]}
    />
  );
}
