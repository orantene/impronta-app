"use client";

import { Avatar, Icon } from "../../primitives";
import { COLORS, EARNINGS_ROWS, FONTS, PAYMENT_METHOD_META, TRANSITION, useAdminShell, type TalentBooking } from "../../state";



// ════════════════════════════════════════════════════════════════════
// TODAY
// ════════════════════════════════════════════════════════════════════

// Inquiry RI-* → talent conversation cN. Mirrors the client-side map so
// every Today-style click on the talent surface lands inside the new
// MessagesShell with the right thread pinned, instead of opening legacy
// drawers.
export const TALENT_INQUIRY_TO_CONV: Record<string, string> = {
  "RI-201": "c1",  // Mango spring lookbook
  "RI-202": "c3",  // Vogue Italia (talent c3 maps to RI-202 in TALENT_REQUESTS)
  "RI-203": "c2",  // Bvlgari
  "RI-207": "c5",  // H&M past
};


// ─── Talent Today helpers ──────────────────────────────────────────

function paidCurrencyAndTotal(currency: string, total: number) {
  return `${currency}${total.toLocaleString()}`;
}


/**
 * Slim banner above the hero when the talent's profile is below the
 * "Verified visibility" threshold. Indigo soft = info, not urgent.
 * Disappears at >= 80% so it never becomes wallpaper.
 */
export function ProfileCompletenessBanner({
  percent,
  missing,
  onFinish,
}: {
  percent: number;
  missing: string[];
  onFinish: () => void;
}) {
  const remaining = 80 - percent;
  return (
    <button
      type="button"
      onClick={onFinish}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 14px",
        marginBottom: 12,
        background: COLORS.indigoSoft,
        border: `1px solid rgba(91,107,160,0.18)`,
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: "rgba(91,107,160,0.18)",
          color: COLORS.indigoDeep,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="user" size={13} stroke={1.7} />
      </span>
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: COLORS.indigoDeep,
          }}
        >
          {remaining > 0
            ? `${remaining}% from Verified visibility · ${percent}% complete`
            : `${percent}% complete · finish strong`}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.indigoDeep,
            opacity: 0.75,
            marginTop: 1,
          }}
        >
          {missing.length > 0
            ? `${missing.slice(0, 3).join(" · ")}`
            : "A few more fields and agencies favour your profile in pitches."}
        </div>
      </div>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: COLORS.indigoDeep,
          flexShrink: 0,
        }}
      >
        Finish profile →
      </span>
    </button>
  );
}


/**
 * Audit #14 — Today's plan banner. Surfaces TODAY's confirmed shoots
 * inline on the Talent Today page so the talent doesn't have to open
 * Calendar to see what's happening in the next 12 hours. Compact rows
 * with call time, brief, location, and a quick "open" affordance.
 *
 * Forest-soft tint because confirmed bookings are positive ground —
 * this isn't an alert, it's "here's what you committed to."
 */
function TodaysPlanBanner({
  bookings,
  onOpen,
}: {
  bookings: TalentBooking[];
  onOpen: (id: string) => void;
}) {
  if (bookings.length === 0) return null;
  return (
    <section
      style={{
        background: `linear-gradient(135deg, rgba(46,125,91,0.08) 0%, #fff 70%)`,
        border: `1px solid rgba(46,125,91,0.20)`,
        borderRadius: 12,
        padding: "12px 16px",
        marginBottom: 16,
        fontFamily: FONTS.body,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.green,
          }}
        >
          Today
        </span>
        <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
          {bookings.length === 1 ? "1 confirmed shoot" : `${bookings.length} confirmed shoots`}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {bookings.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
              transition: `border-color ${TRANSITION.micro}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.green)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
          >
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: 16,
                fontWeight: 600,
                color: COLORS.green,
                fontVariantNumeric: "tabular-nums",
                width: 56,
                flexShrink: 0,
              }}
            >
              {b.call}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                {b.client} · {b.brief}
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                {b.location}
              </div>
            </div>
            <Icon name="chevron-right" size={12} color={COLORS.inkDim} />
          </button>
        ))}
      </div>
    </section>
  );
}


/**
 * First-session checklist — Day-1 onboarding. Four ordered steps that turn
 * a freshly-claimed talent profile into one inquiries can actually find.
 * Stays compact; rows toggle to a "✓ Done" state when the underlying mock
 * data shows the step is complete.
 *
 * Why a structured checklist (not free-form tips):
 *  - Day-1 talents need a deterministic "now do this" path, not a wall of
 *    suggestions. Numbered, ordered steps reduce decision fatigue.
 *  - Each row routes directly to the drawer/page that completes it — no
 *    hunting through settings.
 *  - The dismiss × is intentional: a power-user who claimed for testing
 *    can clear it; production gates this on a per-user kv pair.
 */
export function FirstSessionChecklist({
  completeness,
  polaroidCount,
  channelsLive,
  payoutSet,
  onProfile,
  onPolaroids,
  onReach,
  onPayouts,
  onDismiss,
}: {
  completeness: number;
  polaroidCount: number;
  channelsLive: number;
  payoutSet: boolean;
  onProfile: () => void;
  onPolaroids: () => void;
  onReach: () => void;
  onPayouts: () => void;
  onDismiss: () => void;
}) {
  const steps: { label: string; description: string; done: boolean; onClick: () => void }[] = [
    {
      label: "Finish your profile basics",
      description: completeness >= 80 ? "Done." : `${completeness}% complete · ${80 - completeness}% to unlock visibility`,
      done: completeness >= 80,
      onClick: onProfile,
    },
    {
      label: "Add at least 6 polaroids",
      description: polaroidCount >= 6 ? "Done — your gallery is ready." : `${polaroidCount} of 6 · clients filter on visual fit first`,
      done: polaroidCount >= 6,
      onClick: onPolaroids,
    },
    {
      label: "Turn on a reach channel",
      description: channelsLive > 0 ? `${channelsLive} live` : "No channel live · without one, no inquiries route to you",
      done: channelsLive > 0,
      onClick: onReach,
    },
    {
      label: "Add a payout method",
      description: payoutSet ? "Done — you'll get paid on time." : "Bank or card · so we can pay you out on the first booking",
      done: payoutSet,
      onClick: onPayouts,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, ${COLORS.accentSoft} 0%, #fff 70%)`,
        border: `1px solid ${COLORS.accent}`,
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 14,
        fontFamily: FONTS.body,
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: COLORS.accent,
              marginBottom: 3,
            }}
          >
            First session
          </div>
          <h3
            style={{
              fontFamily: FONTS.display,
              fontSize: 17,
              fontWeight: 500,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: -0.15,
            }}
          >
            {doneCount === steps.length
              ? "You're set up. Inquiries land here."
              : `${doneCount} of ${steps.length} done — ${steps.length - doneCount} to go`}
          </h3>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss first-session checklist"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: COLORS.inkMuted,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={11} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {steps.map((step, idx) => (
          <button
            key={idx}
            type="button"
            onClick={step.onClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${step.done ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`,
              borderRadius: 9,
              textAlign: "left",
              fontFamily: FONTS.body,
              cursor: "pointer",
              opacity: step.done ? 0.7 : 1,
              transition: `border-color ${TRANSITION.micro}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = step.done ? COLORS.green : COLORS.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = step.done ? "rgba(46,125,91,0.30)" : COLORS.borderSoft)}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: step.done ? COLORS.green : COLORS.accentSoft,
                color: step.done ? "#fff" : COLORS.accentDeep,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {step.done ? <Icon name="check" size={11} color="#fff" /> : idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: COLORS.ink,
                  textDecoration: step.done ? "line-through" : "none",
                  lineHeight: 1.35,
                }}
              >
                {step.label}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: COLORS.inkMuted,
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                {step.description}
              </div>
            </div>
            {!step.done && <Icon name="chevron-right" size={12} color={COLORS.inkDim} />}
          </button>
        ))}
      </div>
    </section>
  );
}


