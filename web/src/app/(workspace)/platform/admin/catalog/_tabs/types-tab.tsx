// Platform HQ · Catalog · Types tab.
// Renders the full 3-level taxonomy tree:
//   parent_category → category_group → talent_type
// All three levels are editable via drawer/full-page routes.

import Link from "next/link";
import {
  loadPlatformTaxonomyTree,
  type TaxonomyParentNode,
  type TaxonomyGroupNode,
  type TaxonomyTypeNode,
} from "../../../talent-types-data";
import { HqCard, HqAccordion, Stat, CopyableId, HQ, F, FD } from "../_ui";
import { SaveNotice } from "../[fieldKey]/field-detail-editor-parts";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

// ---------------------------------------------------------------------------
// Leaf row — a single talent_type
// ---------------------------------------------------------------------------
function TypeRow({ type, t }: { type: TaxonomyTypeNode; t: Translate }) {
  const isArchived = !!type.archived_at;
  return (
    <Link
      href={`/platform/admin/catalog/type/${type.id}`}
      className="hq-field-row"
      title={interpolate(t(`${K}.typeEditTitle`), { name: type.name_en })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px 9px 16px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        color: isArchived ? HQ.inkMuted : HQ.ink,
        opacity: isArchived ? 0.6 : 1,
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      <CopyableId id={type.id} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {type.icon && <span style={{ fontSize: 14, lineHeight: 1 }}>{type.icon}</span>}
          <span style={{ fontWeight: 600 }}>{type.name_en}</span>
          {type.name_es && (
            <>
              <span style={{ fontSize: 10, color: HQ.green, letterSpacing: 0.2 }}>›</span>
              <span style={{ fontSize: 11, color: HQ.inkDim }}>{type.name_es}</span>
            </>
          )}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontFamily: "ui-monospace, monospace",
            marginTop: 2,
          }}
        >
          {interpolate(t(`${K}.${type.mappedFieldCount === 1 ? "typeMappedFieldsOne" : "typeMappedFieldsMany"}`), { slug: type.slug, count: type.mappedFieldCount })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, fontSize: 11.5, flexShrink: 0 }}>
        <span style={{ color: type.agencyCount > 0 ? HQ.green : HQ.inkDim }}>
          <strong style={{ fontSize: 13, fontFamily: FD }}>{type.agencyCount}</strong>{" "}
          <span style={{ color: HQ.inkMuted }}>{t(`${K}.${type.agencyCount === 1 ? "typeAgencyOne" : "typeAgencyMany"}`)}</span>
        </span>
        <span style={{ color: type.talentCount > 0 ? HQ.green : HQ.inkDim }}>
          <strong style={{ fontSize: 13, fontFamily: FD }}>{type.talentCount}</strong>{" "}
          <span style={{ color: HQ.inkMuted }}>{t(`${K}.${type.talentCount === 1 ? "typeTalentOne" : "typeTalentMany"}`)}</span>
        </span>
      </div>

      {isArchived && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: HQ.red,
            border: `1px solid ${HQ.red}44`,
            background: `${HQ.red}1a`,
            borderRadius: 999,
            padding: "1px 7px",
            whiteSpace: "nowrap",
          }}
        >
          {t(`${K}.typeArchived`)}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Second-level accordion — a category_group
