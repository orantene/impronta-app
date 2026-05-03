"use client";

// RosterClientShell — full prototype-fidelity roster UI.
// Receives pre-fetched roster rows from the server, handles all
// search / filter / sort / view / bulk-select state client-side.
// No API calls; state is ephemeral (page reload resets filters).

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

import type { WorkspaceRosterItem } from "../../_data-bridge";
export type { WorkspaceRosterItem };
// Alias for local use
type RosterTalent = WorkspaceRosterItem;

type StateFilter = "all" | "published" | "draft" | "invited" | "awaiting-approval";
type SortKey = "name" | "newest";
type ViewMode = "grid" | "list";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  border:      "rgba(24,24,27,0.08)",
  borderSoft:  "rgba(24,24,27,0.06)",
  surface:     "#FAFAF7",
  white:       "#ffffff",
  green:       "#2E7D5B",
  greenSoft:   "rgba(15,79,62,0.06)",
  greenDeep:   "#0F4F3E",
  amber:       "#8A6F1A",
  amberSoft:   "rgba(212,160,23,0.10)",
  indigo:      "#3B5E9E",
  indigoSoft:  "rgba(59,94,158,0.10)",
  successSoft: "rgba(46,125,91,0.10)",
  successDeep: "#1A5E3C",
  accent:      "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── State meta ───────────────────────────────────────────────────────────────

const STATE_DOT: Record<string, string> = {
  published:          C.green,
  draft:              C.inkMuted,
  invited:            C.indigo,
  "awaiting-approval": C.amber,
  claimed:            C.ink,
};

const STATE_PILL_BG: Record<string, string> = {
  published:          C.successSoft,
  draft:              "rgba(11,11,13,0.05)",
  invited:            C.indigoSoft,
  "awaiting-approval": C.amberSoft,
  claimed:            "rgba(11,11,13,0.05)",
};

const STATE_PILL_COLOR: Record<string, string> = {
  published:          C.successDeep,
  draft:              C.inkMuted,
  invited:            C.indigo,
  "awaiting-approval": C.amber,
  claimed:            C.ink,
};