/**
 * Clickable past-earning row → opens TalentClosedBookingDrawer with the
 * archived team, chat, and booking facts. Each completed booking becomes
 * a portfolio entry the talent can revisit.
 *
 * Uses a client AVATAR on the left (initials + auto-tinted brand color)
 * — date is secondary information for past bookings; brand identity is
 * what the talent actually scans for. Same avatar pattern used by
 * "Inquiries you're in" rows.
 */
export function EarningRow({ earning }: { earning: typeof EARNINGS_ROWS[number] }) {
  const { openDrawer } = useAdminShell();
  // Brief is shown inside TalentClosedBookingDrawer (_talent_drawers.tsx).
  // Row shows client + amount only — enough to scan the list.
  return (
    <button
      type="button"
      onClick={() => openDrawer("talent-closed-booking", { earningId: earning.id })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Avatar
        size={36}
        tone="auto"
        hashSeed={earning.client}
        initials={clientInitialsLocal(earning.client)}
      />
      <div className="flex-1 min-w-0">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          <span>{earning.client}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11.5,
          }}
        >
          <KindChip
            label={earning.source.kind === "manual" ? "Off-platform" : "Paid"}
            tone={earning.source.kind === "manual" ? "coral" : "success"}
          />
          <span style={{ color: COLORS.inkMuted }}>
            {PAYMENT_METHOD_META[earning.paymentMethod].short} · paid {earning.payoutDate}
            {earning.paymentNote && (
              <span style={{ color: COLORS.coral }}> · {earning.paymentNote}</span>
            )}
          </span>
        </div>
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {earning.amount}
      </span>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}


/** Brand initials helper — "Mango" → "M", "Vogue Italia" → "VI". */
export function clientInitialsLocal(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}


/**
 * Shared 44×44 date block — used across Calendar event rows, Earning
 * rows, and any other "date-anchored" Today surface. The single source
 * of date-anchor visual language across Talent.
 */
export function DateBlock({
  day,
  month,
  size = 44,
}: {
  day: string | number;
  month: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: COLORS.surfaceAlt,
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: FONTS.display,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, lineHeight: 1 }}>
        {day}
      </span>
      <span
        style={{
          fontSize: 9,
          color: COLORS.inkMuted,
                    fontWeight: 600,
          marginTop: 2,
        }}
      >
        {month}
      </span>
    </span>
  );
}


/**
 * Shared status chip — used across Today rows (BOOKED, PAID, OFFER, HOLD,
 * PENDING) for consistent semantic language. Tone-coded to the tone
 * tokens (success / coral / indigo / amber / ink).
 */
export function KindChip({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "coral" | "indigo" | "amber" | "ink";
}) {
  const palette = {
    success: { bg: COLORS.successSoft, fg: COLORS.green },
    coral: { bg: COLORS.coralSoft, fg: COLORS.coral },
    indigo: { bg: COLORS.indigoSoft, fg: COLORS.indigo },
    amber: { bg: COLORS.amberSoft, fg: COLORS.amberDeep },
    ink: { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink },
  } as const;
  const c = palette[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 7px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
              }}
    >
      {label}
    </span>
  );
}
