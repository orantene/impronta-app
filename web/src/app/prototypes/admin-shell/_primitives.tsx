"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  COLORS,
  FONTS,
  PLAN_META,
  ROLE_META,
  TALENT_STATE_TONE,
  type Plan,
  type Role,
  type TalentProfile,
} from "./_state";

// ─── Inline icons (kept tiny + neutral) ──────────────────────────────

export function Icon({
  name,
  size = 14,
  stroke = 1.6,
  color = "currentColor",
}: {
  name:
    | "arrow-right"
    | "chevron-right"
    | "chevron-down"
    | "x"
    | "lock"
    | "check"
    | "plus"
    | "sparkle"
    | "external"
    | "search"
    | "filter"
    | "info"
    | "user"
    | "team"
    | "globe"
    | "palette"
    | "credit"
    | "settings"
    | "calendar"
    | "mail"
    | "bolt"
    | "circle";
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12l5 5 9-11" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M4 5h16M7 12h10M10 19h4" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v.01M12 12v4" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3.5" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3 19c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5" />
          <path d="M15 19c0.6-2 2-3 3.5-3" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
      );
    case "palette":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1-0.5-1.5 0-2 0.5-0.5 1.5-0.5 2.5-0.5h1A3.5 3.5 0 0 0 21 13c0-5-4-10-9-10z" />
          <circle cx="7.5" cy="11" r="1" fill={color} stroke="none" />
          <circle cx="10" cy="7.5" r="1" fill={color} stroke="none" />
          <circle cx="15" cy="7.5" r="1" fill={color} stroke="none" />
        </svg>
      );
    case "credit":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18M7 15h3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5l1.5-1.5M17 7l1.5-1.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 7 9-7" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

// ─── Atoms ───────────────────────────────────────────────────────────

export function CapsLabel({
  children,
  color,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: color ?? COLORS.inkMuted,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Bullet() {
  return (
    <span
      style={{ color: COLORS.inkDim, fontSize: 12, padding: "0 6px" }}
      aria-hidden
    >
      ·
    </span>
  );
}

export function StatDot({
  tone = "ink",
  size = 6,
}: {
  tone?: "ink" | "amber" | "green" | "dim" | "red";
  size?: number;
}) {
  const palette: Record<string, string> = {
    ink: COLORS.ink,
    amber: COLORS.amber,
    green: COLORS.green,
    dim: COLORS.inkDim,
    red: COLORS.red,
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: palette[tone],
      }}
      aria-hidden
    />
  );
}

export function PlanChip({
  plan,
  variant = "soft",
}: {
  plan: Plan;
  variant?: "soft" | "outline" | "solid";
}) {
  const meta = PLAN_META[plan];
  const styles: Record<typeof variant, CSSProperties> = {
    soft: {
      background: plan === "free" ? "rgba(11,11,13,0.05)" : "rgba(11,11,13,0.06)",
      color: COLORS.ink,
      border: "1px solid transparent",
    },
    outline: {
      background: "transparent",
      color: COLORS.inkMuted,
      border: `1px solid ${COLORS.border}`,
    },
    solid: {
      background: COLORS.ink,
      color: "#fff",
      border: "1px solid transparent",
    },
  };
  return (
    <span
      style={{
        ...styles[variant],
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: "3px 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return (
    <span
      style={{
        background: "rgba(11,11,13,0.05)",
        color: COLORS.ink,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        padding: "3px 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {ROLE_META[role].label}
    </span>
  );
}

export function ReadOnlyChip() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        color: COLORS.inkDim,
        border: `1px solid ${COLORS.border}`,
        fontFamily: FONTS.body,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 0.4,
        padding: "2px 7px",
        borderRadius: 999,
        textTransform: "uppercase",
      }}
    >
      <Icon name="lock" size={9} stroke={2} />
      Read only
    </span>
  );
}

export function StateChip({
  state,
  label,
}: {
  state: TalentProfile["state"];
  label: string;
}) {
  const tone = TALENT_STATE_TONE[state];
  const map: Record<typeof tone, { bg: string; fg: string; dot: string }> = {
    ink: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink, dot: COLORS.ink },
    amber: { bg: "rgba(198,138,30,0.10)", fg: "#7E5612", dot: COLORS.amber },
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42", dot: COLORS.green },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted, dot: COLORS.inkDim },
  };
  const c = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.2,
        padding: "3px 8px 3px 7px",
        borderRadius: 999,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: c.dot,
        }}
      />
      {label}
    </span>
  );
}

