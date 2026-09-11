/**
 * Sessions surface route stub.
 *
 * SPA-tab pattern (like pitches): this file mounts <PageRouteSyncer>, which
 * returns null but tells the admin shell to switch its page state to "sessions"
 * on a hard refresh / direct URL, so /admin/sessions does not 404. The shell's
 * PageRouter renders <AppointmentsPage /> (Appointments & Classes: the
 * appointments, the sessions, the series and the waitlist as tabs of one
 * route) when page === "sessions".
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminSessionsPage() {
  return <PageRouteSyncer page="sessions" />;
}
