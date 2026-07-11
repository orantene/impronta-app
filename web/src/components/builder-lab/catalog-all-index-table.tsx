"use client";

/**
 * O10 — the unified "All" superset index table + facet bar.
 *
 * A READ-ONLY audit surface (not an editor): one screen flattening code
 * components ∪ published templates ∪ draft/in_review/archived templates into a
 * single sortable table with the Source / Tab / Target / Status / Plan /
 * Customized? columns. Mis-gated or stuck-in-review items are visible at a
 * glance; clicking a row jumps to the owning Catalog view (the parent wires
 * `onJump`). All flatten / facet / sort logic is the pure `catalog-all-index`
 * module — this file is purely presentational (styled with the shared LAB
 * tokens + LabBadge/LabChip primitives the CatalogRowTable uses).
 */

import { useMemo, useState } from "react";

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import type {
  BuilderTemplateRow,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import {
  type AllIndexRow,
  type AllIndexSource,
  type AllIndexSortKey,
  type AllIndexSort,
  applyAllIndexFilters,
  buildAllIndex,
  emptyFacets,
  facetCounts,
  sortAllIndex,
} from "./catalog-all-index";
import {
  LAB as T,
  fieldStyle,
  panelStyle,
  LabBadge,
  LabChip,
  LAB_STATUS_LABEL,
  EmptyCard,
} from "./ui";

const SOURCE_LABEL: Record<AllIndexSource, string> = {
  code: "Code",
  template: "Template",
  draft: "Draft",
};
const TARGET_LABEL: Record<BuilderTemplateTarget, string> = {
  talent: "Talent",
  workspace: "Workspace",
  both: "Both",
  platform: "Platform",
};
const PLAN_LABEL: Record<AllIndexRow["plan"], string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

// Status badge tone — published is the only "live" state (accent); in_review is
// the one that should jump out as "needs attention" (red-ish), the rest muted.
function statusBadge(status: BuilderTemplateStatus) {
  if (status === "published") return <LabBadge tone="accent">{LAB_STATUS_LABEL[status]}</LabBadge>;
  if (status === "in_review")
    return (
      <LabBadge tone="custom" bg={T.redBg} fg={T.red}>
        {LAB_STATUS_LABEL[status]}
      </LabBadge>
    );
  return <LabBadge tone="muted">{LAB_STATUS_LABEL[status]}</LabBadge>;
}

const COLUMNS: ReadonlyArray<{ key: AllIndexSortKey; label: string }> = [
  { key: "label", label: "Component" },
  { key: "source", label: "Source" },
  { key: "tab", label: "Tab" },
  { key: "target", label: "Target" },
  { key: "status", label: "Status" },
  { key: "plan", label: "Plan" },
  { key: "customized", label: "Customized?" },
];

const cellStyle: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 12,
  color: T.inkMuted,
  textAlign: "left",
  verticalAlign: "middle",
  borderBottom: `1px solid ${T.borderSoft}`,
};

/** A clickable facet pill — `active` highlights the selection; the count is the
 *  total in that bucket (over the full set, not the filtered view). */
function FacetPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        fontSize: 11.5,
        fontWeight: active ? 700 : 500,
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : T.cardSoft,
        color: active ? T.accent : T.inkMuted,
        cursor: "pointer",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      <span style={{ fontSize: 10, fontWeight: 700, color: active ? T.accent : T.inkDim }}>
        {count}
      </span>
    </button>
  );
}

