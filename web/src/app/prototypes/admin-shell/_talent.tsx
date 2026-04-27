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
  TalentAnalyticsCard,
  TalentFunnelCard,
  ICalSubscribeCard,
  TalentOnboardingArc,
} from "./_wave2";
import {
  AVAILABILITY_BLOCKS,
  AVAILABLE_CHANNELS,
  CLIENT_TRUST_LEVELS,
  CLIENT_TRUST_META,
  COLORS,
  DEFAULT_CONTACT_POLICY,
  EARNINGS_ROWS,
  EXPOSURE_PRESET_META,
  FONTS,
  INQUIRY_STAGE_META,
  PAYMENT_METHOD_META,
  MY_AGENCIES,
  MY_TALENT_PROFILE,
  POLAROID_SET,
  RICH_INQUIRIES,
  SELECTIVE_CONTACT_POLICY,
  TALENT_BOOKINGS,
  TALENT_CHANNELS,
  TALENT_PAGES,
  TALENT_PAGE_META,
  TALENT_PAGE_TEMPLATES,
  TALENT_REQUESTS,
  TALENT_SPECIALTY_LABEL,
  TALENT_TIER_META,
  pluralize,
  summarizeLanguages,
  tierAllows,
  useProto,
  type ChannelEntry,
  type ChannelKind,
  type ClientTrustLevel,
  type ExposurePreset,
  type RichInquiry,
  type TalentBooking,
  type TalentBadge,
  type TalentContactPolicy,
  type TalentCredit,
  type TalentLink,
  type TalentLimit,
  type TalentMediaEmbed,
  type TalentPage,
  type TalentRequest,
  type TalentReview,
  type TalentSkill,
  type TalentSubscriptionTier,
} from "./_state";
import {
  Affordance,
  Avatar,
  Bullet,
  CapsLabel,
  ClientTrustBadge,
  ClientTrustChip,
  Divider,
  EmptyState,
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
    stage.tone === "amber" ? "rgba(82,96,109,0.10)"
    : stage.tone === "green" ? "rgba(46,125,91,0.10)"
    : stage.tone === "red" ? "rgba(176,48,58,0.08)"
    : "rgba(11,11,13,0.05)";
  const stageFg =
    stage.tone === "amber" ? "#3A4651"
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
    myStatus === "pending" ? "#3A4651"
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
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        position: "relative",
      }}
    >
      {/* Main clickable area — vertical stack so identity, chips and meta
          each get their own line. Easier to scan, breathes at narrow widths. */}
      <button
        onClick={() => openDrawer("inquiry-workspace", { inquiryId: inquiry.id, pov: "talent" })}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 6,
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
        {/* Line 1 — identity. Client name (bold) · brief (muted continuation),
            with the trust chip pinned to the right. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              color: COLORS.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontWeight: 600 }}>{inquiry.clientName}</span>
            <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}> · {inquiry.brief}</span>
          </div>
          <ClientTrustChip level={inquiry.clientTrust} compact />
        </div>

        {/* Line 2 — chip strip. Stage + repeat + unread, all in one row of
            equal-weight pills. Wraps gracefully at narrow widths. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: 999,
              background: stageBg,
              color: stageFg,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {stage.label}
          </span>
          {inquiry.repeatBookings > 0 && (
            <span
              style={{
                fontSize: 10.5,
                color: COLORS.inkMuted,
                background: "rgba(11,11,13,0.06)",
                padding: "2px 8px",
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
                color: "#3A4651",
                background: "rgba(82,96,109,0.12)",
                padding: "2px 8px",
                borderRadius: 999,
                letterSpacing: 0.3,
                flexShrink: 0,
              }}
            >
              {unread} new
            </span>
          )}
        </div>

        {/* Line 3 — meta. Agency, date, fee, last activity. */}
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.inkMuted,
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span>via {inquiry.agencyName}</span>
          {inquiry.date && <><span style={{ color: COLORS.inkDim }}>·</span><span>{inquiry.date}</span></>}
          {inquiry.location && <><span style={{ color: COLORS.inkDim }}>·</span><span>{inquiry.location}</span></>}
          {myLine && <><span style={{ color: COLORS.inkDim }}>·</span><span>{myLine.fee}</span></>}
          <span style={{ color: COLORS.inkDim }}>·</span>
          <span style={{ color: COLORS.inkDim }}>Updated {activityLabel}</span>
        </div>

        {myStatusLabel && (
          <div style={{ fontSize: 11.5, color: myStatusFg, fontWeight: 500 }}>
            {myStatusLabel}
          </div>
        )}
      </button>

      {/* Right rail — Snooze + chevron, centered against the row's first line. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 2 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast("Reminder set for 4h.");
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
        data-tulala-surface-main
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
  const { state, setTalentPage, openDrawer, flipMode } = useProto();
  const profile = MY_TALENT_PROFILE;
  // Hybrid users own a workspace too. We surface a workspace-side unread
  // count so they don't lose track of their roster while in talent mode.
  const workspaceUnread = state.alsoTalent ? 2 : 0;

  return (
    <header
      data-tulala-app-topbar
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
        data-tulala-app-topbar-row
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

        <div data-tulala-topbar-divider style={{ width: 1, height: 22, background: COLORS.borderSoft, margin: "0 8px" }} />

        {/* Page nav */}
        <nav data-tulala-app-topbar-nav aria-label="Talent sections" style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
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
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -16,
                    left: 8,
                    right: 8,
                    height: 3,
                    background: COLORS.ink,
                    borderRadius: 2,
                    opacity: active ? 1 : 0,
                    transform: active ? "scaleX(1)" : "scaleX(0.4)",
                    transformOrigin: "center",
                    transition: "opacity .18s ease, transform .25s cubic-bezier(.4,.0,.2,1)",
                    pointerEvents: "none",
                  }}
                />
              </button>
            );
          })}
        </nav>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Mode toggle — only for hybrid users (alsoTalent && owns workspace).
              Pill: ⚭ Talent · Workspace ⟶ flipMode. The non-active label is
              clickable; the active label sits inside an ink-filled chip. */}
          {state.alsoTalent && (
            <div
              role="tablist"
              aria-label="Switch between talent and workspace mode"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                background: "rgba(11,11,13,0.05)",
                borderRadius: 999,
                padding: 3,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: 500,
              }}
            >
              <button
                role="tab"
                aria-selected="true"
                style={{
                  background: COLORS.ink,
                  color: "#fff",
                  border: "none",
                  borderRadius: 999,
                  padding: "5px 11px",
                  cursor: "default",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: 0.1,
                }}
              >
                Talent
              </button>
              <button
                role="tab"
                aria-selected="false"
                onClick={flipMode}
                style={{
                  background: "transparent",
                  color: COLORS.inkMuted,
                  border: "none",
                  borderRadius: 999,
                  padding: "5px 11px",
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 500,
                  letterSpacing: 0.1,
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                title="Switch to workspace mode (manage your studio/agency)"
              >
                Workspace
                {workspaceUnread > 0 && (
                  <span
                    aria-label={`${workspaceUnread} unread in workspace`}
                    style={{
                      minWidth: 14,
                      height: 14,
                      padding: "0 4px",
                      borderRadius: 999,
                      background: COLORS.accent,
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {workspaceUnread > 9 ? "9+" : workspaceUnread}
                  </span>
                )}
              </button>
            </div>
          )}
          {/* Notifications bell — matches the workspace topbar pattern.
              Numbered badge with the unread count, capped at 9+. */}
          {(() => {
            const unread = 4; // mock count: 2 offers + 1 hold expiring + 1 mention
            const iconBtn: React.CSSProperties = {
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
            };
            return (
              <button
                onClick={() => openDrawer("talent-notifications")}
                aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
                style={iconBtn}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
                  <path d="M10 21a2 2 0 0 0 4 0" />
                </svg>
                {unread > 0 && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: -3,
                      right: -3,
                      minWidth: 16,
                      height: 16,
                      padding: "0 4px",
                      borderRadius: 999,
                      background: COLORS.accent,
                      color: "#fff",
                      fontSize: 9.5,
                      fontWeight: 700,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 0 2px #fff",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })()}
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
            Preview public profile
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
    case "reach":
      return <ReachPage />;
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
    <div data-tulala-page-header style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <h1
          data-tulala-h1
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
      {actions && (
        <div data-tulala-page-header-actions style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {actions}
        </div>
      )}
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
    <div data-tulala-grid={cols} style={{ display: "grid", gridTemplateColumns: colMap[cols], gap: 12 }}>{children}</div>
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
  const paidThisMonth = EARNINGS_ROWS.filter((e) => e.payoutDate.includes("Apr"));
  const paidThisMonthTotal = paidThisMonth.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const paidThisMonthCurrency = paidThisMonth[0]?.amount.match(/[€£$]/)?.[0] ?? "€";
  const mine = myInquiries();
  const mineNeedsMe = mine.filter((i) => myStatusOn(i) === "pending");
  const mineInProgress = mine.filter((i) => myStatusOn(i) !== "pending");
  const pendingCount = mineNeedsMe.length + needsAnswer.length;
  // Top 2 pending items as name + click → drawer. Names render as inline
  // clickable links in the hero headline. Direct route to action.
  const pendingTargets: { name: string; onClick: () => void }[] = [
    ...needsAnswer.map((r) => ({
      name: r.client,
      onClick: () => openDrawer("talent-offer-detail", { id: r.id }),
    })),
    ...mineNeedsMe.map((i) => ({
      name: i.clientName,
      onClick: () =>
        openDrawer("inquiry-workspace", { inquiryId: i.id, pov: "talent" }),
    })),
  ].slice(0, 2);

  // Jump to the first pending item when "Reply now" is clicked — one
  // hop instead of "go to inbox, find the top item, click it."
  const firstPending = pendingTargets[0];

  return (
    <>
      {/* Profile-completeness banner — only when below the visibility
          threshold. Indigo soft (info, not urgent) with a clear CTA.
          Auto-disappears at >= 80% so it never becomes wallpaper. */}
      {profile.completeness < 80 && (
        <ProfileCompletenessBanner
          percent={profile.completeness}
          missing={profile.missing}
          onFinish={() => openDrawer("talent-profile-edit")}
        />
      )}

      <TalentTodayHero
        firstName={profile.name.split(" ")[0]}
        pendingCount={pendingCount}
        pendingTargets={pendingTargets}
        upcomingCount={upcoming.length}
        nextBookingDate={upcoming[0]?.startDate}
        paidThisMonth={paidThisMonthTotal}
        paidCurrency={paidThisMonthCurrency}
        profileCompleteness={profile.completeness}
        currentLocation={profile.currentLocation}
        availableForWork={profile.availableForWork}
        availableToTravel={profile.availableToTravel}
        // Day-1 = no work history at all yet. Hero shifts to welcome tone.
        isDay1={
          upcoming.length === 0 &&
          paidThisMonthTotal === 0 &&
          mine.length === 0 &&
          needsAnswer.length === 0
        }
        onReplyNow={
          firstPending
            ? firstPending.onClick
            : () => setTalentPage("inbox")
        }
        onAvailability={() => openDrawer("talent-block-dates")}
        onOpenProfile={() => openDrawer("talent-profile-edit")}
      />

      {/* Order rationale (Tier 2 audit): group temporally.
            Forward-facing first  → Needs reply, Inquiries (in flight), Calendar
            Backward-facing after → Earnings, Profile views (looking back, 2-up)
          The eye flows top-to-bottom in the same direction as the data. */}

      {/* 1 — Needs reply. The ONLY action-needed feed on the page.
            Coral edge container; only renders when pending > 0. */}
      {pendingCount > 0 && (
        <NeedsReplySection
          requests={needsAnswer}
          inquiries={mineNeedsMe}
          onSeeAll={() => setTalentPage("inbox")}
        />
      )}

      {/* 2 — Inquiries you're competing in (in-flight pipeline).
            Promoted directly under Needs-reply per audit feedback —
            these are kin (both forward-looking, both pipeline state). */}
      {mineInProgress.length > 0 && <TalentFunnelCard />}

      <div style={{ height: 12 }} />

      {/* 3 — Calendar (forward-facing). */}
      <section
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "16px 18px",
        }}
      >
        <SectionHeader
          title="Next on the calendar"
          subtitle={
            upcoming.length === 0
              ? "No confirmed bookings yet."
              : `${upcoming.length} upcoming · ${upcoming[0]?.startDate}`
          }
          actionLabel="See calendar →"
          onAction={() => setTalentPage("calendar")}
          secondaryActionLabel="+ Add manually"
          onSecondaryAction={() => openDrawer("talent-add-event")}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {upcoming.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </div>
      </section>

      <div style={{ height: 12 }} />

      {/* 4 + 5 — Looking back: earnings + analytics, paired in a 2-up.
            Both are reflective surfaces (what already happened / how it's
            performing), so they share a row at the bottom of the page. */}
      <Grid cols="2">
        {/* Recent earnings — plain section, NOT a SecondaryCard, so the
            EarningRow buttons inside aren't nested in a parent button.
            The "See activity" affordance lives in the section header. */}
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "16px 18px",
          }}
        >
          <SectionHeader
            title="Recent earnings"
            subtitle={`${paidCurrencyAndTotal(paidThisMonthCurrency, paidThisMonthTotal)} this month · ${paidThisMonth.length} payout${paidThisMonth.length !== 1 ? "s" : ""}`}
            actionLabel="See activity →"
            onAction={() => setTalentPage("activity")}
            secondaryActionLabel="+ Log work"
            onSecondaryAction={() =>
              openDrawer("talent-add-event", { mode: "work" })
            }
          />
          <div style={{ marginTop: 4 }}>
            {EARNINGS_ROWS.slice(0, 3).map((e) => (
              <EarningRow key={e.id} earning={e} />
            ))}
          </div>
        </section>
        <TalentAnalyticsCard />
      </Grid>
    </>
  );
}

// ─── Talent Today helpers ──────────────────────────────────────────

function paidCurrencyAndTotal(currency: string, total: number) {
  return `${currency}${total.toLocaleString()}`;
}

/**
 * Slim banner above the hero when the talent's profile is below the
 * "Verified visibility" threshold. Indigo soft = info, not urgent.
 * Disappears at >= 80% so it never becomes wallpaper.
 */
function ProfileCompletenessBanner({
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
      <div style={{ flex: 1, minWidth: 0 }}>
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
 * Clickable past-earning row → opens TalentClosedBookingDrawer with the
 * archived team, chat, and booking facts. Each completed booking becomes
 * a portfolio entry the talent can revisit.
 *
 * Uses a client AVATAR on the left (initials + auto-tinted brand color)
 * — date is secondary information for past bookings; brand identity is
 * what the talent actually scans for. Same avatar pattern used by
 * "Inquiries you're in" rows.
 */
function EarningRow({ earning }: { earning: typeof EARNINGS_ROWS[number] }) {
  const { openDrawer } = useProto();
  // Brief lives in the closed-booking detail mock; surfaces what the
  // booking actually was so the row scans like every other Today row
  // ("client · brief" on line 1).
  const brief = MOCK_CLOSED_DETAIL[earning.id]?.brief;
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
        transition: "background .12s",
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
          <span>{earning.client}</span>
          {brief && (
            <>
              <span style={{ color: COLORS.inkDim }}>·</span>
              <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>{brief}</span>
            </>
          )}
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
function clientInitialsLocal(name: string): string {
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
function DateBlock({
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
          letterSpacing: 0.5,
          textTransform: "uppercase",
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
function KindChip({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "coral" | "indigo" | "amber" | "ink";
}) {
  const palette = {
    success: { bg: "rgba(46,125,91,0.10)", fg: COLORS.green },
    coral: { bg: COLORS.coralSoft, fg: COLORS.coral },
    indigo: { bg: COLORS.indigoSoft, fg: COLORS.indigo },
    amber: { bg: "rgba(82,96,109,0.10)", fg: "#3A4651" },
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
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Compact section header used across Talent Today blocks.
 * Title + subtitle on the left, optional action link on the right.
 */
function SectionHeader({
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
    success: { bg: "rgba(46,125,91,0.10)", fg: COLORS.green },
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
      <div style={{ flex: 1, minWidth: 0 }}>
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
function TalentTodayHero({
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
}: {
  firstName: string;
  pendingCount: number;
  pendingTargets: { name: string; onClick: () => void }[];
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
    subline = "Top of inbox first.";
  }

  return (
    <section
      style={{
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
              marginBottom: 4,
            }}
          >
            Hi {firstName}
          </div>
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
            {headlineParts}
          </h1>
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 13.5,
              color: COLORS.inkMuted,
              marginTop: 6,
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
        />
        <HeroStatDivider />
        <HeroStat
          label="Paid this month"
          value={`${paidCurrency}${paidThisMonth.toLocaleString()}`}
          caption="+€800 vs prior 30d"
          captionTone="success"
          tone="ink"
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
  pendingTargets: { name: string; onClick: () => void }[];
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
          background: COLORS.ink,
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
          background: COLORS.ink,
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
                letterSpacing: 0.5,
                textTransform: "uppercase",
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

/** Inline clickable name in the hero headline — underlined on hover.
 *  Teaches the user that names are entry points to their detail drawer. */
function HeroNameLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        font: "inherit",
        color: COLORS.ink,
        cursor: "pointer",
        textDecoration: hover ? "underline" : "none",
        textDecorationThickness: 1,
        textUnderlineOffset: 4,
        textDecorationColor: COLORS.coral,
      }}
    >
      {children}
    </button>
  );
}

function HeroStat({
  label,
  value,
  caption,
  captionTone,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  caption?: string;
  /** Caption tint — `success` for positive deltas, default ink-dim. */
  captionTone?: "success" | "indigo" | "coral" | "default";
  tone: "success" | "indigo" | "ink";
  onClick?: () => void;
}) {
  const fg =
    tone === "success" ? COLORS.green : tone === "indigo" ? COLORS.indigo : COLORS.ink;
  const captionColor =
    captionTone === "success"
      ? COLORS.green
      : captionTone === "indigo"
        ? COLORS.indigo
        : captionTone === "coral"
          ? COLORS.coral
          : COLORS.inkDim;
  const inner = (
    <>
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            fontWeight: 500,
            color: fg,
            letterSpacing: -0.2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {caption && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: captionColor,
              fontWeight: captionTone === "success" ? 500 : 400,
            }}
          >
            {caption}
          </span>
        )}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 0,
      }}
    >
      {inner}
    </div>
  );
}

function HeroStatDivider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 28,
        background: COLORS.borderSoft,
        margin: "0 14px",
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Single-grain "Needs reply" list. Coral edge to mark action-needed.
 * All rows here require the talent's reply — no in-progress pipeline,
 * no completed updates, no analytics. One section, one job.
 */
function NeedsReplySection({
  requests,
  inquiries,
  onSeeAll,
}: {
  requests: TalentRequest[];
  inquiries: RichInquiry[];
  onSeeAll: () => void;
}) {
  const total = requests.length + inquiries.length;
  // Single section card — same anatomy as every other Today section.
  // The action-needed signal is carried by the per-row coral KindChip
  // (OFFER / HOLD), not by an extra container-level edge marker. One
  // signal per concept; the page reads as one unified rhythm.
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      <SectionHeader
        title="Needs your reply"
        subtitle={`${total} waiting · sorted by urgency`}
        actionLabel="Open inbox →"
        onAction={onSeeAll}
      />
      <div style={{ marginTop: 4 }}>
        {requests.map((r) => (
          <RequestRow key={r.id} request={r} compact />
        ))}
        {inquiries.map((i) => (
          <InquiryRow key={i.id} inquiry={i} />
        ))}
      </div>
    </section>
  );
}

function RequestRow({
  request,
  compact = false,
}: {
  request: TalentRequest;
  /**
   * Compact mode for high-density surfaces (Talent Today). Drops:
   *   - ClientTrustChip (already-vetted context — noise on Today)
   *   - "via {agency}" prefix (single-agency talent — redundant)
   * Adds:
   *   - Coral-escalated timestamp when age > 12h (urgency cue)
   *   - Hover "Reply" button (per-row primary affordance)
   *   - Date block on the left (Calendar event-row pattern)
   */
  compact?: boolean;
}) {
  const { openDrawer } = useProto();
  const [hover, setHover] = useState(false);
  const kindMeta: Record<TalentRequest["kind"], { label: string; tone: "coral" | "indigo" | "amber" | "ink" }> = {
    offer: { label: "Offer", tone: "coral" },
    hold: { label: "Hold", tone: "coral" },
    casting: { label: "Casting", tone: "indigo" },
    request: { label: "Request", tone: "ink" },
  };
  const km = kindMeta[request.kind];
  // Parse the request date for the date block. Handles "Tue · May 6",
  // "May 18–20", "Apr 30" formats.
  const dateMatch = request.date?.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const month = dateMatch?.[1]?.toUpperCase();
  const day = dateMatch?.[2];
  // Timestamp urgency: 0–12h neutral, 12–24h coral, >24h coral bold.
  // Pressure rises with time.
  const ageLabel =
    request.ageHrs < 24 ? `${request.ageHrs}h ago` : `${Math.floor(request.ageHrs / 24)}d ago`;
  const ageColor =
    request.ageHrs >= 24
      ? COLORS.coral
      : request.ageHrs >= 12
        ? COLORS.coral
        : COLORS.inkDim;
  const ageWeight = request.ageHrs >= 24 ? 600 : request.ageHrs >= 12 ? 500 : 400;
  return (
    <button
      onClick={() => openDrawer("talent-offer-detail", { id: request.id })}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
        transition: "background .12s",
      }}
    >
      {/* Client avatar on the left — same pattern as "Inquiries you're
          in" + Recent earnings. Brand identity is what the talent scans
          for; date / kind move to the second meta line. Falls back to the
          KindChip-leading layout when not in compact mode (legacy use
          on other surfaces). */}
      {compact ? (
        <Avatar
          size={36}
          tone="auto"
          hashSeed={request.client}
          initials={clientInitialsLocal(request.client)}
        />
      ) : (
        <KindChip label={km.label} tone={km.tone} />
      )}
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
          {!compact && <ClientTrustChip level={request.clientTrust} compact />}
          <Bullet />
          <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>{request.brief}</span>
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
          {compact && <KindChip label={km.label} tone={km.tone} />}
          <span style={{ color: COLORS.inkMuted }}>
            {!compact && (
              <>
                via {request.agency}
                {(request.date || request.amount) && " · "}
              </>
            )}
            {request.date}
            {request.date && request.amount && " · "}
            {request.amount}
          </span>
        </div>
      </div>
      {/* Hover Reply button — per-row primary affordance.
          Click opens the offer detail drawer (same target as the row), but
          the explicit "Reply" label teaches the action. After ~5 exposures
          the user reaches for it directly instead of scanning. */}
      {compact && hover && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 10px",
            borderRadius: 7,
            background: COLORS.coralSoft,
            color: COLORS.coralDeep,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: -0.05,
          }}
        >
          Reply →
        </span>
      )}
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: 11.5,
          color: ageColor,
          fontWeight: ageWeight,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {ageLabel}
      </span>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

function BookingRow({ booking }: { booking: TalentBooking }) {
  const { openDrawer } = useProto();
  // Parse "Tue, May 6" or "May 14" → month "MAY", day "6" / "14".
  const dateMatch = booking.startDate.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const month = dateMatch?.[1]?.toUpperCase() ?? "—";
  const day = dateMatch?.[2] ?? "—";
  return (
    <button
      onClick={() => openDrawer("talent-booking-detail", { id: booking.id })}
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
        fontFamily: FONTS.body,
        transition: "background .12s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <DateBlock day={day} month={month} />
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
          <span>{booking.client}</span>
          <span style={{ color: COLORS.inkDim }}>·</span>
          <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>{booking.brief}</span>
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
          <KindChip label="Booked" tone="success" />
          <span style={{ color: COLORS.inkMuted }}>
            {booking.location} · call {booking.call}
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
        {booking.amount}
      </span>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// MY PROFILE — talent comp-card surface.
// Designed to mirror the breadth of an industry comp card: identity,
// physicality, capability, history, trust, commercial. Each band has
// its own dedicated drawer; the overall page is the "agency book entry"
// the talent uses as their professional shopfront.
// ════════════════════════════════════════════════════════════════════

function MyProfilePage() {
  const { openDrawer } = useProto();
  const p = MY_TALENT_PROFILE;
  const m = p.measurements;

  // B2: Map missing fields to the drawer that completes them. Lets the
  // banner offer one-click fix-it actions, not just a list.
  const missingFieldRoutes: { label: string; drawer: string; payload?: Record<string, unknown> }[] =
    p.missing.map((field) => {
      const lower = field.toLowerCase();
      if (lower.includes("polaroid")) return { label: field, drawer: "talent-polaroids" };
      if (lower.includes("rate card")) return { label: field, drawer: "talent-rate-card" };
      if (lower.includes("showreel")) return { label: field, drawer: "talent-showreel" };
      if (lower.includes("measurement")) return { label: field, drawer: "talent-measurements" };
      if (lower.includes("document")) return { label: field, drawer: "talent-documents" };
      if (lower.includes("portfolio")) return { label: field, drawer: "talent-portfolio" };
      // Default — open the basics drawer
      return { label: field, drawer: "talent-profile-edit" };
    });

  return (
    <>
      <PageHeader
        eyebrow="My profile"
        title={p.name}
        subtitle={`${p.measurementsSummary} · ${p.city}. Published since ${p.publishedAt}.`}
        actions={
          <>
            <SecondaryButton onClick={() => openDrawer("talent-public-preview")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="external" size={11} /> Preview as client
              </span>
            </SecondaryButton>
            <PrimaryButton onClick={() => openDrawer("talent-profile-edit")}>Edit profile</PrimaryButton>
          </>
        }
      />

      {/* B2: Profile Health banner — single destination for the hero
          completeness stat. Renders only when < 100. Each missing field
          is a clickable chip that jumps to the relevant drawer. */}
      {p.completeness < 100 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 18px",
            marginBottom: 16,
            background: COLORS.indigoSoft,
            border: `1px solid rgba(91,107,160,0.18)`,
            borderRadius: 12,
            fontFamily: FONTS.body,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#fff",
              border: `2px solid ${COLORS.indigo}`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 600,
              color: COLORS.indigoDeep,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {p.completeness}%
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.indigoDeep,
                marginBottom: 2,
              }}
            >
              {100 - p.completeness}% from full health · {missingFieldRoutes.length} field{missingFieldRoutes.length === 1 ? "" : "s"} left
            </div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.indigoDeep,
                opacity: 0.8,
                marginBottom: 8,
              }}
            >
              Complete profiles get higher placement on agency rosters and the Tulala hub.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {missingFieldRoutes.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => openDrawer(r.drawer as "talent-profile-edit", r.payload)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 11px",
                    background: "#fff",
                    border: `1px solid rgba(91,107,160,0.30)`,
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: COLORS.indigoDeep,
                  }}
                >
                  <Icon name="plus" size={10} stroke={2} color={COLORS.indigoDeep} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Hero band ──────────────────────────────────────────────── */}
      <ProfileHero />

      {/* ── Engagement strip ──────────────────────────────────────── */}
      <div style={{ marginTop: 20 }}>
        <EngagementStrip />
      </div>

      {/* ── Completeness + Public URL ─────────────────────────────── */}
      <div style={{ marginTop: 20 }}>
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
                  {p.missing.map((mItem) => (
                    <li
                      key={mItem}
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
                      {mItem}
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
                background: COLORS.surfaceAlt,
                borderRadius: 10,
                border: `1px solid rgba(15,79,62,0.18)`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon name="external" size={12} color={COLORS.accentDeep} />
              <span style={{ fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.ink }}>{p.publicUrl}</span>
            </div>
          </PrimaryCard>
        </Grid>
      </div>

      {/* ── Visual identity (cover · headshot · polaroids · showreel) ── */}
      <Divider label="Visual identity" />
      <Grid cols="3">
        <SecondaryCard
          title="Cover photo"
          description="The hero shot at the top of your public profile. Landscape, 16:9 ideal."
          meta={<><StatDot tone="green" /> 1 image set</>}
          affordance="Replace cover"
          onClick={() => openDrawer("talent-photo-edit", { which: "cover" })}
        />
        <SecondaryCard
          title="Headshot"
          description="The single shot used everywhere — agency rosters, Tulala hub, search results."
          meta={<><StatDot tone="green" /> 1 image set</>}
          affordance="Replace headshot"
          onClick={() => openDrawer("talent-photo-edit", { which: "headshot" })}
        />
        <SecondaryCard
          title="Polaroids · naturals"
          description={`Front · Side · Back · Smile · No-makeup. ${POLAROID_SET.filter(x => x.thumb !== "—").length} of 5 set — coordinators ask for these first.`}
          meta={<><StatDot tone={POLAROID_SET.every(x => x.thumb !== "—") ? "green" : "amber"} /> {POLAROID_SET.filter(x => x.thumb !== "—").length}/5</>}
          affordance="Manage polaroids"
          onClick={() => openDrawer("talent-polaroids")}
        />
        <SecondaryCard
          title="Portfolio"
          description="12 / 15 styled shots. Your agencies favour fresh work — keep at least 3 from this year."
          meta={<><StatDot tone="amber" /> Needs 3 from 2026</>}
          affordance="Manage portfolio"
          onClick={() => openDrawer("talent-portfolio")}
        />
        <SecondaryCard
          title="Showreel"
          description={p.showreelThumb ? `${p.showreelDuration} clip · used for casting requests with movement, dialogue, or runway.` : "Add a 30-60s clip — opens up acting + dance + runway leads."}
          meta={p.showreelThumb ? <><StatDot tone="green" /> {p.showreelDuration}</> : <><StatDot tone="dim" /> Not set</>}
          affordance="Open showreel"
          onClick={() => openDrawer("talent-showreel")}
        />
        <SecondaryCard
          title="Mood / vibe board"
          description="Pin 6-9 references for the kind of work you want more of. Agencies use this to pitch you smarter."
          meta={<><StatDot tone="dim" /> Optional</>}
          affordance="Set mood board"
          onClick={() => openDrawer("talent-profile-section", { sectionId: "mood-board", label: "Mood board" })}
        />
      </Grid>

      {/* ── Physicality (measurements + features) ─────────────────── */}
      <Divider label="Physicality" />
      <PrimaryCard
        title="Measurements & features"
        description="Height · sizes · features. Visible to agencies and clients you're shortlisted by."
        icon={<Icon name="user" size={14} stroke={1.7} />}
        affordance="Edit measurements"
        onClick={() => openDrawer("talent-measurements")}
      >
        <div style={{ marginTop: 12 }}>
          <MeasurementsTable />
        </div>
      </PrimaryCard>

      {/* ── Capability (specialties · skills · languages · limits) ── */}
      <Divider label="Capability" />
      <Grid cols="2">
        <SecondaryCard
          title="Specialties"
          description="What kinds of work fit you — drives discovery filters."
          meta={`${p.specialties.length} chosen`}
          affordance="Edit specialties"
          onClick={() => openDrawer("talent-profile-section", { sectionId: "specialties", label: "Specialties" })}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
            {p.specialties.map((s) => (
              <ProfileChip key={s} label={TALENT_SPECIALTY_LABEL[s]} tone="ink" />
            ))}
          </div>
        </SecondaryCard>
        <SecondaryCard
          title="Languages"
          description={summarizeLanguages(p.languages)}
          meta={`${p.languages.length} languages`}
          affordance="Edit languages"
          onClick={() => openDrawer("talent-profile-section", { sectionId: "languages", label: "Languages" })}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
            {p.languages.map((l) => (
              <ProfileChip
                key={l.language}
                label={`${l.language} · ${l.level}`}
                tone={l.level === "native" ? "green" : l.level === "fluent" ? "ink" : "dim"}
              />
            ))}
          </div>
        </SecondaryCard>
        <SecondaryCard
          title="Skills"
          description="Movement · sport · voice · instruments. Triggers casting filters for active leads."
          meta={`${p.skills.length} skills`}
          affordance="Edit skills"
          onClick={() => openDrawer("talent-skills")}
          fullHeight
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {p.skills.slice(0, 5).map((s, i) => (
              <SkillRow key={i} skill={s} />
            ))}
            {p.skills.length > 5 && (
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                +{p.skills.length - 5} more
              </span>
            )}
          </div>
        </SecondaryCard>
        <SecondaryCard
          title="Wardrobe & limits"
          description="Hard limits block pitches. Soft limits ask for a confirmation."
          meta={
            <>
              <StatDot tone="amber" />
              {p.limits.filter((l) => l.enforcement === "hard").length} hard ·{" "}
              {p.limits.filter((l) => l.enforcement === "soft").length} soft
            </>
          }
          affordance="Edit limits"
          onClick={() => openDrawer("talent-limits")}
          fullHeight
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
            {p.limits.slice(0, 5).map((l) => (
              <LimitRow key={l.id} limit={l} />
            ))}
          </div>
        </SecondaryCard>
      </Grid>

      {/* ── History (credits · runway · reviews · stats) ──────────── */}
      <Divider label="History & track record" />
      <Grid cols="2">
        <SecondaryCard
          title="Credits & tearsheet"
          description={`${p.credits.length} entries · ${p.credits.filter(c => c.pinned).length} pinned. Pinned credits show on the public profile.`}
          meta={`Most recent: ${p.credits[0].brand}`}
          affordance="Manage credits"
          onClick={() => openDrawer("talent-credits")}
          fullHeight
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {p.credits.filter((c) => c.pinned).slice(0, 3).map((c) => (
              <CreditRow key={c.id} credit={c} />
            ))}
          </div>
        </SecondaryCard>
        <SecondaryCard
          title="Reviews & endorsements"
          description="Testimonials from booked clients and producers. Auto-requested after wrapped shoots."
          meta={
            <>
              <StatDot tone="green" />
              {p.reviews.length} reviews · ★ {(p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length).toFixed(1)}
            </>
          }
          affordance="Open reviews"
          onClick={() => openDrawer("talent-reviews")}
          fullHeight
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {p.reviews.slice(0, 2).map((r) => (
              <ReviewSnippet key={r.id} review={r} />
            ))}
          </div>
        </SecondaryCard>
        <PrimaryCard
          title="Booking record"
          description="What an agency or client sees when they short-list you."
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
              marginTop: 12,
            }}
          >
            <BookingStatCell label="Bookings" value={p.bookingStats.completedBookings.toString()} accent="ink" />
            <BookingStatCell label="On time" value={`${p.bookingStats.onTimeRate}%`} accent={p.bookingStats.onTimeRate === 100 ? "green" : "amber"} />
            <BookingStatCell label="Repeat clients" value={p.bookingStats.repeatClients.toString()} accent="ink" />
            <BookingStatCell label="Years active" value={p.bookingStats.yearsActive.toString()} accent="dim" />
          </div>
        </PrimaryCard>
      </Grid>

      {/* ── Trust (badges · documents) ─────────────────────────────── */}
      <Divider label="Trust & verification" />
      <PrimaryCard
        title="Badges"
        description="Each badge proves a specific check. Clients filter on these."
        icon={<Icon name="check" size={14} stroke={1.8} />}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {p.badges.map((b) => (
            <BadgeChip key={b.kind} badge={b} />
          ))}
        </div>
      </PrimaryCard>
      <div style={{ marginTop: 12 }}>
        <Grid cols="2">
          <SecondaryCard
            title="Documents"
            description="ID · tax · health & safety. Stored encrypted; only shared during active bookings."
            meta={
              <>
                <StatDot tone={p.documents.some((d) => d.state === "missing") ? "amber" : "green"} />
                {p.documents.filter((d) => d.state === "uploaded").length}/{p.documents.length} uploaded
              </>
            }
            affordance="Manage documents"
            onClick={() => openDrawer("talent-documents")}
          />
          <SecondaryCard
            title="Emergency contact"
            description="Used by agencies during active bookings only — never shown publicly."
            meta={`${p.emergencyContact.name} · ${p.emergencyContact.relation}`}
            affordance="Update contact"
            onClick={() => openDrawer("talent-emergency-contact")}
          />
        </Grid>
      </div>

      {/* ── Commercial (rate card · travel · social) ─────────────── */}
      <Divider label="Commercial" />
      <Grid cols="2">
        <SecondaryCard
          title="Rate card"
          description={`${p.rateCard.lines.length} usage tiers · visibility: ${p.rateCard.visibility.replace("-", " ")}.`}
          meta={
            p.rateCard.visibility === "public"
              ? <><StatDot tone="green" /> Visible to clients</>
              : p.rateCard.visibility === "agency-only"
                ? <><StatDot tone="amber" /> Agency only</>
                : <><StatDot tone="dim" /> On request</>
          }
          affordance="Edit rate card"
          onClick={() => openDrawer("talent-rate-card")}
          fullHeight
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {p.rateCard.lines.slice(0, 3).map((l, i) => (
              <RateLine key={i} label={l.label} range={l.range} />
            ))}
          </div>
        </SecondaryCard>
        <SecondaryCard
          title="Travel & work auth"
          description={`Based in ${p.travel.basedIn}. ${p.travel.workAuth.length} work authorizations.`}
          meta={
            <>
              <StatDot tone="green" />
              {p.travel.willingTravel}
            </>
          }
          affordance="Edit travel"
          onClick={() => openDrawer("talent-travel")}
          fullHeight
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
            {p.travel.workAuth.slice(0, 3).map((a) => (
              <ProfileChip key={a} label={a} tone="dim" />
            ))}
            {p.travel.workAuth.length > 3 && (
              <ProfileChip label={`+${p.travel.workAuth.length - 3}`} tone="dim" />
            )}
          </div>
        </SecondaryCard>
      </Grid>
      <div style={{ marginTop: 12 }}>
        <SecondaryCard
          title="External links"
          description="Instagram, TikTok, IMDb — your audience on other platforms. Surfaces follower counts on the public profile."
          meta={`${p.links.length} links`}
          affordance="Edit links"
          onClick={() => openDrawer("talent-links")}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {p.links.map((l) => (
              <LinkChip key={l.kind} link={l} />
            ))}
          </div>
        </SecondaryCard>
      </div>

      {/* ── Personal page (premium subscription tier) ────────────────
       *
       * This band is the surface for Tulala's direct-to-talent
       * subscription. It coexists with — does NOT replace — agency
       * roster + hub presence. Locked features show a tier badge
       * and route through the upgrade drawer rather than the editor.
       */}
      <Divider label="Personal page" />
      <PersonalPageBand />

      {/* ── Visibility & availability (existing) ───────────────────── */}
      <Divider label="Visibility & availability" />
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

// ─── Hero (cover photo + headshot + identity strip) ─────────────────

function ProfileHero() {
  const { openDrawer } = useProto();
  const p = MY_TALENT_PROFILE;

  return (
    <section
      style={{
        position: "relative",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {/* Cover photo */}
      <div
        style={{
          position: "relative",
          height: 180,
          background: `linear-gradient(180deg, ${COLORS.surfaceAlt} 0%, rgba(15,79,62,0.18) 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 72,
          letterSpacing: 8,
        }}
      >
        <span style={{ filter: "saturate(0.8)" }}>{p.coverPhoto}</span>
        <button
          onClick={() => openDrawer("talent-photo-edit", { which: "cover" })}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(11,11,13,0.55)",
            color: "#fff",
            border: "none",
            padding: "5px 10px",
            borderRadius: 999,
            fontFamily: FONTS.body,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(6px)",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            letterSpacing: 0.3,
          }}
        >
          <Icon name="palette" size={11} stroke={2} color="#fff" /> Replace cover
        </button>
      </div>

      {/* Identity strip */}
      <div style={{ padding: "0 24px 22px", position: "relative" }}>
        {/* Avatar overlapping the cover */}
        <button
          onClick={() => openDrawer("talent-photo-edit", { which: "headshot" })}
          style={{
            position: "absolute",
            top: -52,
            left: 24,
            width: 104,
            height: 104,
            borderRadius: "50%",
            background: COLORS.surfaceAlt,
            border: `4px solid #fff`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 50,
            cursor: "pointer",
            boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)",
            padding: 0,
          }}
          aria-label="Edit headshot"
        >
          <span>{p.profilePhoto}</span>
          <span
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: COLORS.ink,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
            }}
          >
            <Icon name="palette" size={11} stroke={2} color="#fff" />
          </span>
        </button>

        <div style={{ paddingTop: 64, display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <h2
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 26,
                  fontWeight: 500,
                  letterSpacing: -0.5,
                  margin: 0,
                  color: COLORS.ink,
                }}
              >
                {p.name}
              </h2>
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  color: COLORS.inkMuted,
                  fontWeight: 500,
                  padding: "2px 8px",
                  background: "rgba(11,11,13,0.04)",
                  borderRadius: 999,
                }}
              >
                {p.pronouns} · {p.age}
              </span>
              <TierPill tier={p.subscription.tier} onClick={() => openDrawer("talent-tier-compare")} />
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: FONTS.body,
                fontSize: 13.5,
                color: COLORS.inkMuted,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span>{p.measurementsSummary}</span>
              <Bullet />
              <span>{p.city}</span>
              <Bullet />
              <span>{p.primaryAgency}</span>
            </div>

            {/* Specialties chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
              {p.specialties.map((s) => (
                <ProfileChip key={s} label={TALENT_SPECIALTY_LABEL[s]} tone="ink" />
              ))}
            </div>
          </div>

          {/* Trust badges column */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              maxWidth: 280,
            }}
          >
            <CapsLabel>Trust</CapsLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {p.badges.slice(0, 4).map((b) => (
                <BadgeChip key={b.kind} badge={b} compact />
              ))}
              {p.badges.length > 4 && (
                <span
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 11,
                    color: COLORS.inkMuted,
                    padding: "3px 8px",
                  }}
                >
                  +{p.badges.length - 4}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Engagement strip (rank · views · inquiries · trend) ────────────

function EngagementStrip() {
  const p = MY_TALENT_PROFILE;
  const items: { label: string; value: string; sub?: string; tone: "ink" | "green" | "amber" }[] = [
    { label: "Tulala discover rank", value: `#${p.discoverRank}`, sub: "Updated daily", tone: "ink" },
    {
      label: "Profile views · 7d",
      value: p.profileViews7d.toLocaleString(),
      sub: `${p.viewsTrend > 0 ? "▲" : "▼"} ${Math.abs(p.viewsTrend)}% vs last week`,
      tone: p.viewsTrend > 0 ? "green" : "amber",
    },
    { label: "Inquiries · 7d", value: p.inquiries7d.toString(), sub: `${p.bookingStats.repeatClients} repeat clients`, tone: "ink" },
    { label: "On-time rate", value: `${p.bookingStats.onTimeRate}%`, sub: `${p.bookingStats.completedBookings} bookings`, tone: "green" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "14px 16px",
            fontFamily: FONTS.body,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            {it.label}
          </div>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.4,
              color: COLORS.ink,
              marginTop: 4,
            }}
          >
            {it.value}
          </div>
          {it.sub && (
            <div
              style={{
                fontSize: 11.5,
                color:
                  it.tone === "green"
                    ? "#1F5C42"
                    : it.tone === "amber"
                      ? "#3A4651"
                      : COLORS.inkMuted,
                marginTop: 2,
              }}
            >
              {it.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Personal page band (premium tier surface) ──────────────────────
//
// The talent's personal Tulala destination — separate from agency
// rosters and hub listings. Locked modules render with a tier badge
// rather than disabled controls, so the ladder is always visible.

function PersonalPageBand() {
  const { openDrawer } = useProto();
  const p = MY_TALENT_PROFILE;
  const sub = p.subscription;
  const tier = sub.tier;
  const meta = TALENT_TIER_META[tier];
  const activeTemplate = TALENT_PAGE_TEMPLATES.find((t) => t.id === sub.template) ?? TALENT_PAGE_TEMPLATES[0];
  const allowEmbeds = tierAllows(tier, "media-embeds");
  const allowPress = tierAllows(tier, "press-band");
  const allowKit = tierAllows(tier, "media-kit");
  const allowDomain = tierAllows(tier, "custom-domain");
  const allowExtraSections = tierAllows(tier, "extra-sections");

  return (
    <>
      {/* Header strip — current tier + URL + manage CTA */}
      <PrimaryCard
        title={`Your personal Tulala page · ${meta.label}`}
        description={
          tier === "basic"
            ? "Right now this is the standard roster-style page. Upgrade to unlock richer templates, embeds, press, and a custom domain."
            : tier === "pro"
              ? "Pro template, social + video embeds, press band, and a downloadable media kit. Custom domain unlocks at Portfolio."
              : "Full mini personal site. Multi-section page builder, custom domain, EPK kit, SEO controls, priority discover placement."
        }
        icon={<Icon name="globe" size={14} stroke={1.7} />}
        affordance={tier === "portfolio" ? "Manage page" : "Compare tiers"}
        onClick={() =>
          tier === "portfolio" ? openDrawer("talent-personal-page") : openDrawer("talent-tier-compare")
        }
      >
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            padding: "10px 12px",
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
            borderRadius: 10,
          }}
        >
          <Icon name="external" size={12} color={COLORS.accentDeep} />
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink, flex: "1 1 auto", minWidth: 0 }}>
            {sub.customDomain ?? sub.personalPageUrl}
          </span>
          {sub.customDomain && sub.customDomainStatus === "verified" && (
            <span style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.green, fontWeight: 500 }}>
              ● Verified
            </span>
          )}
          {sub.renewsOn && (
            <span style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted }}>
              Renews {sub.renewsOn}
            </span>
          )}
        </div>
      </PrimaryCard>

      {/* Modules grid — template / embeds / press / media-kit / domain / sections */}
      <div style={{ marginTop: 12 }}>
        <Grid cols="3">
          <SecondaryCard
            title="Page template"
            description={
              allowEmbeds
                ? `Active: ${activeTemplate.label}. ${activeTemplate.blurb}`
                : "Roster style only on Basic. Pro unlocks Editorial / Studio. Portfolio adds Stage / Creator / EPK."
            }
            meta={
              tierAllows(tier, "template-picker")
                ? <><StatDot tone="green" /> {activeTemplate.label}</>
                : <LockedBadge requiredTier="pro" />
            }
            affordance={tierAllows(tier, "template-picker") ? "Switch template" : "Unlock templates"}
            onClick={() =>
              tierAllows(tier, "template-picker")
                ? openDrawer("talent-page-template")
                : openDrawer("talent-tier-compare")
            }
          />
          <SecondaryCard
            title="Media embeds"
            description={
              allowEmbeds
                ? `Spotify · YouTube · TikTok · IG · Vimeo. ${sub.embeds.length} embeds active.`
                : "Add Spotify / YouTube / TikTok / Instagram / Vimeo blocks to your page. Pro+."
            }
            meta={allowEmbeds ? <><StatDot tone="green" /> {sub.embeds.length} embeds</> : <LockedBadge requiredTier="pro" />}
            affordance={allowEmbeds ? "Manage embeds" : "Unlock embeds"}
            onClick={() => (allowEmbeds ? openDrawer("talent-media-embeds") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title="Press & clippings"
            description={
              allowPress
                ? `${sub.press.length} clips · auto-pulled from RSS or pasted manually.`
                : "Vogue, El País, FT — show off press mentions on your page. Pro+."
            }
            meta={allowPress ? <><StatDot tone="green" /> {sub.press.length} clips</> : <LockedBadge requiredTier="pro" />}
            affordance={allowPress ? "Manage press" : "Unlock press band"}
            onClick={() => (allowPress ? openDrawer("talent-press") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title="Media kit (EPK)"
            description={
              allowKit
                ? sub.mediaKit
                  ? `${sub.mediaKit.filename} · ${sub.mediaKit.size} · updated ${sub.mediaKit.updatedAt}.`
                  : "Generate a downloadable EPK PDF — bio, credits, comp card, contact CTA."
                : "One-click downloadable EPK · credits · comp card · contact CTA. Pro+."
            }
            meta={allowKit ? <><StatDot tone="green" /> Ready</> : <LockedBadge requiredTier="pro" />}
            affordance={allowKit ? "Manage media kit" : "Unlock media kit"}
            onClick={() => (allowKit ? openDrawer("talent-media-kit") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title="Custom domain"
            description={
              allowDomain
                ? sub.customDomain
                  ? `Live at ${sub.customDomain} · ${sub.customDomainStatus}`
                  : "Connect your own domain — yourname.com → personal page."
                : "Personal domain (yourname.com) routed straight to your Tulala page. Portfolio only."
            }
            meta={allowDomain ? <><StatDot tone={sub.customDomain ? "green" : "dim"} /> {sub.customDomain ? "Live" : "Not set"}</> : <LockedBadge requiredTier="portfolio" />}
            affordance={allowDomain ? "Manage domain" : "Unlock custom domain"}
            onClick={() => (allowDomain ? openDrawer("talent-custom-domain") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title="Extra sections"
            description={
              allowExtraSections
                ? "Bio · About · Press · Tour dates · Show calendar · Contact CTA. Drag to re-order."
                : "Multi-section page — story, tour dates, show calendar, contact CTA. Portfolio only."
            }
            meta={allowExtraSections ? <><StatDot tone="green" /> 6 sections</> : <LockedBadge requiredTier="portfolio" />}
            affordance={allowExtraSections ? "Edit sections" : "Unlock sections"}
            onClick={() => (allowExtraSections ? openDrawer("talent-personal-page") : openDrawer("talent-tier-compare"))}
          />
        </Grid>
      </div>
    </>
  );
}

// ─── Atomic profile primitives (chips, rows, snippets) ──────────────

/**
 * Tier pill shown on hero. Tone scales with tier — Basic ink, Pro
 * forest accent, Portfolio deep ink. Click opens the tier-compare drawer.
 */
function TierPill({ tier, onClick }: { tier: TalentSubscriptionTier; onClick: () => void }) {
  const meta = TALENT_TIER_META[tier];
  const palette: Record<TalentSubscriptionTier, { bg: string; fg: string; border: string }> = {
    basic: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink, border: "rgba(11,11,13,0.10)" },
    pro: { bg: COLORS.accentSoft, fg: COLORS.accent, border: "rgba(15,79,62,0.28)" },
    portfolio: { bg: COLORS.ink, fg: "#fff", border: COLORS.ink },
  };
  const c = palette[tier];
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 9px",
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        borderRadius: 999,
        cursor: "pointer",
      }}
      title={`${meta.label} · ${meta.tagline} · click to compare tiers`}
    >
      <span style={{ fontSize: 9, opacity: 0.85 }}>●</span>
      {meta.label} plan
      {tier !== "portfolio" && (
        <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>↗</span>
      )}
    </button>
  );
}

/**
 * Lock badge — shown next to a feature card when the talent's
 * current tier doesn't unlock it. Hint surfaces what tier they need.
 */
function LockedBadge({ requiredTier }: { requiredTier: TalentSubscriptionTier }) {
  const meta = TALENT_TIER_META[requiredTier];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        background: requiredTier === "portfolio" ? COLORS.ink : COLORS.accentSoft,
        color: requiredTier === "portfolio" ? "#fff" : COLORS.accent,
        border: `1px solid ${requiredTier === "portfolio" ? COLORS.ink : "rgba(15,79,62,0.28)"}`,
        fontFamily: FONTS.body,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        borderRadius: 999,
        textTransform: "uppercase",
      }}
      title={`Unlocked at ${meta.label}`}
    >
      <span style={{ fontSize: 9 }}>🔒</span>
      {meta.label}
    </span>
  );
}

