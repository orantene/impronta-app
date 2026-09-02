"use client";

import { COLORS } from "@/components/admin/shell/internal/state/fixtures";
import { SUPPORT_AGENT } from "@/lib/support/support-persona";

/**
 * The face a customer sees on support replies.
 *
 * Deliberately an ILLUSTRATION, not a photograph. Inventing a headshot for a
 * support agent who does not exist would present a fabricated person as real,
 * and a customer who later meets the actual human has been misled. An
 * illustrated avatar reads as an illustration and nobody is deceived.
 *
 * When there is a real photo of the real person, set `SUPPORT_AGENT.photoUrl`
 * and it replaces the illustration everywhere at once.
 *
 * The drawing is warm rather than corporate: soft shoulders, a slight smile,
 * eyes that sit high in the face. Those are the cues that read as "a person is
 * here" at 32px, which is the whole job of this component.
 */
export function SupportAgentAvatar({
  size = 32,
  online = false,
  title,
}: {
  size?: number;
  /** Renders the presence dot. Only pass true when presence is actually known. */
  online?: boolean;
  title?: string;
}) {
  const label = title ?? SUPPORT_AGENT.name;
  const ring = Math.max(2, Math.round(size * 0.075));

  return (
    <span
      style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
      // The name is already adjacent in every placement, so the image itself is
      // decorative — announcing it again just makes screen readers repeat.
      aria-hidden={title ? undefined : true}
      title={label}
    >
      {SUPPORT_AGENT.photoUrl ? (
        <img
          src={SUPPORT_AGENT.photoUrl}
          alt={label}
          width={size}
          height={size}
          style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          role="img"
          aria-label={title ? label : undefined}
          style={{ display: "block", borderRadius: "50%" }}
        >
          <defs>
            <linearGradient id="tl-agent-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6E5C99" />
              <stop offset="100%" stopColor={COLORS.royal} />
            </linearGradient>
            <clipPath id="tl-agent-clip">
              <circle cx="32" cy="32" r="32" />
            </clipPath>
          </defs>
          <g clipPath="url(#tl-agent-clip)">
            <circle cx="32" cy="32" r="32" fill="url(#tl-agent-bg)" />
            {/* Shoulders, cropped by the circle so the figure sits in frame. */}
            <path d="M32 39c11.6 0 21 8.2 21 18.4V64H11v-6.6C11 47.2 20.4 39 32 39z" fill="#F7F4EE" />
            {/* Head */}
            <circle cx="32" cy="25" r="13" fill="#F7F4EE" />
            {/* Eyes, set high and wide — the cue that survives at 24px. */}
            <circle cx="27" cy="24" r="1.9" fill="#2A2438" />
            <circle cx="37" cy="24" r="1.9" fill="#2A2438" />
            {/* A slight smile. Any more and it reads as a mascot. */}
            <path
              d="M27.5 29.6c1.3 1.5 3 2.3 4.5 2.3s3.2-.8 4.5-2.3"
              stroke="#2A2438"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </svg>
      )}
      {online ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: Math.round(size * 0.28),
            height: Math.round(size * 0.28),
            borderRadius: "50%",
            background: COLORS.success,
            boxShadow: `0 0 0 ${ring}px ${COLORS.card}`,
          }}
        />
      ) : null}
    </span>
  );
}
