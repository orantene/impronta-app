/**
 * DemoBadge — tiny pill flagging that a row/card is mock/demo data,
 * not a real DB-backed inquiry. Used in admin Overview list, pipeline
 * cards, and the workspace header when the inquiry is a fixture.
 *
 * Visual: 9px font, muted grey/amber, low-vis but unambiguous. Should
 * not compete with real status pills nearby.
 *
 * Companion to `web/src/lib/fixtures/is-fixture-id.ts` —
 * `isFixtureInquiryId(id)` decides when to render this.
 */

export function DemoBadge({
  compact = false,
  tooltip = "Demo data — not a real inquiry",
}: {
  /** Compact: dot-only (for very dense rows). Default: dot + "Demo" label. */
  compact?: boolean;
  tooltip?: string;
}) {
  if (compact) {
    return (
      <span
        title={tooltip}
        aria-label={tooltip}
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#B07D2A",
          flexShrink: 0,
          opacity: 0.75,
        }}
      />
    );
  }

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        borderRadius: 999,
        background: "rgba(176,125,42,0.10)",
        border: "1px solid rgba(176,125,42,0.20)",
        color: "#7A5010",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        fontFamily: '"Inter", system-ui, sans-serif',
        lineHeight: 1,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: "#B07D2A",
          flexShrink: 0,
        }}
      />
      Demo
    </span>
  );
}