function ProfileChip({ label, tone = "ink" }: { label: string; tone?: "ink" | "green" | "amber" | "dim" | "red" }) {
  const palette: Record<typeof tone, { bg: string; fg: string }> = {
    ink: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink },
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" },
    amber: { bg: "rgba(82,96,109,0.12)", fg: "#3A4651" },
    dim: { bg: "rgba(11,11,13,0.03)", fg: COLORS.inkMuted },
    red: { bg: "rgba(176,48,58,0.10)", fg: "#7A2026" },
  };
  const c = palette[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        padding: "3px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function BadgeChip({ badge, compact }: { badge: TalentBadge; compact?: boolean }) {
  const glyph: Record<TalentBadge["kind"], string> = {
    "id-verified": "🛡",
    "age-verified": "✓",
    union: "♢",
    "top-rated": "★",
    "tulala-featured": "❖",
    "agency-verified": "▣",
    "background-check": "⌾",
  };
  return (
    <span
      title={`${badge.label} · ${badge.hint}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: compact ? "3px 8px" : "4px 10px",
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 999,
        fontFamily: FONTS.body,
        fontSize: compact ? 11 : 11.5,
        color: COLORS.ink,
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: compact ? 11 : 12, color: COLORS.accentDeep }}>{glyph[badge.kind]}</span>
      {badge.label}
    </span>
  );
}

function MeasurementsTable() {
  const m = MY_TALENT_PROFILE.measurements;
  const cells: { label: string; value: string }[] = [
    { label: "Height", value: `${m.heightImperial} · ${m.heightMetric}` },
    { label: "Bust", value: m.bust },
    { label: "Waist", value: m.waist },
    { label: "Hips", value: m.hips },
    { label: "Inseam", value: m.inseam ?? "—" },
    { label: "Shoe", value: `EU ${m.shoeEU} · US ${m.shoeUS} · UK ${m.shoeUK}` },
    { label: "Dress", value: m.dress },
    { label: "Hair", value: `${m.hairColor} · ${m.hairLength}` },
    { label: "Eyes", value: m.eyeColor },
    { label: "Skin tone", value: m.skinTone },
    { label: "Tattoos", value: m.hasTattoos ? (m.tattoosNote ?? "Yes") : "None" },
    { label: "Piercings", value: m.hasPiercings ? (m.piercingsNote ?? "Yes") : "None" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
        fontFamily: FONTS.body,
      }}
    >
      {cells.map((c) => (
        <div
          key={c.label}
          style={{
            padding: "10px 12px",
            background: "rgba(11,11,13,0.02)",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            {c.label}
          </div>
          <div
            style={{
              fontSize: 13,
              color: COLORS.ink,
              marginTop: 3,
              fontWeight: 500,
            }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillRow({ skill }: { skill: TalentSkill }) {
  const catGlyph: Record<TalentSkill["category"], string> = {
    movement: "⟁",
    voice: "♪",
    instrument: "♫",
    sport: "⚑",
    performance: "★",
    other: "·",
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: FONTS.body,
        fontSize: 12.5,
        color: COLORS.ink,
      }}
    >
      <span
        style={{
          width: 18,
          textAlign: "center",
          color: COLORS.inkDim,
          fontSize: 13,
        }}
      >
        {catGlyph[skill.category]}
      </span>
      <span style={{ flex: 1 }}>{skill.label}</span>
      {skill.level && <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{skill.level}</span>}
    </div>
  );
}

function LimitRow({ limit }: { limit: TalentLimit }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: FONTS.body,
        fontSize: 12.5,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: limit.enforcement === "hard" ? COLORS.red : COLORS.amber,
        }}
      />
      <span style={{ flex: 1, color: COLORS.ink }}>{limit.label}</span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: limit.enforcement === "hard" ? "#7A2026" : "#3A4651",
        }}
      >
        {limit.enforcement}
      </span>
    </div>
  );
}

function CreditRow({ credit }: { credit: TalentCredit }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontFamily: FONTS.body,
        fontSize: 12.5,
        padding: "5px 0",
        borderBottom: `1px dashed ${COLORS.borderSoft}`,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: COLORS.inkDim,
          letterSpacing: 0.3,
          flexShrink: 0,
          minWidth: 60,
        }}
      >
        {credit.year}
      </span>
      <span style={{ flex: 1, color: COLORS.ink }}>
        <strong style={{ fontWeight: 600 }}>{credit.brand}</strong>
        <span style={{ color: COLORS.inkMuted }}> · {credit.type}</span>
        {credit.role && <span style={{ color: COLORS.inkMuted }}> · {credit.role}</span>}
      </span>
      {credit.pinned && (
        <span style={{ color: COLORS.accentDeep, fontSize: 12 }}>★</span>
      )}
    </div>
  );
}

function ReviewSnippet({ review }: { review: TalentReview }) {
  return (
    <div
      style={{
        padding: "9px 11px",
        background: "rgba(11,11,13,0.02)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 12, color: COLORS.ink, fontWeight: 600 }}>
          {review.reviewerName}
        </span>
        <span style={{ fontSize: 11, color: COLORS.accentDeep, letterSpacing: 1 }}>
          {"★".repeat(review.rating)}
        </span>
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 5 }}>
        {review.reviewerRole}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: COLORS.ink,
          lineHeight: 1.5,
          fontStyle: "italic",
        }}
      >
        "{review.body.length > 110 ? review.body.slice(0, 108) + "…" : review.body}"
      </div>
    </div>
  );
}

function BookingStatCell({ label, value, accent }: { label: string; value: string; accent: "ink" | "green" | "amber" | "dim" }) {
  const colorMap = {
    ink: COLORS.ink,
    green: "#1F5C42",
    amber: "#3A4651",
    dim: COLORS.inkMuted,
  };
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(11,11,13,0.02)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: -0.3,
          color: colorMap[accent],
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RateLine({ label, range }: { label: string; range: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontFamily: FONTS.body,
        fontSize: 12.5,
        padding: "3px 0",
      }}
    >
      <span style={{ flex: 1, color: COLORS.ink }}>{label}</span>
      <span style={{ color: COLORS.inkMuted, fontSize: 12 }}>{range}</span>
    </div>
  );
}

function LinkChip({ link }: { link: TalentLink }) {
  const glyph: Record<TalentLink["kind"], string> = {
    instagram: "◉",
    tiktok: "♪",
    imdb: "▶",
    site: "🌐︎",
    linkedin: "in",
    youtube: "▶",
    spotify: "♫",
    other: "→",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: "rgba(11,11,13,0.04)",
        borderRadius: 999,
        fontFamily: FONTS.body,
        fontSize: 11.5,
        color: COLORS.ink,
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{glyph[link.kind]}</span>
      {link.label}
      {link.followers && (
        <span style={{ fontSize: 10.5, color: COLORS.inkMuted, fontWeight: 500 }}>
          · {link.followers}
        </span>
      )}
    </span>
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

// ─── Inbox redesign — Phase B1 ──────────────────────────────────────
//
// Unified row anatomy + filter chips, matching the Calendar discipline.
// Replaces the prior nested "From your agencies" + "Holds & casting calls"
// dual-list with one flat list filtered by status. Same row pattern as
// Today's Needs-reply / Inquiries — talent learns it once, applies
// everywhere.
//
// Filter chips:
//   Action       — needs your reply (offers awaiting + inquiry-pending)
//   Active       — in flight (coordinator working, peer holds, etc.)
//   Confirmed    — accepted / approved / booked
//   Closed       — declined / expired / cancelled
//   All          — everything

type InboxFilter = "action" | "active" | "confirmed" | "closed" | "all";

type InboxItem = {
  id: string;
  source: "inquiry" | "request";
  category: InboxFilter;
  client: string;
  clientTrust: ClientTrustLevel;
  brief: string;
  kindLabel: string;
  kindTone: "coral" | "indigo" | "amber" | "success" | "ink";
  microcopy: string;
  ageHrs: number;
  date?: string;
  amount?: string;
  agency: string;
  onOpen: () => void;
};

function InboxPage() {
  const { openDrawer } = useProto();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("action");
  const allMine = myInquiries();

  // Derive unified InboxItems from both data sources.
  const items: InboxItem[] = [
    ...allMine.map((i): InboxItem => {
      const status = myStatusOn(i);
      const category: InboxFilter =
        status === "pending"
          ? "action"
          : i.stage === "approved" || i.stage === "booked"
            ? "confirmed"
            : i.stage === "rejected" || i.stage === "expired" || status === "declined"
              ? "closed"
              : "active";
      const microcopy =
        status === "pending"
          ? "Awaiting your answer"
          : i.stage === "coordination"
            ? "Coordinator picking talent"
            : i.stage === "offer_pending"
              ? "Offer with client"
              : i.stage === "approved"
                ? "Approved · awaiting booking"
                : i.stage === "booked"
                  ? "Booked"
                  : INQUIRY_STAGE_META[i.stage].label;
      return {
        id: i.id,
        source: "inquiry",
        category,
        client: i.clientName,
        clientTrust: i.clientTrust,
        brief: i.brief,
        kindLabel: "Inquiry",
        kindTone: status === "pending" ? "coral" : "indigo",
        microcopy,
        ageHrs: i.lastActivityHrs,
        date: i.date ?? undefined,
        agency: i.agencyName,
        onOpen: () => openDrawer("inquiry-workspace", { inquiryId: i.id, pov: "talent" }),
      };
    }),
    ...TALENT_REQUESTS.map((r): InboxItem => {
      const category: InboxFilter =
        r.status === "needs-answer"
          ? "action"
          : r.status === "accepted"
            ? "confirmed"
            : r.status === "viewed"
              ? "active"
              : "closed";
      const microcopy =
        r.status === "needs-answer"
          ? "Needs your answer"
          : r.status === "viewed"
            ? "Viewed · no answer required yet"
            : r.status === "accepted"
              ? "You accepted"
              : r.status === "declined"
                ? "You declined"
                : "Expired";
      const kindLabel = r.kind.charAt(0).toUpperCase() + r.kind.slice(1);
      return {
        id: r.id,
        source: "request",
        category,
        client: r.client,
        clientTrust: r.clientTrust,
        brief: r.brief,
        kindLabel,
        kindTone: r.status === "needs-answer" ? "coral" : "amber",
        microcopy,
        ageHrs: r.ageHrs,
        date: r.date,
        amount: r.amount,
        agency: r.agency,
        onOpen: () => openDrawer("talent-offer-detail", { id: r.id }),
      };
    }),
  ];

  // Apply search + filter
  const filtered = items.filter((it) => {
    if (filter !== "all" && it.category !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!it.client.toLowerCase().includes(q) && !it.brief.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const counts = {
    action: items.filter((it) => it.category === "action").length,
    active: items.filter((it) => it.category === "active").length,
    confirmed: items.filter((it) => it.category === "confirmed").length,
    closed: items.filter((it) => it.category === "closed").length,
    all: items.length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Everything that needs you, in one place"
        subtitle="Inquiries from your agencies plus holds and casting calls. Filter by what you need to do."
      />

      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#fff",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "9px 14px",
          marginBottom: 12,
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

      {/* Filter chip strip — same pattern as Calendar */}
      <InboxFilterChips filter={filter} onChange={setFilter} counts={counts} />

      <div style={{ height: 16 }} />

      {/* E1: AI reply assistant prototype. Shows when there's an action
          item — suggests a reply for the top pending. Mock — production
          calls an LLM with the inquiry context. Privacy: opt-in toggle
          in Settings (per spec); on by default in this prototype. */}
      {counts.action > 0 && (
        <AIReplyAssistant
          item={items.find((it) => it.category === "action") ?? null}
        />
      )}

      {/* Unified list — same row anatomy across all kinds. */}
      <section
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "0 14px",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: "32px 12px" }}>
            <EmptyState
              icon="mail"
              title={
                search
                  ? `No ${filter === "all" ? "items" : filter + " items"} match "${search}"`
                  : filter === "action"
                    ? "Nothing waiting on you"
                    : filter === "closed"
                      ? "Archive is clear"
                      : `No ${filter} items`
              }
              body={
                filter === "action"
                  ? "You're caught up. Switch to other filters to see what's in flight."
                  : "Switch filter above to see other items."
              }
              compact
            />
          </div>
        ) : (
          filtered.map((it, idx) => (
            <InboxRow key={`${it.source}-${it.id}`} item={it} first={idx === 0} />
          ))
        )}
      </section>
    </>
  );
}

/**
 * E1: AI reply assistant — high-fidelity prototype. Surfaces 3 hardcoded
 * reply variants for the top pending action item. The talent picks a
 * variant, optionally edits, and sends.
 *
 * In production: calls an LLM with the inquiry thread context. Privacy:
 * opt-in toggle in Settings (per the agency-exclusivity spec). Client
 * names anonymized in the prompt by default. See backend handoff §8.1.
 */
function AIReplyAssistant({ item }: { item: InboxItem | null }) {
  const { toast } = useProto();
  const [expanded, setExpanded] = useState(false);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  if (!item) return null;

  // Hardcoded variants per kind. Production: LLM-generated.
  const variants: { label: string; body: string }[] = [
    {
      label: "Quick confirm",
      body: `Hi — confirmed for ${item.date ?? "the date listed"}. ${item.amount ? `${item.amount} works on my end.` : ""} Bringing the standard kit. Anything specific from the brief I should plan for?`,
    },
    {
      label: "Polite hold",
      body: `Hi — interested but I need to check one conflict. Can I confirm by end of day tomorrow? If you need an answer sooner, please let me know.`,
    },
    {
      label: "Decline with grace",
      body: `Thanks for thinking of me. I won't be able to take this one — already committed for ${item.date ?? "around then"}. Would love to be in mind for the next campaign.`,
    },
  ];

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        background: COLORS.royalSoft,
        border: `1px solid rgba(95,75,139,0.18)`,
        borderRadius: 12,
        fontFamily: FONTS.body,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(95,75,139,0.18)",
            color: COLORS.royalDeep,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={13} stroke={1.7} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.royalDeep }}>
            AI suggestion for {item.client}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: COLORS.royalDeep,
              opacity: 0.78,
              marginTop: 1,
            }}
          >
            {expanded
              ? "Pick a variant — edit if needed, then send."
              : "3 reply variants ready. Click to preview."}
          </div>
        </div>
        <Icon
          name="chevron-down"
          size={12}
          stroke={2}
          color={COLORS.royalDeep}
        />
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {variants.map((v, i) => {
            const active = pickedIdx === i;
            return (
              <button
                key={v.label}
                type="button"
                onClick={() => setPickedIdx(active ? null : i)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  background: active ? "#fff" : "rgba(255,255,255,0.65)",
                  border: `1px solid ${active ? COLORS.royal : "rgba(95,75,139,0.18)"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: COLORS.royalDeep,
                  }}
                >
                  {v.label}
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5 }}>
                  {v.body}
                </div>
              </button>
            );
          })}
          {pickedIdx !== null && (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  toast(`Sent reply to ${item.client}`, {
                    undo: () => toast("Reply unsent"),
                  });
                  setPickedIdx(null);
                  setExpanded(false);
                }}
                style={{
                  background: COLORS.ink,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Send →
              </button>
              <button
                type="button"
                onClick={() => toast("Edit composer · coming next sprint")}
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: COLORS.ink,
                  cursor: "pointer",
                }}
              >
                Edit before sending
              </button>
            </div>
          )}
          <div
            style={{
              marginTop: 4,
              fontSize: 10.5,
              color: COLORS.inkDim,
              fontFamily: FONTS.body,
            }}
          >
            Privacy: client name is anonymized when we generate suggestions. Toggle off in Settings → Notifications.
          </div>
        </div>
      )}
    </div>
  );
}

function InboxFilterChips({
  filter,
  onChange,
  counts,
}: {
  filter: InboxFilter;
  onChange: (f: InboxFilter) => void;
  counts: Record<InboxFilter, number>;
}) {
  const chips: { key: InboxFilter; label: string; tone: string }[] = [
    { key: "action", label: "Action", tone: COLORS.coral },
    { key: "active", label: "Active", tone: COLORS.indigo },
    { key: "confirmed", label: "Confirmed", tone: COLORS.green },
    { key: "closed", label: "Closed", tone: COLORS.inkDim },
    { key: "all", label: "All", tone: COLORS.ink },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {chips.map((c) => {
        const active = filter === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 11px",
              borderRadius: 999,
              background: active ? COLORS.ink : "#fff",
              border: `1px solid ${active ? COLORS.ink : COLORS.borderSoft}`,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 500,
              color: active ? "#fff" : COLORS.ink,
              transition: "background .12s",
            }}
          >
            {!active && (
              <span
                aria-hidden
                style={{ width: 6, height: 6, borderRadius: "50%", background: c.tone }}
              />
            )}
            <span>{c.label}</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: active ? "rgba(255,255,255,0.6)" : COLORS.inkDim,
                fontSize: 11.5,
              }}
            >
              {counts[c.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Unified inbox row — same anatomy as Today's Needs-reply rows. */
function InboxRow({ item, first }: { item: InboxItem; first: boolean }) {
  const [hover, setHover] = useState(false);
  // Coral-escalated timestamp for stale action items
  const ageColor =
    item.category === "action" && item.ageHrs >= 24
      ? COLORS.coral
      : item.category === "action" && item.ageHrs >= 12
        ? COLORS.coral
        : COLORS.inkDim;
  const ageWeight = item.category === "action" && item.ageHrs >= 24 ? 600 : 400;
  const ageLabel =
    item.ageHrs < 24 ? `${item.ageHrs}h ago` : `${Math.floor(item.ageHrs / 24)}d ago`;
  return (
    <button
      type="button"
      onClick={item.onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "14px 0",
        borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: "background .12s",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar
          size={36}
          tone="auto"
          hashSeed={item.client}
          initials={inboxClientInitials(item.client)}
        />
        <ClientTrustBadge level={item.clientTrust} />
      </div>
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
          <span>{item.client}</span>
          <span style={{ color: COLORS.inkDim }}>·</span>
          <span
            style={{
              color: COLORS.inkMuted,
              fontWeight: 400,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {item.brief}
          </span>
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
          <KindChip label={item.kindLabel} tone={item.kindTone} />
          <span style={{ color: COLORS.inkMuted }}>
            {item.microcopy}
            {item.date && ` · ${item.date}`}
            {item.amount && ` · ${item.amount}`}
          </span>
        </div>
      </div>
      {item.category === "action" && hover && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 10px",
            borderRadius: 7,
            background: COLORS.coralSoft,
            color: COLORS.coralDeep,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          Reply →
        </span>
      )}
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: 11.5,
          color: ageColor,
          fontWeight: ageWeight,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {ageLabel}
      </span>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}

function inboxClientInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
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
    bg = "rgba(82,96,109,0.12)";
    fg = "#3A4651";
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

/**
 * CalendarMonthGrid — month grid for the talent's calendar page,
 * showing confirmed bookings (green) and availability blocks (amber for
 * travel, neutral for personal). Hard-coded to May 2026 to match the
 * fixtures in `TALENT_BOOKINGS` + `AVAILABILITY_BLOCKS`.
 *
 * In production this becomes a real date-aware grid that paginates by
 * month and reads from the same data sources. For prototype purposes the
 * one-month view is enough to show the layout and visual language.
 */
function CalendarMonthGrid() {
  const { openDrawer } = useProto();

  // May 2026 starts on a Friday (verified). Map cells: empty for the
  // first 4 days (Mon–Thu), then 1..31 for the days of the month.
  // Layout is Mon-first, 6 weeks max.
  const firstWeekday = 4; // 0=Mon, 4=Fri
  const daysInMonth = 31;

  // Define what's on each day. Dates are loosely aligned with fixtures.
  // bk1 = May 6, bk2 = May 14-15, av1 = Apr 28 → May 2, av2 = May 22-26.
  // A7: pending + inquiry mark kinds added — coral for pending, indigo
  // for inquiry, ghosted opacity to differentiate from confirmed.
  type DayMark =
    | { kind: "booking"; id: string; label: string; client: string }
    | { kind: "block"; id: string; label: string; type: "travel" | "personal" | "blocked" }
    | { kind: "pending"; id: string; label: string }
    | { kind: "inquiry"; id: string; label: string };

  const marksByDay: Record<number, DayMark[]> = {};
  const addMark = (day: number, mark: DayMark) => {
    marksByDay[day] = marksByDay[day] ? [...marksByDay[day], mark] : [mark];
  };

  // Block: Apr 28 → May 2 (travel) — only May 1, 2 fall in this view
  addMark(1, { kind: "block", id: "av1", label: "Travel · Lisbon", type: "travel" });
  addMark(2, { kind: "block", id: "av1", label: "Travel · Lisbon", type: "travel" });

  // Booking bk1 — May 6 · 08:30 call (A6 time-of-day on grid)
  addMark(6, { kind: "booking", id: "bk1", label: "08:30 · Mango", client: "Mango" });

  // Booking bk2 — May 14, 15 · 07:00 call
  addMark(14, { kind: "booking", id: "bk2", label: "07:00 · Vogue", client: "Vogue Italia" });
  addMark(15, { kind: "booking", id: "bk2", label: "07:00 · Vogue", client: "Vogue Italia" });

  // A7: Pending hold rq5 — Stella McCartney May 14 (CONFLICTS with bk2)
  addMark(14, { kind: "pending", id: "rq5", label: "Hold · Stella McCartney" });

  // A7: Pending hold rq2 — Bvlgari May 18-20
  for (let d = 18; d <= 20; d++) {
    addMark(d, { kind: "pending", id: "rq2", label: "Hold · Bvlgari" });
  }

  // Block av2 — May 22-26 (personal)
  for (let d = 22; d <= 26; d++) {
    addMark(d, { kind: "block", id: "av2", label: "Personal", type: "personal" });
  }

  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <CapsLabel>May 2026</CapsLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <CalendarLegendDot tone="green" label="Booked" />
          <CalendarLegendDot tone="coral" label="Pending" />
          <CalendarLegendDot tone="indigo" label="Inquiry" />
          <CalendarLegendDot tone="amber" label="Travel" />
          <CalendarLegendDot tone="dim" label="Personal" />
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Weekday header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "rgba(11,11,13,0.02)",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          {weekdayLabels.map((d) => (
            <div
              key={d}
              style={{
                padding: "10px 12px",
                fontFamily: FONTS.body,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "minmax(86px, auto)",
          }}
        >
          {Array.from({ length: totalCells }).map((_, idx) => {
            const dayNum = idx - firstWeekday + 1;
            const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
            const marks = inMonth ? marksByDay[dayNum] ?? [] : [];
            const isWeekend = idx % 7 >= 5;
            const colCount = idx % 7;
            const rowEnd = idx >= totalCells - 7;

            return (
              <div
                key={idx}
                style={{
                  borderRight: colCount === 6 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  borderBottom: rowEnd ? "none" : `1px solid ${COLORS.borderSoft}`,
                  background: inMonth ? "#fff" : "rgba(11,11,13,0.02)",
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  minHeight: 86,
                }}
              >
                {inMonth && (
                  <div
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 12,
                      fontWeight: 500,
                      color: isWeekend ? COLORS.inkMuted : COLORS.ink,
                    }}
                  >
                    {dayNum}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {marks.map((mark, mi) => {
                    // A7: tone palette per mark kind
                    let bg = "rgba(11,11,13,0.05)";
                    let fg = COLORS.inkMuted;
                    if (mark.kind === "booking") {
                      bg = "rgba(46,125,91,0.10)";
                      fg = "#1F5C42";
                    } else if (mark.kind === "pending") {
                      bg = COLORS.coralSoft;
                      fg = COLORS.coralDeep;
                    } else if (mark.kind === "inquiry") {
                      bg = COLORS.indigoSoft;
                      fg = COLORS.indigoDeep;
                    } else if (mark.kind === "block" && mark.type === "travel") {
                      bg = "rgba(82,96,109,0.12)";
                      fg = "#3A4651";
                    }
                    return (
                    <button
                      key={`${idx}-${mi}`}
                      onClick={() => {
                        if (mark.kind === "booking") {
                          openDrawer("talent-booking-detail", { id: mark.id });
                        } else if (mark.kind === "pending") {
                          openDrawer("talent-offer-detail", { id: mark.id });
                        } else if (mark.kind === "inquiry") {
                          openDrawer("inquiry-workspace", { inquiryId: mark.id, pov: "talent" });
                        } else {
                          openDrawer("talent-availability", { id: mark.id });
                        }
                      }}
                      style={{
                        background: bg,
                        color: fg,
                        border: "none",
                        borderRadius: 5,
                        padding: "3px 6px",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: FONTS.body,
                        fontSize: 10.5,
                        fontWeight: 500,
                        lineHeight: 1.25,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        // Pending/inquiry render slightly ghosted to differentiate
                        // from confirmed events.
                        opacity: mark.kind === "pending" || mark.kind === "inquiry" ? 0.85 : 1,
                      }}
                      title={mark.label}
                    >
                      {mark.label}
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CalendarLegendDot({ tone, label }: { tone: "green" | "amber" | "dim" | "coral" | "indigo"; label: string }) {
  const c =
    tone === "green"
      ? COLORS.green
      : tone === "amber"
        ? COLORS.amber
        : tone === "coral"
          ? COLORS.coral
          : tone === "indigo"
            ? COLORS.indigo
            : COLORS.inkMuted;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: FONTS.body,
        fontSize: 11,
        color: COLORS.inkMuted,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: c,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

// ─── Calendar event model ─────────────────────────────────────────
//
// The calendar shows four kinds of events, all represented uniformly so
// filter chips can slice them and conflict detection can compare dates.
//
//   booked    — confirmed booking. Sage tone. The default view.
//   pending   — hold or offer awaiting reply. Coral tone (your move).
//   inquiry   — in-flight inquiry the talent is being considered for. Indigo.
//   past      — wrapped/paid bookings. Ink-dim.

type CalendarEventKind = "booked" | "pending" | "inquiry" | "past" | "cancelled";

type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  client: string;
  brief: string;
  /** Numeric start day of May 2026 (1–31). null = no date set. */
  startDay: number | null;
  /** End day of May 2026; same as start for single-day events. */
  endDay: number | null;
  /** Display range "May 14" or "May 14–15". */
  dateLabel: string;
  amount?: string;
  /** Status microcopy — what's the current state of this event. */
  status: string;
  /** Click target: drawer ID + payload. */
  drawer: { id: import("./_state").DrawerId; payload: Record<string, unknown> };
};

function CalendarPage() {
  const { openDrawer, toast } = useProto();
  const [filter, setFilter] = useState<"booked" | "pending" | "inquiry" | "past" | "cancelled" | "all">("booked");

  // Build a unified event list from the existing data fixtures.
  // Days are parsed loosely — May references stay numeric.
  const confirmedBookings = TALENT_BOOKINGS.filter((b) => b.status === "confirmed");
  // Set of client names that already have confirmed bookings — used to
  // dedupe TALENT_REQUESTS entries that are essentially the same gig
  // already in `confirmed` state. Without this, the calendar shows the
  // same Vogue Italia job as both "Confirmed booking" AND "Offer" (since
  // the prototype fixtures keep both representations).
  const confirmedClients = new Set(confirmedBookings.map((b) => b.client));
  const confirmedInquiryIds = new Set(
    RICH_INQUIRIES.filter((i) => i.stage === "approved" || i.stage === "booked").map((i) => i.id),
  );

  const events: CalendarEvent[] = [
    // Confirmed bookings
    ...confirmedBookings.map((b): CalendarEvent => ({
      id: b.id,
      kind: "booked",
      client: b.client,
      brief: b.brief,
      startDay: parseMayDay(b.startDate),
      endDay: parseMayDay(b.endDate ?? b.startDate),
      dateLabel: b.endDate ? `${b.startDate}–${b.endDate.replace(/^[A-Za-z, ]+/, "")}` : b.startDate,
      amount: b.amount,
      status: `Confirmed · ${b.location}`,
      drawer: { id: "talent-booking-detail", payload: { id: b.id } },
    })),
    // Pending: holds + offers awaiting reply. Skip when the same client
    // is already confirmed (deduplicates the prototype's overlap fixtures).
    ...TALENT_REQUESTS.filter(
      (r) =>
        (r.status === "needs-answer" || r.status === "accepted") &&
        !confirmedClients.has(r.client),
    ).map(
      (r): CalendarEvent => ({
        id: r.id,
        kind: "pending",
        client: r.client,
        brief: r.brief,
        startDay: parseMayDay(r.date),
        endDay: parseMayDay(r.date, true),
        dateLabel: r.date ?? "Date TBC",
        amount: r.amount,
        status:
          r.kind === "hold"
            ? "Hold · awaiting your reply"
            : r.kind === "offer" && r.status === "accepted"
              ? "Offer with client"
              : `${r.kind.charAt(0).toUpperCase() + r.kind.slice(1)} · awaiting your reply`,
        drawer: { id: "talent-offer-detail", payload: { id: r.id } },
      }),
    ),
    // Inquiries — coordination/submitted stages. Skip when already booked.
    ...RICH_INQUIRIES.filter(
      (i) =>
        (i.stage === "coordination" || i.stage === "submitted") &&
        !confirmedInquiryIds.has(i.id) &&
        !confirmedClients.has(i.clientName),
    )
      .slice(0, 2)
      .map((i): CalendarEvent => ({
        id: i.id,
        kind: "inquiry",
        client: i.clientName,
        brief: i.brief,
        startDay: parseMayDay(i.date),
        endDay: parseMayDay(i.date, true),
        dateLabel: i.date ?? "Date TBC",
        status: "Coordinator picking talent",
        drawer: { id: "inquiry-workspace", payload: { inquiryId: i.id, pov: "talent" } },
      })),
    // Past bookings — append payment method to status microcopy when
    // we can find a matching earnings row. "Paid · Transfer · 7d after work"
    // gives the talent immediate insight into client payout speed + method.
    ...TALENT_BOOKINGS.filter((b) => b.status === "wrapped" || b.status === "paid").map(
      (b): CalendarEvent => {
        const earning = EARNINGS_ROWS.find((e) => e.client === b.client && e.amount === b.amount);
        const methodShort = earning ? PAYMENT_METHOD_META[earning.paymentMethod].short : null;
        const payoutSpeed = earning ? computePayoutSpeed(b.startDate, earning.payoutDate) : null;
        const statusBits: string[] = [b.status === "paid" ? "Paid" : "Wrapped"];
        if (methodShort) statusBits.push(methodShort);
        if (payoutSpeed) statusBits.push(payoutSpeed);
        return {
          id: b.id,
          kind: "past",
          client: b.client,
          brief: b.brief,
          startDay: parseMayDay(b.startDate),
          endDay: parseMayDay(b.endDate ?? b.startDate),
          dateLabel: b.endDate ? `${b.startDate}–${b.endDate}` : b.startDate,
          amount: b.amount,
          status: statusBits.join(" · "),
          drawer: { id: "talent-booking-detail", payload: { id: b.id } },
        };
      },
    ),
    // Cancelled bookings — talent has a record of what fell through.
    // Status microcopy names who cancelled + when, so the talent can see
    // patterns over time (which clients flake, what timing predicts cancels).
    ...TALENT_BOOKINGS.filter((b) => b.status === "cancelled").map(
      (b): CalendarEvent => {
        const who = b.cancelledBy === "client"
          ? "Client cancelled"
          : b.cancelledBy === "talent"
            ? "You cancelled"
            : b.cancelledBy === "agency"
              ? "Agency cancelled"
              : "Cancelled";
        const microcopy = [who];
        if (b.cancelTiming) microcopy.push(b.cancelTiming);
        if (b.cancelReason) microcopy.push(b.cancelReason);
        return {
          id: b.id,
          kind: "cancelled",
          client: b.client,
          brief: b.brief,
          startDay: parseMayDay(b.startDate),
          endDay: parseMayDay(b.endDate ?? b.startDate),
          dateLabel: b.endDate ? `${b.startDate}–${b.endDate}` : b.startDate,
          amount: b.amount,
          status: microcopy.join(" · "),
          drawer: { id: "talent-booking-detail", payload: { id: b.id } },
        };
      },
    ),
    // Cancelled inquiries — declined offers + expired requests count too.
    ...TALENT_REQUESTS.filter((r) => r.status === "declined" || r.status === "expired").map(
      (r): CalendarEvent => ({
        id: r.id,
        kind: "cancelled",
        client: r.client,
        brief: r.brief,
        startDay: parseMayDay(r.date),
        endDay: parseMayDay(r.date, true),
        dateLabel: r.date ?? "Date TBC",
        amount: r.amount,
        status:
          r.status === "declined"
            ? "You declined"
            : "Expired · no response in window",
        drawer: { id: "talent-offer-detail", payload: { id: r.id } },
      }),
    ),
  ];

  // Conflict detection — pairs of events that share at least one day.
  // Reported as "{a} overlaps with {b}" so the talent can resolve before
  // either party expects a commitment.
  const conflicts: { a: CalendarEvent; b: CalendarEvent }[] = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]!;
      const b = events[j]!;
      // Past events don't conflict with anything (already happened).
      if (a.kind === "past" || b.kind === "past") continue;
      if (a.startDay === null || b.startDay === null) continue;
      const aEnd = a.endDay ?? a.startDay;
      const bEnd = b.endDay ?? b.startDay;
      const overlap = a.startDay <= bEnd && b.startDay <= aEnd;
      if (overlap) conflicts.push({ a, b });
    }
  }

  // Set of event IDs that participate in any conflict — drives the
  // coral edge marker on the row.
  const conflictedIds = new Set<string>();
  for (const { a, b } of conflicts) {
    conflictedIds.add(a.id);
    conflictedIds.add(b.id);
  }

  const filteredEvents = events.filter((e) => filter === "all" || e.kind === filter);

  const counts = {
    booked: events.filter((e) => e.kind === "booked").length,
    pending: events.filter((e) => e.kind === "pending").length,
    inquiry: events.filter((e) => e.kind === "inquiry").length,
    past: events.filter((e) => e.kind === "past").length,
    cancelled: events.filter((e) => e.kind === "cancelled").length,
    all: events.length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title="Bookings & availability"
        subtitle="Confirmed work, pending replies, inquiries — all in one timeline."
        actions={
          <>
            <SecondaryButton onClick={() => openDrawer("talent-block-dates")}>
              Availability
            </SecondaryButton>
            <PrimaryButton onClick={() => openDrawer("talent-add-event")}>
              + Add
            </PrimaryButton>
          </>
        }
      />

      {/* Conflict alert — coral banner when overlaps exist. Renders one
          line per conflict pair with three resolution actions so the
          talent can act without leaving the calendar. Severity escalates
          to red when 3+ conflicts (rare; signals broken availability). */}
      {conflicts.length > 0 && (
        <ConflictBanner
          conflicts={conflicts}
          onResolve={(action, target) => {
            const verb =
              action === "decline"
                ? `Declined ${target.client}`
                : action === "talk"
                  ? `Coordinator notified about ${target.client}`
                  : `Reschedule request sent for ${target.client}`;
            toast(verb);
          }}
        />
      )}

      {/* Filter chip strip — Booked is default since "calendar" mentally
          maps to "what's confirmed". Counts visible per chip. */}
      <FilterChipStrip
        filter={filter}
        onChange={setFilter}
        counts={counts}
      />

      <div style={{ height: 16 }} />

      {/* Month grid (visual context) */}
      <CalendarMonthGrid />

      <div style={{ height: 24 }} />

      {/* Filtered event list — uniform row format across all kinds. */}
      <section>
        <CapsLabel>
          {filter === "all"
            ? `All events · ${filteredEvents.length}`
            : filter === "booked"
              ? `Confirmed · ${filteredEvents.length}`
              : filter === "pending"
                ? `Pending replies · ${filteredEvents.length}`
                : filter === "inquiry"
                  ? `Open inquiries · ${filteredEvents.length}`
                  : filter === "cancelled"
                    ? `Cancelled · ${filteredEvents.length}`
                    : `Past · ${filteredEvents.length}`}
        </CapsLabel>
        <div
          style={{
            marginTop: 10,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {filteredEvents.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={
                filter === "booked"
                  ? "No confirmed bookings yet"
                  : filter === "pending"
                    ? "Nothing pending — you're caught up"
                    : filter === "inquiry"
                      ? "No open inquiries"
                      : "Nothing in the archive yet"
              }
              body="Switch filter above to see other kinds of events."
              compact
            />
          ) : (
            filteredEvents.map((e, idx) => (
              <CalendarEventRow
                key={e.id}
                event={e}
                conflicted={conflictedIds.has(e.id)}
                onOpen={() => openDrawer(e.drawer.id, e.drawer.payload)}
                first={idx === 0}
              />
            ))
          )}
        </div>
      </section>

      <div style={{ height: 16 }} />

      {/* Blocked dates — secondary section, kept compact */}
      <section style={{ marginBottom: 24 }}>
        <CapsLabel>Blocked dates · {AVAILABILITY_BLOCKS.length}</CapsLabel>
        <div
          style={{
            marginTop: 10,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "0 14px",
          }}
        >
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

      <ICalSubscribeCard talentName={MY_TALENT_PROFILE.name} slug="marta-reyes" />
    </>
  );
}

// ─── Calendar helpers ────────────────────────────────────────────────

/** Parse "May 14" / "Tue · May 6" / "May 14–15" → numeric day-of-month.
 *  Returns the START day unless `endOfRange` is true. */
/**
 * Lightweight payout-speed compute. Returns "Nd after work" given a
 * work date + payout date. Best-effort string parse — production should
 * subtract real Date objects.
 */
function computePayoutSpeed(workDate: string, payoutDate: string): string | null {
  const workMatch = workDate.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const payoutMatch = payoutDate.match(/([A-Za-z]+)\s+(\d{1,2})/);
  if (!workMatch || !payoutMatch) return null;
  const monthIdx: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const wMonth = monthIdx[workMatch[1]!] ?? -1;
  const pMonth = monthIdx[payoutMatch[1]!] ?? -1;
  if (wMonth === -1 || pMonth === -1) return null;
  const wDay = parseInt(workMatch[2]!, 10);
  const pDay = parseInt(payoutMatch[2]!, 10);
  // Approximate — assume same year, 30 days per month
  const diff = (pMonth - wMonth) * 30 + (pDay - wDay);
  if (diff <= 0) return null;
  if (diff <= 7) return `paid ${diff}d after work`;
  if (diff <= 21) return `paid ${diff}d later`;
  return `paid ${Math.round(diff / 7)}w later`;
}

function parseMayDay(s: string | null | undefined, endOfRange = false): number | null {
  if (!s) return null;
  const matches = s.match(/May\s*(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?/);
  if (!matches) return null;
  const start = parseInt(matches[1]!, 10);
  const end = matches[2] ? parseInt(matches[2], 10) : start;
  return endOfRange ? end : start;
}

function FilterChipStrip({
  filter,
  onChange,
  counts,
}: {
  filter: "booked" | "pending" | "inquiry" | "past" | "cancelled" | "all";
  onChange: (f: "booked" | "pending" | "inquiry" | "past" | "cancelled" | "all") => void;
  counts: { booked: number; pending: number; inquiry: number; past: number; cancelled: number; all: number };
}) {
  const chips: { key: typeof filter; label: string; count: number; tone: string }[] = [
    { key: "booked", label: "Booked", count: counts.booked, tone: COLORS.green },
    { key: "pending", label: "Pending", count: counts.pending, tone: COLORS.coral },
    { key: "inquiry", label: "Inquiry", count: counts.inquiry, tone: COLORS.indigo },
    { key: "cancelled", label: "Cancelled", count: counts.cancelled, tone: COLORS.critical },
    { key: "past", label: "Past", count: counts.past, tone: COLORS.inkDim },
    { key: "all", label: "All", count: counts.all, tone: COLORS.ink },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        marginTop: 4,
        flexWrap: "wrap",
      }}
    >
      {chips.map((c) => {
        const active = filter === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 11px",
              borderRadius: 999,
              background: active ? COLORS.ink : "#fff",
              border: `1px solid ${active ? COLORS.ink : COLORS.borderSoft}`,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 500,
              color: active ? "#fff" : COLORS.ink,
              transition: "background .12s, border-color .12s",
            }}
          >
            {!active && (
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: c.tone,
                }}
              />
            )}
            <span>{c.label}</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: active ? "rgba(255,255,255,0.6)" : COLORS.inkDim,
                fontSize: 11.5,
              }}
            >
              {c.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ConflictBanner({
  conflicts,
  onResolve,
}: {
  conflicts: { a: CalendarEvent; b: CalendarEvent }[];
  onResolve: (action: "decline" | "talk" | "reschedule", target: CalendarEvent) => void;
}) {
  // Severity escalates with conflict count: 1–2 is warning, 3+ is critical.
  const severe = conflicts.length >= 3;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 16px",
        marginBottom: 16,
        background: severe ? COLORS.criticalSoft : COLORS.coralSoft,
        border: `1px solid ${severe ? "rgba(176,48,58,0.25)" : "rgba(194,106,69,0.25)"}`,
        borderLeft: `3px solid ${severe ? COLORS.critical : COLORS.coral}`,
        borderRadius: 10,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: severe ? COLORS.criticalDeep : COLORS.coralDeep,
        }}
      >
        <Icon name="bolt" size={13} stroke={1.7} />
        {conflicts.length === 1
          ? "1 date conflict needs your attention"
          : `${conflicts.length} date conflicts need your attention`}
      </div>
      {conflicts.map((c, i) => {
        // The "pending" or "inquiry" side is the resolvable one — you can
        // decline a hold or talk to a coordinator. A confirmed booking is
        // already committed; resolution lives on the other side.
        const resolvable = c.a.kind === "pending" || c.a.kind === "inquiry" ? c.a : c.b;
        return (
          <div
            key={`${c.a.id}-${c.b.id}-${i}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 0 6px 22px",
              borderTop: i === 0 ? "none" : `1px solid ${severe ? "rgba(176,48,58,0.18)" : "rgba(194,106,69,0.18)"}`,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: severe ? COLORS.criticalDeep : COLORS.coralDeep,
                opacity: 0.95,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ fontWeight: 600 }}>
                {c.a.client} {c.a.dateLabel}
              </strong>
              {" "}({kindToLabel(c.a.kind)}) overlaps with{" "}
              <strong style={{ fontWeight: 600 }}>
                {c.b.client} {c.b.dateLabel}
              </strong>
              {" "}({kindToLabel(c.b.kind)}).
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ConflictActionChip
                label={`Decline ${resolvable.client}`}
                onClick={() => onResolve("decline", resolvable)}
                severe={severe}
              />
              <ConflictActionChip
                label="Talk to coordinator"
                onClick={() => onResolve("talk", resolvable)}
                severe={severe}
              />
              <ConflictActionChip
                label="Ask to reschedule"
                onClick={() => onResolve("reschedule", resolvable)}
                severe={severe}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConflictActionChip({
  label,
  onClick,
  severe,
}: {
  label: string;
  onClick: () => void;
  severe: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid ${severe ? "rgba(176,48,58,0.30)" : "rgba(194,106,69,0.30)"}`,
        borderRadius: 7,
        padding: "4px 10px",
        cursor: "pointer",
        fontFamily: FONTS.body,
        fontSize: 11.5,
        fontWeight: 500,
        color: severe ? COLORS.criticalDeep : COLORS.coralDeep,
      }}
    >
      {label}
    </button>
  );
}

function kindToLabel(kind: CalendarEventKind): string {
  return {
    booked: "confirmed booking",
    pending: "pending hold",
    inquiry: "open inquiry",
    past: "past",
    cancelled: "cancelled",
  }[kind];
}

/** Uniform row format across all event kinds. Coral edge when conflicted. */
function CalendarEventRow({
  event,
  conflicted,
  onOpen,
  first,
}: {
  event: CalendarEvent;
  conflicted: boolean;
  onOpen: () => void;
  first: boolean;
}) {
  const kindToTone: Record<CalendarEventKind, "success" | "coral" | "indigo" | "amber"> = {
    booked: "success",
    pending: "coral",
    inquiry: "indigo",
    past: "amber",
    cancelled: "amber", // slate — drained, not urgent
  };
  const kindLabel = {
    booked: "Booked",
    pending: "Pending",
    inquiry: "Inquiry",
    past: event.status.startsWith("Paid") ? "Paid" : "Wrapped",
    cancelled: "Cancelled",
  }[event.kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "14px 18px",
        paddingLeft: conflicted ? 22 : 18,
        borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: "background .12s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Conflict edge marker */}
      {conflicted && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 12,
            bottom: 12,
            left: 0,
            width: 3,
            background: COLORS.coral,
            borderRadius: "0 3px 3px 0",
          }}
        />
      )}

      {/* Shared date block — same primitive used on Today's Earning rows
          and Calendar peek section. One row pattern across surfaces. */}
      <DateBlock day={event.startDay ?? "—"} month="May" />

      {/* Title + status */}
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
          <span>{event.client}</span>
          <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>· {event.brief}</span>
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
          <KindChip label={kindLabel} tone={kindToTone[event.kind]} />
          {conflicted && <KindChip label="Conflict" tone="coral" />}
          <span style={{ color: COLORS.inkMuted }}>{event.status}</span>
        </div>
      </div>

      {event.amount && (
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: COLORS.ink,
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {event.amount}
        </span>
      )}
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// ACTIVITY (earnings + history)
// ════════════════════════════════════════════════════════════════════

// ─── B3: Activity — earnings & history (compactness pass) ──────────
//
// Replaces the table layout with the unified EarningRow pattern. Adds
// filter chips per source so the talent can slice "what did the personal
// page earn me" vs "what came from agencies" — the Reach connection
// surfaced inline.

function ActivityPage() {
  const { openDrawer } = useProto();
  const [filter, setFilter] = useState<"all" | "agency" | "personal" | "hub" | "studio" | "manual">("all");

  const filtered = EARNINGS_ROWS.filter(
    (e) => filter === "all" || e.source.kind === filter,
  );

  const total = EARNINGS_ROWS.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    return sum + num;
  }, 0);

  const filteredTotal = filtered.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    return sum + num;
  }, 0);

  // Top-source — what's actually earning the most.
  const sourceTotals: Record<string, number> = {};
  for (const e of EARNINGS_ROWS) {
    const k = e.source.kind;
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    sourceTotals[k] = (sourceTotals[k] ?? 0) + num;
  }
  const topSource = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1])[0];
  const topSourceLabel = topSource
    ? topSource[0] === "agency"
      ? "Agency-routed"
      : topSource[0] === "personal"
        ? "Personal page"
        : topSource[0] === "hub"
          ? "Tulala Hub"
          : topSource[0] === "manual"
            ? "Off-platform"
            : topSource[0]
    : "—";

  const counts = {
    all: EARNINGS_ROWS.length,
    agency: EARNINGS_ROWS.filter((e) => e.source.kind === "agency").length,
    personal: EARNINGS_ROWS.filter((e) => e.source.kind === "personal").length,
    hub: EARNINGS_ROWS.filter((e) => e.source.kind === "hub").length,
    studio: EARNINGS_ROWS.filter((e) => e.source.kind === "studio").length,
    manual: EARNINGS_ROWS.filter((e) => e.source.kind === "manual").length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Earnings & history"
        subtitle="Everything you've been paid — agency-routed, personal-page direct, hubs, off-platform. Tap a row for booking detail."
        actions={
          <>
            <SecondaryButton onClick={() => openDrawer("talent-add-event", { mode: "work" })}>
              + Log work
            </SecondaryButton>
            <SecondaryButton onClick={() => openDrawer("talent-payouts")}>
              Payout settings
            </SecondaryButton>
          </>
        }
      />

      {/* Compact stat strip — same pattern as Reach hero */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "12px 16px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <ReachStat label="Paid YTD" value={`€${total.toLocaleString()}`} caption={`across ${EARNINGS_ROWS.length} bookings`} tone="success" />
        <ReachStatDivider />
        <ReachStat label="Avg booking" value={`€${Math.round(total / EARNINGS_ROWS.length).toLocaleString()}`} caption="this year" tone="ink" />
        <ReachStatDivider />
        <ReachStat label="Top channel" value={topSourceLabel} caption={topSource ? `€${topSource[1].toLocaleString()}` : ""} tone="indigo" />
      </div>

      {/* Filter chips per source */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {([
          { key: "all" as const, label: "All", tone: COLORS.ink },
          { key: "agency" as const, label: "Agency", tone: COLORS.amber },
          { key: "personal" as const, label: "Personal page", tone: COLORS.royal },
          { key: "hub" as const, label: "Hubs", tone: COLORS.indigo },
          { key: "studio" as const, label: "Studios", tone: COLORS.green },
          { key: "manual" as const, label: "Off-platform", tone: COLORS.coral },
        ]).map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 11px",
                borderRadius: 999,
                background: active ? COLORS.ink : "#fff",
                border: `1px solid ${active ? COLORS.ink : COLORS.borderSoft}`,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 500,
                color: active ? "#fff" : COLORS.ink,
              }}
            >
              {!active && (
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: c.tone }} />
              )}
              <span>{c.label}</span>
              <span
                style={{
                  fontSize: 11,
                  color: active ? "rgba(255,255,255,0.6)" : COLORS.inkDim,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {counts[c.key]}
              </span>
            </button>
          );
        })}
      </div>

      <CapsLabel>
        {filter === "all" ? "All earnings" : `${filter.charAt(0).toUpperCase()}${filter.slice(1)} earnings`}
        {" · "}
        €{filteredTotal.toLocaleString()}
      </CapsLabel>

      <div
        style={{
          marginTop: 10,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "0 14px",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: "32px 12px" }}>
            <EmptyState
              icon="info"
              title={`No ${filter} earnings yet`}
              body="Switch filter above to see other sources."
              compact
            />
          </div>
        ) : (
          filtered.map((e) => <EarningRow key={e.id} earning={e} />)
        )}
      </div>

      {/* Legacy table block — keep for the bottom secondary "Status" column,
          but compact; chevron drawer handler stays the same. */}
      <div style={{ display: "none" }}>
        {EARNINGS_ROWS.map((e) => (
          <button
            key={e.id}
            onClick={() => openDrawer("talent-earnings-detail", { id: e.id })}
            style={{ display: "none" }}
          >
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
// REACH — distribution channels
// ════════════════════════════════════════════════════════════════════
//
// Where the talent shows up. Five distribution lanes, each with live
// performance counts. Talent can scan one screen and know:
//   - which channels are sending them work
//   - what each channel costs them in unwanted inquiries
//   - how to grow their reach (browse-to-add) or pull back (toggle off)
//
// The four-preset Exposure slider sits on top — it sets sensible
// defaults across all toggleable channels in one move. Per-channel
// granular toggles below let the talent override.
//
// Distinct from Settings (configuration) and Privacy (what to hide):
// Reach is operational. Distribution is a lever the talent owns.

function ReachPage() {
  const { openDrawer, toast } = useProto();

  // Local state — preset slider + per-channel overrides. In production
  // these would persist via mutations on TalentDistribution rows.
  const [preset, setPreset] = useState<ExposurePreset>("wide");
  // Per-channel toggle state, keyed by channel id. Initial value mirrors
  // the channel's `status === "live" || "published"` state.
  const [channelOn, setChannelOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      [...TALENT_CHANNELS, ...AVAILABLE_CHANNELS].map((c) => [
        c.id,
        c.status === "live" || c.status === "published",
      ]),
    ),
  );

  const setOn = (id: string, on: boolean) => {
    const wasOn = channelOn[id] ?? false;
    setChannelOn((prev) => ({ ...prev, [id]: on }));
    const ch =
      TALENT_CHANNELS.find((c) => c.id === id) ??
      AVAILABLE_CHANNELS.find((c) => c.id === id);
    // A11: undo on save toasts — pass an undo callback that flips back.
    if (ch) {
      toast(`${ch.name} · ${on ? "on" : "off"}`, {
        undo: () => setChannelOn((prev) => ({ ...prev, [id]: wasOn })),
      });
    }
  };

  // Maximum-confirm dialog state. Picking Maximum opens unverified
  // marketplace channels — the talent might get spammed by Basic clients.
  // Confirming makes the trade-off explicit before we apply it.
  const [showMaxConfirm, setShowMaxConfirm] = useState(false);

  const applyPreset = (next: ExposurePreset, skipMaxConfirm = false) => {
    if (next === "maximum" && !skipMaxConfirm) {
      setShowMaxConfirm(true);
      return;
    }
    setPreset(next);
    // Preset rules — translates a high-level intent into per-channel state.
    // Agency channels are unaffected (contracts handle them). Personal
    // page is always on (talent's own surface).
    setChannelOn((prev) => {
      const newState = { ...prev };
      for (const c of [...TALENT_CHANNELS, ...AVAILABLE_CHANNELS]) {
        if (!c.toggleable) continue;
        if (c.kind === "personal") {
          newState[c.id] = true;
          continue;
        }
        if (c.kind === "tulala-hub") {
          // On for everyone except Selective.
          newState[c.id] = next !== "selective";
          continue;
        }
        if (c.kind === "external") {
          if (next === "selective") newState[c.id] = false;
          else if (next === "curated") newState[c.id] = false;
          else if (next === "wide") newState[c.id] = c.verified === true;
          else newState[c.id] = true; // maximum
          continue;
        }
        if (c.kind === "studio") {
          if (next === "selective" || next === "curated") newState[c.id] = false;
          else newState[c.id] = next === "wide" ? prev[c.id] ?? false : true;
        }
      }
      return newState;
    });
    toast(`Exposure set to ${EXPOSURE_PRESET_META[next].label}`);
  };

  // Aggregate counts for hero strip
  const liveChannels = TALENT_CHANNELS.filter((c) => channelOn[c.id]).length;
  const totalInquiries7d = TALENT_CHANNELS.filter((c) => channelOn[c.id]).reduce(
    (sum, c) => sum + c.inquiries7d,
    0,
  );
  const totalInquiriesDelta = TALENT_CHANNELS.filter((c) => channelOn[c.id]).reduce(
    (sum, c) => sum + (c.inquiries7dDelta ?? 0),
    0,
  );
  const totalBookings90d = TALENT_CHANNELS.reduce((sum, c) => sum + c.bookings90d, 0);
  const totalEarnings90d = TALENT_CHANNELS.reduce((sum, c) => sum + c.earnings90d, 0);
  // Find the talent's top earning channel — surfaces "what's actually
  // working" at a glance.
  const topChannel = TALENT_CHANNELS.reduce<ChannelEntry | null>(
    (best, c) =>
      c.earnings90d > 0 && (!best || c.earnings90d > best.earnings90d) ? c : best,
    null,
  );

  return (
    <>
      <PageHeader
        eyebrow="Reach"
        title="Where you appear, and what each channel sent you."
        subtitle="Distribution is a lever you own. Toggle channels, see what works, grow your reach."
        actions={
          <SecondaryButton onClick={() => openDrawer("talent-public-preview")}>
            Preview public profile
          </SecondaryButton>
        }
      />

      {/* Top stat strip — at-a-glance reach summary. Each stat carries
          a delta or context line so the strip reads as "here's where I
          am, here's the trend." Earnings is the single most important
          metric — it answers "what did distribution actually earn me?" */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "10px 14px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <ReachStat
          label="Live channels"
          value={`${liveChannels}/${TALENT_CHANNELS.length}`}
          caption={topChannel ? `top: ${topChannel.name}` : ""}
        />
        <ReachStatDivider />
        <ReachStat
          label="Inquiries · 7d"
          value={String(totalInquiries7d)}
          caption={
            totalInquiriesDelta > 0
              ? `+${totalInquiriesDelta} vs prior 7d`
              : totalInquiriesDelta < 0
                ? `${totalInquiriesDelta} vs prior 7d`
                : "flat vs prior 7d"
          }
          captionTone={totalInquiriesDelta > 0 ? "success" : totalInquiriesDelta < 0 ? "coral" : "default"}
          tone="indigo"
        />
        <ReachStatDivider />
        <ReachStat
          label="Earnings · 90d"
          value={`€${totalEarnings90d.toLocaleString()}`}
          caption={`across ${totalBookings90d} bookings`}
          tone="success"
        />
      </div>

      {/* Exposure preset slider — the headline control */}
      <ExposurePresetSlider preset={preset} onChange={applyPreset} />

      <div style={{ height: 20 }} />

      {/* Five distribution cards — one per lane */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <DistributionCard
          kind="personal"
          title="Personal page"
          description="Your premium page on Tulala. The only channel you fully own."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "personal")}
          channelOn={channelOn}
          onToggle={setOn}
          onPrimary={{
            label: "Edit page",
            handler: () => openDrawer("talent-personal-page"),
          }}
        />
        <DistributionCard
          kind="tulala-hub"
          title="Tulala Hub"
          description="Curated discovery inside Tulala. Vetted by editorial."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "tulala-hub")}
          channelOn={channelOn}
          onToggle={setOn}
        />
        <DistributionCard
          kind="agency"
          title="Agencies on roster"
          description="One exclusive agency at a time. Make / leave / view rights granted per agency."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "agency")}
          channelOn={channelOn}
          onToggle={setOn}
          onPrimary={{
            label: "+ Join another agency",
            handler: () => openDrawer("talent-agency-relationship", { mode: "add" }),
          }}
          onManage={(c) => {
            // Map channel id ("ch-agency-acme") to MY_AGENCIES id ("ag1").
            // Best-effort lookup by name match; production will store the
            // agency_id directly on the distribution row.
            const ag = MY_AGENCIES.find((a) =>
              c.name.toLowerCase().includes(a.name.toLowerCase()) ||
              a.name.toLowerCase().includes(c.name.toLowerCase()),
            );
            openDrawer("talent-agency-relationship", { id: ag?.id ?? "ag1" });
          }}
        />
        <DistributionCard
          kind="external"
          title="External hubs"
          description="Verified third-party platforms that forward inquiries to you."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "external")}
          channelOn={channelOn}
          onToggle={setOn}
          available={AVAILABLE_CHANNELS.filter((c) => c.kind === "external")}
          onAdd={(c) => openDrawer("talent-hub-detail", { channelId: c.id })}
        />
        <DistributionCard
          kind="studio"
          title="Studios & free books"
          description="Creative-studio communities and free-book partnerships."
          channels={TALENT_CHANNELS.filter((c) => c.kind === "studio")}
          channelOn={channelOn}
          onToggle={setOn}
          available={AVAILABLE_CHANNELS.filter((c) => c.kind === "studio")}
          onAdd={(c) => openDrawer("talent-hub-detail", { channelId: c.id })}
        />
      </div>

      <div style={{ height: 24 }} />

      {/* Search / browse — quick add */}
      <section
        style={{
          background: COLORS.surfaceAlt,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "16px 18px",
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
          }}
        >
          <Icon name="search" size={14} stroke={1.7} color={COLORS.inkMuted} />
          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
            Find a hub or studio to join
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          New partner platforms are added monthly. Tulala vets every external hub before
          surfacing it here. Inquiries through verified hubs follow the same trust + payout
          rules as agency-routed work.
        </div>
        <div style={{ marginTop: 12 }}>
          <TextInput placeholder="Search Models.com, Cast Iron, Atelier Paris…" />
        </div>
      </section>

      {/* Maximum-exposure confirm dialog. Surfaces the real trade-off
          (marketplace inquiries from Basic clients) before applying. */}
      {showMaxConfirm && (
        <ModalConfirm
          title="Open every channel?"
          body={
            <>
              <p style={{ margin: "0 0 10px" }}>
                <strong>Maximum</strong> exposure adds unverified marketplace channels
                (BookEm.app, etc.). You may get inquiries from Basic-tier clients you
                wouldn't otherwise see.
              </p>
              <p style={{ margin: 0, color: COLORS.inkMuted }}>
                You can still toggle individual channels off below, or slide back to
                Wide at any time. No commitment.
              </p>
            </>
          }
          confirmLabel="Open every channel"
          confirmTone="critical"
          onConfirm={() => {
            setShowMaxConfirm(false);
            applyPreset("maximum", true);
          }}
          onCancel={() => setShowMaxConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Reach helpers ───────────────────────────────────────────────────

/**
 * Reusable confirm modal. Used when an action has a real trade-off the
 * user should see before committing (e.g., Maximum exposure).
 */
function ModalConfirm({
  title,
  body,
  confirmLabel,
  confirmTone = "ink",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmTone?: "ink" | "critical";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.40)",
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 50px rgba(11,11,13,0.18)",
          padding: "22px 24px",
          fontFamily: FONTS.body,
          zIndex: 201,
        }}
      >
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: COLORS.ink,
            margin: "0 0 10px",
          }}
        >
          {title}
        </h2>
        <div
          style={{
            fontSize: 13,
            color: COLORS.ink,
            lineHeight: 1.55,
            marginBottom: 18,
          }}
        >
          {body}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              background: confirmTone === "critical" ? COLORS.critical : COLORS.ink,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 14px",
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

function ReachStat({
  label,
  value,
  caption,
  captionTone = "default",
  tone = "ink",
}: {
  label: string;
  value: string;
  caption?: string;
  captionTone?: "default" | "success" | "coral" | "indigo";
  tone?: "ink" | "indigo" | "success";
}) {
  const fg = tone === "indigo" ? COLORS.indigo : tone === "success" ? COLORS.green : COLORS.ink;
  const captionColor =
    captionTone === "success"
      ? COLORS.green
      : captionTone === "coral"
        ? COLORS.coral
        : captionTone === "indigo"
          ? COLORS.indigo
          : COLORS.inkDim;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            fontWeight: 500,
            color: fg,
            letterSpacing: -0.2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {caption && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: captionColor,
              fontWeight: captionTone !== "default" ? 500 : 400,
            }}
          >
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}

function ReachStatDivider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 28,
        background: COLORS.borderSoft,
        margin: "0 14px",
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Exposure preset slider — four named levels with a live tooltip-style
 * description. Click a level to apply it. Recommended level (Wide) gets
 * a sage "Recommended" tag.
 */
function ExposurePresetSlider({
  preset,
  onChange,
}: {
  preset: ExposurePreset;
  onChange: (p: ExposurePreset) => void;
}) {
  const presets: ExposurePreset[] = ["selective", "curated", "wide", "maximum"];
  const current = EXPOSURE_PRESET_META[preset];

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.05,
            }}
          >
            Exposure level
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: COLORS.inkMuted,
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            One control, four levels. Sets sensible defaults across every channel.
            Override individual channels below.
          </div>
        </div>
      </div>

      {/* Segmented control */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          padding: 4,
          background: COLORS.surfaceAlt,
          borderRadius: 10,
        }}
      >
        {presets.map((p) => {
          const meta = EXPOSURE_PRESET_META[p];
          const active = preset === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              style={{
                position: "relative",
                background: active ? "#fff" : "transparent",
                border: "none",
                padding: "10px 8px",
                borderRadius: 7,
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "center",
                boxShadow: active ? COLORS.shadow : "none",
                transition: "background .12s, box-shadow .12s",
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? COLORS.ink : COLORS.inkMuted,
                  letterSpacing: -0.05,
                }}
              >
                {meta.label}
              </div>
              {meta.recommended && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: -6,
                    right: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: "rgba(46,125,91,0.15)",
                    color: COLORS.green,
                  }}
                >
                  Recommended
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Description for current preset */}
      <div
        style={{
          marginTop: 12,
          fontSize: 12.5,
          color: COLORS.inkMuted,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: COLORS.ink, fontWeight: 600 }}>
          {current.label}.
        </strong>{" "}
        {current.description}
      </div>
    </section>
  );
}

/**
 * Distribution card — one per lane. Header has lane title + description +
 * optional primary action (Edit / Join another). Body is a list of
 * channels in this lane with toggle + counts. Optional "Browse more"
 * footer when there are unjoined available channels.
 */
function DistributionCard({
  kind,
  title,
  description,
  channels,
  channelOn,
  onToggle,
  onPrimary,
  available,
  onAdd,
  onManage,
}: {
  kind: ChannelKind;
  title: string;
  description: string;
  channels: ChannelEntry[];
  channelOn: Record<string, boolean>;
  onToggle: (id: string, on: boolean) => void;
  onPrimary?: { label: string; handler: () => void };
  available?: ChannelEntry[];
  onAdd?: (c: ChannelEntry) => void;
  /** Manage action per channel — used by Agencies card to open the
   *  TalentAgencyRelationshipDrawer. Replaces the "Contract-managed"
   *  static label with a clickable "Manage →" affordance. */
  onManage?: (c: ChannelEntry) => void;
}) {
  // Lane-level icon + tone
  const laneMeta: Record<ChannelKind, { icon: string; toneFg: string; toneBg: string }> = {
    personal: { icon: "🌐", toneFg: COLORS.royal, toneBg: COLORS.royalSoft },
    "tulala-hub": { icon: "✦", toneFg: COLORS.accent, toneBg: COLORS.accentSoft },
    agency: { icon: "🏢", toneFg: COLORS.ink, toneBg: "rgba(11,11,13,0.05)" },
    external: { icon: "🌍", toneFg: COLORS.indigo, toneBg: COLORS.indigoSoft },
    studio: { icon: "🎬", toneFg: COLORS.green, toneBg: "rgba(46,125,91,0.10)" },
  };
  const lane = laneMeta[kind];
  const liveCount = channels.filter((c) => channelOn[c.id]).length;
  const totalAvail = channels.length + (available?.length ?? 0);
  const showAvailable = available && available.length > 0;

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
        fontFamily: FONTS.body,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: lane.toneBg,
            color: lane.toneFg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 14,
          }}
        >
          {lane.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.05,
            }}
          >
            <span>{title}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: COLORS.inkMuted,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {liveCount}/{totalAvail}
            </span>
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: COLORS.inkMuted,
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            {description}
          </div>
        </div>
        {onPrimary && (
          <button
            type="button"
            onClick={onPrimary.handler}
            style={{
              flexShrink: 0,
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
            {onPrimary.label} →
          </button>
        )}
      </div>

      {/* Channel list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {channels.map((c, i) => (
          <ChannelRow
            key={c.id}
            channel={c}
            on={channelOn[c.id] ?? false}
            onToggle={(next) => onToggle(c.id, next)}
            first={i === 0}
            onManage={onManage ? () => onManage(c) : undefined}
          />
        ))}
        {showAvailable && (
          <>
            {available!.map((c) => (
              <AvailableChannelRow
                key={c.id}
                channel={c}
                onAdd={() => onAdd!(c)}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

/** A row for a channel the talent is on. Shows performance + toggle. */
function ChannelRow({
  channel,
  on,
  onToggle,
  first,
  onManage,
}: {
  channel: ChannelEntry;
  on: boolean;
  onToggle: (next: boolean) => void;
  first: boolean;
  onManage?: () => void;
}) {
  // A8: local paused state. Paused = listed but not accepting NEW pitches.
  // Distinct from off (which fully removes you).
  const [paused, setPaused] = useState(false);
  const effectiveOn = on && !paused;
  const status =
    channel.toggleable === false
      ? channel.badge ?? "Contract"
      : paused && on
        ? "Paused"
        : on
          ? "Live"
          : "Off";
  const statusFg = paused && on ? COLORS.amber : on ? COLORS.green : COLORS.inkDim;
  // A10: trust-impact warning when toggling on an unverified channel.
  // Inline note below the row, dismissible by toggling off.
  const showTrustWarning = on && channel.kind === "external" && channel.verified === false;
  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}` }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        opacity: paused ? 0.6 : !on && channel.toggleable ? 0.7 : 1,
        transition: "opacity .12s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          <span>{channel.name}</span>
          {channel.verified && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                padding: "1px 5px",
                borderRadius: 4,
                background: COLORS.indigoSoft,
                color: COLORS.indigoDeep,
              }}
            >
              Verified
            </span>
          )}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: statusFg,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: statusFg,
              }}
            />
            {status}
          </span>
        </div>
        {channel.url && (
          <div
            style={{
              fontSize: 11.5,
              color: COLORS.inkMuted,
              marginTop: 1,
              fontFamily: FONTS.body,
            }}
          >
            {channel.url}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 4,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            fontVariantNumeric: "tabular-nums",
            flexWrap: "wrap",
          }}
        >
          <span>
            {channel.views7d} views · {channel.inquiries7d} inquiries · 7d
          </span>
          {channel.bookings90d > 0 && (
            <span style={{ color: COLORS.inkDim }}>·</span>
          )}
          {channel.bookings90d > 0 && (
            <span>{channel.bookings90d} bookings · 90d</span>
          )}
          {channel.earnings90d > 0 && (
            <>
              <span style={{ color: COLORS.inkDim }}>·</span>
              <span style={{ color: COLORS.green, fontWeight: 600 }}>
                {channel.earningsCurrency ?? "€"}
                {channel.earnings90d.toLocaleString()} · 90d
              </span>
            </>
          )}
          {channel.feeRate !== undefined && channel.feeRate > 0 && (
            <span
              style={{
                fontSize: 10.5,
                color: COLORS.inkDim,
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(11,11,13,0.04)",
              }}
            >
              {Math.round(channel.feeRate * 100)}% fee
            </span>
          )}
        </div>
      </div>
      {channel.toggleable ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Toggle on={on} onChange={() => onToggle(!on)} />
          {/* A8: Pause / Resume link — only when channel is on */}
          {on && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontFamily: FONTS.body,
                fontSize: 10.5,
                color: paused ? COLORS.amber : COLORS.inkMuted,
                cursor: "pointer",
                fontWeight: paused ? 600 : 500,
              }}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      ) : onManage ? (
        <button
          type="button"
          onClick={onManage}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 7,
            padding: "5px 11px",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
            color: COLORS.ink,
            cursor: "pointer",
          }}
        >
          Manage →
        </button>
      ) : (
        <span
          style={{
            fontSize: 11,
            color: COLORS.inkDim,
            fontFamily: FONTS.body,
          }}
        >
          Contract-managed
        </span>
      )}
    </div>
    {/* A10: trust-impact warning — coral inline note when channel is on
        AND not Tulala-verified. Sets expectation about lower-quality
        inquiries before they hit the inbox. */}
    {showTrustWarning && !paused && (
      <div
        style={{
          padding: "8px 14px 12px 14px",
          borderTop: `1px dashed rgba(194,106,69,0.20)`,
          background: COLORS.coralSoft,
          fontFamily: FONTS.body,
          fontSize: 11,
          color: COLORS.coralDeep,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 600 }}>Heads up:</strong> {channel.name} isn't Tulala-verified. Inquiries may include unvetted clients. Adjust your contact policy if needed.
      </div>
    )}
    {paused && (
      <div
        style={{
          padding: "8px 14px 12px 14px",
          borderTop: `1px dashed rgba(82,96,109,0.20)`,
          background: "rgba(82,96,109,0.06)",
          fontFamily: FONTS.body,
          fontSize: 11,
          color: COLORS.amber,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 600 }}>Paused:</strong> still listed but not accepting new pitches. Click Resume to start accepting again.
      </div>
    )}
    </div>
  );
}

