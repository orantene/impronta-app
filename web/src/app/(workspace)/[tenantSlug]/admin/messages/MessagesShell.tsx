"use client";

/**
 * MessagesShell — workspace admin Messages tab. Phase 3.12 — Slice A.
 *
 * Pixel-fidelity rebuild of the prototype's AdminOperationsShell
 * (see web/src/app/prototypes/admin-shell/_messages.tsx, ~1316–2670).
 *
 * Two-pane layout:
 *   • Left  (340px) — Inbox list with bulk mode, hover actions, pin,
 *                     mark-unread, search, filter chips, sticky action bar
 *   • Right (flex)  — Inquiry detail with header (stage + trust + lineup +
 *                     coordinator pills), tab bar, message stream + composer
 *
 * Real data via _data-bridge.ts; per-user UX flags via inquiry_user_flags
 * (see migration 20260907100000); realtime via Supabase Realtime channel.
 *
 * Detail tabs (offer/logistics/files/payment) are scaffolded as stubs in
 * this slice; full implementations land in 3.12 Slice B-D commits.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  WorkspaceInquiryForMessages,
  WorkspaceMessage,
  ThreadType,
} from "../../_data-bridge";
import type {
  InquiryLineupParticipant,
  InquiryOffer,
  InquiryOfferHistoryEntry,
  InquiryAttachment,
  InquiryBookingTransaction,
  AddTalentPickerRow,
} from "./messages-data";
import { sendMessage, markThreadRead, fetchMessages } from "./actions";
import {
  togglePinInquiry,
  toggleManualUnreadInquiry,
  archiveInquiriesBulk,
  nudgeInquiriesBulk,
} from "./flag-actions";
import LineupDrawer from "./LineupDrawer";
import { OfferTab, FilesTab, PaymentTab } from "./DetailTabs";

export type MessagesDetailBundle = {
  inquiryId: string;
  lineup:        InquiryLineupParticipant[];
  currentOffer:  InquiryOffer | null;
  offerHistory:  InquiryOfferHistoryEntry[];
  attachments:   InquiryAttachment[];
  transactions:  InquiryBookingTransaction[];
  rosterPicker:  AddTalentPickerRow[];
};

// ─── Design tokens — match the workspace shell ────────────────────────────────

const C = {
  ink:          "#0B0B0D",
  inkMuted:     "rgba(11,11,13,0.55)",
  inkDim:       "rgba(11,11,13,0.35)",
  border:       "rgba(24,24,27,0.08)",
  borderSoft:   "rgba(24,24,27,0.06)",
  cardBg:       "#ffffff",
  surface:      "rgba(11,11,13,0.02)",
  surfaceAlt:   "#FAFAF7",
  accent:       "#0F4F3E",
  accentSoft:   "rgba(15,79,62,0.07)",
  accentDeep:   "#0B3B2E",
  coral:        "#B04A22",
  coralDeep:    "#8C3318",
  coralSoft:    "rgba(176,74,34,0.10)",
  success:      "#2E7D5B",
  successSoft:  "rgba(46,125,91,0.10)",
  successDeep:  "#1E5C40",
  amber:        "#8A6F1A",
  amberSoft:    "rgba(138,111,26,0.10)",
  fill:         "#0B0B0D",
  goldBg:       "rgba(166,124,42,0.12)",
  goldFg:       "#A67C2A",
  silverBg:     "rgba(138,138,138,0.14)",
  silverFg:     "#6E6E6E",
  bronzeBg:     "rgba(176,113,67,0.14)",
  bronzeFg:     "#9A5A2C",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const RADIUS = { sm: 8, md: 10, lg: 14 } as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = diffMs / (1000 * 60 * 60);
  if (hrs < 1) return "now";
  if (hrs < 24) return `${Math.floor(hrs)}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function stageBucketOf(status: string): "inquiry" | "hold" | "booked" | "past" {
  if (status === "draft" || status === "submitted" || status === "coordination") return "inquiry";
  if (status === "offer_pending") return "hold";
  if (status === "approved" || status === "booked" || status === "converted") return "booked";
  return "past";
}

function stageStyle(bucket: ReturnType<typeof stageBucketOf>): { bg: string; fg: string } {
  switch (bucket) {
    case "inquiry": return { bg: `${C.coral}18`,   fg: C.coral };
    case "hold":    return { bg: `${C.amber}18`,   fg: C.amber };
    case "booked":  return { bg: C.successSoft,    fg: C.success };
    default:        return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted };
  }
}

function stageWord(status: string): string {
  const map: Record<string, string> = {
    submitted: "Inquiry", coordination: "Coordinating", offer_pending: "Offer",
    approved: "Approved", booked: "Booked", rejected: "Rejected",
    expired: "Expired", draft: "Draft", converted: "Booked",
  };
  return map[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

function statusLine(inquiry: WorkspaceInquiryForMessages): string {
  switch (inquiry.status) {
    case "draft":         return "Draft · not yet sent";
    case "submitted":     return "New inquiry";
    case "coordination":  return "Coordinating talent";
    case "offer_pending": return "Offer sent · awaiting client";
    case "approved":      return "Client approved · prep production";
    case "booked":        return "Booked · confirmed";
    case "converted":     return "Booked · confirmed";
    case "rejected":      return "Client declined";
    case "expired":       return "Expired";
    default:              return inquiry.status;
  }
}

function nextActionHint(inquiry: WorkspaceInquiryForMessages): string | null {
  if (inquiry.nextActionBy === "coordinator") {
    if (inquiry.status === "submitted")     return "Reply to client to keep this moving.";
    if (inquiry.status === "coordination")  return "Pick talent and send an offer.";
    if (inquiry.status === "offer_pending") return "Hold open — send the revised offer.";
    if (inquiry.status === "approved")      return "Approved. Build the call sheet.";
    if (inquiry.status === "booked")        return "Booked. Build the call sheet.";
    return "Your move.";
  }
  if (inquiry.nextActionBy === "client") return "Awaiting client response.";
  if (inquiry.nextActionBy === "talent") return "Awaiting talent confirmation.";
  return null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

/** Deterministic color from a string. */
function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const palette = [
    "#3B5E9E", "#0F4F3E", "#8A6F1A", "#B04A22",
    "#5B3C8C", "#2E7D5B", "#1A6882", "#7A3B3B",
  ];
  return palette[Math.abs(h) % palette.length];
}

function trustChip(level: string | null): { bg: string; fg: string; label: string } | null {
  if (!level) return null;
  const l = level.toLowerCase();
  let bg: string = C.bronzeBg;
  let fg: string = C.bronzeFg;
  let label = "Verified";
  if (l === "gold")          { bg = C.goldBg;   fg = C.goldFg;   label = "Gold"; }
  else if (l === "silver")   { bg = C.silverBg; fg = C.silverFg; label = "Silver"; }
  else if (l === "verified") { bg = C.bronzeBg; fg = C.bronzeFg; label = "Verified"; }
  else                       { label = level.charAt(0).toUpperCase() + level.slice(1); }
  return { bg, fg, label };
}

