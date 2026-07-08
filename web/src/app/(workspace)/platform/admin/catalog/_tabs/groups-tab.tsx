// Platform HQ · Catalog · Groups tab.
// Two-column layout matching the Section Editor cluster:
//   LEFT  = "+ New field group" collapsed form + one HqAccordion per group with
//           inline edit + archive/restore + permanent-remove + fields list.
//   RIGHT = FieldGroupsReorderPanel (sticky drag-order card).

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { HQ, HqCard, HqAccordion, Stat, CopyableId } from "../_ui";
import {
  FieldInput,
  FieldTextarea,
  Check,
  SubmitButton,
  SaveNotice,
} from "../[fieldKey]/field-detail-editor-parts";
import {
  createPlatformFieldGroupAction,
  updatePlatformFieldGroupAction,
  setPlatformFieldGroupLifecycleAction,
  deletePlatformFieldGroupAction,
} from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { FieldGroupsReorderPanel } from "../groups/field-groups-reorder-panel";
import { byLabel } from "@/lib/field-engine/sort-comparators";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type FieldRef = {
  field_key: string;
  label: string;
};

type GroupListRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  description_en: string | null;
  description_es: string | null;
  sort_order: number;
  is_active: boolean;
  field_count: number;
  mapped_talent_types: string[];
  fields: FieldRef[];
};

async function loadGroupList(): Promise<GroupListRow[] | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  try {
    const [groupsR, fieldsR] = await Promise.all([
      sb
        .from("profile_field_groups")
        // WS3 i18n migration: name_en/name_es folded into name_i18n {en,es}.
        // description_en/description_es were left OUT OF SCOPE (still columns).
        .select(
          "id, slug, name_i18n, description_en, description_es, sort_order, is_active",
        )
        .order("sort_order", { ascending: true }),
      sb
        .from("profile_field_definitions")
        // label folded into label_i18n {en,es} (WS3); resolved to .en below.
        .select("id, field_key, label_i18n, field_group_id"),
    ]);

    if (groupsR.error) return null;

    type RawField = {
      id: string;
      field_key: string;
      label_i18n: Record<string, string | null> | null;
      field_group_id: string | null;
    };

    const fieldsByGroup = new Map<string, RawField[]>();
    for (const row of (fieldsR.data ?? []) as RawField[]) {
      if (!row.field_group_id) continue;
      const list = fieldsByGroup.get(row.field_group_id) ?? [];
      list.push(row);
      fieldsByGroup.set(row.field_group_id, list);
    }

    // Best-effort: fetch taxonomy term names for mapped types.
    const allFieldIds = (fieldsR.data ?? [])
      .filter(
        (r): r is RawField => !!(r as RawField).field_group_id,
      )
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
            // name_en folded into name_i18n {en,es} (WS4 migration).
            .select("id, name_i18n")
            .in("id", termIds);

          const termNameById = new Map(
            (
              (termsR.data ?? []) as Array<{ id: string; name_i18n: Record<string, string | null> | null }>
            ).map((t) => [t.id, t.name_i18n?.en ?? ""]),
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

    type RawGroup = {
      id: string;
      slug: string;
      // name_en/name_es folded into name_i18n {en,es} (WS3 migration).
      name_i18n: Record<string, string | null> | null;
      description_en: string | null;
      description_es: string | null;
      sort_order: number;
      is_active: boolean;
    };

    return (groupsR.data as RawGroup[])
      .map((g) => {
        const groupFields = fieldsByGroup.get(g.id) ?? [];
        const uniqueTypes = [
          ...new Set(
            groupFields.flatMap(
              (f) => termNameByFieldId.get(f.id) ?? [],
            ),
          ),
        ].sort();
        return {
          id: g.id,
          slug: g.slug,
          name_en: g.name_i18n?.en ?? "",
          name_es: g.name_i18n?.es ?? null,
          description_en: g.description_en ?? null,
          description_es: g.description_es ?? null,
          sort_order: g.sort_order ?? 100,
          is_active: g.is_active !== false,
          field_count: groupFields.length,
          mapped_talent_types: uniqueTypes,
          fields: groupFields
            .map((f) => ({ field_key: f.field_key, label: f.label_i18n?.en ?? "" }))
            .sort(byLabel),
        };
      })
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en),
      );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared style helpers (kept local — no dep on section-editor-shared)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// "+ New field group" collapsed form