/** A row for a channel the talent is NOT YET on. One-click add. */
function AvailableChannelRow({
  channel,
  onAdd,
}: {
  channel: ChannelEntry;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "rgba(11,11,13,0.015)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            fontWeight: 500,
            color: COLORS.inkMuted,
          }}
        >
          <span>{channel.name}</span>
          {channel.verified && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                padding: "1px 5px",
                borderRadius: 4,
                background: COLORS.indigoSoft,
                color: COLORS.indigoDeep,
              }}
            >
              Verified
            </span>
          )}
          <span style={{ fontSize: 11, color: COLORS.inkDim }}>
            Available · not joined
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        style={{
          flexShrink: 0,
          background: "transparent",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 7,
          padding: "4px 10px",
          fontFamily: FONTS.body,
          fontSize: 11.5,
          fontWeight: 500,
          color: COLORS.ink,
          cursor: "pointer",
        }}
      >
        + Add
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════

function SettingsPage() {
  const { openDrawer, setTalentPage } = useProto();

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Your account"
        subtitle="Agencies, notifications, privacy and payouts. Where you appear lives in Reach."
        actions={
          <SecondaryButton onClick={() => setTalentPage("reach")}>
            Open Reach →
          </SecondaryButton>
        }
      />

      {/* A4 cross-link banner — Reach owns distribution decisions; Privacy
          here is just the locked / sensitive bits. */}
      <button
        type="button"
        onClick={() => setTalentPage("reach")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "12px 14px",
          marginBottom: 16,
          background: COLORS.indigoSoft,
          border: `1px solid rgba(91,107,160,0.18)`,
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: FONTS.body,
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
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
          <Icon name="globe" size={13} stroke={1.7} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.indigoDeep }}>
            Distribution decisions live in Reach
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: COLORS.indigoDeep,
              opacity: 0.78,
              marginTop: 1,
            }}
          >
            Toggle channels, manage which hubs and studios you're listed on, set exposure presets — all over there.
          </div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.indigoDeep }}>
          Open Reach →
        </span>
      </button>

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

      <Divider label="Personal page" />
      <Grid cols="2">
        <SecondaryCard
          title={`Plan · ${TALENT_TIER_META[MY_TALENT_PROFILE.subscription.tier].label}`}
          description={
            MY_TALENT_PROFILE.subscription.tier === "basic"
              ? "Standard public profile. Upgrade to unlock templates, embeds, press band, and a custom domain."
              : MY_TALENT_PROFILE.subscription.tier === "pro"
                ? `Pro · ${TALENT_TIER_META.pro.monthlyPrice}. Renews ${MY_TALENT_PROFILE.subscription.renewsOn ?? "monthly"}.`
                : `Portfolio · ${TALENT_TIER_META.portfolio.monthlyPrice}. Renews ${MY_TALENT_PROFILE.subscription.renewsOn ?? "monthly"}.`
          }
          meta={
            <>
              <StatDot tone={MY_TALENT_PROFILE.subscription.tier === "basic" ? "dim" : "green"} />
              {MY_TALENT_PROFILE.subscription.tier === "basic" ? "Free" : "Active"}
            </>
          }
          affordance={MY_TALENT_PROFILE.subscription.tier === "portfolio" ? "Manage plan" : "Compare plans"}
          onClick={() => openDrawer("talent-tier-compare")}
        />
        <SecondaryCard
          title="Personal page builder"
          description="Templates, sections, embeds and (Portfolio) custom domain. Coexists with all your agency rosters."
          meta={MY_TALENT_PROFILE.subscription.personalPageEnabled ? <><StatDot tone="green" /> Live</> : <><StatDot tone="dim" /> Off</>}
          affordance={tierAllows(MY_TALENT_PROFILE.subscription.tier, "extra-sections") ? "Edit page" : "Choose template"}
          onClick={() =>
            tierAllows(MY_TALENT_PROFILE.subscription.tier, "extra-sections")
              ? openDrawer("talent-personal-page")
              : openDrawer("talent-page-template")
          }
        />
      </Grid>

      <Divider label="Account" />
      <Grid cols="2">
        <SecondaryCard
          title="Contact preferences"
          description="Choose which client trust tiers can send you inquiries. Selectivity is opt-in — defaults stay open."
          meta={<ContactPolicySummary policy={MY_TALENT_PROFILE.contactPolicy} />}
          affordance="Manage"
          onClick={() => openDrawer("talent-contact-preferences")}
        />
        <SecondaryCard
          title="Notifications"
          description="What email and push you get when an agency sends you a request."
          affordance="Manage prefs"
          onClick={() => openDrawer("talent-notifications", { expanded: "settings" })}
        />
        <SecondaryCard
          title="Privacy"
          description="Search-engine indexing, sensitive measurements, document visibility. Channel toggles moved to Reach."
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
          title="Help & support"
          description="Common questions, contracts, payouts, contact our team."
          affordance="Get help"
          onClick={() => openDrawer("help")}
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

