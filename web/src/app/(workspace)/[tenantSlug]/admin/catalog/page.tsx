/**
 * Catalog — the registry's canonical segment for what still renders at
 * /admin/menu. A cafe sees this rail row as "Menu and catalog", a solo
 * professional as "Services"; all three are one surface.
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminCatalogPage() {
  return <PageRouteSyncer page="menu" />;
}
