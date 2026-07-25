import type { CSSProperties, ReactNode } from "react";

const FONT = '"Inter", system-ui, sans-serif';

/**
 * Unified status chip used across Today / Inquiries / Bookings / Messages.
 * One palette, one shape, one casing.
 */
// i18n note: `label` stays English as the non-UI fallback (and for any caller
// without a translator); `labelKey` is the localized display path. Same additive
// pattern as TRANSACTION_STATUS_LABEL_KEYS in lib/status-labels.ts. The keys
// reuse the already-translated client-facing wording under
// `dashboard.clientInquiries.status*` / `dashboard.clientStatus.*` — this chip
// deliberately says "In review" / "Declined" rather than the admin canon.
const PALETTE: Record<string, { bg: string; fg: string; label: string; labelKey: string }> = {
  draft:           { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Draft",         labelKey: "dashboard.clientInquiries.statusDraft" },
  submitted:       { bg: "rgba(29,78,216,0.10)",  fg: "#1D4ED8", label: "Submitted",     labelKey: "dashboard.clientInquiries.statusSubmitted" },
  coordination:    { bg: "rgba(29,78,216,0.10)",  fg: "#1D4ED8", label: "In review",     labelKey: "dashboard.clientInquiries.statusInReview" },
  offer_pending:   { bg: "rgba(168,85,247,0.10)", fg: "#6D28D9", label: "Offer pending", labelKey: "dashboard.clientInquiries.statusOfferPending" },
  offer_sent:      { bg: "rgba(168,85,247,0.10)", fg: "#6D28D9", label: "Offer sent",    labelKey: "dashboard.clientStatus.offerSent" },
  approved:        { bg: "rgba(26,115,72,0.10)",  fg: "#0F5132", label: "Approved",      labelKey: "dashboard.clientInquiries.statusApproved" },
  booked:          { bg: "rgba(26,115,72,0.14)",  fg: "#0F5132", label: "Booked",        labelKey: "dashboard.clientInquiries.statusBooked" },
  converted:       { bg: "rgba(26,115,72,0.14)",  fg: "#0F5132", label: "Booked",        labelKey: "dashboard.clientInquiries.statusBooked" },
  rejected:        { bg: "rgba(239,68,68,0.08)",  fg: "#991B1B", label: "Declined",      labelKey: "dashboard.clientInquiries.statusDeclined" },
  declined:        { bg: "rgba(239,68,68,0.08)",  fg: "#991B1B", label: "Declined",      labelKey: "dashboard.clientInquiries.statusDeclined" },
  cancelled:       { bg: "rgba(239,68,68,0.08)",  fg: "#991B1B", label: "Cancelled",     labelKey: "dashboard.clientStatus.cancelled" },
  expired:         { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Expired",       labelKey: "dashboard.clientInquiries.statusExpired" },
  closed:          { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Closed",        labelKey: "dashboard.clientInquiries.statusClosed" },
  closed_lost:     { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Closed",        labelKey: "dashboard.clientInquiries.statusClosed" },
  archived:        { bg: "rgba(11,11,13,0.06)",   fg: "#52525B", label: "Archived",      labelKey: "dashboard.clientInquiries.statusArchived" },
};

export function statusPalette(status: string) {
  return (
    PALETTE[status] ?? {
      bg: "rgba(11,11,13,0.06)",
      fg: "#52525B",
      label: status.replace(/_/g, " "),
      labelKey: "",
    }
  );
}

/**
 * Localized chip label. Falls back to the English map when the catalog has no
 * entry (or when no translator is available), so the chip never renders a raw
 * dot-path.
 */
export function statusChipLabel(t: ((key: string) => string) | undefined, status: string): string {
  const p = statusPalette(status);
  if (!t || !p.labelKey) return p.label;
  const resolved = t(p.labelKey);
  return resolved === p.labelKey ? p.label : resolved;
}

export function StatusChip({
  status,
  size = "sm",
  t,
}: {
  status: string;
  size?: "xs" | "sm";
  /** Pass a translator to localize the label (see statusChipLabel). */
  t?: (key: string) => string;
}) {
  const p = statusPalette(status);
  const label = statusChipLabel(t, status);
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
  return <span style={style}>{label}</span>;
}

const ACTION_NEEDED_KEY = "client.today.actionNeeded";

export function ActionDot({
  children,
  t,
}: {
  children?: ReactNode;
  /** Pass a translator to localize the default label. */
  t?: (key: string) => string;
}) {
  const resolved = t ? t(ACTION_NEEDED_KEY) : ACTION_NEEDED_KEY;
  const label = resolved === ACTION_NEEDED_KEY ? "Action needed" : resolved;
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
      {children ?? label}
    </span>
  );
}
