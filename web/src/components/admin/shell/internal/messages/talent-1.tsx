"use client";

import React, { useState, useEffect } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate, type Translator } from "@/i18n/interpolate";
import { OverflowMenu } from "@/components/chat-interactions";
import { StatusSheet } from "@/components/messages-status-sheet/StatusSheet";
import { COLORS, RADIUS, FONTS, TRANSITION, type ClientTrustLevel } from "../state";
import { ClientTrustChip } from "../primitives";
import { type Conversation } from "../talent";
import { ClientIdentityPill } from "../talent/shared/conversations-1";
import { BreakdownRow, TakeHomeCard } from "./client-1";
import { stageStyle } from "./messages-shared";
import { FUNNEL_STAGES, ParticipantTrustStrip, StageProgress } from "./shared/inbox-identity-1";
import { PageTopThread } from "./shared/machinery-8";
import { ThreadSearchTrigger } from "./shared/machinery-9";
import type { Offer } from "./shared/machinery-9";


// Stage discriminant → localized label. Keeps switching on the raw
// stage string (logic unchanged); only the rendered label is translated.
// Mirrors the source's derivation: past → Wrapped, hold → Offer, else
// the capitalized stage name (falls back to that when no key matches).
const TALENT_STAGE_LABEL_KEYS: Record<string, string> = {
  past:         "dashboard.talentThread.stageWrapped",
  hold:         "dashboard.talentThread.stageOffer",
  inquiry:      "dashboard.talentThread.stageInquiry",
  submitted:    "dashboard.talentThread.stageSubmitted",
  coordination: "dashboard.talentThread.stageCoordination",
  approved:     "dashboard.talentThread.stageApproved",
  booked:       "dashboard.talentThread.stageBooked",
  today:        "dashboard.talentThread.stageToday",
  paid:         "dashboard.talentThread.stagePaid",
  wrapped:      "dashboard.talentThread.stageWrapped",
  cancelled:    "dashboard.talentThread.stageCancelled",
};
export function talentStageLabel(stage: string, t: Translator): string {
  const key = TALENT_STAGE_LABEL_KEYS[stage];
  if (key) {
    const out = t(key);
    if (out !== key) return out;
  }
  // Fallback: match the legacy derivation (capitalize the raw stage).
  if (stage === "past") return t("dashboard.talentThread.stageWrapped");
  if (stage === "hold") return t("dashboard.talentThread.stageOffer");
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

// ── Talent JOB SHELL HEADER — unified single-band header ──
// Replaces the prior 4-band stack (PageTopThread + StageProgress +
// ParticipantTrustStrip + TakeHomeCard). Premium principle: one focal
// point per zone. Top row: back + title + take-home + status. Bottom
// row: slim 4-step funnel (Inquiry → Offer → Booked → Wrapped). Trust
// badges relocate to the Details rail.
export function TalentJobShellHeader({
  conv, yourRate, onBack, coordCommissionLabel, onStatusClick, toast,
}: {
  conv: Conversation;
  yourRate: string;
  onBack: () => void;
  /** Slice H + item #17 wiring: when this talent is ALSO a coordinator
   *  on the same offer, the caller computes the coord-commission share
   *  and passes it as a small "+€Y coord" badge to surface inline with
   *  the talent rate. Null/undefined hides the badge. */
  coordCommissionLabel?: string | null;
  /** Opens the StatusSheet when the user taps the status pill. */
  onStatusClick?: () => void;
  /** Toast function for OverflowMenu actions. */
  toast: (msg: string) => void;
}) {
  const t = useT();
  const sc = stageStyle(conv.stage);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const hasRate = yourRate && yourRate !== "—";
  const stageLabel = talentStageLabel(conv.stage, t);

  // Take-home breakdown (mirror of the old TakeHomeCard math)
  const numeric = parseFloat(yourRate.replace(/[^0-9.]/g, ""));
  const isReal = !isNaN(numeric) && numeric > 0;
  const currency = yourRate.match(/[€£$]/)?.[0] ?? "€";
  const gross = isReal ? numeric / 0.80 : 0;
  const agencyFee = isReal ? gross * 0.15 : 0;
  const platformFee = isReal ? gross * 0.05 : 0;
  const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

  const metaLine = [
    interpolate(t("dashboard.talentThread.via"), { agency: conv.agency }),
    conv.location ? conv.location.split(" · ")[0] : null,
    conv.date,
  ].filter(Boolean).join(" · ");

  // Build the source-channel descriptor (where the inquiry came from).
  // Surfaces as a small chip next to the meta line so the talent always
  // knows who reached them and through which channel.
  const sourceMeta = conv.source ? sourceChipMeta(conv.source, t) : null;

  return (
    <header data-tulala-job-shell-header style={{
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.md,
      padding: "12px 14px",
      fontFamily: FONTS.body,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* On narrow viewports the take-home chip + status pill push the
          title into a 60-char ellipsis. Drop them into a second row so
          the title gets its full width. Funnel still goes below. */}
      <style dangerouslySetInnerHTML={{ __html:
        // Mobile (≤720px) — heavy compaction. Drop the chunky back
        // button card (the inbox-tab handle on the left edge replaces
        // it), hide the redundant status pill (funnel below carries
        // stage), shrink the meta line to a single ellipsized strip,
        // and drop funnel labels to tiny — leaving only the dots and
        // the active-stage label inline next to them.
        "@media (max-width: 720px){"
        + "[data-tulala-job-shell-header]{padding:10px 12px!important;gap:6px!important}"
        + "[data-tulala-job-shell-header] h1{font-size:15px!important}"
        + "[data-tulala-job-shell-header] [data-tulala-back-btn]{display:none!important}"
        + "[data-tulala-job-shell-header] [data-tulala-status-pill]{display:none!important}"
        + "[data-tulala-job-shell-header] [data-tulala-source-chip-text]{display:none}"
        + "[data-tulala-job-shell-header] [data-tulala-coord-pill-text]{display:none}"
        + "[data-tulala-job-shell-header] [data-tulala-funnel] .tulala-funnel-label{display:none!important}"
        + "[data-tulala-job-shell-header] [data-tulala-funnel]{gap:3px!important}"
        + "}"
        + "@media (max-width: 520px){"
        // Keep title + take-home on row 1, meta below the title.
        // (We used to wrap actions to a 3rd row, which made the
        // header taller; with status pill hidden the take-home chip
        // fits inline now.)
        + "[data-tulala-job-shell-header] h1{font-size:14px!important;line-height:1.2!important}"
        + "[data-tulala-job-shell-header] [data-tulala-header-actions]{flex-shrink:0!important}"
        + "}"
      }} />
      {/* Row 1: back + title + meta + take-home + status */}
      <div data-tulala-header-row1 style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <button
          type="button"
          data-tulala-back-btn
          onClick={onBack}
          aria-label={t("dashboard.talentThread.backAria")}
          style={{
            flexShrink: 0, marginTop: 2,
            width: 26, height: 26, borderRadius: 7,
            border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
            color: COLORS.inkMuted, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div data-tulala-header-meta style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, letterSpacing: -0.25, lineHeight: 1.25, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", overflow: "hidden" }} className="text-admin-ink">
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {conv.client} <span style={{ fontWeight: 500 }} className="text-admin-ink-muted">· {conv.brief}</span>
            </span>
            {conv.clientIdentity && (
              <span className="shrink-0">
                <ClientIdentityPill identity={conv.clientIdentity} />
              </span>
            )}
            {conv.clientTrust && conv.clientTrust !== "basic" && (
              <span className="shrink-0">
                <ClientTrustChip level={conv.clientTrust} compact />
              </span>
            )}
          </h1>
          <div style={{ fontSize: 11.5, marginTop: 3, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", overflow: "hidden" }} className="text-admin-ink-muted">
            <span style={{
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
            }}>{metaLine}</span>
            {sourceMeta && (
              <span aria-label={interpolate(t("dashboard.talentThread.sourceAria"), { label: sourceMeta.label })} title={sourceMeta.tooltip} style={{
                flexShrink: 0,
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                background: sourceMeta.bg, color: sourceMeta.fg,
                fontSize: 10.5, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                <span data-tulala-source-chip-text>{sourceMeta.label}</span>
              </span>
            )}
            {conv.iAmCoordinator && (
              <span title={t("dashboard.talentThread.youreCoordTitle")} style={{
                flexShrink: 0,
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                fontSize: 10.5, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
                <span data-tulala-coord-pill-text>{t("dashboard.talentThread.youreCoord")}</span>
              </span>
            )}
          </div>
        </div>
        {/* Take-home + status — wrapped in a flex group so mobile media
            query can drop them onto a second row in unison. */}
        <div data-tulala-header-actions style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* Cancelled / no-rate jobs: show an outcome chip in the
            take-home slot so the header isn't naked and the user
            instantly reads the closure reason. */}
        {!hasRate && conv.stage === "cancelled" && conv.outcome && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: "rgba(11,11,13,0.05)", fontSize: 11, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink-muted">
            <span aria-hidden className="text-admin-11">
              {conv.outcome === "client_cancelled" ? "🚫"
                : conv.outcome === "client_rejected" ? "✕"
                : conv.outcome === "client_no_response" ? "⌛"
                : "—"}
            </span>
            {conv.outcome === "client_cancelled" ? t("dashboard.talentThread.outcomeClientCancelled")
              : conv.outcome === "client_rejected" ? t("dashboard.talentThread.outcomeOfferRejected")
              : conv.outcome === "client_no_response" ? t("dashboard.talentThread.outcomeExpiredNoReply")
              : conv.outcome === "talent_declined" ? t("dashboard.talentThread.outcomeYouDeclined")
              : t("dashboard.talentThread.outcomeClosed")}
          </span>
        )}
        {hasRate && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setBreakdownOpen(v => !v)}
              aria-expanded={breakdownOpen}
              aria-label={interpolate(t("dashboard.talentThread.takeHomeAria"), { rate: yourRate })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: 999,
                background: COLORS.successSoft, border: `1px solid ${COLORS.success}30`,
                color: COLORS.successDeep ?? COLORS.success, cursor: "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: FONTS.body,
                fontVariantNumeric: "tabular-nums",
                transition: `background ${TRANSITION.micro}`,
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 600, opacity: 0.7, letterSpacing: 0.3, textTransform: "uppercase" }}>
                {conv.stage === "past" ? t("dashboard.talentThread.paidLabel") : t("dashboard.talentThread.yourPay")}
              </span>
              <span>{yourRate}</span>
              {coordCommissionLabel && (
                <span
                  title={t("dashboard.talentThread.coordSuffixTitle")}
                  style={{
                    marginLeft: 2,
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: "rgba(43,63,163,0.10)",
                    color: "#2B3FA3",
                    fontSize: 10, fontWeight: 700,
                  }}
                >{coordCommissionLabel}</span>
              )}
              {isReal && (
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className={`transition-admin-sm opacity-70 ${breakdownOpen ? 'rotate-180' : 'rotate-0'}`}>
                  <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            {breakdownOpen && isReal && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                width: 240, padding: 12,
                background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10, boxShadow: "0 12px 30px -8px rgba(11,11,13,0.12)",
                zIndex: 10,
              }}>
                <BreakdownRow label={t("dashboard.talentThread.breakdownGross")}      value={fmt(gross)} muted />
                <BreakdownRow label={t("dashboard.talentThread.breakdownAgency")} value={`–${fmt(agencyFee)}`} muted />
                <BreakdownRow label={t("dashboard.talentThread.breakdownPlatform")}  value={`–${fmt(platformFee)}`} muted />
                <div style={{ height: 1, background: COLORS.borderSoft, margin: "6px 0" }} />
                <BreakdownRow label={t("dashboard.talentThread.breakdownTakeHome")} value={yourRate} bold />
                <div style={{ fontSize: 10.5, marginTop: 8 }} className="text-admin-ink-muted">
                  {conv.stage === "past" ? t("dashboard.talentThread.breakdownPaidReceipt") : t("dashboard.talentThread.breakdownPaidTiming")}
                </div>
              </div>
            )}
          </div>
        )}
        {onStatusClick ? (
          <button
            type="button"
            data-tulala-status-pill
            onClick={onStatusClick}
            aria-label={interpolate(t("dashboard.talentThread.statusPillAria"), { stage: stageLabel })}
            style={{
              flexShrink: 0,
              fontSize: 10.5, fontWeight: 700,
              padding: "3px 9px", borderRadius: 999,
              background: sc.bg, color: sc.fg,
              textTransform: "uppercase", letterSpacing: 0.4,
              marginTop: 1,
              border: "none", cursor: "pointer",
            }}
          >{stageLabel}</button>
        ) : (
          <span data-tulala-status-pill style={{
            flexShrink: 0,
            fontSize: 10.5, fontWeight: 700,
            padding: "3px 9px", borderRadius: 999,
            background: sc.bg, color: sc.fg,
            textTransform: "uppercase", letterSpacing: 0.4,
            marginTop: 1,
          }}>{stageLabel}</span>
        )}
        <ThreadSearchTrigger
          inquiryId={conv.id}
          messages={[]}
        />
        <OverflowMenu toast={toast} size="sm" />
        </div>
      </div>
      {/* Row 2: slim funnel — labels visible on desktop, hidden on
          mobile via media query (the inline active-stage label below
          carries the meaning). */}
      <div data-tulala-funnel style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <JobStageFunnel currentStage={conv.stage} compact={false} />
        {/* Mobile-only: inline active-stage label after the dots. CSS
            hides the funnel's own labels on mobile, so this picks up
            the meaning. Hidden on desktop. */}
        <span data-tulala-active-stage style={{
          display: "none",
          fontSize: 10.5, fontWeight: 700,
          color: sc.fg, textTransform: "uppercase", letterSpacing: 0.4,
        }}>{stageLabel}</span>
        <style dangerouslySetInnerHTML={{ __html:
          "@media (max-width: 720px){[data-tulala-active-stage]{display:inline!important}}"
        }} />
      </div>
    </header>
  );
}

// ── ShellHeader — generic version of the unified header used by the
// client + admin shells. Same compact band: back arrow + title + meta
// (with trust + source + coord chips) + status pill + slim funnel.
// Pluggable `rightSlot` lets each shell drop in its own primary chip
// (talent: take-home; client: next-action CTA; admin: SLA chip). ──
export type ShellHeaderInput = {
  client: string;
  brief: string;
  stage: string;
  agency: string;
  location?: string;
  date?: string;
  clientTrust?: import("../state").ClientTrustLevel;
  /** F3 — identity tier for the client on this inquiry. Optional; renders
   *  "Guest" / "Registered" / "Client" pill next to the client name when set. */
  clientIdentity?: Conversation["clientIdentity"];
  source?: Conversation["source"];
  iAmCoordinator?: boolean;
};

export function ShellHeader({
  conv, onBack, backLabel, rightSlot, primaryChip, showCoordPill = true, metaExtras,
  onStatusClick,
}: {
  conv: ShellHeaderInput;
  onBack: () => void;
  backLabel: string;
  /** Optional element rendered at the right of row 1 — typically a
   *  CTA chip (next action) or a money chip (take-home / total). */
  rightSlot?: React.ReactNode;
  /** When provided, replaces the default uppercase status pill with
   *  arbitrary content (e.g. an admin SLA chip). Pass `null` to hide. */
  primaryChip?: React.ReactNode;
  /** Whether to render the "You're coord" pill. Hidden on admin. */
  showCoordPill?: boolean;
  /** Optional row rendered below the funnel — used by admin to surface
   *  lineup count + coord owner inside the same header card so the
   *  detail view doesn't grow a second floating chip strip below. */
  metaExtras?: React.ReactNode;
  /** Slice P wiring (Messages consolidation v2): when provided, the
   *  default status pill becomes a button that opens the Status sheet
   *  with the 4-family status breakdown. */
  onStatusClick?: () => void;
}) {
  const t = useT();
  const sc = stageStyle(conv.stage);
  // Stage label — reuse the semantic talentThread.stage* keys via the
  // shared resolver (past → Wrapped, hold → Offer, else capitalized).
  const stageLabel = conv.stage === "past" ? t("dashboard.adminThread.shellHeader.stageWrapped")
    : conv.stage === "hold" ? t("dashboard.adminThread.shellHeader.stageOffer")
    : talentStageLabel(conv.stage, t);
  const metaLine = [
    interpolate(t("dashboard.talentThread.via"), { agency: conv.agency }),
    conv.location ? conv.location.split(" · ")[0] : null,
    conv.date,
  ].filter(Boolean).join(" · ");
  const sourceMeta = conv.source ? sourceChipMeta(conv.source, t) : null;
  return (
    <header data-tulala-job-shell-header style={{
      background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.md, padding: "12px 14px",
      fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 520px){"
        + "[data-tulala-job-shell-header] [data-tulala-header-row1]{flex-wrap:wrap}"
        + "[data-tulala-job-shell-header] [data-tulala-header-meta]{flex:1 1 100%}"
        + "[data-tulala-job-shell-header] [data-tulala-header-actions]{order:3;flex:1 1 100%;justify-content:flex-start;gap:8px;margin-left:36px}"
        + "}"
      }} />
      <div data-tulala-header-row1 style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <button type="button" onClick={onBack} aria-label={interpolate(t("dashboard.adminThread.shellHeader.backTo"), { label: backLabel })} style={{
          flexShrink: 0, marginTop: 2, width: 26, height: 26, borderRadius: 7,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
          color: COLORS.inkMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div data-tulala-header-meta style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, letterSpacing: -0.25, lineHeight: 1.25, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", overflow: "hidden" }} className="text-admin-ink">
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {conv.client} <span style={{ fontWeight: 500 }} className="text-admin-ink-muted">· {conv.brief}</span>
            </span>
            {conv.clientIdentity && (
              <span className="shrink-0">
                <ClientIdentityPill identity={conv.clientIdentity} />
              </span>
            )}
            {conv.clientTrust && conv.clientTrust !== "basic" && (
              <span className="shrink-0">
                <ClientTrustChip level={conv.clientTrust} compact />
              </span>
            )}
          </h1>
          <div style={{ fontSize: 11.5, marginTop: 3, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", overflow: "hidden" }} className="text-admin-ink-muted">
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{metaLine}</span>
            {sourceMeta && (
              <span aria-label={interpolate(t("dashboard.adminThread.shellHeader.sourceAria"), { label: sourceMeta.label })} title={sourceMeta.tooltip} style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                background: sourceMeta.bg, color: sourceMeta.fg,
                fontSize: 10.5, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                {sourceMeta.label}
              </span>
            )}
            {showCoordPill && conv.iAmCoordinator && (
              <span title={t("dashboard.adminThread.shellHeader.youreCoordTitle")} style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                fontSize: 10.5, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
                {t("dashboard.adminThread.shellHeader.youreCoord")}
              </span>
            )}
          </div>
        </div>
        <div data-tulala-header-actions style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {rightSlot}
          {primaryChip !== null && (
            primaryChip ?? (
              onStatusClick ? (
                <button
                  type="button"
                  onClick={onStatusClick}
                  aria-label={interpolate(t("dashboard.adminThread.shellHeader.statusAria"), { stage: stageLabel })}
                  title={t("dashboard.adminThread.shellHeader.viewFullStatus")}
                  style={{
                    flexShrink: 0,
                    fontSize: 10.5, fontWeight: 700,
                    padding: "3px 9px", borderRadius: 999,
                    background: sc.bg, color: sc.fg,
                    textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1,
                    border: "none", cursor: "pointer",
                    fontFamily: FONTS.body,
                    display: "inline-flex", alignItems: "center", gap: 3,
                  }}
                >
                  {stageLabel}
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden style={{ opacity: 0.6 }}>
                    <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <span style={{
                  flexShrink: 0,
                  fontSize: 10.5, fontWeight: 700,
                  padding: "3px 9px", borderRadius: 999,
                  background: sc.bg, color: sc.fg,
                  textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1,
                }}>{stageLabel}</span>
              )
            )
          )}
        </div>
      </div>
      {/* Slice A (Messages consolidation v2): the 4-dot stage-funnel row
          is removed from the header. Status is now a single derived pill
          on row 1's right edge (rightSlot / primaryChip). Full stage
          breakdown opens via the Status sheet (Slice P). Saves ~36px of
          chrome on every thread. JobStageFunnel function remains in use
          by inbox-row + other compact contexts. */}
      {metaExtras && (
        <div style={{ paddingTop: 8, borderTop: `1px solid ${COLORS.borderSoft}`, display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, flexWrap: "wrap" }} className="text-admin-ink-muted">
          {metaExtras}
        </div>
      )}
    </header>
  );
}

// Small chip describing where the inquiry came from. Talent's first
// instinct when a new job lands: "Where did this come from?". This
// answers it without needing to dig into Details.
export function sourceChipMeta(source: NonNullable<Conversation["source"]>, t?: Translator): {
  icon: React.ReactNode;
  label: string;
  bg: string;
  fg: string;
  tooltip: string;
} {
  // Localize when a translator is supplied; fall back to English so the
  // shared helper stays correct for consumers that don't pass `t` yet.
  const tr = (key: string, fallback: string): string => {
    if (!t) return fallback;
    const out = t(key);
    return out === key ? fallback : out;
  };
  switch (source.kind) {
    case "tulala-hub":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4"/></svg>),
        label: tr("dashboard.talentThread.sourceTulalaHub", "Tulala Hub"),
        bg: COLORS.indigoSoft,
        fg: COLORS.indigoDeep,
        tooltip: source.label ?? tr("dashboard.talentThread.sourceTulalaHubTooltip", "Discovered via Tulala Hub"),
      };
    case "direct":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 3h8v6H2zM2 3l4 3 4-3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>),
        label: tr("dashboard.talentThread.sourceDirect", "Direct"),
        bg: "rgba(46,125,91,0.10)",
        fg: COLORS.successDeep ?? COLORS.success,
        tooltip: source.label ?? tr("dashboard.talentThread.sourceDirectTooltip", "Direct inbound to your agency"),
      };
    case "agency-referral":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><circle cx="3.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="8.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 6h2" stroke="currentColor" strokeWidth="1.3"/></svg>),
        label: tr("dashboard.talentThread.sourceReferral", "Referral"),
        bg: COLORS.surfaceAlt,
        fg: COLORS.inkMuted,
        tooltip: source.via
          ? interpolate(tr("dashboard.talentThread.sourceReferralViaTooltip", "Referred by {via}"), { via: source.via })
          : tr("dashboard.talentThread.sourceReferralTooltip", "Routed by another agency"),
      };
    case "instagram-dm":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.3"/><circle cx="6" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.3"/></svg>),
        label: tr("dashboard.talentThread.sourceIgDm", "IG DM"),
        bg: "rgba(218,89,153,0.12)",
        fg: "#B23170",
        tooltip: tr("dashboard.talentThread.sourceIgDmTooltip", "Inbound Instagram DM"),
      };
    case "email":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 3h8v6H2zM2 3l4 3 4-3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>),
        label: tr("dashboard.talentThread.sourceColdEmail", "Cold email"),
        bg: "rgba(11,11,13,0.05)",
        fg: COLORS.inkMuted,
        tooltip: source.from
          ? interpolate(tr("dashboard.talentThread.sourceColdEmailFromTooltip", "Cold email from {from}"), { from: source.from })
          : tr("dashboard.talentThread.sourceColdEmailTooltip", "Cold inbound email"),
      };
  }
}