/** Compact "open to all" / "selective · 3 of 4" summary for the card meta. */
function ContactPolicySummary({ policy }: { policy: TalentContactPolicy }) {
  const allowed = (Object.values(policy) as boolean[]).filter(Boolean).length;
  const total = Object.values(policy).length;
  const allOn = allowed === total;
  return (
    <>
      <StatDot tone={allOn ? "green" : "amber"} />
      {allOn ? "Open to all tiers" : `Selective · ${allowed} of ${total} tiers on`}
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
                <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.client} · {r.brief}
                </span>
                <ClientTrustChip level={r.clientTrust} compact />
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
      toolbar={<ClientTrustChip level={r.clientTrust} />}
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

// ─── Closed booking (read-only past-work archive) ────────────────────
// Opens when a talent clicks a row in "Recent earnings" on Today.
// Shows what the booking WAS — team, key facts, archived chat — so a
// talent can look back at past work without leaving Today. Read-only by
// design: this isn't a booking workflow, it's a portfolio entry.

export function TalentClosedBookingDrawer() {
  const { state, closeDrawer, openDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-closed-booking";
  const earningId = (state.drawer.payload?.earningId as string) ?? "e1";
  const e = EARNINGS_ROWS.find((x) => x.id === earningId) ?? EARNINGS_ROWS[0]!;
  const idx = EARNINGS_ROWS.findIndex((x) => x.id === earningId);
  const prev = idx > 0 ? EARNINGS_ROWS[idx - 1] : null;
  const next = idx < EARNINGS_ROWS.length - 1 ? EARNINGS_ROWS[idx + 1] : null;

  // Mock per-booking detail (in production, derived from the booking +
  // archived inquiry thread). Different shape per client to demonstrate
  // variety.
  const detail = MOCK_CLOSED_DETAIL[e.id] ?? MOCK_CLOSED_DETAIL.default!;

  // Repeat-client signal — count of bookings + lifetime earnings with
  // this client across all completed bookings. Surfaces "this is your
  // 5th gig with Vogue Italia" as a relationship signal.
  const sameClient = EARNINGS_ROWS.filter((x) => x.client === e.client);
  const lifetimeAmount = sameClient.reduce((sum, x) => {
    const num = parseFloat(x.amount.replace(/[^0-9.]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const currency = e.amount.match(/[€£$]/)?.[0] ?? "€";
  const lifetimeLabel = `${currency}${lifetimeAmount.toLocaleString()}`;
  const isRepeat = sameClient.length > 1;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${e.client} · ${detail.brief}`}
      description={`Closed booking · worked ${e.workDate} · paid ${e.payoutDate}`}
      width={580}
      footer={
        <>
          <button
            type="button"
            onClick={() => prev && openDrawer("talent-closed-booking", { earningId: prev.id })}
            disabled={!prev}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 7,
              padding: "7px 11px",
              fontFamily: FONTS.body,
              fontSize: 12,
              color: prev ? COLORS.ink : COLORS.inkDim,
              cursor: prev ? "pointer" : "not-allowed",
            }}
          >
            ← Newer
          </button>
          <button
            type="button"
            onClick={() => next && openDrawer("talent-closed-booking", { earningId: next.id })}
            disabled={!next}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 7,
              padding: "7px 11px",
              fontFamily: FONTS.body,
              fontSize: 12,
              color: next ? COLORS.ink : COLORS.inkDim,
              cursor: next ? "pointer" : "not-allowed",
            }}
          >
            Older →
          </button>
          <div style={{ flex: 1 }} />
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      {/* Closed/archived banner — visual cue that this is read-only. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "rgba(11,11,13,0.04)",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 8,
          marginBottom: 12,
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.inkMuted,
        }}
      >
        <Icon name="lock" size={12} stroke={1.7} />
        <span>Archived · paid {e.payoutDate}. Read-only.</span>
        <span style={{ marginLeft: "auto", color: COLORS.ink, fontWeight: 600 }}>
          {e.amount}
        </span>
      </div>

      {/* Source attribution — answers "where did this booking come from?"
          The chip + optional "you brought" pill teach the talent the value
          of each distribution channel over time. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          fontFamily: FONTS.body,
          fontSize: 11.5,
        }}
      >
        <SourceChip source={e.source} />
        {e.broughtTeam && e.team && e.team.length > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 8px",
              borderRadius: 999,
              background: COLORS.coralSoft,
              color: COLORS.coralDeep,
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            <Icon name="user" size={10} stroke={1.8} />
            You brought {e.team.join(", ")}
          </span>
        )}
        {!e.team || e.team.length === 0 ? (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(11,11,13,0.05)",
              color: COLORS.inkMuted,
              fontWeight: 500,
              fontSize: 11,
            }}
          >
            Solo
          </span>
        ) : null}
      </div>

      {/* Repeat-client signal — only shows for clients with > 1 booking.
          Sage tone to mark a relationship; meaningful info for a talent
          looking back at career history. */}
      {isRepeat && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "rgba(46,125,91,0.08)",
            border: `1px solid rgba(46,125,91,0.18)`,
            borderRadius: 8,
            marginBottom: 16,
            fontFamily: FONTS.body,
            fontSize: 12.5,
          }}
        >
          <Icon name="check" size={12} stroke={1.7} color={COLORS.green} />
          <span style={{ color: COLORS.successDeep, fontWeight: 500 }}>
            Booking #{sameClient.length} with {e.client} · {lifetimeLabel} lifetime
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Booking facts */}
        <section>
          <SectionLabel>Booking</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <KvRow label="Date worked" value={e.workDate} />
            <KvRow label="Location" value={detail.location} />
            <KvRow label="Call time" value={detail.call} />
            <KvRow label="Agency" value={e.agency} />
            <KvRow label="Fee paid" value={e.amount} />
          </div>
        </section>

        {/* Team — who else was on the booking */}
        <section>
          <SectionLabel>Who was there</SectionLabel>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              marginTop: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {detail.team.map((p, i) => (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                }}
              >
                <Avatar
                  size={28}
                  tone="auto"
                  hashSeed={p.name}
                  initials={p.name
                    .split(/\s+/)
                    .map((w) => w.charAt(0))
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: COLORS.ink, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ color: COLORS.inkMuted, fontSize: 11 }}>{p.role}</div>
                </div>
                {p.you && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      background: COLORS.coralSoft,
                      color: COLORS.coralDeep,
                      borderRadius: 999,
                    }}
                  >
                    You
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Chat archive — read-only snapshot */}
        <section>
          <SectionLabel>Archived chat</SectionLabel>
          <div
            style={{
              marginTop: 8,
              padding: "12px 14px",
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              fontFamily: FONTS.body,
              fontSize: 12.5,
            }}
          >
            {detail.chat.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    color: COLORS.inkMuted,
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontWeight: 600, color: COLORS.ink }}>{m.from}</span>
                  <span style={{ color: COLORS.inkDim }}>· {m.when}</span>
                </div>
                <div style={{ color: COLORS.ink, lineHeight: 1.5 }}>{m.body}</div>
              </div>
            ))}
            <div
              style={{
                marginTop: 4,
                paddingTop: 10,
                borderTop: `1px solid ${COLORS.borderSoft}`,
                fontSize: 11,
                color: COLORS.inkDim,
                textAlign: "center",
              }}
            >
              Thread closed when payout landed. {detail.chat.length} messages archived.
            </div>
          </div>
        </section>

        {/* What was delivered */}
        {detail.delivered && (
          <section>
            <SectionLabel>Delivered</SectionLabel>
            <ul
              style={{
                margin: "8px 0 0",
                paddingLeft: 18,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                lineHeight: 1.7,
              }}
            >
              {detail.delivered.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Client review — when present. Sage soft surface + 5-star rating
            + quoted feedback. Builds the talent's portfolio of validation
            over time. */}

        {/* D4: Contract section. Production: pull signed PDF from
            booking_contracts table. For prototype: scaffold the link. */}
        <section>
          <SectionLabel>Contract</SectionLabel>
          <button
            type="button"
            onClick={() => toast(`Opening signed contract for ${e.client}…`)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "12px 14px",
              marginTop: 8,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: COLORS.surfaceAlt,
                color: COLORS.ink,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontFamily: FONTS.display,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              PDF
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
                Signed booking agreement
              </div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                {e.client} · {e.workDate} · counter-signed by both parties
              </div>
            </div>
            <Icon name="external" size={13} color={COLORS.inkDim} />
          </button>
        </section>

        {detail.review && (
          <section>
            <SectionLabel>Client review</SectionLabel>
            <div
              style={{
                marginTop: 8,
                padding: "12px 14px",
                background: "rgba(46,125,91,0.06)",
                border: `1px solid rgba(46,125,91,0.16)`,
                borderRadius: 10,
                fontFamily: FONTS.body,
                fontSize: 12.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    color: COLORS.green,
                    fontSize: 13,
                    letterSpacing: 1,
                  }}
                >
                  {"★".repeat(detail.review.rating)}
                  <span style={{ color: COLORS.inkDim, opacity: 0.6 }}>
                    {"★".repeat(5 - detail.review.rating)}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: COLORS.inkMuted,
                  }}
                >
                  {detail.review.author}
                </span>
              </div>
              <div
                style={{
                  color: COLORS.ink,
                  lineHeight: 1.6,
                  fontStyle: "italic",
                }}
              >
                "{detail.review.body}"
              </div>
            </div>
          </section>
        )}
      </div>
    </DrawerShell>
  );
}

/**
 * Source chip in the closed-booking drawer header. Tone-coded by kind so
 * the talent learns where each booking came from at a glance:
 *   agency      slate    standard agency-routed
 *   hub         indigo   Tulala Hub or external aggregator
 *   personal    royal    talent's premium personal page (Pro+)
 *   studio      sage     studio / free-book partner
 *   marketplace amber    open marketplace
 */
function SourceChip({ source }: { source: import("./_state").EarningSource }) {
  const labelFor = (s: typeof source) => {
    switch (s.kind) {
      case "agency":
        return "Agency-routed";
      case "hub":
        return `via ${s.name}`;
      case "personal":
        return "Direct · personal page";
      case "studio":
        return `via ${s.name}`;
      case "marketplace":
        return `via ${s.name}`;
      case "manual":
        return "Off-platform · added by you";
    }
  };
  const palette: Record<typeof source.kind, { bg: string; fg: string }> = {
    agency: { bg: "rgba(82,96,109,0.10)", fg: "#3A4651" },
    hub: { bg: COLORS.indigoSoft, fg: COLORS.indigoDeep },
    personal: { bg: COLORS.royalSoft, fg: COLORS.royalDeep },
    studio: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" },
    marketplace: { bg: "rgba(82,96,109,0.10)", fg: "#3A4651" },
    manual: { bg: COLORS.coralSoft, fg: COLORS.coralDeep },
  };
  const c = palette[source.kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: -0.05,
      }}
    >
      {labelFor(source)}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: COLORS.inkMuted,
      }}
    >
      {children}
    </div>
  );
}

// Mock chat + team per closed booking. Three distinct shapes to show the
// drawer renders differently based on what actually happened on each job.
const MOCK_CLOSED_DETAIL: Record<
  string,
  {
    brief: string;
    location: string;
    call: string;
    team: { name: string; role: string; you?: boolean }[];
    chat: { from: string; when: string; body: string }[];
    delivered?: string[];
    review?: { author: string; rating: number; body: string };
  }
> = {
  e1: {
    brief: "Spring campaign · 1 day",
    location: "Madrid · ESTUDIO ROCA",
    call: "08:30 — 18:00",
    team: [
      { name: "Marta Reyes", role: "Talent · lead", you: true },
      { name: "Tomás Navarro", role: "Talent" },
      { name: "Inés López", role: "Producer · Zara" },
      { name: "Lia Roca", role: "Stylist" },
      { name: "Studio Roca", role: "Photographer" },
      { name: "Ana Vega", role: "Coordinator · Acme Models" },
    ],
    chat: [
      {
        from: "Ana Vega",
        when: "Mar 22 · 10:14",
        body: "Zara spring campaign confirmed for Mar 28. Marta + Tomás on lead, Studio Roca shooting.",
      },
      {
        from: "Marta",
        when: "Mar 22 · 10:31",
        body: "Confirmed. Will bring nude underwear + neutrals as briefed.",
      },
      {
        from: "Inés López",
        when: "Mar 27 · 17:02",
        body: "Reminder — call time 08:30 sharp. Coffee from 08:15. Forecast says light rain so we're going indoors only.",
      },
      {
        from: "Marta",
        when: "Mar 28 · 19:48",
        body: "Wrapped. Great energy on set, thanks all 🙏",
      },
    ],
    delivered: ["12 looks · Zara spring campaign", "Hero image (selected by client)"],
    review: {
      author: "Inés López · Producer · Zara",
      rating: 5,
      body: "Marta is a complete pro — on time, prepared, and sets the tone for the whole crew. We'll book her again for the autumn campaign.",
    },
  },
  e2: {
    brief: "Editorial · spring/summer campaign",
    location: "London · Studio 2C",
    call: "07:00 — 16:30",
    team: [
      { name: "Marta Reyes", role: "Talent · solo", you: true },
      { name: "James Hart", role: "Producer · Burberry" },
      { name: "Olive Carter", role: "Stylist" },
      { name: "Praline London", role: "Coordinator" },
    ],
    chat: [
      {
        from: "Praline London",
        when: "Mar 5 · 09:20",
        body: "Burberry editorial confirmed for Mar 10. Solo booking, you're carrying the campaign.",
      },
      {
        from: "Marta",
        when: "Mar 5 · 09:42",
        body: "Confirmed. Travel to London Mar 9, Studio 2C call at 07:00.",
      },
      {
        from: "James Hart",
        when: "Mar 10 · 18:11",
        body: "Brilliant work today, Marta. We'll send selects within two weeks.",
      },
    ],
    delivered: ["8 final selects · Burberry SS editorial", "Behind-the-scenes carousel"],
  },
  e3: {
    brief: "Editorial spread · 2 day shoot",
    location: "Milan · Studio 5",
    call: "07:00 — 19:00",
    team: [
      { name: "Marta Reyes", role: "Talent", you: true },
      { name: "Lina Park", role: "Talent" },
      { name: "Paolo Bianchi", role: "Photographer · Vogue Italia" },
      { name: "Ana Vega", role: "Coordinator · Acme Models" },
    ],
    chat: [
      {
        from: "Ana Vega",
        when: "Feb 24 · 14:30",
        body: "Vogue Italia editorial confirmed Mar 1–2 in Milan. You + Lina Park.",
      },
      {
        from: "Marta",
        when: "Feb 24 · 14:51",
        body: "Confirmed. Booking flights for Feb 29.",
      },
      {
        from: "Paolo Bianchi",
        when: "Mar 2 · 21:15",
        body: "Grazie a tutte. Pages will run in the May issue.",
      },
    ],
    delivered: ["8-page editorial spread (May issue)", "Cover try"],
    review: {
      author: "Paolo Bianchi · Photographer",
      rating: 5,
      body: "Una pleasure assoluta. Marta brought presence and patience to a difficult two-day shoot. Highly recommended.",
    },
  },
  // Solo gig sourced via Tulala Hub. Demonstrates a non-agency channel
  // delivering paid work — the kind of booking that would be invisible
  // before the Hub became a distribution surface.
  e6: {
    brief: "Brand campaign · 1 day",
    location: "Berlin · Studio Mitte",
    call: "09:00 — 17:00",
    team: [
      { name: "Marta Reyes", role: "Talent · solo", you: true },
      { name: "Hanna Berg", role: "Producer · Bumble" },
      { name: "Studio Mitte", role: "Photographer" },
    ],
    chat: [
      {
        from: "Tulala Hub",
        when: "Mar 30 · 11:24",
        body: "Bumble forwarded an inquiry for you via the Tulala Hub. Solo, 1 day in Berlin Apr 5.",
      },
      {
        from: "Marta",
        when: "Mar 30 · 11:48",
        body: "Confirmed. I'll travel up Apr 4.",
      },
      {
        from: "Hanna Berg",
        when: "Apr 5 · 17:32",
        body: "Wrap. Selects in 10 days, payout via Tulala Hub.",
      },
    ],
    delivered: ["6 final selects · spring brand campaign"],
  },

  // Personal-page gig where Marta brought her friend Carla as the second
  // talent. Marta acted as de-facto coordinator. Demonstrates the
  // talent-as-coordinator path that exists when distribution comes
  // through her own premium page.
  e7: {
    brief: "Capsule editorial · 2 talent · 1 day",
    location: "Madrid · ESTUDIO ROCA",
    call: "08:00 — 18:00",
    team: [
      { name: "Marta Reyes", role: "Talent · brought the team", you: true },
      { name: "Carla Vega", role: "Talent · brought by Marta" },
      { name: "Loewe team", role: "Producer · Loewe" },
      { name: "Studio Roca", role: "Photographer" },
    ],
    chat: [
      {
        from: "Loewe",
        when: "Apr 1 · 09:12",
        body: "Hi Marta — found you via your page. We need two talent for a capsule day on Apr 12. Can you bring a second?",
      },
      {
        from: "Marta",
        when: "Apr 1 · 09:34",
        body: "Yes — Carla Vega works well with me. Sending her details now. Day rate €1,800/talent · €3,600 total.",
      },
      {
        from: "Loewe",
        when: "Apr 1 · 10:02",
        body: "Approved. See you both Apr 12.",
      },
      {
        from: "Marta",
        when: "Apr 12 · 18:47",
        body: "Wrapped. Carla and I had a great day. Gracias 🙏",
      },
    ],
    delivered: [
      "8-look capsule editorial · 2 talent",
      "Hero campaign image · selected by client",
    ],
  },

  default: {
    brief: "Closed booking",
    location: "—",
    call: "—",
    team: [{ name: "Marta Reyes", role: "Talent", you: true }],
    chat: [],
  },
};

// ─── Add event (manual booking / block) ─────────────────────────────
//
// Talents have lives outside the platform — full-time jobs, school,
// vacation, friend's photo shoots, repeat clients they've worked with
// for years. Tulala becomes their booking manager only if they can
// log ALL of it here — not just Tulala-routed gigs.
//
// Two flows, one entry point:
//   work    → off-platform booking. Earnings row + calendar event +
//             coral "Off-platform" source chip when surfaced later.
//             Quick form (3 fields, 5 seconds) by default; advanced
//             toggle reveals location / time / contact / brief / notes.
//   block   → calendar block for non-work. Reason taxonomy: travel /
//             personal / other job / family / other. Doesn't count as
//             earnings, doesn't fight booking pitches the way "paused"
//             availability does — it's a single window.
//
// In production this also feeds tax exports (talent self-reports
// off-platform income) and powers the "convert to Tulala-tracked"
// suggestion when a manual client name matches a verified Tulala
// client identity.

type AddEventMode = "pick" | "work" | "block";

// ─── A3: Hub-detail mini-drawer ─────────────────────────────────────
//
// Opens when a talent clicks "+ Add" on an unjoined channel in Reach.
// Shows the channel's terms, fees, expected response time BEFORE the
// talent commits. Avoids the "I joined this and now I'm spammed" problem.

export function TalentHubDetailDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-hub-detail";
  const channelId = (state.drawer.payload?.channelId as string) ?? "";
  const channel =
    TALENT_CHANNELS.find((c) => c.id === channelId) ??
    AVAILABLE_CHANNELS.find((c) => c.id === channelId) ??
    null;

  if (!channel) return null;

  const feePct = channel.feeRate ? Math.round(channel.feeRate * 100) : 0;
  const responseTime =
    channel.kind === "studio"
      ? "1–3 weeks (slow but high-quality leads)"
      : channel.verified
        ? "Within 24h for most inquiries"
        : "Variable — newer platform, less data";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={channel.name}
      description={`${channel.kind === "studio" ? "Studio · free book" : channel.verified ? "Verified external hub" : "External hub · not yet Tulala-verified"} · joining is reversible`}
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast(`Joined ${channel.name} · they'll forward inquiries to you`);
              closeDrawer();
            }}
          >
            Join {channel.name}
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONTS.body }}>
        {channel.description && (
          <div
            style={{
              padding: "12px 14px",
              background: COLORS.surfaceAlt,
              borderRadius: 10,
              fontSize: 13,
              color: COLORS.ink,
              lineHeight: 1.55,
            }}
          >
            {channel.description}
          </div>
        )}

        <section>
          <SubsectionLabel>The deal</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <KvRow label="Fee rate" value={feePct === 0 ? "0% · no platform take" : `${feePct}% on bookings via ${channel.name}`} />
            <KvRow label="Response time" value={responseTime} />
            <KvRow
              label="Verified"
              value={
                channel.verified ? "Yes — Tulala-vetted" : "No — newer / unverified"
              }
            />
            <KvRow label="Reversible?" value="Yes — toggle off anytime in Reach" />
          </div>
        </section>

        <section>
          <SubsectionLabel>What happens when you join</SubsectionLabel>
          <ul
            style={{
              margin: "8px 0 0",
              paddingLeft: 18,
              fontSize: 12.5,
              color: COLORS.ink,
              lineHeight: 1.7,
            }}
          >
            <li>{channel.name} can list your profile + forward inquiries</li>
            <li>Inquiries land in your Tulala inbox alongside agency-routed ones</li>
            <li>Your contact-policy filters still apply — Basic-tier clients are blocked if you've blocked them</li>
            {feePct > 0 && (
              <li>
                When a booking comes through {channel.name}, they take {feePct}% of the fee at payout
              </li>
            )}
            <li>You can pause or leave any time from Reach</li>
          </ul>
        </section>

        {!channel.verified && (
          <div
            style={{
              padding: "10px 12px",
              background: COLORS.coralSoft,
              border: `1px solid rgba(194,106,69,0.18)`,
              borderRadius: 8,
              fontSize: 11.5,
              color: COLORS.coralDeep,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ fontWeight: 600 }}>Heads up:</strong>{" "}
            {channel.name} isn't yet Tulala-verified. Inquiries may include
            unvetted clients. You can leave with one click if quality drops.
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

export function TalentAddEventDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-add-event";
  const initialMode = (state.drawer.payload?.mode as AddEventMode | undefined) ?? "pick";
  const [mode, setMode] = useState<AddEventMode>(initialMode);

  // Reset to picker when drawer reopens with no mode (open from a generic CTA)
  // — but if reopened with a specific mode (e.g., from a "Block dates" link),
  // honor that.
  // Note: state.drawer.payload changes don't auto-reset useState; this only
  // matters on first mount.

  return (
    <DrawerShell
      open={open}
      onClose={() => {
        setMode("pick");
        closeDrawer();
      }}
      title={
        mode === "pick"
          ? "Add to your calendar"
          : mode === "work"
            ? "Log work"
            : "Block time"
      }
      description={
        mode === "pick"
          ? "Track your booking life — even when the gig didn't come through Tulala."
          : mode === "work"
            ? "Off-platform booking? Log it here so it counts toward your earnings + history."
            : "Block your calendar so agencies don't pitch you when you're unavailable."
      }
      width={540}
      footer={
        mode === "pick" ? (
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
        ) : undefined // forms own their own footers
      }
    >
      {mode === "pick" && (
        <ModePicker
          onPick={(m) => setMode(m)}
        />
      )}
      {mode === "work" && (
        <LogWorkForm
          onCancel={() => setMode("pick")}
          onSave={(data) => {
            const summary =
              data.client && data.amount
                ? `Logged ${data.client} · ${data.amount}`
                : "Booking logged";
            toast(`${summary} · added to your calendar + earnings`);
            closeDrawer();
          }}
        />
      )}
      {mode === "block" && (
        <BlockTimeForm
          onCancel={() => setMode("pick")}
          onSave={(data) => {
            toast(
              `${data.reason || "Time"} blocked · ${data.from || "—"}${data.to ? ` → ${data.to}` : ""}`,
            );
            closeDrawer();
          }}
        />
      )}
    </DrawerShell>
  );
}

/** Mode picker — two big choices, clear contracts. */
function ModePicker({ onPick }: { onPick: (m: "work" | "block") => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ModePickerCard
        kind="work"
        title="Log work"
        body="A booking you did (or will do) outside Tulala. Adds to your earnings + calendar."
        meta="Quick add or full details"
        toneFg={COLORS.green}
        toneBg="rgba(46,125,91,0.10)"
        icon="credit"
        onPick={() => onPick("work")}
      />
      <ModePickerCard
        kind="block"
        title="Block time"
        body="Vacation, day job, school, family — anything that means you're not available. Won't count as earnings."
        meta="Reason + date range"
        toneFg={COLORS.amber}
        toneBg="rgba(82,96,109,0.10)"
        icon="lock"
        onPick={() => onPick("block")}
      />
    </div>
  );
}

function ModePickerCard({
  title,
  body,
  meta,
  toneFg,
  toneBg,
  icon,
  onPick,
}: {
  kind: "work" | "block";
  title: string;
  body: string;
  meta: string;
  toneFg: string;
  toneBg: string;
  icon: "credit" | "lock";
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: "100%",
        padding: "16px 18px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: "border-color .12s, transform .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: toneBg,
          color: toneFg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} stroke={1.7} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.ink,
            letterSpacing: -0.05,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.5,
          }}
        >
          {body}
        </div>
        <div
          style={{
            fontSize: 11,
            color: COLORS.inkDim,
            marginTop: 6,
            fontWeight: 500,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          {meta}
        </div>
      </div>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

/** Log work form — Quick by default, Advanced on toggle. */
function LogWorkForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (data: {
    client: string;
    date: string;
    amount: string;
    advanced: boolean;
  }) => void;
}) {
  const [client, setClient] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("€");
  const [advanced, setAdvanced] = useState(false);
  const [brief, setBrief] = useState("");
  const [location, setLocation] = useState("");
  const [callTime, setCallTime] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [delivered, setDelivered] = useState("");
  // A1: Team-mates — comma-separated names of others on the booking.
  // Free text in v1; production should autocomplete from talent network.
  const [teamMates, setTeamMates] = useState("");
  const [iBroughtTeam, setIBroughtTeam] = useState(false);
  // A2: Payment method picker.
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "card" | "cash" | "in-kind" | "mixed" | "">("");
  const [paymentNote, setPaymentNote] = useState("");

  const canSave = client.trim().length > 0 && date.trim().length > 0;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Quick fields — always visible. The MVP for one-tap logging. */}
        <section>
          <SubsectionLabel>The basics</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
            <FieldRow label="Client" hint="Who paid you. Free text — they don't have to be on Tulala.">
              <TextInput
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="e.g. Friend's brand · Studio Roca · Old colleague"
              />
            </FieldRow>
            <FieldRow label="Date" hint="When you worked.">
              <TextInput
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="May 12, 2026  or  May 12–13"
              />
            </FieldRow>
            <FieldRow label="Amount" hint="What you earned. Optional if you haven't been paid yet.">
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{
                    background: "#fff",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: "0 10px",
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    color: COLORS.ink,
                    cursor: "pointer",
                    minWidth: 64,
                  }}
                >
                  <option>€</option>
                  <option>£</option>
                  <option>$</option>
                  <option>¥</option>
                  <option>—</option>
                </select>
                <div style={{ flex: 1 }}>
                  <TextInput
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="1,800"
                  />
                </div>
              </div>
            </FieldRow>
          </div>
        </section>

        {/* Advanced toggle — on by talent's choice */}
        <button
          type="button"
          onClick={() => setAdvanced((o) => !o)}
          aria-expanded={advanced}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            padding: 0,
            color: COLORS.ink,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          <Icon
            name="chevron-down"
            size={11}
            stroke={2}
            color={COLORS.ink}
          />
          <span
            style={{
              transform: advanced ? "none" : "none",
            }}
          >
            {advanced ? "Hide details" : "Add details (location, time, contact, deliverables)"}
          </span>
        </button>

        {advanced && (
          <section>
            <SubsectionLabel>Details</SubsectionLabel>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              <FieldRow label="Brief" hint="What was the job?">
                <TextInput
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="e.g. Lookbook · spring capsule · 1 day"
                />
              </FieldRow>
              <FieldRow label="Location">
                <TextInput
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City · studio or address"
                />
              </FieldRow>
              <FieldRow label="Call time">
                <TextInput
                  value={callTime}
                  onChange={(e) => setCallTime(e.target.value)}
                  placeholder="08:30 — 18:00"
                />
              </FieldRow>
              <FieldRow label="Contact" optional hint="Producer / photographer / who to message after.">
                <TextInput
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Name · email or phone"
                />
              </FieldRow>
              <FieldRow label="Delivered" optional hint="Comma-separated list of deliverables.">
                <TextInput
                  value={delivered}
                  onChange={(e) => setDelivered(e.target.value)}
                  placeholder="8 looks, hero image, BTS carousel"
                />
              </FieldRow>
              <FieldRow
                label="Other talent on the booking"
                optional
                hint="Names — comma-separated. Useful when you brought a friend or worked as a team."
              >
                <TextInput
                  value={teamMates}
                  onChange={(e) => setTeamMates(e.target.value)}
                  placeholder="Carla Vega, Tomás Navarro"
                />
              </FieldRow>
              {teamMates.trim().length > 0 && (
                <FieldRow
                  label=""
                  optional
                  hint=""
                >
                  <button
                    type="button"
                    onClick={() => setIBroughtTeam((b) => !b)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "10px 12px",
                      background: iBroughtTeam ? COLORS.coralSoft : "#fff",
                      border: `1px solid ${iBroughtTeam ? "rgba(194,106,69,0.30)" : COLORS.border}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: iBroughtTeam ? COLORS.coral : "transparent",
                        border: `1.5px solid ${iBroughtTeam ? COLORS.coral : COLORS.border}`,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {iBroughtTeam && <Icon name="check" size={10} stroke={2.5} color="#fff" />}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
                        I brought them
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                        Marks you as the de-facto coordinator. Surfaces a "You brought {teamMates.split(",")[0]?.trim()}" tag in your booking history.
                      </div>
                    </div>
                  </button>
                </FieldRow>
              )}
              <FieldRow
                label="Payment method"
                optional
                hint="How you got paid. Tax-relevant — especially in-kind / gifts."
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {([
                    { id: "transfer", label: "Transfer" },
                    { id: "cash", label: "Cash · efectivo" },
                    { id: "card", label: "Card" },
                    { id: "in-kind", label: "In-kind · gift" },
                    { id: "mixed", label: "Mixed" },
                  ] as const).map((m) => {
                    const active = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(active ? "" : m.id)}
                        style={{
                          padding: "6px 11px",
                          borderRadius: 999,
                          background: active ? COLORS.ink : "#fff",
                          border: `1px solid ${active ? COLORS.ink : COLORS.borderSoft}`,
                          cursor: "pointer",
                          fontFamily: FONTS.body,
                          fontSize: 12,
                          fontWeight: 500,
                          color: active ? "#fff" : COLORS.ink,
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </FieldRow>
              {(paymentMethod === "in-kind" || paymentMethod === "mixed") && (
                <FieldRow
                  label="Payment note"
                  optional
                  hint="Describe the in-kind value or the mixed-method split."
                >
                  <TextInput
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder={
                      paymentMethod === "in-kind"
                        ? "e.g. Bvlgari watch · est €1,200"
                        : "e.g. 60% transfer + 40% product"
                    }
                  />
                </FieldRow>
              )}
              <FieldRow label="Notes" optional>
                <TextArea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything you want to remember about this job."
                  rows={3}
                />
              </FieldRow>
            </div>
          </section>
        )}

        {/* Off-platform note — sets expectations on what this means. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 12px",
            background: COLORS.coralSoft,
            border: `1px solid rgba(194,106,69,0.18)`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.coralDeep,
            lineHeight: 1.55,
          }}
        >
          <Icon name="info" size={11} stroke={1.7} />
          <span>
            <strong>Off-platform booking</strong> — visible only to you. Adds to your earnings,
            calendar and history. Not shared with agencies unless you choose to.
          </span>
        </div>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 24,
          marginLeft: -24,
          marginRight: -24,
          padding: "12px 24px",
          background: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <SecondaryButton onClick={onCancel}>Back</SecondaryButton>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              client: client.trim(),
              date: date.trim(),
              amount: amount ? `${currency}${amount.trim()}` : "",
              advanced,
            })
          }
          style={{
            background: canSave ? COLORS.ink : "rgba(11,11,13,0.20)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Log booking
        </button>
      </div>
    </>
  );
}

/** Block time form — date range + reason taxonomy. */
function BlockTimeForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (data: { from: string; to: string; reason: string; note: string }) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");

  const reasonOptions: { id: string; label: string; hint: string }[] = [
    { id: "travel", label: "Travel", hint: "Flight, holiday, between cities" },
    { id: "personal", label: "Personal", hint: "Time off, recovery, life" },
    { id: "other-job", label: "Other job", hint: "Day job, school, recurring shift" },
    { id: "family", label: "Family", hint: "Wedding, illness, kid's event" },
    { id: "audition", label: "Audition / casting", hint: "Off-platform casting prep" },
    { id: "other", label: "Other", hint: "" },
  ];

  const canSave = from.trim().length > 0 && reason.trim().length > 0;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <section>
          <SubsectionLabel>When</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
            <FieldRow label="From">
              <TextInput
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="May 22, 2026"
              />
            </FieldRow>
            <FieldRow label="To" optional hint="Leave blank for a single day.">
              <TextInput
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="May 26, 2026"
              />
            </FieldRow>
          </div>
        </section>

        <section>
          <SubsectionLabel>Reason</SubsectionLabel>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
            }}
          >
            {reasonOptions.map((r) => {
              const active = reason === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 11px",
                    borderRadius: 999,
                    background: active ? COLORS.ink : "#fff",
                    border: `1px solid ${active ? COLORS.ink : COLORS.borderSoft}`,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: active ? "#fff" : COLORS.ink,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {reason && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11.5,
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
              }}
            >
              {reasonOptions.find((r) => r.id === reason)?.hint}
            </div>
          )}
        </section>

        <section>
          <SubsectionLabel>Note for your agencies</SubsectionLabel>
          <div
            style={{
              fontSize: 11.5,
              color: COLORS.inkMuted,
              marginTop: 4,
              marginBottom: 10,
            }}
          >
            Optional. They see this when they try to pitch you on a blocked date.
          </div>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Annual family trip · back full availability May 27"
          />
        </section>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 24,
          marginLeft: -24,
          marginRight: -24,
          padding: "12px 24px",
          background: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <SecondaryButton onClick={onCancel}>Back</SecondaryButton>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => onSave({ from, to, reason, note })}
          style={{
            background: canSave ? COLORS.ink : "rgba(11,11,13,0.20)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Block time
        </button>
      </div>
    </>
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
          <TextInput defaultValue={p.measurements.heightImperial} />
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

/**
 * Availability drawer — formerly "Block dates", expanded to be the talent's
 * single availability surface. Three layers, in order of decision frequency:
 *
 *   1. Where are you?       → Current location. Changes weekly for traveling
 *                              talent. Drives "available to work in {city}"
 *                              hero copy + powers location-aware pitch routing.
 *   2. Taking work?         → Master availability + travel toggle. Daily/weekly.
 *   3. Block specific dates → Single-shot date-range blocks. Monthly.
 *
 * The previous "Block dates" surface only handled #3. Talents in real life
 * spend more time toggling #1 (where they ARE) and #2 (whether they're up
 * for travel) than blocking specific date ranges.
 */
export function TalentBlockDatesDrawer() {
  const { state, closeDrawer, openDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-block-dates";
  const p = MY_TALENT_PROFILE;

  // Local form state. In production this would persist via a mutation;
  // for the prototype it just toasts on save and closes.
  const [location, setLocation] = useState(p.currentLocation);
  const [availableForWork, setAvailableForWork] = useState(p.availableForWork);
  const [availableToTravel, setAvailableToTravel] = useState(p.availableToTravel);

  const handleSave = () => {
    // In production: persist the three fields + any blocked-date range,
    // then notify representing agencies. Toast labels what changed so
    // the user can verify the right thing was saved.
    const parts: string[] = [];
    if (location !== p.currentLocation) parts.push(`location → ${location.split("·")[0]?.trim()}`);
    if (availableForWork !== p.availableForWork)
      parts.push(availableForWork ? "available" : "paused");
    if (availableToTravel !== p.availableToTravel)
      parts.push(availableToTravel ? "open to travel" : "local-only");
    toast(
      parts.length > 0
        ? `Updated · ${parts.join(", ")} · agencies notified`
        : "No changes",
    );
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Availability"
      description="Where you are, what you're up for, and dates you can't work. Visible to your agencies."
      width={540}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave}>Update</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* ─── 1. Where are you? — C7 location autocomplete suggestions ── */}
        <section>
          <SubsectionLabel>Where are you?</SubsectionLabel>
          <div style={{ marginTop: 10 }}>
            <FieldRow
              label="Current location"
              hint="Synced with your profile · helps agencies pitch you the right local jobs first."
            >
              <TextInput
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City · Country"
              />
            </FieldRow>
            {/* C7: Quick-pick chips for fashion-cities. Production should
                replace with Google Places autocomplete. */}
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  color: COLORS.inkDim,
                  fontFamily: FONTS.body,
                  fontWeight: 500,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginRight: 4,
                  alignSelf: "center",
                }}
              >
                Quick pick:
              </span>
              {[
                "Madrid · Spain",
                "Paris · France",
                "Milan · Italy",
                "London · UK",
                "New York · USA",
                "Playa del Carmen · Mexico",
              ].map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setLocation(city)}
                  style={{
                    padding: "3px 9px",
                    background: location === city ? COLORS.ink : "#fff",
                    border: `1px solid ${location === city ? COLORS.ink : COLORS.borderSoft}`,
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 11,
                    color: location === city ? "#fff" : COLORS.ink,
                  }}
                >
                  {city.split(" ·")[0]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 2. Taking work? — C6 travel preferences richer ─────────── */}
        <section>
          <SubsectionLabel>Taking work</SubsectionLabel>
          <div
            style={{
              marginTop: 10,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <AvailabilityToggleRow
              label="Available for new work"
              hint="When off, you're hidden from new pitches. Existing bookings aren't affected."
              on={availableForWork}
              onChange={setAvailableForWork}
            />
            <AvailabilityToggleRow
              label="Open to travel"
              hint={
                availableForWork
                  ? "When off, you'll only see local jobs in your current location."
                  : "Pause availability before changing travel preferences."
              }
              on={availableToTravel && availableForWork}
              onChange={setAvailableToTravel}
              disabled={!availableForWork}
            />
          </div>
          {/* C6: Travel preferences richer — only when travel is on */}
          {availableToTravel && availableForWork && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                fontFamily: FONTS.body,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: COLORS.inkMuted,
                  marginBottom: 8,
                }}
              >
                Travel preferences
              </div>
              <FieldRow label="Willing to fly to" optional hint="Cities or regions you'll travel for. Leave blank for anywhere.">
                <TextInput placeholder="Paris, Milan, NYC · or leave blank for anywhere" />
              </FieldRow>
              <div style={{ height: 8 }} />
              <FieldRow label="Min booking value when traveling" optional hint="Bookings below this amount won't be pitched if travel is required.">
                <TextInput placeholder="e.g. €1,500" />
              </FieldRow>
              <div style={{ height: 10 }} />
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  background: "#fff",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: "transparent",
                    border: `1.5px solid ${COLORS.border}`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 12, color: COLORS.ink }}>
                  Travel costs must be covered by client
                </div>
              </button>
            </div>
          )}
        </section>

        {/* ─── 3. Existing blocks (A5) ──────────────────────────── */}
        {AVAILABILITY_BLOCKS.length > 0 && (
          <section>
            <SubsectionLabel>Your existing blocks · {AVAILABILITY_BLOCKS.length}</SubsectionLabel>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 0,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {AVAILABILITY_BLOCKS.map((b, i) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: b.type === "travel" ? COLORS.amber : COLORS.inkMuted,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>
                      {b.startDate} – {b.endDate}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                      {b.reason}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast(`Block "${b.reason}" removed`)}
                    aria-label={`Remove block ${b.startDate}-${b.endDate}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "4px 6px",
                      cursor: "pointer",
                      color: COLORS.inkDim,
                    }}
                  >
                    <Icon name="x" size={11} stroke={1.8} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── 4. Add to your calendar ────────────────────────────
            Two action paths into the full Add Event drawer. Replaces the
            prior inline From/To/Reason form because the dedicated drawer
            does it better — reason chips, currency picker, advanced
            details, source attribution. The Availability drawer now
            handles the simple state (location + toggles) and hands off
            to the richer flow when the talent needs to log or block. */}
        <section>
          <SubsectionLabel>Add to your calendar</SubsectionLabel>
          <div
            style={{
              marginTop: 6,
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              marginBottom: 10,
            }}
          >
            Track work you did off-platform, or block dates when you can't work.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AvailabilityAddAction
              icon="credit"
              tone="success"
              title="Log work"
              body="Off-platform booking — adds to earnings + calendar."
              onClick={() => {
                openDrawer("talent-add-event", { mode: "work" });
              }}
            />
            <AvailabilityAddAction
              icon="lock"
              tone="caution"
              title="Block time"
              body="Vacation, day job, school, family — anything that means you're not available."
              onClick={() => {
                openDrawer("talent-add-event", { mode: "block" });
              }}
            />
          </div>
        </section>
      </div>
    </DrawerShell>
  );
}

/**
 * Compact action row used inside the Availability drawer's "Add to your
 * calendar" section. Tinted icon chip + title + body + chevron. Click
 * launches the full TalentAddEventDrawer in the appropriate mode.
 */
function AvailabilityAddAction({
  icon,
  tone,
  title,
  body,
  onClick,
}: {
  icon: "credit" | "lock";
  tone: "success" | "caution";
  title: string;
  body: string;
  onClick: () => void;
}) {
  const palette = {
    success: { bg: "rgba(46,125,91,0.10)", fg: COLORS.green },
    caution: { bg: "rgba(82,96,109,0.10)", fg: COLORS.amber },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        transition: "border-color .12s, transform .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: palette.bg,
          color: palette.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={13} stroke={1.7} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.ink,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {body}
        </div>
      </div>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}

function SubsectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: COLORS.inkMuted,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Compact toggle row used inside the Availability drawer's grouped panels.
 * Disabled state collapses the toggle to a no-op + dims the row.
 */
function AvailabilityToggleRow({
  label,
  hint,
  on,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        padding: "12px 14px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.ink,
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <Toggle
        on={on}
        onChange={() => !disabled && onChange(!on)}
      />
    </div>
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
              background: COLORS.surfaceAlt,
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
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
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

  // Plan-tier shapes the rules: free can't be exclusive, agency/studio
  // sets exclusivity + commission. Per the agency-exclusivity product spec.
  const planLabel = a.planTier === "free"
    ? "Free plan"
    : a.planTier === "studio"
      ? "Studio plan"
      : "Agency plan";
  const exclusivityRule = a.planTier === "free"
    ? "Free-tier agencies can't hold exclusivity. They share their link to refer work but you're not bound."
    : a.status === "exclusive"
      ? `${a.name} is your exclusive agency. You can have only one exclusive at a time.`
      : `${a.name} represents you alongside other agencies. Exclusivity is granted per agency.`;
  const commissionLabel = a.commissionRate === 0
    ? "No commission · friend / free-plan agency"
    : `${Math.round(a.commissionRate * 100)}% on bookings ${a.name} brings`;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={a.name}
      description={`${a.status === "exclusive" ? "Exclusive" : a.status === "non-exclusive" ? "Non-exclusive" : "Active"} relationship · joined ${a.joinedAt}`}
      width={540}
      footer={
        <StandardFooter
          onSave={() => closeDrawer()}
          saveLabel="Done"
          destructive={{ label: "End relationship", onClick: () => openDrawer("talent-leave-agency", { id: a.id }) }}
        />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Plan + commission summary chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: a.planTier === "free" ? "rgba(11,11,13,0.04)" : COLORS.indigoSoft,
            border: `1px solid ${a.planTier === "free" ? COLORS.borderSoft : "rgba(91,107,160,0.18)"}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 12,
          }}
        >
          <Icon name="info" size={12} stroke={1.7} color={COLORS.inkMuted} />
          <span style={{ color: COLORS.ink, fontWeight: 500 }}>
            {planLabel} · {commissionLabel}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <KvRow label="Status" value={a.status} />
          <KvRow label="Joined" value={a.joinedAt} />
          <KvRow label="Bookings YTD" value={a.bookingsYTD} />
          <KvRow label="Primary" value={a.isPrimary ? "Yes" : "No"} />
          <KvRow label="Take rate" value={a.commissionRate === 0 ? "—" : `${Math.round(a.commissionRate * 100)}%`} />
        </div>

        <Divider label="Exclusivity" />
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            lineHeight: 1.6,
          }}
        >
          {exclusivityRule}
        </div>
        {a.planTier !== "free" && a.status !== "exclusive" && (
          <button
            type="button"
            onClick={() => openDrawer("talent-leave-agency", { id: a.id, mode: "make-exclusive" })}
            style={{
              alignSelf: "flex-start",
              padding: "7px 12px",
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 7,
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              color: COLORS.ink,
              cursor: "pointer",
            }}
          >
            Make {a.name} exclusive →
          </button>
        )}
        {a.status === "exclusive" && (
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: COLORS.inkDim,
              fontStyle: "italic",
            }}
          >
            To switch exclusivity to a different agency, end this relationship first.
          </div>
        )}

        <Divider label="What this agency can do" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
          <li>Pitch you to clients (you confirm before anything is booked)</li>
          <li>List you on their public roster</li>
          <li>Hold dates on your calendar with your approval</li>
          <li>Send you direct messages via the inbox</li>
          {a.commissionRate > 0 && (
            <li>Take {Math.round(a.commissionRate * 100)}% of any booking they bring you</li>
          )}
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
// TalentNotificationsDrawer is now defined in _wave2.tsx (richer version
// with notification list + collapsible settings). Removed the simpler
// settings-only version that lived here.

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

// ─── Contact preferences ────────────────────────────────────────
//
// Per-tier on/off gate for inbound inquiries. Default = all tiers on
// (open marketplace). Selectivity is opt-in. The "Most selective"
// preset offers a one-click move to Verified+. Copy is plain English —
// never frames it as "pay to message". See project_client_trust_badges.md.

export function TalentContactPreferencesDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-contact-preferences";
  const [policy, setPolicy] = useState<TalentContactPolicy>(MY_TALENT_PROFILE.contactPolicy);
  const allowedCount = (Object.values(policy) as boolean[]).filter(Boolean).length;
  const allOn = allowedCount === CLIENT_TRUST_LEVELS.length;

  const onSave = () => {
    toast(
      allOn
        ? "Contact preferences saved · open to all tiers"
        : `Contact preferences saved · ${allowedCount} of ${CLIENT_TRUST_LEVELS.length} tiers on`,
    );
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Contact preferences"
      description="Decide which client trust tiers can send you inquiries. Your agency still sees everything internally — this gates inbound contact, not visibility."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={onSave}>Save</PrimaryButton>
        </>
      }
    >
      {/* Framing card — explains the principle without leaking the
          "pay to DM" anti-pattern. */}
      <div
        style={{
          padding: "14px 16px",
          background: "rgba(11,11,13,0.03)",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          marginBottom: 18,
        }}
      >
        <CapsLabel>How this works</CapsLabel>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            marginTop: 6,
            lineHeight: 1.55,
          }}
        >
          Higher-trust clients have completed verification or funded their
          account on Tulala. You decide which tiers can reach you. Lower-trust
          tiers always have your agency's roster page available — they just
          can't drop straight into your inbox.
        </div>
      </div>

      {/* Presets — quick way to flip without micromanaging four toggles. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <PresetButton
          label="Open to everyone"
          active={JSON.stringify(policy) === JSON.stringify(DEFAULT_CONTACT_POLICY)}
          onClick={() => setPolicy({ ...DEFAULT_CONTACT_POLICY })}
        />
        <PresetButton
          label="Verified clients only"
          active={JSON.stringify(policy) === JSON.stringify(SELECTIVE_CONTACT_POLICY)}
          onClick={() => setPolicy({ ...SELECTIVE_CONTACT_POLICY })}
        />
      </div>

      {/* Per-tier toggles — the actual control surface. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CLIENT_TRUST_LEVELS.map((tier) => {
          const meta = CLIENT_TRUST_META[tier];
          return (
            <div
              key={tier}
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    fontWeight: 500,
                    color: COLORS.ink,
                  }}
                >
                  <ClientTrustChip level={tier} compact withDot={false} />
                  Allow inquiries from {meta.label} clients
                </div>
                <div
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 12,
                    color: COLORS.inkMuted,
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {meta.rationale}
                </div>
              </div>
              <Toggle
                on={policy[tier]}
                onChange={(next) => setPolicy({ ...policy, [tier]: next })}
              />
            </div>
          );
        })}
      </div>

      {/* What changes — a soft note about the consequence of selectivity. */}
      {!allOn && (
        <div
          style={{
            marginTop: 14,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            lineHeight: 1.55,
          }}
        >
          Blocked tiers can still see your roster page. They'll be invited to
          verify or fund their account before they can send you a direct
          inquiry. Your agency's coordinator inbox is unaffected.
        </div>
      )}
    </DrawerShell>
  );
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? COLORS.ink : "#fff",
        color: active ? "#fff" : COLORS.ink,
        border: `1px solid ${active ? COLORS.ink : COLORS.borderSoft}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontFamily: FONTS.body,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: 0.2,
      }}
    >
      {label}
    </button>
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
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 12,
          marginBottom: 14,
        }}
      >
        <CapsLabel color={COLORS.accentDeep}>For your security</CapsLabel>
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

// ════════════════════════════════════════════════════════════════════
// EXPANDED PROFILE DRAWERS
// ────────────────────────────────────────────────────────────────────
//   These 14 drawers back the new MyProfilePage bands:
//   visual identity · physicality · capability · history · trust ·
//   commercial · public preview.
//
//   Pattern: DrawerShell + useSaveAndClose + StandardFooter,
//   matching the rest of the talent surface.
// ════════════════════════════════════════════════════════════════════

// ─── Photo edit (cover or headshot) ───────────────────────────────

export function TalentPhotoEditDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-photo-edit";
  const which = (state.drawer.payload?.which as "cover" | "headshot") ?? "headshot";
  const isCover = which === "cover";
  const onSave = useSaveAndClose(`${isCover ? "Cover photo" : "Headshot"} updated · agencies notified`);

  const swatches = isCover
    ? ["🌅", "🌊", "🏔️", "🌆", "🏝️", "🌃", "🌌", "🌇"]
    : ["🌸", "🌷", "🌹", "🪷", "🌺", "🌻", "🌼", "🌿"];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={isCover ? "Replace cover photo" : "Replace headshot"}
      description={
        isCover
          ? "1600 × 480 minimum. Wide horizon shots work best — your headshot will overlap the lower edge."
          : "Square crop. Faces forward, daylight, neutral background — the same headshot used on your comp card."
      }
      width={560}
      footer={<StandardFooter onSave={onSave} saveLabel="Use selection" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: isCover ? 96 : 64,
              height: 64,
              background: "#fff",
              borderRadius: isCover ? 8 : "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              border: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            {isCover ? MY_TALENT_PROFILE.coverPhoto : MY_TALENT_PROFILE.profilePhoto}
          </div>
          <div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>Currently using</div>
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, marginTop: 2 }}>
              {isCover ? "Sunset over a coastline · uploaded Apr 12" : "Pink florals · uploaded Mar 28"}
            </div>
          </div>
        </div>
        <FieldRow label="Upload" hint="JPG / PNG / HEIC up to 12 MB. We'll auto-crop and generate retina sizes.">
          <button
            onClick={() => toast("Upload picker — coming soon")}
            style={{
              padding: "16px 14px",
              background: "rgba(11,11,13,0.02)",
              border: `1px dashed rgba(11,11,13,0.18)`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.inkMuted,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            Drop a file or click to upload
          </button>
        </FieldRow>
        <Divider label="Or pick a placeholder" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {swatches.map((s, i) => (
            <button
              key={i}
              onClick={() => toast(`${isCover ? "Cover" : "Headshot"} placeholder selected`)}
              style={{
                aspectRatio: isCover ? "16 / 9" : "1 / 1",
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
        {!isCover && (
          <>
            <Divider label="Crop guide" />
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.inkMuted,
                lineHeight: 1.7,
              }}
            >
              <li>Eyes on the upper third</li>
              <li>Neutral or daylight background</li>
              <li>No filters or heavy retouch — agencies use this to verify identity</li>
            </ul>
          </>
        )}
      </div>
    </DrawerShell>
  );
}

// ─── Polaroids ───────────────────────────────────────────────────

export function TalentPolaroidsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-polaroids";
  const onSave = useSaveAndClose("Polaroid set updated");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Polaroid set"
      description="Industry standard: 5 angles, no styling, daylight. Clients use polaroids to verify what you actually look like in person."
      width={560}
      footer={<StandardFooter onSave={onSave} saveLabel="Save set" />}
    >
      <div
        style={{
          padding: "12px 14px",
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 10,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon name="info" size={14} color={COLORS.accentDeep} />
        <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
          Refresh every 3 months · before / after major haircuts · weight changes ≥ 4 kg.
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {POLAROID_SET.map((p) => (
          <div
            key={p.id}
            style={{
              border: `1px solid ${p.updatedAgo === "missing" ? COLORS.red : COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div
              style={{
                aspectRatio: "3 / 4",
                background: COLORS.surfaceAlt,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                color: p.thumb === "—" ? COLORS.inkDim : "inherit",
              }}
            >
              {p.thumb}
            </div>
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
                {p.angle}
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 11,
                  color: p.updatedAgo === "missing" ? COLORS.red : COLORS.inkMuted,
                  marginTop: 2,
                }}
              >
                {p.updatedAgo === "missing" ? "Missing — upload now" : `Updated ${p.updatedAgo} ago`}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => toast("Bulk uploader — coming soon")}
        style={{
          marginTop: 14,
          padding: "12px 14px",
          width: "100%",
          background: "rgba(11,11,13,0.02)",
          border: `1px dashed rgba(11,11,13,0.18)`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          fontSize: 13,
          color: COLORS.inkMuted,
          cursor: "pointer",
        }}
      >
        Replace all 5 in a single shoot
      </button>
    </DrawerShell>
  );
}

// ─── Credits ─────────────────────────────────────────────────────

export function TalentCreditsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-credits";
  const onSave = useSaveAndClose("Credits updated");
  const credits = MY_TALENT_PROFILE.credits;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Credits & tearsheets"
      description="Your work history. Pin up to 3 — they show first to clients. Add new credits as bookings wrap."
      width={620}
      footer={
        <>
          <SecondaryButton onClick={() => toast("New credit form — coming soon")}>+ Add credit</SecondaryButton>
          <StandardFooter onSave={onSave} saveLabel="Save order" />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {credits.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span
              style={{
                width: 56,
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: COLORS.inkMuted,
              }}
            >
              {c.year}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
                {c.brand}
                {c.pinned && <span style={{ color: COLORS.accentDeep, marginLeft: 6 }}>★</span>}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {c.type}
                {c.role && <> · {c.role}</>}
                {c.credit && <> · {c.credit}</>}
              </div>
            </div>
            <button
              onClick={() => toast(c.pinned ? "Unpinned" : "Pinned to top")}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                color: c.pinned ? COLORS.accentDeep : COLORS.inkMuted,
                padding: "6px 10px",
                borderRadius: 6,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              {c.pinned ? "★ Pinned" : "Pin"}
            </button>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Skills ─────────────────────────────────────────────────────

export function TalentSkillsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-skills";
  const onSave = useSaveAndClose("Skills updated");
  const skills = MY_TALENT_PROFILE.skills;

  const grouped: Record<string, typeof skills> = {};
  for (const s of skills) {
    grouped[s.category] = grouped[s.category] || [];
    grouped[s.category].push(s);
  }

  const categoryLabels: Record<string, string> = {
    movement: "Movement",
    voice: "Voice",
    instrument: "Instruments",
    sport: "Sports",
    performance: "Performance",
    other: "Other",
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Skills"
      description="Movement, voice, sports, instruments — anything a client might cast for. Honesty matters more than completeness."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Add-skill picker — coming soon")}>+ Add skill</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.keys(grouped).map((cat) => (
          <div key={cat}>
            <CapsLabel>{categoryLabels[cat] ?? cat}</CapsLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {grouped[cat].map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "#fff",
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: 8,
                  }}
                >
                  <span style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
                    {s.label}
                  </span>
                  {s.level && (
                    <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
                      {s.level}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Limits ─────────────────────────────────────────────────────

export function TalentLimitsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-limits";
  const onSave = useSaveAndClose("Limits saved · agencies notified");
  const limits = MY_TALENT_PROFILE.limits;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Wardrobe & lifestyle limits"
      description="Hard limits block any pitch with that brief. Soft limits trigger an extra confirmation step before you're put forward."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Add-limit form — coming soon")}>+ Add limit</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {limits.map((l) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: l.enforcement === "hard" ? COLORS.red : COLORS.amber,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, fontWeight: 500 }}>
                {l.label}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2, textTransform: "capitalize" }}>
                {l.category} · {l.enforcement === "hard" ? "Hard limit" : "Needs confirmation"}
              </div>
            </div>
            <button
              onClick={() => toast("Limit removed")}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.ink,
          lineHeight: 1.55,
        }}
      >
        Agencies on Tulala are contractually bound to honour your limits. If a client brief
        violates a hard limit, the offer is auto-blocked before it ever reaches your inbox.
      </div>
    </DrawerShell>
  );
}

// ─── Rate card ──────────────────────────────────────────────────

export function TalentRateCardDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-rate-card";
  const onSave = useSaveAndClose("Rate card saved");
  const rc = MY_TALENT_PROFILE.rateCard;
  const [vis, setVis] = useState(rc.visibility);

  const visOptions: Array<{ value: typeof rc.visibility; label: string; hint: string }> = [
    { value: "public", label: "Public", hint: "Shown on your public profile to anyone." },
    { value: "agency-only", label: "Agency only", hint: "Only your agencies and confirmed clients see ranges." },
    { value: "on-request", label: "On request", hint: "Hidden — clients have to inquire to get a quote." },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Rate card"
      description="Reference ranges, not final fees. The actual offer is per-booking and includes usage."
      width={580}
      footer={<StandardFooter onSave={onSave} saveLabel="Save rate card" />}
    >
      <CapsLabel>Visibility</CapsLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, marginBottom: 16 }}>
        {visOptions.map((o) => (
          <button
            key={o.value}
            onClick={() => setVis(o.value)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              background: vis === o.value ? COLORS.surfaceAlt : "#fff",
              border: `1px solid ${vis === o.value ? "rgba(15,79,62,0.32)" : COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: `1.5px solid ${vis === o.value ? COLORS.accentDeep : COLORS.inkMuted}`,
                background: vis === o.value ? COLORS.accentDeep : "transparent",
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <div>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                {o.label}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {o.hint}
              </div>
            </div>
          </button>
        ))}
      </div>
      <Divider label="Rate lines" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {rc.lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 160px",
              gap: 8,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
                {line.label}
              </div>
              {line.note && (
                <div style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                  {line.note}
                </div>
              )}
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 12.5,
                color: COLORS.ink,
                textAlign: "right",
                alignSelf: "center",
              }}
            >
              {line.range}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <FieldRow label="Usage policy" hint="One sentence on what's included and what triggers an upcharge.">
          <TextArea defaultValue={rc.usagePolicy} rows={3} />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ─── Travel & work auth ─────────────────────────────────────────

export function TalentTravelDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-travel";
  const onSave = useSaveAndClose("Travel preferences saved");
  const t = MY_TALENT_PROFILE.travel;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Travel & work authorization"
      description="What countries can book you without visa drama, plus how far you'll fly for a job."
      width={560}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="Based in">
          <TextInput defaultValue={t.basedIn} />
        </FieldRow>
        <FieldRow label="Willing to travel" hint="City · country · region · global.">
          <TextInput defaultValue={t.willingTravel} />
        </FieldRow>
        <FieldRow label="Home radius" optional hint="How fast can you arrive? Same-day, 24h, weekend?">
          <TextInput defaultValue={t.homeRadius ?? ""} />
        </FieldRow>
        <FieldRow label="Preferred travel class" optional>
          <TextInput defaultValue={t.preferredClass ?? "economy"} />
        </FieldRow>
        <Divider label="Work authorization" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {t.workAuth.map((w, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
              }}
            >
              <Icon name="check" size={12} color={COLORS.green} />
              <span style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, flex: 1 }}>{w}</span>
            </div>
          ))}
        </div>
        <Divider label="Passports" />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {t.passports.map((p, i) => (
            <span
              key={i}
              style={{
                padding: "5px 10px",
                background: COLORS.surfaceAlt,
                border: `1px solid rgba(15,79,62,0.24)`,
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.ink,
              }}
            >
              {p}
            </span>
          ))}
        </div>
        {t.lastTrip && (
          <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>
            Last trip: {t.lastTrip}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ─── External links ─────────────────────────────────────────────

export function TalentLinksDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-links";
  const onSave = useSaveAndClose("Links saved");
  const links = MY_TALENT_PROFILE.links;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="External links"
      description="Social, IMDb, personal site. Follower counts auto-refresh weekly when you connect the account."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Connect account flow in production")}>+ Connect account</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {links.map((l, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span
              style={{
                fontFamily: FONTS.body,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
                width: 80,
              }}
            >
              {l.kind}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
                {l.label}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                {l.url}
              </div>
            </div>
            {l.followers ? (
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  color: COLORS.inkMuted,
                }}
              >
                {l.followers}
              </span>
            ) : (
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkDim }}>—</span>
            )}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Reviews ────────────────────────────────────────────────────

export function TalentReviewsDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-reviews";
  const reviews = MY_TALENT_PROFILE.reviews;
  const stats = MY_TALENT_PROFILE.bookingStats;
  const avg = reviews.reduce((a, r) => a + r.rating, 0) / Math.max(reviews.length, 1);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Reviews & endorsements"
      description="Producers and creative directors can leave a review after a wrap. They're verified — no anonymous critiques."
      width={580}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <SummaryStat label="Average" value={`${avg.toFixed(1)} / 5`} accent="green" />
        <SummaryStat label="Reviews" value={String(reviews.length)} accent="ink" />
        <SummaryStat label="On-time rate" value={`${stats.onTimeRate}%`} accent="green" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reviews.map((r) => (
          <div
            key={r.id}
            style={{
              padding: "14px 16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: COLORS.accentDeep, fontSize: 13 }}>
                {"★".repeat(r.rating)}
                <span style={{ color: COLORS.inkDim }}>{"★".repeat(5 - r.rating)}</span>
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginLeft: "auto" }}>
                {r.shootDate}
              </span>
            </div>
            <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, lineHeight: 1.55 }}>
              "{r.body}"
            </p>
            <div style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
              — {r.reviewerName} · {r.reviewerRole} · {r.brand}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent: "green" | "ink" | "amber" }) {
  const tone = accent === "green" ? COLORS.green : accent === "amber" ? COLORS.amber : COLORS.ink;
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: FONTS.display, fontSize: 18, color: tone, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ─── Showreel ───────────────────────────────────────────────────

export function TalentShowreelDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-showreel";
  const p = MY_TALENT_PROFILE;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Showreel"
      description={`${p.showreelDuration ?? "0:42"} · A 30–45 sec clip of you on camera. Casting directors love these.`}
      width={620}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Replace showreel flow in production")}>Replace clip</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Close</PrimaryButton>
        </>
      }
    >
      <div
        style={{
          aspectRatio: "16 / 9",
          background: COLORS.surfaceAlt,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 96,
          border: `1px solid ${COLORS.borderSoft}`,
          marginBottom: 16,
          position: "relative",
        }}
      >
        {p.showreelThumb ?? "🎞️"}
        <button
          onClick={() => toast("Showreel plays in production")}
          style={{
            position: "absolute",
            inset: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(11,11,13,0.78)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            ▶
          </span>
        </button>
      </div>
      <Divider label="Why a showreel" />
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
        <li>Speaking voice + accent for any TV/voiceover briefs</li>
        <li>Range of expression beyond what a still shows</li>
        <li>Movement quality — walking, turning, gesture</li>
        <li>Natural light + tight crop is fine. No need for a studio piece.</li>
      </ul>
    </DrawerShell>
  );
}

