// Tab 1 of the Section Editor cluster: Section Category.
// Manages the 7 rail GROUPS (Profile, Craft, Logistics, …).
// Two-column layout: LEFT = group edit cards + "+ New section group" form;
//                   RIGHT = EditorGroupReorderPanel (drag group order).

import { HQ, HqCard, HqAccordion, Stat } from "../_ui";
import { SaveNotice } from "../[fieldKey]/field-detail-editor-parts";
import { loadEditorLayoutAdmin } from "./editor-layout-admin-data";
import { EditorGroupReorderPanel } from "./editor-group-reorder-panel";
import {
  GroupEditForm,
  NewSectionGroupForm,
} from "./section-editor-shared";

export async function SectionCategoryTab({
  sp,
}: {
  sp: Record<string, string | undefined>;
}) {
  const data = await loadEditorLayoutAdmin();

  if (!data.ok) {
    return (
      <HqCard title="Section Category">
        <SaveNotice saved={sp.saved} error={sp.error} />
        <div style={{ fontSize: 13, color: HQ.inkMuted }}>
          Could not load the profile-editor layout. The service client may be
          unavailable, or the layout tables are empty.
        </div>
      </HqCard>
    );
  }

  return (
    <div>
      <SaveNotice saved={sp.saved} error={sp.error} />

      {/* Stats strip */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}
      >
        <Stat
          label="Groups"
          value={`${data.counts.activeGroups}/${data.counts.groups}`}
        />
        {/* Active = active ÷ live (non-archived) sections, so the archived rows
            aren't implied twice — they get their own "Archived" stat below. */}
        <Stat
          label="Active sections"
          value={`${data.counts.activeSections}/${data.counts.sections - data.counts.archivedSections}`}
        />
        <Stat
          label="Archived"
          value={data.counts.archivedSections}
          tone={data.counts.archivedSections > 0 ? HQ.amber : undefined}
        />
      </div>

      {/* Two columns: left group cards, right reorder panel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 420px)",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* LEFT — new group form + group edit cards */}
        <div style={{ minWidth: 0 }}>
          <NewSectionGroupForm />

          {data.groups.length === 0 ? (
            <HqCard title="No section groups">
              <div style={{ fontSize: 13, color: HQ.inkMuted }}>
                No section groups defined yet. Create one above.
              </div>
            </HqCard>
          ) : (
            data.groups.map((group) => (
              <HqAccordion
                key={group.id}
                title={group.label_en}
                meta={`slug: ${group.slug} · ${group.sections.length} section${group.sections.length === 1 ? "" : "s"} · #${group.sort_order}`}
                badge={{
                  text: group.is_active ? "active" : "inactive",
                  tone: group.is_active ? HQ.green : HQ.red,
                }}
              >
                <GroupEditForm group={group} embedded />
              </HqAccordion>
            ))
          )}
        </div>

        {/* RIGHT — drag reorder panel (sticky) */}
        <div style={{ position: "sticky", top: 12, minWidth: 0 }}>
          {data.groups.length >= 2 ? (
            <HqCard
              title="Group order"
              subtitle="Drag to set the order of the profile-editor rail groups."
            >
              <EditorGroupReorderPanel
                groups={data.groups.map((g) => ({
                  id: g.id,
                  slug: g.slug,
                  label_en: g.label_en,
                  sort_order: g.sort_order,
                  is_active: g.is_active,
                  section_count: g.sections.length,
                }))}
              />
            </HqCard>
          ) : (
            <HqCard title="Group order">
              <div style={{ fontSize: 12, color: HQ.inkDim }}>
                Add a second group to enable drag-reordering.
              </div>
            </HqCard>
          )}
        </div>
      </div>
    </div>
  );
}
