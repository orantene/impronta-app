"use client";

/**
 * Talent surface — what a model sees when they sign in.
 *
 * Shape:
 *   TalentShell        — sticky topbar (my identity + agency switcher) + page nav
 *   TalentRouter       — switches between the 6 pages
 *   TalentTodayPage    — pulse of offers/holds/upcoming
 *   MyProfilePage      — profile-centric: completeness + sections + public preview
 *   InboxPage          — offers / holds / castings (kanban-ish list)
 *   CalendarPage       — bookings + availability blocks (week-view list)
 *   ActivityPage       — earnings + history feed
 *   SettingsPage       — agencies, notifications, privacy, payouts
 *
 *   plus ~15 talent drawer bodies dispatched from _drawers.tsx via talentDrawer()
 */

import { useState, type ReactNode } from "react";
import {
  AVAILABILITY_BLOCKS,
  COLORS,
  EARNINGS_ROWS,
  FONTS,
  INQUIRY_STAGE_META,
  MY_AGENCIES,
  MY_TALENT_PROFILE,
  RICH_INQUIRIES,
  TALENT_BOOKINGS,
  TALENT_PAGES,
  TALENT_PAGE_META,
  TALENT_REQUESTS,
  useProto,
  type RichInquiry,
  type TalentBooking,
  type TalentPage,
  type TalentRequest,
} from "./_state";
import {
  Affordance,
  Avatar,
  Bullet,
  CapsLabel,
  Divider,
  FieldRow,
  GhostButton,
  Icon,
  IconChip,
  PrimaryButton,
  PrimaryCard,
  SecondaryButton,
  SecondaryCard,
  StatDot,
  StatusCard,
  StarterCard,
  TextArea,
  TextInput,
  Toggle,
  DrawerShell,
} from "./_primitives";

// ════════════════════════════════════════════════════════════════════
// Mine-from-RICH_INQUIRIES helpers
// ════════════════════════════════════════════════════════════════════

/**
 * Returns inquiries where I (the talent) appear in either a requirement
 * group's roster, or as a line item on the offer. This is the bridge
 * between the agency-side workspace (RICH_INQUIRIES) and the talent
 * inbox — same record, talent POV.
 */
function myInquiries(): RichInquiry[] {
  const myName = MY_TALENT_PROFILE.name;
  return RICH_INQUIRIES.filter((i) => {
    const inRoster = i.requirementGroups.some((g) =>
      g.talents.some((t) => t.name === myName),
    );
    const onOffer = i.offer?.lineItems.some((l) => l.talentName === myName) ?? false;
    return inRoster || onOffer;
  });
}

/**
 * My status on an inquiry — the most relevant signal for the talent inbox.
 * Prioritise offer line item status (most concrete), fall back to roster.
 */
function myStatusOn(inquiry: RichInquiry): "pending" | "accepted" | "declined" | "none" {
  const myName = MY_TALENT_PROFILE.name;
  const line = inquiry.offer?.lineItems.find((l) => l.talentName === myName);
  if (line) {
    if (line.status === "accepted") return "accepted";
    if (line.status === "declined") return "declined";
    if (line.status === "pending") return "pending";
  }
  for (const g of inquiry.requirementGroups) {
    const t = g.talents.find((tt) => tt.name === myName);
    if (t) {
      if (t.status === "accepted") return "accepted";
      if (t.status === "declined") return "declined";
      if (t.status === "pending") return "pending";
    }
  }
  return "none";
}

function unreadOnInquiry(inquiry: RichInquiry): number {
  // Talent only ever sees the group thread, so private unread is hidden from them.
  return inquiry.unreadGroup;
}

