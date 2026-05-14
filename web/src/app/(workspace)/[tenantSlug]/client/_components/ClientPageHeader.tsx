import { type ReactNode } from "react";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
} as const;

/**
 * Unified page header for every client dashboard page.
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  EYEBROW                                  [actions] │
 *   │  Page title                                          │
 *   │  Subtitle/description.                               │
 *   └──────────────────────────────────────────────────────┘
 *
 * Matches the Messages header design (eyebrow + h1 + sub + CTA slot).
 */
export function ClientPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  badge,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Optional inline badge next to title (e.g. unread count). */
  badge?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 18,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
          <div
            style={{
              fontSize: 11,
              color: C.inkMuted,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              fontWeight: 700,
              fontFamily: FONT,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            margin: eyebrow ? "4px 0 0" : "0",
            fontSize: 24,
            color: C.ink,
            letterSpacing: -0.3,
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            lineHeight: 1.15,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {title}
          {badge}
        </h1>
        {subtitle && (
          <p
            style={{
              margin: "6px 0 0",
              maxWidth: 640,
              fontSize: 13,
              lineHeight: 1.5,
              color: C.inkMuted,
              fontFamily: FONT,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

/** Inline badge to render next to a title (e.g. "3 unread"). */
export function HeaderBadge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "success" | "warn" }) {
  const palette = {
    default: { bg: "rgba(11,11,13,0.06)", fg: "#52525B" },
    accent:  { bg: "#1D4ED8", fg: "#fff" },
    success: { bg: "rgba(26,115,72,0.12)", fg: "#0F5132" },
    warn:    { bg: "rgba(138,111,26,0.14)", fg: "#7C5E0A" },
  }[tone];
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: palette.fg,
        background: palette.bg,
        padding: "3px 9px",
        borderRadius: 999,
        letterSpacing: 0,
        fontFamily: FONT,
      }}
    >
      {children}
    </span>
  );
}
