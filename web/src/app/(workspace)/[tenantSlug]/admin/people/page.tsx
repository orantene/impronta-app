/**
 * People — the registry's canonical segment for what still renders at
 * /admin/roster. The People surface (everyone / talent / bookable / access /
 * applications as tabs) is not built; until it is, this URL opens the roster,
 * which is the same set of humans under its old name.
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminPeoplePage() {
  return <PageRouteSyncer page="roster" />;
}