export function CatalogAllIndexTable({
  items,
  templates,
  onJump,
}: {
  items: ReadonlyArray<CatalogAdminItem>;
  templates: ReadonlyArray<BuilderTemplateRow>;
  /** Jump to the owning Catalog view for a row. `tab` is the special-tab id the
   *  parent activates; `rowId` is the row to (optionally) pre-expand. */
  onJump?: (row: AllIndexRow) => void;
}) {
  const [facets, setFacets] = useState(() => emptyFacets());
  const [sort, setSort] = useState<AllIndexSort>({ key: "status", dir: "asc" });

  const all = useMemo(() => buildAllIndex(items, templates), [items, templates]);
  const counts = useMemo(() => facetCounts(all), [all]);
  const view = useMemo(
    () => sortAllIndex(applyAllIndexFilters(all, facets), sort),
    [all, facets, sort],
  );

  const toggleSort = (key: AllIndexSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  // One toggle per facet value: clicking the active value clears it (back to all).
  const setSourceFacet = (v: AllIndexSource) =>
    setFacets((f) => ({ ...f, source: f.source === v ? null : v }));
  const setStatusFacet = (v: BuilderTemplateStatus) =>
    setFacets((f) => ({ ...f, status: f.status === v ? null : v }));
  const setTargetFacet = (v: BuilderTemplateTarget) =>
    setFacets((f) => ({ ...f, target: f.target === v ? null : v }));
  const setCustomizedFacet = () =>
    setFacets((f) => ({ ...f, customized: f.customized === true ? null : true }));

  const anyFacetActive =
    facets.source !== null ||
    facets.status !== null ||
    facets.target !== null ||
    facets.plan !== null ||
    facets.customized !== null ||
    facets.query.trim() !== "";

  return (
    <div
      data-testid="lab-all-index"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <p style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5, margin: 0 }}>
        Every governed object on one screen: built-in code components, published
        templates, and draft / in-review / archived templates that the gallery
        can&apos;t show. Use the facets to spot mis-gated or stuck-in-review items;
        click a row to open it in its tab.
      </p>

      {/* Search */}
      <input
        type="search"
        value={facets.query}
        onChange={(e) => setFacets((f) => ({ ...f, query: e.target.value }))}
        placeholder="Search all objects by name, id, or tab…"
        aria-label="Search all catalog objects"
        style={{ ...fieldStyle, minWidth: 240, outline: "none" }}
      />

      {/* Facet bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkDim, letterSpacing: 0.4, textTransform: "uppercase", minWidth: 56 }}>
            Source
          </span>
          {(["code", "template", "draft"] as AllIndexSource[]).map((s) => (
            <FacetPill
              key={s}
              label={SOURCE_LABEL[s]}
              count={counts.source[s]}
              active={facets.source === s}
              onClick={() => setSourceFacet(s)}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkDim, letterSpacing: 0.4, textTransform: "uppercase", minWidth: 56 }}>
            Status
          </span>
          {(["in_review", "draft", "published", "archived"] as BuilderTemplateStatus[]).map(
            (s) => (
              <FacetPill
                key={s}
                label={LAB_STATUS_LABEL[s]}
                count={counts.status[s]}
                active={facets.status === s}
                onClick={() => setStatusFacet(s)}
              />
            ),
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkDim, letterSpacing: 0.4, textTransform: "uppercase", minWidth: 56 }}>
            Target
          </span>
          {(["talent", "workspace", "both", "platform"] as BuilderTemplateTarget[]).map(
            (s) => (
              <FacetPill
                key={s}
                label={TARGET_LABEL[s]}
                count={counts.target[s]}
                active={facets.target === s}
                onClick={() => setTargetFacet(s)}
              />
            ),
          )}
          <FacetPill
            label="Customized"
            count={counts.customized}
            active={facets.customized === true}
            onClick={setCustomizedFacet}
          />
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: T.inkDim }}>
        Showing {view.length} of {counts.total}
        {anyFacetActive ? (
          <button
            type="button"
            onClick={() => setFacets(emptyFacets())}
            style={{
              marginLeft: 8,
              background: "none",
              border: "none",
              color: T.accent,
              fontSize: 11.5,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Clear facets
          </button>
        ) : null}
      </div>

      {view.length === 0 ? (
        <EmptyCard>No objects match the current facets.</EmptyCard>
      ) : (
        <div style={{ ...panelStyle, overflowX: "auto", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th
                      key={c.key}
                      style={{
                        ...cellStyle,
                        color: active ? T.ink : T.inkDim,
                        fontWeight: 700,
                        fontSize: 10.5,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                        cursor: "pointer",
                        userSelect: "none",
                        background: T.cardSoft,
                        position: "sticky",
                        top: 0,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        aria-label={`Sort by ${c.label}`}
                        style={{
                          background: "none",
                          border: "none",
                          color: "inherit",
                          font: "inherit",
                          letterSpacing: "inherit",
                          textTransform: "inherit",
                          cursor: "pointer",
                          padding: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {c.label}
                        {active ? <span>{sort.dir === "asc" ? "↑" : "↓"}</span> : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {view.map((row) => (
                <tr
                  key={row.key}
                  data-testid={`lab-all-row-${row.id}`}
                  onClick={() => onJump?.(row)}
                  style={{ cursor: onJump ? "pointer" : "default" }}
                >
                  <td style={{ ...cellStyle, color: T.ink, fontWeight: 600 }}>
                    {row.label}
                  </td>
                  <td style={cellStyle}>
                    <LabChip tone={row.source === "draft" ? "lock" : "neutral"}>
                      {SOURCE_LABEL[row.source]}
                    </LabChip>
                  </td>
                  <td style={cellStyle}>{row.tab ? row.tabLabel : "—"}</td>
                  <td style={cellStyle}>{TARGET_LABEL[row.target]}</td>
                  <td style={cellStyle}>{statusBadge(row.status)}</td>
                  <td style={cellStyle}>{PLAN_LABEL[row.plan]}</td>
                  <td style={cellStyle}>
                    {row.customized ? (
                      <LabChip tone="accent">Customized</LabChip>
                    ) : (
                      <span style={{ color: T.inkDim }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
