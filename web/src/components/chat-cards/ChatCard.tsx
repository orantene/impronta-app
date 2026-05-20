"use client";

/**
 * ChatCard — structured workflow card rendered inside the conversation
 * stream. Replaces plain-text "system event" lines for high-value
 * moments (offer sent, payment requested, coord request, etc.).
 *
 * Messages Consolidation Plan v2 — Slice O.
 *
 * Per plan §5, the chat carries 11 card kinds. Each is a small,
 * deep-linkable, role-aware tile that gives the reader the info +
 * the actionable CTA in one place. WhatsApp feel without WhatsApp's
 * shallowness.
 *
 * Card types implemented in this file (the v1 set — others added
 * as needed):
 *   - OfferCard
 *   - PaymentRequestCard
 *   - CoordinatorRequestCard
 *   - TalentRateCard
 *   - CallSheetUpdateCard
 *   - SystemEventCard
 *   - PlainText (passthrough for messages that aren't a card)
 */

import type { ReactNode } from "react";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface:    "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.025)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  green:      "#1A7348",
  greenSoft:  "rgba(26,115,72,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
  indigo:     "#2B3FA3",
  indigoSoft: "rgba(43,63,163,0.07)",
  coral:      "#A33A3A",
  coralSoft:  "rgba(214,89,89,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

type CardTone = "neutral" | "accent" | "success" | "amber" | "info" | "alert";

type Palette = { bg: string; fg: string; border: string };
function palette(tone: CardTone): Palette {
  switch (tone) {
    case "accent":  return { bg: C.accentSoft, fg: C.accent,  border: C.accent };
    case "success": return { bg: C.greenSoft,  fg: C.green,   border: C.green };
    case "amber":   return { bg: C.amberSoft,  fg: C.amber,   border: C.amber };
    case "info":    return { bg: C.indigoSoft, fg: C.indigo,  border: C.indigo };
    case "alert":   return { bg: C.coralSoft,  fg: C.coral,   border: C.coral };
    default:        return { bg: C.surface,    fg: C.ink,     border: "rgba(24,24,27,0.10)" };
  }
}

type ChatCardShellProps = {
  tone?: CardTone;
  icon?: ReactNode;
  kind: string;
  title: string;
  /** Plain-language summary, ~60-80 chars max. */
  summary?: string;
  /** Right-aligned amount / status chip. */
  meta?: string;
  /** Action buttons rendered at the bottom of the card. */
  actions?: { label: string; onClick: () => void; tone?: "primary" | "ghost"; disabled?: boolean }[];
  /** When set, makes the entire card tappable (whole-card deep-link).
   *  Disabled if `actions` exist (then actions are the only tap targets). */
  onOpen?: () => void;
};