function sourceChipText(kind: WorkspaceInquiryForMessages["sourceKind"]): string {
  switch (kind) {
    case "hub":         return "Tulala hub";
    case "direct":      return "Direct";
    case "manual":      return "Manual entry";
    case "marketplace": return "Marketplace";
    case "talent-page": return "Talent page";
    default:            return "Other";
  }
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const bg = hashColor(name);
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: "50%",
        background: bg, color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
        fontFamily: FONT, letterSpacing: -0.3,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}

function FilterChip({
  label, active, count, onClick,
}: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 999,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentSoft : "transparent",
        color: active ? C.accentDeep : C.inkMuted,
        fontSize: 11, fontWeight: active ? 700 : 500,
        cursor: "pointer", fontFamily: FONT,
        whiteSpace: "nowrap", flexShrink: 0,
        letterSpacing: active ? 0.1 : 0,
      }}
    >
      {label}
      {count != null && count > 0 && (
        <span style={{
          minWidth: 14, height: 14, borderRadius: 999,
          background: active ? C.accent : "rgba(11,11,13,0.10)",
          color: active ? "#fff" : C.inkMuted,
          fontSize: 9, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px", boxSizing: "border-box",
        }}>{count}</span>
      )}
    </button>
  );
}

/** Funnel dots: ●─●─○─○ */
function FunnelDots({ status }: { status: string }) {
  const idx = (() => {
    const b = stageBucketOf(status);
    if (b === "inquiry") return 0;
    if (b === "hold") return 1;
    if (b === "booked") return 2;
    return 3;
  })();
  const stages = ["Inquiry", "Offer", "Booked", "Done"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {stages.map((s, i) => {
        const past = i < idx;
        const here = i === idx;
        const bg = past ? C.success : here ? C.accent : "rgba(11,11,13,0.12)";
        return (
          <React.Fragment key={s}>
            <span
              title={s}
              style={{
                width: here ? 8 : 6, height: here ? 8 : 6, borderRadius: "50%",
                background: bg, flexShrink: 0,
              }}
            />
            {i < stages.length - 1 && (
              <span style={{
                width: 12, height: 1.5,
                background: i < idx ? C.success : "rgba(11,11,13,0.10)",
                flexShrink: 0,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function PinIcon({ filled, size = 11 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9.5 1.5l-2 4-3.5 1 2.5 2.5-1 4 3.5-2 3.5 2-1-4 2.5-2.5-3.5-1-2-4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

function MailIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 4h12v8H2zM2 4l6 5 6-5" stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchiveIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 3h12v3H2zM3 6v8h10V6M6 9h4" stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HoverActionBtn({
  label, active, onClick, children,
}: { label: string; active?: boolean; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      style={{
        width: 24, height: 24, borderRadius: 7,
        border: `1px solid ${active ? C.accent : "transparent"}`,
        background: active ? C.accentSoft : "rgba(255,255,255,0.96)",
        color: active ? C.accent : C.inkMuted,
        cursor: "pointer", padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      {children}
    </button>
  );
}

function LineupPill({ inquiry }: { inquiry: WorkspaceInquiryForMessages }) {
  if (inquiry.lineupTotal === 0) return null;
  const allConfirmed = inquiry.lineupConfirmed === inquiry.lineupTotal;
  const fg = allConfirmed ? C.success : inquiry.lineupPending > 0 ? C.amber : C.inkMuted;
  const bg = allConfirmed ? C.successSoft : inquiry.lineupPending > 0 ? C.amberSoft : "rgba(11,11,13,0.04)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "1px 7px", borderRadius: 999,
      background: bg, color: fg,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
      flexShrink: 0,
    }}>
      {inquiry.lineupConfirmed}/{inquiry.lineupTotal}
      {inquiry.lineupPending > 0 && (
        <span style={{ fontWeight: 500, opacity: 0.85 }}>
          ·{inquiry.lineupPending} pending
        </span>
      )}
    </span>
  );
}

// ─── TYPE filter ──────────────────────────────────────────────────────────────

type AdminFilter = "all" | "needs-me" | "unread" | "pinned" | "inquiry" | "hold" | "booked" | "past";

// ─── LEFT PANE: Inbox row ──────────────────────────────────────────────────────

function InquiryRow({
  inquiry,
  active,
  bulkMode,
  selected,
  onClick,
  onToggleSelect,
  onTogglePin,
  onToggleUnread,
  pendingFlag,
}: {
  inquiry: WorkspaceInquiryForMessages;
  active: boolean;
  bulkMode: boolean;
  selected: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
  onTogglePin: () => void;
  onToggleUnread: () => void;
  pendingFlag: boolean;
}) {
  const bucket = stageBucketOf(inquiry.status);
  const sc = stageStyle(bucket);
  const needsMe = inquiry.nextActionBy === "coordinator";
  const hasUnread = inquiry.unreadCount > 0 || inquiry.manuallyUnread;
  const isUnseen = !inquiry.seen;
  const trust = trustChip(inquiry.trustLevel);

  const rowBg = active ? "rgba(11,11,13,0.045)"
    : isUnseen ? "rgba(176,74,34,0.05)"
    : hasUnread ? "rgba(176,74,34,0.04)"
    : needsMe  ? "rgba(176,74,34,0.03)"
    : bucket === "booked" ? "rgba(46,125,91,0.035)"
    : "transparent";

  const borderLeft = active ? `3px solid ${C.accent}`
    : isUnseen ? `3px solid ${C.coral}`
    : hasUnread ? `3px solid ${C.coral}`
    : needsMe   ? `3px solid ${C.coral}88`
    : "3px solid transparent";

  // Title precedence: company → contact → "Untitled".
  const displayName = inquiry.briefTitle;
  const subtitleParts = [
    inquiry.clientCompany && inquiry.clientName !== inquiry.clientCompany ? `via ${inquiry.clientName}` : null,
    inquiry.eventDate ? new Date(inquiry.eventDate).toLocaleDateString([], { month: "short", day: "numeric" }) : null,
    inquiry.eventLocation?.split(",")[0] ?? null,
  ].filter(Boolean) as string[];

  // Last-message preview prefix by role.
  const previewPrefix = (() => {
    if (!inquiry.lastMessageRole) return "";
    if (inquiry.lastMessageRole === "you") return "You: ";
    if (inquiry.lastMessageRole === "system") return "Update: ";
    return "";
  })();

  return (
    <div
      className="msgshell-row"
      onClick={bulkMode ? onToggleSelect : onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (bulkMode ? onToggleSelect : onClick)();
        }
      }}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        width: "100%", padding: "11px 14px",
        background: rowBg,
        borderLeft,
        borderTop: "none", borderRight: "none",
        borderBottom: `1px solid ${C.borderSoft}`,
        cursor: "pointer",
        fontFamily: FONT, position: "relative",
        opacity: pendingFlag ? 0.6 : 1,
        transition: "background 100ms, opacity 120ms",
      }}
    >
      {/* Bulk-mode checkbox (replaces avatar) */}
      {bulkMode ? (
        <div style={{
          width: 36, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, marginTop: 6,
        }}>
          <span
            aria-checked={selected}
            role="checkbox"
            style={{
              width: 18, height: 18, borderRadius: 5,
              border: `1.5px solid ${selected ? C.accent : C.inkDim}`,
              background: selected ? C.accent : "transparent",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              transition: "all 100ms",
            }}
          >
            {selected && (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
        </div>
      ) : (
        <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
          <Avatar name={inquiry.clientName || displayName} size={36} />
          {inquiry.pinned && (
            <span style={{
              position: "absolute", top: -3, right: -3,
              width: 16, height: 16, borderRadius: "50%",
              background: C.accent, color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #fff",
            }}>
              <PinIcon filled size={8} />
            </span>
          )}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Row 1 — title + NEW pill + age */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{
            fontSize: 13.5, fontWeight: hasUnread || isUnseen ? 700 : 600, color: C.ink,
            flex: 1, minWidth: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            letterSpacing: -0.1,
          }}>
            {displayName}
          </span>
          {isUnseen && (
            <span style={{
              flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
              padding: "2px 6px", borderRadius: 999,
              background: C.coral, color: "#fff",
              textTransform: "uppercase",
            }}>NEW</span>
          )}
          <span style={{ flexShrink: 0, fontSize: 10.5, color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>
            {ageLabel(inquiry.lastActivityAt)}
          </span>
        </div>

        {/* Row 2 — subtitle (event details + source chip) */}
        {(subtitleParts.length > 0 || inquiry.sourceKind) && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4,
            minWidth: 0,
          }}>
            <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {subtitleParts.join(" · ")}
            </span>
            {inquiry.sourceKind && inquiry.sourceKind !== "other" && (
              <span style={{
                flexShrink: 0, padding: "0 6px",
                fontSize: 9.5, color: C.inkDim, fontWeight: 600,
                background: "rgba(11,11,13,0.04)", borderRadius: 999, letterSpacing: 0.3,
                textTransform: "uppercase",
              }}>
                {sourceChipText(inquiry.sourceKind)}
              </span>
            )}
          </div>
        )}

        {/* Row 3 — last message preview */}
        {inquiry.lastMessagePreview && (
          <div style={{
            fontSize: 11.5, color: hasUnread ? C.ink : C.inkMuted,
            lineHeight: 1.45, fontWeight: hasUnread ? 500 : 400,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginTop: 2,
          }}>
            <span style={{ color: C.inkDim, fontWeight: 500 }}>{previewPrefix}</span>
            {inquiry.lastMessagePreview}
          </div>
        )}

        {/* Row 4 — needs-me chip + status line + unread badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          {needsMe && (
            <span style={{
              flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "1px 6px", borderRadius: 999,
              background: C.coralSoft, color: C.coralDeep,
              fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
            }}>
              <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: C.coral }} />
              NEEDS YOU
            </span>
          )}
          <span style={{
            flex: 1, minWidth: 0, fontSize: 11.5,
            color: needsMe ? C.coralDeep : hasUnread ? C.ink : C.inkMuted,
            fontWeight: needsMe ? 600 : hasUnread ? 500 : 400,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {statusLine(inquiry)}
          </span>
          {inquiry.unreadCount > 0 && (
            <span style={{
              flexShrink: 0,
              minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999,
              background: C.accent, color: "#fff",
              fontSize: 9.5, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxSizing: "border-box",
            }}>{inquiry.unreadCount}</span>
          )}
        </div>

        {/* Row 5 — funnel + stage word + lineup pill + coordinator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <FunnelDots status={inquiry.status} />
          <span style={{
            fontSize: 10, fontWeight: 700, color: sc.fg,
            letterSpacing: 0.3, textTransform: "uppercase", flexShrink: 0,
          }}>
            {stageWord(inquiry.status)}
          </span>
          <LineupPill inquiry={inquiry} />
          <span style={{ flex: 1 }} />
          {trust && (
            <span style={{
              flexShrink: 0,
              padding: "1px 6px", borderRadius: 999,
              background: trust.bg, color: trust.fg,
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
              textTransform: "uppercase",
            }}>
              {trust.label}
            </span>
          )}
          {inquiry.coordinatorName && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              flexShrink: 0, fontSize: 10.5, color: C.inkMuted,
              maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              <Avatar name={inquiry.coordinatorName} size={14} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inquiry.coordinatorName.split(" ")[0]}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Hover actions strip */}
      {!bulkMode && (
        <div className="msgshell-row-actions" style={{
          position: "absolute", top: 8, right: 8,
          display: "flex", gap: 4,
          opacity: inquiry.pinned ? 1 : 0,
          pointerEvents: inquiry.pinned ? "auto" : "none",
          transition: "opacity 120ms",
        }}>
          <HoverActionBtn label={inquiry.pinned ? "Unpin" : "Pin"} active={inquiry.pinned} onClick={onTogglePin}>
            <PinIcon filled={inquiry.pinned} />
          </HoverActionBtn>
          <HoverActionBtn label={inquiry.manuallyUnread ? "Mark read" : "Mark unread"} active={inquiry.manuallyUnread} onClick={onToggleUnread}>
            <MailIcon />
          </HoverActionBtn>
        </div>
      )}
    </div>
  );
}

// ─── LEFT PANE: Inbox list ────────────────────────────────────────────────────

function InboxList({
  inquiries, activeId, onSelect, tenantSlug,
}: {
  inquiries: WorkspaceInquiryForMessages[];
  activeId: string | null;
  onSelect: (id: string) => void;
  tenantSlug: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingFlag, setPendingFlag] = useState<Set<string>>(new Set());
  const [pendingBulk, startBulkTransition] = useTransition();

  // Default filter: prioritise pending action items.
  const initialFilter: AdminFilter =
    inquiries.some(i => i.nextActionBy === "coordinator") ? "needs-me"
    : inquiries.some(i => !i.seen || i.unreadCount > 0) ? "unread"
    : "all";
  const [filter, setFilter] = useState<AdminFilter>(initialFilter);

  const counts = useMemo(() => ({
    needsMe:   inquiries.filter(i => i.nextActionBy === "coordinator").length,
    unread:    inquiries.filter(i => !i.seen || i.unreadCount > 0 || i.manuallyUnread).length,
    pinned:    inquiries.filter(i => i.pinned).length,
    inquiry:   inquiries.filter(i => stageBucketOf(i.status) === "inquiry").length,
    hold:      inquiries.filter(i => stageBucketOf(i.status) === "hold").length,
    booked:    inquiries.filter(i => stageBucketOf(i.status) === "booked").length,
    past:      inquiries.filter(i => stageBucketOf(i.status) === "past").length,
  }), [inquiries]);

  const filtered = useMemo(() => {
    let list = inquiries.filter(i => !i.archived); // hide archived from default view
    if (filter === "needs-me") list = list.filter(i => i.nextActionBy === "coordinator");
    else if (filter === "unread") list = list.filter(i => !i.seen || i.unreadCount > 0 || i.manuallyUnread);
    else if (filter === "pinned") list = list.filter(i => i.pinned);
    else if (filter === "inquiry" || filter === "hold" || filter === "booked" || filter === "past") {
      list = list.filter(i => stageBucketOf(i.status) === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        (i.briefTitle + " " + i.clientName + " " + (i.clientCompany ?? "") + " " + (i.eventLocation ?? "") + " " + (i.coordinatorName ?? ""))
          .toLowerCase().includes(q)
      );
    }

    // 4-tier sort: pinned → unseen/unread → needs-me → recency
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const unreadA = (!a.seen || a.unreadCount > 0 || a.manuallyUnread) ? 0 : 1;
      const unreadB = (!b.seen || b.unreadCount > 0 || b.manuallyUnread) ? 0 : 1;
      if (unreadA !== unreadB) return unreadA - unreadB;
      const needsA = a.nextActionBy === "coordinator" ? 0 : 1;
      const needsB = b.nextActionBy === "coordinator" ? 0 : 1;
      if (needsA !== needsB) return needsA - needsB;
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });
  }, [inquiries, filter, search]);

  const chips: { id: AdminFilter; label: string; count?: number }[] = [
    { id: "all",      label: "All",          count: inquiries.length },
    { id: "needs-me", label: "Needs me",     count: counts.needsMe },
    { id: "unread",   label: "Unread",       count: counts.unread },
    ...(counts.pinned > 0 ? [{ id: "pinned" as AdminFilter, label: "Pinned", count: counts.pinned }] : []),
    { id: "inquiry",  label: "Inquiry",      count: counts.inquiry },
    { id: "hold",     label: "Offer pending", count: counts.hold },
    { id: "booked",   label: "Booked",       count: counts.booked },
    { id: "past",     label: "Past",         count: counts.past },
  ];

  const togglePin = useCallback(async (inquiryId: string) => {
    setPendingFlag(prev => new Set(prev).add(inquiryId));
    try { await togglePinInquiry(tenantSlug, inquiryId); router.refresh(); }
    finally {
      setPendingFlag(prev => { const n = new Set(prev); n.delete(inquiryId); return n; });
    }
  }, [tenantSlug, router]);

  const toggleUnread = useCallback(async (inquiryId: string) => {
    setPendingFlag(prev => new Set(prev).add(inquiryId));
    try { await toggleManualUnreadInquiry(tenantSlug, inquiryId); router.refresh(); }
    finally {
      setPendingFlag(prev => { const n = new Set(prev); n.delete(inquiryId); return n; });
    }
  }, [tenantSlug, router]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitBulk = useCallback(() => {
    setBulkMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleArchiveBulk = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    startBulkTransition(async () => {
      await archiveInquiriesBulk(tenantSlug, ids);
      router.refresh();
      exitBulk();
    });
  }, [selectedIds, tenantSlug, router, exitBulk]);

  const handleNudgeBulk = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    startBulkTransition(async () => {
      await nudgeInquiriesBulk(tenantSlug, ids);
      router.refresh();
      exitBulk();
    });
  }, [selectedIds, tenantSlug, router, exitBulk]);

  return (
    <aside style={{
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${C.borderSoft}`,
      background: C.cardBg,
      minHeight: 0, minWidth: 0,
      overflow: "hidden", flex: 1,
      position: "relative",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 14px 10px",
        borderBottom: `1px solid ${C.borderSoft}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{
            fontFamily: FONT, fontSize: 17, fontWeight: 700,
            color: C.ink, margin: 0, letterSpacing: -0.3,
          }}>Inbox</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: C.inkMuted }}>
              {inquiries.filter(i => !i.archived).length} thread{inquiries.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => bulkMode ? exitBulk() : setBulkMode(true)}
              style={{
                padding: "3px 8px", borderRadius: 7,
                border: `1px solid ${bulkMode ? C.accent : C.border}`,
                background: bulkMode ? C.accentSoft : "transparent",
                color: bulkMode ? C.accent : C.inkMuted,
                fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: FONT,
              }}
            >
              {bulkMode ? "Done" : "Select"}
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setSearch(""); }}
            placeholder="Search clients, briefs…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "8px 32px 8px 30px", borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: "rgba(11,11,13,0.04)",
              fontFamily: FONT, fontSize: 12.5, color: C.ink,
              outline: "none",
            }}
          />
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke={C.inkDim} strokeWidth="1.5"/>
            <path d="M11 11l3 3" stroke={C.inkDim} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 20, height: 20, borderRadius: "50%",
                border: "none", background: "rgba(11,11,13,0.08)",
                color: C.inkMuted, cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                padding: 0,
              }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{
          display: "flex", gap: 5, overflowX: "auto",
          scrollbarWidth: "none", paddingBottom: 2,
        }}>
          {chips.map(c => (
            <FilterChip
              key={c.id}
              label={c.label}
              active={filter === c.id}
              count={c.count}
              onClick={() => setFilter(c.id)}
            />
          ))}
        </div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: "32px 18px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: C.surface, color: C.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {search.trim() ? `No matches for "${search}"` : "Nothing in this view"}
            </div>
            <div style={{ fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4, maxWidth: 220 }}>
              {search.trim()
                ? "Try a different keyword or clear the search."
                : "Switch the All filter to see every thread."}
            </div>
            {search.trim() && (
              <button type="button" onClick={() => setSearch("")} style={{
                marginTop: 6, padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${C.border}`, background: "transparent",
                color: C.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONT,
              }}>Clear search</button>
            )}
          </div>
        ) : (() => {
          const items: React.ReactNode[] = [];
          let lastDateKey = "";
          for (const i of filtered) {
            const dk = new Date(i.lastActivityAt).toDateString();
            if (dk !== lastDateKey) {
              lastDateKey = dk;
              items.push(
                <div key={`hdr-${dk}`} style={{
                  padding: "6px 14px 3px",
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                  textTransform: "uppercase", color: C.inkDim,
                  background: C.surface,
                  borderBottom: `1px solid ${C.borderSoft}`,
                }}>
                  {formatDateGroup(i.lastActivityAt)}
                </div>
              );
            }
            items.push(
              <InquiryRow
                key={i.id}
                inquiry={i}
                active={i.id === activeId}
                bulkMode={bulkMode}
                selected={selectedIds.has(i.id)}
                pendingFlag={pendingFlag.has(i.id)}
                onClick={() => onSelect(i.id)}
                onToggleSelect={() => toggleSelect(i.id)}
                onTogglePin={() => togglePin(i.id)}
                onToggleUnread={() => toggleUnread(i.id)}
              />
            );
          }
          return items;
        })()}
      </div>

      {/* Bulk action bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "10px 14px",
          background: C.cardBg,
          borderTop: `1px solid ${C.border}`,
          boxShadow: "0 -4px 14px rgba(11,11,13,0.06)",
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: FONT,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>
            {selectedIds.size} selected
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleNudgeBulk}
            disabled={pendingBulk}
            style={{
              padding: "6px 12px", borderRadius: 7,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.ink, fontSize: 12, fontWeight: 600,
              cursor: pendingBulk ? "default" : "pointer",
              opacity: pendingBulk ? 0.5 : 1,
              fontFamily: FONT,
            }}
          >
            Nudge
          </button>
          <button
            type="button"
            onClick={handleArchiveBulk}
            disabled={pendingBulk}
            style={{
              padding: "6px 12px", borderRadius: 7,
              border: `1px solid ${C.coralDeep}`,
              background: C.coralSoft,
              color: C.coralDeep, fontSize: 12, fontWeight: 600,
              cursor: pendingBulk ? "default" : "pointer",
              opacity: pendingBulk ? 0.5 : 1,
              fontFamily: FONT,
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            <ArchiveIcon /> Archive
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .msgshell-row:hover .msgshell-row-actions {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
        .msgshell-row:focus-within .msgshell-row-actions {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
      `}} />
    </aside>
  );
}

// ─── RIGHT PANE: Message stream + composer ────────────────────────────────────

function MessageBubble({ msg, showSender, isFirst }: {
  msg: WorkspaceMessage;
  showSender: boolean;
  isFirst: boolean;
}) {
  const mine = msg.is_mine;
  return (
    <div style={{
      display: "flex",
      flexDirection: mine ? "row-reverse" : "row",
      alignItems: "flex-end",
      gap: 8,
      marginBottom: 4,
      marginTop: isFirst ? 0 : 2,
    }}>
      {!mine ? (
        <div style={{ flexShrink: 0, marginBottom: 2 }}>
          {showSender ? <Avatar name={msg.sender_name} size={26} /> : <span style={{ width: 26, display: "inline-block" }} />}
        </div>
      ) : null}

      <div style={{
        maxWidth: "72%",
        display: "flex", flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
        gap: 2,
      }}>
        {showSender && !mine && (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: C.inkMuted, paddingLeft: 2 }}>
            {msg.sender_name}
          </span>
        )}
        <div style={{
          padding: "8px 12px",
          background: mine ? C.accent : C.cardBg,
          color: mine ? "#fff" : C.ink,
          borderRadius: mine
            ? `${RADIUS.md}px ${RADIUS.md}px 4px ${RADIUS.md}px`
            : `${RADIUS.md}px ${RADIUS.md}px ${RADIUS.md}px 4px`,
          border: mine ? "none" : `1px solid ${C.borderSoft}`,
          fontSize: 13,
          lineHeight: 1.55,
          wordBreak: "break-word",
        }}>
          {msg.body}
        </div>
        <span style={{ fontSize: 10, color: C.inkDim, paddingLeft: 2, paddingRight: 2 }}>
          {formatTime(msg.created_at)}
          {mine && (
            <span aria-hidden style={{ marginLeft: 4, color: C.success, fontWeight: 700 }}>
              ✓✓
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

const SMART_REPLIES: Record<string, string[]> = {
  inquiry: [
    "Got it — let me line up some options.",
    "Could you share the budget range?",
    "What's the deadline on this?",
  ],
  hold: [
    "Quick check-in — any thoughts on the offer?",
    "Happy to revise if needed.",
    "Locking this in by EOD?",
  ],
  default: [
    "Sounds good.",
    "I'll get back to you shortly.",
    "On it — give me a couple of hours.",
  ],
};

function MessageStream({
  inquiryId,
  threadType,
  tenantSlug,
  initialMessages,
  placeholder,
  closed,
  closedReason,
  smartReplyContext,
}: {
  inquiryId: string;
  threadType: ThreadType;
  tenantSlug: string;
  initialMessages: WorkspaceMessage[];
  placeholder: string;
  closed?: boolean;
  closedReason?: string;
  smartReplyContext: keyof typeof SMART_REPLIES;
}) {
  const [messages, setMessages] = useState<WorkspaceMessage[]>(initialMessages);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, startSending] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setViewerUserId(data.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, inquiryId, threadType]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`inquiry_messages:${inquiryId}:${threadType}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "inquiry_messages",
        filter: `inquiry_id=eq.${inquiryId}`,
      }, (payload) => {
        const row = payload.new as {
          id: string; sender_user_id: string; body: string;
          created_at: string; thread_type: string;
        };
        if (row.thread_type !== threadType) return;
        setMessages(prev => {
          if (prev.some(m => m.id === row.id)) return prev;
          const knownSenderName = prev.find((m) => m.sender_user_id === row.sender_user_id)?.sender_name;
          const isMine = viewerUserId != null && row.sender_user_id === viewerUserId;
          return [...prev, {
            id: row.id,
            sender_user_id: row.sender_user_id,
            sender_name: knownSenderName ?? (isMine ? "You" : row.sender_user_id.slice(0, 8)),
            body: row.body,
            created_at: row.created_at,
            is_mine: isMine,
          }];
        });
        if (!viewerUserId || row.sender_user_id === viewerUserId) return;
        void markThreadRead(tenantSlug, inquiryId, threadType);
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [inquiryId, threadType, tenantSlug, viewerUserId]);

  const handleSend = useCallback((textOverride?: string) => {
    const trimmed = (textOverride ?? body).trim();
    if (!trimmed || sending) return;

    const optimisticId = `opt-${Date.now()}`;
    const optimistic: WorkspaceMessage = {
      id: optimisticId,
      sender_user_id: viewerUserId ?? "me",
      sender_name: "You",
      body: trimmed,
      created_at: new Date().toISOString(),
      is_mine: true,
    };
    setMessages(prev => [...prev, optimistic]);
    if (!textOverride) setBody("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    startSending(async () => {
      const result = await sendMessage(tenantSlug, inquiryId, threadType, trimmed);
      if ("error" in result) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        if (!textOverride) setBody(trimmed);
      } else {
        setMessages(prev => {
          const opt = prev.find(m => m.id === optimisticId);
          if (!opt) return prev;
          return [
            ...prev.filter(m => m.id !== optimisticId && m.id !== result.id),
            { ...opt, id: result.id, created_at: result.created_at },
          ];
        });
      }
    });
  }, [body, sending, tenantSlug, inquiryId, threadType, viewerUserId]);

  const grouped = useMemo(() => {
    const out: Array<{ type: "header"; date: string } | { type: "msg"; msg: WorkspaceMessage; showSender: boolean; isFirst: boolean }> = [];
    let lastDate = "";
    let lastSender = "";
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const dateKey = new Date(msg.created_at).toDateString();
      if (dateKey !== lastDate) {
        out.push({ type: "header", date: formatDateGroup(msg.created_at) });
        lastDate = dateKey;
        lastSender = "";
      }
      const showSender = msg.sender_user_id !== lastSender && !msg.is_mine;
      out.push({ type: "msg", msg, showSender, isFirst: i === 0 });
      lastSender = msg.sender_user_id;
    }
    return out;
  }, [messages]);

  const smartReplies = SMART_REPLIES[smartReplyContext] ?? SMART_REPLIES.default;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{
        flex: 1, overflowY: "auto", minHeight: 0,
        padding: "16px 16px 8px",
        display: "flex", flexDirection: "column",
      }}>
        {messages.length === 0 ? (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 8, padding: 24,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: C.surface, color: C.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H6l-3 3V5a1 1 0 011-1z"
                  stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>No messages yet</div>
            <div style={{ fontSize: 12, color: C.inkMuted, textAlign: "center", lineHeight: 1.5 }}>
              Start the conversation by sending a message below.
            </div>
          </div>
        ) : (
          <>
            {grouped.map((item, idx) =>
              item.type === "header" ? (
                <div key={`hdr-${idx}`} style={{
                  textAlign: "center", padding: "8px 0 12px",
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: "uppercase", color: C.inkMuted,
                }}>
                  {item.date}
                </div>
              ) : (
                <MessageBubble
                  key={item.msg.id}
                  msg={item.msg}
                  showSender={item.showSender}
                  isFirst={item.isFirst}
                />
              )
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Compose or closed notice */}
      {closed ? (
        <div style={{
          padding: "12px 16px",
          borderTop: `1px solid ${C.borderSoft}`,
          background: C.surface,
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: C.inkMuted, fontFamily: FONT,
        }}>
          <span aria-hidden style={{ fontSize: 14 }}>🔒</span>
          {closedReason ?? "This thread is closed."}
        </div>
      ) : (
        <div style={{
          borderTop: `1px solid ${C.borderSoft}`,
          padding: "8px 12px 8px",
          background: C.cardBg,
        }}>
          {/* Smart-reply chips */}
          {smartReplies.length > 0 && messages.length > 0 && !body.trim() && (
            <div style={{
              display: "flex", gap: 5, flexWrap: "wrap",
              marginBottom: 8,
            }}>
              {smartReplies.map((reply, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(reply)}
                  disabled={sending}
                  style={{
                    padding: "4px 10px", borderRadius: 999,
                    border: `1px solid ${C.border}`,
                    background: C.cardBg, color: C.inkMuted,
                    fontSize: 11.5, fontWeight: 500,
                    cursor: sending ? "default" : "pointer",
                    fontFamily: FONT, opacity: sending ? 0.5 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => {
                setBody(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholder}
              rows={1}
              style={{
                flex: 1, resize: "none", outline: "none",
                border: `1px solid ${body.trim() ? C.accent : C.border}`,
                borderRadius: RADIUS.sm,
                padding: "8px 12px",
                fontFamily: FONT, fontSize: 13, color: C.ink,
                background: "rgba(11,11,13,0.025)",
                lineHeight: 1.5, minHeight: 36,
                overflow: "hidden",
                transition: "border-color 120ms",
              }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!body.trim() || sending}
              aria-label="Send message"
              style={{
                flexShrink: 0,
                width: 36, height: 36, borderRadius: 10,
                background: !body.trim() || sending ? "rgba(11,11,13,0.10)" : C.accent,
                color: !body.trim() || sending ? C.inkMuted : "#fff",
                border: "none", cursor: !body.trim() || sending ? "default" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                transition: "background 120ms",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M18 2L9 11M18 2l-5.5 16-3.5-7-7-3.5L18 2z"
                  stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div style={{
            fontSize: 10.5, color: C.inkDim, fontFamily: FONT,
            marginTop: 5, paddingLeft: 2,
          }}>
            {threadType === "private"
              ? "Client thread · visible to client + coordinator"
              : "Group thread · visible to talent participants + coordinator"}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RIGHT PANE: Inquiry detail ───────────────────────────────────────────────

type TabId = "client" | "talent" | "offer" | "files" | "payment" | "booking";

function InquiryDetail({
  inquiry,
  tenantSlug,
  onBack,
  detailBundle,
}: {
  inquiry: WorkspaceInquiryForMessages;
  tenantSlug: string;
  onBack: () => void;
  detailBundle: MessagesDetailBundle | null;
}) {
  const isBooked = inquiry.status === "booked" || inquiry.status === "converted";
  const [activeTab, setActiveTab] = useState<TabId>("client");
  const [lineupOpen, setLineupOpen] = useState(false);
  const [clientMsgs, setClientMsgs] = useState<WorkspaceMessage[] | null>(null);
  const [talentMsgs, setTalentMsgs] = useState<WorkspaceMessage[] | null>(null);
  const [loading, setLoading] = useState(false);

  const bucket = stageBucketOf(inquiry.status);
  const sc = stageStyle(bucket);
  const closed = inquiry.status === "rejected" || inquiry.status === "expired";
  const closedReason =
    inquiry.status === "rejected" ? "Closed · the client passed on this inquiry"
    : inquiry.status === "expired" ? "Closed · this inquiry auto-expired"
    : "This thread is closed.";

  const trust = trustChip(inquiry.trustLevel);
  const hint = nextActionHint(inquiry);

  // Reset to Client thread when switching inquiries — and clear stale data.
  useEffect(() => {
    setActiveTab("client");
    setLineupOpen(false);
  }, [inquiry.id]);

  useEffect(() => {
    setClientMsgs(null);
    setTalentMsgs(null);
    setLoading(true);

    Promise.all([
      fetchMessages(tenantSlug, inquiry.id, "private"),
      fetchMessages(tenantSlug, inquiry.id, "group"),
    ]).then(([priv, grp]) => {
      setClientMsgs(priv);
      setTalentMsgs(grp);
      setLoading(false);
    }).catch(() => {
      setClientMsgs([]);
      setTalentMsgs([]);
      setLoading(false);
    });
  }, [inquiry.id, tenantSlug]);

  useEffect(() => {
    if (activeTab === "client") {
      void markThreadRead(tenantSlug, inquiry.id, "private");
      return;
    }
    if (activeTab === "talent") {
      void markThreadRead(tenantSlug, inquiry.id, "group");
    }
  }, [activeTab, inquiry.id, tenantSlug]);

  const offerBadge =
    detailBundle?.currentOffer?.status === "draft"   ? "Draft" :
    detailBundle?.currentOffer?.status === "sent"    ? "Sent"  :
    detailBundle?.currentOffer?.status === "rejected"? "Rejected" :
    undefined;

  const filesBadge = detailBundle?.attachments?.length ?? 0;

  const tabDefs: Array<{ id: TabId; label: string; badge?: number; chip?: string }> = [
    { id: "client",  label: "Client thread", badge: inquiry.unreadPrivate },
    { id: "talent",  label: "Talent group",  badge: inquiry.unreadGroup },
    { id: "offer",   label: "Offer", chip: offerBadge },
    { id: "files",   label: "Files", badge: filesBadge },
    ...(isBooked ? [{ id: "payment" as TabId, label: "Payment" }] : []),
    { id: "booking", label: "Booking" },
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      flex: 1, minHeight: 0,
      fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px 0",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.cardBg,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to inbox"
            style={{
              flexShrink: 0,
              width: 28, height: 28, borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "transparent",
              color: C.inkMuted, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <Avatar name={inquiry.clientName || inquiry.briefTitle} size={32} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: C.ink,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              letterSpacing: -0.1,
            }}>
              {inquiry.briefTitle}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>
              {inquiry.clientCompany && inquiry.clientName !== inquiry.clientCompany && (
                <span>via {inquiry.clientName}</span>
              )}
              {inquiry.eventDate && (
                <>
                  {(inquiry.clientCompany && inquiry.clientName !== inquiry.clientCompany) && <span>·</span>}
                  <span>{new Date(inquiry.eventDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                </>
              )}
              {inquiry.eventLocation && <><span>·</span><span>{inquiry.eventLocation}</span></>}
            </div>
          </div>

          {/* Pill stack */}
          <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
            {trust && (
              <span style={{
                padding: "3px 8px", borderRadius: 999,
                background: trust.bg, color: trust.fg,
                fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                textTransform: "uppercase",
              }}>
                {trust.label}
              </span>
            )}
            <span style={{
              padding: "3px 8px", borderRadius: 999,
              background: sc.bg, color: sc.fg,
              fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
              textTransform: "uppercase",
            }}>
              {stageWord(inquiry.status)}
            </span>
            <a
              href={`/${tenantSlug}/admin/work/${inquiry.id}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 7,
                border: `1px solid rgba(24,24,27,0.10)`,
                color: C.inkMuted, fontSize: 11, fontWeight: 500,
                textDecoration: "none", whiteSpace: "nowrap",
              }}
              title="Open in pipeline"
            >
              Pipeline ↗
            </a>
          </div>
        </div>

        {/* Meta strip — lineup + coordinator + offer */}
        {(inquiry.lineupTotal > 0 || inquiry.coordinatorName || inquiry.currentOfferTotal) && (
          <div style={{
            display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
            marginBottom: 10, fontSize: 11.5, color: C.inkMuted,
          }}>
            <button
              type="button"
              onClick={() => setLineupOpen(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px", borderRadius: 999,
                background: inquiry.lineupTotal > 0 ? C.surface : C.accentSoft,
                border: `1px solid ${inquiry.lineupTotal > 0 ? C.borderSoft : C.accent}`,
                color: inquiry.lineupTotal > 0 ? C.inkMuted : C.accent,
                cursor: "pointer", fontFamily: FONT,
                fontSize: 11.5, fontWeight: 600,
              }}
              title="Manage lineup"
            >
              {inquiry.lineupTotal > 0 ? (
                <>
                  <span style={{ fontWeight: 700, color: C.ink }}>
                    {inquiry.lineupConfirmed}/{inquiry.lineupTotal}
                  </span>
                  <span>on lineup</span>
                  {inquiry.lineupPending > 0 && (
                    <span style={{ color: C.amber, fontWeight: 600 }}>
                      · {inquiry.lineupPending} pending
                    </span>
                  )}
                </>
              ) : (
                <>+ Build lineup</>
              )}
            </button>
            {inquiry.coordinatorName && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 8px", borderRadius: 999,
                background: C.surface, border: `1px solid ${C.borderSoft}`,
              }}>
                <Avatar name={inquiry.coordinatorName} size={14} />
                <span style={{ color: C.ink, fontWeight: 600 }}>
                  {inquiry.coordinatorName}
                </span>
              </span>
            )}
            {inquiry.currentOfferTotal && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 8px", borderRadius: 999,
                background: C.surface, border: `1px solid ${C.borderSoft}`,
              }}>
                <span style={{ fontWeight: 700, color: C.ink }}>
                  {inquiry.currentOfferTotal}
                </span>
                <span>offer · {inquiry.currentOfferStatus}</span>
              </span>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, overflowX: "auto" } as React.CSSProperties}>
          {tabDefs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "8px 14px",
                border: "none", background: "none",
                borderBottom: `2px solid ${activeTab === t.id ? C.accent : "transparent"}`,
                color: activeTab === t.id ? C.accent : C.inkMuted,
                fontSize: 12, fontWeight: activeTab === t.id ? 700 : 500,
                cursor: "pointer", fontFamily: FONT,
                transition: "color 120ms", flexShrink: 0,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span style={{
                  padding: "0 5px", height: 14, borderRadius: 999,
                  background: C.accent, color: "#fff",
                  fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  {t.badge}
                </span>
              )}
              {t.chip && (
                <span style={{
                  padding: "0 5px", height: 14, borderRadius: 999,
                  background: t.chip === "Draft" ? "rgba(11,11,13,0.06)"
                            : t.chip === "Rejected" ? C.coralSoft
                            : C.amberSoft,
                  color:      t.chip === "Draft" ? C.inkMuted
                            : t.chip === "Rejected" ? C.coralDeep
                            : C.amber,
                  fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  textTransform: "uppercase",
                }}>
                  {t.chip}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Next-action hint bar */}
      {hint && !closed && (
        <div style={{
          padding: "6px 16px",
          background: inquiry.nextActionBy === "coordinator" ? C.coralSoft : C.surface,
          borderBottom: `1px solid ${C.borderSoft}`,
          fontSize: 11.5, color: inquiry.nextActionBy === "coordinator" ? C.coralDeep : C.inkMuted,
          fontFamily: FONT, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 6,
          flexShrink: 0,
        }}>
          {inquiry.nextActionBy === "coordinator" && (
            <span aria-hidden style={{ fontSize: 12 }}>⚡</span>
          )}
          {hint}
        </div>
      )}

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, background: C.surfaceAlt, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {loading && (activeTab === "client" || activeTab === "talent") ? (
          <div style={{
            height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: C.inkMuted, fontSize: 12,
          }}>
            Loading…
          </div>
        ) : activeTab === "client" ? (
          <MessageStream
            inquiryId={inquiry.id}
            threadType="private"
            tenantSlug={tenantSlug}
            initialMessages={clientMsgs ?? []}
            placeholder={`Reply to ${inquiry.clientName}…`}
            closed={closed}
            closedReason={closedReason}
            smartReplyContext={bucket === "hold" ? "hold" : bucket === "inquiry" ? "inquiry" : "default"}
          />
        ) : activeTab === "talent" ? (
          <MessageStream
            inquiryId={inquiry.id}
            threadType="group"
            tenantSlug={tenantSlug}
            initialMessages={talentMsgs ?? []}
            placeholder="Message talent group…"
            closed={closed}
            closedReason={closedReason}
            smartReplyContext={bucket === "hold" ? "hold" : bucket === "inquiry" ? "inquiry" : "default"}
          />
        ) : activeTab === "offer" ? (
          <OfferTab
            tenantSlug={tenantSlug}
            inquiryId={inquiry.id}
            offer={detailBundle?.currentOffer ?? null}
            history={detailBundle?.offerHistory ?? []}
          />
        ) : activeTab === "files" ? (
          <FilesTab
            tenantSlug={tenantSlug}
            inquiryId={inquiry.id}
            attachments={detailBundle?.attachments ?? []}
          />
        ) : activeTab === "payment" ? (
          <PaymentTab
            transactions={detailBundle?.transactions ?? []}
            currency={inquiry.currentOfferCurrency}
          />
        ) : (
          <BookingDetail inquiry={inquiry} tenantSlug={tenantSlug} />
        )}
      </div>

      {/* Lineup drawer (overlay) */}
      <LineupDrawer
        open={lineupOpen}
        onClose={() => setLineupOpen(false)}
        tenantSlug={tenantSlug}
        inquiryId={inquiry.id}
        participants={detailBundle?.lineup ?? []}
        pickerRows={detailBundle?.rosterPicker ?? []}
      />
    </div>
  );
}

