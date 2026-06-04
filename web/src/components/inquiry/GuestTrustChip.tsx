"use client";

/**
 * GuestTrustChip — talent-facing identity + trust summary for a guest sender.
 *
 * Rendered atop the talent thread header when the counterparty is a guest or
 * client whose identity/trust data is available.  Reuses TrustBadge (the
 * existing tier chip) for consistent visual language; extends it with:
 *   - per-signal ticks (email / phone / social / payment)
 *   - booking history count
 *   - precomputed one-line risk read
 *   - optional Block / Report affordances (injected from Lane C server actions)
 *
 * RENDER RULES (docs/client-trust-and-contact-controls.md):
 *   - Render on: talent inbox thread header, inquiry workspace sidebar.
 *   - NEVER render on: public roster, booking detail, or the public talent page.
 *   - Blocking / reporting affordances only render when `onBlock` / `onReport`
 *     are non-null (the parent gates on capability).
 */

import { useState } from "react";
import { TrustBadge } from "@/components/trust-badge";
import type {
  GuestTrustChipProps,
  TrustSignalState,
  InquiryReportReason,
} from "@/lib/inquiry/guest-chat-contract";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (matches trust-badge.tsx palette — keep in sync)
// ─────────────────────────────────────────────────────────────────────────────

const IDENTITY_META: Record<
  GuestTrustChipProps["identity"],
  { label: string; dotColor: string; bg: string; border: string; textColor: string }
> = {
  guest: {
    label: "Guest",
    dotColor: "rgba(11,11,13,0.30)",
    bg: "rgba(11,11,13,0.04)",
    border: "rgba(11,11,13,0.10)",
    textColor: "rgba(11,11,13,0.45)",
  },
  identified: {
    label: "Identified",
    dotColor: "#9A6E1A",
    bg: "rgba(176,125,42,0.07)",
    border: "rgba(176,125,42,0.16)",
    textColor: "#7A5010",
  },
  email_verified: {
    label: "Email verified",
    dotColor: "#2E7D5B",
    bg: "rgba(46,125,91,0.07)",
    border: "rgba(46,125,91,0.15)",
    textColor: "#1A5E3C",
  },
  account: {
    label: "Account",
    dotColor: "#2563EB",
    bg: "rgba(37,99,235,0.07)",
    border: "rgba(37,99,235,0.15)",
    textColor: "#1D4ED8",
  },
};