export function ChatCardShell({
  tone = "neutral", icon, kind, title, summary, meta, actions, onOpen,
}: ChatCardShellProps) {
  const p = palette(tone);
  const clickable = !!onOpen && (!actions || actions.length === 0);

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") onOpen?.(); } : undefined}
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        fontFamily: FONT,
        cursor: clickable ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: 8,
        // Width caps the card inside the thread so it doesn't span the
        // full conversation width on desktop.
        maxWidth: 480, width: "100%",
      }}
    >
      <div className="flex items-start gap-2.5">
        {icon && (
          <span aria-hidden style={{
            flexShrink: 0,
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(255,255,255,0.7)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: p.fg,
          }}>
            {icon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
            color: p.fg, textTransform: "uppercase",
          }}>
            {kind}
          </div>
          <div style={{
            fontSize: 13.5, fontWeight: 700, color: C.ink, marginTop: 2,
            lineHeight: 1.35,
          }}>
            {title}
          </div>
          {summary && (
            <div style={{
              fontSize: 12, color: C.inkMuted, marginTop: 4,
              lineHeight: 1.5,
            }}>
              {summary}
            </div>
          )}
        </div>
        {meta && (
          <span style={{
            flexShrink: 0,
            fontSize: 11.5, fontWeight: 700,
            color: p.fg,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}>
            {meta}
          </span>
        )}
      </div>
      {actions && actions.length > 0 && (
        <div style={{
          display: "flex", gap: 8, justifyContent: "flex-end",
          marginTop: 2,
        }}>
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              disabled={a.disabled}
              onClick={(e) => { e.stopPropagation(); a.onClick(); }}
              style={{
                padding: "7px 14px", borderRadius: 8,
                fontSize: 12.5, fontWeight: 600,
                fontFamily: FONT,
                cursor: a.disabled ? "not-allowed" : "pointer",
                border: a.tone === "primary"
                  ? "none"
                  : `1px solid rgba(24,24,27,0.15)`,
                background: a.tone === "primary"
                  ? (a.disabled ? "rgba(15,79,62,0.4)" : C.accent)
                  : "transparent",
                color: a.tone === "primary" ? "#fff" : C.ink,
                opacity: a.disabled ? 0.6 : 1,
                // Tap-target ≥ 44px via padding + visual button size
                minHeight: 36,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Specific cards ─────────────────────────────────────────────── */

export function OfferCard(props: {
  status: "draft" | "sent" | "accepted" | "declined" | "countered";
  totalLabel: string;
  /** What the viewer's role-appropriate next step is. */
  hint?: string;
  onOpen?: () => void;
  onApprove?: () => void;
  onCounter?: () => void;
  onDecline?: () => void;
}) {
  const { status, totalLabel, hint, onOpen, onApprove, onCounter, onDecline } = props;
  const tone: CardTone =
    status === "accepted" ? "success"
    : status === "declined" ? "alert"
    : status === "sent" ? "amber"
    : "info";
  const actions: ChatCardShellProps["actions"] = [];
  if (onCounter) actions.push({ label: "Counter", onClick: onCounter, tone: "ghost" });
  if (onDecline) actions.push({ label: "Decline", onClick: onDecline, tone: "ghost" });
  if (onApprove) actions.push({ label: "Approve", onClick: onApprove, tone: "primary" });
  return (
    <ChatCardShell
      tone={tone}
      kind="Offer"
      title={`Offer ${status}`}
      summary={hint}
      meta={totalLabel}
      onOpen={onOpen}
      actions={actions.length > 0 ? actions : undefined}
      icon={
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="2" y="3" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M2 6h10" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
      }
    />
  );
}

export function PaymentRequestCard(props: {
  amountLabel: string;
  status: "requested" | "paid" | "failed" | "refunded";
  onPayNow?: () => void;
  onMarkPaid?: () => void;
  hint?: string;
}) {
  const { amountLabel, status, onPayNow, onMarkPaid, hint } = props;
  const tone: CardTone =
    status === "paid" ? "success"
    : status === "failed" ? "alert"
    : "amber";
  const actions: ChatCardShellProps["actions"] = [];
  if (onPayNow && status === "requested") actions.push({ label: "Pay now", onClick: onPayNow, tone: "primary" });
  if (onMarkPaid && status === "requested") actions.push({ label: "Mark paid manually", onClick: onMarkPaid, tone: "ghost" });
  return (
    <ChatCardShell
      tone={tone}
      kind="Payment"
      title={status === "paid" ? "Payment received"
        : status === "failed" ? "Payment failed"
        : status === "refunded" ? "Refunded"
        : "Payment requested"}
      summary={hint}
      meta={amountLabel}
      actions={actions.length > 0 ? actions : undefined}
      icon={
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 4h10v6H2z" stroke="currentColor" strokeWidth="1.4"/>
          <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
      }
    />
  );
}

export function CoordinatorRequestCard(props: {
  requesterName: string;
  pitch?: string | null;
  /** Approver UI — admin / existing coord / client. */
  onApprove?: () => void;
  onDecline?: () => void;
  /** Pending status for the requester themselves. */
  isOwnRequest?: boolean;
  onCancel?: () => void;
  decided?: "approved" | "declined" | "cancelled" | "revoked";
}) {
  const { requesterName, pitch, onApprove, onDecline, isOwnRequest, onCancel, decided } = props;
  const tone: CardTone = decided === "approved" ? "success"
    : decided === "declined" || decided === "cancelled" || decided === "revoked" ? "neutral"
    : "info";
  const actions: ChatCardShellProps["actions"] = [];
  if (!decided && onDecline) actions.push({ label: "Decline", onClick: onDecline, tone: "ghost" });
  if (!decided && onApprove) actions.push({ label: "Approve", onClick: onApprove, tone: "primary" });
  if (!decided && isOwnRequest && onCancel) actions.push({ label: "Cancel request", onClick: onCancel, tone: "ghost" });
  return (
    <ChatCardShell
      tone={tone}
      kind="Coordinator request"
      title={decided
        ? `Request ${decided}`
        : isOwnRequest
          ? "Your request to coordinate is pending"
          : `${requesterName} wants to coordinate`}
      summary={pitch ?? undefined}
      actions={actions.length > 0 ? actions : undefined}
      icon={
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1l1.5 3.2L11 4.6 9 6.6l.5 3L7 8.2l-2.5 1.4.5-3-2-2 2.5-.4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
      }
    />
  );
}

export function TalentRateCard(props: {
  talentName: string;
  rateLabel: string;
  state: "submitted" | "accepted" | "countered" | "pending";
  onOpen?: () => void;
}) {
  const { talentName, rateLabel, state, onOpen } = props;
  const tone: CardTone = state === "accepted" ? "success"
    : state === "countered" ? "amber"
    : "info";
  return (
    <ChatCardShell
      tone={tone}
      kind="Talent rate"
      title={`${talentName} · ${state}`}
      summary={state === "pending" ? "Awaiting rate" : undefined}
      meta={rateLabel}
      onOpen={onOpen}
      icon={
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M3 12c0-2 2-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      }
    />
  );
}

export function CallSheetUpdateCard(props: {
  changedField?: string;
  byName?: string;
  onOpen?: () => void;
}) {
  const { changedField, byName, onOpen } = props;
  return (
    <ChatCardShell
      tone="info"
      kind="Call sheet"
      title={changedField ? `Call sheet updated: ${changedField}` : "Call sheet updated"}
      summary={byName ? `Edited by ${byName}` : undefined}
      onOpen={onOpen}
      icon={
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="2.5" y="3" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M2.5 5.5h9M5 1.5v3M9 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      }
    />
  );
}

/**
 * SuggestedTalentCard — admin attaches a "you might like this talent"
 * card to a message in the Client thread. Inquiry-funnel sprint Step 7.
 *
 * status = 'pending' → renders the [Add to lineup] CTA (admin only).
 * status = 'added'   → button is replaced with a "Added" status label.
 * status = 'dismissed' → button replaced with "Dismissed" label.
 *
 * TODO (composer-side, follow-up): build the picker UI that lets the
 * admin pick a talent + rate from the composer and attach it as a
 * card to a new message. This commit ships the render + action side
 * only — payload is currently created via direct insert / a future
 * composer slice.
 */
export function SuggestedTalentCard(props: {
  talentName: string;
  rateLabel?: string;
  status: "pending" | "added" | "dismissed";
  onAddToLineup?: () => void;
}) {
  const { talentName, rateLabel, status, onAddToLineup } = props;
  const tone: CardTone =
    status === "added" ? "success"
    : status === "dismissed" ? "neutral"
    : "info";
  const actions: ChatCardShellProps["actions"] = [];
  if (status === "pending" && onAddToLineup) {
    actions.push({ label: "Add to lineup", onClick: onAddToLineup, tone: "primary" });
  }
  const statusLabel =
    status === "added" ? "Added to lineup"
    : status === "dismissed" ? "Dismissed"
    : undefined;
  return (
    <ChatCardShell
      tone={tone}
      kind="Suggested talent"
      title={talentName}
      summary={statusLabel ?? (rateLabel ? "Tap to add to the lineup" : undefined)}
      meta={rateLabel || undefined}
      actions={actions.length > 0 ? actions : undefined}
      icon={
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M3 12c0-2 2-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      }
    />
  );
}

export function SystemEventCard(props: {
  text: string;
  ts?: string;
}) {
  return (
    <div style={{
      fontSize: 11.5,
      color: C.inkMuted,
      textAlign: "center",
      padding: "6px 12px",
      fontFamily: FONT,
      fontStyle: "italic",
    }}>
      {props.text}
      {props.ts && (
        <span style={{ marginLeft: 6, color: C.inkDim }}>· {props.ts}</span>
      )}
    </div>
  );
}
