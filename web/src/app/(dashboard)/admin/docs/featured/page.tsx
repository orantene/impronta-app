import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsFeaturedPage() {
  return (
    <DocsTopicTemplate
      title="Featured & visibility"
      description="Merchandising talent, hiding profiles, and coordinating with public directory rules."
      sections={[
        {
          eyebrow: "Visibility",
          title: "States",
          body: "table",
          table: {
            columns: [
              { key: "state", label: "State", sortable: true },
              { key: "guest", label: "Guest impact", sortable: true },
              { key: "staff", label: "Staff notes", sortable: true },
            ],
            rows: [
              { state: "Featured", guest: "Boosted placement in curated surfaces", staff: "Use for campaigns and top books." },
              { state: "Standard", guest: "Eligible for organic ranking", staff: "Default publishing path." },
              { state: "Hidden", guest: "Removed from public roster", staff: "Temporary or compliance holds." },
            ],
          },
        },
        {
          eyebrow: "Playbooks",
          title: "Campaign tips",
          body: "bullets",
          bullets: [
            "Pair featured sets with analytics segments to measure uplift.",
            "Document rotation schedules so merchandising stays fresh.",
          ],
        },
      ]}
    />
  );
}
