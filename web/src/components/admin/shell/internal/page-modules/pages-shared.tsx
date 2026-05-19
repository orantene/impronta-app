"use client";

import type { ReactNode } from "react";
import { CapsLabel, Icon, PrimaryButton, StatusCard } from "../primitives";
import { COLORS, FONTS } from "../state";


// ════════════════════════════════════════════════════════════════════
// Page header shared
// ════════════════════════════════════════════════════════════════════

/**
 * Premium stat strip — replaces the 4-up StatusCard grid that was
 * eating ~440px showing 4 numbers. Single white card with 4 inline
 * tappable cells, separated by hairlines. Each cell has a tone dot,
 * compact label, big tabular number. Mobile collapses to 2x2.
 */
export function WorkspaceStatStrip({ items }: {
  items: { label: string; value: number; tone: string; onClick: () => void; demo?: boolean }[];
}) {
  return (
    <div data-tulala-stat-strip style={{
      background: "#fff", borderRadius: 12,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
      display: "grid",
      gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      overflow: "hidden",
    }}>
      <style>{`
        @media (max-width: 640px) {
          [data-tulala-stat-strip] { grid-template-columns: 1fr 1fr !important; }
          [data-tulala-stat-strip] > button { border-bottom: 1px solid ${COLORS.borderSoft} !important; }
          [data-tulala-stat-strip] > button:nth-last-child(-n+2) { border-bottom: none !important; }
          [data-tulala-stat-strip] > button:nth-child(2n) { border-right: none !important; }
        }
      `}</style>
      {items.map((it, i) => (
        <button key={it.label} type="button" onClick={it.onClick} style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: "12px 14px", textAlign: "left",
          borderRight: i < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
          fontFamily: FONTS.body,
          position: "relative",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.025)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {it.demo && <DemoBadge />}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: it.tone }} />
            <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 500 }}>{it.label}</span>
          </div>
          <div style={{
            fontFamily: FONTS.display, fontSize: 22, fontWeight: 700,
            color: COLORS.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>{it.value}</div>
        </button>
      ))}
    </div>
  );
}

/**
 * Muted "Demo" pill — top-right of any metric card whose value is mock
 * (no real bridge wiring yet). Honest signal to operators that the
 * surrounding number is not derived from their tenant. Tooltip points
 * the dev story forward without making it look broken.
 */
function DemoBadge() {
  return (
    <span
      title="Wire-up pending. Coming soon."
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        padding: "1px 5px",
        fontFamily: FONTS.body,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 0.2,
        color: COLORS.inkDim,
        background: COLORS.surfaceAlt,
        borderRadius: 4,
        lineHeight: 1.4,
        pointerEvents: "auto",
      }}
    >
      demo
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  onBack,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Mobile-only back arrow (#1). Pass label for the previous context. */
  onBack?: () => void;
}) {
  return (
    <>
    <style>{`
      @media (max-width: 680px) {
        [data-tulala-page-back] { display: flex !important; }
        /* Mobile page-header compaction (system-wide).
           Goal: header = navigation/context, never a hero section.
             - title shrinks to 19px (was 30px)
             - eyebrow hidden (it almost always repeats the title)
             - subtitle hidden (rarely earns its space on mobile)
             - bottom margin 10px (was 24px)
           This propagates to every PageHeader caller automatically. */
        [data-tulala-page-header] [data-tulala-h1] {
          font-size: 19px !important;
          line-height: 1.2 !important;
          letter-spacing: -0.25px !important;
          font-weight: 700 !important;
        }
        [data-tulala-page-header] {
          margin-bottom: 10px !important;
          gap: 8px !important;
          align-items: baseline !important;
        }
        [data-tulala-page-header] [data-tulala-page-eyebrow] { display: none !important; }
        [data-tulala-page-header] p { display: none !important; }
        [data-tulala-page-header-actions] {
          flex-shrink: 0 !important;
        }
      }
    `}</style>
    <div
      data-tulala-page-header
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Legacy back button (rare — kept for screens that pass onBack) */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            data-tulala-page-back
            style={{
              display: "none",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              padding: "0 0 8px",
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              color: COLORS.inkMuted,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            <span aria-hidden style={{ fontSize: 14 }}>←</span>
            Back
          </button>
        )}
        {eyebrow && (
          <div data-tulala-page-eyebrow style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <h1
          data-tulala-h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: COLORS.ink,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.inkMuted,
              margin: "4px 0 0",
              lineHeight: 1.5,
              maxWidth: 640,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div
          data-tulala-page-header-actions
          style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}
        >
          {actions}
        </div>
      )}
    </div>
    </>
  );
}