function InquiryRow({ inquiry }: { inquiry: RichInquiry }) {
  const { openDrawer, toast } = useProto();
  const stage = INQUIRY_STAGE_META[inquiry.stage];
  const myStatus = myStatusOn(inquiry);
  const unread = unreadOnInquiry(inquiry);
  const myLine = inquiry.offer?.lineItems.find((l) => l.talentName === MY_TALENT_PROFILE.name);

  const stageBg =
    stage.tone === "amber" ? "rgba(198,138,30,0.10)"
    : stage.tone === "green" ? "rgba(46,125,91,0.10)"
    : stage.tone === "red" ? "rgba(176,48,58,0.08)"
    : "rgba(11,11,13,0.05)";
  const stageFg =
    stage.tone === "amber" ? "#7E5612"
    : stage.tone === "green" ? "#1F5C42"
    : stage.tone === "red" ? "#7A2026"
    : COLORS.inkMuted;

  // T1: Stage-aware confirmed text — "You're confirmed" was ambiguous
  const myStatusLabel =
    myStatus === "pending" ? "Awaiting your answer"
    : myStatus === "accepted" && inquiry.stage === "offer_pending" ? "Waiting on client"
    : myStatus === "accepted" && inquiry.stage === "approved" ? "Client approved — booking being set up"
    : myStatus === "accepted" && inquiry.stage === "booked" ? "Booked · locked in"
    : myStatus === "accepted" ? "You're confirmed"
    : myStatus === "declined" ? "You declined"
    : null;
  const myStatusFg =
    myStatus === "pending" ? "#7E5612"
    : myStatus === "accepted" && inquiry.stage === "booked" ? "#1F5C42"
    : myStatus === "accepted" ? "#1F5C42"
    : myStatus === "declined" ? COLORS.inkDim
    : COLORS.inkMuted;

  // T2: "Updated Xh ago" timestamp
  const activityLabel =
    inquiry.lastActivityHrs < 1 ? "Just now"
    : inquiry.lastActivityHrs < 24 ? `${inquiry.lastActivityHrs}h ago`
    : `${Math.round(inquiry.lastActivityHrs / 24)}d ago`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        position: "relative",
      }}
    >
      {/* Main clickable area */}
      <button
        onClick={() => openDrawer("inquiry-workspace", { inquiryId: inquiry.id, pov: "talent" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          flex: 1,
          minWidth: 0,
          fontFamily: FONTS.body,
          padding: 0,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "3px 9px",
            borderRadius: 999,
            background: stageBg,
            color: stageFg,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {stage.label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
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
            {inquiry.clientName} · {inquiry.brief}
            {/* T6: Repeat-client badge */}
            {inquiry.repeatBookings > 0 && (
              <span
                style={{
                  fontSize: 10.5,
                  color: COLORS.inkMuted,
                  background: "rgba(11,11,13,0.06)",
                  padding: "2px 7px",
                  borderRadius: 999,
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                Repeat · {inquiry.repeatBookings}×
              </span>
            )}
            {unread > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "#7E5612",
                  background: "rgba(198,138,30,0.12)",
                  padding: "2px 7px",
                  borderRadius: 999,
                  letterSpacing: 0.3,
                  flexShrink: 0,
                }}
              >
                {unread} new
              </span>
            )}
          </div>
          {/* T2: meta row with activity timestamp */}
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
            <span>
              via {inquiry.agencyName}
              {inquiry.date && <> · {inquiry.date}</>}
              {inquiry.location && <> · {inquiry.location}</>}
              {myLine && <> · {myLine.fee}</>}
            </span>
            <span style={{ color: COLORS.inkDim }}>·</span>
            <span style={{ color: COLORS.inkDim }}>Updated {activityLabel}</span>
          </div>
          {myStatusLabel && (
            <div style={{ fontSize: 11, color: myStatusFg, marginTop: 3, fontWeight: 500 }}>
              {myStatusLabel}
            </div>
          )}
        </div>
      </button>
      {/* T5: Snooze / set-reminder affordance */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toast("Reminder set — we'll ping you in 4 hours");
        }}
        title="Set a reminder"
        style={{
          background: "transparent",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 6,
          padding: "4px 8px",
          cursor: "pointer",
          fontSize: 10.5,
          fontFamily: FONTS.body,
          color: COLORS.inkDim,
          fontWeight: 500,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.borderColor = COLORS.border; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkDim; e.currentTarget.style.borderColor = COLORS.borderSoft; }}
      >
        Remind me
      </button>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Surface entry
// ════════════════════════════════════════════════════════════════════

export function TalentSurface() {
  return (
    <div style={{ background: COLORS.surface, minHeight: "calc(100vh - 50px)" }}>
      <TalentTopbar />
      <main
        style={{
          padding: "28px 28px 60px",
          maxWidth: 1240,
          margin: "0 auto",
        }}
      >
        <TalentRouter />
      </main>
    </div>
  );
}

// ─── Topbar (lighter than workspace admin) ─────────────────────────

function TalentTopbar() {
  const { state, setTalentPage, openDrawer } = useProto();
  const profile = MY_TALENT_PROFILE;

  return (
    <header
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        padding: "0 28px",
        position: "sticky",
        top: 50,
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 56,
        }}
      >
        {/* My identity (talent-side, NOT a tenant) */}
        <button
          onClick={() => setTalentPage("profile")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: FONTS.body,
          }}
        >
          <Avatar initials={profile.initials} size={28} tone="ink" />
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: -0.1,
              color: COLORS.ink,
            }}
          >
            {profile.name}
          </span>
        </button>

        {/* Agency switcher chip — opens which agency I'm acting under */}
        <button
          onClick={() => openDrawer("talent-agency-relationship")}
          aria-label="Agency"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(11,11,13,0.04)",
            border: "none",
            padding: "4px 10px",
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.ink,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: COLORS.green,
            }}
          />
          {profile.primaryAgency}
          <Icon name="chevron-down" size={11} color={COLORS.inkDim} />
        </button>

        <div style={{ width: 1, height: 22, background: COLORS.borderSoft, margin: "0 8px" }} />

        {/* Page nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
          {TALENT_PAGES.map((p) => {
            const active = state.talentPage === p;
            return (
              <button
                key={p}
                onClick={() => setTalentPage(p)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 12px",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? COLORS.ink : COLORS.inkMuted,
                  letterSpacing: 0.1,
                  borderRadius: 7,
                  position: "relative",
                  transition: "color .12s, background .12s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.ink;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.inkMuted;
                }}
              >
                {TALENT_PAGE_META[p].label}
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -16,
                      left: 12,
                      right: 12,
                      height: 2,
                      background: COLORS.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => openDrawer("talent-today-pulse")}
            aria-label="Inbox"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
              color: COLORS.inkMuted,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <Icon name="mail" size={14} stroke={1.7} />
            <span
              style={{
                position: "absolute",
                top: 7,
                right: 8,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: COLORS.amber,
                boxShadow: "0 0 0 2px #fff",
              }}
            />
          </button>
          <a
            href={`https://${profile.publicUrl}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: COLORS.inkMuted,
              textDecoration: "none",
              padding: "5px 9px",
              borderRadius: 999,
              background: "rgba(11,11,13,0.04)",
            }}
          >
            <Icon name="external" size={11} />
            View public profile
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Router ───────────────────────────────────────────────────────

function TalentRouter() {
  const { state } = useProto();
  switch (state.talentPage) {
    case "today":
      return <TalentTodayPage />;
    case "profile":
      return <MyProfilePage />;
    case "inbox":
      return <InboxPage />;
    case "calendar":
      return <CalendarPage />;
    case "activity":
      return <ActivityPage />;
    case "settings":
      return <SettingsPage />;
  }
}

// ─── Shared header ────────────────────────────────────────────────

function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
      <div style={{ flex: 1 }}>
        {eyebrow && (
          <div style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: -0.6,
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
              fontSize: 14,
              color: COLORS.inkMuted,
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 720,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
    </div>
  );
}

function Grid({ children, cols = "auto" }: { children: ReactNode; cols?: "auto" | "2" | "3" | "4" }) {
  const colMap = {
    auto: "repeat(auto-fit, minmax(280px, 1fr))",
    "2": "repeat(2, 1fr)",
    "3": "repeat(3, 1fr)",
    "4": "repeat(4, 1fr)",
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: colMap[cols], gap: 12 }}>{children}</div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TODAY
// ════════════════════════════════════════════════════════════════════

function TalentTodayPage() {
  const { openDrawer, setTalentPage } = useProto();
  const profile = MY_TALENT_PROFILE;
  const needsAnswer = TALENT_REQUESTS.filter((r) => r.status === "needs-answer");
  const upcoming = TALENT_BOOKINGS.filter((b) => b.status === "confirmed").slice(0, 3);
  // T3: derive paid-this-month from payoutDate field
  const paidThisMonth = EARNINGS_ROWS.filter((e) => e.payoutDate.includes("Apr"));
  const paidThisMonthTotal = paidThisMonth.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const paidThisMonthCurrency = paidThisMonth[0]?.amount.match(/[€£$]/)?.[0] ?? "€";
  const mine = myInquiries();
  const mineNeedsMe = mine.filter((i) => myStatusOn(i) === "pending");
  const mineUnread = mine.reduce((sum, i) => sum + unreadOnInquiry(i), 0);

  return (
    <>
      <PageHeader
        eyebrow={`Hi ${profile.name.split(" ")[0]}`}
        title="Today"
        subtitle="Offers, holds and upcoming bookings — the things your agencies need an answer on right now."
        actions={
          <SecondaryButton onClick={() => openDrawer("talent-block-dates")}>
            Block dates
          </SecondaryButton>
        }
      />

      <Grid cols="4">
        <StatusCard
          label="Awaiting your answer"
          value={mineNeedsMe.length + needsAnswer.length}
          caption="offers + holds"
          tone="amber"
          onClick={() => setTalentPage("inbox")}
        />
        <StatusCard
          label="Group threads"
          value={mineUnread}
          caption="unread messages"
          tone={mineUnread > 0 ? "amber" : "dim"}
          onClick={() => setTalentPage("inbox")}
        />
        <StatusCard
          label="Upcoming"
          value={upcoming.length}
          caption="confirmed bookings"
          tone="green"
        />
        <StatusCard
          label="Paid this month"
          value={`${paidThisMonthCurrency}${paidThisMonthTotal.toLocaleString()}`}
          caption={`${paidThisMonth.length} payout${paidThisMonth.length !== 1 ? "s" : ""} received`}
          tone="green"
          onClick={() => setTalentPage("activity")}
        />
      </Grid>

      <div style={{ height: 24 }} />

      {/* What needs answer */}
      <Grid cols="2">
        <PrimaryCard
          title="Needs your answer"
          description={
            needsAnswer.length === 0
              ? "Inbox zero. Take a breath."
              : `${needsAnswer.length} requests are waiting on you.`
          }
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance="Open inbox"
          meta={<><StatDot tone="amber" /> {needsAnswer.length} pending</>}
          onClick={() => openDrawer("talent-today-pulse")}
        />
        <PrimaryCard
          title="Profile completeness"
          description={
            profile.completeness >= 100
              ? "Your profile is fully filled out."
              : `${100 - profile.completeness}% to a fully complete profile. Agencies favour complete talent.`
          }
          icon={<Icon name="user" size={14} stroke={1.7} />}
          affordance="Finish my profile"
          meta={<>{profile.completeness}% complete</>}
          onClick={() => openDrawer("talent-profile-edit")}
        />
      </Grid>

      <div style={{ height: 12 }} />

      {/* T4: Merged priority list — inquiries + holds/castings in one ranked section */}
      {(mine.length > 0 || needsAnswer.length > 0) && (
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "16px 18px 4px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 14,
                  fontWeight: 600,
                  color: COLORS.ink,
                  letterSpacing: -0.05,
                }}
              >
                Needs your attention
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.inkMuted,
                  marginTop: 2,
                }}
              >
                Inquiries, offers, holds and castings — all in one place, sorted by urgency.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTalentPage("inbox")}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.ink,
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              See all →
            </button>
          </div>
          {/* Pending inquiries first (need the talent's answer) */}
          {mineNeedsMe.slice(0, 3).map((i) => (
            <InquiryRow key={i.id} inquiry={i} />
          ))}
          {/* Quick-decision holds/castings */}
          {needsAnswer.map((r) => <RequestRow key={r.id} request={r} />)}
          {/* Remaining active inquiries (no pending action needed from talent) */}
          {mine.filter((i) => myStatusOn(i) !== "pending").slice(0, 2).map((i) => (
            <InquiryRow key={i.id} inquiry={i} />
          ))}
        </section>
      )}

      <div style={{ height: 12 }} />

      {/* Upcoming bookings preview */}
      <Grid cols="2">
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "16px 18px 6px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 14,
                  fontWeight: 600,
                  color: COLORS.ink,
                  letterSpacing: -0.05,
                }}
              >
                Next on the calendar
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.inkMuted,
                  marginTop: 2,
                }}
              >
                {upcoming.length === 0
                  ? "No confirmed bookings yet."
                  : `${upcoming.length} upcoming · ${upcoming[0]?.startDate}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTalentPage("calendar")}
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
              See calendar →
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {upcoming.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        </section>
        <SecondaryCard
          title="Recent earnings"
          description={`${paidThisMonth.length} payout${paidThisMonth.length !== 1 ? "s" : ""} landed this month.`}
          affordance="See activity"
          onClick={() => setTalentPage("activity")}
        >
          {/* T8: Show payout date (when money landed), not just work date */}
          <div style={{ marginTop: 4 }}>
            {EARNINGS_ROWS.slice(0, 3).map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderTop: `1px solid ${COLORS.borderSoft}`,
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: COLORS.ink }}>{e.client}</div>
                  <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 1 }}>
                    Worked {e.workDate} · Paid {e.payoutDate}
                  </div>
                </div>
                <span style={{ color: COLORS.ink, fontWeight: 600 }}>{e.amount}</span>
              </div>
            ))}
          </div>
        </SecondaryCard>
      </Grid>
    </>
  );
}

function RequestRow({ request }: { request: TalentRequest }) {
  const { openDrawer } = useProto();
  const kindMeta: Record<TalentRequest["kind"], { label: string; tone: "amber" | "ink" | "green" | "dim" }> = {
    offer: { label: "Offer", tone: "amber" },
    hold: { label: "Hold", tone: "amber" },
    casting: { label: "Casting", tone: "dim" },
    request: { label: "Request", tone: "ink" },
  };
  const km = kindMeta[request.kind];
  return (
    <button
      onClick={() => openDrawer("talent-offer-detail", { id: request.id })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px",
          borderRadius: 999,
          background: km.tone === "amber" ? "rgba(198,138,30,0.10)" : "rgba(11,11,13,0.05)",
          color: km.tone === "amber" ? "#7E5612" : COLORS.ink,
          fontFamily: FONTS.body,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {km.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: FONTS.body,
            fontSize: 13.5,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          {request.client}
          <Bullet />
          <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>{request.brief}</span>
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            marginTop: 2,
          }}
        >
          via {request.agency}
          {request.date && <> · {request.date}</>}
          {request.amount && <> · {request.amount}</>}
        </div>
      </div>
      <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkDim }}>
        {request.ageHrs < 24 ? `${request.ageHrs}h ago` : `${Math.floor(request.ageHrs / 24)}d ago`}
      </span>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

function BookingRow({ booking }: { booking: TalentBooking }) {
  const { openDrawer } = useProto();
  return (
    <button
      onClick={() => openDrawer("talent-booking-detail", { id: booking.id })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: FONTS.body,
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: COLORS.cream,
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: FONTS.display,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, lineHeight: 1 }}>
          {booking.startDate.split(" ")[1]?.replace(",", "") ?? "—"}
        </span>
        <span style={{ fontSize: 9, color: COLORS.inkMuted, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>
          {booking.startDate.slice(0, 3)}
        </span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
          {booking.client} · {booking.brief}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
          {booking.location} · call {booking.call}
        </div>
      </div>
      <span style={{ fontSize: 12.5, color: COLORS.ink, fontWeight: 600 }}>{booking.amount}</span>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// MY PROFILE
// ════════════════════════════════════════════════════════════════════

function MyProfilePage() {
  const { openDrawer } = useProto();
  const p = MY_TALENT_PROFILE;
  const sections: { id: string; label: string; complete: boolean; description: string }[] = [
    { id: "basics", label: "Basics", complete: true, description: "Name · agency · public URL" },
    { id: "measurements", label: "Measurements", complete: true, description: "Height · sizes · features" },
    { id: "portfolio", label: "Portfolio", complete: false, description: "12 / 15 shots — needs 3 from 2026" },
    { id: "experience", label: "Experience & credits", complete: true, description: "8 credits across editorial + commercial" },
    { id: "languages", label: "Languages & skills", complete: true, description: "ES · EN · IT" },
    { id: "documents", label: "Documents", complete: false, description: "W-8BEN missing" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="My profile"
        title={p.name}
        subtitle={`${p.measurements} · ${p.city}. Published since ${p.publishedAt}.`}
        actions={
          <>
            <SecondaryButton onClick={() => openDrawer("talent-portfolio")}>Manage portfolio</SecondaryButton>
            <PrimaryButton onClick={() => openDrawer("talent-profile-edit")}>Edit profile</PrimaryButton>
          </>
        }
      />

      {/* Top row: completeness + preview */}
      <Grid cols="2">
        <PrimaryCard
          title="Profile completeness"
          description={
            p.completeness >= 100
              ? "Fully complete. You'll show up on every search filter."
              : "Complete profiles get higher placement on agency rosters and the Tulala hub."
          }
          icon={<Icon name="user" size={14} stroke={1.7} />}
          affordance="Finish missing items"
          onClick={() => openDrawer("talent-profile-edit")}
        >
          <div style={{ marginTop: 8 }}>
            <CompletenessBar value={p.completeness} />
            {p.missing.length > 0 && (
              <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {p.missing.map((m) => (
                  <li
                    key={m}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: FONTS.body,
                      fontSize: 12.5,
                      color: COLORS.inkMuted,
                    }}
                  >
                    <span
                      style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.amber }}
                    />
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PrimaryCard>
        <PrimaryCard
          title="Public profile"
          description={`Lives at ${p.publicUrl}. Always reflects your latest published edits.`}
          icon={<Icon name="globe" size={14} stroke={1.7} />}
          affordance="Open in new tab"
          onClick={() => window.open(`https://${p.publicUrl}`, "_blank")}
        >
          <div
            style={{
              marginTop: 10,
              padding: "12px 14px",
              background: COLORS.cream,
              borderRadius: 10,
              border: `1px solid rgba(184,134,11,0.18)`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon name="external" size={12} color={COLORS.goldDeep} />
            <span style={{ fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.ink }}>{p.publicUrl}</span>
          </div>
        </PrimaryCard>
      </Grid>

      <Divider label="Sections" />

      <Grid cols="3">
        {sections.map((s) => (
          <SecondaryCard
            key={s.id}
            title={s.label}
            description={s.description}
            meta={
              <>
                <StatDot tone={s.complete ? "green" : "amber"} />
                {s.complete ? "Complete" : "Needs attention"}
              </>
            }
            affordance="Edit"
            onClick={() => openDrawer("talent-profile-section", { sectionId: s.id, label: s.label })}
          />
        ))}
      </Grid>

      <Divider label="Visibility" />

      <Grid cols="2">
        <SecondaryCard
          title="Where you appear"
          description="Acme Models roster · Praline London roster · Tulala hub (featured)"
          meta="3 surfaces"
          affordance="Adjust visibility"
          onClick={() => openDrawer("talent-privacy")}
        />
        <SecondaryCard
          title="Availability"
          description={`${AVAILABILITY_BLOCKS.length} blocks set · next block ${AVAILABILITY_BLOCKS[0]?.startDate}`}
          affordance="Open availability"
          onClick={() => openDrawer("talent-availability")}
        />
      </Grid>
    </>
  );
}

function CompletenessBar({ value }: { value: number }) {
  return (
    <div>
      <div
        style={{
          height: 6,
          background: "rgba(11,11,13,0.06)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            background: value >= 100 ? COLORS.green : COLORS.ink,
          }}
        />
      </div>
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 11.5,
          color: COLORS.inkMuted,
          marginTop: 6,
          letterSpacing: 0.2,
        }}
      >
        {value}% complete
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// INBOX
// ════════════════════════════════════════════════════════════════════

function InboxPage() {
  const { openDrawer } = useProto();
  const [search, setSearch] = useState("");
  const allMine = myInquiries();
  // T9: filter by search across client name + brief
  const mine = search.trim()
    ? allMine.filter(
        (i) =>
          i.clientName.toLowerCase().includes(search.toLowerCase()) ||
          i.brief.toLowerCase().includes(search.toLowerCase()),
      )
    : allMine;

  const inquiryGroups: { id: string; label: string; filter: (i: RichInquiry) => boolean }[] = [
    {
      id: "needs-me",
      label: "Awaiting your answer",
      filter: (i) => myStatusOn(i) === "pending",
    },
    {
      id: "in-flight",
      label: "Active — coordinator is working it",
      filter: (i) =>
        (i.stage === "coordination" || i.stage === "submitted") &&
        myStatusOn(i) !== "pending" &&
        myStatusOn(i) !== "declined",
    },
    {
      id: "approved-booked",
      label: "Confirmed",
      filter: (i) =>
        (i.stage === "approved" || i.stage === "booked") &&
        myStatusOn(i) !== "declined",
    },
    {
      id: "closed",
      label: "Closed",
      filter: (i) =>
        i.stage === "rejected" ||
        i.stage === "expired" ||
        myStatusOn(i) === "declined",
    },
  ];

  const requestGroups: { id: string; label: string; filter: (r: TalentRequest) => boolean }[] = [
    { id: "needs-answer", label: "Needs your answer", filter: (r) => r.status === "needs-answer" },
    { id: "viewed", label: "Viewed — no answer needed yet", filter: (r) => r.status === "viewed" },
    {
      id: "decided",
      label: "Decided",
      filter: (r) => r.status === "accepted" || r.status === "declined" || r.status === "expired",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Inquiries & requests"
        subtitle="Live inquiries put you in the same group thread as your coordinator. Holds and casting calls are quick decisions that may not need a thread yet."
      />

      {/* T9: Search bar */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: "9px 14px",
            maxWidth: 480,
          }}
        >
          <Icon name="search" size={13} color={COLORS.inkDim} />
          <input
            type="text"
            placeholder="Search by client or brief…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              fontFamily: FONTS.body,
              fontSize: 13.5,
              color: COLORS.ink,
              flex: 1,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: COLORS.inkDim }}
            >
              <Icon name="x" size={12} color={COLORS.inkDim} />
            </button>
          )}
        </div>
        {search && mine.length === 0 && (
          <div style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted }}>
            No inquiries match "{search}"
          </div>
        )}
      </div>

      {/* RICH INQUIRIES — talent's POV */}
      {mine.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <CapsLabel>From your agencies</CapsLabel>
        </div>
      )}
      {inquiryGroups.map((g) => {
        const items = mine.filter(g.filter);
        if (items.length === 0) return null;
        return (
          <section key={g.id} style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  color: COLORS.inkMuted,
                  fontWeight: 500,
                  letterSpacing: 0.2,
                }}
              >
                {g.label}
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkDim }}>
                {items.length} {items.length === 1 ? "inquiry" : "inquiries"}
              </span>
            </div>
            <div
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 12,
                padding: "0 14px",
              }}
            >
              {items.map((i) => (
                <InquiryRow key={i.id} inquiry={i} />
              ))}
            </div>
          </section>
        );
      })}

      {/* LEGACY REQUESTS — holds and casting calls (one-off pings) */}
      {TALENT_REQUESTS.length > 0 && (
        <div style={{ marginBottom: 12, marginTop: mine.length > 0 ? 32 : 0 }}>
          <CapsLabel>Holds & casting calls</CapsLabel>
        </div>
      )}
      {requestGroups.map((g) => {
        const items = TALENT_REQUESTS.filter(g.filter);
        if (items.length === 0) return null;
        return (
          <section key={g.id} style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  color: COLORS.inkMuted,
                  fontWeight: 500,
                  letterSpacing: 0.2,
                }}
              >
                {g.label}
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkDim }}>
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 12,
                padding: "0 14px",
              }}
            >
              {items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openDrawer("talent-offer-detail", { id: r.id })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 0",
                    borderBottom: `1px solid ${COLORS.borderSoft}`,
                    background: "transparent",
                    border: "none",
                    borderTop: "none",
                    borderLeft: "none",
                    borderRight: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    fontFamily: FONTS.body,
                  }}
                >
                  <RequestKindBadge kind={r.kind} status={r.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>
                      {r.client} · {r.brief}
                    </div>
                    <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                      via {r.agency}
                      {r.date && <> · {r.date}</>}
                      {r.amount && <> · {r.amount}</>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, color: COLORS.inkDim }}>
                    {r.ageHrs < 24 ? `${r.ageHrs}h` : `${Math.floor(r.ageHrs / 24)}d`} ago
                  </span>
                  <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function RequestKindBadge({ kind, status }: { kind: TalentRequest["kind"]; status: TalentRequest["status"] }) {
  const labels: Record<TalentRequest["kind"], string> = {
    offer: "Offer",
    hold: "Hold",
    casting: "Casting",
    request: "Request",
  };
  let bg = "rgba(11,11,13,0.05)";
  let fg = COLORS.ink;
  if (status === "needs-answer") {
    bg = "rgba(198,138,30,0.12)";
    fg = "#7E5612";
  } else if (status === "accepted") {
    bg = "rgba(46,125,91,0.10)";
    fg = "#1F5C42";
  } else if (status === "declined" || status === "expired") {
    bg = "rgba(11,11,13,0.04)";
    fg = COLORS.inkDim;
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {labels[kind]}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════
// CALENDAR
// ════════════════════════════════════════════════════════════════════

function CalendarPage() {
  const { openDrawer } = useProto();
  const upcoming = TALENT_BOOKINGS.filter((b) => b.status === "confirmed");
  const past = TALENT_BOOKINGS.filter((b) => b.status === "wrapped" || b.status === "paid");

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title="Bookings & availability"
        subtitle="Confirmed bookings sit alongside your blocks. Block dates so your agencies don't pitch you when you're unavailable."
        actions={
          <>
            <SecondaryButton onClick={() => openDrawer("talent-availability")}>
              Manage blocks
            </SecondaryButton>
            <PrimaryButton onClick={() => openDrawer("talent-block-dates")}>
              Block dates
            </PrimaryButton>
          </>
        }
      />

      <Grid cols="3">
        <StatusCard label="Upcoming" value={upcoming.length} caption="confirmed bookings" tone="green" />
        <StatusCard label="Blocks set" value={AVAILABILITY_BLOCKS.length} caption="upcoming blocks" tone="ink" />
        <StatusCard label="Past 90d" value={past.length} caption="wrapped jobs" tone="dim" />
      </Grid>

      <div style={{ height: 24 }} />

      {/* Upcoming */}
      <section style={{ marginBottom: 24 }}>
        <CapsLabel>Upcoming</CapsLabel>
        <div style={{ marginTop: 10, background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, padding: "0 14px" }}>
          {upcoming.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
          {upcoming.length === 0 && (
            <div style={{ padding: "20px 0", fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted }}>
              No confirmed bookings yet.
            </div>
          )}
        </div>
      </section>

      {/* Availability blocks */}
      <section style={{ marginBottom: 24 }}>
        <CapsLabel>Blocked dates</CapsLabel>
        <div style={{ marginTop: 10, background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, padding: "0 14px" }}>
          {AVAILABILITY_BLOCKS.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderTop: `1px solid ${COLORS.borderSoft}`,
                fontFamily: FONTS.body,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: a.type === "travel" ? COLORS.amber : COLORS.inkMuted,
                }}
              />
              <span style={{ flex: 1, fontSize: 13.5, color: COLORS.ink }}>
                {a.startDate} – {a.endDate}
              </span>
              <span style={{ fontSize: 12, color: COLORS.inkMuted }}>{a.reason}</span>
              <button
                onClick={() => openDrawer("talent-availability", { id: a.id })}
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 7,
                  padding: "4px 9px",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  color: COLORS.inkMuted,
                  cursor: "pointer",
                }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Past */}
      <section>
        <CapsLabel>Recent past</CapsLabel>
        <div style={{ marginTop: 10, background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, padding: "0 14px" }}>
          {past.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </div>
      </section>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// ACTIVITY (earnings + history)
// ════════════════════════════════════════════════════════════════════

function ActivityPage() {
  const { openDrawer } = useProto();
  const total = EARNINGS_ROWS.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    return sum + num;
  }, 0);

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Earnings & history"
        subtitle="Everything you've been paid through Tulala-tracked agencies. Tap a row to see the booking and contract."
        actions={<SecondaryButton onClick={() => openDrawer("talent-payouts")}>Payout settings</SecondaryButton>}
      />

      <Grid cols="3">
        <StatusCard label="Paid YTD" value={`€${total.toLocaleString()}`} caption="across 5 bookings" tone="green" />
        <StatusCard label="Avg booking" value={`€${Math.round(total / 5).toLocaleString()}`} caption="across 5 bookings" tone="ink" />
        <StatusCard label="Top client" value="Net-a-Porter" caption="€3,400 in Feb" tone="dim" />
      </Grid>

      <div style={{ height: 24 }} />

      <CapsLabel>All earnings</CapsLabel>
      <div
        style={{
          marginTop: 10,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr 1.4fr 0.8fr 0.8fr 36px",
            padding: "10px 16px",
            background: "rgba(11,11,13,0.02)",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          <span>Date</span>
          <span>Agency</span>
          <span>Client</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span style={{ textAlign: "right" }}>Status</span>
          <span />
        </div>
        {EARNINGS_ROWS.map((e) => (
          <button
            key={e.id}
            onClick={() => openDrawer("talent-earnings-detail", { id: e.id })}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.4fr 1.4fr 0.8fr 0.8fr 36px",
              padding: "13px 16px",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              background: "transparent",
              border: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              fontFamily: FONTS.body,
              fontSize: 13,
              alignItems: "center",
            }}
          >
            <span style={{ color: COLORS.inkMuted }}>{e.workDate}</span>
            <span style={{ color: COLORS.ink, fontWeight: 500 }}>{e.agency}</span>
            <span style={{ color: COLORS.ink }}>{e.client}</span>
            <span style={{ textAlign: "right", color: COLORS.ink, fontWeight: 600 }}>{e.amount}</span>
            <span style={{ textAlign: "right" }}>
              <span
                style={{
                  display: "inline-flex",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: e.status === "paid" ? "rgba(46,125,91,0.10)" : "rgba(198,138,30,0.10)",
                  color: e.status === "paid" ? "#1F5C42" : "#7E5612",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  textTransform: "capitalize",
                }}
              >
                {e.status}
              </span>
            </span>
            <span style={{ display: "inline-flex", justifyContent: "flex-end" }}>
              <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════

function SettingsPage() {
  const { openDrawer } = useProto();

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Your account"
        subtitle="Agencies, notifications, privacy and payouts."
      />

      <Divider label="Agencies" />
      <Grid cols="auto">
        {MY_AGENCIES.map((a) => (
          <SecondaryCard
            key={a.id}
            title={a.name}
            description={`${a.status === "exclusive" ? "Exclusive" : "Non-exclusive"} · joined ${a.joinedAt}`}
            meta={
              <>
                <StatDot tone={a.isPrimary ? "green" : "ink"} />
                {a.isPrimary ? "Primary" : "Secondary"} · {a.bookingsYTD} bookings
              </>
            }
            affordance="Open relationship"
            onClick={() => openDrawer("talent-agency-relationship", { id: a.id })}
          />
        ))}
        <SecondaryCard
          title="Add another agency"
          description="Get invited via email — agencies onboard talent, not the other way around."
          affordance="Learn more"
          onClick={() => openDrawer("talent-agency-relationship", { mode: "add" })}
        />
      </Grid>

      <Divider label="Account" />
      <Grid cols="2">
        <SecondaryCard
          title="Notifications"
          description="What email and push you get when an agency sends you a request."
          affordance="Manage"
          onClick={() => openDrawer("talent-notifications")}
        />
        <SecondaryCard
          title="Privacy"
          description="Where your profile appears — Tulala hub, agency rosters, public search."
          affordance="Manage"
          onClick={() => openDrawer("talent-privacy")}
        />
        <SecondaryCard
          title="Payouts"
          description="Bank info for direct payouts when an agency uses Tulala billing."
          affordance="Manage"
          onClick={() => openDrawer("talent-payouts")}
        />
        <SecondaryCard
          title="Sign out / leave"
          description="Sign out of your account or end your relationship with an agency."
          affordance="Open"
          onClick={() => openDrawer("talent-leave-agency")}
        />
      </Grid>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// DRAWERS
// ════════════════════════════════════════════════════════════════════

// Helper — close + toast
function useSaveAndClose(message = "Saved") {
  const { closeDrawer, toast } = useProto();
  return () => {
    toast(message);
    closeDrawer();
  };
}

function StandardFooter({
  onSave,
  saveLabel = "Save",
  destructive,
}: {
  onSave?: () => void;
  saveLabel?: string;
  destructive?: { label: string; onClick: () => void };
}) {
  const { closeDrawer } = useProto();
  return (
    <>
      {destructive && (
        <button
          onClick={destructive.onClick}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.red,
            padding: "8px 12px",
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            marginRight: "auto",
          }}
        >
          {destructive.label}
        </button>
      )}
      <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
      {onSave && <PrimaryButton onClick={onSave}>{saveLabel}</PrimaryButton>}
    </>
  );
}

// ─── Today pulse drawer ───────────────────────────────────────────

export function TalentTodayPulseDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-today-pulse";
  const items = TALENT_REQUESTS.filter((r) => r.status === "needs-answer" || r.status === "viewed");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Inbox · what's hot"
      description="Everything from your agencies that's still in motion."
      width={560}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((r) => (
          <button
            key={r.id}
            onClick={() => openDrawer("talent-offer-detail", { id: r.id })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
            }}
          >
            <RequestKindBadge kind={r.kind} status={r.status} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
                {r.client} · {r.brief}
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                via {r.agency}
                {r.date && <> · {r.date}</>}
                {r.amount && <> · {r.amount}</>}
              </div>
            </div>
            <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Offer detail drawer ──────────────────────────────────────────

export function TalentOfferDetailDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-offer-detail" || state.drawer.drawerId === "talent-request-detail";
  const id = (state.drawer.payload?.id as string) ?? "rq1";
  const r = TALENT_REQUESTS.find((x) => x.id === id) ?? TALENT_REQUESTS[0];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${r.client} · ${r.brief}`}
      description={`via ${r.agency}${r.date ? ` · ${r.date}` : ""}`}
      width={560}
      footer={
        r.status === "needs-answer" ? (
          <>
            <button
              onClick={() => {
                toast("Declined — agency notified");
                closeDrawer();
              }}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                color: COLORS.red,
                padding: "8px 12px",
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer",
                marginRight: "auto",
              }}
            >
              Decline
            </button>
            <SecondaryButton
              onClick={() => {
                toast("Marked as 'on hold' for the agency");
                closeDrawer();
              }}
            >
              Hold open
            </SecondaryButton>
            <PrimaryButton
              onClick={() => {
                toast("Accepted — booking will be created when terms are final");
                closeDrawer();
              }}
            >
              Accept
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <KvRow label="Status" value={statusLabel(r.status)} />
        <KvRow label="Date" value={r.date ?? "TBC"} />
        <KvRow label="Fee" value={r.amount ?? "TBC"} />
        <KvRow label="Client" value={r.client} />
        <KvRow label="Agency" value={r.agency} />
        <Divider label="Brief" />
        <p style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, lineHeight: 1.6 }}>
          The agency briefed this as: "<em>{r.brief}</em>". Tap accept to confirm — your agency
          will turn this into a confirmed booking with full call sheet and contract once the
          client locks in. You can also hold open if you want more time.
        </p>
        <Divider label="Terms (preview)" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.7 }}>
          <li>Usage: web + social, 12 months · in-region (Europe)</li>
          <li>Turnaround: deliver same week</li>
          <li>Buyout option: clients can extend usage at +30%</li>
          <li>Cancellation: 50% if &lt; 48h notice</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

function statusLabel(s: TalentRequest["status"]): string {
  return ({
    "needs-answer": "Needs your answer",
    viewed: "Viewed",
    accepted: "Accepted",
    declined: "Declined",
    expired: "Expired",
  } as const)[s];
}

function KvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
          minWidth: 90,
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink }}>{value}</span>
    </div>
  );
}

// ─── Booking detail (call sheet) ──────────────────────────────────

export function TalentBookingDetailDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-booking-detail";
  const id = (state.drawer.payload?.id as string) ?? "bk1";
  const b = TALENT_BOOKINGS.find((x) => x.id === id) ?? TALENT_BOOKINGS[0];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${b.client} · ${b.brief}`}
      description={`Booking via ${b.agency}`}
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Saved to calendar")}>Add to calendar</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Got it</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <KvRow label="Date" value={b.endDate ? `${b.startDate} → ${b.endDate}` : b.startDate} />
        <KvRow label="Call time" value={b.call} />
        <KvRow label="Location" value={b.location} />
        <KvRow label="Fee" value={b.amount} />
        <KvRow label="Status" value={b.status} />
        <Divider label="What to bring" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
          <li>Nude underwear · neutral footwear</li>
          <li>Hair dry & natural · light skin prep only</li>
          <li>Government ID · agency contract reference</li>
        </ul>
        <Divider label="Contacts on the day" />
        <KvRow label="Producer" value="Inés López · +34 612 — 451" />
        <KvRow label="Stylist" value="Lia Roca" />
        <KvRow label="Photographer" value="Studio Roca" />
      </div>
    </DrawerShell>
  );
}

// ─── Profile edit ─────────────────────────────────────────────────

export function TalentProfileEditDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-profile-edit";
  const onSave = useSaveAndClose("Profile saved · agencies notified");
  const p = MY_TALENT_PROFILE;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Edit profile basics"
      description="Changes flow to your public profile and to every agency that has you on roster."
      width={560}
      footer={<StandardFooter onSave={onSave} saveLabel="Save profile" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="Name">
          <TextInput defaultValue={p.name} />
        </FieldRow>
        <FieldRow label="City">
          <TextInput defaultValue={p.city.split(" ·")[0]} />
        </FieldRow>
        <FieldRow label="Height">
          <TextInput defaultValue={p.measurements.split(" · ")[0]} />
        </FieldRow>
        <FieldRow label="Bio" hint="Shown on your public profile and on agency rosters.">
          <TextArea
            defaultValue="Madrid-based · editorial + commercial. Comfortable on movement-heavy shoots, multilingual on set (ES · EN · IT)."
            rows={4}
          />
        </FieldRow>
        <Divider label="Visibility" />
        <ToggleRow label="Show on Tulala hub" hint="Appear in Tulala's curated talent directory." defaultOn={true} />
        <ToggleRow label="Show on public storefronts" hint="Acme Models · Praline London public sites." defaultOn={true} />
      </div>
    </DrawerShell>
  );
}

