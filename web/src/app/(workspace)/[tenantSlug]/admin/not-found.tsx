// TUL-635: anything under the admin that still calls notFound() lands on the same card.
import { AdminNotFoundCard } from "./admin-not-found-card";

export const dynamic = "force-dynamic";

export default function AdminNotFound() {
  return <AdminNotFoundCard />;
}
