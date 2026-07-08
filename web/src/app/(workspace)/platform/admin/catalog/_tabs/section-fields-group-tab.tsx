// Tab 2 of the Section Editor cluster: Section Fields Group.
// Manages the 20 SECTIONS organised by group. Two-column layout per group:
//   LEFT  = section edit cards (SectionRow with showFields=false)
//   RIGHT = EditorSectionReorderPanel for that group
// Orphan sections (no group) are surfaced below.

import { HQ, HqCard, HqAccordion, Stat } from "../_ui";
import { SaveNotice } from "../[fieldKey]/field-detail-editor-parts";
import { loadEditorLayoutAdmin } from "./editor-layout-admin-data";
import { EditorSectionReorderPanel } from "./editor-section-reorder-panel";
import { SectionRow, monoStyle } from "./section-editor-shared";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

export async function SectionFieldsGroupTab({
  sp,
  t,
}: {
  sp: Record<string, string | undefined>;
  t: Translate;
}) {
  const data = await loadEditorLayoutAdmin();

  if (!data.ok) {
    return (
      <HqCard title={t(`${K}.sfgUnavailableTitle`)}>
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
          label={t(`${K}.sfgStatSections`)}
          value={`${data.counts.activeSections}/${data.counts.sections}`}
        />
        <Stat label={t(`${K}.sfgStatGroups`)} value={data.counts.groups} />
        <Stat
          label={t(`${K}.sfgStatOrphan`)}
          value={data.orphanSections.length}
          tone={data.orphanSections.length > 0 ? HQ.amber : undefined}
        />
        <Stat
          label={t(`${K}.sfgStatArchived`)}
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
            <span style={monoStyle}>{interpolate(t(`${K}.groupSlugLine`), { slug: group.slug })}</span>
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
              {group.is_active ? t(`${K}.badgeActive`) : t(`${K}.badgeInactive`)}
            </span>
            <span
              style={{ fontSize: 11, color: HQ.inkMuted, whiteSpace: "nowrap" }}
            >
              {interpolate(t(`${K}.${group.sections.length === 1 ? "sfgSectionsCountOne" : "sfgSectionsCountMany"}`), { count: group.sections.length })}
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
              {t(`${K}.sfgNoSectionsInGroup`)}
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
              {/* LEFT — section edit accordions without field lists */}
              <div style={{ minWidth: 0 }}>
                {group.sections.map((section) => (
                  <HqAccordion
                    key={section.id}
                    title={`${section.emoji ? `${section.emoji} ` : ""}${section.label_en}`}
                    meta={interpolate(t(`${K}.sfgSectionMeta`), { slug: section.slug, order: section.sort_order })}
                    badge={{
                      text:
                        section.archived_at
                          ? t(`${K}.badgeArchived`)
                          : section.is_active
                            ? t(`${K}.badgeActive`)
                            : t(`${K}.badgeInactive`),
                      tone: section.archived_at || !section.is_active ? HQ.red : HQ.green,
                    }}
                  >
                    <SectionRow
                      section={section}
                      groupOptions={data.groupOptions}
                      showFields={false}
                      embedded
                      t={t}
                    />
                  </HqAccordion>
                ))}
              </div>

              {/* RIGHT — section drag-reorder panel */}
              <div style={{ position: "sticky", top: 12, minWidth: 0 }}>
                {group.sections.length >= 2 ? (
                  <HqCard
                    title={t(`${K}.sectionOrderTitle`)}
                    subtitle={interpolate(t(`${K}.sectionOrderSubtitle`), { group: group.label_en })}
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
                  <HqCard title={t(`${K}.sectionOrderTitle`)}>
                    <div style={{ fontSize: 12, color: HQ.inkDim }}>
                      {t(`${K}.sectionOrderAddSecond`)}
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
          title={t(`${K}.sfgUngroupedTitle`)}
          subtitle={t(`${K}.sfgUngroupedSubtitle`)}
        >
          {data.orphanSections.map((section) => (
            <HqAccordion
              key={section.id}
              title={`${section.emoji ? `${section.emoji} ` : ""}${section.label_en}`}
              meta={interpolate(t(`${K}.sfgUngroupedMeta`), { slug: section.slug })}
              badge={{
                text: section.is_active ? t(`${K}.badgeActive`) : t(`${K}.badgeInactive`),
                tone: section.is_active ? HQ.green : HQ.red,
              }}
            >
              <SectionRow
                section={section}
                groupOptions={data.groupOptions}
                showFields={false}
                embedded
                t={t}
              />
            </HqAccordion>
          ))}
        </HqCard>
      )}
    </div>
  );
}
