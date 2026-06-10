// Tab 2 of the Section Editor cluster: Section Fields Group.
// Manages the 20 SECTIONS organised by group. Two-column layout per group:
//   LEFT  = section edit cards (SectionRow with showFields=false)
//   RIGHT = EditorSectionReorderPanel for that group
// Orphan sections (no group) are surfaced below.

import { HQ, HqCard, Stat } from "../_ui";
import { SaveNotice } from "../[fieldKey]/field-detail-editor-parts";
import { loadEditorLayoutAdmin } from "./editor-layout-admin-data";
import { EditorSectionReorderPanel } from "./editor-section-reorder-panel";
import { SectionRow, monoStyle } from "./section-editor-shared";

export async function SectionFieldsGroupTab({
  sp,
}: {
  sp: Record<string, string | undefined>;
}) {
  const data = await loadEditorLayoutAdmin();

  if (!data.ok) {
    return (
      <HqCard title="Section Fields Group">
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
          label="Sections"
          value={`${data.counts.activeSections}/${data.counts.sections}`}
        />
        <Stat label="Groups" value={data.counts.groups} />
        <Stat
          label="Orphan sections"
          value={data.orphanSections.length}
          tone={data.orphanSections.length > 0 ? HQ.amber : undefined}
        />
        <Stat
          label="Archived"
          value={data.counts.archivedSections}
          tone={data.counts.archivedSections > 0 ? HQ.amber : undefined}
        />
      </div>

      {/* Per-group blocks */}
      {data.groups.map((group) => (
        <div key={group.id} style={{ marginBottom: 24 }}>
          {/* Group header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              paddingBottom: 8,
              borderBottom: `1px solid ${HQ.borderSoft}`,
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: group.is_active ? HQ.ink : HQ.inkDim,
              }}
            >
              {group.label_en}
            </span>
            {group.label_es && (
              <span style={{ fontSize: 12, color: HQ.inkMuted }}>
                {group.label_es}
              </span>
            )}
            <span style={monoStyle}>slug: {group.slug}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                color: group.is_active ? HQ.green : HQ.red,
                border: `1px solid ${group.is_active ? HQ.green : HQ.red}44`,
                background: `${group.is_active ? HQ.green : HQ.red}1a`,
                borderRadius: 999,
                padding: "1px 8px",
                marginLeft: "auto",
              }}
            >
              {group.is_active ? "active" : "inactive"}
            </span>
            <span
              style={{ fontSize: 11, color: HQ.inkMuted, whiteSpace: "nowrap" }}
            >
              {group.sections.length} section
              {group.sections.length === 1 ? "" : "s"}
            </span>
          </div>

          {group.sections.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: HQ.inkDim,
                padding: "6px 0",
                marginBottom: 8,
              }}
            >
              No sections in this group.
            </div>
          ) : (
            /* Two columns: section edit cards (left) + section reorder (right) */
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 380px)",
                gap: 16,
                alignItems: "start",
              }}
            >
              {/* LEFT — section edit cards without field lists */}
              <div style={{ minWidth: 0 }}>
                {group.sections.map((section) => (
                  <SectionRow
                    key={section.id}
                    section={section}
                    groupOptions={data.groupOptions}
                    showFields={false}
                  />
                ))}
              </div>

              {/* RIGHT — section drag-reorder panel */}
              <div style={{ position: "sticky", top: 12, minWidth: 0 }}>
                {group.sections.length >= 2 ? (
                  <HqCard
                    title="Section order"
                    subtitle={`Drag to reorder sections within ${group.label_en}.`}
                  >
                    <EditorSectionReorderPanel
                      sectionGroupId={group.id}
                      sections={group.sections.map((s) => ({
                        id: s.id,
                        slug: s.slug,
                        label_en: s.label_en,
                        emoji: s.emoji,
                        sort_order: s.sort_order,
                        archived: !!s.archived_at,
                      }))}
                    />
                  </HqCard>
                ) : (
                  <HqCard title="Section order">
                    <div style={{ fontSize: 12, color: HQ.inkDim }}>
                      Add a second section to enable drag-reordering.
                    </div>
                  </HqCard>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Orphan sections — no group FK */}
      {data.orphanSections.length > 0 && (
        <HqCard
          title="Ungrouped sections"
          subtitle="These sections have no group and will not render in the rail. Move them into a group."
        >
          {data.orphanSections.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              groupOptions={data.groupOptions}
              showFields={false}
            />
          ))}
        </HqCard>
      )}
    </div>
  );
}
