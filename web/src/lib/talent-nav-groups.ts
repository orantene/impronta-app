import type { DashboardNavGroup, DashboardNavItem } from "@/lib/dashboard/architecture";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readDashboardNavGroupItems } from "@/lib/field-engine/read-source-dashboard-nav";

/** Same URL contract as {@link loadTalentDashboardData} (owner preview when not live public). */
export function buildTalentPreviewHref(input: {
  profileCode: string;
  workflowStatus: string;
  visibility: string;
}): string {
  const live = input.workflowStatus === "approved" && input.visibility === "public";
  return live ? `/t/${input.profileCode}` : `/t/${input.profileCode}?preview=1`;
}

/**
 * Field groups that appear in talent profile editing (nav + sheets), derived
 * from live definitions. Routes through the field-engine read seam so the
 * active source (`dashboard_nav` flag) decides A vs B. Default (`a`) is
 * byte-identical to today; `dashboard_nav:b` reads canonical System B.
 */
export async function fetchTalentNavProfileGroupItems(
  supabase: SupabaseClient,
): Promise<DashboardNavItem[]> {
  return readDashboardNavGroupItems(supabase);
}

/**
 * Merges dynamic field-group links into the Profile section. "My profile" lives as its own top-level
 * item in {@link TALENT_DASHBOARD_GROUPS} (`talent-nav-my-profile`), not inside this group.
 */
export function mergeTalentProfileNavItems(
  groups: DashboardNavGroup[],
  dynamicItems: DashboardNavItem[],
): DashboardNavGroup[] {
  return groups.map((g) => {
    if (g.id !== "profile") return g;
    return { ...g, items: dynamicItems };
  });
}

/** Replace static Preview nav target (e.g. /talent/preview) with the real public profile URL. */
export function mergeTalentPreviewNavHref(
  groups: DashboardNavGroup[],
  previewHref: string,
): DashboardNavGroup[] {
  return groups.map((g) => {
    if (g.id !== "talent-nav-preview") return g;
    if (!g.singleLink || g.items.length !== 1) return g;
    return {
      ...g,
      items: [{ ...g.items[0], href: previewHref }],
    };
  });
}
