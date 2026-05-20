/**
 * PitchOriginCard — context block surfaced inside the Chat tab + Event
 * tab when an inquiry was created from a Pitch.
 *
 * Messages Consolidation Plan v2 — Slice M.
 *
 * Per plan §6, pitches generate inquiries. The first message in the
 * Chat tab on pitch-origin inquiries is implicitly the pitch itself —
 * this card makes it explicit, deep-linkable, and visually distinct
 * from the normal conversation flow.
 */

import Link from "next/link";

type Props = {
  /** Tenant slug for the deep-link path. */
  tenantSlug: string;
  /** Pitch id this inquiry originated from. */
  pitchId: string;
  /** Pitch headline / subject from the pitch row. */
  pitchTitle: string;
  /** Who created the pitch (admin name). */
  pitchAuthor?: string;
  /** When the pitch was sent to the client. */
  pitchSentAt?: string;
  /** Optional 1-line client-facing tagline. */
  pitchTagline?: string;
  /** Compact mode for embed inside Chat — tightens padding. */
  compact?: boolean;
};

export function PitchOriginCard({
  tenantSlug, pitchId, pitchTitle, pitchAuthor, pitchSentAt, pitchTagline, compact,
}: Props) {
  return (
    <div
      data-pitch-origin-card
      style={{
        background: "rgba(43,63,163,0.05)",
        border: "1px solid rgba(43,63,163,0.18)",
        borderRadius: 12,
        padding: compact ? "10px 12px" : "12px 14px",
        fontFamily: '"Inter", system-ui, sans-serif',
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        maxWidth: 520,
        width: "100%",
      }}
    >
      <span aria-hidden style={{
        flexShrink: 0,
        width: 28, height: 28, borderRadius: 8,
        background: "rgba(43,63,163,0.12)",
        color: "#2B3FA3",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7l5-5 5 5-5 5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          <circle cx="7" cy="7" r="1" fill="currentColor"/>
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          color: "#2B3FA3", textTransform: "uppercase",
        }}>
          Originated from a pitch
        </div>
        <div style={{
          fontSize: 13.5, fontWeight: 700, color: "#0B0B0D",
          marginTop: 2, lineHeight: 1.35,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {pitchTitle}
        </div>
        {pitchTagline && !compact && (
          <div style={{
            fontSize: 12, color: "rgba(11,11,13,0.55)",
            marginTop: 4, lineHeight: 1.5,
          }}>
            {pitchTagline}
          </div>
        )}
        <div style={{
          fontSize: 11, color: "rgba(11,11,13,0.45)", marginTop: 6,
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        }}>
          {pitchAuthor && <span>by {pitchAuthor}</span>}
          {pitchAuthor && pitchSentAt && <span aria-hidden style={{ opacity: 0.4 }}>·</span>}
          {pitchSentAt && <span>{pitchSentAt}</span>}
        </div>
      </div>
      <Link
        href={`/${tenantSlug}/admin/pitches/${pitchId}`}
        style={{
          flexShrink: 0,
          padding: "5px 10px", borderRadius: 999,
          background: "rgba(43,63,163,0.10)",
          color: "#2B3FA3",
          fontSize: 11, fontWeight: 700,
          textDecoration: "none",
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        View pitch →
      </Link>
    </div>
  );
}

/**
 * isPitchOriginInquiry — small helper. Inquiries created from a pitch
 * carry a `pitch_id` on the inquiry row (see existing pitch action
 * wiring at web/src/app/(workspace)/[tenantSlug]/admin/pitches/
 * actions.ts).
 */
export function isPitchOriginInquiry(inquiry: { pitch_id?: string | null }): boolean {
  return !!inquiry.pitch_id;
}
