import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsSettingsPage() {
  return (
    <DocsTopicTemplate
      title="Settings & feature flags"
      description="Site settings, theme switches, directory gates, and AI toggles that change live behavior."
      sections={[
        {
          eyebrow: "Surface",
          title: "Where settings live",
          body: "table",
          table: {
            columns: [
              { key: "area", label: "Area", sortable: true },
              { key: "path", label: "Path", sortable: true },
              { key: "impact", label: "Impact", sortable: true },
            ],
            rows: [
              { area: "Agency ops", path: "/admin/settings", impact: "Global toggles + themes + contact defaults." },
              { area: "AI", path: "/admin/ai-workspace/settings", impact: "Model routing, quality, guest AI features." },
              { area: "CMS", path: "/admin/site-settings/*", impact: "Public content, SEO, navigation." },
            ],
          },
        },
        {
          eyebrow: "Change control",
          title: "Safe rollout",
          body: "bullets",
          bullets: [
            "Document flag changes with a ticket ID in release notes.",
            "Pair risky toggles with match preview validation and log sampling.",
          ],
        },
      ]}
    />
  );
}
