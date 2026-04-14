import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsDirectoryPage() {
  return (
    <DocsTopicTemplate
      title="Directory & filters"
      description="Configurable directory schema, filter chips, and how data feeds the public experience."
      sections={[
        {
          eyebrow: "Configuration",
          title: "Building blocks",
          body: "table",
          table: {
            columns: [
              { key: "layer", label: "Layer", sortable: true },
              { key: "admin", label: "Admin route", sortable: true },
              { key: "effect", label: "Guest effect", sortable: true },
            ],
            rows: [
              { layer: "Fields", admin: "/admin/fields", effect: "Defines searchable facets and profile attributes." },
              { layer: "Filters", admin: "/admin/directory/filters", effect: "Controls chip order, labels, and visibility." },
              { layer: "Taxonomy", admin: "/admin/taxonomy", effect: "Shared vocabularies across profiles and CMS." },
            ],
          },
        },
        {
          eyebrow: "Safety",
          title: "Publishing checklist",
          body: "bullets",
          bullets: [
            "Rename filters carefully—IDs may be referenced in analytics segments.",
            "Validate mobile chip overflow after reordering long filter sets.",
          ],
        },
      ]}
    />
  );
}