// ---------------------------------------------------------------------------
function GroupAccordion({ group, t }: { group: TaxonomyGroupNode; t: Translate }) {
  const agencies = `${group.agencyCount} ${t(`${K}.${group.agencyCount === 1 ? "typeAgencyOne" : "typeAgencyMany"}`)}`;
  const talents = `${group.talentCount} ${t(`${K}.${group.talentCount === 1 ? "typeTalentOne" : "typeTalentMany"}`)}`;
  const countMeta = interpolate(
    t(`${K}.${group.types.length === 1 ? "groupCountMetaOne" : "groupCountMetaMany"}`),
    { types: group.types.length, agencies, talents },
  );
  return (
    <details
      className="hq-acc"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        marginBottom: 8,
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "10px 14px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span
          className="hq-chev"
          aria-hidden
          style={{
            fontSize: 10,
            color: HQ.inkDim,
            transition: "transform .15s",
            display: "inline-block",
          }}
        >
          ▶
        </span>
        <CopyableId id={group.id} />
        <span style={{ fontFamily: FD, fontSize: 13.5, fontWeight: 600, color: HQ.ink, flex: 1 }}>
          {group.icon ? `${group.icon} ` : ""}
          {group.name_en}
          {group.name_es && (
            <span style={{ fontWeight: 400, fontSize: 11, color: HQ.inkDim, marginLeft: 6 }}>
              {group.name_es}
            </span>
          )}
        </span>
        <span style={{ fontSize: 11, color: HQ.inkMuted, flexShrink: 0 }}>{countMeta}</span>
        <Link
          href={`/platform/admin/catalog/term/${group.id}`}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: HQ.inkMuted,
            border: `1px solid ${HQ.borderSoft}`,
            background: "transparent",
            borderRadius: 6,
            padding: "2px 8px",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {t(`${K}.typeEdit`)}
        </Link>
        <Link
          href={`/platform/admin/catalog/type/new`}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: HQ.green,
            border: `1px solid rgba(93,211,160,0.30)`,
            background: "rgba(93,211,160,0.08)",
            borderRadius: 6,
            padding: "2px 8px",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {t(`${K}.typeAddType`)}
        </Link>
      </summary>

      <div style={{ paddingBottom: 8 }}>
        {group.types.length === 0 ? (
          <div
            style={{
              padding: "8px 16px",
              fontSize: 12,
              color: HQ.inkMuted,
            }}
          >
            {t(`${K}.typeNoTypes`)}{" "}
            <Link
              href={`/platform/admin/catalog/type/new`}
              style={{ color: HQ.green, textDecoration: "none" }}
            >
              {t(`${K}.typeAddOne`)}
            </Link>
          </div>
        ) : (
          group.types.map((type) => <TypeRow key={type.id} type={type} t={t} />)
        )}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Top-level accordion — a parent_category
// ---------------------------------------------------------------------------
function ParentAccordion({ parent, t }: { parent: TaxonomyParentNode; t: Translate }) {
  const groups = interpolate(t(`${K}.${parent.groupsCount === 1 ? "parentGroupsOne" : "parentGroupsMany"}`), { count: parent.groupsCount });
  const types = interpolate(t(`${K}.${parent.talentTypesCount === 1 ? "parentTypesOne" : "parentTypesMany"}`), { count: parent.talentTypesCount });
  const agencies = interpolate(t(`${K}.${parent.agencyCount === 1 ? "parentAgenciesOne" : "parentAgenciesMany"}`), { count: parent.agencyCount });
  const talents = interpolate(t(`${K}.${parent.talentCount === 1 ? "parentTalentsOne" : "parentTalentsMany"}`), { count: parent.talentCount });
  const countMeta = interpolate(t(`${K}.parentCountMeta`), { groups, types, agencies, talents });

  return (
    <HqAccordion
      title={`${parent.icon ? `${parent.icon} ` : ""}${parent.name_en}${parent.name_es ? ` · ${parent.name_es}` : ""}`}
      meta={countMeta}
      defaultOpen={false}
    >
      {/* Summary action row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${HQ.borderSoft}`,
        }}
      >
        <CopyableId id={parent.id} />
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: HQ.inkDim }}>
          {parent.slug}
        </span>
        <div style={{ flex: 1 }} />
        <Link
          href={`/platform/admin/catalog/term/${parent.id}`}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: HQ.inkMuted,
            border: `1px solid ${HQ.borderSoft}`,
            background: "transparent",
            borderRadius: 6,
            padding: "3px 9px",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {t(`${K}.typeEdit`)}
        </Link>
        <Link
          href={`/platform/admin/catalog/term/new?kind=category_group&parent=${parent.id}`}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: HQ.green,
            border: `1px solid rgba(93,211,160,0.30)`,
            background: "rgba(93,211,160,0.08)",
            borderRadius: 6,
            padding: "3px 9px",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {t(`${K}.parentAddGroup`)}
        </Link>
      </div>

      {/* Groups */}
      {parent.groups.length === 0 ? (
        <div style={{ fontSize: 12.5, color: HQ.inkMuted, padding: "4px 0" }}>
          {t(`${K}.parentNoGroups`)}
        </div>
      ) : (
        parent.groups.map((g) => <GroupAccordion key={g.id} group={g} t={t} />)
      )}
    </HqAccordion>
  );
}

// ---------------------------------------------------------------------------
// Tab component
// ---------------------------------------------------------------------------
export async function TypesTab({ sp, t }: { sp: Record<string, string | undefined>; t: Translate }) {
  const result = await loadPlatformTaxonomyTree();

  const totalParents = result.parents.length;
  const totalGroups = result.parents.reduce((s, p) => s + p.groupsCount, 0);
  const totalTypes = result.parents.reduce((s, p) => s + p.talentTypesCount, 0);

  // Sum agencies/talents across all parent categories (uses parent rollup numbers;
  // agencies are max-ed to avoid double-counting across overlapping categories).
  let statAgencies = 0;
  let statTalents = 0;
  for (const p of result.parents) {
    statAgencies = Math.max(statAgencies, p.agencyCount);
    statTalents += p.talentCount;
  }

  return (
    <div style={{ fontFamily: F, color: HQ.ink }}>
      <SaveNotice saved={sp.saved} error={sp.error} />

      {/* Stats strip — always shown (zeros when unavailable) */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}
      >
        <Stat label={t(`${K}.typesStatParents`)} value={totalParents} />
        <Stat label={t(`${K}.typesStatGroups`)} value={totalGroups} />
        <Stat label={t(`${K}.typesStatTypes`)} value={totalTypes} />
        <Stat
          label={t(`${K}.typesStatAgencies`)}
          value={statAgencies}
          tone={statAgencies > 0 ? HQ.green : undefined}
        />
        <Stat
          label={t(`${K}.typesStatAssignments`)}
          value={statTalents}
          tone={statTalents > 0 ? HQ.green : undefined}
        />
      </div>

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
            {t(`${K}.typesHeaderTitle`)}
          </div>
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
            {!result.ok && result.parents.length === 0
              ? t(`${K}.typesHeaderCouldNotLoad`)
              : interpolate(t(`${K}.typesHeaderSummary`), { categories: totalParents, groups: totalGroups, types: totalTypes })}
          </div>
        </div>
        <Link
          href="/platform/admin/catalog/term/new?kind=parent_category"
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "7px 13px",
            border: "1px solid rgba(93,211,160,0.35)",
            background: "rgba(93,211,160,0.12)",
            color: HQ.green,
            borderRadius: 8,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {t(`${K}.typesNewParent`)}
        </Link>
      </div>

      {!result.ok && result.parents.length === 0 ? (
        <HqCard title={t(`${K}.typesUnavailableTitle`)}>
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            {t(`${K}.typesUnavailableBody`)}
          </div>
        </HqCard>
      ) : result.parents.length === 0 ? (
        <HqCard title={t(`${K}.typesNoneTitle`)}>
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            {t(`${K}.typesNoneBody`)}
          </div>
        </HqCard>
      ) : (
        /* Tree */
        <div>
          {result.parents.map((parent) => (
            <ParentAccordion key={parent.id} parent={parent} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
