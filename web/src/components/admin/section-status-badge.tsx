/**
 * Phase 5 / M4 — section-status badge (now thin alias over AdminStatusChip).
 *
 * Keeps the historical API the sections list, editor header, and homepage
 * composer use, while delegating rendering to the unified status vocabulary
 * introduced in Phase 15 so section / page / inquiry chips stay identical
 * across the admin.
 */

import type { SectionStatusLiteral } from "@/lib/site-admin/forms/sections";
import {
  AdminStatusChip,
  type AdminStatusChipState,
} from "./admin-status-chip";

const STATUS_MAP: Record<SectionStatusLiteral, AdminStatusChipState> = {
  draft: "draft",
  published: "published",
  archived: "archived",
};

export function SectionStatusBadge({ status }: { status: string }) {
  const key = (status in STATUS_MAP ? status : "draft") as SectionStatusLiteral;
  return <AdminStatusChip state={STATUS_MAP[key]} />;
}
