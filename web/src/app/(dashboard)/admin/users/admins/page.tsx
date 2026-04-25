import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Phase 17 — Users consolidation.
 *
 * The standalone `/admin/users/admins` table moved into `/admin/users`
 * (which now also hosts the global directory search). This redirect keeps
 * inbound links and bookmarks alive.
 */
export default function AdminStaffListPage() {
  redirect("/admin/users");
}
