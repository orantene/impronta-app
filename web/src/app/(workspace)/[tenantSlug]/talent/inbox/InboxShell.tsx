"use client";

// InboxShell — client wrapper for talent inbox filter tabs.
// Receives all inquiries from the server component and handles local filter state.

import Link from "next/link";
import { useState } from "react";
import type { TalentInquiryRow } from "../../_data-bridge";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.025)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:  "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
  indigoDeep: "#2B3FA3",
  indigoSoft: "rgba(43,63,163,0.07)",
  blueDeep:   "#1D4ED8",
  blueSoft:   "rgba(29,78,216,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

type FilterKey = "action" | "active" | "confirmed" | "closed" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "action",    label: "Action needed" },
  { key: "active",    label: "Active" },
  { key: "confirmed", label: "Confirmed" },
  { key: "closed",    label: "Closed" },
  { key: "all",       label: "All" },
];

function matchesFilter(inq: TalentInquiryRow, filter: FilterKey): boolean {
  switch (filter) {
    case "action":
      return inq.participantStatus === "invited" || inq.status === "offer_pending";
    case "active":
      return ["submitted", "coordination", "offer_pending", "approved"].includes(inq.status);
    case "confirmed":
      return ["booked", "converted"].includes(inq.status);
    case "closed":
      return ["rejected", "expired", "closed", "closed_lost", "archived"].includes(inq.status);
    case "all":
    default:
      return true;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function relativeDate(iso: string): string {
  const diffH = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  const diffD = diffH / 24;
  if (diffD < 30) return `${Math.floor(diffD)}d ago`;
  return fmtDate(iso);
}

function statusTone(status: string): { bg: string; color: string; label: string } {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    booked:      { bg: C.successSoft, color: C.successDeep, label: "Booked" },
    converted:   { bg: C.successSoft, color: C.successDeep, label: "Booked" },
    approved:    { bg: C.accentSoft,  color: C.accent,      label: "Approved" },
    offer_pending: { bg: C.amberSoft, color: C.amberDeep,   label: "Offer pending" },
    submitted:   { bg: C.indigoSoft,  color: C.indigoDeep,  label: "Submitted" },
    coordination: { bg: C.indigoSoft, color: C.indigoDeep,  label: "In review" },
    rejected:    { bg: "rgba(11,11,13,0.04)", color: C.inkDim, label: "Rejected" },
    expired:     { bg: "rgba(11,11,13,0.04)", color: C.inkDim, label: "Expired" },
    closed_lost: { bg: "rgba(11,11,13,0.04)", color: C.inkDim, label: "Closed" },
    closed:      { bg: "rgba(11,11,13,0.04)", color: C.inkDim, label: "Closed" },
    archived:    { bg: "rgba(11,11,13,0.04)", color: C.inkDim, label: "Archived" },
    draft:       { bg: "rgba(11,11,13,0.04)", color: C.inkDim, label: "Draft" },
  };
  return (
    map[status] ?? {
      bg: "rgba(11,11,13,0.04)",
      color: C.inkDim,
      label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  );
}

export function InboxShell({
  inquiries,
  tenantSlug,
}: {
  inquiries: TalentInquiryRow[];
  tenantSlug: string;
}) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const actionCount = inquiries.filter((i) => matchesFilter(i, "action")).length;

  const filtered = inquiries
    .filter((i) => matchesFilter(i, activeFilter))
    // Sort: unread first → action-needed → recency
    .sort((a, b) => {
      if ((b.unreadCount > 0 ? 1 : 0) !== (a.unreadCount > 0 ? 1 : 0))
        return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
      const aNeedsAction = a.participantStatus === "invited" || a.status === "offer_pending" ? 1 : 0;
      const bNeedsAction = b.participantStatus === "invited" || b.status === "offer_pending" ? 1 : 0;
      if (bNeedsAction !== aNeedsAction) return bNeedsAction - aNeedsAction;
      return new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime();
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          background: "rgba(11,11,13,0.04)",
          border: "1px solid rgba(24,24,27,0.08)",
          borderRadius: 10,
          padding: 3,
          width: "fit-content",
          fontFamily: FONT,
        }}
      >
        {FILTERS.map(({ key, label }) => {
          const isActive = activeFilter === key;
          const badge = key === "action" && actionCount > 0 ? actionCount : null;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                height: 30,
                padding: "0 12px",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                fontFamily: FONT,
                fontSize: 12.5,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? C.ink : C.inkMuted,
                background: isActive ? "#fff" : "transparent",
                boxShadow: isActive ? "0 1px 3px rgba(11,11,13,0.12), 0 0 0 1px rgba(24,24,27,0.06)" : "none",
                transition: "all 100ms",
                whiteSpace: "nowrap",
              }}
            >
              {label}
              {badge != null && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    background: C.amberDeep,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "0 4px",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            background: "rgba(11,11,13,0.02)",
            border: "1px dashed rgba(24,24,27,0.08)",
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 13, color: C.inkMuted, fontFamily: FONT }}>
            Nothing in this view.
          </div>
        </div>
      ) : (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {filtered.map((inq, idx) => {
            const s = statusTone(inq.status);
            const needsAction = inq.participantStatus === "invited" || inq.status === "offer_pending";
            const activityAt = inq.updated_at ?? inq.created_at;
            return (
              <div
                key={inq.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "13px 16px",
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                  fontFamily: FONT,
                  background: inq.unreadCount > 0 || needsAction
                    ? "rgba(15,79,62,0.025)"
                    : "transparent",
                }}
              >
                {/* Status dot */}
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: s.color,
                    flexShrink: 0,
                  }}
                />

                {/* Main content */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: s.bg,
                        color: s.color,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        textTransform: "uppercase" as const,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.label}
                    </span>
                    {needsAction && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.amberDeep,
                          background: C.amberSoft,
                          padding: "1px 7px",
                          borderRadius: 999,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Your turn
                      </span>
                    )}
                    {inq.unreadCount > 0 && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: C.blueDeep,
                          background: C.blueSoft,
                          borderRadius: 999,
                          padding: "1px 7px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {inq.unreadCount} new
                      </span>
                    )}
                    {(inq.sourceChannel === "discover_single_talent" ||
                      inq.sourceChannel === "discover_shortlist") && (
                      <span
                        title={
                          inq.sourceChannel === "discover_shortlist"
                            ? "Client added you from a Discover shortlist alongside other talents."
                            : "Client found you on Discover and reached out directly."
                        }
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.blueDeep,
                          background: C.blueSoft,
                          padding: "1px 7px",
                          borderRadius: 999,
                          whiteSpace: "nowrap",
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                        }}
                      >
                        ◎ via {inq.sourceChannel === "discover_shortlist" ? "Shortlist" : "Discover"}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: C.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inq.contact_name}
                    {inq.company && (
                      <span style={{ color: C.inkMuted, fontWeight: 400, marginLeft: 6 }}>
                        · {inq.company}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                    {[inq.event_location, fmtDate(inq.event_date)].filter(Boolean).join(" · ") || "No event details"}
                  </div>
                </div>

                {/* Right column */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 7,
                  }}
                >
                  <span style={{ fontSize: 11, color: C.inkDim, whiteSpace: "nowrap" }}>
                    {relativeDate(activityAt)}
                  </span>
                  <Link
                    href={`/${tenantSlug}/talent/inbox/${inq.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.borderSoft}`,
                      color: C.blueDeep,
                      fontSize: 11.5,
                      fontWeight: 600,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open thread
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
