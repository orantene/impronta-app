"use client";

// ClientsClientShell — full prototype-fidelity Clients page.
// Receives pre-fetched client rows from the server.

import { useState } from "react";
import type { WorkspaceClientRow } from "../../_data-bridge";
import { TrustBadge } from "@/components/trust-badge";

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
  accent:     "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// Hash a string to a number 0–5 for avatar tint variation
function hashName(name: string): number {
  let h = 0;
  for (const c of name) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 6;
}

const AVATAR_TINTS = [
  { bg: "rgba(15,79,62,0.10)",  color: "#0F4F3E" },
  { bg: "rgba(59,94,158,0.10)", color: "#3B5E9E" },
  { bg: "rgba(139,79,22,0.10)", color: "#8B4F16" },
  { bg: "rgba(140,56,140,0.10)", color: "#8C388C" },
  { bg: "rgba(22,110,88,0.10)", color: "#166E58" },
  { bg: "rgba(184,78,0,0.10)",  color: "#B84E00" },
];

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const tint = AVATAR_TINTS[hashName(name)];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: tint.bg,
        color: tint.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        flexShrink: 0,
        fontFamily: FONT,
        letterSpacing: 0.4,
        userSelect: "none",
      }}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Status strip ─────────────────────────────────────────────────────────────

