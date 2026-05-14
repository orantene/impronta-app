import type { CSSProperties, ReactNode } from "react";

const FONT = '"Inter", system-ui, sans-serif';

/**
 * Unified status chip used across Today / Inquiries / Bookings / Messages.
 * One palette, one shape, one casing.
 */
const PALETTE: Record<string, { bg: string; fg: string; label: string }> = {
  draft:           { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Draft" },
  submitted:       { bg: "rgba(29,78,216,0.10)",  fg: "#1D4ED8", label: "Submitted" },
  coordination:    { bg: "rgba(29,78,216,0.10)",  fg: "#1D4ED8", label: "In review" },
  offer_pending:   { bg: "rgba(168,85,247,0.10)", fg: "#6D28D9", label: "Offer pending" },
  offer_sent:      { bg: "rgba(168,85,247,0.10)", fg: "#6D28D9", label: "Offer sent" },
  approved:        { bg: "rgba(26,115,72,0.10)",  fg: "#0F5132", label: "Approved" },
  booked:          { bg: "rgba(26,115,72,0.14)",  fg: "#0F5132", label: "Booked" },
  converted:       { bg: "rgba(26,115,72,0.14)",  fg: "#0F5132", label: "Booked" },
  rejected:        { bg: "rgba(239,68,68,0.08)",  fg: "#991B1B", label: "Declined" },
  declined:        { bg: "rgba(239,68,68,0.08)",  fg: "#991B1B", label: "Declined" },
  cancelled:       { bg: "rgba(239,68,68,0.08)",  fg: "#991B1B", label: "Cancelled" },
  expired:         { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Expired" },
  closed:          { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Closed" },
  closed_lost:     { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Closed" },
  archived:        { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Archived" },
};

export function statusPalette(status: string) {
  return PALETTE[status] ?? { bg: "rgba(11,11,13,0.06)", fg: "#52525B", label: status.replace(/_/g, " ") };
}

export function StatusChip({ status, size = "sm" }: { status: string; size?: "xs" | "sm" }) {
  const p = statusPalette(status);
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: size === "xs" ? "2px 7px" : "3px 9px",
    borderRadius: 999,
    background: p.bg,
    color: p.fg,
    fontSize: size === "xs" ? 10 : 10.5,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontFamily: FONT,
    whiteSpace: "nowrap",
    flexShrink: 0,
  };
  return <span style={style}>{p.label}</span>;
}

export function ActionDot({ children }: { children?: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10.5,
        fontWeight: 700,
        color: "#1D4ED8",
        textTransform: "uppercase",
        letterSpacing: 0.3,
        fontFamily: FONT,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1D4ED8" }} />
      {children ?? "Action needed"}
    </span>
  );
}
