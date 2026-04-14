import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsReleaseNotesPage() {
  return (
    <DocsTopicTemplate
      title="Release notes"
      description="Documentation-style changelog for major admin and AI capabilities. Update per deploy."
      sections={[
        {
          eyebrow: "History",
          title: "Shipped capabilities",
          body: "table",
          table: {
            columns: [
              { key: "version", label: "Train", sortable: true },
              { key: "theme", label: "Theme", sortable: true },
              { key: "highlights", label: "Highlights", sortable: true },
            ],
            rows: [
              {
                version: "2026.04",
                theme: "Docs hub",
                highlights: "Centralized documentation routes with AI matrix + live flags.",
              },
              {
                version: "2026.03",
                theme: "AI quality",
                highlights: "Quality v2 merge path + expanded operator tooling in workspace.",
              },
              {
                version: "2026.02",
                theme: "Directory",
                highlights: "Filter builder polish + taxonomy alignment across fields.",
              },
            ],
          },
        },
        {
          eyebrow: "Process",
          title: "How to update this page",
          body: "bullets",
          bullets: [
            "Add a row per meaningful deploy; link to tickets or PR IDs in your tracker.",
            "Call out flag defaults and migrations that require operator action.",
          ],
        },
      ]}
    />
  );
}
