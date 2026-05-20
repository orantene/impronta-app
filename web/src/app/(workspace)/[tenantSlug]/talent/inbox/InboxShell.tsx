"use client";

// InboxShell — client wrapper for talent inbox filter tabs.
// Receives all inquiries from the server component and handles local filter state.
//
// Phase 2 (remediation plan §4): the list rail now renders through the
// shared <ThreadShell> primitive. This file keeps the talent-specific 40%
// (status taxonomy, filter chips, sort) and projects each TalentInquiryRow
// onto the shell's role-agnostic ThreadShellListItem view-model. Visual
// output is byte-for-byte the prior bespoke list — the chip metrics that
// differed (status pill 10.5/2·8 vs state chips 10/1·7) are reproduced via
// ThreadBadge.fontSize/padding.

import { useState } from "react";
import type { TalentInquiryRow } from "../../_data-bridge";
import {
  ThreadShell,
  type ThreadBadge,
  type ThreadShellListItem,
} from "@/components/shared/ThreadShell";

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

// Project a raw talent inquiry row onto the role-agnostic ThreadShell
// view-model. All talent-specific taxonomy (status tone, "Your turn",
// Discover provenance) is resolved here so the shared shell stays
// taxonomy-free. Chip metrics mirror the prior inline markup exactly:
// the status pill is 10.5px / "2px 8px" (ThreadBadge defaults); the
// "Your turn" / "N new" / "via …" state chips are 10–10.5px / "1px 7px".
function toThreadItem(
  inq: TalentInquiryRow,
  tenantSlug: string,
): ThreadShellListItem {
  const s = statusTone(inq.status);
  const needsAction =
    inq.participantStatus === "invited" || inq.status === "offer_pending";
  const isDiscover =
    inq.sourceChannel === "discover_single_talent" ||
    inq.sourceChannel === "discover_shortlist";

  const badges: ThreadBadge[] = [
    { label: s.label, bg: s.bg, color: s.color, uppercase: true },
  ];
  if (needsAction) {
    badges.push({
      label: "Your turn",
      bg: C.amberSoft,
      color: C.amberDeep,
      fontSize: 10,
      padding: "1px 7px",
    });
  }
  if (inq.unreadCount > 0) {
    badges.push({
      label: `${inq.unreadCount} new`,
      bg: C.blueSoft,
      color: C.blueDeep,
      fontSize: 10.5,
      padding: "1px 7px",
    });
  }
  if (isDiscover) {
    badges.push({
      label: `◎ via ${inq.sourceChannel === "discover_shortlist" ? "Shortlist" : "Discover"}`,
      bg: C.blueSoft,
      color: C.blueDeep,
      fontSize: 10,
      padding: "1px 7px",
      uppercase: true,
      title:
        inq.sourceChannel === "discover_shortlist"
          ? "Client added you from a Discover shortlist alongside other talents."
          : "Client found you on Discover and reached out directly.",
    });
  }

  return {
    id: inq.id,
    title: inq.contact_name,
    titleSuffix: inq.company ? `· ${inq.company}` : undefined,
    meta:
      [inq.event_location, fmtDate(inq.event_date)]
        .filter(Boolean)
        .join(" · ") || "No event details",
    timestamp: relativeDate(inq.updated_at ?? inq.created_at),
    badges,
    accentColor: s.color,
    highlighted: inq.unreadCount > 0 || needsAction,
    href: `/${tenantSlug}/talent/inbox/${inq.id}`,
    ctaLabel: "Open thread",
  };
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
    <div className="flex flex-col gap-4">
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

      {/* List — rendered through the shared <ThreadShell> primitive
          (remediation plan §4, Phase 2 strangler step 1). The talent
          inbox is list-only: no activeId / messages / details, so the
          shell renders just its list rail and this surface keeps its
          own role-specific filter chrome above as a sibling. */}
      <ThreadShell
        role="talent"
        inquiries={filtered.map((inq) => toThreadItem(inq, tenantSlug))}
        activeId={null}
        actions={{}}
      />
    </div>
  );
}
