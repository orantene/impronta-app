// Platform HQ · Catalog · Groups tab.
// Renders the list of all field groups with inline stats and links that
// open the group editor drawer (or full page on hard load). Also embeds
// the existing drag-to-reorder panel.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { HqCard, HqAccordion, CopyableId, HQ, F, FD } from "../_ui";
import { FieldGroupsReorderPanel } from "../groups/field-groups-reorder-panel";

type GroupListRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
  is_active: boolean;
  field_count: number;
  mapped_talent_types: string[];
};

async function loadGroupList(): Promise<GroupListRow[] | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  try {
    const [groupsR, fieldsR] = await Promise.all([
      sb
        .from("profile_field_groups")
        .select("id, slug, name_en, name_es, sort_order, is_active")
        .order("sort_order", { ascending: true }),
      sb
        .from("profile_field_definitions")
        .select("id, field_group_id"),
    ]);

    if (groupsR.error) return null;

    const fieldsByGroup = new Map<string, string[]>();
    for (const row of (fieldsR.data ?? []) as Array<{
      id: string;
      field_group_id: string | null;
    }>) {
      if (!row.field_group_id) continue;
      const list = fieldsByGroup.get(row.field_group_id) ?? [];
      list.push(row.id);
      fieldsByGroup.set(row.field_group_id, list);
    }

    // Best-effort: fetch taxonomy term names for all groups in one pass.
    const allFieldIds = (fieldsR.data ?? [])
      .filter((r): r is { id: string; field_group_id: string } => !!r.field_group_id)
      .map((r) => r.id);

    const termNameByFieldId = new Map<string, string[]>();
    if (allFieldIds.length > 0) {
      try {
        const recsR = await sb
          .from("profile_field_recommendations")
          .select("field_definition_id, taxonomy_term_id")
          .in("field_definition_id", allFieldIds);

        if (!recsR.error && recsR.data && recsR.data.length > 0) {
          const termIds = [
            ...new Set(
              (
                recsR.data as Array<{
                  field_definition_id: string;
                  taxonomy_term_id: string;
                }>
              ).map((r) => r.taxonomy_term_id),
            ),
          ];
          const termsR = await sb
            .from("taxonomy_terms")
            .select("id, name_en")
            .in("id", termIds);

          const termNameById = new Map(
            ((termsR.data ?? []) as Array<{ id: string; name_en: string }>).map((t) => [
              t.id,
              t.name_en,
            ]),
          );

          for (const rec of recsR.data as Array<{
            field_definition_id: string;
            taxonomy_term_id: string;
          }>) {
            const name = termNameById.get(rec.taxonomy_term_id);
            if (!name) continue;
            const list = termNameByFieldId.get(rec.field_definition_id) ?? [];
            if (!list.includes(name)) list.push(name);
            termNameByFieldId.set(rec.field_definition_id, list);
          }
        }
      } catch {
        // best-effort; ignore
      }
    }

    return (
      (
        groupsR.data as Array<{
          id: string;
          slug: string;
          name_en: string;
          name_es: string | null;
          sort_order: number;
          is_active: boolean;
        }>
      )
        .map((g) => {
          const groupFieldIds = fieldsByGroup.get(g.id) ?? [];
          const uniqueTypes = [
            ...new Set(groupFieldIds.flatMap((fid) => termNameByFieldId.get(fid) ?? [])),
          ].sort();
          return {
            id: g.id,
            slug: g.slug,
            name_en: g.name_en,
            name_es: g.name_es,
            sort_order: g.sort_order ?? 100,
            is_active: g.is_active !== false,
            field_count: groupFieldIds.length,
            mapped_talent_types: uniqueTypes,
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en))
    );
  } catch {
    return null;
  }
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: isActive ? HQ.green : HQ.red,
        border: `1px solid ${(isActive ? HQ.green : HQ.red)}44`,
        background: `${(isActive ? HQ.green : HQ.red)}1a`,
        borderRadius: 999,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {isActive ? "Active" : "Archived"}
    </span>
  );
}

function GroupRow({ g }: { g: GroupListRow }) {
  return (
    <Link
      href={`/platform/admin/catalog/group/${g.id}`}
      className="hq-field-row"
      title={`Edit ${g.name_en}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        color: g.is_active ? HQ.ink : HQ.inkMuted,
        opacity: g.is_active ? 1 : 0.65,
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      {/* ID pill */}
      <CopyableId id={g.id} />

      {/* Name + slug */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>{g.name_en}</span>
          <span style={{ fontSize: 10, color: HQ.green, letterSpacing: 0.2 }}>›</span>
          {g.name_es && (
            <span style={{ fontSize: 11, color: HQ.inkDim }}>{g.name_es}</span>
          )}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {g.slug} · #{g.sort_order} · {g.field_count} field{g.field_count === 1 ? "" : "s"}
        </div>
        {g.mapped_talent_types.length > 0 && (
          <div style={{ fontSize: 10, color: HQ.inkDim, marginTop: 2 }}>
            {g.mapped_talent_types.slice(0, 6).join(" · ")}
            {g.mapped_talent_types.length > 6 ? ` +${g.mapped_talent_types.length - 6} more` : ""}
          </div>
        )}
      </div>

      {/* Active badge */}
      <ActiveBadge isActive={g.is_active} />
    </Link>
  );
}

export async function GroupsTab({ sp }: { sp: Record<string, string | undefined> }) {
  void sp;
  const groups = await loadGroupList();

  return (
    <div style={{ fontFamily: F, color: HQ.ink }}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 600, color: HQ.ink }}>
            Field Groups
          </div>
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
            {groups === null
              ? "Could not load groups."
              : `${groups.length} group${groups.length === 1 ? "" : "s"} · ${groups.filter((g) => g.is_active).length} active`}
          </div>
        </div>
        <Link
          href="/platform/admin/catalog/group/new"
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "7px 13px",
            border: `1px solid rgba(93,211,160,0.35)`,
            background: "rgba(93,211,160,0.12)",
            color: HQ.green,
            borderRadius: 8,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          + New field group
        </Link>
      </div>

      {groups === null ? (
        <HqCard title="Unavailable">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            Could not load field groups (service client unavailable or query failed). Retry shortly.
          </div>
        </HqCard>
      ) : groups.length === 0 ? (
        <HqCard title="No groups yet">
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            Create your first field group using the button above. Groups let you organise profile
            fields into logical sections for the engine and the talent editor.
          </div>
        </HqCard>
      ) : (
        <>
          {/* Reorder panel */}
          <HqAccordion
            title="Drag to reorder"
            meta="Changes the platform default group order"
          >
            <FieldGroupsReorderPanel
              groups={groups.map((g) => ({
                id: g.id,
                slug: g.slug,
                name_en: g.name_en,
                sort_order: g.sort_order,
                is_active: g.is_active,
                field_count: g.field_count,
              }))}
            />
          </HqAccordion>

          {/* Group list */}
          <HqCard
            title="All groups"
            subtitle="Click a row to open the group editor."
          >
            <div>
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "4px 12px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: HQ.inkDim,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                <span style={{ minWidth: 80 }}>ID</span>
                <span style={{ flex: 1 }}>Group</span>
                <span>Status</span>
              </div>
              {groups.map((g) => (
                <GroupRow key={g.id} g={g} />
              ))}
            </div>
          </HqCard>
        </>
      )}
    </div>
  );
}

