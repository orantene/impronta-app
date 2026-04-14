import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsTranslationsPage() {
  return (
    <DocsTopicTemplate
      title="Translations"
      description="Locale coverage, health signals, and how strings propagate to the public site."
      sections={[
        {
          eyebrow: "Control center",
          title: "Operational view",
          body: "table",
          table: {
            columns: [
              { key: "signal", label: "Signal", sortable: true },
              { key: "meaning", label: "Meaning", sortable: true },
              { key: "action", label: "Action", sortable: true },
            ],
            rows: [
              { signal: "Missing keys", meaning: "Locale incomplete vs baseline", action: "Fill or fallback carefully." },
              { signal: "Stale copy", meaning: "Source changed faster than locales", action: "Re-sync translators." },
              { signal: "CMS overlap", meaning: "Editorial vs system strings", action: "Document ownership per namespace." },
            ],
          },
        },
        {
          eyebrow: "Process",
          title: "Release discipline",
          body: "bullets",
          bullets: [
            "Block releases when critical paths (auth, booking) miss translations.",
            "Snapshot translation health in release notes for auditors.",
          ],
        },
      ]}
    />
  );
}
