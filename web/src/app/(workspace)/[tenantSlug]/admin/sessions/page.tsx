/**
 * Sessions surface route stub (Schedule tab).
 *
 * SPA-tab pattern (like pitches): this file mounts <PageRouteSyncer>, which
 * returns null but tells the admin shell to switch its page state to "sessions"
 * on a hard refresh / direct URL, so /admin/sessions does not 404. The shell's
 * PageRouter renders <SessionsPage /> from page-modules when page === "sessions".
 *
 * Owned by the Sessions & Classes Manager per
 * docs/plans/sessions-rail-slot-contract.md — they replace the placeholder
 * SessionsPage body with the real Schedule surface (series, occurrences, the
 * series editor, the refusals panel) from lib/sessions/*.
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminSessionsPage() {
  return <PageRouteSyncer page="sessions" />;
}
