import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <PageRouteSyncer page="clients" />;
}