// ─── BOOKING TAB ──────────────────────────────────────────────────────────────

function BookingDetail({ inquiry, tenantSlug }: { inquiry: WorkspaceInquiryForMessages; tenantSlug: string }) {
  const sc = stageStyle(stageBucketOf(inquiry.status));

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Status",    value: <span style={{ color: sc.fg, fontWeight: 700 }}>{stageWord(inquiry.status)}</span> },
    { label: "Brief",     value: inquiry.briefTitle },
    { label: "Client",    value: inquiry.clientName },
    ...(inquiry.clientCompany && inquiry.clientCompany !== inquiry.briefTitle ? [{ label: "Company", value: inquiry.clientCompany }] : []),
    ...(inquiry.eventDate ? [{
      label: "Date",
      value: new Date(inquiry.eventDate).toLocaleDateString([], { weekday: "short", month: "long", day: "numeric", year: "numeric" }),
    }] : []),
    ...(inquiry.eventLocation ? [{ label: "Location", value: inquiry.eventLocation }] : []),
    ...(inquiry.quantity ? [{ label: "Talent",   value: `${inquiry.quantity} talent` }] : []),
    ...(inquiry.lineupTotal > 0 ? [{
      label: "Lineup",
      value: `${inquiry.lineupConfirmed}/${inquiry.lineupTotal} confirmed${
        inquiry.lineupPending > 0 ? ` · ${inquiry.lineupPending} pending` : ""}`,
    }] : []),
    ...(inquiry.coordinatorName ? [{ label: "Coordinator", value: inquiry.coordinatorName }] : []),
    ...(inquiry.currentOfferTotal ? [{
      label: "Current offer",
      value: `${inquiry.currentOfferTotal} · ${inquiry.currentOfferStatus}`,
    }] : []),
    { label: "Source", value: sourceChipText(inquiry.sourceKind) },
    { label: "Next action", value: (() => {
      const raw = inquiry.nextActionBy;
      if (!raw) return "—";
      const MAP: Record<string, string> = { client: "⏳ Client", coordinator: "⏳ You", talent: "⏳ Talent", system: "⏳ System" };
      return MAP[raw] ?? raw;
    })() },
  ];

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1, minHeight: 0, boxSizing: "border-box" }}>
      <div style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
      }}>
        {rows.map((row, i) => (
          <div key={row.label}>
            {i > 0 && <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "11px 16px", fontFamily: FONT,
            }}>
              <span style={{ flexShrink: 0, width: 110, fontSize: 12, color: C.inkMuted }}>
                {row.label}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.ink, minWidth: 0 }}>
                {row.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <a
          href={`/${tenantSlug}/admin/work/${inquiry.id}`}
          style={{
            padding: "8px 14px", borderRadius: 8,
            background: C.accent, color: "#fff",
            fontSize: 12.5, fontWeight: 600, textDecoration: "none",
            fontFamily: FONT,
          }}
        >
          Open inquiry workspace ↗
        </a>
        {(inquiry.status === "booked" || inquiry.status === "converted") && (
          <a
            href={`/${tenantSlug}/admin/bookings`}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.ink, fontSize: 12.5, fontWeight: 600,
              fontFamily: FONT, textDecoration: "none",
            }}
          >
            View booking
          </a>
        )}
      </div>
    </div>
  );
}

