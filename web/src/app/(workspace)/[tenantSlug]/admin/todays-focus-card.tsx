"use client";

// TodaysFocusCard — top-of-page urgency signal.
// Shows the single most important thing to do right now,
// derived from awaitingClientCount + draftInquiryCount.
// When the queue is quiet, shows the next upcoming booking as a
// lightweight anchor signal.

const C = {
  ink:          "#0B0B0D",
  inkMuted:     "rgba(11,11,13,0.55)",
  accent:       "#0F4F3E",
  accentSoft:   "rgba(15,79,62,0.08)",
  accentBorder: "rgba(15,79,62,0.30)",
  blueSoft:     "rgba(43,95,138,0.06)",
  blueBorder:   "rgba(43,95,138,0.18)",
  blue:         "#2B5F8A",
  white:        "#ffffff",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function TodaysFocusCard({
  awaitingClientCount,
  draftCount,
  oldestWaitDays,
  nextBookingLabel,
  tenantSlug,
}: {
  awaitingClientCount: number;
  draftCount: number;
  /** Days since the oldest coordinator-pending inquiry was created. null = none. */
  oldestWaitDays?: number | null;
  /** Label for the next upcoming confirmed booking. null = no upcoming booking. */
  nextBookingLabel?: string | null;
  tenantSlug: string;
}) {
  const isQuiet = awaitingClientCount === 0 && draftCount === 0;

  // Quiet day + no upcoming booking → hide the card entirely
  if (isQuiet && !nextBookingLabel) return null;

  // Quiet day + next booking → show a calm "up next" variant
  if (isQuiet && nextBookingLabel) {
    return (
      <section
        style={{
          position: "relative",
          background: `linear-gradient(135deg, ${C.blueSoft} 0%, ${C.white} 60%)`,
          border: `1px solid ${C.blueBorder}`,
          borderRadius: 14,
          padding: "14px 20px",
          marginBottom: 16,
          fontFamily: FONT,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: C.white,
            border: `1px solid ${C.blueBorder}`,
            color: C.blue,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 17,
          }}
        >
          📅
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.blue, marginBottom: 2, fontFamily: FONT }}>
            Up next
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1, fontFamily: FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nextBookingLabel}
          </div>
        </div>
        <a
          href={`/${tenantSlug}/admin/bookings`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 30,
            padding: "0 12px",
            borderRadius: 7,
            background: "transparent",
            border: `1px solid ${C.blueBorder}`,
            color: C.blue,
            fontFamily: FONT,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          All bookings →
        </a>
      </section>
    );
  }

  // Urgent queue variant
  let title = "";
  let body = "";
  let href = `/${tenantSlug}/admin/work`;
  let ctaLabel = "Open workflow";

  if (awaitingClientCount > 0) {
    const ageClause = oldestWaitDays != null && oldestWaitDays > 0
      ? ` The oldest has been waiting ${oldestWaitDays} ${oldestWaitDays === 1 ? "day" : "days"}.`
      : "";
    title = `${awaitingClientCount} ${awaitingClientCount === 1 ? "inquiry is" : "inquiries are"} waiting for a client decision.`;
    body = `The ball is in their court. Send a nudge or share polaroids to move it forward.${ageClause}`;
    ctaLabel = "View pipeline";
  } else {
    title = `${draftCount} ${draftCount === 1 ? "draft hasn't" : "drafts haven't"} been sent yet.`;
    body = "Finish the brief and send while the client's still warm.";
    ctaLabel = "Open drafts";
  }

  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, ${C.accentSoft} 0%, ${C.white} 60%)`,
        border: `1px solid ${C.accentBorder}`,
        borderRadius: 14,
        padding: "16px 20px",
        marginBottom: 16,
        fontFamily: FONT,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      {/* Bolt icon */}
      <div
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: C.white,
          border: `1px solid ${C.accentBorder}`,
          color: C.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 0 0 4px ${C.accentSoft}`,
          fontSize: 18,
        }}
      >
        ⚡
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: C.accent,
            marginBottom: 3,
            fontFamily: FONT,
          }}
        >
          Today&apos;s focus
        </div>
        <h2
          style={{
            fontFamily: FONT,
            fontSize: 17,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.2,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 12.5, color: C.inkMuted, margin: "4px 0 0", lineHeight: 1.5, fontFamily: FONT }}>
          {body}
        </p>
      </div>

      <a
        href={href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 32,
          padding: "0 14px",
          borderRadius: 8,
          background: C.accent,
          color: C.white,
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {ctaLabel}
      </a>
    </section>
  );
}
