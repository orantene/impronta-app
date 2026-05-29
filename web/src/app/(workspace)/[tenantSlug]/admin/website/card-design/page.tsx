import { PageRouteSyncer } from "../../_page-route-syncer";

export const dynamic = "force-dynamic";

// Card Design is a sub-view of the Website surface. The layout resolves the
// first path segment ("website") to the Website tab; this syncer keeps the
// shell's active page in sync, and <WebsitePage> reads the pathname to render
// the Card Design studio instead of the site-management body.
export default function AdminWebsiteCardDesignPage() {
  return <PageRouteSyncer page="website" />;
}
