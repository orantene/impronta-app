/**
 * Phase 5 / M3 — page-status + system-owned badges (now alias AdminStatusChip).
 *
 * Delegates state rendering to the unified vocabulary so pages, sections,
 * talent, and inquiries all render the same chip treatment across the admin.
 */

import type { PageStatusLiteral } from "@/lib/site-admin/forms/pages";
import {
  AdminStatusChip,
  type AdminStatusChipState,
} from "./admin-status-chip";

const STATUS_MAP: Record<PageStatusLiteral, AdminStatusChipState> = {
  draft: "draft",
  published: "published",
  archived: "archived",
};

export function PageStatusBadge({ status }: { status: string }) {
  const key = (status in STATUS_MAP ? status : "draft") as PageStatusLiteral;
  return <AdminStatusChip state={STATUS_MAP[key]} />;
}

export function SystemOwnedBadge() {
  return (
    <AdminStatusChip
      state="archived"
      label="system · locked"
      title="System-owned page — slug, locale, and template are locked. Managed from the Homepage tab (M5)."
    />
  );
}
