/**
 * /admin/appointments — the word on the sidebar, typed by hand. An alias of
 * the `appts` destination (`lib/workspace/destinations.ts`); the body is the
 * SPA's SessionsPage, so this is the same PageRouteSyncer stub as ../appts.
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminAppointmentsAliasPage() {
  return <PageRouteSyncer page="sessions" />;
}