// Funnel stage id → localized label key. Mirrors FUNNEL_STAGES ids;
// falls back to the constant's English label when a key is missing.
const FUNNEL_STAGE_LABEL_KEYS: Record<string, string> = {
  inquiry: "dashboard.talentThread.stageInquiry",
  offered: "dashboard.talentThread.stageOffer",
  booked:  "dashboard.talentThread.stageBooked",
  wrapped: "dashboard.talentThread.stageWrapped",
};

// ── Slim, premium 4-step funnel — inline variant. Fits within the
// unified header (full labels) AND inside left-rail rows (compact).
export function JobStageFunnel({ currentStage, compact }: { currentStage: string; compact: boolean }) {
  const t = useT();
  const funnelLabel = (s: { id: string; label: string }): string => {
    const key = FUNNEL_STAGE_LABEL_KEYS[s.id];
    if (!key) return s.label;
    const out = t(key);
    return out === key ? s.label : out;
  };
  const idx = funnelIndexFor(currentStage);
  // Cancelled jobs get a muted coral palette instead of success green —
  // the visual cue should match the outcome (negative/abandoned), not
  // the funnel position. Same dot positions, different tone.
  const isCancelled = currentStage === "cancelled" || currentStage === "rejected" || currentStage === "expired";
  const palette = isCancelled
    ? { past: "rgba(11,11,13,0.16)", here: COLORS.coral, rail: "rgba(11,11,13,0.10)" }
    : { past: COLORS.success, here: COLORS.accent, rail: COLORS.success };
  return (
    <div role="progressbar"
      data-tulala-stage-funnel={compact ? "compact" : "full"}
      aria-valuemin={1} aria-valuemax={FUNNEL_STAGES.length} aria-valuenow={idx + 1}
      aria-label={interpolate(t("dashboard.talentThread.funnelStageAria"), { current: idx + 1, total: FUNNEL_STAGES.length, label: FUNNEL_STAGES[idx] ? funnelLabel(FUNNEL_STAGES[idx]!) : "" })}
      style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6, fontFamily: FONTS.body, justifyContent: "flex-start" }}
    >
      {/* Mobile: center the funnel — on narrow viewports the row of dots
          + labels feels off-balance hugged to the left. Doesn't apply
          inside the compact left-rail rows (they hug left intentionally). */}
      {!compact && (
        <style>{`
          @media (max-width: 600px) {
            [data-tulala-stage-funnel="full"] { justify-content: center !important; }
          }
        `}</style>
      )}
      {FUNNEL_STAGES.map((s, i) => {
        const past = i < idx;
        const here = i === idx;
        const dotColor = past ? palette.past : here ? palette.here : "rgba(11,11,13,0.16)";
        const railColor = past ? palette.rail : "rgba(11,11,13,0.10)";
        const dotSize = compact ? 6 : 8;
        const hereBoost = here && !compact ? 2 : 0;
        return (
          <React.Fragment key={s.id}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: compact ? 4 : 6, flexShrink: 0 }}>
              <span aria-hidden style={{
                width: dotSize + hereBoost, height: dotSize + hereBoost,
                borderRadius: "50%", background: dotColor,
                boxShadow: here && !compact ? `0 0 0 3px ${palette.here}22` : "none",
                transition: TRANSITION.sm,
              }} />
              {!compact && (
                <span className="tulala-funnel-label" style={{
                  fontSize: 11, fontWeight: here ? 700 : 500,
                  color: past || here ? COLORS.ink : COLORS.inkDim,
                  letterSpacing: -0.05,
                  textDecoration: isCancelled && here ? "line-through" : "none",
                }}>{funnelLabel(s)}</span>
              )}
            </span>
            {i < FUNNEL_STAGES.length - 1 && (
              <span aria-hidden style={{
                flex: compact ? "1 1 0" : "0 1 32px",
                height: compact ? 1 : 1.5,
                background: railColor, borderRadius: 1,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── ChannelDescriptor was removed: was a sub-header naming participants
// + visibility rules ("Booking team · Client doesn't see this"). The tab
// name and team-strip already convey who's listening, so the descriptor
// was redundant chrome. ~125 dead lines deleted. ──

export function funnelIndexFor(stage: string): number {
  if (stage === "submitted" || stage === "coordination" || stage === "draft" || stage === "inquiry") return 0;
  if (stage === "offer_pending" || stage === "hold" || stage === "offered") return 1;
  if (stage === "approved" || stage === "booked") return 2;
  if (stage === "completed" || stage === "past" || stage === "rejected" || stage === "expired" || stage === "wrapped") return 3;
  // Cancelled — visually treat as terminal (stage 3) so the funnel
  // doesn't read like a fresh inquiry.
  if (stage === "cancelled") return 3;
  return 0;
}

/**
 * Lineup tab body — auto-opens the LineupDrawer as soon as the user
 * lands on the tab, so there's no "tap to see who's here" indirection.
 * Renders a minimal placeholder behind the drawer in case auto-open
 * is blocked (e.g. test environment without window timers).
 */
export function LineupTabPanel({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  useEffect(() => {
    // Defer one tick so the tab paints before the drawer overlays it
    // — avoids a flash of empty body on the user's first click.
    const timer = setTimeout(onOpen, 16);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: auto-open drawer once on first paint; onOpen is a stable prop that should not re-trigger this
  }, []);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24, fontFamily: FONTS.body, fontSize: 12.5, textAlign: "center" }} className="text-admin-ink-muted">
      {t("dashboard.talentThread.lineupOpening")}{" "}
      <button
        type="button"
        onClick={onOpen}
        style={{
          padding: 0, marginLeft: 4,
          background: "transparent", color: COLORS.accent,
          border: "none", cursor: "pointer",
          fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
          textDecoration: "underline",
        }}
      >{t("dashboard.talentThread.lineupTapHere")}</button>.
    </div>
  );
}
