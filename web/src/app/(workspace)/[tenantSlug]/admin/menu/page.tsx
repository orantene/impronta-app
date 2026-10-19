import { CatalogBootstrap } from "../_catalog-bootstrap";
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  // B5: the list's first paint comes with the page (optional; see _catalog-bootstrap.tsx).
  return (
    <>
      <CatalogBootstrap />
      <PageRouteSyncer page="menu" />
    </>
  );
}