export function IconChip({
  children,
  tone = "neutral",
  size = 32,
}: {
  children: ReactNode;
  tone?: "neutral" | "warm" | "ink";
  size?: number;
}) {
  const map: Record<typeof tone, CSSProperties> = {
    neutral: { background: "rgba(11,11,13,0.04)", color: COLORS.ink },
    warm: { background: COLORS.cream, color: COLORS.ink },
    ink: { background: COLORS.ink, color: "#fff" },
  };
  return (
    <span
      style={{
        ...map[tone],
        width: size,
        height: size,
        borderRadius: 9,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

export function Affordance({
  label = "Open",
  arrow = true,
  color,
}: {
  label?: string;
  arrow?: boolean;
  color?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: FONTS.body,
        fontSize: 12,
        fontWeight: 500,
        color: color ?? COLORS.inkMuted,
        letterSpacing: 0.1,
      }}
    >
      {label}
      {arrow && <Icon name="arrow-right" size={12} stroke={1.8} />}
    </span>
  );
}

// ─── Card primitives ─────────────────────────────────────────────────

export type CardClickHandler = () => void;

type CardBase = {
  onClick?: CardClickHandler;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
  fullHeight?: boolean;
};

function CardFrame({
  onClick,
  children,
  style,
  className,
  ariaLabel,
  fullHeight,
  variant = "primary",
}: CardBase & { variant?: "primary" | "secondary" | "status" | "locked" | "starter" }) {
  const variants: Record<typeof variant, CSSProperties> = {
    primary: {
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
    },
    secondary: {
      background: COLORS.card,
      border: `1px solid ${COLORS.borderSoft}`,
    },
    status: {
      background: COLORS.card,
      border: `1px solid ${COLORS.borderSoft}`,
    },
    locked: {
      background: "rgba(11,11,13,0.015)",
      border: `1px dashed rgba(11,11,13,0.16)`,
    },
    starter: {
      background: COLORS.cream,
      border: `1px solid rgba(184,134,11,0.18)`,
    },
  };
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={ariaLabel}
      className={className}
      style={{
        ...variants[variant],
        textAlign: "left",
        padding: 0,
        margin: 0,
        cursor: interactive ? "pointer" : "default",
        borderRadius: 14,
        width: "100%",
        height: fullHeight ? "100%" : undefined,
        display: "block",
        transition: "border-color .15s, transform .15s, box-shadow .15s",
        outline: "none",
        font: "inherit",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!interactive) return;
        const t = e.currentTarget;
        if (variant === "locked") {
          t.style.borderColor = "rgba(11,11,13,0.30)";
        } else if (variant === "starter") {
          t.style.borderColor = "rgba(184,134,11,0.32)";
        } else {
          t.style.borderColor = "rgba(11,11,13,0.18)";
          t.style.boxShadow = "0 6px 20px -10px rgba(11,11,13,0.18)";
        }
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget;
        t.style.borderColor = (variants[variant].border as string).split(" ").slice(2).join(" ").replace("solid ", "").replace("dashed ", "");
        t.style.boxShadow = "none";
        // restore by re-setting explicitly
        if (variant === "primary") t.style.border = `1px solid ${COLORS.border}`;
        else if (variant === "locked") t.style.border = `1px dashed rgba(11,11,13,0.16)`;
        else if (variant === "starter") t.style.border = `1px solid rgba(184,134,11,0.18)`;
        else t.style.border = `1px solid ${COLORS.borderSoft}`;
      }}
    >
      {children}
    </button>
  );
}

export function PrimaryCard({
  title,
  description,
  icon,
  meta,
  affordance = "Open",
  onClick,
  fullHeight,
  footer,
  badge,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  affordance?: string;
  onClick?: CardClickHandler;
  fullHeight?: boolean;
  footer?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <CardFrame onClick={onClick} variant="primary" fullHeight={fullHeight}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {icon && <IconChip>{icon}</IconChip>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <h3
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 19,
                  fontWeight: 500,
                  letterSpacing: -0.2,
                  color: COLORS.ink,
                  margin: 0,
                  lineHeight: 1.25,
                }}
              >
                {title}
              </h3>
              {badge}
            </div>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.inkMuted,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div style={{ flex: 1 }}>{children}</div>}
        {(meta || footer || onClick) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: "auto",
              paddingTop: meta || footer ? 10 : 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.inkMuted, fontSize: 12 }}>
              {meta}
            </div>
            {footer ?? (onClick && <Affordance label={affordance} />)}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

