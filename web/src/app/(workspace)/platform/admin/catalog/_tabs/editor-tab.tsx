// Editor Layout tab (B2). Lets a super_admin reorder / rename / move / archive
// the talent profile-editor sections + groups that B0 put in the DB and B1
// wired into the live editor.
//
// Data: loadEditorLayoutAdmin() (sibling) returns the FULL editable rows
// (UUIDs, alt labels, sort_order, is_active/is_system/archived_at, group FK)
// plus the catalog fields joined per section.slug — unlike
// loadProfileEditorLayout() which only exposes the rendered active structure.
//
// Mutations: ../../profile-editor/actions (createSectionGroup, updateSectionGroup,
// reorderSectionGroups, updateSection, moveSection, reorderSections,
// archive/restore section + group). Each redirects back to ?tab=editor.

import Link from "next/link";
import { HQ, F, FD, HqCard, HqAccordion, Stat } from "../_ui";
import { CopyableId } from "../copyable-id";
import {
  FieldInput,
  Check,
  SubmitButton,
  SaveNotice,
} from "../[fieldKey]/field-detail-editor-parts";
import {
  loadEditorLayoutAdmin,
  type EditorGroupRow,
  type EditorSectionRow,
} from "./editor-layout-admin-data";
import {
  createSectionGroup,
  updateSectionGroup,
  updateSection,
  moveSection,
  archiveSection,
  restoreSection,
  archiveSectionGroup,
  restoreSectionGroup,
} from "../../profile-editor/actions";
import { EditorGroupReorderPanel } from "./editor-group-reorder-panel";
import { EditorSectionReorderPanel } from "./editor-section-reorder-panel";

const monoStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 10.5,
  color: HQ.inkDim,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  alignItems: "end",
};

function ActiveBadge({ active }: { active: boolean }) {
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

function SectionFields({ section }: { section: EditorSectionRow }) {
  if (section.fields.length === 0) {
    return (
      <div style={{ fontSize: 11, color: HQ.inkDim, padding: "4px 0" }}>
        No direct catalog fields bind to{" "}
        <span style={monoStyle}>{section.slug}</span> (this section may be
        composed, not catalog-gated).
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {section.fields.map((field) => (
        <Link
          key={field.field_key}
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
            <span style={{ color: HQ.inkMuted, fontSize: 11 }}>
              {field.label_es}
            </span>
          )}
          <span style={{ ...monoStyle, marginLeft: "auto" }}>
            {field.field_key}
          </span>
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
      ))}
    </div>
  );
}

function SectionRow({
  section,
  groupOptions,
}: {
  section: EditorSectionRow;
  groupOptions: { id: string; label_en: string; is_active: boolean }[];
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
        <span style={{ fontFamily: FD, fontSize: 13.5, fontWeight: 650, color: HQ.ink }}>
          {section.label_en}
        </span>
        {section.label_es && (
          <span style={{ fontSize: 12, color: HQ.inkMuted }}>
            {section.label_es}
          </span>
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

      {/* Edit label / emoji / active (slug NOT editable) */}
      <form action={updateSection} style={{ display: "grid", gap: 10, marginBottom: 10 }}>
        <input type="hidden" name="id" value={section.id} />
        <div style={formGridStyle}>
          <FieldInput label="Label (EN)" name="label_en" defaultValue={section.label_en} />
          <FieldInput label="Label (ES)" name="label_es" defaultValue={section.label_es} />
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
        style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 10, flexWrap: "wrap" }}
      >
        <input type="hidden" name="id" value={section.id} />
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: HQ.inkMuted, fontWeight: 600 }}>
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

      {/* Archive / restore */}
      <form action={archived ? restoreSection : archiveSection} style={{ marginBottom: 12 }}>
        <input type="hidden" name="id" value={section.id} />
        <SubmitButton tone={archived ? "primary" : "danger"}>
          {archived ? "Restore section" : "Archive section"}
        </SubmitButton>
      </form>

      <div style={{ fontSize: 11, color: HQ.inkMuted, marginBottom: 6, fontWeight: 600 }}>
        Catalog fields in this section
      </div>
      <SectionFields section={section} />
    </div>
  );
}