function ToggleRow({ label, hint, defaultOn }: { label: string; hint?: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn ?? false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <Toggle on={on} onChange={setOn} />
    </div>
  );
}

// ─── Section editor (used for sub-sections of profile) ───────────

export function TalentProfileSectionDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-profile-section";
  const label = (state.drawer.payload?.label as string) ?? "Section";
  const onSave = useSaveAndClose(`${label} saved`);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`Edit · ${label}`}
      description="Update this section. Changes propagate to all your rosters automatically."
      width={520}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="Notes" hint="Field-specific UI lands in production. Prototype shows a textarea.">
          <TextArea rows={6} defaultValue="Edit this section's content here." />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ─── Availability ────────────────────────────────────────────────

export function TalentAvailabilityDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-availability";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Availability"
      description="Your blocks are visible to your agencies — they won't pitch you when you're unavailable."
      width={520}
      footer={<StandardFooter onSave={() => closeDrawer()} saveLabel="Done" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {AVAILABILITY_BLOCKS.map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: a.type === "travel" ? COLORS.amber : COLORS.inkMuted,
              }}
            />
            <span style={{ flex: 1, fontSize: 13.5, color: COLORS.ink }}>
              {a.startDate} – {a.endDate}
            </span>
            <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{a.reason}</span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Block dates ────────────────────────────────────────────────