export function SecondaryCard({
  title,
  description,
  meta,
  affordance = "Open",
  onClick,
  children,
  fullHeight,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  affordance?: string;
  onClick?: CardClickHandler;
  children?: ReactNode;
  fullHeight?: boolean;
}) {
  return (
    <CardFrame onClick={onClick} variant="secondary" fullHeight={fullHeight}>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        <div>
          <h3
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: -0.05,
              color: COLORS.ink,
              margin: 0,
              lineHeight: 1.35,
            }}
          >
            {title}
          </h3>
          {description && (
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.inkMuted,
                margin: "4px 0 0",
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>
        {children && <div style={{ flex: 1 }}>{children}</div>}
        {(meta || onClick) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: "auto",
              paddingTop: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.inkMuted, fontSize: 11.5 }}>
              {meta}
            </div>
            {onClick && <Affordance label={affordance} />}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

export function StatusCard({
  value,
  label,
  caption,
  onClick,
  tone,
}: {
  value: string | number;
  label: string;
  caption?: string;
  onClick?: CardClickHandler;
  tone?: "ink" | "amber" | "green" | "dim";
}) {
  const dotTone = tone ?? "dim";
  return (
    <CardFrame onClick={onClick} variant="status">
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatDot tone={dotTone} size={6} />
          <CapsLabel>{label}</CapsLabel>
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 32,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: -0.6,
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        {caption && (
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
            }}
          >
            {caption}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

export function LockedCard({
  title,
  description,
  requiredPlan,
  onClick,
  affordance = "See what's included",
  fullHeight,
}: {
  title: string;
  description?: string;
  requiredPlan: Plan;
  onClick?: CardClickHandler;
  affordance?: string;
  fullHeight?: boolean;
}) {
  return (
    <CardFrame onClick={onClick} variant="locked" fullHeight={fullHeight}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "rgba(11,11,13,0.04)",
              border: `1px solid ${COLORS.border}`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.inkDim,
              flexShrink: 0,
            }}
          >
            <Icon name="lock" size={14} stroke={1.6} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <h3
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 18,
                  fontWeight: 500,
                  color: COLORS.inkMuted,
                  margin: 0,
                  lineHeight: 1.25,
                }}
              >
                {title}
              </h3>
            </div>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.inkDim,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: "auto",
            paddingTop: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CapsLabel color={COLORS.inkDim}>On {PLAN_META[requiredPlan].label}</CapsLabel>
          </div>
          {onClick && <Affordance label={affordance} color={COLORS.inkMuted} />}
        </div>
      </div>
    </CardFrame>
  );
}

export function CompactLockedCard({
  title,
  requiredPlan,
  onClick,
}: {
  title: string;
  requiredPlan: Plan;
  onClick?: CardClickHandler;
}) {
  return (
    <CardFrame onClick={onClick} variant="locked">
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="lock" size={12} stroke={1.6} color={COLORS.inkDim} />
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.inkMuted,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
        <PlanChip plan={requiredPlan} variant="outline" />
      </div>
    </CardFrame>
  );
}

export function StarterCard({
  title,
  subtitle,
  children,
  onPrimary,
  primaryLabel,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  onPrimary?: () => void;
  primaryLabel?: string;
}) {
  return (
    <div
      style={{
        background: COLORS.cream,
        border: `1px solid rgba(184,134,11,0.18)`,
        borderRadius: 16,
        padding: 22,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(184,134,11,0.14)",
            color: COLORS.goldDeep,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={16} stroke={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: 500,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: -0.3,
              lineHeight: 1.2,
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 13.5,
                color: COLORS.inkMuted,
                margin: "4px 0 0",
                lineHeight: 1.55,
                maxWidth: 640,
              }}
            >
              {subtitle}
            </p>
          )}
          {children && <div style={{ marginTop: 14 }}>{children}</div>}
          {onPrimary && primaryLabel && (
            <div style={{ marginTop: 16 }}>
              <PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MoreWithSection({
  plan,
  title,
  children,
}: {
  plan: Plan;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CapsLabel>{title ?? `More with ${PLAN_META[plan].label}`}</CapsLabel>
          <PlanChip plan={plan} variant="outline" />
        </div>
        <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkDim }}>
          {PLAN_META[plan].theme}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 10,
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────

export function PrimaryButton({
  onClick,
  children,
  type = "button",
  size = "md",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  type?: "button" | "submit";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13 },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: COLORS.ink,
        color: "#fff",
        border: "1px solid transparent",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        letterSpacing: 0.1,
        transition: "background .15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "#1d1d20";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = COLORS.ink;
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  onClick,
  children,
  size = "md",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: "#fff",
        color: COLORS.ink,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color .15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = "rgba(11,11,13,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  onClick,
  children,
  size = "md",
}: {
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "6px 10px", fontSize: 12.5 },
    md: { padding: "8px 12px", fontSize: 13 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: "transparent",
        color: COLORS.inkMuted,
        border: "1px solid transparent",
        borderRadius: 8,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(11,11,13,0.04)";
        e.currentTarget.style.color = COLORS.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = COLORS.inkMuted;
      }}
    >
      {children}
    </button>
  );
}

