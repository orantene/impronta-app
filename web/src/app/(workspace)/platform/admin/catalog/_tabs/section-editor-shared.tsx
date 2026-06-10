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
import type {
  EditorSectionRow,
  EditorGroupRow,
  UnmappedSectionBucket,
} from "./editor-layout-admin-data";

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

export function ActiveBadge({ active }: { active: boolean }) {
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
      {active ? "active" : "inactive"}
    </span>
  );
}

/** Field link row — links to the field detail editor drawer. */
export function FieldLink({
  field,
}: {
  field: EditorSectionRow["fields"][number];
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
          required
        </span>
      )}
      {field.deprecated && (
        <span style={{ fontSize: 9.5, color: HQ.inkDim }}>archived</span>
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
}: {
  section: EditorSectionRow;
  groupOptions: { id: string; label_en: string; is_active: boolean }[];
  showFields?: boolean;
}) {
  const archived = !!section.archived_at;
  return (
    <div
      style={{
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        background: HQ.cardSoft,
        opacity: archived ? 0.7 : 1,
      }}
    >
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
        <span style={monoStyle}>slug: {section.slug}</span>
        <CopyableId id={section.id} />
        {section.is_system && (
          <span style={{ fontSize: 10, color: HQ.inkDim }}>system</span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <ActiveBadge active={section.is_active && !archived} />
          {archived && (
            <span style={{ fontSize: 10, fontWeight: 800, color: HQ.red }}>
              ARCHIVED
            </span>
          )}
        </span>
      </div>

      {/* Edit label / emoji / active */}
      <form action={updateSection} style={{ display: "grid", gap: 10, marginBottom: 10 }}>
        <input type="hidden" name="id" value={section.id} />
        <div style={formGridStyle}>
          <FieldInput label="Label EN" name="label_en" defaultValue={section.label_en} />
          <FieldInput label="Label ES" name="label_es" defaultValue={section.label_es} />
          <FieldInput label="Emoji" name="emoji" defaultValue={section.emoji} />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Check name="is_active" label="Active" defaultChecked={section.is_active} />
          <SubmitButton>Save section</SubmitButton>
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
          Move to group
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
                {g.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton tone="neutral">Move</SubmitButton>
      </form>

      {/* Archive / restore + permanent remove */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <form action={archived ? restoreSection : archiveSection}>
          <input type="hidden" name="id" value={section.id} />
          <SubmitButton tone={archived ? "primary" : "danger"}>
            {archived ? "Restore section" : "Archive section"}
          </SubmitButton>
        </form>
        <form action={deleteSection}>
          <input type="hidden" name="id" value={section.id} />
          <ConfirmSubmitButton message="Permanently delete this section? The slug reference in code will break — verify no fields depend on it. This cannot be undone.">
            Permanently remove
          </ConfirmSubmitButton>
        </form>
      </div>

      {showFields && (
        <>
          <div
            style={{ fontSize: 11, color: HQ.inkMuted, marginBottom: 6, fontWeight: 600 }}
          >
            Catalog fields ({section.fields.length})
          </div>
          {section.fields.length === 0 ? (
            <div style={{ fontSize: 11, color: HQ.inkDim, padding: "4px 0" }}>
              No catalog fields mapped to this section.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {section.fields.map((field) => (
                <FieldLink key={field.field_key} field={field} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** GroupEditForm — the edit + archive form for a single section group. */
export function GroupEditForm({ group }: { group: EditorGroupRow }) {
  const activeSections = group.sections.filter(
    (s) => s.is_active && !s.archived_at,
  );
  return (
    <div
      style={{
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        background: HQ.cardSoft,
        opacity: group.is_active ? 1 : 0.72,
      }}
    >
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
        <span style={monoStyle}>slug: {group.slug}</span>
        <CopyableId id={group.id} />
        {group.is_system && (
          <span style={{ fontSize: 10, color: HQ.inkDim }}>system</span>
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
            {group.is_active ? "active" : "inactive"}
          </span>
        </span>
      </div>

      {group.label_en_alt && (
        <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 8 }}>
          alt header: &ldquo;{group.label_en_alt}&rdquo;
          {group.label_es_alt ? ` / "${group.label_es_alt}"` : ""}
        </div>
      )}

      <form
        action={updateSectionGroup}
        style={{ display: "grid", gap: 10, marginBottom: 12 }}
      >
        <input type="hidden" name="id" value={group.id} />
        <div style={formGridStyle}>
          <FieldInput label="Label (EN)" name="label_en" defaultValue={group.label_en} />
          <FieldInput label="Label (ES)" name="label_es" defaultValue={group.label_es} />
          <FieldInput
            label="Alt header (EN)"
            name="label_en_alt"
            defaultValue={group.label_en_alt}
            placeholder="e.g. Photos of work / venue"
          />
          <FieldInput
            label="Alt header (ES)"
            name="label_es_alt"
            defaultValue={group.label_es_alt}
          />
          <FieldInput
            label="Sort order"
            name="sort_order"
            type="number"
            defaultValue={group.sort_order}
          />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Check name="is_active" label="Active" defaultChecked={group.is_active} />
          <SubmitButton>Save group</SubmitButton>
        </div>
      </form>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <form action={group.is_active ? archiveSectionGroup : restoreSectionGroup}>
          <input type="hidden" name="id" value={group.id} />
          <SubmitButton tone={group.is_active ? "danger" : "primary"}>
            {group.is_active ? "Archive group" : "Restore group"}
          </SubmitButton>
        </form>
        {group.is_active && activeSections.length > 0 && (
          <span style={{ fontSize: 11, color: HQ.inkDim }}>
            Move or archive its {activeSections.length} active section
            {activeSections.length === 1 ? "" : "s"} first.
          </span>
        )}
        <form action={deleteSectionGroup}>
          <input type="hidden" name="id" value={group.id} />
          <ConfirmSubmitButton message="Permanently delete this section group? Member sections will be detached (not deleted). This cannot be undone.">
            Permanently remove
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

/** New section group creation form — collapsed by default via <details>. */
export function NewSectionGroupForm() {
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
        + New section group
      </summary>
      <div style={{ padding: "0 14px 14px" }}>
        <form action={createSectionGroup} style={{ display: "grid", gap: 10 }}>
          <div style={formGridStyle}>
            <FieldInput label="Slug *" name="slug" placeholder="e.g. profile" />
            <FieldInput
              label="Label (EN) *"
              name="label_en"
              placeholder="e.g. Profile"
            />
            <FieldInput label="Label (ES)" name="label_es" />
            <FieldInput label="Alt header (EN)" name="label_en_alt" />
            <FieldInput label="Alt header (ES)" name="label_es_alt" />
            <FieldInput
              label="Sort order"
              name="sort_order"
              type="number"
              placeholder="100"
            />
          </div>
          <div>
            <SubmitButton>Create group</SubmitButton>
          </div>
        </form>
      </div>
    </details>
  );
}

/** UnmappedCard — surfaces DB field-section values not bound to any editor section. */
export function UnmappedCard({
  unmappedSections,
}: {
  unmappedSections: UnmappedSectionBucket[];
}) {
  if (unmappedSections.length === 0) return null;
  return (
    <HqCard
      title="Unmapped field sections"
      subtitle="These DB field sections aren't bound to any profile-editor section yet."
    >
      <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginBottom: 12 }}>
        Each entry below is a distinct{" "}
        <span style={monoStyle}>profile_field_definitions.section</span> value
        that doesn&apos;t appear in the section→DB-section mapping. Add the value to{" "}
        <span style={monoStyle}>SECTION_FIELD_SECTIONS</span> in{" "}
        <span style={monoStyle}>editor-layout-admin-data.ts</span> to assign it.
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
              ({bucket.fields.length} field
              {bucket.fields.length === 1 ? "" : "s"})
            </span>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {bucket.fields.map((field) => (
              <FieldLink key={field.field_key} field={field} />
            ))}
          </div>
        </div>
      ))}
    </HqCard>
  );
}