export function TalentBlockDatesDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-block-dates";
  const onSave = useSaveAndClose("Dates blocked · agencies notified");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Block dates"
      description="Hide yourself from new pitches between these dates. Existing bookings aren't affected."
      width={520}
      footer={<StandardFooter onSave={onSave} saveLabel="Block dates" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="From">
          <TextInput placeholder="May 22, 2026" />
        </FieldRow>
        <FieldRow label="To">
          <TextInput placeholder="May 26, 2026" />
        </FieldRow>
        <FieldRow label="Reason" optional hint="Visible to your agencies.">
          <TextInput placeholder="Travel · personal · other" />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ─── Portfolio manager ───────────────────────────────────────────

export function TalentPortfolioDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-portfolio";
  const onSave = useSaveAndClose("Portfolio updated");
  const shots = ["🌸", "🌊", "🍃", "🌷", "🌹", "🪷", "🌾", "🌺", "🌿", "🌳", "🍂", "🌲"];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Portfolio"
      description="12 / 15 shots. Your agencies favour fresh work — try to keep at least 3 from this year."
      width={620}
      footer={<StandardFooter onSave={onSave} saveLabel="Save order" />}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}
      >
        {shots.map((s, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "3 / 4",
              background: COLORS.cream,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              border: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            {s}
          </div>
        ))}
        <div
          style={{
            aspectRatio: "3 / 4",
            background: "rgba(11,11,13,0.02)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px dashed rgba(11,11,13,0.18)`,
            color: COLORS.inkMuted,
            fontFamily: FONTS.body,
            fontSize: 12,
          }}
        >
          + Add
        </div>
      </div>
    </DrawerShell>
  );
}