// ─── DrawerShell ─────────────────────────────────────────────────────
// Resizable + size-mode-aware. Three preset sizes (compact / half / full)
// switchable from header buttons; a draggable left edge lets users fine-tune.

export type DrawerSize = "compact" | "half" | "full";

const DRAWER_SIZE_PX: Record<DrawerSize, (vw: number) => number> = {
  compact: () => 520,
  half: (vw) => Math.round(vw * 0.5),
  full: (vw) => Math.round(vw * 0.92),
};

export function DrawerShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
  defaultSize = "compact",
  resizable = true,
  toolbar,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  defaultSize?: DrawerSize;
  resizable?: boolean;
  /** Optional extra header content (e.g., status chips) shown next to the title. */
  toolbar?: ReactNode;
}) {
  const [size, setSize] = useState<DrawerSize>(defaultSize);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  // Reset size when drawer reopens (so a fullscreen leftover doesn't bleed in)
  useEffect(() => {
    if (open) {
      setSize(defaultSize);
      setCustomWidth(null);
    }
  }, [open, defaultSize]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Drag-to-resize from the left edge
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.min(
        Math.max(window.innerWidth - e.clientX, 380),
        Math.round(window.innerWidth * 0.96),
      );
      setCustomWidth(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  // Resolve the actual rendered width
  const resolvedWidth = (() => {
    if (typeof window === "undefined") return width;
    if (customWidth) return customWidth;
    if (size === "compact") return Math.max(width, 380);
    return DRAWER_SIZE_PX[size](window.innerWidth);
  })();

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.42)",
          backdropFilter: "blur(2px)",
          zIndex: 60,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .2s ease",
        }}
      />
      {/* panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100dvh",
          width: resolvedWidth,
          maxWidth: "96vw",
          background: COLORS.surface,
          borderLeft: `1px solid ${COLORS.border}`,
          zIndex: 61,
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: dragging
            ? "none"
            : "transform .25s cubic-bezier(.4,.0,.2,1), width .2s cubic-bezier(.4,.0,.2,1)",
          boxShadow: open ? "0 30px 60px -20px rgba(11,11,13,0.45)" : "none",
        }}
      >
        {/* drag handle on the left edge */}
        {resizable && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            aria-label="Resize drawer"
            role="separator"
            style={{
              position: "absolute",
              top: 0,
              left: -3,
              width: 6,
              height: "100%",
              cursor: "ew-resize",
              zIndex: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(11,11,13,0.06)";
            }}
            onMouseLeave={(e) => {
              if (!dragging) e.currentTarget.style.background = "transparent";
            }}
          />
        )}
        <header
          style={{
            padding: "16px 22px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                  color: COLORS.ink,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h2>
              {toolbar}
            </div>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.inkMuted,
                  margin: "4px 0 0",
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {resizable && (
              <div
                style={{
                  display: "inline-flex",
                  background: "rgba(11,11,13,0.04)",
                  borderRadius: 8,
                  padding: 2,
                  marginRight: 6,
                }}
              >
                {(["compact", "half", "full"] as DrawerSize[]).map((s) => {
                  const active = (customWidth === null && size === s);
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        setCustomWidth(null);
                        setSize(s);
                      }}
                      title={
                        s === "compact"
                          ? "Side drawer"
                          : s === "half"
                            ? "Half-page"
                            : "Full-page"
                      }
                      aria-label={`${s} size`}
                      style={{
                        background: active ? "#fff" : "transparent",
                        boxShadow: active
                          ? "0 1px 3px rgba(11,11,13,0.10)"
                          : "none",
                        border: "none",
                        padding: "5px 8px",
                        borderRadius: 6,
                        cursor: "pointer",
                        color: active ? COLORS.ink : COLORS.inkMuted,
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      <SizeIcon variant={s} />
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: COLORS.inkMuted,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.borderSoft;
                e.currentTarget.style.color = COLORS.inkMuted;
              }}
            >
              <Icon name="x" size={14} stroke={1.8} />
            </button>
          </div>
        </header>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px 24px",
          }}
        >
          {children}
        </div>
        {footer && (
          <footer
            style={{
              padding: "14px 22px",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}

function SizeIcon({ variant }: { variant: DrawerSize }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
  } as const;
  if (variant === "compact") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <line x1="10.5" y1="3" x2="10.5" y2="13" />
      </svg>
    );
  }
  if (variant === "half") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <line x1="8" y1="3" x2="8" y2="13" />
      </svg>
    );
  }
  // full
  return (
    <svg {...common}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
    </svg>
  );
}

// ─── ModalShell ──────────────────────────────────────────────────────

export function ModalShell({
  open,
  onClose,
  children,
  width = 540,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.50)",
        backdropFilter: "blur(3px)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width,
          maxWidth: "96vw",
          maxHeight: "92dvh",
          background: COLORS.card,
          borderRadius: 16,
          boxShadow: "0 30px 80px -20px rgba(11,11,13,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Field group / row helpers (shared by drawers) ───────────────────

export function FieldRow({
  label,
  children,
  hint,
  optional,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label
          style={{
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: 0.1,
          }}
        >
          {label}
        </label>
        {optional && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 11,
              color: COLORS.inkDim,
            }}
          >
            Optional
          </span>
        )}
      </div>
      {children}
      {hint && (
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

export function TextInput({
  defaultValue,
  placeholder,
  prefix,
  suffix,
  type = "text",
}: {
  defaultValue?: string;
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  type?: "text" | "email" | "url";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {prefix && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            background: "rgba(11,11,13,0.03)",
            borderRight: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
          }}
        >
          {prefix}
        </span>
      )}
      <input
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: "9px 12px",
          fontFamily: FONTS.body,
          fontSize: 13.5,
          color: COLORS.ink,
          background: "transparent",
          border: "none",
          outline: "none",
        }}
      />
      {suffix && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            background: "rgba(11,11,13,0.03)",
            borderLeft: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

export function TextArea({
  defaultValue,
  placeholder,
  rows = 4,
}: {
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      defaultValue={defaultValue}
      placeholder={placeholder}
      rows={rows}
      style={{
        padding: "9px 12px",
        fontFamily: FONTS.body,
        fontSize: 13.5,
        color: COLORS.ink,
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        outline: "none",
        resize: "vertical",
        lineHeight: 1.55,
      }}
    />
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      role="switch"
      aria-checked={on}
      aria-label={label}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? COLORS.ink : "rgba(11,11,13,0.16)",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "background .15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return (
      <div
        style={{
          height: 1,
          background: COLORS.borderSoft,
          margin: "16px 0",
        }}
      />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "20px 0 12px",
      }}
    >
      <CapsLabel>{label}</CapsLabel>
      <div style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
    </div>
  );
}

