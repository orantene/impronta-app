import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

// WP1 (2026-09-02) — the production dashboard page was deleted (it was dead: audited
// 0-3 of ~20 rows reached real data). The route is kept as a soft redirect so
// bookmarks and inbound links land on the workspace overview.
export default function AdminPage() {
  return <PageRouteSyncer page="overview" />;
}
