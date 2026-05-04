"use client";

/**
 * TrustBadge — inline chip that shows a client's trust tier.
 *
 * Four tiers: basic | verified | silver | gold
 * Higher trust → better access opportunities for the client.
 *
 * Display rules (per docs/client-trust-and-contact-controls.md):
 *   - Render on: talent inbox, inquiry workspace sidebar, client profile drawer,
 *     admin Clients table.
 *   - NEVER render on: public roster, booking detail page, public talent page.
 *   - Framing: use tier labels (Basic / Verified / Silver / Gold), never "paid"
 *     or "subscriber". Copy emphasises access, not payment.
 *
 * Usage:
 *   <TrustBadge level="gold" />
 *   <TrustBadge level="verified" size="sm" />
 *   <TrustBadge level={null} />   ← renders nothing (client has no trust record)
 */

export type ClientTrustLevel = "basic" | "verified" | "silver" | "gold";

const TIER_META: Record<
  ClientTrustLevel,
  { label: string; dot: string; bg: string; color: string; ring: string }
> = {
  basic: {
    label: "Basic",
    dot: "rgba(11,11,13,0.30)",
    bg: "rgba(11,11,13,0.05)",
    color: "rgba(11,11,13,0.55)",
    ring: "rgba(11,11,13,0.10)",
  },
  verified: {
    label: "Verified",
    dot: "#2E7D5B",
    bg: "rgba(46,125,91,0.08)",
    color: "#1A5E3C",
    ring: "rgba(46,125,91,0.15)",
  },
  silver: {
    label: "Silver",
    dot: "#5C7A99",
    bg: "rgba(92,122,153,0.10)",
    color: "#2D4F70",
    ring: "rgba(92,122,153,0.18)",
  },
  gold: {
    label: "Gold",
    dot: "#B07D2A",
    bg: "rgba(176,125,42,0.10)",
    color: "#7A5010",
    ring: "rgba(176,125,42,0.18)",
  },
};

const SIZE_STYLES = {
  sm: { padding: "2px 7px", fontSize: 10, dotSize: 5, gap: 4, borderRadius: 999 },
  md: { padding: "3px 9px", fontSize: 11, dotSize: 6, gap: 5, borderRadius: 999 },
};

export function TrustBadge({
  level,
  size = "md",
  showLabel = true,
}: {
  level: ClientTrustLevel | null | undefined;
  size?: "sm" | "md";
  /** When false, renders only the coloured dot — useful in dense tables. */
  showLabel?: boolean;
}) {
  if (!level) return null;

  const meta = TIER_META[level];
  const sz = SIZE_STYLES[size];

  if (!showLabel) {
    return (
      <span
        title={`${meta.label} client`}
        aria-label={`Trust level: ${meta.label}`}
        style={{
          display: "inline-block",
          width: sz.dotSize + 4,
          height: sz.dotSize + 4,
          borderRadius: "50%",
          background: meta.bg,
          border: `1.5px solid ${meta.ring}`,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      title={`${meta.label} client — trust level granted by account activity`}
      aria-label={`Trust level: ${meta.label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sz.gap,
        padding: sz.padding,
        borderRadius: sz.borderRadius,
        background: meta.bg,
        border: `1px solid ${meta.ring}`,
        color: meta.color,
        fontSize: sz.fontSize,
        fontWeight: 600,
        fontFamily: '"Inter", system-ui, sans-serif',
        lineHeight: 1,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <span
        aria-hidden
        style={{
          width: sz.dotSize,
          height: sz.dotSize,
          borderRadius: "50%",
          background: meta.dot,
          flexShrink: 0,
        }}
      />
      {meta.label}
    </span>
  );
}