// ─── Agency relationship ─────────────────────────────────────────

export function TalentAgencyRelationshipDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-agency-relationship";
  const mode = state.drawer.payload?.mode;
  if (mode === "add") {
    return (
      <DrawerShell
        open={open}
        onClose={closeDrawer}
        title="Add another agency"
        description="On Tulala, agencies invite talent — not the other way around. Forward an invite to your inbox or share your public profile with the agency."
        width={520}
        footer={<SecondaryButton onClick={closeDrawer}>Got it</SecondaryButton>}
      >
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.6 }}>
          Share this URL with the agency you'd like to work with — they can request you onto
          their roster, and you'll see the request in your inbox.
        </div>
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: COLORS.cream,
            border: `1px solid rgba(184,134,11,0.18)`,
            borderRadius: 10,
            fontFamily: FONTS.mono,
            fontSize: 12,
            color: COLORS.ink,
          }}
        >
          {MY_TALENT_PROFILE.publicUrl}
        </div>
      </DrawerShell>
    );
  }
  const id = (state.drawer.payload?.id as string) ?? "ag1";
  const a = MY_AGENCIES.find((x) => x.id === id) ?? MY_AGENCIES[0];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={a.name}
      description={`${a.status === "exclusive" ? "Exclusive" : "Non-exclusive"} relationship · joined ${a.joinedAt}`}
      width={520}
      footer={
        <StandardFooter
          onSave={() => closeDrawer()}
          saveLabel="Done"
          destructive={{ label: "End relationship", onClick: () => openDrawer("talent-leave-agency", { id: a.id }) }}
        />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <KvRow label="Status" value={a.status} />
        <KvRow label="Joined" value={a.joinedAt} />
        <KvRow label="Bookings YTD" value={a.bookingsYTD} />
        <KvRow label="Primary" value={a.isPrimary ? "Yes" : "No"} />
        <Divider label="What this agency can do" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
          <li>Pitch you to clients (you confirm before anything is booked)</li>
          <li>List you on their public roster</li>
          <li>Hold dates on your calendar with your approval</li>
          <li>Send you direct messages via the inbox</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Leave agency ───────────────────────────────────────────────

export function TalentLeaveAgencyDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-leave-agency";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="End relationship"
      description="This is a serious step. Your agency is notified and has 14 days to wind down active bookings."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Keep working with them</SecondaryButton>
          <button
            onClick={() => {
              toast("Notice sent — agency informed");
              closeDrawer();
            }}
            style={{
              background: COLORS.red,
              color: "#fff",
              border: "none",
              padding: "9px 16px",
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Send 14-day notice
          </button>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, lineHeight: 1.6 }}>
        Active bookings stay confirmed and get paid out. New pitches stop immediately. Past
        earnings remain in your activity log. Your agency can't see your inbox or calendar
        once the 14 days are up.
      </div>
    </DrawerShell>
  );
}