export function Grid({
  children,
  cols = "auto",
}: {
  children: ReactNode;
  cols?: "auto" | "2" | "3" | "4";
}) {
  const colMap = {
    auto: "repeat(auto-fit, minmax(280px, 1fr))",
    "2": "repeat(2, 1fr)",
    "3": "repeat(3, 1fr)",
    "4": "repeat(4, 1fr)",
  };
  return (
    <div
      data-tulala-grid={cols}
      style={{
        display: "grid",
        gridTemplateColumns: colMap[cols],
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// OVERVIEW
// ════════════════════════════════════════════════════════════════════

/**
 * Audit #49 — Today's focus card. One prominent banner at the top of
 * the workspace overview with the single most urgent line of the day.
 * Reduces "where do I start" anxiety by surfacing the answer above
 * the metric grid.
 */
export function TodaysFocusCard({
  pendingClients,
  draftCount,
  nextBookingLabel,
  oldestWaitDays,
  onOpen,
}: {
  pendingClients: number;
  draftCount: number;
  nextBookingLabel: string | null;
  oldestWaitDays: number;
  onOpen: () => void;
}) {
  // Build a one-line action priority — most urgent thing wins.
  let title = "All caught up — nothing urgent today.";
  let body = nextBookingLabel
    ? `Next up: ${nextBookingLabel}. Use the quiet time to refine a draft or prep call sheets.`
    : "Use the next quiet hour to refine a draft or chase a hold.";
  let primary: { label: string; onClick: () => void } | null = null;
  if (pendingClients > 0) {
    title = `${pendingClients} ${pendingClients === 1 ? "inquiry is" : "inquiries are"} waiting for a client decision.`;
    const waitHint = oldestWaitDays >= 2 ? ` Oldest wait: ${oldestWaitDays}d — follow up before it goes cold.` : " Send a nudge or share polaroids to move it forward.";
    body = `The ball is in their court.${waitHint}`;
    primary = { label: "Open today's pulse", onClick: onOpen };
  } else if (draftCount > 0) {
    title = `${draftCount} ${draftCount === 1 ? "draft hasn't" : "drafts haven't"} been sent yet.`;
    body = "Finish the brief and send while the client's still warm.";
    primary = { label: "Open drafts", onClick: onOpen };
  }
  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, ${COLORS.accentSoft} 0%, #fff 60%)`,
        border: `1px solid ${COLORS.accent}`,
        borderRadius: 14,
        padding: "16px 20px",
        marginBottom: 16,
        fontFamily: FONTS.body,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: "#fff",
          border: `1px solid ${COLORS.accent}`,
          color: COLORS.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 0 0 4px ${COLORS.accentSoft}`,
        }}
      >
        <Icon name="bolt" size={17} stroke={1.7} color={COLORS.accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.accent,
            marginBottom: 3,
          }}
        >
          Today's focus
        </div>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            fontWeight: 500,
            color: COLORS.ink,
            margin: 0,
            letterSpacing: -0.2,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 12.5, color: COLORS.inkMuted, margin: "4px 0 0", lineHeight: 1.5 }}>
          {body}
          {nextBookingLabel && <span> · {nextBookingLabel}.</span>}
        </p>
      </div>
      {primary && (
        <PrimaryButton size="sm" onClick={primary.onClick}>
          {primary.label}
        </PrimaryButton>
      )}
    </section>
  );
}
