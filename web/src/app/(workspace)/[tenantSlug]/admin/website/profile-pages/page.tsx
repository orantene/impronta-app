import { PageRouteSyncer } from "../../_page-route-syncer";

export const dynamic = "force-dynamic";

// Profile Pages is a sub-view of the Website surface. The layout resolves the
// first path segment ("website") to the Website tab; this syncer keeps the
// shell's active page in sync, and <WebsitePage> reads the pathname to render
// the Profile Pages studio instead of the site-management body.
export default function AdminWebsiteProfilePagesPage() {
  return <PageRouteSyncer page="website" />;
}