function stateLabel(s: string) {
  return s === "awaiting-approval" ? "Pending" : s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── CSV download helper ──────────────────────────────────────────────────────

function downloadCsv(filename: string, rows: Record<string, string>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Status strip — 4 clickable segments (Published / Pending / Invited / Draft)
function StatusStrip({
  roster,
  active,
  onFilter,
}: {
  roster: RosterTalent[];
  active: StateFilter;
  onFilter: (f: "published" | "draft" | "invited" | "awaiting-approval") => void;
}) {
  const counts = {
    published: roster.filter((r) => r.state === "published").length,
    "awaiting-approval": roster.filter((r) => r.state === "awaiting-approval").length,
    invited: roster.filter((r) => r.state === "invited").length,
    draft: roster.filter((r) => r.state === "draft").length,
  };

  const items: { id: "published" | "awaiting-approval" | "invited" | "draft"; label: string; tone: string }[] = [
    { id: "published",          label: "Published", tone: C.green },
    { id: "awaiting-approval",  label: "Pending",   tone: C.amber },
    { id: "invited",            label: "Invited",   tone: C.indigo },
    { id: "draft",              label: "Draft",     tone: C.inkMuted },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: 4,
        borderRadius: 12,
        background: C.white,
        border: `1px solid ${C.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        marginBottom: 14,
        fontFamily: FONT,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map((it, i) => {
        const isActive = active === it.id;
        const count = counts[it.id];
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onFilter(it.id)}
            disabled={count === 0}
            style={{
              flex: 1,
              minWidth: 80,
              padding: "10px 14px",
              border: "none",
              background: isActive ? C.greenSoft : "transparent",
              borderRadius: 8,
              cursor: count === 0 ? "default" : "pointer",
              opacity: count === 0 ? 0.45 : 1,
              textAlign: "left",
              borderRight: i < items.length - 1 ? `1px solid ${C.borderSoft}` : "none",
              fontFamily: FONT,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: it.tone }} />
              <span style={{ fontSize: 11, color: C.inkMuted, fontWeight: 500 }}>{it.label}</span>
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: isActive ? C.greenDeep : C.ink,
                letterSpacing: -0.4,
                lineHeight: 1,
              }}
            >
              {count}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Filter bar — search + sort + view toggle + select-all
function FilterBar({
  search,
  onSearch,
  sort,
  sortDir,
  onSort,
  view,
  onView,
  selectedCount,
  canBulk,
  onSelectAll,
  onClearSelection,
  resultCount,
  totalCount,
}: {
  search: string;
  onSearch: (s: string) => void;
  sort: SortKey;
  sortDir: "asc" | "desc";
  onSort: (s: SortKey) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  selectedCount: number;
  canBulk: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = sort === "name" ? "Name" : "Newest";
  const arrow = sort === "newest" ? "" : sortDir === "asc" ? " ↑" : " ↓";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 14,
        fontFamily: FONT,
      }}
    >
      {/* Search */}
      <div style={{ position: "relative", width: 240 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: 12,
            transform: "translateY(-50%)",
            color: C.inkMuted,
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          ⌕
        </span>
        <input
          type="text"
          aria-label="Search roster"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, type, city…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px 8px 32px",
            fontFamily: FONT,
            fontSize: 12.5,
            color: C.ink,
            background: C.white,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 999,
            outline: "none",
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Result count */}
      <div style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 500 }}>
        {resultCount === totalCount
          ? `${totalCount} talent`
          : `${resultCount} of ${totalCount}`}
      </div>

      {/* Sort dropdown */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setSortOpen((o) => !o)}
          style={{
            padding: "5px 11px",
            background: C.white,
            border: `1px solid ${C.borderSoft}`,
            color: C.ink,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 11.5,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          Sort: <strong>{sortLabel}{arrow}</strong>
        </button>
        {sortOpen && (
          <>
            <div
              onClick={() => setSortOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 50 }}
            />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                zIndex: 51,
                background: C.white,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 10,
                boxShadow: "0 10px 30px -8px rgba(11,11,13,0.18)",
                minWidth: 140,
                padding: 4,
                fontFamily: FONT,
              }}
            >
              {(["name", "newest"] as SortKey[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (s === sort) {
                      // toggle direction inline
                    } else {
                      onSort(s);
                    }
                    setSortOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: s === sort ? "rgba(11,11,13,0.04)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: C.ink,
                  }}
                >
                  {s === "name" ? "Name" : "Newest"}
                  {s === sort && (
                    <span style={{ marginLeft: "auto", color: C.inkMuted, fontSize: 11 }}>
                      {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* View toggle */}
      <div
        style={{
          display: "inline-flex",
          padding: 2,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          flexShrink: 0,
        }}
      >
        {(["grid", "list"] as ViewMode[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-label={`${v} view`}
            aria-pressed={view === v}
            style={{
              width: 28,
              height: 24,
              borderRadius: 999,
              border: "none",
              background: view === v ? C.white : "transparent",
              color: view === v ? C.ink : C.inkMuted,
              cursor: "pointer",
              fontSize: 11,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: view === v ? "0 1px 2px rgba(11,11,13,0.08)" : "none",
            }}
          >
            {v === "grid" ? (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor" />
                <rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor" />
                <rect x="2" y="11" width="12" height="2" rx="1" fill="currentColor" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Bulk select */}
      {canBulk && selectedCount > 0 && (
        <button
          type="button"
          onClick={onClearSelection}
          style={{
            padding: "5px 10px",
            background: "rgba(15,79,62,0.08)",
            border: `1px solid ${C.accent}`,
            color: C.greenDeep,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {selectedCount} selected · clear
        </button>
      )}
      {canBulk && selectedCount === 0 && (
        <button
          type="button"
          onClick={onSelectAll}
          aria-label="Select all"
          style={{
            padding: "5px 10px",
            background: "transparent",
            border: `1px solid ${C.borderSoft}`,
            color: C.inkMuted,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 11.5,
            fontWeight: 500,
          }}
        >
          Select all
        </button>
      )}
    </div>
  );
}

// Individual talent card (grid view)
function TalentCard({
  talent,
  selected,
  onSelect,
}: {
  talent: RosterTalent;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const stateTone = STATE_DOT[talent.state] ?? C.inkMuted;
  const initials = talent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        background: C.white,
        border: `1px solid ${selected ? C.accent : C.borderSoft}`,
        borderRadius: 14,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONT,
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hover
          ? "0 6px 20px -10px rgba(11,11,13,0.18)"
          : "0 1px 2px rgba(11,11,13,0.03)",
      }}
    >
      {/* Photo area */}
      <div
        style={{
          position: "relative",
          aspectRatio: "4 / 5",
          background: talent.thumb
            ? `url(${talent.thumb}) center/cover`
            : "rgba(11,11,13,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Initials fallback */}
        {!talent.thumb && (
          <div
            aria-hidden
            style={{
              fontSize: 32,
              fontWeight: 500,
              color: C.inkMuted,
              letterSpacing: -1,
              userSelect: "none",
            }}
          >
            {initials}
          </div>
        )}

        {/* Selection checkbox */}
        {onSelect && (hover || selected) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(talent.id);
            }}
            aria-label={selected ? "Deselect" : "Select"}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              width: 22,
              height: 22,
              borderRadius: 6,
              border: `1.5px solid ${selected ? C.accent : "rgba(255,255,255,0.9)"}`,
              background: selected ? C.accent : "rgba(11,11,13,0.4)",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(6px)",
            }}
          >
            {selected && (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )}

        {/* State badge top-right */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 1px 4px rgba(11,11,13,0.10)",
            fontSize: 10,
            fontWeight: 600,
            color: C.ink,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: stateTone }} />
          <span style={{ textTransform: "capitalize" }}>{stateLabel(talent.state)}</span>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "10px 12px 12px" }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {talent.name}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: talent.primaryTypeLabel ? C.greenDeep : C.inkMuted,
            fontWeight: talent.primaryTypeLabel ? 600 : 500,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {talent.primaryTypeLabel ?? "No type set"}
        </div>
        {talent.city && (
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1 }}>
            📍 {talent.city}
          </div>
        )}
      </div>
    </div>
  );
}

// Individual talent list row
function TalentListRow({
  talent,
  isFirst,
  selected,
  onSelect,
}: {
  talent: RosterTalent;
  isFirst: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const stateTone = STATE_DOT[talent.state] ?? C.inkMuted;
  const pillBg = STATE_PILL_BG[talent.state] ?? "rgba(11,11,13,0.05)";
  const pillColor = STATE_PILL_COLOR[talent.state] ?? C.inkMuted;
  const initials = talent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderTop: isFirst ? "none" : `1px solid ${C.borderSoft}`,
        cursor: "pointer",
        background: hover
          ? "rgba(11,11,13,0.02)"
          : selected
            ? "rgba(15,79,62,0.04)"
            : "transparent",
        transition: "background 0.12s",
      }}
    >
      {/* Checkbox */}
      {onSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(talent.id);
          }}
          aria-label={selected ? "Deselect" : "Select"}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: `1.5px solid ${selected ? C.accent : C.borderSoft}`,
            background: selected ? C.accent : "transparent",
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            opacity: hover || selected ? 1 : 0.5,
            transition: "opacity 0.12s",
          }}
        >
          {selected && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      )}

      {/* Avatar */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: talent.thumb
            ? `url(${talent.thumb}) center/cover`
            : "rgba(11,11,13,0.06)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          color: C.inkMuted,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {!talent.thumb && initials}
      </div>

      {/* Name + type + city */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: C.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {talent.name}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: C.inkMuted,
            marginTop: 1,
            display: "flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {talent.primaryTypeLabel ?? "No type"}
            {talent.city && (
              <span style={{ color: C.inkDim }}>{" · "}{talent.city}</span>
            )}
          </span>
        </div>
      </div>

      {/* State pill */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 9px",
          borderRadius: 999,
          background: pillBg,
          color: pillColor,
          fontSize: 10.5,
          fontWeight: 600,
          flexShrink: 0,
          textTransform: "capitalize",
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: stateTone }} />
        {stateLabel(talent.state)}
      </div>
    </div>
  );
}

// Empty state
function EmptyState({
  searching,
  query,
  onClear,
}: {
  searching: boolean;
  query?: string;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        background: C.white,
        border: `1px dashed ${C.borderSoft}`,
        borderRadius: 14,
        padding: "44px 24px",
        textAlign: "center",
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 10 }}>{searching ? "🔍" : "✨"}</div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 500,
          color: C.ink,
          letterSpacing: -0.2,
          marginBottom: 4,
        }}
      >
        {searching ? `No matches for "${query}"` : "Your roster is empty"}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: C.inkMuted,
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        {searching
          ? "Try a different name, type, or city — or clear the filters to see everyone."
          : "Add your first talent to get started."}
      </div>
      {searching && (
        <button
          type="button"
          onClick={onClear}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.ink,
            fontFamily: FONT,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// Bulk action bar — sticky bottom when selection > 0
function BulkActionBar({
  count,
  onClear,
  onPublish,
  onArchive,
}: {
  count: number;
  onClear: () => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        background: C.ink,
        borderRadius: 999,
        boxShadow: "0 8px 32px -8px rgba(11,11,13,0.40)",
        fontFamily: FONT,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.72)", fontWeight: 500 }}>
        {count} selected
      </span>
      <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
      <button
        type="button"
        onClick={onPublish}
        style={{
          padding: "5px 12px",
          borderRadius: 999,
          background: C.green,
          border: "none",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        Publish
      </button>
      <button
        type="button"
        onClick={onArchive}
        style={{
          padding: "5px 12px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "rgba(255,255,255,0.80)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        Archive
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.10)",
          border: "none",
          color: "rgba(255,255,255,0.60)",
          fontSize: 13,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Type filter chips ────────────────────────────────────────────────────────

function TypeChips({
  types,
  active,
  onSelect,
}: {
  types: string[];
  active: string;
  onSelect: (t: string) => void;
}) {
  if (types.length === 0) return null;

  const chips = ["all", ...types];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 14,
      }}
    >
      {chips.map((chip) => {
        const isActive = active === chip;
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 28,
              padding: "0 11px",
              borderRadius: 999,
              border: `1px solid ${isActive ? C.greenDeep : C.border}`,
              background: isActive ? C.greenSoft : "transparent",
              color: isActive ? C.greenDeep : C.inkMuted,
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              fontFamily: FONT,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background 0.1s, border-color 0.1s, color 0.1s",
            }}
          >
            {chip === "all" ? "All types" : chip}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function RosterClientShell({
  roster,
  tenantSlug,
  canEdit,
}: {
  roster: RosterTalent[];
  tenantSlug: string;
  canEdit: boolean;
}) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [view, setView] = useState<ViewMode>("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Unique non-empty type labels actually present in the roster
  const usedTypes = Array.from(
    new Set(roster.map((r) => r.primaryTypeLabel).filter((t): t is string => !!t))
  ).sort();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelected = () => setSelected(new Set());
  const selectAll = () =>
    setSelected(new Set(filteredRoster.map((p) => p.id)));

  const filteredRoster = roster
    .filter((p) => stateFilter === "all" || p.state === stateFilter)
    .filter((p) => typeFilter === "all" || p.primaryTypeLabel === typeFilter)
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q) ||
        (p.primaryTypeLabel ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "name") {
        const r = a.name.localeCompare(b.name);
        return sortDir === "asc" ? r : -r;
      }
      return 0; // newest = source order
    });

  const exportCsv = () => {
    downloadCsv(
      `roster-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredRoster.map((p) => ({
        name: p.name,
        state: p.state,
        type: p.primaryTypeLabel ?? "",
        city: p.city ?? "",
        height: p.height ?? "",
      })),
    );
    showToast(`Exported ${filteredRoster.length} rows to CSV`);
  };

  const isSearching = !!search.trim() || stateFilter !== "all" || typeFilter !== "all";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Page header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
            Talent
          </p>
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.4,
              lineHeight: 1.15,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Roster
            <span
              style={{
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 400,
                color: C.inkMuted,
              }}
            >
              {roster.length}
            </span>
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
            Profiles you represent. Each one moves through draft → invited → published → claimed.
          </p>
        </div>

        {/* Header actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {canEdit && (
            <>
              {/* More menu (Export / Import) */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  aria-label="More actions"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: C.white,
                    border: `1px solid ${C.borderSoft}`,
                    color: C.ink,
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: FONT,
                  }}
                >
                  ⋯
                </button>
                {moreOpen && (
                  <>
                    <div
                      onClick={() => setMoreOpen(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 50 }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        zIndex: 51,
                        background: C.white,
                        border: `1px solid ${C.borderSoft}`,
                        borderRadius: 10,
                        boxShadow: "0 12px 36px -8px rgba(11,11,13,0.20)",
                        minWidth: 180,
                        padding: 4,
                        fontFamily: FONT,
                      }}
                    >
                      {[
                        {
                          id: "export",
                          label: "Export CSV",
                          onClick: () => {
                            setMoreOpen(false);
                            exportCsv();
                          },
                        },
                        {
                          id: "import",
                          label: "Import CSV",
                          onClick: () => {
                            setMoreOpen(false);
                            showToast("Bulk import coming soon");
                          },
                        },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onClick}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: 12.5,
                            fontWeight: 500,
                            color: C.ink,
                            fontFamily: FONT,
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Invite ghost button */}
              <a
                href={`/${tenantSlug}/admin/roster/invite`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: `1px solid ${C.borderSoft}`,
                  background: "transparent",
                  color: C.ink,
                  fontFamily: FONT,
                  fontSize: 12.5,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Invite
              </a>

              {/* Add talent primary */}
              <a
                href={`/${tenantSlug}/admin/roster/new`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 8,
                  background: C.accent,
                  color: "#fff",
                  fontFamily: FONT,
                  fontSize: 12.5,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Add talent
              </a>
            </>
          )}
        </div>
      </div>

      {/* ── Status strip ── */}
      <StatusStrip
        roster={roster}
        active={stateFilter}
        onFilter={(f) => setStateFilter((cur) => (cur === f ? "all" : f))}
      />

      {/* ── Type filter chips ── */}
      <TypeChips
        types={usedTypes}
        active={typeFilter}
        onSelect={(t) => setTypeFilter((cur) => (cur === t ? "all" : t))}
      />

      {/* ── Filter bar ── */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        sort={sort}
        sortDir={sortDir}
        onSort={(s) => {
          if (s === sort) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSort(s);
            setSortDir("asc");
          }
        }}
        view={view}
        onView={setView}
        selectedCount={selected.size}
        canBulk={canEdit}
        onSelectAll={selectAll}
        onClearSelection={clearSelected}
        resultCount={filteredRoster.length}
        totalCount={roster.length}
      />

      {/* ── Body ── */}
      {filteredRoster.length === 0 ? (
        <EmptyState
          searching={isSearching}
          query={search.trim()}
          onClear={() => {
            setSearch("");
            setStateFilter("all");
            setTypeFilter("all");
          }}
        />
      ) : view === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {filteredRoster.map((talent) => (
            <TalentCard
              key={talent.id}
              talent={talent}
              selected={selected.has(talent.id)}
              onSelect={canEdit ? toggleSelect : undefined}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            background: C.white,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
            fontFamily: FONT,
          }}
        >
          {/* Column header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 14px",
              background: "rgba(11,11,13,0.02)",
              borderBottom: `1px solid ${C.borderSoft}`,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: C.inkMuted,
            }}
          >
            {canEdit && <span style={{ width: 18, flexShrink: 0 }} />}
            <span style={{ width: 36, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>Name · type · city</span>
            <span style={{ width: 80, flexShrink: 0 }}>State</span>
          </div>
          {filteredRoster.map((talent, i) => (
            <TalentListRow
              key={talent.id}
              talent={talent}
              isFirst={i === 0}
              selected={selected.has(talent.id)}
              onSelect={canEdit ? toggleSelect : undefined}
            />
          ))}
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && canEdit && (
        <BulkActionBar
          count={selected.size}
          onClear={clearSelected}
          onPublish={() => {
            showToast(`Published ${selected.size} profile${selected.size === 1 ? "" : "s"}`);
            clearSelected();
          }}
          onArchive={() => {
            showToast(`Archived ${selected.size} profile${selected.size === 1 ? "" : "s"}`);
            clearSelected();
          }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 70,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            background: C.ink,
            color: "#fff",
            borderRadius: 999,
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: FONT,
            boxShadow: "0 8px 32px -8px rgba(11,11,13,0.40)",
            pointerEvents: "none",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
