"use client";

/**
 * FormsInboxClient — the toolbar and the submission list.
 *
 * Owns the ONE list of submissions on this surface. Previously the server page
 * also rendered a <table> of the same rows above this component, so every
 * submission appeared twice; the table is gone and this list carries the
 * columns it used to show (form name, source, received-at).
 *
 * Handles:
 *  - Search input (updates URL query ?q=)
 *  - Section filter select (updates URL query ?section=)
 *  - Mark-read and archive actions via server actions
 *  - CSV export (calls exportSubmissionsCsv, triggers a Blob download)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  markSubmissionRead,
  archiveSubmission,
  markAllRead,
  exportSubmissionsCsv,
} from "./actions";
import type { FormSubmissionRow } from "./page";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.05)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.035)",
  red: "#9B1C1C",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

/** Grid template shared by the list header and every summary row, so the
 *  columns actually line up instead of drifting per row width. */
const ROW_GRID = "10px minmax(0, 2.1fr) minmax(0, 1.4fr) minmax(0, 1.2fr) 92px 16px";

type SectionItem = { id: string; name: string };

interface Props {
  tenantSlug: string;
  sectionList: SectionItem[];
  activeSectionId: string | null;
  activeStatus: string;
  searchQuery: string;
  rows: FormSubmissionRow[];
  /** Rows in this status before the in-memory text search, for "N of M". */
  totalInStatus: number;
}

