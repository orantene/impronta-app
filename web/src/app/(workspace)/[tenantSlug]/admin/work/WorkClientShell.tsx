"use client";

// WorkClientShell — full prototype-fidelity Work / pipeline page.
// Receives pre-fetched inquiry rows from the server, handles all
// search / sort / filter state client-side.

import { useState } from "react";
import type { WorkspaceInquiryRow } from "../../_data-bridge";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  white:      "#ffffff",
  green:      "#2E7D5B",
  greenSoft:  "rgba(15,79,62,0.06)",
  greenDeep:  "#1A5E3C",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(212,160,23,0.10)",
  violet:     "#6B3EBB",
  violetSoft: "rgba(107,62,187,0.10)",
  sky:        "#1B6E9C",
  skySoft:    "rgba(27,110,156,0.10)",
  accent:     "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Stage derivation from status ────────────────────────────────────────────

type Stage = "new" | "active" | "awaiting" | "offer";

function deriveStage(status: string): Stage {
  if (["new", "submitted"].includes(status)) return "new";
  if (["offer_pending", "offer_sent", "offer_countered", "pending_offer"].includes(status))
    return "offer";
  if (["waiting_for_client", "talent_suggested"].includes(status)) return "awaiting";
  return "active"; // coordination, reviewing, in_progress, qualified, assigned, etc.
}