// ─── EmptyDetail ──────────────────────────────────────────────────────────────

function EmptyDetail() {
  return (
    <div style={{
      height: "100%",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 10, padding: 24,
      color: C.inkMuted, fontFamily: FONT,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: C.surface,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1H7l-4 4V5a1 1 0 011-1z"
            stroke={C.inkDim} strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Select a thread</div>
      <div style={{ fontSize: 12, color: C.inkMuted, textAlign: "center", lineHeight: 1.5, maxWidth: 220 }}>
        Choose an inquiry from the left to view its conversation threads.
      </div>
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export default function MessagesShell({
  inquiries,
  tenantSlug,
  initialInquiryId,
  detailBundle,
}: {
  inquiries: WorkspaceInquiryForMessages[];
  tenantSlug: string;
  initialInquiryId?: string | null;
  detailBundle: MessagesDetailBundle | null;
}) {
  const router = useRouter();
  const visible = inquiries.filter(i => !i.archived);
  const [activeId, setActiveId] = useState<string | null>(
    (initialInquiryId && visible.some(i => i.id === initialInquiryId))
      ? initialInquiryId
      : (visible[0]?.id ?? null)
  );
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");

  const activeInquiry = inquiries.find(i => i.id === activeId) ?? null;
  const activeBundle =
    detailBundle && activeId === detailBundle.inquiryId ? detailBundle : null;

  // When the user clicks a different inquiry, push ?inquiry=<id> so the
  // server reloads the detail bundle for that inquiry. Falls back to local
  // selection so the inbox responds instantly.
  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setMobilePane("thread");
    const url = new URL(window.location.href);
    url.searchParams.set("inquiry", id);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        [data-messages-shell] {
          display: grid;
          grid-template-columns: 360px 1fr;
          grid-template-rows: minmax(0, 1fr);
          background: #fff;
          border: 1px solid rgba(24,24,27,0.06);
          border-radius: 14px;
          overflow: hidden;
          height: min(calc(100vh - 210px), 820px);
          min-height: 520px;
          font-family: "Inter", system-ui, sans-serif;
        }
        [data-messages-list] {
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        @media (max-width: 720px) {
          [data-messages-shell] {
            grid-template-columns: 1fr;
            position: fixed;
            left: 0; right: 0;
            top: 106px; bottom: 80px;
            height: auto;
            min-height: 0;
            border-radius: 0;
            border-left: none; border-right: none;
            z-index: 10;
          }
          [data-messages-shell][data-pane="list"] > [data-messages-detail] { display: none; }
          [data-messages-shell][data-pane="thread"] > [data-messages-list] { display: none; }
        }
      `}} />
      <div data-messages-shell data-pane={mobilePane}>
        <div data-messages-list>
          <InboxList
            inquiries={inquiries}
            activeId={activeId}
            onSelect={handleSelect}
            tenantSlug={tenantSlug}
          />
        </div>
        <div data-messages-detail style={{
          display: "flex", flexDirection: "column",
          minHeight: 0, background: C.surfaceAlt,
          overflow: "hidden",
        }}>
          {activeInquiry ? (
            <InquiryDetail
              inquiry={activeInquiry}
              tenantSlug={tenantSlug}
              onBack={() => setMobilePane("list")}
              detailBundle={activeBundle}
            />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </>
  );
}