// ─── Measurements ───────────────────────────────────────────────

export function TalentMeasurementsDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-measurements";
  const onSave = useSaveAndClose("Measurements saved · agencies notified");
  const m = MY_TALENT_PROFILE.measurements;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Measurements"
      description="Your full comp card. Re-measure every 6 months — accurate stats prevent fitting reshoots."
      width={580}
      footer={<StandardFooter onSave={onSave} saveLabel="Save measurements" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            padding: "12px 14px",
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="info" size={14} color={COLORS.accentDeep} />
          <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
            Sensitive data. Public visibility is controlled in Privacy settings.
          </span>
        </div>
        <Divider label="Body" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldRow label="Height (Imperial)">
            <TextInput defaultValue={m.heightImperial} />
          </FieldRow>
          <FieldRow label="Height (Metric)">
            <TextInput defaultValue={m.heightMetric} />
          </FieldRow>
          <FieldRow label="Bust">
            <TextInput defaultValue={m.bust} />
          </FieldRow>
          <FieldRow label="Waist">
            <TextInput defaultValue={m.waist} />
          </FieldRow>
          <FieldRow label="Hips">
            <TextInput defaultValue={m.hips} />
          </FieldRow>
          <FieldRow label="Inseam" optional>
            <TextInput defaultValue={m.inseam ?? ""} />
          </FieldRow>
          <FieldRow label="Dress">
            <TextInput defaultValue={m.dress} />
          </FieldRow>
          <FieldRow label="Suit" optional>
            <TextInput defaultValue={m.suit ?? ""} />
          </FieldRow>
        </div>
        <Divider label="Shoes" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <FieldRow label="EU">
            <TextInput defaultValue={m.shoeEU} />
          </FieldRow>
          <FieldRow label="US">
            <TextInput defaultValue={m.shoeUS} />
          </FieldRow>
          <FieldRow label="UK">
            <TextInput defaultValue={m.shoeUK} />
          </FieldRow>
        </div>
        <Divider label="Features" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldRow label="Hair colour">
            <TextInput defaultValue={m.hairColor} />
          </FieldRow>
          <FieldRow label="Hair length">
            <TextInput defaultValue={m.hairLength} />
          </FieldRow>
          <FieldRow label="Eye colour">
            <TextInput defaultValue={m.eyeColor} />
          </FieldRow>
          <FieldRow label="Skin tone">
            <TextInput defaultValue={m.skinTone} />
          </FieldRow>
        </div>
        <FieldRow label="Tattoos" hint={m.hasTattoos ? "Visible · note location and coverability." : "None."}>
          <TextInput defaultValue={m.tattoosNote ?? ""} />
        </FieldRow>
        <FieldRow label="Piercings" hint={m.hasPiercings ? "Visible piercings only." : "None."}>
          <TextInput defaultValue={m.piercingsNote ?? ""} />
        </FieldRow>
        <FieldRow label="Scars / marks" optional>
          <TextInput defaultValue={m.scarsNote ?? ""} />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ─── Documents ──────────────────────────────────────────────────

export function TalentDocumentsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-documents";
  const onSave = useSaveAndClose("Documents saved");
  const docs = MY_TALENT_PROFILE.documents;

  const stateMeta: Record<string, { color: string; label: string }> = {
    uploaded: { color: COLORS.green, label: "Uploaded" },
    missing: { color: COLORS.red, label: "Missing" },
    expired: { color: COLORS.amber, label: "Expired" },
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Documents"
      description="ID, tax forms, certifications. Stored encrypted. Visible only to your agency's admin team."
      width={560}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {docs.map((d) => {
          const meta = stateMeta[d.state];
          return (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
              }}
            >
              <Icon name="external" size={14} color={COLORS.inkMuted} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
                  {d.label}
                </div>
                <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                  {meta.label}
                  {d.expiresOn && d.state === "uploaded" && <> · expires {d.expiresOn}</>}
                </div>
              </div>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: meta.color,
                  flexShrink: 0,
                }}
              />
              <button
                onClick={() => toast(d.state === "uploaded" ? "Replace flow in production" : "Upload picker in production")}
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.borderSoft}`,
                  color: COLORS.ink,
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                {d.state === "uploaded" ? "Replace" : "Upload"}
              </button>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// ─── Emergency contact ──────────────────────────────────────────

export function TalentEmergencyContactDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-emergency-contact";
  const onSave = useSaveAndClose("Emergency contact saved");
  const c = MY_TALENT_PROFILE.emergencyContact;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Emergency contact"
      description="Visible only during an active booking, to the producer running the call sheet. Hidden the rest of the time."
      width={520}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="Name">
          <TextInput defaultValue={c.name} />
        </FieldRow>
        <FieldRow label="Relation">
          <TextInput defaultValue={c.relation} />
        </FieldRow>
        <FieldRow label="Phone" hint="Stored encrypted. Masked on every other surface.">
          <TextInput defaultValue={c.phone} />
        </FieldRow>
        <Divider label="When this is shown" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.7 }}>
          <li>The day of a confirmed booking, on that booking's call sheet only</li>
          <li>To the producer named on the contract — no one else</li>
          <li>Auto-revoked 24h after the wrap time</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Public preview ─────────────────────────────────────────────

export function TalentPublicPreviewDrawer() {
  const { state, closeDrawer, toast, openDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-public-preview";
  const p = MY_TALENT_PROFILE;
  const currentTier = p.subscription.tier;
  const [previewTier, setPreviewTier] = useState<TalentSubscriptionTier>(currentTier);
  const showEmbeds = previewTier !== "basic";
  const showPress = previewTier !== "basic";
  const showPortfolioExtras = previewTier === "portfolio";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Preview as a client"
      description="What an unverified visitor sees on your personal page. Use the tier toggle to see how your page changes if you upgrade."
      width={720}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Public URL copied")}>Copy public URL</SecondaryButton>
          {previewTier !== currentTier && (
            <PrimaryButton onClick={() => { closeDrawer(); openDrawer("talent-tier-compare"); }}>
              Upgrade to {TALENT_TIER_META[previewTier].label}
            </PrimaryButton>
          )}
          {previewTier === currentTier && <PrimaryButton onClick={closeDrawer}>Close preview</PrimaryButton>}
        </>
      }
    >
      {/* Tier toggle */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          marginBottom: 14,
          width: "fit-content",
        }}
      >
        {(["basic", "pro", "portfolio"] as const).map((t) => {
          const isActive = previewTier === t;
          const isCurrent = currentTier === t;
          return (
            <button
              key={t}
              onClick={() => setPreviewTier(t)}
              style={{
                padding: "5px 12px",
                background: isActive ? "#fff" : "transparent",
                color: isActive ? COLORS.ink : COLORS.inkMuted,
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 999,
                cursor: "pointer",
                boxShadow: isActive ? "0 1px 3px rgba(11,11,13,0.06)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {TALENT_TIER_META[t].label}
              {isCurrent && (
                <span
                  style={{
                    fontSize: 9,
                    color: COLORS.accentDeep,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  }}
                >
                  · current
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Cover */}
        <div
          style={{
            height: 120,
            background: `linear-gradient(135deg, ${COLORS.surfaceAlt} 0%, #fff 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 56,
          }}
        >
          {p.coverPhoto}
        </div>
        {/* Identity */}
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: COLORS.surfaceAlt,
              border: `3px solid #fff`,
              boxShadow: "0 1px 4px rgba(11,11,13,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              marginTop: -36,
              flexShrink: 0,
            }}
          >
            {p.profilePhoto}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink, lineHeight: 1.2 }}>{p.name}</div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, marginTop: 4 }}>
              {p.pronouns} · {p.measurementsSummary} · {p.city.split(" ·")[0]}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {p.specialties.slice(0, 4).map((s) => (
                <span
                  key={s}
                  style={{
                    padding: "3px 9px",
                    background: COLORS.surfaceAlt,
                    border: `1px solid rgba(15,79,62,0.24)`,
                    borderRadius: 999,
                    fontFamily: FONTS.body,
                    fontSize: 11,
                    color: COLORS.ink,
                  }}
                >
                  {TALENT_SPECIALTY_LABEL[s]}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => toast("Inquiry form — coming soon")}
            style={{
              background: COLORS.ink,
              color: "#fff",
              border: "none",
              padding: "8px 14px",
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Send inquiry
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Divider label="What's public" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            <PreviewKv label="Languages" value={summarizeLanguages(p.languages)} />
            <PreviewKv label="Travel" value="Global · 2 wk lead" />
            <PreviewKv label="Track record" value={`${p.bookingStats.completedBookings} bookings · ${p.bookingStats.onTimeRate}% on time`} />
            <PreviewKv label="Verified" value={`${p.badges.length} badges`} />
          </div>
          {/* Pro+ — embeds */}
          {showEmbeds && p.subscription.embeds.length > 0 && (
            <>
              <Divider label="Featured media" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {p.subscription.embeds.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    style={{
                      aspectRatio: "1 / 1",
                      background: COLORS.surfaceAlt,
                      border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 28 }}>{e.thumb}</span>
                    <span style={{ fontFamily: FONTS.body, fontSize: 10.5, color: COLORS.inkMuted, textTransform: "capitalize" }}>
                      {e.kind}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Pro+ — press */}
          {showPress && p.subscription.press.length > 0 && (
            <>
              <Divider label="Press" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {p.subscription.press.slice(0, 2).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "8px 10px",
                      background: "rgba(11,11,13,0.02)",
                      border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, color: COLORS.accentDeep, letterSpacing: 0.4, textTransform: "uppercase" }}>
                      {c.outlet}
                    </div>
                    <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, marginTop: 2 }}>
                      {c.headline}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Portfolio — extra sections hint */}
          {showPortfolioExtras && (
            <>
              <Divider label="Portfolio sections" />
              <div
                style={{
                  padding: "10px 12px",
                  background: COLORS.ink,
                  color: "#fff",
                  borderRadius: 10,
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ letterSpacing: 0.4 }}>+ Story / About · Tour dates · Show calendar · EPK download · FAQ.</strong>
                <div style={{ opacity: 0.7, marginTop: 4 }}>
                  Custom domain: marta-reyes.com (replaces tulala.digital/t/marta-reyes).
                </div>
              </div>
            </>
          )}
          <Divider label="What's hidden until they inquire" />
          <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.7 }}>
            <li>Full measurements (private — agency-controlled)</li>
            <li>Rate ranges (rate card visibility = {p.rateCard.visibility})</li>
            <li>Limits and wardrobe constraints</li>
            <li>Documents, emergency contact, agency-internal notes</li>
          </ul>
        </div>
      </div>
    </DrawerShell>
  );
}