// ─── Notifications ──────────────────────────────────────────────

export function TalentNotificationsDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-notifications";
  const onSave = useSaveAndClose("Notification settings saved");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Notifications"
      description="Pick when we email or push notify you. Inbox always shows new requests."
      width={520}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ToggleRow label="New offer · email" hint="When an agency sends you an offer." defaultOn={true} />
        <ToggleRow label="New offer · push" hint="Mobile push notifications." defaultOn={true} />
        <ToggleRow label="Hold expiring soon" hint="When a hold is about to release." defaultOn={true} />
        <ToggleRow label="Booking reminders" hint="24h and 2h before a confirmed booking." defaultOn={true} />
        <ToggleRow label="Payouts" hint="When a booking is paid." defaultOn={false} />
        <ToggleRow label="Weekly summary" hint="Monday digest of last week's activity." defaultOn={false} />
      </div>
    </DrawerShell>
  );
}

// ─── Privacy ────────────────────────────────────────────────────

export function TalentPrivacyDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-privacy";
  const onSave = useSaveAndClose("Privacy saved");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Privacy"
      description="Where you appear, and who can see your full profile."
      width={520}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ToggleRow label="Tulala hub (curated discovery)" hint="Only featured talent are shown." defaultOn={true} />
        <ToggleRow label="Acme Models public roster" defaultOn={true} />
        <ToggleRow label="Praline London public roster" defaultOn={true} />
        <ToggleRow
          label="Search engines (Google etc.)"
          hint="Lets people find your public page from a Google search."
          defaultOn={true}
        />
        <Divider label="Sensitive data" />
        <ToggleRow
          label="Show measurements publicly"
          hint="Off = only agencies + clients you accept can see them."
          defaultOn={true}
        />
      </div>
    </DrawerShell>
  );
}