// ---------------------------------------------------------------------------

function NewFieldGroupForm({ t }: { t: Translate }) {
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
        {t(`${K}.newFieldGroup`)}
      </summary>
      <div style={{ padding: "0 14px 14px" }}>
        <form
          action={createPlatformFieldGroupAction}
          style={{ display: "grid", gap: 10 }}
        >
          <div style={formGridStyle}>
            <FieldInput label={t(`${K}.fieldSlugRequired`)} name="slug" placeholder="e.g. appearance" />
            <FieldInput
              label={t(`${K}.fieldNameEnRequired`)}
              name="name_en"
              placeholder="e.g. Appearance"
            />
            <FieldInput label={t(`${K}.fieldNameEs`)} name="name_es" />
            <FieldInput
              label={t(`${K}.fieldSortOrder`)}
              name="sort_order"
              type="number"
              placeholder="100"
            />
          </div>
          <div>
            <SubmitButton>{t(`${K}.createGroup`)}</SubmitButton>
          </div>
        </form>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Per-group inline edit card (rendered inside HqAccordion)
// ---------------------------------------------------------------------------

function GroupInlineEdit({ g, t }: { g: GroupListRow; t: Translate }) {
  return (
    <div style={{ opacity: g.is_active ? 1 : 0.75 }}>
      {/* ID + slug line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <span style={monoStyle}>{interpolate(t(`${K}.groupSlugLine`), { slug: g.slug })}</span>
        <CopyableId id={g.id} />
      </div>

      {/* Edit form */}
      <form
        action={updatePlatformFieldGroupAction}
        style={{ display: "grid", gap: 10, marginBottom: 12 }}
      >
        <input type="hidden" name="id" value={g.id} />
        <div style={formGridStyle}>
          <FieldInput label={t(`${K}.fieldNameEn`)} name="name_en" defaultValue={g.name_en} />
          <FieldInput label={t(`${K}.fieldNameEs`)} name="name_es" defaultValue={g.name_es} />
          <FieldInput label={t(`${K}.fieldSlug`)} name="slug" defaultValue={g.slug} />
          <FieldInput
            label={t(`${K}.fieldSortOrder`)}
            name="sort_order"
            type="number"
            defaultValue={g.sort_order}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "end" }}>
          <FieldTextarea
            label={t(`${K}.fieldDescriptionEn`)}
            name="description_en"
            defaultValue={g.description_en}
            rows={2}
          />
          <FieldTextarea
            label={t(`${K}.fieldDescriptionEs`)}
            name="description_es"
            defaultValue={g.description_es}
            rows={2}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Check name="is_active" label={t(`${K}.checkActive`)} defaultChecked={g.is_active} />
          <SubmitButton>{t(`${K}.saveGroup`)}</SubmitButton>
        </div>
      </form>

      {/* Archive / Restore + Permanent remove */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <form action={setPlatformFieldGroupLifecycleAction}>
          <input type="hidden" name="id" value={g.id} />
          <input
            type="hidden"
            name="mode"
            value={g.is_active ? "archive" : "restore"}
          />
          <SubmitButton tone={g.is_active ? "danger" : "primary"}>
            {g.is_active ? t(`${K}.archiveGroup`) : t(`${K}.restoreGroup`)}
          </SubmitButton>
        </form>
        <form action={deletePlatformFieldGroupAction}>
          <input type="hidden" name="id" value={g.id} />
          <ConfirmSubmitButton message={t(`${K}.confirmDeleteGroup`)}>
            {t(`${K}.permanentlyRemove`)}
          </ConfirmSubmitButton>
        </form>
      </div>

      {/* Fields list */}
      <div
        style={{
          fontSize: 11,
          color: HQ.inkMuted,
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {interpolate(t(`${K}.groupFieldsCount`), { count: g.field_count })}
      </div>
      {g.fields.length === 0 ? (
        <div
          style={{ fontSize: 11, color: HQ.inkDim, padding: "4px 0" }}
        >
          {t(`${K}.groupNoFields`)}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {g.fields.map((f) => (
            <Link
              key={f.field_key}
              href={`/platform/admin/catalog/${encodeURIComponent(f.field_key)}`}
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
              }}
            >
              <span style={{ fontWeight: 650 }}>{f.label}</span>
              <span
                style={{
                  ...monoStyle,
                  marginLeft: "auto",
                }}
              >
                {f.field_key}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Mapped talent types (informational) */}
      {g.mapped_talent_types.length > 0 && (
        <div
          style={{
            fontSize: 10.5,
            color: HQ.inkDim,
            marginTop: 10,
          }}
        >
          {g.mapped_talent_types.length > 8
            ? interpolate(t(`${K}.mappedTypesMore`), {
                types: interpolate(t(`${K}.mappedTypes`), { types: g.mapped_talent_types.slice(0, 8).join(" · ") }),
                count: g.mapped_talent_types.length - 8,
              })
            : interpolate(t(`${K}.mappedTypes`), { types: g.mapped_talent_types.join(" · ") })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab component
// ---------------------------------------------------------------------------

export async function GroupsTab({
  sp,
  t,
}: {
  sp: Record<string, string | undefined>;
  t: Translate;
}) {
  const groups = await loadGroupList();

  if (groups === null) {
    return (
      <HqCard title={t(`${K}.groupsUnavailableTitle`)}>
        <SaveNotice saved={sp.saved} error={sp.error} />
        <div style={{ fontSize: 13, color: HQ.inkMuted }}>
          {t(`${K}.groupsUnavailableBody`)}
        </div>
      </HqCard>
    );
  }

  const activeGroups = groups.filter((g) => g.is_active);
  const archivedGroups = groups.filter((g) => !g.is_active);
  const totalFields = groups.reduce((sum, g) => sum + g.field_count, 0);

  return (
    <div>
      <SaveNotice saved={sp.saved} error={sp.error} />

      {/* Stats strip */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}
      >
        <Stat
          label={t(`${K}.statGroupsActiveTotal`)}
          value={`${activeGroups.length}/${groups.length}`}
        />
        <Stat label={t(`${K}.statTotalFields`)} value={totalFields} />
        <Stat
          label={t(`${K}.statArchivedGroups`)}
          value={archivedGroups.length}
          tone={archivedGroups.length > 0 ? HQ.amber : undefined}
        />
      </div>

      {groups.length === 0 ? (
        <>
          <NewFieldGroupForm t={t} />
          <HqCard title={t(`${K}.groupsNoneTitle`)}>
            <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
              {t(`${K}.groupsNoneBody`)}
            </div>
          </HqCard>
        </>
      ) : (
        /* Two columns: left group accordions, right reorder panel */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 420px)",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* LEFT — new group form + group edit accordions */}
          <div style={{ minWidth: 0 }}>
            <NewFieldGroupForm t={t} />

            {groups.map((g) => (
              <HqAccordion
                key={g.id}
                title={g.name_en}
                meta={interpolate(t(`${K}.${g.field_count === 1 ? "groupMetaOne" : "groupMetaMany"}`), { slug: g.slug, count: g.field_count, order: g.sort_order })}
                badge={{
                  text: g.is_active ? t(`${K}.badgeActive`) : t(`${K}.badgeArchived`),
                  tone: g.is_active ? HQ.green : HQ.red,
                }}
              >
                <GroupInlineEdit g={g} t={t} />
              </HqAccordion>
            ))}
          </div>

          {/* RIGHT — drag reorder panel (sticky) */}
          <div style={{ position: "sticky", top: 12, minWidth: 0 }}>
            {groups.length >= 2 ? (
              <HqCard
                title={t(`${K}.groupOrderTitle`)}
                subtitle={t(`${K}.groupOrderSubtitle`)}
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
              </HqCard>
            ) : (
              <HqCard title={t(`${K}.groupOrderTitle`)}>
                <div style={{ fontSize: 12, color: HQ.inkDim }}>
                  {t(`${K}.groupOrderAddSecond`)}
                </div>
              </HqCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