function GroupBlock({
  group,
  groupOptions,
}: {
  group: EditorGroupRow;
  groupOptions: { id: string; label_en: string; is_active: boolean }[];
}) {
  const activeSections = group.sections.filter(
    (s) => s.is_active && !s.archived_at,
  );
  return (
    <HqAccordion
      title={`${group.label_en}`}
      meta={`${group.sections.length} section${group.sections.length === 1 ? "" : "s"} · #${group.sort_order}`}
      badge={{ text: group.is_active ? "active" : "inactive", tone: group.is_active ? HQ.green : HQ.red }}
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
        <CopyableId id={group.id} />
        <span style={monoStyle}>slug: {group.slug}</span>
        {group.label_es && (
          <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>{group.label_es}</span>
        )}
        {group.label_en_alt && (
          <span style={{ fontSize: 11, color: HQ.inkDim }}>
            alt header: “{group.label_en_alt}”
            {group.label_es_alt ? ` / “${group.label_es_alt}”` : ""}
          </span>
        )}
        {group.is_system && (
          <span style={{ fontSize: 10, color: HQ.inkDim }}>system</span>
        )}
      </div>

      {/* Edit group */}
      <form action={updateSectionGroup} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
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
          <FieldInput label="Alt header (ES)" name="label_es_alt" defaultValue={group.label_es_alt} />
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

      {/* Archive / restore group */}
      <form action={group.is_active ? archiveSectionGroup : restoreSectionGroup} style={{ marginBottom: 14 }}>
        <input type="hidden" name="id" value={group.id} />
        <SubmitButton tone={group.is_active ? "danger" : "primary"}>
          {group.is_active ? "Archive group" : "Restore group"}
        </SubmitButton>
        {group.is_active && activeSections.length > 0 && (
          <span style={{ fontSize: 11, color: HQ.inkDim, marginLeft: 10 }}>
            Move or archive its {activeSections.length} active section
            {activeSections.length === 1 ? "" : "s"} first.
          </span>
        )}
      </form>

      {/* Reorder sections in this group */}
      {group.sections.length >= 2 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: HQ.inkMuted, marginBottom: 6, fontWeight: 600 }}>
            Section order
          </div>
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
        </div>
      )}

      {/* Sections */}
      {group.sections.length === 0 ? (
        <div style={{ fontSize: 12, color: HQ.inkDim }}>No sections in this group.</div>
      ) : (
        group.sections.map((section) => (
          <SectionRow key={section.id} section={section} groupOptions={groupOptions} />
        ))
      )}
    </HqAccordion>
  );
}

export async function EditorTab({ sp }: { sp: Record<string, string | undefined> }) {
  const data = await loadEditorLayoutAdmin();

  if (!data.ok) {
    return (
      <HqCard title="Editor Layout">
        <SaveNotice saved={sp.saved} error={sp.error} />
        <div style={{ fontSize: 13, color: HQ.inkMuted }}>
          Could not load the profile-editor layout. The service client may be
          unavailable, or the layout tables are empty (the live editor falls
          back to the hardcoded structure).
        </div>
      </HqCard>
    );
  }

  return (
    <div>
      <SaveNotice saved={sp.saved} error={sp.error} />

      <HqCard
        title="Editor Layout"
        subtitle="Reorder, rename, move, and archive the talent profile-editor sections and their groups. Changes drive the live editor rail. Soft-archive only; slugs are immutable."
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <Stat label="Groups" value={`${data.counts.activeGroups}/${data.counts.groups}`} />
          <Stat
            label="Sections"
            value={`${data.counts.activeSections}/${data.counts.sections}`}
          />
          <Stat
            label="Archived"
            value={data.counts.archivedSections}
            tone={data.counts.archivedSections > 0 ? HQ.amber : undefined}
          />
        </div>

        {/* New section group */}
        <details className="hq-acc" style={{ marginBottom: 6 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 700,
              color: HQ.green,
              userSelect: "none",
            }}
          >
            + New section group
          </summary>
          <form action={createSectionGroup} style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div style={formGridStyle}>
              <FieldInput label="Slug *" name="slug" placeholder="e.g. profile" />
              <FieldInput label="Label (EN) *" name="label_en" placeholder="e.g. Profile" />
              <FieldInput label="Label (ES)" name="label_es" />
              <FieldInput label="Alt header (EN)" name="label_en_alt" />
              <FieldInput label="Alt header (ES)" name="label_es_alt" />
              <FieldInput label="Sort order" name="sort_order" type="number" placeholder="100" />
            </div>
            <div>
              <SubmitButton>Create group</SubmitButton>
            </div>
          </form>
        </details>
      </HqCard>

      {/* Group order */}
      {data.groups.length >= 2 && (
        <HqCard title="Group order" subtitle="Drag to set the order of the profile-editor rail groups.">
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
      )}

      {/* Groups + their sections */}
      {data.groups.length === 0 ? (
        <HqCard title="No section groups">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            No section groups defined yet. Create one above.
          </div>
        </HqCard>
      ) : (
        data.groups.map((group) => (
          <GroupBlock key={group.id} group={group} groupOptions={data.groupOptions} />
        ))
      )}

      {/* Orphan sections (no group FK) — surfaced so they're not lost */}
      {data.orphanSections.length > 0 && (
        <HqCard
          title="Ungrouped sections"
          subtitle="These sections have no group and will not render in the rail. Move them into a group."
        >
          {data.orphanSections.map((section) => (
            <SectionRow key={section.id} section={section} groupOptions={data.groupOptions} />
          ))}
        </HqCard>
      )}
    </div>
  );
}
