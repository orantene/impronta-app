// TUL-635: an admin URL that matches no route renders the not-found card INSIDE
// the admin layout. Without this catch-all Next sends it to the root public 404
// (no shell, a "Sign in" button for a signed-in owner). Explicit routes always win
// over a catch-all, so no real page is shadowed.
import { AdminNotFoundCard } from "../admin-not-found-card";

export const dynamic = "force-dynamic";

export default function AdminMissingPage() {
  return <AdminNotFoundCard />;
}