// ─── Payouts ────────────────────────────────────────────────────

export function TalentPayoutsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-payouts";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Payouts"
      description="Direct deposit when an agency uses Tulala billing. For agencies that pay you directly, nothing changes."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={() => toast("Take this to your agency to enter banking info securely")}>
            Set up via agency
          </PrimaryButton>
        </>
      }
    >
      <div
        style={{
          padding: "14px 16px",
          background: COLORS.cream,
          border: `1px solid rgba(184,134,11,0.18)`,
          borderRadius: 12,
          marginBottom: 14,
        }}
      >
        <CapsLabel color={COLORS.goldDeep}>For your security</CapsLabel>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, marginTop: 6, lineHeight: 1.55 }}>
          We never collect bank details directly inside Tulala's prototype. In production, banking
          is set up via your agency's encrypted Stripe Connect onboarding.
        </div>
      </div>
      <KvRow label="Currency" value="EUR" />
      <KvRow label="Schedule" value="Per-booking · paid 14 days after wrap" />
      <KvRow label="Tax form" value="W-8BEN · pending" />
    </DrawerShell>
  );
}

// ─── Earnings detail ────────────────────────────────────────────

export function TalentEarningsDetailDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-earnings-detail";
  const id = (state.drawer.payload?.id as string) ?? "e1";
  const e = EARNINGS_ROWS.find((x) => x.id === id) ?? EARNINGS_ROWS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${e.client} · ${e.amount}`}
      description={`Paid ${e.payoutDate} via ${e.agency}`}
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <KvRow label="Work date" value={e.workDate} />
        <KvRow label="Paid on" value={e.payoutDate} />
        <KvRow label="Agency" value={e.agency} />
        <KvRow label="Client" value={e.client} />
        <KvRow label="Gross" value={e.amount} />
        <KvRow label="Agency cut" value="20%" />
        <KvRow label="Net to you" value={netOf(e.amount)} />
        <Divider label="Documents" />
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <Icon name="external" size={13} />
          Booking contract.pdf
          <span style={{ marginLeft: "auto", color: COLORS.inkMuted, fontSize: 11.5 }}>2 pages</span>
        </button>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <Icon name="external" size={13} />
          Payout statement.pdf
          <span style={{ marginLeft: "auto", color: COLORS.inkMuted, fontSize: 11.5 }}>1 page</span>
        </button>
      </div>
    </DrawerShell>
  );
}

function netOf(gross: string): string {
  const num = parseFloat(gross.replace(/[^0-9.]/g, "")) || 0;
  const symbol = gross.match(/[^0-9.,\s]/)?.[0] ?? "€";
  return `${symbol}${Math.round(num * 0.8).toLocaleString()}`;
}
