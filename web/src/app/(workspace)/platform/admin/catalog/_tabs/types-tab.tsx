// Platform HQ · Catalog · Types tab.
// Renders the list of all talent types with analytics (agencies + talents),
// and a "+ New talent type" link that opens the create drawer.

import Link from "next/link";
import { loadPlatformTalentTypes, type TalentTypeRow } from "../../../talent-types-data";
import { HqCard, Stat, CopyableId, HQ, F, FD } from "../_ui";

function TypeRow({ t }: { t: TalentTypeRow }) {
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
        padding: "10px 12px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        color: isArchived ? HQ.inkMuted : HQ.ink,
        opacity: isArchived ? 0.6 : 1,
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      {/* ID pill */}
      <CopyableId id={t.id} />

      {/* Icon + names */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {t.icon && (
            <span style={{ fontSize: 15, lineHeight: 1 }}>{t.icon}</span>
          )}
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
          {t.slug} · #{t.sort_order} · {t.mappedFieldCount} mapped field{t.mappedFieldCount === 1 ? "" : "s"}
        </div>
      </div>

      {/* Analytics inline */}
      <div
        style={{
          display: "flex",
          gap: 12,
          fontSize: 11.5,
          flexShrink: 0,
        }}
      >
        <span style={{ color: t.agencyCount > 0 ? HQ.green : HQ.inkDim }}>
          <strong style={{ fontSize: 14, fontFamily: FD }}>{t.agencyCount}</strong>{" "}
          <span style={{ color: HQ.inkMuted }}>agenc{t.agencyCount === 1 ? "y" : "ies"}</span>
        </span>
        <span style={{ color: t.talentCount > 0 ? HQ.green : HQ.inkDim }}>
          <strong style={{ fontSize: 14, fontFamily: FD }}>{t.talentCount}</strong>{" "}
          <span style={{ color: HQ.inkMuted }}>talent{t.talentCount === 1 ? "" : "s"}</span>
        </span>
      </div>

      {/* Status badge */}
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

export async function TypesTab({ sp }: { sp: Record<string, string | undefined> }) {
  void sp;
  const result = await loadPlatformTalentTypes();

  const activeTypes = result.types.filter((t) => !t.archived_at);
  const archivedTypes = result.types.filter((t) => !!t.archived_at);

  const totalAgencies = new Set(
    // just summarize the max agencyCount for the stat — count of distinct types that have agencies
    result.types.filter((t) => t.agencyCount > 0).map((t) => t.id),
  ).size;
  const totalTalents = result.types.reduce((sum, t) => sum + t.talentCount, 0);

  return (
    <div style={{ fontFamily: F, color: HQ.ink }}>
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
            Talent Types
          </div>
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
            {!result.ok && result.types.length === 0
              ? "Could not load talent types."
              : `${result.types.length} type${result.types.length === 1 ? "" : "s"} · ${activeTypes.length} active`}
          </div>
        </div>
        <Link
          href="/platform/admin/catalog/type/new"
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
          + New talent type
        </Link>
      </div>

      {!result.ok && result.types.length === 0 ? (
        <HqCard title="Unavailable">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            Could not load talent types (service client unavailable or query failed). Retry shortly.
          </div>
        </HqCard>
      ) : result.types.length === 0 ? (
        <HqCard title="No talent types yet">
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            Create your first talent type using the button above. Talent types drive the
            field-mapping engine — every type-specific Details field is mapped through these terms.
          </div>
        </HqCard>
      ) : (
        <>
          {/* Summary stats */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <Stat label="Active types" value={activeTypes.length} tone={HQ.green} />
            <Stat
              label="Archived types"
              value={archivedTypes.length}
              tone={archivedTypes.length > 0 ? HQ.amber : HQ.inkDim}
            />
            <Stat
              label="Types with agencies"
              value={totalAgencies}
              tone={totalAgencies > 0 ? HQ.green : HQ.inkDim}
            />
            <Stat
              label="Total talent assignments"
              value={totalTalents}
              tone={totalTalents > 0 ? HQ.green : HQ.inkDim}
            />
          </div>

          {/* Type list */}
          <HqCard title="All talent types" subtitle="Click a row to open the type editor.">
            <div>
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "4px 12px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: HQ.inkDim,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                <span style={{ minWidth: 80 }}>ID</span>
                <span style={{ flex: 1 }}>Type</span>
                <span style={{ minWidth: 200, textAlign: "right" }}>Adoption</span>
              </div>

              {/* Active types first */}
              {activeTypes.map((t) => (
                <TypeRow key={t.id} t={t} />
              ))}

              {/* Archived types (dimmed, at the bottom) */}
              {archivedTypes.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "8px 12px 4px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: HQ.inkDim,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      borderTop: `1px solid ${HQ.borderSoft}`,
                      marginTop: 4,
                    }}
                  >
                    Archived
                  </div>
                  {archivedTypes.map((t) => (
                    <TypeRow key={t.id} t={t} />
                  ))}
                </>
              )}
            </div>
          </HqCard>
        </>
      )}
    </div>
  );
}