function PreviewKv({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "rgba(11,11,13,0.02)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, marginTop: 3 }}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// PREMIUM TALENT PAGE DRAWERS
// ────────────────────────────────────────────────────────────────────
//   Tulala-direct subscription tier (Basic / Pro / Portfolio) is a
//   parallel monetization path: agencies pay for workspaces, talent
//   pay for richer personal pages. Tiers coexist — a Portfolio talent
//   on Acme's roster keeps appearing on Acme's site exactly the same.
// ════════════════════════════════════════════════════════════════════

// ─── Tier compare ────────────────────────────────────────────────

const TIER_FEATURE_MATRIX: Array<{ label: string; basic: string | true; pro: string | true; portfolio: string | true }> = [
  { label: "Standard public profile", basic: true, pro: true, portfolio: true },
  { label: "Roster · Tulala hub discovery", basic: true, pro: true, portfolio: true },
  { label: "Inquiry inbox + bookings", basic: true, pro: true, portfolio: true },
  { label: "Page templates", basic: "Roster only", pro: "+ Editorial / Studio", portfolio: "+ Stage / Creator / EPK" },
  { label: "Social + video embeds", basic: "—", pro: "Up to 6", portfolio: "Unlimited" },
  { label: "Press / clippings band", basic: "—", pro: true, portfolio: true },
  { label: "Downloadable media kit (EPK)", basic: "—", pro: true, portfolio: true },
  { label: "Custom domain (yourname.com)", basic: "—", pro: "—", portfolio: true },
  { label: "Multi-section page builder", basic: "—", pro: "—", portfolio: true },
  { label: "SEO controls + meta", basic: "—", pro: "—", portfolio: true },
  { label: "Priority discover placement", basic: "—", pro: "—", portfolio: true },
];

export function TalentTierCompareDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-tier-compare";
  const current = MY_TALENT_PROFILE.subscription.tier;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Compare talent plans"
      description="Your Tulala personal page tier. Coexists with whatever agencies and hubs you're on — agency rosters never change."
      width={760}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Maybe later</SecondaryButton>
          {current !== "portfolio" && (
            <PrimaryButton onClick={() => toast(`${current === "basic" ? "Pro" : "Portfolio"} trial started · 14 days free`)}>
              Start {current === "basic" ? "Pro" : "Portfolio"} trial
            </PrimaryButton>
          )}
        </>
      }
    >
      {/* Tier columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {(["basic", "pro", "portfolio"] as const).map((t) => {
          const meta = TALENT_TIER_META[t];
          const isCurrent = t === current;
          return (
            <div
              key={t}
              style={{
                padding: "16px 16px",
                background: t === "portfolio" ? COLORS.ink : "#fff",
                color: t === "portfolio" ? "#fff" : COLORS.ink,
                border: `1.5px solid ${isCurrent ? COLORS.accentDeep : t === "portfolio" ? COLORS.ink : COLORS.borderSoft}`,
                borderRadius: 12,
                position: "relative",
              }}
            >
              {isCurrent && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    left: 14,
                    background: COLORS.accentDeep,
                    color: "#fff",
                    fontFamily: FONTS.body,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    padding: "3px 9px",
                    borderRadius: 999,
                    textTransform: "uppercase",
                  }}
                >
                  Current
                </span>
              )}
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                }}
              >
                {meta.label}
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  opacity: 0.75,
                  marginTop: 3,
                }}
              >
                {meta.tagline}
              </div>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 18,
                  marginTop: 12,
                  color: t === "portfolio" ? "#fff" : COLORS.accentDeep,
                  fontWeight: 600,
                }}
              >
                {meta.monthlyPrice}
              </div>
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  marginTop: 8,
                  marginBottom: 0,
                  opacity: 0.85,
                }}
              >
                {meta.blurb}
              </p>
            </div>
          );
        })}
      </div>

      {/* Feature matrix */}
      <div style={{ marginTop: 18 }}>
        <CapsLabel>What's included</CapsLabel>
        <div
          style={{
            marginTop: 8,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
              padding: "10px 14px",
              background: "rgba(11,11,13,0.025)",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            <span>Feature</span>
            <span style={{ textAlign: "center" }}>Basic</span>
            <span style={{ textAlign: "center" }}>Pro</span>
            <span style={{ textAlign: "center" }}>Portfolio</span>
          </div>
          {/* Rows */}
          {TIER_FEATURE_MATRIX.map((f, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
                padding: "10px 14px",
                borderBottom: i < TIER_FEATURE_MATRIX.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 500 }}>{f.label}</span>
              <FeatureCell value={f.basic} />
              <FeatureCell value={f.pro} />
              <FeatureCell value={f.portfolio} />
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.ink,
          lineHeight: 1.55,
        }}
      >
        Personal page tiers are independent of agency / hub presence. You stay on every roster
        you're on now. The tier only affects your direct Tulala destination page.
      </div>
    </DrawerShell>
  );
}

