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

// ---------------------------------------------------------------------------
// Leaf row — a single talent_type
// ---------------------------------------------------------------------------
function TypeRow({ t }: { t: TaxonomyTypeNode }) {
  const isArchived = !!t.archived_at;
  return (
    <Link
      href={`/platform/admin/catalog/type/${t.id}`}
      className="hq-field-row"
      title={`Edit ${t.name_en}`}
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
      <CopyableId id={t.id} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {t.icon && <span style={{ fontSize: 14, lineHeight: 1 }}>{t.icon}</span>}
          <span style={{ fontWeight: 600 }}>{t.name_en}</span>
          {t.name_es && (
            <>
              <span style={{ fontSize: 10, color: HQ.green, letterSpacing: 0.2 }}>›</span>
              <span style={{ fontSize: 11, color: HQ.inkDim }}>{t.name_es}</span>
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
          {t.slug} · {t.mappedFieldCount} mapped field{t.mappedFieldCount === 1 ? "" : "s"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, fontSize: 11.5, flexShrink: 0 }}>
        <span style={{ color: t.agencyCount > 0 ? HQ.green : HQ.inkDim }}>
          <strong style={{ fontSize: 13, fontFamily: FD }}>{t.agencyCount}</strong>{" "}
          <span style={{ color: HQ.inkMuted }}>agenc{t.agencyCount === 1 ? "y" : "ies"}</span>
        </span>
        <span style={{ color: t.talentCount > 0 ? HQ.green : HQ.inkDim }}>
          <strong style={{ fontSize: 13, fontFamily: FD }}>{t.talentCount}</strong>{" "}
          <span style={{ color: HQ.inkMuted }}>talent{t.talentCount === 1 ? "" : "s"}</span>
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
          Archived
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Second-level accordion — a category_group
// ---------------------------------------------------------------------------
function GroupAccordion({ group }: { group: TaxonomyGroupNode }) {
  const countMeta = `${group.types.length} type${group.types.length === 1 ? "" : "s"} · ${group.agencyCount} agenc${group.agencyCount === 1 ? "y" : "ies"} · ${group.talentCount} talent${group.talentCount === 1 ? "" : "s"}`;
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
          Edit
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
          + Type
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
            No talent types yet.{" "}
            <Link
              href={`/platform/admin/catalog/type/new`}
              style={{ color: HQ.green, textDecoration: "none" }}
            >
              + Add one
            </Link>
          </div>
        ) : (
          group.types.map((t) => <TypeRow key={t.id} t={t} />)
        )}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Top-level accordion — a parent_category
// ---------------------------------------------------------------------------
function ParentAccordion({ parent }: { parent: TaxonomyParentNode }) {
  const countMeta = `${parent.groupsCount} group${parent.groupsCount === 1 ? "" : "s"} · ${parent.talentTypesCount} type${parent.talentTypesCount === 1 ? "" : "s"} · ${parent.agencyCount} agenc${parent.agencyCount === 1 ? "y" : "ies"} · ${parent.talentCount} talent${parent.talentCount === 1 ? "" : "s"}`;

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
          Edit
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
          + Group
        </Link>
      </div>

      {/* Groups */}
      {parent.groups.length === 0 ? (
        <div style={{ fontSize: 12.5, color: HQ.inkMuted, padding: "4px 0" }}>
          No category groups yet.
        </div>
      ) : (
        parent.groups.map((g) => <GroupAccordion key={g.id} group={g} />)
      )}
    </HqAccordion>
  );
}

// ---------------------------------------------------------------------------
// Tab component
// ---------------------------------------------------------------------------
export async function TypesTab({ sp }: { sp: Record<string, string | undefined> }) {
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
        <Stat label="Parent categories" value={totalParents} />
        <Stat label="Category groups" value={totalGroups} />
        <Stat label="Talent types" value={totalTypes} />
        <Stat
          label="Agencies (max any cat.)"
          value={statAgencies}
          tone={statAgencies > 0 ? HQ.green : undefined}
        />
        <Stat
          label="Talent assignments"
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
            Talent-Type Category
          </div>
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
            {!result.ok && result.parents.length === 0
              ? "Could not load taxonomy."
              : `${totalParents} categories · ${totalGroups} groups · ${totalTypes} types`}
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
          + New parent category
        </Link>
      </div>

      {!result.ok && result.parents.length === 0 ? (
        <HqCard title="Unavailable">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            Could not load taxonomy (service client unavailable or query failed). Retry shortly.
          </div>
        </HqCard>
      ) : result.parents.length === 0 ? (
        <HqCard title="No taxonomy yet">
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            Create your first parent category using the button above to start building the taxonomy
            hierarchy.
          </div>
        </HqCard>
      ) : (
        /* Tree */
        <div>
          {result.parents.map((parent) => (
            <ParentAccordion key={parent.id} parent={parent} />
          ))}
        </div>
      )}
    </div>
  );
}
