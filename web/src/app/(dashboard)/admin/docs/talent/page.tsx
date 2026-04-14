import { DocsTopicTemplate } from "../docs-topic-template";

export default function AdminDocsTalentPage() {
  return (
    <DocsTopicTemplate
      title="Talent system"
      description="Roster modeling, applications, and visibility across admin workflows."
      sections={[
        {
          eyebrow: "Lifecycle",
          title: "Core entities",
          body: "table",
          table: {
            columns: [
              { key: "entity", label: "Entity", sortable: true },
              { key: "surface", label: "Admin surface", sortable: true },
              { key: "intent", label: "Intent", sortable: true },
            ],
            rows: [
              { entity: "Profile", surface: "All talent", intent: "Canonical roster record and public-facing card." },
              { entity: "Applications", surface: "Applications tab", intent: "Onboarding pipeline before full profiles." },
              { entity: "Featured / Hidden", surface: "Talent filters", intent: "Merchandising and suppression without deletion." },
            ],
          },
        },
        {
          eyebrow: "Media",
          title: "Assets",
          body: "bullets",
          bullets: [
            "Media library ties assets to approvals and talent usage.",
            "Portfolio ordering and hero selections typically surface on the public profile.",
          ],
        },
      ]}
    />
  );
}
