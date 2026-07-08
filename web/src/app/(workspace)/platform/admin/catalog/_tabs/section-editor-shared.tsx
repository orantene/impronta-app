// Shared presentational primitives for the three Section Editor tabs.
// Extracted from editor-tab.tsx so SectionCategoryTab, SectionFieldsGroupTab,
// and SectionFieldsTab can all reuse them without re-importing from the
// monolithic editor-tab.

import Link from "next/link";
import { HQ, F, FD, HqCard } from "../_ui";
import { CopyableId } from "../copyable-id";
import {
  FieldInput,
  Check,
  SubmitButton,
} from "../[fieldKey]/field-detail-editor-parts";
import {
  createSectionGroup,
  updateSectionGroup,
  archiveSectionGroup,
  restoreSectionGroup,
  deleteSectionGroup,
  updateSection,
  moveSection,
  archiveSection,
  restoreSection,
  deleteSection,
} from "../../profile-editor/actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { interpolate } from "@/i18n/interpolate";
import type {
  EditorSectionRow,
  EditorGroupRow,
  UnmappedSectionBucket,
} from "./editor-layout-admin-data";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

export const monoStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 10.5,
  color: HQ.inkDim,
};

export const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  alignItems: "end",
};

export function ActiveBadge({ active, t }: { active: boolean; t: Translate }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
        color: active ? HQ.green : HQ.red,
        border: `1px solid ${active ? HQ.green : HQ.red}44`,
        background: `${active ? HQ.green : HQ.red}1a`,
        borderRadius: 999,
        padding: "1px 8px",
      }}
    >
      {active ? t(`${K}.badgeActive`) : t(`${K}.badgeInactive`)}
    </span>
  );
}

