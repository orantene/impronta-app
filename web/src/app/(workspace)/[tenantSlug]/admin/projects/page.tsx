/**
 * Projects — declared in the registry, NOT built. Its fallback is Messages,
 * which is where /admin/work has pointed since WS-3.6: a URL for a project
 * lands on the thread it would have been about, rather than on nothing.
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminProjectsPage() {
  return <PageRouteSyncer page="messages" />;
}
