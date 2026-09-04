/**
 * Events surface route stub.
 *
 * SPA-tab pattern (like pitches / sessions): mounts <PageRouteSyncer>, which
 * returns null but tells the admin shell to switch its page state to "events"
 * on a hard refresh / direct URL, so /admin/events does not 404. The shell's
 * PageRouter renders <EventsPage /> from page-modules when page === "events".
 *
 * Owned by the Events & Ticketing Manager per
 * docs/plans/events-rail-slot-contract.md — they replace the placeholder
 * EventsPage body with the real Events surface (list + the seven per-event tabs)
 * from lib/events/*.
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminEventsPage() {
  return <PageRouteSyncer page="events" />;
}