function ClientsStatusStrip({
  clients,
  statusFilter,
  onFilter,
}: {
  clients: WorkspaceClientRow[];
  statusFilter: "all" | "active" | "inactive";
  onFilter: (f: "active" | "inactive") => void;
}) {
  const activeCount = clients.filter((c) => c.accountStatus === "active").length;
  const inactiveCount = clients.filter((c) => c.accountStatus !== "active").length;
  const totalInquiries = clients.reduce((sum, c) => sum + c.inquiryCount, 0);
  const totalBookings = clients.reduce((sum, c) => sum + c.bookingsYTD, 0);

  const items: { id: "active" | "inactive" | "total" | "bookings"; label: string; value: number; tone: string; clickId?: "active" | "inactive" }[] = [
    { id: "active",   label: "Active",          value: activeCount,    tone: "#2E7D5B",             clickId: "active" },
    { id: "inactive", label: "Registered",      value: inactiveCount,  tone: "rgba(11,11,13,0.38)", clickId: "inactive" },
    { id: "total",    label: "Inquiries total",  value: totalInquiries, tone: "#3B5E9E" },
    { id: "bookings", label: "Bookings YTD",     value: totalBookings,  tone: "#8B4F16" },
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
        marginBottom: 16,
        fontFamily: FONT,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map((it, i) => {
        const isActive = it.clickId && statusFilter === it.clickId;
        return (
          <div
            key={it.id}
            onClick={it.clickId ? () => onFilter(it.clickId!) : undefined}
            style={{
              flex: 1,
              minWidth: 80,
              padding: "10px 14px",
              textAlign: "left",
              borderRight: i < items.length - 1 ? `1px solid ${C.borderSoft}` : "none",
              cursor: it.clickId ? "pointer" : "default",
              background: isActive ? C.greenSoft : "transparent",
              borderRadius: 8,
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
              {it.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function ClientsClientShell({
  clients,
  tenantSlug,
  canEdit,
}: {
  clients: WorkspaceClientRow[];
  tenantSlug: string;
  canEdit: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = useState<"name" | "inquiries" | "bookings">("name");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = clients
    .filter((c) => {
      if (statusFilter === "active") return c.accountStatus === "active";
      if (statusFilter === "inactive") return c.accountStatus !== "active";
      return true;
    })
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "inquiries") return b.inquiryCount - a.inquiryCount;
      if (sort === "bookings") return b.bookingsYTD - a.bookingsYTD;
      return a.name.localeCompare(b.name);
    });

  const isFiltering = !!search.trim() || statusFilter !== "all" || sort !== "name";

  const exportCsv = () => {
    downloadCsv(
      `clients-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((c) => ({
        name: c.name,
        company: c.company ?? "",
        status: c.accountStatus ?? "",
        inquiries: String(c.inquiryCount),
        bookings_ytd: String(c.bookingsYTD),
      })),
    );
    showToast(`Exported ${filtered.length} rows to CSV`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header ── */}
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
            CRM
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
            Clients
            <span style={{ fontSize: 15, fontWeight: 400, color: C.inkMuted }}>
              {clients.length}
            </span>
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
            {clients.length === 0
              ? "Clients who have placed inquiries will appear here."
              : `${clients.length} client${clients.length === 1 ? "" : "s"} you've worked with.`}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {clients.length > 0 && (
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
          )}
        </div>
      </div>

      {/* ── Status strip ── */}
      {clients.length > 0 && (
        <ClientsStatusStrip
          clients={clients}
          statusFilter={statusFilter}
          onFilter={(f) => setStatusFilter((cur) => cur === f ? "all" : f)}
        />
      )}

      {clients.length === 0 ? (
        <div
          style={{
            background: C.white,
            border: `1px dashed ${C.borderSoft}`,
            borderRadius: 14,
            padding: "48px 24px",
            textAlign: "center",
            fontFamily: FONT,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>👥</div>
          <div style={{ fontSize: 17, fontWeight: 500, color: C.ink, letterSpacing: -0.2, marginBottom: 4 }}>
            No clients yet
          </div>
          <div style={{ fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
            Clients who submit inquiries through your channels appear here.
          </div>
        </div>
      ) : (
        <>
          {/* ── Filter bar ── */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              aria-label="Search clients by name or company"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or company…"
              style={{
                flex: 1,
                minWidth: 200,
                padding: "8px 12px",
                fontFamily: FONT,
                fontSize: 13,
                color: C.ink,
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                outline: "none",
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
              <option value="name">Name A–Z</option>
              <option value="inquiries">Most inquiries</option>
              <option value="bookings">Most bookings YTD</option>
            </select>
            {isFiltering && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setSort("name");
                }}
                style={{
                  padding: "7px 10px",
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

          {/* ── Table ── */}
          <div
            style={{
              background: C.white,
              borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              overflow: "hidden",
            }}
          >
            {/* Column headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,2fr) 80px 100px 100px 110px",
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
              <span>Client</span>
              <span>Trust</span>
              <span>Inquiries</span>
              <span>Bookings YTD</span>
              <span>Status</span>
            </div>

            {/* Rows */}
            {filtered.length === 0 ? (
              <div style={{ padding: "32px 24px", textAlign: "center", fontFamily: FONT }}>
                <div style={{ fontSize: 14, color: C.inkMuted }}>No clients match</div>
                <button
                  type="button"
                  onClick={() => { setSearch(""); setStatusFilter("all"); }}
                  style={{
                    marginTop: 12,
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    color: C.ink,
                    fontFamily: FONT,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filtered.map((client, idx) => {
                const isActive = client.accountStatus === "active";
                return (
                  <div
                    key={client.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,2fr) 80px 100px 100px 110px",
                      alignItems: "center",
                      gap: 14,
                      padding: "13px 18px",
                      borderTop: idx > 0 ? `1px solid ${C.borderSoft}` : "none",
                      cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "rgba(11,11,13,0.025)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    {/* Client */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <Avatar name={client.name} size={34} />
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
                          {client.name}
                        </div>
                        {client.company && (
                          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>
                            {client.company}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Trust badge */}
                    <div>
                      <TrustBadge level={client.trustLevel ?? "basic"} size="sm" />
                    </div>

                    {/* Inquiry count */}
                    <div style={{ fontSize: 12, color: C.inkMuted }}>
                      {client.inquiryCount} {client.inquiryCount === 1 ? "inq" : "inqs"}
                    </div>

                    {/* Bookings YTD */}
                    <div style={{ fontSize: 12, color: client.bookingsYTD > 0 ? C.green : C.inkDim, fontWeight: client.bookingsYTD > 0 ? 600 : 400 }}>
                      {client.bookingsYTD > 0
                        ? `${client.bookingsYTD} booking${client.bookingsYTD === 1 ? "" : "s"}`
                        : "—"}
                    </div>

                    {/* Status */}
                    <div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "3px 9px",
                          borderRadius: 999,
                          background: isActive
                            ? "rgba(46,125,91,0.10)"
                            : "rgba(11,11,13,0.05)",
                          color: isActive ? "#1A5E3C" : C.inkMuted,
                          fontSize: 10.5,
                          fontWeight: 600,
                          textTransform: "capitalize",
                          fontFamily: FONT,
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: isActive ? C.green : C.inkMuted,
                          }}
                        />
                        {client.accountStatus ?? "registered"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
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
