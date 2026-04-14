import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsTaxonomyPage() {
  return (
    <DocsTopicTemplate
      title="Taxonomy & attributes"
      description="Shared vocabularies, attribute modeling, and consistency across talent + site content."
      sections={[
        {
          eyebrow: "Model",
          title: "Kinds & usage",
          body: "table",
          table: {
            columns: [
              { key: "kind", label: "Kind", sortable: true },
              { key: "consumers", label: "Consumers", sortable: true },
              { key: "guidance", label: "Guidance", sortable: true },
            ],
            rows: [
              { kind: "Tags / categories", consumers: "Directory + CMS", guidance: "Prefer stable slugs; avoid duplicate labels." },
              { kind: "Locations", consumers: "Profiles + maps", guidance: "Keep hierarchy shallow for UX clarity." },
              { kind: "Custom facets", consumers: "Filters", guidance: "Align labels with how guests phrase briefs." },
            ],
          },
        },
        {
          eyebrow: "Quality",
          title: "Housekeeping",
          body: "bullets",
          bullets: [
            "Audit unused terms quarterly to reduce noise in AI retrieval.",
            "Document naming conventions for new kinds before rolling out to editors.",
          ],
        },
      ]}
    />
  );
}
