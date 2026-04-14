import { DocsPageHeader } from "@/components/docs/docs-page-header";
import { DocsOverviewClient } from "./docs-overview-client";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import type { DocsCardItem } from "@/components/docs/docs-card-grid";

const OVERVIEW_CARDS: DocsCardItem[] = [
  {
    title: "AI Documentation",
    description: "Feature matrix, activation, flags, provider routing, and troubleshooting.",
    href: "/admin/docs/ai",
    kind: "section",
  },
  {
    title: "Search System",
    description: "Hybrid retrieval, ranking, logs, and how quality modes affect guests.",
    href: "/admin/docs/search",
    kind: "section",
  },
  {
    title: "Talent System",
    description: "Profiles, applications, visibility states, and media workflows.",
    href: "/admin/docs/talent",
    kind: "content",
  },
  {
    title: "Directory",
    description: "Fields, filters, taxonomy, and how directory data reaches the public site.",
    href: "/admin/docs/directory",
    kind: "section",
  },
  {
    title: "Analytics",
    description: "Executive, acquisition, funnels, and AI search reporting surfaces.",
    href: "/admin/docs/analytics",
    kind: "table",
  },
  {
    title: "Settings",
    description: "Site settings, feature flags, themes, and operational toggles.",
    href: "/admin/docs/settings",
    kind: "section",
  },
  {
    title: "Troubleshooting",
    description: "Common failures, environment checks, and where to find logs.",
    href: "/admin/docs/troubleshooting",
    kind: "content",
  },
];

export default function AdminDocsOverviewPage() {
  return (
    <div className={ADMIN_PAGE_STACK}>
      <DocsPageHeader
        title="Documentation"
        description="Platform architecture and AI system documentation"
      />
      <DocsOverviewClient cards={OVERVIEW_CARDS} />
    </div>
  );
}