// ─── Toast host ──────────────────────────────────────────────────────

export function ToastHost({ toasts }: { toasts: { id: number; message: string }[] }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 80,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: COLORS.ink,
            color: "#fff",
            padding: "10px 14px",
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 13,
            boxShadow: "0 12px 30px -10px rgba(11,11,13,0.5)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            animation: "tulalaToastIn .18s ease",
          }}
        >
          <Icon name="check" size={14} stroke={2} />
          {t.message}
        </div>
      ))}
      <style>{`
        @keyframes tulalaToastIn {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────

export function Avatar({
  initials,
  size = 32,
  emoji,
  tone = "neutral",
}: {
  initials?: string;
  size?: number;
  emoji?: string;
  tone?: "neutral" | "ink" | "warm";
}) {
  const tones: Record<typeof tone, CSSProperties> = {
    neutral: { background: "rgba(11,11,13,0.06)", color: COLORS.ink },
    ink: { background: COLORS.ink, color: "#fff" },
    warm: { background: COLORS.cream, color: COLORS.ink },
  };
  return (
    <span
      style={{
        ...tones[tone],
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.body,
        fontSize: Math.round(size * 0.4),
        fontWeight: 600,
        letterSpacing: 0.3,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {emoji ?? initials}
    </span>
  );
}
