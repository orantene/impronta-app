import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Phase 17 — Users consolidation.
 *
 * Global directory search is now rendered inside `/admin/users` alongside
 * the staff table. Redirect preserves inbound links.
 */
export default function AdminGlobalUserSearchPage() {
  redirect("/admin/users");
}
