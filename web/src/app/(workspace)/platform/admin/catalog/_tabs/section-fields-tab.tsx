// Tab 3 of the Section Editor cluster: Section Fields.
// Accordion per section (grouped under group headers). Expand → two columns:
//   LEFT  = FieldLink list (click → field detail editor)
//   RIGHT = SectionFieldOrderPanel (drag-to-reorder section's fields)
// Final card: UnmappedCard (DB field sections not bound to any editor section).

import { HQ, HqAccordion, Stat } from "../_ui";
import { HqCard } from "../_ui";
import { SaveNotice } from "../[fieldKey]/field-detail-editor-parts";
import { loadEditorLayoutAdmin } from "./editor-layout-admin-data";
import { SectionFieldOrderPanel } from "./section-field-order-panel";
import { FieldLink, monoStyle, UnmappedCard } from "./section-editor-shared";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

export async function SectionFieldsTab({
  sp,
  t,
}: {
  sp: Record<string, string | undefined>;
  t: Translate;
}) {
  const data = await loadEditorLayoutAdmin();

  if (!data.ok) {
    return (
      <HqCard title={t(`${K}.tabSectionFields`)}>
        <SaveNotice saved={sp.saved} error={sp.error} />
        <div style={{ fontSize: 13, color: HQ.inkMuted }}>
          {t(`${K}.sectionEditorUnavailableBody`)}
        </div>
      </HqCard>
    );
  }

  // Count total mapped fields
  const totalMapped = data.groups.reduce(
    (sum, g) =>
      sum + g.sections.reduce((s2, sec) => s2 + sec.fields.length, 0),
    0,
  );
  const totalUnmapped = data.unmappedSections.reduce(
    (sum, b) => sum + b.fields.length,
    0,
  );

  return (
    <div>
      <SaveNotice saved={sp.saved} error={sp.error} />

      {/* Stats strip */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}
      >
        <Stat label={t(`${K}.sfStatMapped`)} value={totalMapped} />
        <Stat
          label={t(`${K}.sfStatUnmapped`)}
          value={totalUnmapped}
          tone={totalUnmapped > 0 ? HQ.amber : undefined}
        />
        <Stat label={t(`${K}.sfStatSections`)} value={data.counts.sections} />
      </div>

      {/* Per-group + per-section accordions */}
      {data.groups.map((group) => (
        <div key={group.id} style={{ marginBottom: 20 }}>
          {/* Group header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: `1px solid ${HQ.borderSoft}`,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: group.is_active ? HQ.ink : HQ.inkDim,
                letterSpacing: 0.2,
              }}
            >
              {group.label_en}
            </span>
            {group.label_es && (
              <span style={{ fontSize: 11, color: HQ.inkMuted }}>
                {group.label_es}
              </span>
            )}
            <span style={monoStyle}>{group.slug}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: group.is_active ? HQ.green : HQ.red,
                marginLeft: "auto",
              }}
            >
              {group.is_active ? t(`${K}.badgeActive`) : t(`${K}.badgeInactive`)}
            </span>
          </div>

          {group.sections.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: HQ.inkDim,
                padding: "4px 0 10px",
              }}
            >
              {t(`${K}.sfNoSectionsInGroup`)}
            </div>
          ) : (
            group.sections.map((section) => {
              const fieldCount = section.fields.length;
              return (
                <HqAccordion
                  key={section.id}
                  title={`${section.emoji ? `${section.emoji} ` : ""}${section.label_en}`}
                  meta={interpolate(t(`${K}.${fieldCount === 1 ? "sfSectionMetaOne" : "sfSectionMetaMany"}`), { count: fieldCount })}
                  badge={
                    !section.is_active || !!section.archived_at
                      ? {
                          text: section.archived_at ? t(`${K}.badgeArchived`) : t(`${K}.badgeInactive`),
                          tone: HQ.red,
                        }
                      : undefined
                  }
                >
                  {fieldCount === 0 ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: HQ.inkDim,
                        padding: "4px 0",
                      }}
                    >
                      {t(`${K}.sfNoCatalogFields`)}
                    </div>
                  ) : (
                    /* Two columns: field links (left) + drag reorder (right) */
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          fieldCount >= 2
                            ? "minmax(0, 1fr) minmax(260px, 360px)"
                            : "1fr",
                        gap: 14,
                        alignItems: "start",
                      }}
                    >
                      {/* LEFT — clickable field link rows */}
                      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                        {section.fields.map((field) => (
                          <FieldLink key={field.field_key} field={field} t={t} />
                        ))}
                      </div>

                      {/* RIGHT — drag-to-reorder panel (only when ≥2 fields) */}
                      {fieldCount >= 2 && (
                        <div style={{ minWidth: 0 }}>
                          <SectionFieldOrderPanel
                            fields={section.fields.map((f) => ({
                              id: f.id,
                              field_key: f.field_key,
                              label: f.label,
                              display_order: f.display_order,
                            }))}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </HqAccordion>
              );
            })
          )}
        </div>
      ))}

      {/* Orphan sections (no group) */}
      {data.orphanSections.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: HQ.amber,
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: `1px solid ${HQ.borderSoft}`,
            }}
          >
            {t(`${K}.sfUngroupedTitle`)}
          </div>
          {data.orphanSections.map((section) => {
            const fieldCount = section.fields.length;
            return (
              <HqAccordion
                key={section.id}
                title={`${section.emoji ? `${section.emoji} ` : ""}${section.label_en}`}
                meta={interpolate(t(`${K}.${fieldCount === 1 ? "sfUngroupedMetaOne" : "sfUngroupedMetaMany"}`), { count: fieldCount })}
                badge={{ text: t(`${K}.badgeUngrouped`), tone: HQ.amber }}
              >
                {fieldCount === 0 ? (
                  <div style={{ fontSize: 11, color: HQ.inkDim }}>
                    {t(`${K}.sfNoCatalogFields`)}
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        fieldCount >= 2
                          ? "minmax(0, 1fr) minmax(260px, 360px)"
                          : "1fr",
                      gap: 14,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                      {section.fields.map((field) => (
                        <FieldLink key={field.field_key} field={field} t={t} />
                      ))}
                    </div>
                    {fieldCount >= 2 && (
                      <div style={{ minWidth: 0 }}>
                        <SectionFieldOrderPanel
                          fields={section.fields.map((f) => ({
                            id: f.id,
                            field_key: f.field_key,
                            label: f.label,
                            display_order: f.display_order,
                          }))}
                        />
                      </div>
                    )}
                  </div>
                )}
              </HqAccordion>
            );
          })}
        </div>
      )}

      {/* Unmapped DB field-section values */}
      <UnmappedCard unmappedSections={data.unmappedSections} t={t} />
    </div>
  );
}