function FeatureCell({ value }: { value: string | true }) {
  if (value === true) {
    return (
      <span style={{ textAlign: "center", color: COLORS.green, fontWeight: 600 }}>✓</span>
    );
  }
  if (value === "—") {
    return <span style={{ textAlign: "center", color: COLORS.inkDim }}>—</span>;
  }
  return (
    <span
      style={{
        textAlign: "center",
        fontSize: 11.5,
        color: COLORS.inkMuted,
      }}
    >
      {value}
    </span>
  );
}

// ─── Personal page (page-builder lite, Portfolio) ──────────────────

export function TalentPersonalPageDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-personal-page";
  const sub = MY_TALENT_PROFILE.subscription;
  const sections = [
    { id: "hero", label: "Hero", body: "Cover · headshot · name · pronouns · tagline.", removable: false },
    { id: "story", label: "About / story", body: "1-2 paragraphs in your own voice.", removable: true },
    { id: "embeds", label: "Media embeds", body: `${sub.embeds.length} embed${sub.embeds.length === 1 ? "" : "s"} live.`, removable: true },
    { id: "credits", label: "Credits & tearsheet", body: "Pulled from your profile credits.", removable: true },
    { id: "press", label: "Press band", body: `${sub.press.length} clip${sub.press.length === 1 ? "" : "s"}.`, removable: true },
    { id: "contact", label: "Contact CTA", body: "'Inquire' button → routes through your agency unless you're un-rep'd.", removable: false },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Personal page builder"
      description="Drag sections to re-order. Hero and Contact CTA are required — everything else is optional."
      width={620}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Page preview — coming soon")}>Preview page</SecondaryButton>
          <PrimaryButton onClick={() => toast("Page saved · changes live in 30 sec")}>Publish</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sections.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ color: COLORS.inkDim, fontSize: 14, cursor: "grab" }}>⋮⋮</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
                {s.label}
                {!s.removable && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.inkMuted, fontWeight: 400 }}>
                    Required
                  </span>
                )}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {s.body}
              </div>
            </div>
            <Toggle on={true} onChange={() => {}} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => toast("Section catalog — coming soon")}
          style={{
            padding: "12px 14px",
            width: "100%",
            background: "rgba(11,11,13,0.02)",
            border: `1px dashed rgba(11,11,13,0.18)`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.inkMuted,
            cursor: "pointer",
          }}
        >
          + Add section · Tour dates · Show calendar · FAQ · Custom block
        </button>
      </div>
    </DrawerShell>
  );
}

