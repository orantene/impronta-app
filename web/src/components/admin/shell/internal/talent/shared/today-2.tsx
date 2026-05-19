"use client";

import { useState, type ReactNode } from "react";
import { Icon, SecondaryButton, Toggle } from "../../primitives";
import { COLORS, FONTS } from "../../state";
import { HeroNameLink, HeroStat, HeroStatDivider } from "./today-3";



/**
 * Compact section header used across Talent Today blocks.
 * Title + subtitle on the left, optional action link on the right.
 */
export function SectionHeader({
  title,
  subtitle,
  icon,
  iconTone = "ink",
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title: string;
  subtitle?: string;
  /** Optional 36×36 icon chip on the left — same style as the iCal card.
   *  Tone-tinted background + foreground per `iconTone`. Carries semantic
   *  signal: coral for action-needed, sage for confirmed/paid, indigo for
   *  info/analytics, accent (forest) for brand identity moments. */
  icon?: "bolt" | "calendar" | "credit" | "team" | "globe" | "user" | "mail" | "sparkle";
  iconTone?: "ink" | "coral" | "indigo" | "success" | "accent" | "royal";
  actionLabel?: string;
  onAction?: () => void;
  /** Optional secondary action — renders to the LEFT of the primary
   *  action with a small visual separator. Used for "+ Log work" alongside
   *  "See activity →" — distinct semantic (add vs view) on one row. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  const tonePalette = {
    ink: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink },
    coral: { bg: COLORS.coralSoft, fg: COLORS.coral },
    indigo: { bg: COLORS.indigoSoft, fg: COLORS.indigo },
    success: { bg: COLORS.successSoft, fg: COLORS.green },
    accent: { bg: COLORS.accentSoft, fg: COLORS.accent },
    royal: { bg: COLORS.royalSoft, fg: COLORS.royal },
  } as const;
  const t = tonePalette[iconTone];
  return (
    <div
      style={{
        display: "flex",
        alignItems: icon ? "flex-start" : "baseline",
        justifyContent: "space-between",
        marginBottom: 4,
        gap: 12,
      }}
    >
      {icon && (
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: t.bg,
            color: t.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <Icon name={icon} size={16} stroke={1.7} color={t.fg} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.ink,
            letterSpacing: -0.05,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: COLORS.inkMuted,
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.ink,
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {secondaryActionLabel}
          </button>
        )}
        {secondaryActionLabel && actionLabel && (
          <span
            aria-hidden
            style={{ width: 1, height: 12, background: COLORS.borderSoft }}
          />
        )}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.ink,
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}


/**
 * Talent Today hero — context-aware single-line headline + entry actions
 * + a slim micro-stat strip. Replaces the PageHeader + 4-tile metric grid
 * + Needs-your-answer card. The hero TELLS the user the headline reality
 * ("Mango and Bvlgari are waiting on you") rather than making them piece
 * it together from numbers.
 *
 * The headline is the single most important pixel on the page. It changes
 * meaning based on state, which is what makes the page feel intelligent.
 */
export function TalentTodayHero({
  firstName,
  pendingCount,
  pendingTargets,
  upcomingCount,
  nextBookingDate,
  paidThisMonth,
  paidCurrency,
  profileCompleteness,
  currentLocation,
  availableForWork,
  availableToTravel,
  isDay1,
  onReplyNow,
  onAvailability,
  onOpenProfile,
  onOpenCalendar,
  onOpenActivity,
}: {
  firstName: string;
  pendingCount: number;
  pendingTargets: { name: string; onClick: () => void; isNew?: boolean }[];
  upcomingCount: number;
  nextBookingDate?: string;
  paidThisMonth: number;
  paidCurrency: string;
  profileCompleteness: number;
  /** "Playa del Carmen · Mexico" — where the talent is right now. */
  currentLocation: string;
  /** Master availability toggle. When false, hidden from new pitches. */
  availableForWork: boolean;
  /** Open to travel for work. Distinct from availableForWork. */
  availableToTravel: boolean;
  /** True for a brand-new talent: no bookings, no earnings, no inquiries.
   *  Hero shifts to a welcome / setup tone instead of the operational one. */
  isDay1: boolean;
  onReplyNow: () => void;
  onAvailability: () => void;
  onOpenProfile: () => void;
  /** Audit #11 — drill-in handlers for the stats strip. */
  onOpenCalendar?: () => void;
  onOpenActivity?: () => void;
}) {
  // Display location: drop the "·" separator for hero copy, keep it in
  // the chip. "Playa del Carmen · Mexico" → "Playa del Carmen, Mexico".
  const locationDisplay = currentLocation.replace(/\s*·\s*/, ", ");

  // Context-aware headline + subline. The hero changes meaning based on
  // THREE axes now:
  //   - is this Day-1 (no work history yet) — welcome tone
  //   - pending replies (urgent / not urgent)
  //   - availability + location (where you are, what you're up for)
  let headlineParts: ReactNode;
  let subline: string;
  if (isDay1) {
    headlineParts = `Welcome to Tulala, ${firstName}.`;
    subline =
      "Your storefront is live. First inquiries usually arrive within a week — finish your profile to speed things up.";
  } else if (pendingCount === 0) {
    if (!availableForWork) {
      headlineParts = `You're in ${locationDisplay} — not taking work.`;
      subline = "Existing bookings aren't affected. Toggle availability when you're back.";
    } else {
      headlineParts = `You're available to work in ${locationDisplay}.`;
      subline = availableToTravel
        ? "Open to travel internationally."
        : "Local jobs only — toggle travel anytime.";
    }
  } else if (pendingCount === 1) {
    headlineParts = (
      <>
        <HeroNameLink onClick={pendingTargets[0]!.onClick}>
          {pendingTargets[0]!.name}
        </HeroNameLink>{" "}
        is waiting on you.
      </>
    );
    subline = "Reply to keep the inquiry alive.";
  } else if (pendingCount === 2) {
    headlineParts = (
      <>
        <HeroNameLink onClick={pendingTargets[0]!.onClick}>
          {pendingTargets[0]!.name}
        </HeroNameLink>{" "}
        and{" "}
        <HeroNameLink onClick={pendingTargets[1]!.onClick}>
          {pendingTargets[1]!.name}
        </HeroNameLink>{" "}
        are waiting on you.
      </>
    );
    subline = `${pendingCount} replies needed today.`;
  } else {
    headlineParts = `${pendingCount} things need your reply.`;
    // Audit #16 — concrete next-action microcopy. Names the oldest
    // waiter so the talent has a concrete starting point, not a vague
    // "top of inbox first" instruction.
    const oldest = pendingTargets[0]?.name;
    subline = oldest
      ? `${oldest} has been waiting longest — start there.`
      : "Reply in age order to keep relationships warm.";
  }

  return (
    <section data-tulala-today-hero
      style={{
        marginBottom: 16,
      }}
    >
      {/* Mobile-only compaction for the entire Today page hero zone:
          smaller h1, tighter eyebrow / subline / location strip, more
          compact action buttons. Keeps the visual hierarchy intact while
          reclaiming ~80-100px of vertical real estate. */}
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-today-hero] {
            margin-bottom: 10px !important;
          }
          [data-tulala-today-hero] [data-tulala-talent-hero-row] {
            margin-bottom: 8px !important;
            gap: 12px !important;
          }
          [data-tulala-today-hero] [data-tulala-talent-hero-row] h1 {
            font-size: 21px !important;
            line-height: 1.18 !important;
            letter-spacing: -0.3px !important;
          }
          [data-tulala-today-hero] [data-tulala-talent-hero-row] > div:first-child > div:first-child {
            font-size: 10.5px !important;
            margin-bottom: 2px !important;
          }
          [data-tulala-today-hero] [data-tulala-talent-hero-row] > div:first-child > div:nth-child(3) {
            font-size: 12.5px !important;
            margin-top: 4px !important;
            line-height: 1.4 !important;
          }
          [data-tulala-today-hero] [data-tulala-talent-hero-row] > div:first-child > button {
            margin-top: 6px !important;
            font-size: 11.5px !important;
          }
          /* Action buttons (Reply now + Availability) inline + compact */
          [data-tulala-today-hero] [data-tulala-talent-hero-row] > div:last-child {
            gap: 6px !important;
          }
          [data-tulala-today-hero] [data-tulala-talent-hero-row] > div:last-child button {
            padding: 7px 12px !important;
            font-size: 12.5px !important;
          }
        }
      `}</style>
      <div
        data-tulala-talent-hero-row
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          marginBottom: 12,
        }}
      >
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
                            color: COLORS.inkMuted,
              marginBottom: 4,
              display: "none",
            }}
          >
            Hi {firstName}
          </div>
          <h1
            data-tulala-h1
            style={{
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: -0.3,
              color: COLORS.ink,
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {headlineParts}
          </h1>
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.inkMuted,
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            {subline}
          </div>

          {/* Persistent location strip — visible when pending > 0 so the
              talent always knows where they are even when the headline is
              about urgent work. Clickable → opens availability drawer.
              Hidden when pending = 0 since the headline already says it. */}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={onAvailability}
              style={{
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12,
                color: availableForWork ? COLORS.inkMuted : COLORS.coral,
              }}
            >
              <Icon name="map-pin" size={11} stroke={1.7} />
              <span>
                {locationDisplay}
                {" · "}
                {!availableForWork
                  ? "Paused"
                  : availableToTravel
                    ? "Open to travel"
                    : "Local only"}
              </span>
            </button>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {pendingCount > 0 && (
            <ReplyNowSplitButton
              pendingTargets={pendingTargets}
              onPrimary={onReplyNow}
            />
          )}
          <SecondaryButton onClick={onAvailability}>
            Availability
          </SecondaryButton>
        </div>
      </div>

      {/* Micro-stat strip — at-a-glance secondary numbers. Each stat
          carries a small caption (next-up, trend, or status hint) so the
          strip is scannable on its own without re-scrolling the page. */}
      <div
        data-tulala-stat-strip
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "10px 14px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
        }}
      >
        <HeroStat
          label="Confirmed"
          value={String(upcomingCount)}
          caption={nextBookingDate ? `next ${nextBookingDate}` : "none yet"}
          tone="ink"
          onClick={onOpenCalendar}
        />
        <HeroStatDivider />
        <HeroStat
          label="Paid this month"
          value={`${paidCurrency}${paidThisMonth.toLocaleString()}`}
          caption="+€800 vs prior 30d"
          captionTone="success"
          tone="ink"
          onClick={onOpenActivity}
        />
        <HeroStatDivider />
        <HeroStat
          label="Profile"
          value={`${profileCompleteness}%`}
          caption={profileCompleteness < 100 ? "tap to finish" : "complete"}
          tone="ink"
          onClick={onOpenProfile}
        />
      </div>
    </section>
  );
}


/**
 * Reply now split button — primary action sends to the FIRST pending
 * (one-click default), with a chevron menu listing both pending names so
 * the user can choose which one to reply to first. The split eliminates
 * the previous "go to inbox, find the right one, click it" hop.
 */
function ReplyNowSplitButton({
  pendingTargets,
  onPrimary,
}: {
  pendingTargets: { name: string; onClick: () => void; isNew?: boolean }[];
  onPrimary: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={onPrimary}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "9px 14px",
          background: COLORS.fill,
          color: "#fff",
          border: "none",
          borderRadius: "8px 0 0 8px",
          fontFamily: FONTS.body,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Reply now →
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose which to reply to"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "9px 8px",
          background: COLORS.fill,
          color: "#fff",
          border: "none",
          borderLeft: "1px solid rgba(255,255,255,0.18)",
          borderRadius: "0 8px 8px 0",
          fontFamily: FONTS.body,
          cursor: "pointer",
        }}
      >
        <Icon name="chevron-down" size={12} stroke={2} color="#fff" />
      </button>
      {open && (
        <>
          <span
            aria-hidden
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 220,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              boxShadow: COLORS.shadowHover,
              padding: 4,
              zIndex: 60,
              fontFamily: FONTS.body,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                                color: COLORS.inkMuted,
                padding: "6px 10px 4px",
              }}
            >
              Reply to
            </div>
            {pendingTargets.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  setOpen(false);
                  t.onClick();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.ink,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {t.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