const STAGE_META: Record<Stage, { label: string; bg: string; color: string; dot: string }> = {
  new:      { label: "New",             bg: C.skySoft,    color: C.sky,      dot: C.sky },
  active:   { label: "In progress",     bg: C.amberSoft,  color: C.amber,    dot: C.amber },
  awaiting: { label: "Awaiting client", bg: C.amberSoft,  color: C.amber,    dot: "#D4A017" },
  offer:    { label: "Offer sent",      bg: C.violetSoft, color: C.violet,   dot: C.violet },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function downloadCsv(filename: string, rows: Record<string, string>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Status strip ─────────────────────────────────────────────────────────────

function WorkStatusStrip({ inquiries }: { inquiries: WorkspaceInquiryRow[] }) {
  const counts = {
    new:      inquiries.filter((i) => deriveStage(i.status) === "new").length,
    active:   inquiries.filter((i) => deriveStage(i.status) === "active").length,
    awaiting: inquiries.filter((i) => deriveStage(i.status) === "awaiting").length,
    offer:    inquiries.filter((i) => deriveStage(i.status) === "offer").length,
  };

  const items: { id: Stage; label: string; tone: string }[] = [
    { id: "new",      label: "New",             tone: C.sky },
    { id: "active",   label: "In progress",     tone: C.amber },
    { id: "awaiting", label: "Awaiting client", tone: "#D4A017" },
    { id: "offer",    label: "Offer sent",      tone: C.violet },
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
        marginBottom: 20,
        fontFamily: FONT,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map((it, i) => {
        const count = counts[it.id];
        return (
          <div
            key={it.id}
            style={{
              flex: 1,
              minWidth: 80,
              padding: "10px 14px",
              textAlign: "left",
              borderRight: i < items.length - 1 ? `1px solid ${C.borderSoft}` : "none",
              opacity: count === 0 ? 0.45 : 1,
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
                color: C.ink,
                letterSpacing: -0.4,
                lineHeight: 1,
                fontFamily: FONT,
              }}
            >
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stage chip ───────────────────────────────────────────────────────────────

function StagePill({ status }: { status: string }) {
  const stage = deriveStage(status);
  const meta = STAGE_META[stage];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 10.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        fontFamily: FONT,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.dot }} />
      {meta.label}
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function WorkClientShell({
  inquiries,
  tenantSlug,
  canCreate,
}: {
  inquiries: WorkspaceInquiryRow[];
  tenantSlug: string;
  canCreate: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "client">("newest");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = inquiries
    .filter((iq) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        iq.contact_name.toLowerCase().includes(q) ||
        (iq.company ?? "").toLowerCase().includes(q) ||
        (iq.event_location ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "client") return a.contact_name.localeCompare(b.contact_name);
      if (sort === "oldest")
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      // newest (default)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const isFiltering = !!search.trim() || sort !== "newest";

  const exportCsv = () => {
    downloadCsv(
      `pipeline-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((iq) => ({
        client: iq.contact_name,
        company: iq.company ?? "",
        status: iq.status,
        event_date: iq.event_date ?? "",
        location: iq.event_location ?? "",
        quantity: String(iq.quantity ?? ""),
        created: formatShortDate(iq.created_at) ?? "",
      })),
    );
    showToast(`Exported ${filtered.length} rows to CSV`);
  };

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
            Pipeline
          </p>
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.4,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Workflow
            <span style={{ fontSize: 15, fontWeight: 400, color: C.inkMuted }}>
              {inquiries.length}
            </span>
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
            Every open inquiry grouped by where it&apos;s stuck — from first brief to confirmed booking.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={exportCsv}
            style={{
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: "transparent",
              color: C.ink,
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Export CSV
          </button>
          {canCreate && (
            <a
              href={`/${tenantSlug}/admin/work/new`}
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
              New inquiry
            </a>
          )}
        </div>
      </div>

      {/* ── Status strip ── */}
      <WorkStatusStrip inquiries={inquiries} />

      {/* ── Pipeline section ── */}
      <section>
        {/* Filter bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              fontFamily: FONT,
              fontSize: 18,
              fontWeight: 600,
              color: C.ink,
              margin: 0,
              letterSpacing: -0.2,
            }}
          >
            Active pipeline
            {isFiltering && (
              <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 400, color: C.inkMuted, marginLeft: 8 }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                {search.trim() && ` for "${search.trim()}"`}
              </span>
            )}
          </h2>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              aria-label="Search by client or location"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client or location…"
              style={{
                padding: "7px 10px",
                fontFamily: FONT,
                fontSize: 12.5,
                color: C.ink,
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                outline: "none",
                width: 200,
              }}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="Sort"
              style={{
                padding: "7px 10px",
                fontFamily: FONT,
                fontSize: 12.5,
                color: C.ink,
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                cursor: "pointer",
              }}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="client">Client A–Z</option>
            </select>
            {isFiltering && (
              <button
                type="button"
                onClick={() => { setSearch(""); setSort("newest"); }}
                style={{
                  padding: "4px 10px",
                  background: "transparent",
                  color: C.inkMuted,
                  border: `1px solid ${C.border}`,
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: FONT,
                  fontSize: 11.5,
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span aria-hidden>×</span> Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div
          style={{
            background: C.white,
            borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
            overflow: "hidden",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "44px 24px",
                textAlign: "center",
                fontFamily: FONT,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: C.ink, marginBottom: 4 }}>
                {search.trim() ? `No results for "${search.trim()}"` : "No open inquiries"}
              </div>
              <div style={{ fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
                {search.trim()
                  ? "Try a different search term."
                  : "When a brief comes in, it will appear here."}
              </div>
              {search.trim() && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    marginTop: 16,
                    padding: "7px 14px",
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
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) 120px 100px",
                  gap: 14,
                  padding: "9px 18px",
                  background: "rgba(11,11,13,0.02)",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  fontFamily: FONT,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: C.inkMuted,
                }}
              >
                <span>Client · context</span>
                <span>Event</span>
                <span>Stage</span>
                <span>Received</span>
              </div>

              {/* Rows */}
              {filtered.map((iq, idx) => {
                const clientLine = [iq.contact_name, iq.company]
                  .filter(Boolean)
                  .join(" · ");
                const eventLine = [
                  formatShortDate(iq.event_date),
                  iq.event_location,
                ].filter(Boolean).join(" · ");

                return (
                  <div
                    key={iq.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) 120px 100px",
                      alignItems: "center",
                      gap: 14,
                      padding: "13px 18px",
                      borderTop: idx > 0 ? `1px solid ${C.borderSoft}` : "none",
                      cursor: "pointer",
                      transition: "background 0.12s",
                      fontFamily: FONT,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "rgba(11,11,13,0.025)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    {/* Client */}
                    <div style={{ minWidth: 0 }}>
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
                        {clientLine || "Unnamed contact"}
                      </div>
                      {iq.next_action_by && (
                        <div style={{ fontSize: 11, color: iq.next_action_by === "client" ? "#8A6F1A" : C.inkMuted, marginTop: 1, fontWeight: iq.next_action_by === "client" ? 600 : 400 }}>
                          {iq.next_action_by === "client" ? "⏳ waiting on client" :
                           iq.next_action_by === "coordinator" ? "⚡ needs coordinator" :
                           iq.next_action_by === "talent" ? "🎭 needs talent" : null}
                        </div>
                      )}
                    </div>

                    {/* Event */}
                    <div
                      style={{
                        fontSize: 12,
                        color: C.inkMuted,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {eventLine || "—"}
                    </div>

                    {/* Stage */}
                    <div>
                      <StagePill status={iq.status} />
                    </div>

                    {/* Received */}
                    <div
                      style={{
                        fontSize: 11.5,
                        color: C.inkMuted,
                      }}
                    >
                      {formatRelativeDate(iq.created_at)}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </section>

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