/** Field link row — links to the field detail editor drawer. */
export function FieldLink({
  field,
  t,
}: {
  field: EditorSectionRow["fields"][number];
  t: Translate;
}) {
  return (
    <Link
      href={`/platform/admin/catalog/${encodeURIComponent(field.field_key)}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 8px",
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 8,
        background: HQ.cardSoft,
        color: HQ.ink,
        textDecoration: "none",
        fontSize: 12,
        opacity: field.deprecated ? 0.56 : 1,
      }}
    >
      <span style={{ fontWeight: 650 }}>{field.label}</span>
      {field.label_es && (
        <span style={{ color: HQ.inkMuted, fontSize: 11 }}>{field.label_es}</span>
      )}
      <span style={{ ...monoStyle, marginLeft: "auto" }}>{field.field_key}</span>
      {field.tier && field.tier !== "universal" && (
        <span style={{ fontSize: 9.5, color: HQ.inkDim }}>{field.tier}</span>
      )}
      {field.render_mode === "bespoke" && (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.2,
            color: HQ.violet,
            border: `1px solid ${HQ.violet}44`,
            background: `${HQ.violet}1a`,
            borderRadius: 999,
            padding: "1px 6px",
          }}
          title={t(`${K}.fieldCustomEditorTitle`)}
        >
          {t(`${K}.fieldCustomEditor`)}
        </span>
      )}
      {field.required_default && (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            textTransform: "uppercase",
            color: HQ.red,
            border: `1px solid ${HQ.red}44`,
            borderRadius: 999,
            padding: "1px 6px",
          }}
        >
          {t(`${K}.fieldRequiredBadge`)}
        </span>
      )}
      {field.deprecated && (
        <span style={{ fontSize: 9.5, color: HQ.inkDim }}>{t(`${K}.fieldArchivedBadge`)}</span>
      )}
    </Link>
  );
}

/**
 * SectionRow — the edit card for a single profile-editor section.
 * showFields (default true): when false the "Catalog fields" list is omitted
 * so tab 2 (Section Fields Group) can focus purely on section management.
 */
export function SectionRow({
  section,
  groupOptions,
  showFields = true,
  embedded = false,
  t,
}: {
  section: EditorSectionRow;
  groupOptions: { id: string; label_en: string; is_active: boolean }[];
  showFields?: boolean;
  /** When true the card chrome + name/badge header is dropped — the parent
   *  accordion supplies them; only a compact id/slug line + the forms render. */
  embedded?: boolean;
  t: Translate;
}) {
  const archived = !!section.archived_at;
  return (
    <div
      style={
        embedded
          ? { opacity: archived ? 0.7 : 1 }
          : {
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
              background: HQ.cardSoft,
              opacity: archived ? 0.7 : 1,
            }
      }
    >
      {embedded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={monoStyle}>{interpolate(t(`${K}.groupSlugLine`), { slug: section.slug })}</span>
          <CopyableId id={section.id} />
          {section.is_system && (
            <span style={{ fontSize: 10, color: HQ.inkDim }}>{t(`${K}.badgeSystem`)}</span>
          )}
          {archived && (
            <span style={{ fontSize: 10, fontWeight: 800, color: HQ.red }}>{t(`${K}.badgeArchivedCaps`)}</span>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 16 }}>{section.emoji}</span>
          <span
            style={{ fontFamily: FD, fontSize: 13.5, fontWeight: 650, color: HQ.ink }}
          >
            {section.label_en}
          </span>
          {section.label_es && (
            <span style={{ fontSize: 12, color: HQ.inkMuted }}>{section.label_es}</span>
          )}
          <span style={monoStyle}>{interpolate(t(`${K}.groupSlugLine`), { slug: section.slug })}</span>
          <CopyableId id={section.id} />
          {section.is_system && (
            <span style={{ fontSize: 10, color: HQ.inkDim }}>{t(`${K}.badgeSystem`)}</span>
          )}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <ActiveBadge active={section.is_active && !archived} t={t} />
            {archived && (
              <span style={{ fontSize: 10, fontWeight: 800, color: HQ.red }}>
                {t(`${K}.badgeArchivedCaps`)}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Edit label / emoji / active */}
      <form action={updateSection} style={{ display: "grid", gap: 10, marginBottom: 10 }}>
        <input type="hidden" name="id" value={section.id} />
        <div style={formGridStyle}>
          <FieldInput label={t(`${K}.sectionLabelEnField`)} name="label_en" defaultValue={section.label_en} />
          <FieldInput label={t(`${K}.sectionLabelEsField`)} name="label_es" defaultValue={section.label_es} />
          <FieldInput label={t(`${K}.sectionEmojiField`)} name="emoji" defaultValue={section.emoji} />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Check name="is_active" label={t(`${K}.checkActive`)} defaultChecked={section.is_active} />
          <SubmitButton>{t(`${K}.saveSection`)}</SubmitButton>
        </div>
      </form>

      {/* Move into another group */}
      <form
        action={moveSection}
        style={{
          display: "flex",
          gap: 8,
          alignItems: "end",
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <input type="hidden" name="id" value={section.id} />
        <label
          style={{
            display: "grid",
            gap: 5,
            fontSize: 11,
            color: HQ.inkMuted,
            fontWeight: 600,
          }}
        >
          {t(`${K}.moveToGroup`)}
          <select
            name="section_group_id"
            defaultValue={section.section_group_id ?? ""}
            style={{
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 8,
              background: "#101014",
              color: HQ.ink,
              padding: "8px 10px",
              fontSize: 12.5,
              fontFamily: F,
            }}
          >
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label_en}
                {g.is_active ? "" : t(`${K}.groupInactiveSuffix`)}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton tone="neutral">{t(`${K}.move`)}</SubmitButton>
      </form>

      {/* Archive / restore + permanent remove */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <form action={archived ? restoreSection : archiveSection}>
          <input type="hidden" name="id" value={section.id} />
          <SubmitButton tone={archived ? "primary" : "danger"}>
            {archived ? t(`${K}.restoreSection`) : t(`${K}.archiveSection`)}
          </SubmitButton>
        </form>
        <form action={deleteSection}>
          <input type="hidden" name="id" value={section.id} />
          <ConfirmSubmitButton message={t(`${K}.confirmDeleteSection`)}>
            {t(`${K}.permanentlyRemove`)}
          </ConfirmSubmitButton>
        </form>
      </div>

      {showFields && (
        <>
          <div
            style={{ fontSize: 11, color: HQ.inkMuted, marginBottom: 6, fontWeight: 600 }}
          >
            {interpolate(t(`${K}.catalogFieldsCount`), { count: section.fields.length })}
          </div>
          {section.fields.length === 0 ? (
            <div style={{ fontSize: 11, color: HQ.inkDim, padding: "4px 0" }}>
              {t(`${K}.sectionNoFields`)}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {section.fields.map((field) => (
                <FieldLink key={field.field_key} field={field} t={t} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** GroupEditForm — the edit + archive form for a single section group. */
export function GroupEditForm({
  group,
  embedded = false,
  t,
}: {
  group: EditorGroupRow;
  /** When true the card chrome + name/badge header is dropped — the parent
   *  accordion supplies them; only a compact id/slug line + the forms render. */
  embedded?: boolean;
  t: Translate;
}) {
  const activeSections = group.sections.filter(
    (s) => s.is_active && !s.archived_at,
  );
  return (
    <div
      style={
        embedded
          ? { opacity: group.is_active ? 1 : 0.72 }
          : {
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              padding: 14,
              marginBottom: 10,
              background: HQ.cardSoft,
              opacity: group.is_active ? 1 : 0.72,
            }
      }
    >
      {embedded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={monoStyle}>{interpolate(t(`${K}.groupSlugLine`), { slug: group.slug })}</span>
          <CopyableId id={group.id} />
          {group.is_system && (
            <span style={{ fontSize: 10, color: HQ.inkDim }}>{t(`${K}.badgeSystem`)}</span>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <span
            style={{ fontFamily: FD, fontSize: 14, fontWeight: 650, color: HQ.ink }}
          >
            {group.label_en}
          </span>
          {group.label_es && (
            <span style={{ fontSize: 12, color: HQ.inkMuted }}>{group.label_es}</span>
          )}
          <span style={monoStyle}>{interpolate(t(`${K}.groupSlugLine`), { slug: group.slug })}</span>
          <CopyableId id={group.id} />
          {group.is_system && (
            <span style={{ fontSize: 10, color: HQ.inkDim }}>{t(`${K}.badgeSystem`)}</span>
          )}
          <span style={{ marginLeft: "auto" }}>
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
              }}
            >
              {group.is_active ? t(`${K}.badgeActive`) : t(`${K}.badgeInactive`)}
            </span>
          </span>
        </div>
      )}

      {group.label_en_alt && (
        <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 8 }}>
          {group.label_es_alt
            ? interpolate(t(`${K}.sectionAltHeaderBoth`), { en: group.label_en_alt, es: group.label_es_alt })
            : interpolate(t(`${K}.sectionAltHeader`), { en: group.label_en_alt })}
        </div>
      )}

      <form
        action={updateSectionGroup}
        style={{ display: "grid", gap: 10, marginBottom: 12 }}
      >
        <input type="hidden" name="id" value={group.id} />
        <div style={formGridStyle}>
          <FieldInput label={t(`${K}.sectionGroupLabelEn`)} name="label_en" defaultValue={group.label_en} />
          <FieldInput label={t(`${K}.sectionGroupLabelEs`)} name="label_es" defaultValue={group.label_es} />
          <FieldInput
            label={t(`${K}.sectionAltHeaderEn`)}
            name="label_en_alt"
            defaultValue={group.label_en_alt}
            placeholder="e.g. Photos of work / venue"
          />
          <FieldInput
            label={t(`${K}.sectionAltHeaderEs`)}
            name="label_es_alt"
            defaultValue={group.label_es_alt}
          />
          <FieldInput
            label={t(`${K}.fieldSortOrder`)}
            name="sort_order"
            type="number"
            defaultValue={group.sort_order}
          />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Check name="is_active" label={t(`${K}.checkActive`)} defaultChecked={group.is_active} />
          <SubmitButton>{t(`${K}.saveGroup`)}</SubmitButton>
        </div>
      </form>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <form action={group.is_active ? archiveSectionGroup : restoreSectionGroup}>
          <input type="hidden" name="id" value={group.id} />
          <SubmitButton tone={group.is_active ? "danger" : "primary"}>
            {group.is_active ? t(`${K}.archiveGroup`) : t(`${K}.restoreGroup`)}
          </SubmitButton>
        </form>
        {group.is_active && activeSections.length > 0 && (
          <span style={{ fontSize: 11, color: HQ.inkDim }}>
            {interpolate(t(`${K}.${activeSections.length === 1 ? "sectionGroupSaveMoveHintOne" : "sectionGroupSaveMoveHintMany"}`), { count: activeSections.length })}
          </span>
        )}
        <form action={deleteSectionGroup}>
          <input type="hidden" name="id" value={group.id} />
          <ConfirmSubmitButton message={t(`${K}.confirmDeleteSectionGroup`)}>
            {t(`${K}.permanentlyRemove`)}
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

/** New section group creation form — collapsed by default via <details>. */
export function NewSectionGroupForm({ t }: { t: Translate }) {
  return (
    <details
      className="hq-acc"
      style={{
        marginBottom: 12,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        background: HQ.cardSoft,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: 12.5,
          fontWeight: 700,
          color: HQ.green,
          userSelect: "none",
          padding: "10px 14px",
        }}
      >
        {t(`${K}.newSectionGroup`)}
      </summary>
      <div style={{ padding: "0 14px 14px" }}>
        <form action={createSectionGroup} style={{ display: "grid", gap: 10 }}>
          <div style={formGridStyle}>
            <FieldInput label={t(`${K}.fieldSlugRequired`)} name="slug" placeholder="e.g. profile" />
            <FieldInput
              label={t(`${K}.sectionLabelEnRequired`)}
              name="label_en"
              placeholder="e.g. Profile"
            />
            <FieldInput label={t(`${K}.sectionLabelEs`)} name="label_es" />
            <FieldInput label={t(`${K}.sectionAltHeaderEn`)} name="label_en_alt" />
            <FieldInput label={t(`${K}.sectionAltHeaderEs`)} name="label_es_alt" />
            <FieldInput
              label={t(`${K}.fieldSortOrder`)}
              name="sort_order"
              type="number"
              placeholder="100"
            />
          </div>
          <div>
            <SubmitButton>{t(`${K}.createSectionGroup`)}</SubmitButton>
          </div>
        </form>
      </div>
    </details>
  );
}

/** UnmappedCard — surfaces DB field-section values not bound to any editor section. */
export function UnmappedCard({
  unmappedSections,
  t,
}: {
  unmappedSections: UnmappedSectionBucket[];
  t: Translate;
}) {
  if (unmappedSections.length === 0) return null;
  return (
    <HqCard
      title={t(`${K}.unmappedTitle`)}
      subtitle={t(`${K}.unmappedSubtitle`)}
    >
      <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginBottom: 12 }}>
        {interpolate(t(`${K}.unmappedBody`), {
          col: "profile_field_definitions.section",
          const: "SECTION_FIELD_SECTIONS",
          file: "editor-layout-admin-data.ts",
        })}
      </div>
      {unmappedSections.map((bucket) => (
        <div key={bucket.section} style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: HQ.amber,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              marginBottom: 6,
            }}
          >
            {bucket.section}{" "}
            <span style={{ fontWeight: 400, color: HQ.inkDim }}>
              {interpolate(t(`${K}.${bucket.fields.length === 1 ? "unmappedFieldsOne" : "unmappedFieldsMany"}`), { count: bucket.fields.length })}
            </span>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {bucket.fields.map((field) => (
              <FieldLink key={field.field_key} field={field} t={t} />
            ))}
          </div>
        </div>
      ))}
    </HqCard>
  );
}
