"use client";

// TodaysFocusCard — top-of-page urgency signal.
// Shows the single most important thing to do right now,
// derived from awaitingClientCount + draftInquiryCount.

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  accentBorder: "rgba(15,79,62,0.30)",
  white:      "#ffffff",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function TodaysFocusCard({
  awaitingClientCount,
  draftCount,
  tenantSlug,
}: {
  awaitingClientCount: number;
  draftCount: number;
  tenantSlug: string;
}) {
  // No action needed — quiet day message
  if (awaitingClientCount === 0 && draftCount === 0) return null;

  let title = "";
  let body = "";
  let href = `/${tenantSlug}/admin/work`;
  let ctaLabel = "Open workflow";

  if (awaitingClientCount > 0) {
    title = `${awaitingClientCount} ${awaitingClientCount === 1 ? "inquiry is" : "inquiries are"} waiting for a client decision.`;
    body = "The ball is in their court. Send a nudge or share polaroids to move it forward.";
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