const REPORT_REASONS: { value: InquiryReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "scam_or_fraud", label: "Scam or fraud" },
  { value: "off_platform", label: "Off-platform solicitation" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Signal tick
// ─────────────────────────────────────────────────────────────────────────────

function SignalTick({
  label,
  state,
}: {
  label: string;
  state: TrustSignalState;
}) {
  const isVerified = state === "verified";
  const isPresent = state === "present_unverified";

  return (
    <span
      title={`${label}: ${state === "verified" ? "verified" : state === "present_unverified" ? "unverified" : "not provided"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 6px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 500,
        fontFamily: '"Inter", system-ui, sans-serif',
        lineHeight: 1,
        background: isVerified
          ? "rgba(46,125,91,0.08)"
          : isPresent
            ? "rgba(176,125,42,0.07)"
            : "rgba(11,11,13,0.04)",
        border: isVerified
          ? "1px solid rgba(46,125,91,0.18)"
          : isPresent
            ? "1px solid rgba(176,125,42,0.14)"
            : "1px solid rgba(11,11,13,0.08)",
        color: isVerified ? "#1A5E3C" : isPresent ? "#7A5010" : "rgba(11,11,13,0.38)",
        userSelect: "none",
      }}
    >
      {/* Tick mark / circle */}
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          flexShrink: 0,
          background: isVerified ? "#2E7D5B" : isPresent ? "#B07D2A" : "rgba(11,11,13,0.20)",
          border: isVerified || isPresent ? "none" : "1.5px solid rgba(11,11,13,0.25)",
        }}
      />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GuestTrustChip
// ─────────────────────────────────────────────────────────────────────────────

export function GuestTrustChip({
  identity,
  tier,
  displayName,
  signals,
  completedBookings,
  riskLine,
  isBlocked,
  onBlock,
  onReport,
}: GuestTrustChipProps) {
  const [blockState, setBlockState] = useState<"idle" | "pending" | "done">("idle");
  const [reportState, setReportState] = useState<"idle" | "choosing" | "pending" | "done">(
    "idle",
  );
  const [reportError, setReportError] = useState<string | null>(null);

  const identityMeta = IDENTITY_META[identity];

  async function handleBlock() {
    if (!onBlock || blockState !== "idle") return;
    setBlockState("pending");
    try {
      const result = await onBlock();
      setBlockState(result.ok ? "done" : "idle");
    } catch {
      setBlockState("idle");
    }
  }

  async function handleReport(reason: InquiryReportReason) {
    if (!onReport || reportState !== "choosing") return;
    setReportState("pending");
    setReportError(null);
    try {
      const result = await onReport(reason);
      if (result.ok) {
        setReportState("done");
      } else {
        setReportState("choosing");
        setReportError("Could not submit report. Try again.");
      }
    } catch {
      setReportState("choosing");
      setReportError("Could not submit report. Try again.");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(11,11,13,0.02)",
        border: "1px solid rgba(11,11,13,0.07)",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
      aria-label={`Guest trust summary for ${displayName}`}
    >
      {/* Row 1 — display name + identity chip + tier badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(11,11,13,0.85)",
            lineHeight: 1.2,
            marginRight: 2,
          }}
        >
          {displayName}
        </span>

        {/* Identity chip */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 7px",
            borderRadius: 999,
            background: identityMeta.bg,
            border: `1px solid ${identityMeta.border}`,
            color: identityMeta.textColor,
            fontSize: 10,
            fontWeight: 600,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: identityMeta.dotColor,
              flexShrink: 0,
            }}
          />
          {identityMeta.label}
        </span>

        {/* Trust tier badge (reuses live TrustBadge) */}
        {tier && <TrustBadge level={tier} size="sm" />}

        {/* Blocked indicator */}
        {isBlocked && (
          <span
            style={{
              padding: "2px 7px",
              borderRadius: 999,
              background: "rgba(220,38,38,0.08)",
              border: "1px solid rgba(220,38,38,0.18)",
              color: "#991B1B",
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            Blocked
          </span>
        )}
      </div>

      {/* Row 2 — signal ticks */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <SignalTick label="Email" state={signals.email} />
        <SignalTick label="Phone" state={signals.phone} />
        <SignalTick label="Social" state={signals.social} />
        <SignalTick label="Payment" state={signals.payment} />
        {completedBookings > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "2px 6px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 500,
              background: "rgba(92,122,153,0.08)",
              border: "1px solid rgba(92,122,153,0.16)",
              color: "#2D4F70",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            {/* Star glyph rendered as text; safe in all browsers */}
            <span aria-hidden style={{ fontSize: 9 }}>
              &#9733;
            </span>
            {completedBookings} booking{completedBookings === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Row 3 — risk line */}
      <p
        style={{
          margin: 0,
          fontSize: 11,
          color: "rgba(11,11,13,0.50)",
          lineHeight: 1.4,
        }}
      >
        {riskLine}
      </p>

      {/* Row 4 — Block / Report affordances (only when injected) */}
      {(onBlock || onReport) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          {onBlock && (
            <button
              type="button"
              onClick={handleBlock}
              disabled={blockState !== "idle"}
              aria-label={
                blockState === "done"
                  ? "Sender blocked"
                  : isBlocked
                    ? "Already blocked"
                    : "Block this sender"
              }
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid rgba(11,11,13,0.13)",
                background: "none",
                cursor: blockState !== "idle" || isBlocked ? "default" : "pointer",
                fontSize: 11,
                fontWeight: 500,
                color:
                  blockState === "done" || isBlocked
                    ? "#991B1B"
                    : "rgba(11,11,13,0.55)",
                fontFamily: '"Inter", system-ui, sans-serif',
                opacity: blockState === "pending" ? 0.6 : 1,
              }}
            >
              {blockState === "done" ? "Blocked" : isBlocked ? "Unblock" : "Block"}
            </button>
          )}
          {onReport && reportState !== "done" && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (reportState === "idle") setReportState("choosing");
                  else if (reportState === "choosing") setReportState("idle");
                }}
                disabled={reportState === "pending"}
                style={{
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(11,11,13,0.13)",
                  background: "none",
                  cursor: reportState === "pending" ? "default" : "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(11,11,13,0.55)",
                  fontFamily: '"Inter", system-ui, sans-serif',
                  opacity: reportState === "pending" ? 0.6 : 1,
                }}
              >
                {reportState === "choosing" ? "Cancel" : "Report"}
              </button>
              {reportState === "choosing" && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 2,
                    width: "100%",
                  }}
                >
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => handleReport(r.value)}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(220,38,38,0.20)",
                        background: "rgba(220,38,38,0.05)",
                        cursor: "pointer",
                        fontSize: 10,
                        fontWeight: 500,
                        color: "#991B1B",
                        fontFamily: '"Inter", system-ui, sans-serif',
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                  {reportError && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 10,
                        color: "#991B1B",
                        width: "100%",
                      }}
                    >
                      {reportError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {reportState === "done" && (
            <span
              style={{
                fontSize: 11,
                color: "#1A5E3C",
                fontFamily: '"Inter", system-ui, sans-serif',
              }}
            >
              Report submitted
            </span>
          )}
        </div>
      )}
    </div>
  );
}
