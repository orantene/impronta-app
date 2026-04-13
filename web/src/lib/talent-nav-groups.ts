import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import type { DashboardNavGroup, DashboardNavItem } from "@/lib/dashboard/architecture";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Same URL contract as {@link loadTalentDashboardData} (owner preview when not live public). */
export function buildTalentPreviewHref(input: {
  profileCode: string;
  workflowStatus: string;
  visibility: string;
}): string {
  const live = input.workflowStatus === "approved" && input.visibility === "public";
  return live ? `/t/${input.profileCode}` : `/t/${input.profileCode}?preview=1`;
}

type TalentNavFieldGroupRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
};

function normalizeVisibleLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function dedupeFieldGroupsByVisibleLabel(groups: TalentNavFieldGroupRow[]): TalentNavFieldGroupRow[] {
  const byLabel = new Map<string, TalentNavFieldGroupRow>();

  for (const group of groups) {
    const labelKey = normalizeVisibleLabel(group.name_en) || `slug:${group.slug}`;
    const current = byLabel.get(labelKey);
    if (!current) {
      byLabel.set(labelKey, group);
      continue;
    }

    const nextWins =
      group.sort_order < current.sort_order ||
      (group.sort_order === current.sort_order && group.slug.localeCompare(current.slug) < 0);
    if (nextWins) {
      byLabel.set(labelKey, group);
    }
  }

  return [...byLabel.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug),
  );
}

function logTalentNavTrace(message: string, detail: Record<string, unknown>) {
  if (process.env.DEBUG_TALENT_NAV !== "1") return;
  console.info(`[talent-nav] ${message}`, detail);
}

/**
 * Field groups that appear in talent profile editing (nav + sheets), derived from live definitions.
 */
export async function fetchTalentNavProfileGroupItems(
  supabase: SupabaseClient,
): Promise<DashboardNavItem[]> {
  const { data: fieldDefs, error: defsError } = await supabase
    .from("field_definitions")
    .select("id, field_group_id, key")
    .eq("active", true)
    .is("archived_at", null)
    .eq("editable_by_talent", true)
    .eq("profile_visible", true)
    .eq("internal_only", false)
    .not("field_group_id", "is", null)
    // Canonical geography lives on talent_profiles (residence / origin) + Public identity sheet, not the dynamic field editor.
    .neq("value_type", "location");

  if (defsError) {
    logTalentNavTrace("field_definitions query failed", {
      code: defsError.code,
      message: defsError.message,
    });
    return [];
  }

  const filteredDefs = (fieldDefs ?? []).filter(
    (row) => typeof row.key === "string" && !isReservedTalentProfileFieldKey(row.key),
  );

  const groupIds = [...new Set(filteredDefs.map((row) => row.field_group_id).filter(Boolean))];
  if (groupIds.length === 0) {
    logTalentNavTrace("no eligible field definitions for talent nav", {
      fieldDefinitionCount: filteredDefs.length,
    });
    return [];
  }

  const { data: fieldGroups, error: groupsError } = await supabase
    .from("field_groups")
    .select("id, slug, name_en, name_es, sort_order")
    .in("id", groupIds)
    .is("archived_at", null)
    .order("sort_order");

  if (groupsError) {
    logTalentNavTrace("field_groups query failed", {
      code: groupsError.code,
      message: groupsError.message,
      groupIds,
    });
    return [];
  }

  const byGroupId = new Map<string, TalentNavFieldGroupRow>();
  for (const group of (fieldGroups ?? []) as TalentNavFieldGroupRow[]) {
    if (!byGroupId.has(group.id)) {
      byGroupId.set(group.id, { ...group, sort_order: group.sort_order ?? 0 });
    }
  }
  const uniqueById = [...byGroupId.values()];

  const sorted = dedupeFieldGroupsByVisibleLabel(uniqueById);

  logTalentNavTrace("resolved profile nav groups", {
    fieldDefinitionCount: filteredDefs.length,
    groupCount: fieldGroups?.length ?? 0,
    dedupedGroupCount: sorted.length,
    groups: sorted.map((group) => ({
      id: group.id,
      slug: group.slug,
      label: group.name_en,
      sort_order: group.sort_order,
    })),
  });

  return sorted.map((g) => ({
    id: `talent-profile-group-${g.slug}`,
    href: `/talent/my-profile?group=${encodeURIComponent(g.slug)}`,
    label: g.name_en,
    match: "exact" as const,
    icon: "profile" as const,
    activeQuery: { group: g.slug },
  }));
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
