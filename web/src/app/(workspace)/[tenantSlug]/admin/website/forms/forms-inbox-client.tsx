"use client";

/**
 * FormsInboxClient — the interactive slice of the forms inbox.
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
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

type SectionItem = { id: string; name: string };

interface Props {
  tenantSlug: string;
  sectionList: SectionItem[];
  activeSectionId: string | null;
  activeStatus: string;
  searchQuery: string;
  rows: FormSubmissionRow[];
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
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: FONT,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        background: variant === "accent" ? C.accent : C.cardBg,
        color: variant === "accent" ? "#fff" : C.ink,
        cursor: pending ? "wait" : "pointer",
        opacity: pending ? 0.6 : 1,
        transition: "opacity 120ms",
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}

/** Show the submission payload as a small key→value list. */
function PayloadPreview({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([k]) => k !== "email" && k !== "name");
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 6,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        fontSize: 11.5,
        color: C.inkMuted,
      }}
    >
      {entries.slice(0, 6).map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 6 }}>
          <span style={{ minWidth: 80, color: C.inkDim, textTransform: "capitalize" }}>{k}:</span>
          <span style={{ color: C.ink }}>{String(v).slice(0, 200)}</span>
        </div>
      ))}
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
}: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pendingAllRead, setPendingAllRead] = React.useState(false);
  const [pendingExport, setPendingExport] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  function buildHref(overrides: Record<string, string | null>) {
    const sp = new URLSearchParams();
    if (overrides.status ?? activeStatus) sp.set("status", overrides.status ?? activeStatus);
    const sec = "section" in overrides ? overrides.section : activeSectionId;
    if (sec) sp.set("section", sec);
    const q = "q" in overrides ? overrides.q : searchQuery;
    if (q) sp.set("q", q);
    return `/${tenantSlug}/admin/website/forms?${sp.toString()}`;
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    // Debounced URL update — 300ms
    clearTimeout((handleSearchChange as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearchChange as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      router.replace(buildHref({ q: val || null }));
    }, 300);
  }

  function handleSectionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    router.replace(buildHref({ section: val || null }));
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
    try {
      const result = await exportSubmissionsCsv(tenantSlug, activeSectionId ?? undefined);
      if (!result.ok) {
        alert(`Export failed: ${result.error}`);
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

  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT }}>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* Search */}
          <input
            ref={searchRef}
            type="search"
            placeholder="Search name, email, content…"
            defaultValue={searchQuery}
            onChange={handleSearchChange}
            style={{
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: FONT,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              background: C.cardBg,
              color: C.ink,
              minWidth: 220,
              outline: "none",
            }}
          />

          {/* Section filter */}
          {sectionList.length > 1 && (
            <select
              value={activeSectionId ?? ""}
              onChange={handleSectionChange}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                fontFamily: FONT,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                background: C.cardBg,
                color: C.ink,
                cursor: "pointer",
              }}
            >
              <option value="">All forms</option>
              {sectionList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Action buttons */}
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

      {/* ── Detail rows (expandable) ── */}
      {rows.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {rows.map((row, i) => {
            const isExpanded = expandedId === row.id;
            const isPendingThis = pendingId === row.id;
            return (
              <div
                key={row.id}
                style={{
                  borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                  background: row.status === "new" ? "rgba(15,79,62,0.03)" : C.cardBg,
                }}
              >
                {/* Summary row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(isExpanded ? null : row.id); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    cursor: "pointer",
                    userSelect: "none" as const,
                  }}
                >
                  <div style={{ flex: "0 0 8px" }}>
                    {row.status === "new" && (
                      <span
                        style={{
                          display: "block",
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: C.accent,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: "1 1 0", minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: row.status === "new" ? 700 : 500,
                        color: C.ink,
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {row.contact_name ?? row.contact_email ?? "(no name)"}
                      {row.contact_email && row.contact_name && (
                        <span style={{ fontWeight: 400, color: C.inkMuted, marginLeft: 6 }}>
                          {row.contact_email}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>
                      {row.section_name}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: C.inkDim,
                      whiteSpace: "nowrap" as const,
                      flexShrink: 0,
                    }}
                  >
                    {new Date(row.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: C.inkDim,
                      flexShrink: 0,
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 150ms",
                    }}
                  >
                    ▾
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "0 16px 16px 36px",
                      borderTop: `1px solid ${C.border}`,
                      background: C.surface,
                    }}
                  >
                    <PayloadPreview payload={row.payload_jsonb} />

                    {row.source_url && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: C.inkMuted }}>
                        Source:{" "}
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: C.accent }}
                        >
                          {row.source_url}
                        </a>
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap" as const,
                      }}
                    >
                      {row.status === "new" && (
                        <ActionButton
                          label="Mark as read"
                          onClick={() => handleMarkRead(row.id)}
                          pending={isPendingThis}
                        />
                      )}
                      {(row.status === "new" || row.status === "read") && (
                        <ActionButton
                          label="Archive"
                          onClick={() => handleArchive(row.id)}
                          pending={isPendingThis}
                        />
                      )}
                    </div>
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
