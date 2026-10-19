/**
 * Catalog — the registry's canonical segment for what still renders at
 * /admin/menu. A cafe sees this rail row as "Menu and catalog", a solo
 * professional as "Services"; all three are one surface.
 */
import { CatalogBootstrap } from "../_catalog-bootstrap";
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminCatalogPage() {
  // B5: the list's first paint comes with the page (optional; see _catalog-bootstrap.tsx).
  return (
    <>
      <CatalogBootstrap />
      <PageRouteSyncer page="menu" />
    </>
  );
}
