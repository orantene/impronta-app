"use client";

/**
 * Status sheet — opens from the single primary status pill in the
 * universal Messages header.
 *
 * Messages Consolidation Plan v2 — Slice P.
 *
 * Per plan §8, the four connected status families are surfaced here
 * with dates + responsible party + next recommended action:
 *
 *   1. Inquiry/booking stage:  Inquiry → Offer sent → Booked → Today → Wrapped
 *   2. Offer status:           No offer → Draft → Sent → Countered ↔ Accepted/Declined/Expired
 *   3. Talent participation:   per talent — Invited → Hold/Accepted/Declined → Confirmed
 *   4. Payment status:         Not requested → Requested → Partial/Paid → Refunded/Failed
 */

import type { ReactNode } from "react";

export type StageStatus =
  | "Inquiry" | "Offer sent" | "Booked" | "Today" | "Paid" | "Wrapped" | "Cancelled";

export type OfferStatus =
  | "No offer" | "Draft" | "Sent" | "Countered" | "Accepted" | "Declined" | "Expired";

export type PaymentStatus =
  | "Not requested" | "Requested" | "Partially paid" | "Paid" | "Refunded" | "Failed";

export type TalentParticipationRow = {
  name: string;
  status: "Invited" | "Hold" | "Accepted" | "Declined" | "Confirmed" | "Removed";
  decidedAt?: string;
};

export type StatusSheetData = {
  stage: StageStatus;
  stageHistory?: { stage: StageStatus; at: string; by?: string }[];
  offer: { status: OfferStatus; totalLabel?: string; nextAction?: string };
  talents: TalentParticipationRow[];
  payment: { status: PaymentStatus; amountLabel?: string; nextAction?: string };
  /** Plain-language "What happens next" line for the active stage. */
  nextStep?: string;
};

type Props = {
  open: boolean;
  data: StatusSheetData;
  onClose: () => void;
};

export function StatusSheet({ open, data, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-sheet-title"
      style={{
        position: "fixed", inset: 0, zIndex: 110,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(11,11,13,0.5)",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 520,
          maxHeight: "85vh", overflow: "auto",
          background: "#fff",
          borderRadius: "16px 16px 0 0",
          padding: 20,
          boxShadow: "0 -20px 50px rgba(11,11,13,0.20)",
        }}
      >
        {/* Mobile grip indicator */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: "rgba(24,24,27,0.18)",
          margin: "0 auto 14px",
        }} />

        <h2
          id="status-sheet-title"
          style={{
            margin: 0, marginBottom: 12,
            fontSize: 17, fontWeight: 700,
            color: "#0B0B0D",
            letterSpacing: -0.2,
          }}
        >
          Status
        </h2>

        {/* What happens next — the operational nudge */}
        {data.nextStep && (
          <div style={{
            padding: "10px 12px",
            background: "rgba(15,79,62,0.06)",
            borderRadius: 10,
            border: "1px solid rgba(15,79,62,0.15)",
            marginBottom: 16,
            fontSize: 12.5,
            color: "#0F4F3E",
            lineHeight: 1.5,
          }}>
            <strong style={{ fontWeight: 700 }}>What happens next:</strong>{" "}
            {data.nextStep}
          </div>
        )}

        {/* Family 1 — Stage */}
        <Section label="Stage">
          <Row primary={data.stage} />
          {data.stageHistory && data.stageHistory.length > 0 && (
            <div style={{ marginTop: 6, paddingLeft: 8, fontSize: 11, color: "rgba(11,11,13,0.55)" }}>
              {data.stageHistory.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <span aria-hidden style={{ color: "rgba(11,11,13,0.30)" }}>•</span>
                  <span>{h.stage} — {h.at}{h.by ? ` · ${h.by}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Family 2 — Offer */}
        <Section label="Offer">
          <Row
            primary={data.offer.status}
            secondary={data.offer.totalLabel}
            hint={data.offer.nextAction}
          />
        </Section>

        {/* Family 3 — Talent participation */}
        <Section label="Talent participation">
          {data.talents.length === 0 ? (
            <Row primary="No talent on this inquiry yet" secondary="" />
          ) : (
            data.talents.map((t, i) => (
              <Row
                key={i}
                primary={t.name}
                secondary={t.status}
                hint={t.decidedAt ? `decided ${t.decidedAt}` : undefined}
                statusTone={statusTone(t.status)}
              />
            ))
          )}
        </Section>

        {/* Family 4 — Payment */}
        <Section label="Payment">
          <Row
            primary={data.payment.status}
            secondary={data.payment.amountLabel}
            hint={data.payment.nextAction}
          />
        </Section>

        {/* Close button */}
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 16px", borderRadius: 9,
              border: "none",
              background: "#0F4F3E", color: "#fff",
              fontSize: 13, fontWeight: 600,
              cursor: "pointer",
              fontFamily: '"Inter", system-ui, sans-serif',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: "rgba(11,11,13,0.55)",
        marginBottom: 6,
      }}>{label}</div>
      <div style={{
        padding: "10px 12px",
        background: "rgba(11,11,13,0.025)",
        border: "1px solid rgba(24,24,27,0.06)",
        borderRadius: 10,
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({
  primary, secondary, hint, statusTone: tone,
}: {
  primary: string;
  secondary?: string;
  hint?: string;
  statusTone?: { fg: string; bg: string };
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 12.5, color: "#0B0B0D",
    }}>
      <span style={{ fontWeight: 600 }}>{primary}</span>
      {secondary && (
        <span
          style={{
            marginLeft: "auto",
            padding: "2px 8px",
            borderRadius: 999,
            background: tone?.bg ?? "rgba(11,11,13,0.05)",
            color: tone?.fg ?? "rgba(11,11,13,0.65)",
            fontSize: 11,
            fontWeight: 700,
          }}
        >{secondary}</span>
      )}
      {hint && (
        <span style={{
          fontSize: 11, color: "rgba(11,11,13,0.45)",
          marginLeft: secondary ? 8 : "auto",
        }}>{hint}</span>
      )}
    </div>
  );
}

function statusTone(s: TalentParticipationRow["status"]): { fg: string; bg: string } {
  switch (s) {
    case "Accepted":
    case "Confirmed":
      return { fg: "#1A7348", bg: "rgba(26,115,72,0.10)" };
    case "Hold":
      return { fg: "#8A6F1A", bg: "rgba(138,111,26,0.10)" };
    case "Declined":
    case "Removed":
      return { fg: "rgba(11,11,13,0.45)", bg: "rgba(11,11,13,0.05)" };
    case "Invited":
    default:
      return { fg: "#2B3FA3", bg: "rgba(43,63,163,0.07)" };
  }
}
