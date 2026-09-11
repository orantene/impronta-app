/**
 * Appointments — the registry's canonical segment for what still renders at
 * /admin/sessions. The body is the SPA's AppointmentsPage, so this is the ordinary
 * PageRouteSyncer stub: the URL is real now, the surface moves later.
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminAppointmentsPage() {
  return <PageRouteSyncer page="sessions" />;
}
