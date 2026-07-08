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
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

export async function SectionCategoryTab({
  sp,
  t,
}: {
  sp: Record<string, string | undefined>;
  t: Translate;
}) {
  const data = await loadEditorLayoutAdmin();

  if (!data.ok) {
    return (
      <HqCard title={t(`${K}.sectionCatUnavailableTitle`)}>
        <SaveNotice saved={sp.saved} error={sp.error} />
        <div style={{ fontSize: 13, color: HQ.inkMuted }}>
          {t(`${K}.sectionEditorUnavailableBody`)}
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
          label={t(`${K}.statGroups`)}
          value={`${data.counts.activeGroups}/${data.counts.groups}`}
        />
        {/* Active = active ÷ live (non-archived) sections, so the archived rows
            aren't implied twice — they get their own "Archived" stat below. */}
        <Stat
          label={t(`${K}.sectionStatActiveSections`)}
          value={`${data.counts.activeSections}/${data.counts.sections - data.counts.archivedSections}`}
        />
        <Stat
          label={t(`${K}.sectionStatArchived`)}
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
          <NewSectionGroupForm t={t} />

          {data.groups.length === 0 ? (
            <HqCard title={t(`${K}.sectionCatNoGroupsTitle`)}>
              <div style={{ fontSize: 13, color: HQ.inkMuted }}>
                {t(`${K}.sectionCatNoGroupsBody`)}
              </div>
            </HqCard>
          ) : (
            data.groups.map((group) => (
              <HqAccordion
                key={group.id}
                title={group.label_en}
                meta={interpolate(t(`${K}.${group.sections.length === 1 ? "sectionGroupMetaOne" : "sectionGroupMetaMany"}`), { slug: group.slug, count: group.sections.length, order: group.sort_order })}
                badge={{
                  text: group.is_active ? t(`${K}.badgeActive`) : t(`${K}.badgeInactive`),
                  tone: group.is_active ? HQ.green : HQ.red,
                }}
              >
                <GroupEditForm group={group} embedded t={t} />
              </HqAccordion>
            ))
          )}
        </div>

        {/* RIGHT — drag reorder panel (sticky) */}
        <div style={{ position: "sticky", top: 12, minWidth: 0 }}>
          {data.groups.length >= 2 ? (
            <HqCard
              title={t(`${K}.groupOrderTitle`)}
              subtitle={t(`${K}.sectionGroupOrderSubtitle`)}
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
            <HqCard title={t(`${K}.groupOrderTitle`)}>
              <div style={{ fontSize: 12, color: HQ.inkDim }}>
                {t(`${K}.sectionGroupOrderAddSecond`)}
              </div>
            </HqCard>
          )}
        </div>
      </div>
    </div>
  );
}