function ActionButton({
  label,
  onClick,
  pending,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  pending?: boolean;
  variant?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 30,
        padding: "0 12px",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: FONT,
        border: `1px solid ${variant === "accent" ? C.accent : C.border}`,
        borderRadius: 7,
        background: variant === "accent" ? C.accent : C.cardBg,
        color: variant === "accent" ? "#fff" : C.ink,
        cursor: pending ? "wait" : "pointer",
        opacity: pending ? 0.6 : 1,
        transition: "opacity 120ms",
        whiteSpace: "nowrap" as const,
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}

/** Submission payload as an aligned label→value grid. `name`/`email` are
 *  skipped — the summary row already shows them. */
function PayloadDetail({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(
    ([k, v]) => k !== "email" && k !== "name" && v != null && String(v).trim() !== "",
  );
  if (entries.length === 0) {
    return (
      <div style={{ fontSize: 12, color: C.inkDim, fontStyle: "italic" }}>
        No additional fields were submitted.
      </div>
    );
  }
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(90px, max-content) minmax(0, 1fr)",
        columnGap: 14,
        rowGap: 7,
        margin: 0,
        fontSize: 12.5,
      }}
    >
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt
            style={{
              color: C.inkDim,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase" as const,
              paddingTop: 2,
            }}
          >
            {k.replace(/[_-]+/g, " ")}
          </dt>
          <dd
            style={{
              margin: 0,
              color: C.ink,
              minWidth: 0,
              whiteSpace: "pre-wrap" as const,
              overflowWrap: "anywhere" as const,
              lineHeight: 1.5,
            }}
          >
            {String(v)}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function EmptyState({
  activeStatus,
  isFiltered,
  onClear,
}: {
  activeStatus: string;
  isFiltered: boolean;
  onClear: () => void;
}) {
  const copy: Record<string, { title: string; body: string }> = {
    new: {
      title: "No new submissions",
      body: "When someone fills in a contact form on your site, it shows up here straight away.",
    },
    read: { title: "Nothing marked read", body: "Submissions you have opened and marked read collect here." },
    archived: { title: "Nothing archived", body: "Archived submissions stay searchable and still export to CSV." },
    spam: { title: "No spam", body: "Submissions flagged as spam are kept here rather than deleted." },
  };
  const c = copy[activeStatus] ?? { title: "Nothing here", body: "" };
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "40px 28px",
        textAlign: "center" as const,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
        {isFiltered ? "No matches" : c.title}
      </div>
      <div style={{ marginTop: 6, fontSize: 12.5, color: C.inkMuted, maxWidth: 400, margin: "6px auto 0" }}>
        {isFiltered ? "No submissions in this tab match your search or form filter." : c.body}
      </div>
      {isFiltered && (
        <button
          type="button"
          onClick={onClear}
          style={{
            marginTop: 14,
            height: 30,
            padding: "0 14px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: FONT,
            border: `1px solid ${C.border}`,
            borderRadius: 7,
            background: C.cardBg,
            color: C.ink,
            cursor: "pointer",
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export function FormsInboxClient({
  tenantSlug,
  sectionList,
  activeSectionId,
  activeStatus,
  searchQuery,
  rows,
  totalInStatus,
}: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pendingAllRead, setPendingAllRead] = React.useState(false);
  const [pendingExport, setPendingExport] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const buildHref = React.useCallback(
    (overrides: { status?: string | null; section?: string | null; q?: string | null }) => {
      const sp = new URLSearchParams();
      sp.set("status", overrides.status ?? activeStatus);
      const sec = "section" in overrides ? overrides.section : activeSectionId;
      if (sec) sp.set("section", sec);
      const q = "q" in overrides ? overrides.q : searchQuery;
      if (q) sp.set("q", q);
      return `/${tenantSlug}/admin/website/forms?${sp.toString()}`;
    },
    [tenantSlug, activeStatus, activeSectionId, searchQuery],
  );

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      router.replace(buildHref({ q: val || null }));
    }, 300);
  }

  function handleSectionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(buildHref({ section: e.target.value || null }));
  }

  function handleClearFilters() {
    router.replace(buildHref({ section: null, q: null }));
  }

  async function handleMarkRead(id: string) {
    setPendingId(id);
    try {
      await markSubmissionRead(tenantSlug, id);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function handleArchive(id: string) {
    setPendingId(id);
    try {
      await archiveSubmission(tenantSlug, id);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function handleMarkAllRead() {
    setPendingAllRead(true);
    try {
      await markAllRead(tenantSlug, activeSectionId ?? undefined);
      router.refresh();
    } finally {
      setPendingAllRead(false);
    }
  }

  async function handleExport() {
    setPendingExport(true);
    setExportError(null);
    try {
      const result = await exportSubmissionsCsv(tenantSlug, activeSectionId ?? undefined);
      if (!result.ok) {
        setExportError(result.error);
        return;
      }
      // Trigger browser download.
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `form-submissions-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setPendingExport(false);
    }
  }

  const isFiltered = Boolean(searchQuery) || Boolean(activeSectionId);
  const newCount = rows.filter((r) => r.status === "new").length;
  const activeSectionName = activeSectionId
    ? (sectionList.find((s) => s.id === activeSectionId)?.name ?? null)
    : null;

  const inputStyle: React.CSSProperties = {
    height: 30,
    padding: "0 10px",
    fontSize: 12.5,
    fontFamily: FONT,
    border: `1px solid ${C.border}`,
    borderRadius: 7,
    background: C.cardBg,
    color: C.ink,
    outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT, minWidth: 0 }}>
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
          <input
            type="search"
            aria-label="Search submissions"
            placeholder="Search name, email, content…"
            defaultValue={searchQuery}
            onChange={handleSearchChange}
            style={{ ...inputStyle, minWidth: 230 }}
          />

          {sectionList.length > 1 && (
            <select
              aria-label="Filter by form"
              value={activeSectionId ?? ""}
              onChange={handleSectionChange}
              style={{ ...inputStyle, cursor: "pointer", maxWidth: 220 }}
            >
              <option value="">All forms</option>
              {sectionList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          <span style={{ fontSize: 11.5, color: C.inkDim, whiteSpace: "nowrap" as const }}>
            {isFiltered
              ? `${rows.length} of ${totalInStatus}`
              : `${rows.length} ${rows.length === 1 ? "submission" : "submissions"}`}
            {activeSectionName ? ` · ${activeSectionName}` : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {activeStatus === "new" && newCount > 0 && (
            <ActionButton
              label={`Mark all read (${newCount})`}
              onClick={handleMarkAllRead}
              pending={pendingAllRead}
            />
          )}
          <ActionButton
            label="Export CSV"
            onClick={handleExport}
            pending={pendingExport}
            variant="accent"
          />
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          style={{
            border: `1px solid rgba(155,28,28,0.25)`,
            background: "rgba(155,28,28,0.05)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12.5,
            color: C.red,
          }}
        >
          Export failed: {exportError}
        </div>
      )}

      {/* ── Submission list ── */}
      {rows.length === 0 ? (
        <EmptyState activeStatus={activeStatus} isFiltered={isFiltered} onClear={handleClearFilters} />
      ) : (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {/* Column header — the labels the removed <table> used to carry. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: ROW_GRID,
              alignItems: "center",
              gap: 12,
              padding: "9px 16px",
              background: C.surface,
              borderBottom: `1px solid ${C.border}`,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase" as const,
              color: C.inkDim,
            }}
          >
            <span aria-hidden />
            <span>Contact</span>
            <span>Form</span>
            <span>Source</span>
            <span style={{ textAlign: "right" as const }}>Received</span>
            <span aria-hidden />
          </div>

          {rows.map((row, i) => {
            const isExpanded = expandedId === row.id;
            const isPendingThis = pendingId === row.id;
            const isNew = row.status === "new";
            const sourcePath = row.source_url
              ? (row.source_url.replace(/^https?:\/\/[^/]+/, "") || "/")
              : null;
            return (
              <div
                key={row.id}
                style={{
                  borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}`,
                  background: isNew && !isExpanded ? C.accentSoft : C.cardBg,
                }}
              >
                {/* Summary row — a real <button> so keyboard + AT get the
                    expand/collapse semantics for free. */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  aria-expanded={isExpanded}
                  style={{
                    display: "grid",
                    gridTemplateColumns: ROW_GRID,
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "11px 16px",
                    border: "none",
                    background: "transparent",
                    font: "inherit",
                    textAlign: "left" as const,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", justifyContent: "center" }}>
                    {isNew && (
                      <span
                        title="Unread"
                        style={{
                          display: "block",
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: C.accent,
                        }}
                      />
                    )}
                  </span>

                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontWeight: isNew ? 700 : 500,
                        color: C.ink,
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {row.contact_name ?? row.contact_email ?? "(no name)"}
                    </span>
                    {row.contact_email && row.contact_name && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 11.5,
                          color: C.inkMuted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        {row.contact_email}
                      </span>
                    )}
                  </span>

                  <span
                    style={{
                      minWidth: 0,
                      fontSize: 12.5,
                      color: C.inkMuted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {row.section_name}
                  </span>

                  <span
                    title={row.source_url ?? undefined}
                    style={{
                      minWidth: 0,
                      fontSize: 11.5,
                      color: sourcePath ? C.inkMuted : C.inkDim,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {sourcePath ?? "—"}
                  </span>

                  <span
                    style={{
                      fontSize: 11.5,
                      color: C.inkDim,
                      textAlign: "right" as const,
                      whiteSpace: "nowrap" as const,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {new Date(row.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>

                  <span
                    aria-hidden
                    style={{
                      fontSize: 11,
                      color: C.inkDim,
                      textAlign: "right" as const,
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 150ms",
                    }}
                  >
                    ▾
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "14px 16px 16px 38px",
                      borderTop: `1px solid ${C.borderSoft}`,
                      background: C.surface,
                    }}
                  >
                    <PayloadDetail payload={row.payload_jsonb} />

                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        gap: 14,
                        flexWrap: "wrap" as const,
                        fontSize: 11.5,
                        color: C.inkMuted,
                      }}
                    >
                      {row.contact_email && (
                        <span>
                          Reply:{" "}
                          <a href={`mailto:${row.contact_email}`} style={{ color: C.accent }}>
                            {row.contact_email}
                          </a>
                        </span>
                      )}
                      {row.source_url && (
                        <span style={{ minWidth: 0, overflowWrap: "anywhere" as const }}>
                          Sent from:{" "}
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: C.accent }}
                          >
                            {row.source_url}
                          </a>
                        </span>
                      )}
                      <span>
                        Received{" "}
                        {new Date(row.created_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {(row.status === "new" || row.status === "read") && (
                      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                        {row.status === "new" && (
                          <ActionButton
                            label="Mark as read"
                            onClick={() => handleMarkRead(row.id)}
                            pending={isPendingThis}
                          />
                        )}
                        <ActionButton
                          label="Archive"
                          onClick={() => handleArchive(row.id)}
                          pending={isPendingThis}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