// ─── Page template picker ───────────────────────────────────────────

export function TalentPageTemplateDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-page-template";
  const tier = MY_TALENT_PROFILE.subscription.tier;
  const active = MY_TALENT_PROFILE.subscription.template;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Choose a template"
      description="Templates set the layout, hero size, and section order of your personal page. Switch any time — content stays."
      width={680}
      footer={<StandardFooter onSave={() => { toast("Template saved · page rebuilt"); closeDrawer(); }} saveLabel="Use template" />}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {TALENT_PAGE_TEMPLATES.map((t) => {
          const locked = !tierAllows(tier, "template-picker") && t.availableAt !== "basic";
          const tierLocked = !tierAllows(tier, "media-embeds") && t.availableAt === "pro";
          const sigLocked = !tierAllows(tier, "extra-sections") && t.availableAt === "portfolio";
          const isLocked = locked || tierLocked || sigLocked;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => {
                if (isLocked) {
                  toast(`Unlock ${TALENT_TIER_META[t.availableAt].label} to use ${t.label}`);
                  return;
                }
                toast(`${t.label} selected`);
              }}
              style={{
                position: "relative",
                padding: 14,
                textAlign: "left",
                background: isActive ? COLORS.surfaceAlt : "#fff",
                border: `1.5px solid ${isActive ? COLORS.accentDeep : COLORS.borderSoft}`,
                borderRadius: 12,
                cursor: "pointer",
                opacity: isLocked ? 0.78 : 1,
              }}
            >
              <div
                style={{
                  aspectRatio: "16 / 9",
                  background: COLORS.surfaceAlt,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 48,
                  marginBottom: 10,
                  filter: isLocked ? "grayscale(0.4)" : "none",
                }}
              >
                {t.thumb}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink }}>{t.label}</span>
                {isActive && (
                  <span style={{ fontFamily: FONTS.body, fontSize: 10, color: COLORS.accentDeep, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    Active
                  </span>
                )}
                {isLocked && <LockedBadge requiredTier={t.availableAt} />}
              </div>
              <p style={{ margin: "4px 0 0", fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                {t.blurb}
              </p>
            </button>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// ─── Media embeds ──────────────────────────────────────────────────

export function TalentMediaEmbedsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-media-embeds";
  const onSave = useSaveAndClose("Embeds saved");
  const embeds = MY_TALENT_PROFILE.subscription.embeds;

  const supported: Array<{ kind: TalentMediaEmbed["kind"]; label: string; thumb: string }> = [
    { kind: "instagram", label: "Instagram", thumb: "📷" },
    { kind: "tiktok", label: "TikTok", thumb: "🎵" },
    { kind: "youtube", label: "YouTube", thumb: "▶️" },
    { kind: "spotify", label: "Spotify", thumb: "🎧" },
    { kind: "soundcloud", label: "SoundCloud", thumb: "☁️" },
    { kind: "vimeo", label: "Vimeo", thumb: "🎬" },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Media embeds"
      description="Drop in a public URL and Tulala renders the live embed on your personal page. Update any time."
      width={580}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Connect-account flow in production")}>+ Connect account</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <CapsLabel>Live on your page</CapsLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {embeds.map((e) => (
          <div
            key={e.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                background: COLORS.surfaceAlt,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              {e.thumb}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink, textTransform: "capitalize" }}>
                {e.kind} · {e.label}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                {e.url}
              </div>
            </div>
            <button
              onClick={() => toast("Embed removed")}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <Divider label="Supported sources" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {supported.map((s) => (
          <div
            key={s.kind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: COLORS.surfaceAlt,
              border: `1px solid rgba(15,79,62,0.18)`,
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.ink,
            }}
          >
            <span style={{ fontSize: 16 }}>{s.thumb}</span>
            {s.label}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Press / clippings ──────────────────────────────────────────────

export function TalentPressDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-press";
  const onSave = useSaveAndClose("Press band saved");
  const press = MY_TALENT_PROFILE.subscription.press;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Press & clippings"
      description="Magazine, blog, podcast, or TV mentions. Pulled from Google Alerts or pasted in manually."
      width={580}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Add-clip form in production")}>+ Add clip</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {press.map((c) => (
          <div
            key={c.id}
            style={{
              padding: "14px 16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: COLORS.accentDeep, letterSpacing: 0.5, textTransform: "uppercase" }}>
                {c.outlet}
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted, marginLeft: "auto" }}>
                {c.date}
              </span>
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink, marginTop: 4 }}>
              {c.headline}
            </div>
            {c.quote && (
              <p style={{ margin: "6px 0 0", fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, lineHeight: 1.55, fontStyle: "italic" }}>
                "{c.quote}"
              </p>
            )}
            <div style={{ marginTop: 6, fontFamily: FONTS.mono, fontSize: 11, color: COLORS.inkMuted }}>
              {c.url}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Media kit / EPK ────────────────────────────────────────────────

export function TalentMediaKitDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-media-kit";
  const kit = MY_TALENT_PROFILE.subscription.mediaKit;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Media kit (EPK)"
      description="A single PDF with your bio, credits, comp card, press, and contact CTA. Auto-built from your profile data."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Regenerated · ready to download in 30 sec")}>Re-generate</SecondaryButton>
          <PrimaryButton onClick={() => toast("Download starts in production")}>Download PDF</PrimaryButton>
        </>
      }
    >
      {kit ? (
        <div
          style={{
            padding: "14px 16px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 56,
              height: 70,
              background: COLORS.surfaceAlt,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              border: `1px solid ${COLORS.borderSoft}`,
              flexShrink: 0,
            }}
          >
            {kit.thumb}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
              {kit.filename}
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {kit.size} · updated {kit.updatedAt}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted }}>
          No kit generated yet. Click Re-generate to build one from your current profile.
        </div>
      )}
      <Divider label="What's in the kit" />
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
        <li>Cover page · headshot · name · contact CTA</li>
        <li>Comp card spread (measurements + 4 polaroids)</li>
        <li>Pinned credits + tear-sheets</li>
        <li>Press band (up to 6 clippings)</li>
        <li>Travel + work auth + agency info</li>
        <li>QR code → live Tulala personal page</li>
      </ul>
    </DrawerShell>
  );
}

// ─── Custom domain ──────────────────────────────────────────────────

export function TalentCustomDomainDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-custom-domain";
  const sub = MY_TALENT_PROFILE.subscription;
  const onSave = useSaveAndClose("Domain saved · DNS check started");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Custom domain"
      description="Point your own domain at your Tulala personal page. Visitors see yourname.com — Tulala handles SSL + redirects."
      width={580}
      footer={<StandardFooter onSave={onSave} saveLabel="Save & verify" />}
    >
      <FieldRow label="Domain" hint="Use the apex (yourname.com) or a subdomain (page.yourname.com).">
        <TextInput placeholder="marta-reyes.com" defaultValue={sub.customDomain ?? ""} />
      </FieldRow>
      <div style={{ marginTop: 14 }}>
        <CapsLabel>DNS configuration</CapsLabel>
        <div
          style={{
            marginTop: 8,
            padding: "12px 14px",
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
            borderRadius: 10,
            fontFamily: FONTS.mono,
            fontSize: 12,
            color: COLORS.ink,
            lineHeight: 1.7,
          }}
        >
          <div>A record &nbsp;@ &nbsp;→ &nbsp;76.76.21.21</div>
          <div>CNAME &nbsp;www &nbsp;→ &nbsp;cname.tulala.digital</div>
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: sub.customDomainStatus === "verified" ? COLORS.green : COLORS.amber,
          }}
        />
        <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
          Status:{" "}
          <strong>
            {sub.customDomain
              ? sub.customDomainStatus === "verified"
                ? "Verified"
                : sub.customDomainStatus === "pending"
                  ? "Awaiting DNS propagation"
                  : "Failed verification"
              : "Not set"}
          </strong>
        </span>
        <button
          onClick={() => toast("Re-checking DNS")}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.ink,
            padding: "5px 10px",
            borderRadius: 6,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            cursor: "pointer",
          }}
        >
          Re-check
        </button>
      </div>
      <p style={{ marginTop: 14, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.55 }}>
        Tulala issues + auto-renews a Let's Encrypt SSL certificate once your DNS is pointing
        correctly. No manual cert config needed.
      </p>
    </DrawerShell>
  );
}
