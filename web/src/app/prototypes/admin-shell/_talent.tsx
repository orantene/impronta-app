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

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { pinNextConversation as pinNextConversationT, pinNextThreadTab as pinNextThreadTabT, TALENT_RATE_FOR_CONV } from "./_messages";
import {
  TalentAnalyticsCard,
  TalentFunnelCard,
  ICalSubscribeCard,
  TalentOnboardingArc,
  TalentFirstRunBanner,
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
  RADIUS,
  TRANSITION,
  INQUIRY_STAGE_META,
  PAYMENT_METHOD_META,
  MY_AGENCIES,
  MY_TALENT_PROFILE,
  applyProfileOverride,
  useProfileOverrideSubscription,
  usePendingReviewSubscription,
  getPendingReviewForRoster,
  clearPendingReview,
  parseVideoUrl,
  computeProfileCompleteness,
  fieldsForType,
  FIELD_CATALOG,
  getProfileById,
  TAXONOMY,
  type TaxonomyParentId,
  talentIdOf,
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
import { PasskeysCard, GalleryFxCard } from "./_modern-features";
import {
  ActivityFeedItem,
  Affordance,
  Avatar,
  Bullet,
  CapsLabel,
  CelebrationBanner,
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
  useRovingTabindex,
  scrollBehavior,
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
  const { openDrawer, setTalentPage, toast } = useProto();
  const stage = INQUIRY_STAGE_META[inquiry.stage];
  const myStatus = myStatusOn(inquiry);
  const unread = unreadOnInquiry(inquiry);
  const myLine = inquiry.offer?.lineItems.find((l) => l.talentName === MY_TALENT_PROFILE.name);

  const stageBg =
    stage.tone === "amber" ? COLORS.amberSoft
    : stage.tone === "green" ? COLORS.successSoft
    : stage.tone === "red" ? "rgba(176,48,58,0.08)"
    : "rgba(11,11,13,0.05)";
  const stageFg =
    stage.tone === "amber" ? COLORS.amberDeep
    : stage.tone === "green" ? COLORS.successDeep
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
    myStatus === "pending" ? COLORS.amberDeep
    : myStatus === "accepted" && inquiry.stage === "booked" ? COLORS.successDeep
    : myStatus === "accepted" ? COLORS.successDeep
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
        onClick={() => {
          const convId = TALENT_INQUIRY_TO_CONV[inquiry.id] ?? inquiry.id;
          pinNextConversationT(convId);
          setTalentPage("messages");
        }}
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
                color: COLORS.amberDeep,
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
    <div style={{ background: COLORS.surface, minHeight: "calc(100vh - 50px - 56px)" }}>
      {/* WS-12.10 — skip link before topbar nav so keyboard users can
          bypass the talent page navigation */}
      <a href="#tulala-talent-content" className="skip-to-main">
        Skip to page content
      </a>
      <TalentTopbar />
      <main
        id="tulala-talent-content"
        tabIndex={-1}
        data-tulala-surface-main
        style={{
          padding: "28px 28px 60px",
          maxWidth: 1240,
          margin: "0 auto",
          outline: "none",
        }}
      >
        <TalentRouter />
      </main>
      {/* Legacy TalentMessagesFab is superseded by the unified
          BottomActionFab which now also handles the talent surface
          (with talent-specific quick-actions: Block dates / Edit
          profile / Add polaroids / Open messages).
          Kept dormant for one release in case we need to revert. */}
      {/* <TalentMessagesFab /> */}
    </div>
  );
}

// ─── Topbar (lighter than workspace admin) ─────────────────────────

function TalentTopbar() {
  const { state, setTalentPage, openDrawer } = useProto();
  const profile = MY_TALENT_PROFILE;
  // WS-12.6 — roving tabindex on talent topbar page nav
  const talentNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(talentNavRef, "button", { orientation: "horizontal" });

  return (
    <header
      data-tulala-app-topbar
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        padding: "0 28px",
        position: "sticky",
        top: "calc(var(--proto-cbar, 50px) + 56px)",
        zIndex: 40,
      }}
    >
      <div
        data-tulala-app-topbar-row
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 52,
        }}
      >
        {/* Page nav — the only thing the talent topbar owns now.
            User identity (Marta), agency-acting-as chip, mode toggle,
            bell + notifications all moved to the persistent identity
            bar above. */}
        <nav ref={talentNavRef} data-tulala-app-topbar-nav aria-label="Talent sections" style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
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
                  transition: `color ${TRANSITION.micro}, background ${TRANSITION.micro}`,
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
                    bottom: -14,
                    left: 8,
                    right: 8,
                    height: 3,
                    background: COLORS.fill,
                    borderRadius: 2,
                    opacity: active ? 1 : 0,
                    transform: active ? "scaleX(1)" : "scaleX(0.4)",
                    transformOrigin: "center",
                    transition: `opacity ${TRANSITION.md}, transform ${TRANSITION.drawer}`,
                    pointerEvents: "none",
                  }}
                />
              </button>
            );
          })}
        </nav>

        {/* Preview public profile — secondary link on desktop only.
            Hidden on mobile because the topbar gets cramped and this
            isn't a primary action; talent can still preview from
            Profile / Public page. Was a chunky pill on a colored bg —
            now it's an unstyled link, calmer alongside the page nav. */}
        <a
          data-tulala-talent-preview-link
          href={`https://${profile.publicUrl}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 500,
            color: COLORS.inkMuted,
            textDecoration: "none",
            padding: "6px 4px",
            flexShrink: 0,
            transition: `color ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; }}
        >
          <Icon name="external" size={11} stroke={1.7} />
          Preview profile
        </a>
        <style>{`
          @media (max-width: 720px) {
            [data-tulala-talent-preview-link] { display: none !important; }
          }
        `}</style>
      </div>
    </header>
  );
}

// ─── Router ───────────────────────────────────────────────────────

function TalentRouter() {
  const { state } = useProto();
  let page: ReactNode = null;
  switch (state.talentPage) {
    case "today":
      page = <TalentTodayPage />;
      break;
    case "messages":
      page = <TalentMessagesPage />;
      break;
    case "profile":
      page = <MyProfilePage />;
      break;
    case "inbox":
      page = <InboxPage />;
      break;
    case "calendar":
      page = <CalendarPage />;
      break;
    case "activity":
      // WS-8.1 — activity removed from primary nav; legacy URL alias → settings
      page = <SettingsPage />;
      break;
    case "reach":
      // WS-8.2 — reach split; legacy URL alias → agencies
      page = <AgenciesPage />;
      break;
    case "agencies":
      // WS-8.2 — new canonical page
      page = <AgenciesPage />;
      break;
    case "public-page":
      // WS-8.2 — new canonical page
      page = <PublicPageEditor />;
      break;
    case "settings":
      page = <SettingsPage />;
      break;
  }
  return (
    <div key={state.talentPage} data-tulala-talent-page-anim style={{ animation: "tulala-page-fade .22s cubic-bezier(.4,0,.2,1)" }}>
      <style>{`@keyframes tulala-page-fade { from { opacity: 0; } to { opacity: 1; } } @media (prefers-reduced-motion: reduce) { [data-tulala-talent-page-anim] { animation: none !important; } }`}</style>
      {page}
    </div>
  );
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
    <>
    <style>{`
      @media (max-width: 680px) {
        [data-tulala-page-header] [data-tulala-h1] {
          font-size: 19px !important; line-height: 1.2 !important; letter-spacing: -0.25px !important; font-weight: 700 !important;
        }
        [data-tulala-page-header] { margin-bottom: 10px !important; gap: 8px !important; align-items: baseline !important; }
        [data-tulala-page-header] [data-tulala-page-eyebrow] { display: none !important; }
        [data-tulala-page-header] p { display: none !important; }
        [data-tulala-page-header-actions] { flex-shrink: 0 !important; }
      }
    `}</style>
    <div data-tulala-page-header style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
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
        <div data-tulala-page-header-actions style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
    </>
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

// Inquiry RI-* → talent conversation cN. Mirrors the client-side map so
// every Today-style click on the talent surface lands inside the new
// MessagesShell with the right thread pinned, instead of opening legacy
// drawers.
const TALENT_INQUIRY_TO_CONV: Record<string, string> = {
  "RI-201": "c1",  // Mango spring lookbook
  "RI-202": "c3",  // Vogue Italia (talent c3 maps to RI-202 in TALENT_REQUESTS)
  "RI-203": "c2",  // Bvlgari
  "RI-207": "c5",  // H&M past
};

function TalentTodayPage() {
  const { openDrawer, setTalentPage } = useProto();
  const profile = MY_TALENT_PROFILE;
  // Funnel into the unified profile-shell from any Today CTA that
  // edits the profile. Same helper pattern as MyProfilePage + ProfileHero.
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: "t1", section });
  // First-session checklist persists dismiss only for the session in the
  // prototype. Production wires this to a per-user kv pair.
  const [firstSessionDismissed, setFirstSessionDismissed] = useState(false);

  // ── Today's data is derived directly from MOCK_CONVERSATIONS — the
  //    same source the messages shell reads. One source, one truth.
  //    Every Today row click pins that exact conversation and lands the
  //    talent inside the messages shell where they can act on it.
  // ──
  // "Needs your reply" — the talent owes the next message: stage is in
  // an active negotiation (inquiry/hold) and the last message wasn't
  // from them. Sorted oldest-first so the most overdue surfaces at top.
  const replyConvs = MOCK_CONVERSATIONS
    .filter((c) =>
      (c.stage === "inquiry" || c.stage === "hold") &&
      c.lastMessage.sender !== "you",
    )
    .sort((a, b) => {
      // Two-tier chronological sort — same model as the inbox so the
      // Today feed and the messages shell read in the same order:
      //   Tier 1: unseen (never opened) inquiries first
      //   Tier 2: everything else — sorted by recency (freshest first)
      // Lower ageHrs = more recent, so it sits higher in each tier.
      const aNew = a.seen === false ? 1 : 0;
      const bNew = b.seen === false ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew;
      return a.lastMessage.ageHrs - b.lastMessage.ageHrs;
    });
  // "Inquiries you're in" (watching) — same pipeline stages but the
  // talent has already responded. Now waiting on coordinator/client/
  // peers. Includes anything in inquiry/hold not already in replyConvs.
  const replyConvIds = new Set(replyConvs.map((c) => c.id));
  const watchingConvs = MOCK_CONVERSATIONS.filter((c) =>
    (c.stage === "inquiry" || c.stage === "hold") && !replyConvIds.has(c.id),
  );

  // "Next on the calendar" — derived from MOCK_CONVERSATIONS (same
  // source as the messages shell's Booked filter). The 3 jobs the
  // talent has actually been booked on appear here, click takes them
  // straight to the logistics tab inside the messages shell where the
  // call sheet, transport, hotel, schedule live.
  const upcoming = MOCK_CONVERSATIONS.filter((c) => c.stage === "booked");
  const paidThisMonth = EARNINGS_ROWS.filter((e) => e.payoutDate.includes("Apr"));
  const paidThisMonthTotal = paidThisMonth.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const paidThisMonthCurrency = paidThisMonth[0]?.amount.match(/[€£$]/)?.[0] ?? "€";
  const pendingCount = replyConvs.length;

  // Pin a conversation and route into the messages shell. Single
  // canonical action — every Today click flows through here so the
  // talent always lands in the same surface where they can actually
  // reply, accept the offer, sign the booking, etc.
  const openInMessages = (convId: string) => {
    pinNextConversationT(convId);
    setTalentPage("messages");
  };
  // Same as openInMessages but also pins the thread tab so the talent
  // lands on the right surface inside the conversation. Used by Next-
  // on-the-calendar (→ logistics, where the call sheet lives) and
  // anywhere else that needs to deep-link into a specific tab.
  const openInMessagesAt = (convId: string, tabId: string) => {
    pinNextConversationT(convId);
    pinNextThreadTabT(tabId);
    setTalentPage("messages");
  };

  // Top 2 pending names → inline links in the hero copy. The click
  // pins the exact thread, opens the messages shell, lands on the
  // thread pane (the pin auto-switches mobile pane to "thread" too).
  // The `isNew` flag rides along so the hero subline can pick the
  // right copy ("just landed" vs "latest update").
  const pendingTargets: { name: string; onClick: () => void; isNew: boolean }[] = replyConvs
    .slice(0, 2)
    .map((c) => ({
      name: c.client,
      onClick: () => openInMessages(c.id),
      isNew: c.seen === false,
    }));

  // "Reply now" CTA: jump to the freshest pending — same conv that
  // sits at the top of the messages shell inbox.
  const firstPending = pendingTargets[0];

  // Day-1 detection mirrors the hero's isDay1 logic — drives whether we
  // render the first-session checklist. Now anchored on real
  // conversations from MOCK_CONVERSATIONS instead of agency-side records.
  const isDay1 =
    upcoming.length === 0 &&
    paidThisMonthTotal === 0 &&
    replyConvs.length === 0 &&
    watchingConvs.length === 0;

  return (
    <>
      {/* Mobile compaction for the entire Today page. Tighter card
          padding + section gaps + stat strip horizontal rather than
          stacked vertically — the page goes from ~3 viewports tall to
          ~2 on a typical iPhone. */}
      <style>{`
        @media (max-width: 720px) {
          /* Stats strip: horizontal 3-up at mobile (override the
             generic stat-strip rule that stacks them) so CONFIRMED /
             PAID THIS MONTH / PROFILE fit in one row. */
          .tulala-shell #tulala-talent-content [data-tulala-stat-strip] {
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            scrollbar-width: none !important;
            padding: 10px 12px !important;
          }
          .tulala-shell #tulala-talent-content [data-tulala-stat-strip]::-webkit-scrollbar {
            display: none;
          }
          .tulala-shell #tulala-talent-content [data-tulala-stat-strip] > * {
            flex-basis: auto !important;
            flex-grow: 0 !important;
            flex-shrink: 0 !important;
            min-width: 110px;
          }
          /* Section margin tightens between cards / strips */
          .tulala-shell #tulala-talent-content > div > section,
          .tulala-shell #tulala-talent-content > div > div {
            margin-bottom: 10px !important;
          }
          /* Cards: 14px padding instead of default 18px */
          .tulala-shell #tulala-talent-content [data-tulala-card] {
            padding: 12px 14px !important;
          }
          /* Section heading row */
          .tulala-shell #tulala-talent-content h2 {
            font-size: 14.5px !important;
          }
        }
      `}</style>

      {/* First-session checklist — shows ONCE on Day-1 and routes the
          new talent through the 4 onboarding wins that unlock inquiries.
          Sits above the hero so it's the first thing they see.
          polaroidCount/channelsLive/payoutSet are stubbed; production
          derives them from the profile object. */}
      {isDay1 && !firstSessionDismissed && (
        <FirstSessionChecklist
          completeness={profile.completeness}
          polaroidCount={0}
          channelsLive={0}
          payoutSet={false}
          onProfile={() => openSection("identity")}
          onPolaroids={() => openSection("polaroids")}
          onReach={() => setTalentPage("agencies")}
          onPayouts={() => openDrawer("talent-payouts")}
          onDismiss={() => setFirstSessionDismissed(true)}
        />
      )}

      {/* WS-9.2 — modern first-run banner for returning-but-incomplete users
          (after Day-1 so it doesn't clash with FirstSessionChecklist). */}
      {!isDay1 && profile.completeness < 40 && (
        <TalentFirstRunBanner />
      )}

      {/* Profile-completeness banner — only when below the visibility
          threshold. Indigo soft (info, not urgent) with a clear CTA.
          Auto-disappears at >= 80% so it never becomes wallpaper. Hidden
          on Day-1 since the FirstSessionChecklist owns that moment. */}
      {!isDay1 && profile.completeness >= 40 && profile.completeness < 80 && (
        <ProfileCompletenessBanner
          percent={profile.completeness}
          missing={profile.missing}
          onFinish={() => openSection("identity")}
        />
      )}

      <TalentTodayHero
        firstName={profile.name.split(" ")[0]}
        pendingCount={pendingCount}
        pendingTargets={pendingTargets}
        upcomingCount={upcoming.length}
        nextBookingDate={upcoming[0]?.date}
        paidThisMonth={paidThisMonthTotal}
        paidCurrency={paidThisMonthCurrency}
        profileCompleteness={profile.completeness}
        currentLocation={profile.currentLocation}
        availableForWork={profile.availableForWork}
        availableToTravel={profile.availableToTravel}
        // Day-1 = no work history at all yet. Hero shifts to welcome tone.
        isDay1={isDay1}
        onReplyNow={
          firstPending
            ? firstPending.onClick
            : () => setTalentPage("messages")
        }
        onAvailability={() => openDrawer("talent-block-dates")}
        onOpenProfile={() => openSection("identity")}
        onOpenCalendar={() => setTalentPage("calendar")}
        onOpenActivity={() => setTalentPage("activity")}
      />

      {/* Audit #14 — Today's plan inline banner. Shows today's confirmed
          shoots inline (call time, location). The mock's "today" is May
          6; production reads from real date. Only renders when the next
          booking literally starts today, so it auto-vanishes off-day.
          Disabled in the conversation-driven Today (none of the booked
          MOCK_CONVERSATIONS land on May 6 in current mock data). When
          the real "is today" check goes live this re-enables itself. */}

      {/* Order rationale (Tier 2 audit): group temporally.
            Forward-facing first  → Needs reply, Inquiries (in flight), Calendar
            Backward-facing after → Earnings, Profile views (looking back, 2-up)
          The eye flows top-to-bottom in the same direction as the data. */}

      {/* 1 — Needs reply. The ONLY action-needed feed on the page.
            Driven directly from MOCK_CONVERSATIONS so the rows match
            the talent's actual inbox 1:1. Each row click pins the
            conversation and opens the messages shell — that's where
            the talent answers, accepts the offer, signs the booking. */}
      {pendingCount > 0 && (
        <NeedsReplySection
          conversations={replyConvs}
          onOpenInMessages={openInMessages}
          onSeeAll={() => setTalentPage("messages")}
        />
      )}

      {/* 2 — Inquiries you're competing in (in-flight pipeline).
            Driven from MOCK_CONVERSATIONS — same source as Needs-reply
            and the messages shell — so the pipeline view is always in
            sync with what the talent sees in their inbox. */}
      {watchingConvs.length > 0 && (
        <TalentFunnelCard
          conversations={watchingConvs}
          onOpenInMessages={openInMessages}
        />
      )}

      <div style={{ height: 12 }} />

      {/* 3 — Calendar (forward-facing). Driven from MOCK_CONVERSATIONS
            (booked stage) so the rows here mirror the Booked filter
            inside the messages shell 1:1. Click any row → pin the
            conversation AND pin the Logistics tab — that's where the
            call sheet / transport / hotel / schedule live. The talent
            arrives directly on the booking info, not the chat. */}
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
              : `${upcoming.length} upcoming · next ${upcoming[0]?.date}`
          }
          actionLabel="See calendar →"
          onAction={() => setTalentPage("calendar")}
          secondaryActionLabel="+ Add manually"
          onSecondaryAction={() => openDrawer("talent-add-event")}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {upcoming.map((c) => (
            <ConversationCalendarRow
              key={c.id}
              conv={c}
              onOpen={() => openInMessagesAt(c.id, "booking")}
            />
          ))}
        </div>
      </section>

      <div style={{ height: 12 }} />

      {/* 4 — WS-8.4 This-week rhythm strip */}
      <WeekRhythmStrip />

      {/* 5 + 6 — Looking back: earnings tile (WS-8.3) + analytics, paired 2-up. */}
      <Grid cols="2">
        {/* WS-8.3 Earnings tile with cycle selector + sparkline */}
        <EarningsTile
          currency={paidThisMonthCurrency}
          monthTotal={paidThisMonthTotal}
          onSeeAll={() => openDrawer("talent-career-analytics")}
          onLogWork={() => openDrawer("talent-add-event", { mode: "work" })}
        />
        <TalentAnalyticsCard />
      </Grid>

      {/* WS-8.14 Agency analytics quick-access */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => openDrawer("talent-career-analytics")}
          style={{
            flex: 1, padding: "9px 0", background: COLORS.surfaceAlt,
            border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
            color: COLORS.inkMuted, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}
        >
          <Icon name="sparkle" size={12} color={COLORS.inkMuted} />
          Career analytics
        </button>
        <button
          type="button"
          onClick={() => openDrawer("talent-agency-analytics")}
          style={{
            flex: 1, padding: "9px 0", background: COLORS.surfaceAlt,
            border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
            color: COLORS.inkMuted, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}
        >
          <Icon name="team" size={12} color={COLORS.inkMuted} />
          Agency analytics
        </button>
      </div>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
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
function FirstSessionChecklist({
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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
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
function EarningRow({ earning }: { earning: typeof EARNINGS_ROWS[number] }) {
  const { openDrawer } = useProto();
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
        <div style={{ flex: 1, minWidth: 0 }}>
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
      data-tulala-stat-divider
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
  conversations,
  onOpenInMessages,
  onSeeAll,
}: {
  conversations: import("./_talent").Conversation[];
  /** Pin a conversation + route to messages shell. Single canonical action. */
  onOpenInMessages: (convId: string) => void;
  onSeeAll: () => void;
}) {
  // Subtitle counts the kinds of action-needed: inquiry rows ask for
  // a quote, hold rows ask for a confirmation. Same buckets the
  // messages shell uses, so the talent reads the same words on both
  // surfaces.
  const inquiryCount = conversations.filter((c) => c.stage === "inquiry").length;
  const holdCount = conversations.filter((c) => c.stage === "hold").length;
  const subtitleParts = [
    inquiryCount > 0 && `${inquiryCount} ${inquiryCount === 1 ? "offer" : "offers"}`,
    holdCount > 0 && `${holdCount} ${holdCount === 1 ? "hold" : "holds"}`,
  ].filter(Boolean).join(" · ");
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
        subtitle={subtitleParts || `${conversations.length} waiting · sorted by urgency`}
        actionLabel="Open inbox →"
        onAction={onSeeAll}
      />
      <div style={{ marginTop: 4 }}>
        {conversations.map((c) => (
          <ConversationReplyRow
            key={c.id}
            conv={c}
            onOpen={() => onOpenInMessages(c.id)}
          />
        ))}
      </div>
    </section>
  );
}

// ── ConversationReplyRow ──
// One row of "Needs your reply", driven directly by a Conversation.
// Mirrors RequestRow visually (avatar · client+brief · kind chip · date ·
// amount · age · hover Reply) but routes every click into the messages
// shell with the conversation pinned. The talent never has to "find"
// the thread — they're already in it the moment they click.
function ConversationReplyRow({
  conv,
  onOpen,
}: {
  conv: import("./_talent").Conversation;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  // Stage → kind chip styling. inquiry = quote requested (coral),
  // hold = client deciding (amber). Same tone vocabulary as the
  // messages shell so the chip means the same thing on both surfaces.
  const km =
    conv.stage === "inquiry" ? { label: "Offer", tone: "coral" as const }
    : conv.stage === "hold" ? { label: "Hold", tone: "amber" as const }
    : { label: "Open", tone: "ink" as const };
  // Take-home rate the talent earns on this job (talent POV). Looked
  // up from the same TALENT_RATE_FOR_CONV map the messages shell uses.
  const rate = TALENT_RATE_FOR_CONV[conv.id];
  // Age coloring escalates over time — same thresholds as the
  // existing RequestRow so the urgency cue feels consistent.
  const ageHrs = conv.lastMessage.ageHrs;
  const ageLbl = ageHrs < 24 ? `${ageHrs}h ago` : `${Math.floor(ageHrs / 24)}d ago`;
  const ageColor = ageHrs >= 24 ? COLORS.coralDeep : ageHrs >= 12 ? COLORS.coral : COLORS.inkDim;
  const ageWeight = ageHrs >= 24 ? 700 : ageHrs >= 12 ? 500 : 400;
  return (
    <button
      onClick={onOpen}
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
        transition: `background ${TRANSITION.micro}`,
      }}
    >
      <Avatar
        size={36}
        tone="auto"
        hashSeed={conv.client}
        initials={clientInitialsLocal(conv.client)}
      />
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
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {conv.client}
          <Bullet />
          <span style={{ color: COLORS.inkMuted, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
            {conv.brief}
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
          <KindChip label={km.label} tone={km.tone} />
          <span style={{ color: COLORS.inkMuted }}>
            {conv.date}
            {conv.date && rate && " · "}
            {rate && (
              <span style={{ color: COLORS.ink, fontWeight: 500 }}>{rate}</span>
            )}
          </span>
        </div>
      </div>
      {hover && (
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
        {ageLbl}
      </span>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
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
      ? COLORS.coralDeep
      : request.ageHrs >= 12
        ? COLORS.coral
        : COLORS.inkDim;
  const ageWeight = request.ageHrs >= 24 ? 700 : request.ageHrs >= 12 ? 500 : 400;
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
        transition: `background ${TRANSITION.micro}`,
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
            {request.amount && (
              <span style={{ color: COLORS.ink, fontWeight: 500 }}>{request.amount}</span>
            )}
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

// ── ConversationCalendarRow ──
// Conversation-driven sibling of BookingRow. Used by Today's "Next on
// the calendar" feed when the row data comes from MOCK_CONVERSATIONS.
// Click → pin conversation + pin "logistics" tab → land on the call
// sheet inside the messages shell.
function ConversationCalendarRow({
  conv,
  onOpen,
}: {
  conv: import("./_talent").Conversation;
  onOpen: () => void;
}) {
  // Parse the conversation's date label into a date-block. Handles:
  //   "Wed, May 14"  →  MAY 14
  //   "May 14–15"    →  MAY 14
  //   "Sat, Jun 21"  →  JUN 21
  //   "Jul 4–5"      →  JUL  4
  // Falls back to "—" if the format isn't recognized.
  const dateMatch = conv.date?.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const month = dateMatch?.[1]?.toUpperCase() ?? "—";
  const day = dateMatch?.[2] ?? "—";
  // Take-home rate is the most-scanned numeric for talent on a booked
  // job. Same source as the messages shell so they always agree.
  const rate = TALENT_RATE_FOR_CONV[conv.id] ?? "—";
  // Pull the call time + a short location label from the pinned info
  // on the conversation. Both surface in the inline meta strip.
  const callTime = conv.pinned?.callTime ?? null;
  const locShort = conv.location ? conv.location.split(" · ")[0] : null;
  return (
    <button
      onClick={onOpen}
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
        transition: `background ${TRANSITION.micro}`,
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
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span>{conv.client}</span>
          <span style={{ color: COLORS.inkDim }}>·</span>
          <span style={{ color: COLORS.inkMuted, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
            {conv.brief}
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
          <KindChip label="Booked" tone="success" />
          <span style={{ color: COLORS.inkMuted }}>
            {[locShort, callTime ? `call ${callTime}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>
      {rate !== "—" && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.ink,
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {rate}
        </span>
      )}
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
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
        transition: `background ${TRANSITION.micro}`,
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

/**
 * Horizontal video showcase strip. Renders showreel + portfolio
 * videos as 16:9 cards with embedded YouTube/Vimeo players. Each
 * card lazy-mounts its iframe on first hover/tap so we don't slam
 * the network on page load with 3-5 video embeds at once. Falls
 * back to a static thumb + ▶ play overlay; clicking the overlay
 * mounts the iframe in place.
 */
function VideoShowcase({
  showreelUrl,
  showreelCaption,
  portfolioVideos,
  onManage,
}: {
  showreelUrl?: string;
  showreelCaption?: string;
  portfolioVideos: ReadonlyArray<{ url: string; caption?: string; durationSec?: number }>;
  onManage: () => void;
}) {
  // Combine showreel + portfolio videos into a single ordered list.
  // Showreel is always first so it gets the prime visual position.
  const all: Array<{ url: string; caption?: string; durationSec?: number; isReel?: boolean }> = [
    ...(showreelUrl ? [{ url: showreelUrl, caption: showreelCaption, isReel: true }] : []),
    ...portfolioVideos,
  ];
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 6,
          // Hide scrollbar across browsers — purely visual; users still
          // scroll via wheel / drag / touch.
          scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {all.map((v, i) => (
          <VideoCard key={`${i}-${v.url}`} url={v.url} caption={v.caption} durationSec={v.durationSec} isReel={v.isReel} />
        ))}
        {/* Trailing "+ Add" tile — funnels into the media editor. */}
        <button
          type="button"
          onClick={onManage}
          aria-label="Add or manage video"
          style={{
            flex: "0 0 auto",
            width: 160,
            aspectRatio: "16 / 9",
            borderRadius: 12,
            border: `1.5px dashed ${COLORS.borderSoft}`,
            background: "#fff",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 18 }}>+</span>
          <span>Add video</span>
        </button>
      </div>
    </div>
  );
}

function VideoCard({ url, caption, durationSec, isReel }: { url: string; caption?: string; durationSec?: number; isReel?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const parsed = parseVideoUrl(url);
  // mm:ss formatter, shown bottom-right when we have duration metadata.
  const dur = durationSec
    ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`
    : null;
  return (
    <div
      style={{
        flex: "0 0 auto",
        width: 280,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 12,
          overflow: "hidden",
          background: COLORS.surfaceAlt,
          border: `1px solid ${COLORS.borderSoft}`,
          boxShadow: "0 1px 3px rgba(11,11,13,0.06)",
        }}
      >
        {playing && parsed && (parsed.provider === "youtube" || parsed.provider === "vimeo") ? (
          <iframe
            src={`${parsed.embedUrl}?autoplay=1`}
            title={caption ?? "Video"}
            style={{ width: "100%", height: "100%", border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : playing && parsed && parsed.provider === "mp4" ? (
          <video
            src={parsed.embedUrl}
            controls
            autoPlay
            style={{ width: "100%", height: "100%", background: "#000", objectFit: "cover" }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Play video"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              padding: 0,
              cursor: "pointer",
              background: parsed?.thumbUrl
                ? `url(${parsed.thumbUrl}) center/cover, ${COLORS.surfaceAlt}`
                : `linear-gradient(135deg, ${COLORS.surfaceAlt}, rgba(11,11,13,0.08))`,
              position: "relative",
            }}
          >
            <span aria-hidden style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(11,11,13,0) 50%, rgba(11,11,13,0.55) 100%)",
            }} />
            <span aria-hidden style={{
              position: "absolute",
              top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              width: 48, height: 48, borderRadius: "50%",
              background: "rgba(255,255,255,0.94)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 16px rgba(11,11,13,0.3)",
            }}>
              <span style={{ fontSize: 18, color: COLORS.ink, marginLeft: 3 }}>▶</span>
            </span>
            {isReel && (
              <span style={{
                position: "absolute", top: 8, left: 8,
                fontSize: 10, fontWeight: 700, fontFamily: FONTS.body, letterSpacing: 0.4,
                padding: "3px 8px", borderRadius: 999,
                background: COLORS.accent, color: "#fff", textTransform: "uppercase",
              }}>★ Showreel</span>
            )}
            {parsed && (
              <span style={{
                position: "absolute", top: 8, right: 8,
                fontSize: 9.5, fontWeight: 700, fontFamily: FONTS.body, letterSpacing: 0.5,
                padding: "2px 7px", borderRadius: 999,
                background: parsed.provider === "youtube" ? "#FF0000"
                  : parsed.provider === "vimeo" ? "#1AB7EA"
                  : "rgba(11,11,13,0.55)",
                color: "#fff", textTransform: "uppercase",
              }}>{parsed.provider}</span>
            )}
            {dur && (
              <span style={{
                position: "absolute", bottom: 8, right: 8,
                fontSize: 11, fontWeight: 600, fontFamily: FONTS.body,
                padding: "2px 7px", borderRadius: 6,
                background: "rgba(11,11,13,0.72)", color: "#fff",
                fontVariantNumeric: "tabular-nums",
              }}>{dur}</span>
            )}
          </button>
        )}
      </div>
      {caption && (
        <div style={{
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.inkMuted,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {caption}
        </div>
      )}
    </div>
  );
}

/**
 * Tier breakdown — three small chips showing Universal / Global /
 * Type-specific completion. Reads applicable-fields-per-tier from
 * the catalog and intersects with the live missing list. Talent
 * gets a clear signal of what kind of progress matters: Universal
 * must hit 100% to publish; Global pads the percent; Type-specific
 * is the polish for higher discovery rank.
 */
function TierBreakdown({
  missing,
  primaryType,
  secondaryTypes,
}: {
  missing: ReadonlyArray<{ id: string; label: string; section: string }>;
  primaryType: TaxonomyParentId;
  secondaryTypes?: ReadonlyArray<TaxonomyParentId>;
}) {
  const types = [primaryType, ...(secondaryTypes ?? [])];
  const applicable = fieldsForType(types).filter(f =>
    !f.id.startsWith("dyn.") && f.id !== "consent.terms" && f.id !== "media.headshot"
  );
  const missingIds = new Set(missing.map(m => m.id));
  const tiers = (["universal", "global", "type-specific"] as const).map(tier => {
    const tierFields = applicable.filter(f => f.tier === tier);
    const tierMissing = tierFields.filter(f => missingIds.has(f.id)).length;
    const tierFilled = tierFields.length - tierMissing;
    return {
      tier,
      label: tier === "universal" ? "Universal" : tier === "global" ? "Global" : "Type-specific",
      filled: tierFilled,
      total: tierFields.length,
      complete: tierMissing === 0,
    };
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
      {tiers.map(t => (
        <span
          key={t.tier}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 9px", borderRadius: 999,
            background: t.complete ? "rgba(15,79,62,0.10)" : "#fff",
            border: `1px solid ${t.complete ? "rgba(15,79,62,0.30)" : "rgba(91,107,160,0.25)"}`,
            color: t.complete ? COLORS.accentDeep ?? COLORS.accent : COLORS.indigoDeep,
            fontSize: 10.5, fontWeight: 600,
            fontFamily: FONTS.body,
            letterSpacing: 0.2,
          }}
          title={`${t.label}: ${t.filled} of ${t.total} filled`}
        >
          {t.complete && <span aria-hidden>✓</span>}
          <span>{t.label}: {t.filled}/{t.total}</span>
        </span>
      ))}
    </div>
  );
}

function MyProfilePage() {
  const { openDrawer, toast } = useProto();
  // Subscribe to override store + read the MERGED profile. Edits in
  // the workspace/self profile shell that finalSubmit() into the
  // override store now flow through here without a refresh.
  useProfileOverrideSubscription();
  // Audit fix #2 — also subscribe to the pending-review queue. When
  // Marta submits a self-edit, finalSubmit() pushes a PendingReviewEntry
  // for `t-marta`. The dashboard now surfaces that as a status banner
  // so she sees "submitted, waiting" instead of nothing changing.
  usePendingReviewSubscription();
  const pendingMine = getPendingReviewForRoster({ id: "t1", name: MY_TALENT_PROFILE.name });
  // Phase B — talent surface renders the canonical profile by id.
  // The "currently logged in talent" is hardcoded to t1 (Marta) for
  // the prototype; production reads from auth context. The override
  // store keys by the same id so edits round-trip cleanly.
  const baseProfile = applyProfileOverride("t1", getProfileById("t1"));
  // Catalog-driven completeness — replaces the static `completeness`
  // int + `missing` array on the seed. Counts applicable fields per
  // primaryType, counts filled, returns percent + a missing list.
  // As the catalog grows or the talent fills more fields, the math
  // updates automatically — no hand-tuned numbers.
  const catalogCompleteness = computeProfileCompleteness(
    baseProfile,
    [baseProfile.primaryType, ...baseProfile.secondaryTypes]
  );
  // Override both `completeness` (number) AND `missing` (string[]) so
  // every downstream consumer reads the catalog-derived values.
  const p = {
    ...baseProfile,
    completeness: catalogCompleteness.percent,
    missing: catalogCompleteness.missing.map(m => m.label),
  };
  const m = p.measurements;

  // Map missing fields to the unified profile-shell section that
  // completes them. Single source of truth — every "fix this" click
  // deep-links into talent-profile-shell with mode "edit-self" instead
  // of opening a parallel mini-drawer with its own field shape +
  // privacy semantics. The legacy talent-* mini-drawers (talent-
  // polaroids, talent-rate-card, …) become unreachable from this
  // path; they stay registered for backwards-compat with anything
  // else that still calls them, but the talent-side dashboard funnels
  // entirely through the shell now.
  const missingFieldRoutes: { label: string; section: string }[] =
    p.missing.map((field) => {
      const lower = field.toLowerCase();
      if (lower.includes("polaroid"))    return { label: field, section: "polaroids" };
      if (lower.includes("rate"))        return { label: field, section: "rates" };
      if (lower.includes("showreel"))    return { label: field, section: "media" };
      if (lower.includes("measurement")) return { label: field, section: "details" };
      if (lower.includes("document") || lower.includes("file")) return { label: field, section: "files" };
      if (lower.includes("portfolio") || lower.includes("photo") || lower.includes("album")) return { label: field, section: "albums" };
      if (lower.includes("language"))    return { label: field, section: "languages" };
      if (lower.includes("availab"))     return { label: field, section: "availability" };
      if (lower.includes("skill"))       return { label: field, section: "refinement" };
      if (lower.includes("credit"))      return { label: field, section: "credits" };
      if (lower.includes("limit"))       return { label: field, section: "limits" };
      if (lower.includes("verif"))       return { label: field, section: "verifications" };
      // Default — land on Identity (fields like name / pronouns / DOB).
      return { label: field, section: "identity" };
    });
  // Single helper — every "edit X" CTA on this dashboard funnels through
  // here. Centralizes the mode + section payload so we never accidentally
  // open the wrong drawer or miss a section.
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: "t1", section });

  // Phase C4 — derive role labels for the page header. Primary +
  // secondary roles render as "Model · also Host" so the multi-role
  // identity is obvious at the top of the dashboard.
  const primaryRoleLabel = TAXONOMY.find(t => t.id === p.primaryType)?.label ?? "Talent";
  const secondaryRoleLabels = p.secondaryTypes
    .map(id => TAXONOMY.find(t => t.id === id)?.label)
    .filter((l): l is string => !!l);
  const roleSummary = secondaryRoleLabels.length > 0
    ? `${primaryRoleLabel} · also ${secondaryRoleLabels.join(" · ")}`
    : primaryRoleLabel;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`${roleSummary} · ${p.measurementsSummary} · ${p.city}`}
        actions={
          // Header actions are intentionally compact (size="sm"). The
          // md size is for body-level CTAs; in a header alongside the
          // h1, md reads as too-chunky. Both buttons match width feel
          // because they're sized identically and the icon adds the
          // ~9px the longer label needs to balance.
          <>
            <SecondaryButton size="sm" onClick={() => openDrawer("talent-public-preview")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="external" size={11} /> Preview as client
              </span>
            </SecondaryButton>
            <PrimaryButton size="sm" onClick={() => openSection("identity")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="pencil" size={11} /> Edit profile
              </span>
            </PrimaryButton>
          </>
        }
      />

      {/* Audit fix #2 — pending-review banner. Shows when Marta has
          submitted a self-edit that the agency hasn't reviewed yet,
          plus a soft "withdraw" affordance so she can pull it back if
          she changes her mind before the agency acts. */}
      {pendingMine && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            marginBottom: 14,
            borderRadius: 12,
            background: "rgba(46,124,209,0.06)",
            border: `1px solid rgba(46,124,209,0.22)`,
            fontFamily: FONTS.body,
          }}
        >
          <span aria-hidden style={{ fontSize: 14 }}>⏳</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f4d8a" }}>
              Submitted to your agency · waiting for review
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
              {pendingMine.note} · usually reviewed within 1 business day.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearPendingReview(pendingMine.talentId);
              toast("Submission withdrawn — your changes are still saved");
            }}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              border: `1px solid rgba(46,124,209,0.4)`,
              background: "#fff",
              color: "#1f4d8a",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Withdraw
          </button>
        </div>
      )}

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
            {/* Tier breakdown — derived from the catalog. Splits the
                missing list by tier so the talent sees what kind of
                progress matters: Universal must be 100% to publish,
                Global pads the percent, Type-specific is the polish. */}
            <TierBreakdown
              missing={catalogCompleteness.missing}
              primaryType={baseProfile.primaryType}
              secondaryTypes={baseProfile.secondaryTypes}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {missingFieldRoutes.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => openSection(r.section)}
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
            onClick={() => openSection("identity")}
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
                        aria-hidden
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
          onClick={() => openSection("media")}
        />
        <SecondaryCard
          title="Headshot"
          description="The single shot used everywhere — agency rosters, Tulala hub, search results."
          meta={<><StatDot tone="green" /> 1 image set</>}
          affordance="Replace headshot"
          onClick={() => openSection("media")}
        />
        <SecondaryCard
          title="Polaroids · naturals"
          description={`Front · Side · Back · Smile · No-makeup. ${POLAROID_SET.filter(x => x.thumb !== "—").length} of 5 set — coordinators ask for these first.`}
          meta={<><StatDot tone={POLAROID_SET.every(x => x.thumb !== "—") ? "green" : "amber"} /> {POLAROID_SET.filter(x => x.thumb !== "—").length}/5</>}
          affordance="Manage polaroids"
          onClick={() => openSection("polaroids")}
        />
        <SecondaryCard
          title="Portfolio"
          description={`12 / 15 styled shots${(p.portfolioVideos?.length ?? 0) > 0 ? ` · ${p.portfolioVideos!.length} video clips` : ""}. Your agencies favour fresh work — keep at least 3 from this year.`}
          meta={<><StatDot tone="amber" /> Needs 3 from 2026</>}
          affordance="Manage portfolio"
          onClick={() => openSection("albums")}
        />
        <SecondaryCard
          title="Showreel"
          description={p.showreelUrl ? `${p.showreelDuration ?? "Reel"} clip · used for casting requests with movement, dialogue, or runway.` : (p.showreelThumb ? `${p.showreelDuration} clip · used for casting requests.` : "Add a 30-60s clip — opens up acting + dance + runway leads.")}
          meta={p.showreelUrl || p.showreelThumb ? <><StatDot tone="green" /> {p.showreelDuration ?? "Set"}</> : <><StatDot tone="dim" /> Not set</>}
          affordance="Open showreel"
          onClick={() => openSection("media")}
        />
        <SecondaryCard
          title="Mood / vibe board"
          description="Pin 6-9 references for the kind of work you want more of. Agencies use this to pitch you smarter."
          meta={<><StatDot tone="dim" /> Optional</>}
          affordance="Set mood board"
          onClick={() => openSection("about")}
        />
      </Grid>

      {/* ── Video showcase ─────────────────────────────────────────
          Renders the showreel + any portfolio videos as a horizontally-
          scrollable strip with playable embeds. Skipped when the
          talent has no video work yet — the dashboard should still
          read clean for image-only profiles. */}
      {(p.showreelUrl || (p.portfolioVideos && p.portfolioVideos.length > 0)) && (
        <>
          <Divider label="Motion work" />
          <VideoShowcase
            showreelUrl={p.showreelUrl}
            showreelCaption={p.showreelDuration ? `Showreel · ${p.showreelDuration}` : "Showreel"}
            portfolioVideos={p.portfolioVideos ?? []}
            onManage={() => openSection("media")}
          />
        </>
      )}

      {/* ── Physicality (measurements + features) ─────────────────── */}
      <Divider label="Physicality" />
      <PrimaryCard
        title="Measurements & features"
        description="Height · sizes · features. Visible to agencies and clients you're shortlisted by."
        icon={<Icon name="user" size={14} stroke={1.7} />}
        affordance="Edit measurements"
        onClick={() => openSection("details")}
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
          onClick={() => openSection("services")}
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
          onClick={() => openSection("languages")}
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
          onClick={() => openSection("refinement")}
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
          onClick={() => openSection("limits")}
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
          onClick={() => openSection("credits")}
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
          onClick={() => openSection("social_proof")}
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
            onClick={() => openSection("files")}
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
          onClick={() => openSection("rates")}
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
          onClick={() => openSection("location")}
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
          onClick={() => openSection("about")}
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
          onClick={() => openSection("admin")}
        />
        <SecondaryCard
          title="Availability"
          description={`${AVAILABILITY_BLOCKS.length} blocks set · next block ${AVAILABILITY_BLOCKS[0]?.startDate}`}
          affordance="Open availability"
          onClick={() => openSection("availability")}
        />
      </Grid>

      {/* ── All sections — full parity with the workspace edit drawer.
            Talents see every Tulala field set the engine knows about.
            Each tile deep-links into the unified profile-shell on the
            matching section. Status chip on each tile — "Complete" /
            "Optional" / "N missing" — driven from the underlying state. */}
      <Divider label="All sections" />
      <p style={{
        fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted,
        margin: "0 0 12px", lineHeight: 1.5, maxWidth: 640,
      }}>
        Every field Tulala can show on your public profile, your agency rosters,
        and the discovery hub. Tap any tile to edit — the cards above are just
        the most-edited shortcuts.
      </p>
      <AllSectionsGrid openSection={openSection} />
    </>
  );
}

// ── AllSectionsGrid ─────────────────────────────────────────────────
// Renders all 18 PROFILE_SECTIONS as a 2-up tile grid (1-up on mobile).
// Each tile deep-links via openSection. Status chip is derived from a
// quick read of the talent's profile state — best-effort heuristics
// keyed off MY_TALENT_PROFILE so the talent sees what's complete vs
// outstanding without opening each section.
function AllSectionsGrid({ openSection }: { openSection: (s: string) => void }) {
  // Subscribe + read merged profile so completion chips refresh when
  // the talent edits anything in the shell.
  useProfileOverrideSubscription();
  const baseAS = applyProfileOverride("t1", getProfileById("t1"));
  // Catalog-driven completeness — same calc as MyProfilePage so the
  // header percent and the section grid agree.
  const compAS = computeProfileCompleteness(baseAS, [baseAS.primaryType, ...baseAS.secondaryTypes]);
  const p = {
    ...baseAS,
    completeness: compAS.percent,
    missing: compAS.missing.map(m => m.label),
  };
  // Real completion state per section — derived from the actual
  // talent profile object. Each section computes filled vs total
  // required fields and surfaces a chip + a "3 of 5" remainder so
  // the talent knows what's outstanding before opening the section.
  type Status = "complete" | "partial" | "empty" | "optional";
  type SectionDef = { id: string; label: string; emoji: string; description: string; status: Status; remainder?: string };
  // Helpers — simple "is field filled" probes
  const has = (v: unknown): boolean => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return Boolean(v);
  };
  const ratio = (filled: number, total: number): { status: Status; remainder?: string } => {
    if (filled === 0) return { status: "empty",   remainder: `Add ${total} required` };
    if (filled < total) return { status: "partial", remainder: `${total - filled} of ${total} left` };
    return { status: "complete" };
  };
  // Identity — required: stage name, pronouns, age (proxies for the
  // canonical fields that don't all exist on MyTalentProfile yet).
  const identityFilled = [p.name, p.pronouns, p.age].filter(has).length;
  const identityRatio = ratio(identityFilled, 3);
  // Services — at least one specialty.
  const servicesRatio = ratio(p.specialties.length > 0 ? 1 : 0, 1);
  // Location — required: city + at least one passport / work auth.
  const locationFilled = [p.city, p.travel?.passports ?? [], p.travel?.workAuth ?? []].filter(has).length;
  const locationRatio = ratio(Math.min(locationFilled, 2), 2);
  // Media — cover + headshot.
  const mediaFilled = [p.coverPhoto, p.profilePhoto].filter(has).length;
  const mediaRatio = ratio(mediaFilled, 2);
  // Polaroids — 5 required (front · side · back · smile · no-makeup).
  const polaroidsFilled = POLAROID_SET.filter(x => x.thumb !== "—").length;
  const polaroidsRatio = ratio(polaroidsFilled, 5);
  // Albums — heuristic: any portfolio shot counts.
  const albumsRatio = ratio(p.profilePhoto ? 1 : 0, 6);
  // About — at least 1 link.
  const aboutRatio = ratio(p.links.length > 0 ? 1 : 0, 1);
  // Details (physicality) — height + bust + waist + hips filled.
  const m = p.measurements;
  const detailsFilled = [m?.heightImperial, m?.bust, m?.waist, m?.hips, m?.hairColor, m?.eyeColor].filter(has).length;
  const detailsRatio = ratio(Math.min(detailsFilled, 4), 4);
  // Rates — required: rateCard set.
  const ratesRatio = ratio(p.rateCard ? 1 : 0, 1);
  // Availability — completed when any blocks set.
  const availabilityRatio: { status: Status; remainder?: string } = AVAILABILITY_BLOCKS.length > 0 ? { status: "complete" } : { status: "empty", remainder: "Block your unavailable dates" };
  // Languages — at least 1.
  const languagesRatio: { status: Status; remainder?: string } = p.languages.length > 0 ? { status: "complete" } : { status: "empty", remainder: "Add a language" };
  // Skills — at least 3.
  const skillsRatio = ratio(Math.min(p.skills.length, 3), 3);
  // Credits — at least 1.
  const creditsRatio: { status: Status; remainder?: string } = p.credits.length > 0 ? { status: "complete" } : { status: "empty", remainder: "Add your first credit" };
  // Limits — optional.
  const limitsRatio: { status: Status } = p.limits.length > 0 ? { status: "complete" } : { status: "optional" };
  // Files — required: W-8BEN + model release uploaded.
  const docsUploaded = (p.documents ?? []).filter(d => d.state === "uploaded").length;
  const filesRatio = ratio(Math.min(docsUploaded, 2), 2);
  // Social proof — completed via reviews.
  const socialProofRatio: { status: Status } = p.reviews.length > 0 ? { status: "complete" } : { status: "optional" };
  // Trust — bookingStats.completedBookings as a proxy.
  const trustRatio: { status: Status; remainder?: string } = p.bookingStats?.completedBookings && p.bookingStats.completedBookings > 0
    ? { status: "complete" }
    : { status: "partial", remainder: "Verify ID + payout" };

  const sections: SectionDef[] = [
    { id: "identity",      emoji: "👤", label: "Identity",       description: "Stage name · pronouns · gender · DOB. You control privacy per field.", ...identityRatio },
    { id: "services",      emoji: "🎯", label: "Services",       description: "Talent type, specialties, and what you're growing into.", ...servicesRatio },
    { id: "location",      emoji: "📍", label: "Location & travel", description: "Home base · cities you work · passport · driver's license.", ...locationRatio },
    { id: "media",         emoji: "📷", label: "Cover · headshot · reel", description: "Banner, main photo, hello reel, showreel.", ...mediaRatio },
    { id: "albums",        emoji: "🗂", label: "Portfolio albums", description: "Editorial · Lookbook · Behind-the-scenes · Personal.", ...albumsRatio },
    { id: "polaroids",     emoji: "🪪", label: "Polaroids",       description: "Front · side · back · smile · no-makeup. Casting standard.", ...polaroidsRatio },
    { id: "about",         emoji: "✏️", label: "Bio & links",     description: "Short bio per language. External links surface here too.", ...aboutRatio },
    { id: "details",       emoji: "📋", label: "Physical details", description: "Height · sizes · skin tone · tattoos · allergies.", ...detailsRatio },
    { id: "rates",         emoji: "💶", label: "Rates",           description: "Per-day / per-event rates. Different rates for direct, agency, hub.", ...ratesRatio },
    { id: "availability",  emoji: "📅", label: "Availability",    description: "Block dates, recurring patterns, vacation windows.", ...availabilityRatio },
    { id: "languages",     emoji: "🌐", label: "Languages",       description: "Languages spoken with proficiency level.", ...languagesRatio },
    { id: "refinement",    emoji: "✦",  label: "Skills",          description: "Movement · sport · voice · instruments. Triggers casting filters.", ...skillsRatio },
    { id: "credits",       emoji: "🏆", label: "Credits",         description: "Past campaigns, editorials, runway, lookbooks. Pin the proudest.", ...creditsRatio },
    { id: "limits",        emoji: "⊘",  label: "Wardrobe & limits", description: "Hard limits block pitches; soft limits ask first.", ...limitsRatio },
    { id: "files",         emoji: "📎", label: "Documents",       description: "W-8BEN · model release · NDA · certifications.", ...filesRatio },
    { id: "social_proof",  emoji: "⭐", label: "Past clients & reviews", description: "Logos of brands you've worked with + client kudos.", ...socialProofRatio },
    { id: "verifications", emoji: "🛡", label: "Trust & verification", description: "Email · phone · ID · payout. Drives your trust tier.", ...trustRatio },
    { id: "admin",         emoji: "🔒", label: "Visibility & privacy", description: "Where this profile shows. Field locks. Profile status.", status: "complete" },
  ];

  const statusMeta: Record<Status, { label: string; bg: string; fg: string }> = {
    complete: { label: "Complete", bg: COLORS.successSoft, fg: COLORS.successDeep ?? COLORS.success },
    partial:  { label: "In progress", bg: COLORS.amberSoft ?? "rgba(217,119,6,0.10)", fg: COLORS.amberDeep ?? COLORS.amber },
    empty:    { label: "Add",      bg: "rgba(176,48,58,0.08)", fg: COLORS.coralDeep ?? COLORS.coral },
    optional: { label: "Optional", bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted },
  };

  return (
    <div data-tulala-all-sections style={{
      display: "grid", gap: 10,
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    }}>
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-all-sections] { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {sections.map(s => {
        const meta = statusMeta[s.status];
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => openSection(s.id)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
              minWidth: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = "rgba(11,11,13,0.015)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.background = "#fff"; }}
          >
            <span aria-hidden style={{
              width: 36, height: 36, borderRadius: 10,
              background: COLORS.surfaceAlt,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, flexShrink: 0,
            }}>{s.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                marginBottom: 2,
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>{s.label}</span>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                  textTransform: "uppercase",
                  padding: "2px 7px", borderRadius: 999,
                  background: meta.bg, color: meta.fg,
                }}>{meta.label}</span>
              </div>
              <div style={{
                fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.45,
              }}>{s.description}</div>
              {s.remainder && (
                <div style={{
                  fontSize: 11, fontWeight: 600, color: meta.fg,
                  marginTop: 4,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  <span aria-hidden style={{ fontSize: 9 }}>›</span>
                  {s.remainder}
                </div>
              )}
            </div>
            <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
          </button>
        );
      })}
    </div>
  );
}

// ─── Hero (cover photo + headshot + identity strip) ─────────────────

function ProfileHero() {
  const { openDrawer } = useProto();
  // Same subscription as MyProfilePage so the hero (cover, name,
  // measurements row) reflects shell edits live.
  useProfileOverrideSubscription();
  const baseHero = applyProfileOverride("t1", getProfileById("t1"));
  // Catalog-driven completeness — keeps the hero percent in sync with
  // MyProfilePage.
  const compHero = computeProfileCompleteness(baseHero, [baseHero.primaryType, ...baseHero.secondaryTypes]);
  const p = {
    ...baseHero,
    completeness: compHero.percent,
    missing: compHero.missing.map(m => m.label),
  };
  // Same shell-funnel as MyProfilePage — every edit affordance lands
  // in the unified profile-shell drawer with mode "edit-self".
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: "t1", section });

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
      {/* Cover photo — handles real URLs (premium) AND emoji fallback. */}
      <div
        style={{
          position: "relative",
          height: 200,
          background: p.coverPhoto.startsWith("http")
            ? `url(${p.coverPhoto}) center/cover, ${COLORS.surfaceAlt}`
            : `linear-gradient(180deg, ${COLORS.surfaceAlt} 0%, rgba(15,79,62,0.18) 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 72,
          letterSpacing: 8,
        }}
      >
        {!p.coverPhoto.startsWith("http") && <span style={{ filter: "saturate(0.8)" }}>{p.coverPhoto}</span>}
        <button
          onClick={() => openSection("media")}
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
          onClick={() => openSection("media")}
          style={{
            position: "absolute",
            top: -52,
            left: 24,
            width: 104,
            height: 104,
            borderRadius: "50%",
            background: p.profilePhoto.startsWith("http")
              ? `url(${p.profilePhoto}) center/cover, ${COLORS.surfaceAlt}`
              : COLORS.surfaceAlt,
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
          {!p.profilePhoto.startsWith("http") && <span>{p.profilePhoto}</span>}
          <span
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: COLORS.fill,
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

/**
 * Premium engagement strip — replaces the 4-up StatusCard grid that
 * was eating ~600px on mobile (stacked tall cards). One white card,
 * 4 inline cells, hairline dividers. Mobile collapses 4→2x2.
 */
function EngagementStrip() {
  const p = MY_TALENT_PROFILE;
  const items = [
    { label: "Discover rank", value: `#${p.discoverRank}`, sub: "Updated daily", tone: COLORS.indigo },
    {
      label: "Views · 7d",
      value: p.profileViews7d.toLocaleString(),
      sub: `${p.viewsTrend > 0 ? "▲" : "▼"} ${Math.abs(p.viewsTrend)}% vs last week`,
      tone: p.viewsTrend > 0 ? COLORS.success : COLORS.amber,
    },
    { label: "Inquiries · 7d", value: String(p.inquiries7d), sub: `${p.bookingStats.repeatClients} repeat clients`, tone: COLORS.coral },
    { label: "On-time rate", value: `${p.bookingStats.onTimeRate}%`, sub: `${p.bookingStats.completedBookings} bookings`, tone: COLORS.success },
  ];
  return (
    <div data-tulala-talent-stat-strip style={{
      background: "#fff", borderRadius: 12,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
      display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      overflow: "hidden",
    }}>
      <style>{`
        @media (max-width: 640px) {
          [data-tulala-talent-stat-strip] { grid-template-columns: 1fr 1fr !important; }
          [data-tulala-talent-stat-strip] > div { border-bottom: 1px solid ${COLORS.borderSoft} !important; }
          [data-tulala-talent-stat-strip] > div:nth-last-child(-n+2) { border-bottom: none !important; }
          [data-tulala-talent-stat-strip] > div:nth-child(2n) { border-right: none !important; }
        }
      `}</style>
      {items.map((it, i) => (
        <div key={it.label} style={{
          padding: "12px 14px", fontFamily: FONTS.body,
          borderRight: i < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: it.tone }} />
            <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 500 }}>{it.label}</span>
          </div>
          <div style={{
            fontFamily: FONTS.display, fontSize: 22, fontWeight: 700,
            color: COLORS.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>{it.value}</div>
          {it.sub && (
            <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginTop: 4, lineHeight: 1.3 }}>{it.sub}</div>
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
    portfolio: { bg: COLORS.royal, fg: "#fff", border: COLORS.royal },
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
        background: requiredTier === "portfolio" ? COLORS.fill : COLORS.accentSoft,
        color: requiredTier === "portfolio" ? "#fff" : COLORS.accent,
        border: `1px solid ${requiredTier === "portfolio" ? COLORS.accent : "rgba(15,79,62,0.28)"}`,
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
    green: { bg: COLORS.successSoft, fg: COLORS.successDeep },
    amber: { bg: "rgba(82,96,109,0.12)", fg: COLORS.amberDeep },
    dim: { bg: "rgba(11,11,13,0.03)", fg: COLORS.inkMuted },
    red: { bg: COLORS.criticalSoft, fg: "#7A2026" },
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
                    color: limit.enforcement === "hard" ? "#7A2026" : COLORS.amberDeep,
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
    green: COLORS.successDeep,
    amber: COLORS.amberDeep,
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
            background: value >= 100 ? COLORS.green : COLORS.fill,
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
// MESSAGES — chat-first inquiry/booking surface
// ────────────────────────────────────────────────────────────────────
// Premium Messenger-style two-pane experience that absorbs the legacy
// Inbox. Conversation list on the left, full-bleed thread on the right.
//
// Design principles per product direction (2026-04-26):
//   1. Chat IS the inquiry/booking record. Every interaction lives in
//      one timeline.
//   2. Action items live INLINE in the chat as message bubbles
//      (rate input, transport pick, confirm). No separate panels.
//   3. Stage-aware visuals + permissions: Inquiry (open) / Booked
//      (locked-info, you see only your take-home) / Past (read-only).
//   4. Mobile-first sizing — built to feel native when wrapped as a
//      PWA / native quick-messenger.
//   5. Pinned info cards at the top of every thread: brief, location
//      with map link, transport, schedule, your rate, leader.
//   6. Rich content support: text, image, file, voice note, location
//      pin, calendar invite, contract sign-off, payment receipt,
//      polaroid request, system messages (stage transitions).
// ════════════════════════════════════════════════════════════════════

type MsgStage = "inquiry" | "hold" | "booked" | "past" | "cancelled";

export type Participant = {
  initials: string;
  name: string;
  role: string;
  /** Whether the participant is a Tulala talent (clickable → profile). */
  isTalent?: boolean;
};

/**
 * Where the inquiry came from — surfaced as a small chip in the header
 * so the talent knows who reached them and through which channel.
 *   - tulala-hub      → Tulala discovery / public roster
 *   - direct          → Client reached the agency or talent directly
 *   - agency-referral → Routed by another agency / coordinator
 *   - instagram-dm    → Inbound IG message (off-platform origin)
 *   - email           → Cold email
 */
export type ConvSource =
  | { kind: "tulala-hub"; label?: string }
  | { kind: "direct"; label?: string }
  | { kind: "agency-referral"; via?: string }
  | { kind: "instagram-dm" }
  | { kind: "email"; from?: string };

/** Outcome detail when stage = past or cancelled. Lets the UI tell the
 *  difference between "completed and paid" vs "client cancelled" vs
 *  "client never replied" vs "talent declined". */
export type ConvOutcome =
  | "completed"           // shoot wrapped, paid in full
  | "client_cancelled"    // client pulled out
  | "client_rejected"     // client rejected the offer / countered too low
  | "client_no_response"  // expired — client ghosted
  | "talent_declined"     // talent declined the inquiry
  | "agency_dropped";     // agency couldn't fulfill

export type Conversation = {
  id: string;
  client: string;
  clientInitials: string;
  clientTrust: import("./_state").ClientTrustLevel;
  brief: string;
  stage: MsgStage;
  agency: string;
  leader: { name: string; role: string; initials: string };
  /** Crew + other talents on this shoot. Surfaced on-demand via a
   *  thread-header chip; not forced into the always-visible UI. */
  participants?: Participant[];
  location?: string;
  date?: string;
  /** Talent's take-home — only set when booked. Hides full offer per spec. */
  amountToYou?: string;
  /** Last message preview line — for the conversation list rail. */
  lastMessage: { sender: "you" | "client" | "coordinator" | "agency" | "system" | "workspace"; preview: string; ageHrs: number };
  unreadCount: number;
  /** True when the current talent (Marta) is the coordinator on this
   *  job — runs her own workspace, talks to client directly, organizes
   *  other talents. Drives the talent_coord pov + tab visibility. */
  iAmCoordinator?: boolean;
  /** Where the inquiry came from. Surfaces as a chip in the header. */
  source?: ConvSource;
  /** Closure detail when stage is past or cancelled. */
  outcome?: ConvOutcome;
  /** Pinned info cards — what the coordinator/client/agency entered. */
  pinned: {
    transport?: string;
    schedule?: string;
    callTime?: string;
    rate?: { value: string; status: "you-quoted" | "client-budget" | "agreed" };
    coordinatorNote?: string;
    /** Extras pulled in for richer logistics on booked shoots. */
    hotel?: string;
    parking?: string;
  };
  /** True when the talent has never opened this conversation. Drives a
   *  distinct row tint + "NEW" pill so brand-new inquiries stand out
   *  visually from regular unread state. Defaults to true (already
   *  opened) when omitted, so existing seed data renders unchanged. */
  seen?: boolean;
};

export const MOCK_CONVERSATIONS: Conversation[] = [
  // ──────────────────────────────────────────────────────────────────
  // c1 — Mango · Spring lookbook · INQUIRY (non-coord, awaiting Marta's rate)
  // Source: Direct client of Acme Models. Verified client. Coordinator
  // is asking Marta for a quote — primary action surface.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c1",
    client: "Mango",
    clientInitials: "M",
    clientTrust: "verified",
    brief: "Spring lookbook",
    stage: "inquiry",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "direct", label: "Direct to Acme Models" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "CR", name: "Camille Roux", role: "Talent · Acme Models", isTalent: true },
      { initials: "JR", name: "João Ribeiro", role: "Photographer" },
      { initials: "LV", name: "Lia Varga", role: "Stylist · Mango in-house" },
      { initials: "AM", name: "Anaïs Moreau", role: "MUA" },
    ],
    location: "Madrid · Calle de Velázquez 18",
    date: "Wed, May 14",
    lastMessage: { sender: "coordinator", preview: "What's your rate for a 1-day Madrid shoot? Mango asking.", ageHrs: 5 },
    unreadCount: 2,
    pinned: {
      transport: "Taxi reimbursed (keep receipts) · Mango covers hotel night before",
      schedule: "May 14 · call 08:00 · wrap by 18:00",
      callTime: "08:00",
      rate: { value: "—", status: "you-quoted" },
      coordinatorNote: "Mango is keen — they liked your editorial reel. Pricing decision is yours; I'll close once we hear back from them.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c2 — Bvlgari · Jewelry campaign · HOLD (gold client, exclusive talent)
  // Source: Tulala Hub. Marta on hold while client decides — hold
  // deadline is the urgent action.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c2",
    client: "Bvlgari",
    clientInitials: "B",
    clientTrust: "gold",
    brief: "Editorial · jewelry campaign",
    stage: "hold",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "tulala-hub", label: "Tulala Hub · Discover" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "PM", name: "Paolo Marchetti", role: "Photographer" },
      { initials: "GS", name: "Giulia Sarti", role: "Stylist · Bvlgari in-house" },
    ],
    location: "Milan · TBC (likely Studio Verde)",
    date: "May 18–20",
    lastMessage: { sender: "client", preview: "Holding the dates — call sheet by Friday. Scope is jewelry close-ups + 1 lifestyle frame.", ageHrs: 18 },
    unreadCount: 1,
    pinned: {
      transport: "Driver from your hotel each day · car included",
      schedule: "May 18–20 · call 07:30 · 3 day shoot",
      callTime: "07:30",
      rate: { value: "€4,000–6,000", status: "client-budget" },
      coordinatorNote: "Hold is locked. Confirming budget when call sheet drops.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c3 — Vogue Italia · Editorial spread · BOOKED (gold, confirmed)
  // Source: Direct, long-standing relationship. Marta is set day +4 —
  // logistics, polaroids, contract are the focus now.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c3",
    client: "Vogue Italia",
    clientInitials: "VI",
    clientTrust: "gold",
    brief: "Editorial spread · 2 days",
    stage: "booked",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "direct", label: "Long-standing client" },
    leader: { name: "Ana Vega", role: "Coordinator · Acme Models", initials: "AV" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "ER", name: "Emma Ricci", role: "Talent · Praline London", isTalent: true },
      { initials: "MR", name: "Mario Rossi", role: "Photographer" },
      { initials: "FB", name: "Francesca Bianchi", role: "Creative director · Vogue" },
      { initials: "EL", name: "Elena Lombardi", role: "Fashion editor" },
      { initials: "AP", name: "Aaron Park", role: "MUA" },
    ],
    location: "Milan · Studio 5, Via Tortona 27",
    date: "May 14–15",
    amountToYou: "€3,200 (your take · paid 14d after wrap)",
    lastMessage: { sender: "coordinator", preview: "Call sheet attached. Hair/makeup at 06:30, on set 07:00. Confirm by EOD?", ageHrs: 4 },
    unreadCount: 1,
    pinned: {
      transport: "Bus pickup at 06:00 from your hotel · driver Marco · WhatsApp +39 333 111 2222",
      schedule: "May 14 · call 07:00 · wrap by 19:00 · May 15 · call 08:00 · wrap by 17:00",
      callTime: "07:00",
      rate: { value: "—", status: "agreed" },
      hotel: "Magna Pars Suites · walk to studio · check-in May 13",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c4 — Stella McCartney · Lookbook · CANCELLED (client cancelled)
  // Source: Agency referral. Was a hold — got cancelled when Stella
  // shifted the campaign to next quarter. Outcome captured.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c4",
    client: "Stella McCartney",
    clientInitials: "SM",
    clientTrust: "verified",
    brief: "Lookbook · single day",
    stage: "cancelled",
    outcome: "client_cancelled",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "agency-referral", via: "Praline London (sister agency)" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "JD", name: "Julien Dubois", role: "Photographer" },
      { initials: "AB", name: "Anna Bernard", role: "Stylist · Stella in-house" },
    ],
    location: "Paris · TBC",
    date: "May 14",
    lastMessage: { sender: "system", preview: "Stella McCartney cancelled — campaign moved to Q3. Hold released.", ageHrs: 36 },
    unreadCount: 0,
    pinned: {
      coordinatorNote: "Stella's team apologized — they're shifting their summer campaign to Q3 due to a designer change. They asked to keep you on the shortlist for Aug.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c5 — Loewe · Capsule editorial · WRAPPED (past, paid in full)
  // Source: Direct. Successful shoot, paid out, selects delivered.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c5",
    client: "Loewe",
    clientInitials: "L",
    clientTrust: "gold",
    brief: "Capsule editorial · 2 talent · 1 day",
    stage: "past",
    outcome: "completed",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "direct", label: "Direct to Acme Models" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "LO", name: "Lucia Ortiz", role: "Talent · Acme Models", isTalent: true },
      { initials: "DA", name: "Diego Álvarez", role: "Photographer" },
      { initials: "RC", name: "Rocío Castro", role: "Art director · Loewe" },
      { initials: "AM", name: "Anaïs Moreau", role: "MUA" },
    ],
    location: "Madrid · ESTUDIO ROCA",
    date: "Apr 18",
    amountToYou: "€3,600 (paid Apr 25 via transfer)",
    lastMessage: { sender: "system", preview: "Booking wrapped. Selects shared. Paid in full.", ageHrs: 168 },
    unreadCount: 0,
    pinned: {
      transport: "Drove yourself · €120 fuel + tolls reimbursed",
      schedule: "Apr 18 · call 09:00 · wrap by 16:30",
      rate: { value: "—", status: "agreed" },
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c6 — Martina Beach Club · Sunday models series · INQUIRY (host job)
  // Source: Tulala Hub (new client). Verified. Brief just landed —
  // primary action is Marta's rate.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c6",
    client: "Martina Beach Club & Restaurant",
    clientInitials: "MB",
    clientTrust: "verified",
    brief: "Sunday models · summer pool series",
    stage: "inquiry",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "tulala-hub", label: "Tulala Hub · Hospitality vertical" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "JT", name: "Julia Tenes", role: "Photographer" },
      { initials: "RA", name: "Rafa Aragón", role: "Creative director · Martina" },
    ],
    location: "Tulum · Beach Club lobby",
    date: "Sun, Jun 8",
    lastMessage: { sender: "coordinator", preview: "Brief just landed — they want a sunset series. €2,800/day plus hotel. Open?", ageHrs: 1 },
    unreadCount: 3,
    pinned: {
      transport: "Hotel covered (1 night) · Uber to set reimbursed",
      schedule: "Jun 8 · call 14:00 · golden hour shoot · wrap by 21:00",
      callTime: "14:00",
      coordinatorNote: "Martina is a new client but the GM is a friend of the agency — let's make this a great first impression.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c7 — Solstice Festival · Fire dance closing · BOOKED — Marta is
  // the COORDINATOR. She runs her own free workspace ("Reyes Movement
  // Studio"), invited Cleo Vega as co-coordinator. 3 fire dancers
  // booked for the festival closing performance.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c7",
    client: "Solstice Festival · Production Co.",
    clientInitials: "SF",
    clientTrust: "silver",
    brief: "Fire dance · festival closing performance",
    stage: "booked",
    agency: "Reyes Movement Studio",
    iAmCoordinator: true,
    source: { kind: "direct", label: "Direct via your portfolio" },
    leader: { name: "Marta Reyes", role: "Coordinator · Reyes Movement Studio", initials: "MR" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Coordinator + Talent", isTalent: true },
      { initials: "CV", name: "Cleo Vega", role: "Co-coordinator · invited" },
      { initials: "TJ", name: "Tariq Joubert", role: "Fire dancer", isTalent: true },
      { initials: "AN", name: "Anouk Naseri", role: "Fire dancer", isTalent: true },
      { initials: "JL", name: "Joaquín Lima", role: "Stage manager · Solstice" },
      { initials: "BV", name: "Bea Velasco", role: "Producer · Solstice" },
    ],
    location: "Ibiza · Cala Llonga main stage",
    date: "Sat, Jun 21",
    amountToYou: "€2,400 (your dancer fee · plus 12% agency margin to your studio)",
    lastMessage: { sender: "client", preview: "Confirmed insurance & rider. Need updated bios + portrait shots for the program by Jun 14.", ageHrs: 2 },
    unreadCount: 4,
    pinned: {
      transport: "Boat transfer from Marina Botafoch · 18:00 · group ride · driver Iván",
      schedule: "Jun 21 · sound check 19:00 · stage 22:30 · 8 min set",
      callTime: "19:00",
      rate: { value: "—", status: "agreed" },
      hotel: "Hostal del Mar · 2 nights · check-in Jun 20",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c8 — Adidas · Dance commercial spec · CANCELLED (client rejected)
  // Source: Tulala Hub. Client wanted lower rate, agency held firm,
  // client went elsewhere. Outcome captured.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c8",
    client: "Adidas Originals · Spec dance reel",
    clientInitials: "AO",
    clientTrust: "verified",
    brief: "Dance commercial spec · 1 day",
    stage: "cancelled",
    outcome: "client_rejected",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "tulala-hub", label: "Tulala Hub · Featured dancers" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "RV", name: "Riku Vesa", role: "Director" },
    ],
    location: "Berlin · Holzmarkt",
    date: "Apr 30",
    lastMessage: { sender: "system", preview: "Adidas declined the v3 counter — their max was €1,400 + buyout. Closed.", ageHrs: 96 },
    unreadCount: 0,
    pinned: {
      rate: { value: "€2,400 → countered to €1,800 → declined", status: "agreed" },
      coordinatorNote: "We held the line at €1,800 — their counter at €1,400 was too low for the usage scope (12-month global). They went with another agency. Worth keeping their producer on file.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c9 — Lyra Skincare · Pop-up launch · CANCELLED (client ghosted)
  // Source: Email cold inbound. Client never responded after offer
  // was sent. Auto-expired after 14 days.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c9",
    client: "Lyra Skincare · Pop-up launch event",
    clientInitials: "LS",
    clientTrust: "basic",
    brief: "Hostess · product launch · 4 hours",
    stage: "cancelled",
    outcome: "client_no_response",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "email", from: "events@lyraskincare.com" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
    ],
    location: "Barcelona · Passeig de Gràcia (TBC)",
    date: "May 22",
    lastMessage: { sender: "system", preview: "Inquiry expired — no client response in 14 days. Auto-closed.", ageHrs: 240 },
    unreadCount: 0,
    pinned: {
      coordinatorNote: "Cold inbound — they reached out unverified. Sent a v1 offer at €600 for 4h. Heard nothing back. Common with first-time event clients.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c10 — Atelier Noir · Bridal campaign · BOOKED — Marta is the
  // COORDINATOR (her own workspace). NDA workflow: client sent NDA,
  // Marta organized the dancer team to sign and uploaded back to
  // Files. Real "dispatch the team" coordinator pattern.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c10",
    client: "Atelier Noir Bridal Collective",
    clientInitials: "AN",
    clientTrust: "gold",
    brief: "Bridal SS27 campaign · 2 talent · 2 days",
    stage: "booked",
    agency: "Reyes Movement Studio",
    iAmCoordinator: true,
    source: { kind: "direct", label: "Returning workspace client" },
    leader: { name: "Marta Reyes", role: "Coordinator · Reyes Movement Studio", initials: "MR" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Coordinator + Talent", isTalent: true },
      { initials: "NK", name: "Nadia Köhler", role: "Talent · Reyes Movement Studio", isTalent: true },
      { initials: "ES", name: "Elise Sandoval", role: "Photographer" },
      { initials: "VM", name: "Valeria Moss", role: "Creative director · Atelier Noir" },
      { initials: "HB", name: "Henrietta Bloom", role: "Wardrobe · Atelier Noir" },
    ],
    location: "Lisbon · Convento da Cartuxa",
    date: "Jul 4–5",
    amountToYou: "€2,800/day · 2 days · €5,600 total",
    lastMessage: { sender: "you", preview: "NDA + model release uploaded — all 2 talents signed. We're set for Lisbon.", ageHrs: 6 },
    unreadCount: 0,
    pinned: {
      transport: "Flights covered · BCN→LIS · group transfer to convento",
      schedule: "Jul 4 · call 06:30 · golden hour open · Jul 5 · indoor dawn light",
      callTime: "06:30",
      rate: { value: "—", status: "agreed" },
      hotel: "Pousada do Convento · check-in Jul 3 evening",
      coordinatorNote: "Returning client — Atelier shot with us last year. NDA stricter this time (couture pieces). All paperwork must clear before fitting.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c11 — Aesop · BRAND-NEW INQUIRY (just landed, never opened by Marta).
  // Tulala Hub direct, beauty/wellness vertical. seen: false drives the
  // "NEW" tint + pill in the inbox row.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c11",
    client: "Aesop",
    clientInitials: "A",
    clientTrust: "verified",
    brief: "Beauty editorial · skincare campaign · 1 day",
    stage: "inquiry",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "tulala-hub", label: "Tulala Hub · Beauty vertical" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "HD", name: "Hilde Dorn", role: "Photographer" },
      { initials: "EI", name: "Eun-jin Im", role: "Creative director · Aesop" },
    ],
    location: "Berlin · TBC (likely Studio Mitte)",
    date: "Mon, May 26",
    lastMessage: { sender: "coordinator", preview: "Aesop just reached out — beauty editorial, single day, Berlin. Strong fit for your editorial reel. Open?", ageHrs: 0.4 },
    unreadCount: 2,
    seen: false,
    pinned: {
      schedule: "May 26 · single day · call TBC · 8h shoot",
      coordinatorNote: "Brand-new client via the Hub — Aesop's marketing team specifically asked for editorial-trained talent. Worth a strong yes.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c12 — Lacoste · BRAND-NEW INQUIRY (just landed, never opened).
  // Direct via Acme's roster page, sportswear lookbook, 2-day Lisbon.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c12",
    client: "Lacoste",
    clientInitials: "L",
    clientTrust: "silver",
    brief: "Lookbook · SS27 sportswear · 2 days",
    stage: "inquiry",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "direct", label: "Acme Models roster page" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "JR", name: "Joana Rivera", role: "Brand manager · Lacoste" },
      { initials: "PT", name: "Pedro Teixeira", role: "Photographer" },
    ],
    location: "Lisbon · Belém riverside",
    date: "Jun 3–4",
    lastMessage: { sender: "client", preview: "Saw your Mango lookbook — would love to put you on our SS27 shortlist. 2-day Lisbon, June. Open to a chat?", ageHrs: 0.15 },
    unreadCount: 3,
    seen: false,
    pinned: {
      schedule: "Jun 3–4 · 2 days · call TBC",
      coordinatorNote: "Lacoste came in directly via the roster page — first inbound from them in 18 months. Quote at the top of your range; they came pre-qualified.",
    },
  },
];

// ════════════════════════════════════════════════════════════════════
// Client-side mock conversations
//
// The client surface impersonates a single brand at a time (configured
// via clientProfile = "martina" | "gringo"). Each profile gets its own
// portfolio of projects — what THEY commissioned, not the agency or
// talent's full inbox.
//
// Where the talent or admin see "Mango / Bvlgari / Vogue Italia" jobs,
// a client (e.g. "Martina") sees only Martina's own commissioned work.
// One inquiry reused as c6 (so threads stay consistent across talent +
// client roles), plus a handful of client-only projects across stages.
// ════════════════════════════════════════════════════════════════════

export const CLIENT_MOCK_CONVERSATIONS_BY_PROFILE: Record<string, Conversation[]> = {
  martina: [
    // m1 — Sunday Models pool series (active inquiry — same job Marta
    // sees as c6, but framed from Martina's POV: she's the client who
    // briefed it). Different conv id so threads don't collide.
    {
      id: "m1",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Sunday models · summer pool series",
      stage: "inquiry",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "tulala-hub", label: "Tulala Hub · Hospitality vertical" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
        { initials: "JT", name: "Julia Tenes", role: "Photographer" },
      ],
      location: "Tulum · Beach Club lobby",
      date: "Sun, Jun 8",
      lastMessage: { sender: "coordinator", preview: "Sara: Sending you Marta's polaroids + 2 alternates today.", ageHrs: 1 },
      unreadCount: 2,
      pinned: {
        coordinatorNote: "Welcome — we'll handle talent + production end-to-end. You only see ${clientName} POV; lineup mechanics stay agency-side.",
      },
    },
    // m2 — Cocktail bar reopening (booked with a different agency)
    {
      id: "m2",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Cocktail bar reopening · 2 hosts · 4h evening",
      stage: "booked",
      agency: "Praline London",
      iAmCoordinator: false,
      source: { kind: "agency-referral", via: "Atelier Roma" },
      leader: { name: "Theo Marsh", role: "Coordinator · Praline London", initials: "TM" },
      participants: [
        { initials: "ZA", name: "Zara Habib", role: "Talent · Praline London", isTalent: true },
        { initials: "TN", name: "Tomás Navarro", role: "Talent · Praline London", isTalent: true },
        { initials: "VS", name: "Vincenzo Sera", role: "Bar manager · Martina" },
      ],
      location: "Tulum · Lobby bar",
      date: "Fri, Jun 13",
      amountToYou: "€1,800 (paid via card on file)",
      lastMessage: { sender: "coordinator", preview: "Theo: Call sheet attached. Hosts arrive at 18:30 · uniform from your wardrobe team.", ageHrs: 6 },
      unreadCount: 1,
      pinned: {
        schedule: "Jun 13 · 19:00–23:00 · floor + meet-and-greet",
        callTime: "18:30",
        coordinatorNote: "Both hosts have served at hospitality events for us before. They know Tulum hours.",
      },
    },
    // m3 — Influencer takeover weekend (wrapped, paid)
    {
      id: "m3",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Influencer takeover · 3 creators · weekend",
      stage: "past",
      outcome: "completed",
      agency: "Self-managed",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Lucia Ortiz", role: "Influencer manager · Self-managed", initials: "LO" },
      participants: [
        { initials: "LO", name: "Lucia Ortiz", role: "Creator", isTalent: true },
        { initials: "DA", name: "Diego Álvarez", role: "Creator", isTalent: true },
        { initials: "CR", name: "Camille Roux", role: "Creator", isTalent: true },
      ],
      location: "Tulum · Pool deck + bar",
      date: "May 10–11",
      amountToYou: "€4,200 (paid May 18 via transfer)",
      lastMessage: { sender: "system", preview: "Wrapped · 47 posts published · paid in full.", ageHrs: 480 },
      unreadCount: 0,
      pinned: {
        schedule: "May 10–11 · open weekend · creators set their own pace",
      },
    },
    // m4 — Fire dancer act for closing party (HOLD — pending decision)
    {
      id: "m4",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Fire dance act · summer closing party",
      stage: "hold",
      agency: "Reyes Movement Studio",
      iAmCoordinator: false,
      source: { kind: "direct", label: "Direct via portfolio" },
      leader: { name: "Marta Reyes", role: "Coordinator · Reyes Movement Studio", initials: "MR" },
      participants: [
        { initials: "MR", name: "Marta Reyes", role: "Coordinator + Talent", isTalent: true },
        { initials: "TJ", name: "Tariq Joubert", role: "Fire dancer", isTalent: true },
        { initials: "AN", name: "Anouk Naseri", role: "Fire dancer", isTalent: true },
      ],
      location: "Tulum · Beach Club main deck",
      date: "Sat, Sep 6",
      lastMessage: { sender: "coordinator", preview: "Marta: Holding Sep 6 for you. Need a yes by Friday so we can lock the dancers' calendars.", ageHrs: 26 },
      unreadCount: 1,
      pinned: {
        rate: { value: "€7,500 total · 3 dancers · 12-min set", status: "client-budget" },
        coordinatorNote: "Same crew as Solstice Festival closing. Insurance + rider already cleared with Solstice — we can reuse for you.",
      },
    },
    // m5 — Press launch hostess (CANCELLED — client had to pull)
    {
      id: "m5",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Press launch · 2 hostesses · single evening",
      stage: "cancelled",
      outcome: "client_cancelled",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "tulala-hub", label: "Tulala Hub · Hospitality vertical" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
        { initials: "ZH", name: "Zara Habib", role: "Talent · Praline London", isTalent: true },
      ],
      location: "Mexico City · Roma Norte popup",
      date: "Apr 28",
      lastMessage: { sender: "you", preview: "You: Cancelling the launch — venue pulled out. Will reach out for the next one.", ageHrs: 192 },
      unreadCount: 0,
      pinned: {
        coordinatorNote: "Cancelled with 2 weeks' notice — Acme waived the cancellation fee per our 8-bookings relationship.",
      },
    },
    // m6 — BRAND-NEW INQUIRY (just landed). Annual photoshoot for the
    // restaurant's print campaign. Demonstrates the NEW pill + coral
    // wash on the client inbox row + first inquiry from this agency.
    {
      id: "m6",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Annual print campaign · food + lifestyle · 2 days",
      stage: "inquiry",
      agency: "Acme Models",
      iAmCoordinator: false,
      source: { kind: "direct", label: "Direct via Acme Models site" },
      leader: { name: "Diego Figueroa", role: "Coordinator · Acme Models", initials: "DF" },
      participants: [
        { initials: "JT", name: "Julia Tenes", role: "Photographer (proposed)" },
      ],
      location: "Tulum · Beach Club deck + private dining room",
      date: "Aug 18–19",
      lastMessage: { sender: "coordinator", preview: "Diego: Your annual campaign brief just landed — proposing 2 talent + photographer for Aug 18–19. Range is comfortable. I'll send a shortlist + budget by EOD.", ageHrs: 0.4 },
      unreadCount: 2,
      seen: false,
      pinned: {
        coordinatorNote: "Brand-new agency relationship for you — Acme came in via your annual print campaign brief. Strong roster + production team in Tulum already.",
      },
    },
    // m7 — BRAND-NEW INQUIRY (referral, just landed). Smaller event
    // booking through a friend agency. Two unseen rows in the inbox
    // shows the NEW-on-top sort working.
    {
      id: "m7",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Tequila tasting · brand activation · 1 evening",
      stage: "inquiry",
      agency: "Praline London",
      iAmCoordinator: false,
      source: { kind: "agency-referral", via: "Atelier Roma" },
      leader: { name: "Theo Marsh", role: "Coordinator · Praline London", initials: "TM" },
      participants: [],
      location: "Tulum · Lobby bar + courtyard",
      date: "Wed, Aug 6",
      lastMessage: { sender: "coordinator", preview: "Theo: Atelier Roma referred you — we have 3 hostesses available for your Tequila Olmeca activation. Budget €1,800 total · 4h evening. Sending profiles now.", ageHrs: 0.2 },
      unreadCount: 1,
      seen: false,
      pinned: {
        coordinatorNote: "Praline London is Atelier Roma's UK partner. They handle our Europe-tier brand activations.",
      },
    },
    // m8 — IN FLIGHT (offer pending). Demonstrates the "needs you"
    // action flag on the inbox row + Approve flow inside the project tab.
    {
      id: "m8",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Sunset wedding feature · couple shoot · 4h",
      stage: "hold",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "direct", label: "Direct via Atelier Roma" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "ER", name: "Emma Ricci", role: "Talent · Praline London", isTalent: true },
        { initials: "JR", name: "João Ribeiro", role: "Photographer" },
      ],
      location: "Tulum · Cenote + pool deck",
      date: "Sat, Jul 19",
      lastMessage: { sender: "coordinator", preview: "Sara: Offer ready — €4,200 for the talent + photographer + retouching. Approve below to lock the date.", ageHrs: 5 },
      unreadCount: 1,
      pinned: {
        rate: { value: "€4,200 total · 4h shoot · talent + photographer + retouch", status: "client-budget" },
        coordinatorNote: "Atelier Roma's standard couple-shoot package. Emma has shot here twice before — knows the cenote light.",
      },
    },
  ],

  gringo: [
    // g1 — Birthday yacht charter (active inquiry)
    {
      id: "g1",
      client: "The Gringo",
      clientInitials: "TG",
      clientTrust: "basic",
      brief: "Birthday charter · 4 hostesses · day-trip yacht",
      stage: "inquiry",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      ],
      location: "Ibiza · Marina Botafoch",
      date: "Sat, Jul 26",
      lastMessage: { sender: "coordinator", preview: "Sara: Verification pending — once funded the deal moves fast. Confirm card on file?", ageHrs: 4 },
      unreadCount: 2,
      pinned: {
        coordinatorNote: "Personal client (Basic trust). Marta's contact policy is set to allow Basic-tier with verified card. Card upload + identity check is the unlock.",
      },
    },
    // g2 — Past dinner party (one wrapped)
    {
      id: "g2",
      client: "The Gringo",
      clientInitials: "TG",
      clientTrust: "basic",
      brief: "Private dinner · 2 hostesses · 3h",
      stage: "past",
      outcome: "completed",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "ZA", name: "Zara Habib", role: "Talent · Praline London", isTalent: true },
        { initials: "AN", name: "Anouk Naseri", role: "Talent · Acme Models", isTalent: true },
      ],
      location: "Ibiza · Private villa",
      date: "Mar 15",
      amountToYou: "€1,200 (paid Mar 20 via card)",
      lastMessage: { sender: "system", preview: "Wrapped · paid in full.", ageHrs: 1200 },
      unreadCount: 0,
      pinned: {
        coordinatorNote: "Smooth booking. Both talents reported a good experience — green-light for repeat bookings.",
      },
    },
    // g3 — BRAND-NEW INQUIRY (just landed). Spontaneous request via
    // Instagram DM — most realistic Gringo-style channel. Tests the
    // NEW pill on a Basic-trust client (still gates on verification).
    {
      id: "g3",
      client: "The Gringo",
      clientInitials: "TG",
      clientTrust: "basic",
      brief: "Pool party · 6 hostesses · Saturday afternoon",
      stage: "inquiry",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [],
      location: "Ibiza · Hotel Eden private pool",
      date: "Sat, Aug 9",
      lastMessage: { sender: "coordinator", preview: "Sara: Pool party brief landed via your DM. 6 hostesses · 4h afternoon. Need card on file before we can shortlist (Basic-trust standard).", ageHrs: 0.5 },
      unreadCount: 2,
      seen: false,
      pinned: {
        coordinatorNote: "Personal client — verify card before sending profiles. Standard 50% deposit on confirmation, balance on the day.",
      },
    },
    // g4 — IN FLIGHT (booked, awaiting card-on-file balance). Booked
    // via past-relationship trust but balance still owing.
    {
      id: "g4",
      client: "The Gringo",
      clientInitials: "TG",
      clientTrust: "basic",
      brief: "Sunset boat trip · 3 hostesses · 5h evening",
      stage: "booked",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "ZA", name: "Zara Habib", role: "Talent · Praline London", isTalent: true },
        { initials: "AN", name: "Anouk Naseri", role: "Talent · Acme Models", isTalent: true },
        { initials: "LO", name: "Lucia Ortiz", role: "Talent · Self-managed", isTalent: true },
      ],
      location: "Ibiza · Marina Botafoch → Cala Llonga",
      date: "Sat, Jul 12",
      amountToYou: "€2,400 booked · €1,200 balance owed",
      lastMessage: { sender: "coordinator", preview: "Sara: Booking locked. Deposit cleared. Balance €1,200 due 48h before sail.", ageHrs: 22 },
      unreadCount: 1,
      pinned: {
        callTime: "17:00 (board) · 22:00 (return)",
        schedule: "Jul 12 · 17:00 board · 18:00 sail · 21:30 return to marina",
        rate: { value: "€2,400 total · paid 50% deposit · €1,200 balance", status: "agreed" },
        coordinatorNote: "Captain Iván briefed — 3 hostesses on the upper deck, dinner served at sunset.",
      },
    },
  ],
};

export type Msg =
  | { id: string; kind: "text"; sender: ConvSender; body: string; ts: string; readBy?: ConvSender[] }
  | { id: string; kind: "image"; sender: ConvSender; caption?: string; count: number; ts: string }
  | { id: string; kind: "file"; sender: ConvSender; filename: string; sizeKB: number; ts: string }
  | { id: string; kind: "voice"; sender: ConvSender; durationSec: number; transcript?: string; ts: string }
  | { id: string; kind: "location"; sender: ConvSender; label: string; ts: string }
  | { id: string; kind: "system"; body: string; ts: string }
  | { id: string; kind: "action-rate"; ts: string; resolved?: string }
  | { id: string; kind: "action-transport"; ts: string; options: string[]; resolved?: string }
  | { id: string; kind: "action-confirm"; label: string; ts: string; resolved?: boolean }
  | { id: string; kind: "calendar-invite"; ts: string; title: string; date: string; resolved?: "yes" | "no" }
  | { id: string; kind: "contract-sign"; ts: string; filename: string; resolved?: boolean }
  | { id: string; kind: "polaroid-request"; ts: string; resolved?: number }
  | { id: string; kind: "payment-receipt"; ts: string; amount: string; method: string };

// "workspace" = the System User. Represents the workspace itself
// (Atelier Roma, Acme Models, etc.) rather than any individual member.
// Used for system-routed messages (booking confirmations, reassign
// events, automated nudges) and for outbound posts a coordinator
// chooses to send "as the workspace" rather than as themselves.
// Renders with the workspace logo + name in chat bubbles, gives
// agencies a coherent voice across coordinator handoffs.
type ConvSender = "you" | "client" | "coordinator" | "agency" | "workspace";

export const MOCK_THREAD: Record<string, Msg[]> = {
  c1: [
    { id: "c1m1", kind: "system", body: "Inquiry created · routed to Acme Models", ts: "Apr 28 · 10:14" },
    { id: "c1m1a", kind: "text", sender: "workspace", body: "Acme Models received the brief. Sara's pulling editorial talent + will be back to you within the day.", ts: "Apr 28 · 10:14", readBy: ["you"] },
    { id: "c1m2", kind: "text", sender: "coordinator", body: "Hi Marta — Mango is briefing for a Spring lookbook in Madrid. Single day, May 14. Editorial energy, less commercial. Are you open?", ts: "Apr 28 · 10:18", readBy: ["you"] },
    { id: "c1m3", kind: "image", sender: "coordinator", caption: "Mood board — what they sent us.", count: 4, ts: "Apr 28 · 10:19" },
    { id: "c1m4", kind: "text", sender: "you", body: "Yes, I'm open on May 14. Looks beautiful — happy to do this.", ts: "Apr 28 · 11:02", readBy: ["coordinator"] },
    { id: "c1m5", kind: "text", sender: "coordinator", body: "Great. Mango's asking for your rate. Single day, full usage (web + social, 12 months, EU). Lunch + transport included.", ts: "Apr 28 · 14:30", readBy: ["you"] },
    { id: "c1m6", kind: "action-rate", ts: "Apr 28 · 14:31" },
  ],
  c2: [
    { id: "c2m1", kind: "system", body: "Hold opened · May 18–20 · Bvlgari", ts: "Apr 26 · 09:00" },
    { id: "c2m1a", kind: "text", sender: "workspace", body: "Acme Models is holding May 18–20 for you. Bvlgari has a 48h window to confirm — we'll keep you posted on this thread.", ts: "Apr 26 · 09:00", readBy: ["you"] },
    { id: "c2m2", kind: "text", sender: "client", body: "Holding May 18–20 for Marta. Editorial · jewelry close-ups + 1 lifestyle frame. Budget €4–6k for 3 days, depending on usage.", ts: "Apr 26 · 09:02", readBy: ["coordinator", "you"] },
    { id: "c2m3", kind: "calendar-invite", ts: "Apr 26 · 09:03", title: "Bvlgari · Editorial (Hold)", date: "May 18–20" },
    { id: "c2m4", kind: "voice", sender: "coordinator", durationSec: 22, transcript: "Bvlgari are great to work with — long-time client. They'll lock by Friday. I'd quote at the top of their range, you've worked editorial volume before.", ts: "Apr 26 · 09:30" },
    { id: "c2m5", kind: "text", sender: "you", body: "Sounds good. Let's see the call sheet then I'll quote.", ts: "Apr 26 · 11:14", readBy: ["coordinator"] },
    { id: "c2m6", kind: "text", sender: "client", body: "Holding the dates — call sheet by Friday. Scope is jewelry close-ups + 1 lifestyle frame.", ts: "Yesterday · 16:42" },
  ],
  c3: [
    { id: "c3m1", kind: "system", body: "Booking confirmed · May 14–15 · Vogue Italia", ts: "Apr 12 · 14:00" },
    // System User-attributed booking confirmation. Coordinator handoffs
    // shouldn't break the agency's voice — when Acme Models confirms a
    // booking, the message reads as the workspace, not the individual.
    { id: "c3m1a", kind: "text", sender: "workspace", body: "Acme Models confirmed your booking with Vogue Italia. You'll see contract + call sheet land in this thread — we're across both ends.", ts: "Apr 12 · 14:00", readBy: ["you"] },
    { id: "c3m2", kind: "text", sender: "coordinator", body: "Booked! Two days at Studio 5 in Milan. Locked rate, locked usage. You're seeing your take-home only — full offer is between Vogue and us.", ts: "Apr 12 · 14:01", readBy: ["you"] },
    { id: "c3m3", kind: "contract-sign", ts: "Apr 12 · 14:02", filename: "Vogue_Italia_Editorial_May14-15.pdf", resolved: true },
    { id: "c3m4", kind: "text", sender: "you", body: "Signed and sent. Excited for this one.", ts: "Apr 12 · 17:48", readBy: ["coordinator"] },
    { id: "c3m5", kind: "text", sender: "coordinator", body: "Polaroids by Friday so the team can pre-approve the look. Any haircolor/length change since the last shoot?", ts: "Apr 13 · 10:14", readBy: ["you"] },
    { id: "c3m6", kind: "polaroid-request", ts: "Apr 14 · 09:00", resolved: 6 },
    { id: "c3m7", kind: "text", sender: "you", body: "Just sent 6 polaroids. Hair is the same length, slightly cooler tone after the Loewe shoot.", ts: "Apr 14 · 09:02", readBy: ["coordinator"] },
    { id: "c3m8", kind: "text", sender: "coordinator", body: "Perfect. Vogue approved the look — they're cool with the cooler tone, suits the wardrobe better.", ts: "Apr 14 · 14:30", readBy: ["you"] },
    { id: "c3m9", kind: "image", sender: "coordinator", caption: "Wardrobe direction from Francesca (Vogue Creative Director) — 12 looks across 2 days.", count: 8, ts: "Apr 22 · 11:20" },
    { id: "c3m10", kind: "text", sender: "coordinator", body: "Heads-up — Day 2 wraps later than expected. Vogue added a beach scene at golden hour. Wrap pushed to 19:00.", ts: "Apr 28 · 16:45", readBy: ["you"] },
    { id: "c3m11", kind: "text", sender: "you", body: "Got it. I'll move my flight to Friday morning then.", ts: "Apr 28 · 17:05", readBy: ["coordinator"] },
    { id: "c3m12", kind: "calendar-invite", ts: "Apr 30 · 10:00", title: "Vogue Italia · Editorial · Day 1", date: "May 14 · 07:00–19:00", resolved: "yes" },
    { id: "c3m13", kind: "calendar-invite", ts: "Apr 30 · 10:00", title: "Vogue Italia · Editorial · Day 2", date: "May 15 · 08:00–17:00", resolved: "yes" },
    { id: "c3m14", kind: "location", sender: "coordinator", label: "Studio 5 · Via Tortona 27, Milan", ts: "May 1 · 11:00" },
    { id: "c3m15", kind: "text", sender: "coordinator", body: "Travel: Vogue's covering the hotel (Magna Pars, walking distance from Studio 5). Train tickets Madrid→Milan Friday — booked under your name. I'll forward the confirmation.", ts: "May 5 · 09:30", readBy: ["you"] },
    { id: "c3m16", kind: "file", sender: "coordinator", filename: "Train_Madrid_Milan_May13.pdf", sizeKB: 184, ts: "May 5 · 09:31" },
    { id: "c3m17", kind: "file", sender: "coordinator", filename: "Hotel_Magna_Pars_confirmation.pdf", sizeKB: 96, ts: "May 5 · 09:32" },
    { id: "c3m18", kind: "text", sender: "you", body: "Both received. Thanks Ana.", ts: "May 5 · 12:18", readBy: ["coordinator"] },
    { id: "c3m19", kind: "text", sender: "coordinator", body: "Tomorrow's the day. Driver Marco picks you up at 06:00 from the hotel — he has your number. WhatsApp him if anything changes.", ts: "May 13 · 18:40", readBy: ["you"] },
    { id: "c3m20", kind: "file", sender: "coordinator", filename: "Vogue_callsheet_v2.pdf", sizeKB: 412, ts: "5h ago" },
    { id: "c3m21", kind: "text", sender: "coordinator", body: "Final call sheet attached. Hair/makeup at 06:30, on set 07:00. Confirm by EOD?", ts: "5h ago" },
    { id: "c3m22", kind: "action-confirm", label: "Confirm call sheet", ts: "5h ago" },
  ],
  // c4 — Stella McCartney CANCELLED (client cancelled the campaign)
  c4: [
    { id: "c4m1", kind: "system", body: "Hold opened · May 14 · Stella McCartney lookbook · referred by Praline London", ts: "Apr 18 · 10:00" },
    { id: "c4m2", kind: "text", sender: "client", body: "Hi all — holding May 14 in Paris for the SS27 lookbook. Single day. Will lock by next Wednesday.", ts: "Apr 18 · 10:04", readBy: ["coordinator", "you"] },
    { id: "c4m3", kind: "text", sender: "you", body: "Held. Lookbook scope is comfortable for me — happy to confirm once dates lock.", ts: "Apr 18 · 11:30", readBy: ["coordinator"] },
    { id: "c4m4", kind: "text", sender: "coordinator", body: "Stella's team is working through wardrobe + creative direction this week. We'll know by Wednesday.", ts: "Apr 22 · 09:18", readBy: ["you"] },
    { id: "c4m5", kind: "system", body: "Stella McCartney cancelled — campaign moved to Q3. Hold released.", ts: "1d 12h ago" },
    { id: "c4m6", kind: "text", sender: "coordinator", body: "Bad news — Stella's just shifted the SS27 campaign to Q3 (designer change). They asked us to keep you on the shortlist for August. Will re-engage when they have firm dates.", ts: "1d 12h ago" },
    { id: "c4m7", kind: "text", sender: "you", body: "Disappointing but understood. Thanks for the heads-up — let me know in August.", ts: "1d 11h ago", readBy: ["coordinator"] },
  ],

  // c6 — Martina Beach Club INQUIRY (new client via Tulala Hub)
  c6: [
    { id: "c6m1", kind: "system", body: "Inquiry created · via Tulala Hub · Hospitality vertical", ts: "1h ago" },
    { id: "c6m2", kind: "text", sender: "coordinator", body: "Hi Marta — new client just reached out via the Hub: Martina Beach Club & Restaurant in Tulum. They're launching a 'Sunday models' summer pool series. 4 dates over 2 months — this Sunday Jun 8 is the first.", ts: "1h ago" },
    { id: "c6m3", kind: "image", sender: "coordinator", caption: "Reference looks they sent — relaxed swimwear, sunset golden hour.", count: 5, ts: "1h ago" },
    { id: "c6m4", kind: "text", sender: "coordinator", body: "Brief just landed — they want a sunset series. €2,800/day plus hotel. Open?", ts: "1h ago" },
    { id: "c6m5", kind: "action-rate", ts: "1h ago" },
  ],

  // c5 — Loewe WRAPPED (paid in full)
  c5: [
    { id: "c5m1", kind: "system", body: "Booking confirmed · Apr 18 · Loewe", ts: "Apr 8 · 11:00" },
    { id: "c5m1a", kind: "text", sender: "workspace", body: "Acme Models confirmed your Loewe booking. Diego is your contact for the day; we're handling the invoice.", ts: "Apr 8 · 11:00", readBy: ["you"] },
    { id: "c5m2", kind: "text", sender: "coordinator", body: "Loewe Capsule editorial. 2 talent, 1 day, ESTUDIO ROCA. You drove yourself — fuel + tolls reimbursed.", ts: "Apr 8 · 11:02" },
    { id: "c5m3", kind: "text", sender: "you", body: "Set up smoothly. Diego was easy to work with — usual ESTUDIO ROCA setup.", ts: "Apr 18 · 17:00", readBy: ["coordinator"] },
    { id: "c5m4", kind: "system", body: "Wrapped · selects shared", ts: "Apr 18 · 17:30" },
    { id: "c5m5", kind: "image", sender: "coordinator", caption: "Loewe selects — final 4 frames they're using.", count: 4, ts: "Apr 22 · 14:00" },
    { id: "c5m6", kind: "text", sender: "coordinator", body: "Selects approved. Invoice cleared today — payout en route.", ts: "Apr 24 · 10:00", readBy: ["you"] },
    { id: "c5m7", kind: "payment-receipt", ts: "Apr 25 · 09:14", amount: "€3,600", method: "Transfer" },
  ],

  // c7 — Solstice Festival · Marta is COORDINATOR
  // Booking-team thread + a private client thread (Marta sees both).
  // Demonstrates: Marta invited Cleo Vega as co-coordinator; she's
  // organizing 3 fire dancers (including herself).
  "c7:talent": [
    { id: "c7tm1", kind: "system", body: "Crew booked · Cleo Vega added as co-coordinator", ts: "May 28 · 09:00" },
    { id: "c7tm2", kind: "text", sender: "coordinator", body: "Team — Solstice Festival closing performance is locked. Three dancers: me, Tariq, Anouk. Cleo is helping me coordinate. 8-min set, Sat Jun 21, Cala Llonga main stage.", ts: "May 28 · 09:05", readBy: ["you"] },
    { id: "c7tm3", kind: "text", sender: "you", body: "Boat transfer at 18:00 from Marina Botafoch — Iván is driving. Bring your usual kit + a backup costume. Production will provide fuel for the props.", ts: "May 28 · 09:08", readBy: ["coordinator"] },
    { id: "c7tm4", kind: "text", sender: "agency", body: "Tariq here — locked. I'll bring my poi + a backup pair.", ts: "May 28 · 11:42" },
    { id: "c7tm5", kind: "text", sender: "agency", body: "Anouk: confirmed. Choreo finalised — sending the music cue list tonight.", ts: "May 28 · 14:20" },
    { id: "c7tm6", kind: "file", sender: "agency", filename: "Solstice_set_cuelist.pdf", sizeKB: 142, ts: "May 28 · 22:14" },
    { id: "c7tm7", kind: "text", sender: "coordinator", body: "Got the cue list — uploading to Files. Cleo will run through it Friday afternoon at the rehearsal.", ts: "May 29 · 08:00", readBy: ["you"] },
    { id: "c7tm8", kind: "text", sender: "client", body: "Joaquín (stage manager) — need updated bios + portrait shots for the program. By Jun 14 please.", ts: "2h ago" },
    { id: "c7tm9", kind: "text", sender: "coordinator", body: "Sending out a request to the team — please drop your latest bio + a clean portrait into Files this week.", ts: "2h ago", readBy: ["you"] },
  ],
  "c7:client": [
    { id: "c7cm1", kind: "system", body: "Direct booking · via your portfolio site", ts: "May 25 · 11:00" },
    { id: "c7cm2", kind: "text", sender: "client", body: "Marta — Bea here from Solstice. Saw your reel and the fire-dance work. We need a 6–10 min closing performance, Sat Jun 21. Three dancers ideally. Budget €7,500 total.", ts: "May 25 · 11:04" },
    { id: "c7cm3", kind: "text", sender: "you", body: "Hi Bea — happy to put a crew together. €7,500 works for 3 dancers + my coordination. I'll have Tariq Joubert and Anouk Naseri locked in — both have festival closer experience.", ts: "May 25 · 12:30", readBy: ["client"] },
    { id: "c7cm4", kind: "text", sender: "client", body: "Perfect. Send me bios + 30s clips for each so I can clear them with the festival director.", ts: "May 25 · 14:00" },
    { id: "c7cm5", kind: "file", sender: "you", filename: "Solstice_crew_bios.pdf", sizeKB: 1840, ts: "May 26 · 18:20" },
    { id: "c7cm6", kind: "text", sender: "client", body: "Approved — locking the booking. Insurance + rider attached. Need updated bios + portrait shots for the program by Jun 14.", ts: "May 28 · 09:00" },
    { id: "c7cm7", kind: "file", sender: "client", filename: "Solstice_insurance_rider.pdf", sizeKB: 220, ts: "May 28 · 09:01" },
    { id: "c7cm8", kind: "text", sender: "you", body: "Got it. Crew is briefed — bios + portraits coming this week.", ts: "May 28 · 09:30", readBy: ["client"] },
  ],

  // c8 — Adidas spec CANCELLED (client rejected the offer)
  c8: [
    { id: "c8m1", kind: "system", body: "Inquiry created · via Tulala Hub · Featured dancers", ts: "Apr 14 · 09:00" },
    { id: "c8m2", kind: "text", sender: "coordinator", body: "Hi Marta — Adidas Originals Berlin team is putting together a dance reel spec. 1 day shoot, looking for 3–4 dancers, looking at your reel.", ts: "Apr 14 · 09:05", readBy: ["you"] },
    { id: "c8m3", kind: "text", sender: "you", body: "Open. What's the usage?", ts: "Apr 14 · 11:42", readBy: ["coordinator"] },
    { id: "c8m4", kind: "text", sender: "coordinator", body: "Global, 12 months, all digital + paid social. Quoted you at €2,400.", ts: "Apr 14 · 13:00", readBy: ["you"] },
    { id: "c8m5", kind: "text", sender: "client", body: "Riku here. Love the reel. Our budget is tighter than expected — can you do €1,500?", ts: "Apr 16 · 14:30" },
    { id: "c8m6", kind: "text", sender: "coordinator", body: "Marta — they came in low. Counter-offered €1,800, holding the line on global usage.", ts: "Apr 16 · 14:45", readBy: ["you"] },
    { id: "c8m7", kind: "text", sender: "client", body: "€1,800 is over our cap. Best we can do is €1,400 + buyout option down the road.", ts: "Apr 18 · 10:00" },
    { id: "c8m8", kind: "system", body: "Adidas declined the v3 counter — their max was €1,400 + buyout. Closed.", ts: "4d ago" },
    { id: "c8m9", kind: "text", sender: "coordinator", body: "Closing this — €1,400 for global usage doesn't pencil. They went with another agency. Worth keeping Riku on file though, his next project might pay better.", ts: "4d ago", readBy: ["you"] },
  ],

  // c9 — Lyra Skincare EXPIRED (client never responded)
  c9: [
    { id: "c9m1", kind: "system", body: "Inquiry created · cold email · events@lyraskincare.com", ts: "Apr 18 · 16:00" },
    { id: "c9m2", kind: "text", sender: "coordinator", body: "Heads-up — got a cold email for a 4h hostess slot at a Lyra Skincare pop-up launch in BCN. Brand is unverified, small team. They asked for a quote.", ts: "Apr 18 · 16:05", readBy: ["you"] },
    { id: "c9m3", kind: "text", sender: "you", body: "What's their budget? Hostess work isn't my usual lane but I can do 4h for the right number.", ts: "Apr 18 · 17:30", readBy: ["coordinator"] },
    { id: "c9m4", kind: "text", sender: "coordinator", body: "Sent them €600 for 4h with travel. Standard rate. Will let you know if they reply.", ts: "Apr 19 · 09:00", readBy: ["you"] },
    { id: "c9m5", kind: "system", body: "Reminder sent — no client reply in 7 days.", ts: "Apr 26 · 10:00" },
    { id: "c9m6", kind: "system", body: "Inquiry expired — no client response in 14 days. Auto-closed.", ts: "10d ago" },
  ],

  // c10 — Atelier Noir BOOKED · Marta is COORDINATOR · NDA workflow
  // Booking-team thread shows Marta dispatching the NDA to Nadia,
  // collecting signed copies, and uploading them to Files. Client
  // thread shows Marta + Valeria working through the brief.
  "c10:talent": [
    { id: "c10tm1", kind: "system", body: "Crew confirmed · Marta + Nadia · Atelier Noir SS27", ts: "Jun 12 · 10:00" },
    { id: "c10tm2", kind: "text", sender: "coordinator", body: "Hi Nadia — Atelier Noir locked us for Jul 4–5 in Lisbon. €2,800/day · 2 days. Same rate I quoted them.", ts: "Jun 12 · 10:02", readBy: ["you"] },
    { id: "c10tm3", kind: "text", sender: "agency", body: "Locked. Excited — couture pieces are my thing.", ts: "Jun 12 · 10:18" },
    { id: "c10tm4", kind: "text", sender: "client", body: "Valeria here — passing through. Atelier's NDA is stricter this round (couture exclusivity). Both talents must sign before fitting day.", ts: "Jun 14 · 09:00" },
    { id: "c10tm5", kind: "file", sender: "client", filename: "Atelier_Noir_NDA_v2.pdf", sizeKB: 280, ts: "Jun 14 · 09:01" },
    { id: "c10tm6", kind: "text", sender: "coordinator", body: "Nadia — Atelier sent the NDA. Sign and send back when you can. I'll do mine tonight.", ts: "Jun 14 · 11:00", readBy: ["you"] },
    { id: "c10tm7", kind: "file", sender: "you", filename: "Marta_Reyes_NDA_signed.pdf", sizeKB: 290, ts: "Jun 14 · 22:30" },
    { id: "c10tm8", kind: "file", sender: "agency", filename: "Nadia_Kohler_NDA_signed.pdf", sizeKB: 285, ts: "Jun 15 · 14:42" },
    { id: "c10tm9", kind: "text", sender: "coordinator", body: "Both signed. Uploading the bundle to Files and forwarding to Valeria.", ts: "Jun 15 · 15:00", readBy: ["you"] },
    { id: "c10tm10", kind: "text", sender: "you", body: "NDA + model release uploaded — all 2 talents signed. We're set for Lisbon.", ts: "6h ago", readBy: ["agency"] },
  ],
  "c10:client": [
    { id: "c10cm1", kind: "system", body: "Direct booking · returning workspace client", ts: "Jun 8 · 14:00" },
    { id: "c10cm2", kind: "text", sender: "client", body: "Marta — Valeria here. Want to lock you for SS27 again. 2 days, Jul 4–5, Convento da Cartuxa near Lisbon. Couture pieces this time. Need 2 talents, you choose.", ts: "Jun 8 · 14:04" },
    { id: "c10cm3", kind: "text", sender: "you", body: "Hi Valeria — pleasure to be back. €2,800/day per talent works (same as last year, +5%). I'll bring Nadia Köhler. Can confirm by tomorrow.", ts: "Jun 8 · 16:18", readBy: ["client"] },
    { id: "c10cm4", kind: "text", sender: "client", body: "€2,800/day approved. Sending the booking confirmation through Atelier.", ts: "Jun 9 · 10:00" },
    { id: "c10cm5", kind: "contract-sign", ts: "Jun 10 · 11:00", filename: "Atelier_Noir_SS27_Booking.pdf", resolved: true },
    { id: "c10cm6", kind: "text", sender: "client", body: "One more thing — the NDA. Couture exclusivity, both talents must sign before fitting. Sending v2 to your booking-team thread so Nadia can sign too.", ts: "Jun 14 · 09:00" },
    { id: "c10cm7", kind: "text", sender: "you", body: "On it. Will get both signed by end of week.", ts: "Jun 14 · 11:30", readBy: ["client"] },
    { id: "c10cm8", kind: "file", sender: "you", filename: "Atelier_Noir_NDA_signed_bundle.zip", sizeKB: 580, ts: "Jun 15 · 15:30" },
    { id: "c10cm9", kind: "text", sender: "client", body: "Both NDAs received and filed. See you in Lisbon!", ts: "Jun 15 · 16:00" },
  ],

  // ──────────────────────────────────────────────────────────────────
  // c11 — Aesop · BRAND-NEW INQUIRY (never opened by Marta).
  // Just landed via Tulala Hub beauty vertical. The thread shows the
  // initial pitch + brand outreach + Sara's framing. Marta hasn't
  // responded yet — the action-rate CTA is live at the bottom.
  // ──────────────────────────────────────────────────────────────────
  c11: [
    { id: "c11m1", kind: "system", body: "Inquiry created · via Tulala Hub · Beauty vertical", ts: "30m ago" },
    { id: "c11m2", kind: "text", sender: "client", body: "Hi — Eun-jin from Aesop. We're shooting a single-day skincare editorial in Berlin late May. Looking for editorial-trained talent with strong skin presence. Budget €3,200 for the day, full editorial usage.", ts: "28m ago" },
    { id: "c11m3", kind: "image", sender: "client", caption: "Reference visuals — minimalist, clean light, close beauty crops.", count: 4, ts: "27m ago" },
    { id: "c11m4", kind: "text", sender: "coordinator", body: "Hi Marta — Aesop just came in via the Hub. Strong fit for your editorial reel, single day in Berlin (May 26). Their team specifically asked for editorial-trained talent. Open?", ts: "25m ago" },
    { id: "c11m5", kind: "text", sender: "coordinator", body: "Aesop's a verified Hub client (gold tier locally) — I'd quote at the top of your range. They've been good with usage clearance in the past.", ts: "25m ago" },
    { id: "c11m6", kind: "action-rate", ts: "25m ago" },
  ],

  // ──────────────────────────────────────────────────────────────────
  // c12 — Lacoste · BRAND-NEW INQUIRY (never opened by Marta).
  // Direct via Acme's roster page — Joana saw Marta's Mango lookbook
  // and reached out. 2-day Lisbon SS27 sportswear shoot, June.
  // ──────────────────────────────────────────────────────────────────
  c12: [
    { id: "c12m1", kind: "system", body: "Inquiry created · direct via Acme Models roster page", ts: "10m ago" },
    { id: "c12m2", kind: "text", sender: "client", body: "Hi Marta — Joana here from Lacoste. Saw your Mango lookbook last week, would love to put you on our SS27 shortlist. 2 days in Lisbon (Jun 3–4), Belém riverside, sportswear with editorial leaning.", ts: "10m ago" },
    { id: "c12m3", kind: "text", sender: "client", body: "Budget is €2,400/day per talent + travel + hotel. Open to a chat?", ts: "10m ago" },
    { id: "c12m4", kind: "text", sender: "coordinator", body: "Marta — Lacoste came in directly. First inbound from them in 18 months and they came pre-qualified (knew your work). I'd quote at the top of your range — they expect it.", ts: "9m ago" },
    { id: "c12m5", kind: "image", sender: "client", caption: "Brief deck — locations, mood, looks per day.", count: 6, ts: "9m ago" },
    { id: "c12m6", kind: "action-rate", ts: "9m ago" },
  ],

  // ──────────────────────────────────────────────────────────────────
  // CLIENT-SIDE THREADS — Martina Beach Club POV
  // The "client thread" tab in the client shell shows the conversation
  // between the brand contact (Martina González) and the agency
  // coordinator. Talent-group thread stays locked for client.
  // ──────────────────────────────────────────────────────────────────
  m1: [
    { id: "m1m1", kind: "system", body: "Inquiry sent · routed via Tulala Hub · Hospitality vertical", ts: "May 30 · 09:14" },
    { id: "m1m2", kind: "text", sender: "you", body: "Hi — we're launching a 'Sunday models' summer pool series. 4 dates, this Sunday Jun 8 is the first. Looking for one editorial-leaning talent. Budget €2,800/day plus hotel.", ts: "May 30 · 09:14" },
    { id: "m1m3", kind: "text", sender: "coordinator", body: "Hi Martina — Sara from Acme Models. We have Marta Reyes available — strong editorial portfolio, hospitality experience. Sending mood reference + her portfolio link.", ts: "May 30 · 11:42", readBy: ["you"] },
    { id: "m1m4", kind: "text", sender: "coordinator", body: "Sending you Marta's polaroids + 2 alternates today.", ts: "1h ago" },
    { id: "m1m5", kind: "image", sender: "coordinator", caption: "Marta's recent editorial work + 2 alternate options.", count: 6, ts: "1h ago" },
  ],
  m2: [
    { id: "m2m1", kind: "system", body: "Booking confirmed · Jun 13 · cocktail bar reopening", ts: "May 22 · 10:00" },
    { id: "m2m2", kind: "text", sender: "coordinator", body: "Booked Zara + Tomás for Friday Jun 13. Both have served at Tulum hospitality events for us before. Uniform from your wardrobe team.", ts: "May 22 · 10:02", readBy: ["you"] },
    { id: "m2m3", kind: "text", sender: "you", body: "Great. We'll have Vincenzo (bar manager) brief them on the cocktail menu before doors open.", ts: "May 22 · 11:15", readBy: ["coordinator"] },
    { id: "m2m4", kind: "file", sender: "coordinator", filename: "Cocktail_bar_callsheet_jun13.pdf", sizeKB: 224, ts: "6h ago" },
    { id: "m2m5", kind: "text", sender: "coordinator", body: "Call sheet attached. Hosts arrive at 18:30 · uniform from your wardrobe team.", ts: "6h ago" },
  ],
  m3: [
    { id: "m3m1", kind: "system", body: "Direct booking · 3 creators · weekend takeover", ts: "Apr 28 · 14:00" },
    { id: "m3m2", kind: "text", sender: "you", body: "Hi all — confirming Lucia, Diego, Camille for May 10–11 weekend. Open content brief, vibe-driven.", ts: "Apr 28 · 14:02" },
    { id: "m3m3", kind: "text", sender: "coordinator", body: "All 3 confirmed. They'll arrange travel themselves — you cover hotel + meals at the club.", ts: "Apr 28 · 14:10", readBy: ["you"] },
    { id: "m3m4", kind: "system", body: "Weekend wrapped · 47 posts published across 3 creators", ts: "May 12 · 18:00" },
    { id: "m3m5", kind: "payment-receipt", ts: "May 18 · 09:00", amount: "€4,200", method: "Transfer" },
    { id: "m3m6", kind: "text", sender: "coordinator", body: "Final analytics report attached — 2.4M reach, 18% engagement on Camille's grid posts. Strong return.", ts: "May 20 · 11:30" },
  ],
  m4: [
    { id: "m4m1", kind: "system", body: "Direct booking · via Reyes Movement Studio portfolio", ts: "May 28 · 10:00" },
    { id: "m4m2", kind: "text", sender: "you", body: "Hi Marta — saw your Solstice Festival reel. We want a fire-dance act for our summer closing party, Sat Sep 6. Same crew if possible.", ts: "May 28 · 10:04" },
    { id: "m4m3", kind: "text", sender: "coordinator", body: "Hi Martina — same crew (me, Tariq, Anouk) is doable for Sep 6. €7,500 total · 3 dancers · 12-min set. Insurance + rider already cleared with Solstice — we can reuse for you.", ts: "May 28 · 11:30", readBy: ["you"] },
    { id: "m4m4", kind: "text", sender: "coordinator", body: "Holding Sep 6 for you. Need a yes by Friday so we can lock the dancers' calendars.", ts: "1d 2h ago" },
  ],
  m5: [
    { id: "m5m1", kind: "system", body: "Inquiry sent · press launch · Mexico City", ts: "Mar 30 · 09:00" },
    { id: "m5m2", kind: "text", sender: "you", body: "Need 2 hostesses for our Mexico City pop-up press launch on Apr 28.", ts: "Mar 30 · 09:01" },
    { id: "m5m3", kind: "text", sender: "coordinator", body: "Booked Marta + Zara. Single evening, 6h. Confirmation + call sheet incoming.", ts: "Apr 5 · 14:00", readBy: ["you"] },
    { id: "m5m4", kind: "text", sender: "you", body: "Cancelling the launch — venue pulled out. Will reach out for the next one.", ts: "Apr 14 · 16:30", readBy: ["coordinator"] },
    { id: "m5m5", kind: "text", sender: "coordinator", body: "Understood. We'll waive the cancellation fee given the relationship. Hope to hear from you soon.", ts: "Apr 14 · 17:00", readBy: ["you"] },
    { id: "m5m6", kind: "system", body: "Booking cancelled · fee waived", ts: "Apr 14 · 17:01" },
  ],

  // CLIENT-SIDE THREADS — The Gringo POV
  g1: [
    { id: "g1m1", kind: "system", body: "Inquiry sent · via Instagram DM · referral from past hire", ts: "May 24 · 22:14" },
    { id: "g1m2", kind: "text", sender: "you", body: "Hey — need 4 hostesses for my birthday charter on Sat Jul 26. Day-trip yacht out of Marina Botafoch.", ts: "May 24 · 22:14" },
    { id: "g1m3", kind: "text", sender: "coordinator", body: "Hi — Sara from Acme Models. We can pull a crew. To send proposals, we'll need ID verification + a card on file (standard for personal clients on a Basic trust tier). Takes 5 min.", ts: "May 25 · 10:00" },
    { id: "g1m4", kind: "text", sender: "coordinator", body: "Verification pending — once funded the deal moves fast. Confirm card on file?", ts: "4h ago" },
  ],
  g2: [
    { id: "g2m1", kind: "system", body: "Direct booking · 2 hostesses · 3h", ts: "Mar 8 · 14:00" },
    { id: "g2m2", kind: "text", sender: "coordinator", body: "Booked Zara + Anouk for Mar 15 private dinner. Card on file charged · €1,200.", ts: "Mar 8 · 14:02", readBy: ["you"] },
    { id: "g2m3", kind: "system", body: "Wrapped · paid in full", ts: "Mar 15 · 23:00" },
    { id: "g2m4", kind: "payment-receipt", ts: "Mar 20 · 09:00", amount: "€1,200", method: "Card on file" },
  ],

  // ── New martina convs (client POV) ──
  m6: [
    { id: "m6m1", kind: "system", body: "Inquiry submitted · annual print campaign brief", ts: "30m ago" },
    { id: "m6m2", kind: "text", sender: "you", body: "Hi Acme — sending our annual print campaign brief. Food + lifestyle, 2 days at the beach club. Aug 18–19. Looking for one editorial-leaning model + the photographer you used for La Mar.", ts: "30m ago" },
    { id: "m6m3", kind: "text", sender: "coordinator", body: "Hi Martina — Diego here from Acme. Brief received. Strong fit with your past work — proposing a shortlist + a refreshed photographer pairing by EOD. €2,800/day per talent works against your budget.", ts: "25m ago" },
    { id: "m6m4", kind: "image", sender: "coordinator", caption: "Initial mood + 3 photographer references.", count: 5, ts: "20m ago" },
  ],
  m7: [
    { id: "m7m1", kind: "system", body: "Inquiry sent · referral via Atelier Roma", ts: "10m ago" },
    { id: "m7m2", kind: "text", sender: "you", body: "Tequila Olmeca activation in Tulum, single evening, Aug 6. Need 3 hostesses · €1,800 total · 4h. Atelier said you'd handle it.", ts: "10m ago" },
    { id: "m7m3", kind: "text", sender: "coordinator", body: "Theo from Praline London — got it. We do a lot of Tulum activations. Sending 5 profiles in the next hour. All have hospitality + brand-rep experience.", ts: "8m ago" },
  ],
  m8: [
    { id: "m8m1", kind: "system", body: "Inquiry created · couple shoot · 4h sunset", ts: "5h ago" },
    { id: "m8m2", kind: "text", sender: "you", body: "Sunset wedding feature for the magazine — 4h shoot, cenote + pool deck, Sat Jul 19. Want Emma if she's available, plus João to shoot.", ts: "5h ago" },
    { id: "m8m3", kind: "text", sender: "coordinator", body: "Emma + João both clear that day. Drafting the full package — talent + photog + half-day retouch. €4,200 total.", ts: "4h ago", readBy: ["you"] },
    { id: "m8m4", kind: "text", sender: "coordinator", body: "Offer ready — €4,200 total. Approve below to lock the date.", ts: "3h ago" },
    { id: "m8m5", kind: "action-confirm", label: "Approve sunset shoot", ts: "3h ago" },
  ],

  // ── New gringo convs ──
  g3: [
    { id: "g3m1", kind: "system", body: "Inquiry sent · Instagram DM · pool party", ts: "30m ago" },
    { id: "g3m2", kind: "text", sender: "you", body: "Pool party at Hotel Eden, Sat Aug 9. Need 6 hostesses · 4h afternoon · €1,800 total. You handled my dinner in March, can we move fast?", ts: "30m ago" },
    { id: "g3m3", kind: "text", sender: "coordinator", body: "Hi — Sara again. Happy to. Quick refresh: your card on file from March is expired. Verify the new card and I'll send 6 profiles immediately.", ts: "25m ago" },
    { id: "g3m4", kind: "text", sender: "coordinator", body: "Standard 50% deposit on confirmation, balance on the day. Same as last time.", ts: "25m ago" },
  ],
  g4: [
    { id: "g4m1", kind: "system", body: "Booking confirmed · sunset boat trip · 3 hostesses", ts: "2d ago" },
    { id: "g4m2", kind: "text", sender: "coordinator", body: "Sunset boat trip Jul 12 confirmed. Zara, Anouk, Lucia — same crew you've worked with. Captain Iván briefed.", ts: "2d ago", readBy: ["you"] },
    { id: "g4m3", kind: "text", sender: "you", body: "Perfect. Let's do another one.", ts: "2d ago", readBy: ["coordinator"] },
    { id: "g4m4", kind: "system", body: "Deposit cleared · €1,200 of €2,400 paid", ts: "2d ago" },
    { id: "g4m5", kind: "text", sender: "coordinator", body: "Booking locked. Deposit cleared. Balance €1,200 due 48h before sail (Jul 10) — same card on file unless you tell me otherwise.", ts: "22h ago" },
  ],
};

const STAGE_META: Record<MsgStage, { label: string; tone: string; bg: string }> = {
  inquiry: { label: "Inquiry", tone: COLORS.coral, bg: COLORS.coralSoft },
  hold: { label: "Hold", tone: COLORS.amber, bg: "rgba(176,141,82,0.10)" },
  booked: { label: "Booked", tone: COLORS.green, bg: COLORS.successSoft },
  past: { label: "Past", tone: COLORS.inkDim, bg: "rgba(11,11,13,0.04)" },
  cancelled: { label: "Cancelled", tone: COLORS.coral, bg: COLORS.coralSoft },
};

/**
 * Messages FAB — floating button at bottom-right on every talent page
 * that is NOT the Messages page. Tap → slides up an overlay sheet
 * containing the same Messages experience. Designed for mobile-first
 * but useful on desktop too (quick check without page navigation).
 *
 * Hidden on the Messages page (where it would be redundant).
 */
function TalentMessagesFab() {
  const { state, setTalentPage } = useProto();
  const [overlayOpen, setOverlayOpen] = useState(false);
  // Audit P1-10 — on phone, FAB navigates to the Messages route
  // instead of opening a sheet over the same content. Two parallel
  // entry points (FAB-overlay + page) created confusing IA on phone.
  const isPhone = useIsPhone();
  if (state.talentPage === "messages") return null;
  const totalUnread = MOCK_CONVERSATIONS.reduce((s, c) => s + c.unreadCount, 0);
  return (
    <>
      <button
        type="button"
        aria-label={`Messages · ${totalUnread} unread`}
        onClick={() => {
          if (isPhone) setTalentPage("messages");
          else setOverlayOpen(true);
        }}
        style={{
          position: "fixed",
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 999,
          background: COLORS.fill,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 24px rgba(11,11,13,0.20), 0 1px 3px rgba(11,11,13,0.10)",
          zIndex: 60,
          transition: `transform ${TRANSITION.micro}`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        {totalUnread > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              minWidth: 20,
              height: 20,
              padding: "0 6px",
              borderRadius: 999,
              background: COLORS.accent,
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 700,
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 2px " + COLORS.ink,
              fontVariantNumeric: "tabular-nums",
              fontFamily: FONTS.body,
            }}
          >
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {/* Overlay sheet */}
      {overlayOpen && (
        <MessagesOverlaySheet
          onClose={() => setOverlayOpen(false)}
          onOpenFullPage={() => {
            setOverlayOpen(false);
            setTalentPage("messages");
          }}
        />
      )}
    </>
  );
}

function MessagesOverlaySheet({
  onClose,
  onOpenFullPage,
}: {
  onClose: () => void;
  onOpenFullPage: () => void;
}) {
  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.32)",
          zIndex: 70,
          animation: "tulala-fade-in .18s ease",
        }}
      />
      {/* Sheet — slides up from bottom on mobile, right on desktop */}
      <aside
        role="dialog"
        aria-label="Messages"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(100vw, 720px)",
          background: "#fff",
          zIndex: 71,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 0 60px rgba(11,11,13,0.25)",
          animation: "tulala-slide-right .22s cubic-bezier(.4,.0,.2,1)",
          fontFamily: FONTS.body,
        }}
      >
        <style>{`
          @keyframes tulala-fade-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes tulala-slide-right {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, letterSpacing: -0.2, margin: 0, color: COLORS.ink }}>
            Messages
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={onOpenFullPage}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 7,
                padding: "5px 11px",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
                color: COLORS.ink,
              }}
            >
              Open full page →
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: COLORS.inkMuted,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
        {/* Content — reuse the Messages page two-pane */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <TalentMessagesPage />
        </div>
      </aside>
    </>
  );
}

/**
 * Track soft-keyboard offset via visualViewport. The delta between the
 * layout viewport and the visual viewport equals the keyboard height
 * (plus any browser chrome shrink) — write it to a CSS variable so the
 * messages-shell height calc can subtract it (audit P0-2). Mounted once
 * by TalentMessagesPage; cleans up the var on unmount so it doesn't
 * leak into other surfaces.
 */
function useKeyboardInset() {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--proto-kb", `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--proto-kb");
    };
  }, []);
}

/**
 * Reactive phone-width media query. Used for behavior switches that
 * can't be done in CSS (e.g. swap component returned, default state).
 */
function useIsPhone(breakpoint = 720) {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isPhone;
}

// TalentMessagesPage delegates to the unified MessagesShell so all 3
// surfaces share the same list chrome, row component, header, filter
// chips, and mobile responsive pattern. Lazy-loaded via dynamic() to
// avoid the import cycle with `_messages.tsx` (which itself imports
// `Conversation`, `ParticipantsStack`, `MOCK_CONVERSATIONS` from this
// file). See `_messages.tsx` charter for full design decisions.
const TalentMessagesShellLazy = dynamic(() => import("./_messages").then(m => m.MessagesShell), { ssr: false });

export function TalentMessagesPage() {
  useKeyboardInset();
  return <TalentMessagesShellLazy pov="talent" />;
}

// Legacy implementation retained as `_TalentMessagesPageLegacy` below.
function _TalentMessagesPageLegacy() {
  const [activeId, setActiveId] = useState<string>(MOCK_CONVERSATIONS[0]!.id);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "inquiry" | "hold" | "booked" | "past">("all");
  /**
   * Mobile pane state — single-pane stack on small screens.
   *   "list"   = conversation list visible, thread hidden
   *   "thread" = thread visible fullscreen, list hidden + back button
   * On desktop both render side-by-side; CSS toggles which is shown
   * via the [data-mobile-pane] attribute under @media (max-width: 720px).
   * Default = list (so cold-arriving on mobile lands on the index, not
   * a random thread).
   */
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");

  const filteredList = MOCK_CONVERSATIONS.filter((c) => {
    if (filter === "unread" && c.unreadCount === 0) return false;
    if (filter !== "all" && filter !== "unread" && c.stage !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!c.client.toLowerCase().includes(q) && !c.brief.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // j/k keyboard navigation across the inbox. Skips when the user is
  // typing in an input/textarea/contentEditable so the shortcut doesn't
  // hijack message composing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "j" && e.key !== "k" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (filteredList.length === 0) return;
      e.preventDefault();
      const idx = filteredList.findIndex((c) => c.id === activeId);
      const nextIdx = (e.key === "j" || e.key === "ArrowDown")
        ? Math.min(filteredList.length - 1, idx + 1)
        : Math.max(0, idx - 1);
      const next = filteredList[nextIdx];
      if (next) {
        setActiveId(next.id);
        setMobilePane("thread");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredList, activeId]);

  const active = MOCK_CONVERSATIONS.find((c) => c.id === activeId) ?? MOCK_CONVERSATIONS[0]!;
  const messages = MOCK_THREAD[active.id] ?? [];

  return (
    <div
      data-tulala-messages-shell
      data-mobile-pane={mobilePane}
      style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
        // Fill available height. When rendered as the page, the talent
        // surface main provides ~tall enough container; when rendered
        // inside the overlay sheet, the sheet's flex column gives 100%.
        height: "min(calc(100vh - var(--proto-cbar, 50px) - 56px - 52px - 56px), 800px)",
        minHeight: 560,
        fontFamily: FONTS.body,
      }}
    >
      {/* Left rail — conversation list */}
      <ConversationList
        conversations={filteredList}
        activeId={active.id}
        onSelect={(id) => { setActiveId(id); setMobilePane("thread"); }}
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        totalUnread={MOCK_CONVERSATIONS.reduce((sum, c) => sum + c.unreadCount, 0)}
      />
      {/* Right pane — open thread (fullscreen on mobile, returns to
          list via the back button rendered inside ThreadHeader). */}
      <ConversationThread
        conv={active}
        messages={messages}
        onBackToList={() => setMobilePane("list")}
      />
    </div>
  );
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  totalUnread,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  filter: "all" | "unread" | "inquiry" | "hold" | "booked" | "past";
  onFilterChange: (f: "all" | "unread" | "inquiry" | "hold" | "booked" | "past") => void;
  totalUnread: number;
}) {
  const filterChips: { id: typeof filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: `Unread${totalUnread > 0 ? ` (${totalUnread})` : ""}` },
    { id: "inquiry", label: "Inquiry" },
    { id: "hold", label: "Hold" },
    { id: "booked", label: "Booked" },
    { id: "past", label: "Past" },
  ];
  return (
    <aside
      data-tulala-list-pane
      style={{
        borderRight: `1px solid ${COLORS.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, letterSpacing: -0.2, margin: 0, color: COLORS.ink }}>
            Messages
          </h2>
          <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
            {conversations.length} thread{conversations.length === 1 ? "" : "s"}
          </span>
        </div>
        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(11,11,13,0.04)",
            borderRadius: 8,
            padding: "7px 10px",
          }}
        >
          <Icon name="search" size={13} color={COLORS.inkMuted} stroke={1.7} />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search clients, briefs…"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: COLORS.ink,
            }}
          />
        </div>
        {/* Filter chips */}
        <div data-tulala-msg-filter-chips style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {filterChips.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => onFilterChange(f.id)}
                style={{
                  background: active ? COLORS.fill : "transparent",
                  color: active ? "#fff" : COLORS.inkMuted,
                  border: active ? "none" : `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 999,
                  padding: "3px 9px",
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11,
                  fontWeight: active ? 600 : 500,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List — WS-13.3: Virtuoso for large conversation lists (500+ threads in prod) */}
      {conversations.length === 0 ? (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {filter === "unread" ? (
            <EmptyState
              icon="sparkle"
              title="Inbox zero ✨"
              body="Everything's been answered. Nothing waiting on you right now."
              primaryLabel="Show all threads"
              onPrimary={() => onFilterChange("all")}
              compact
            />
          ) : search.trim() ? (
            <EmptyState
              icon="search"
              title="No matches"
              body={`Nothing for "${search.trim()}". Try fewer words.`}
              primaryLabel="Clear search"
              onPrimary={() => onSearchChange("")}
              compact
            />
          ) : (
            <EmptyState
              icon="mail"
              title="No threads here yet"
              body="When clients reach out, conversations land here."
              primaryLabel="Show all"
              onPrimary={() => onFilterChange("all")}
              compact
            />
          )}
        </div>
      ) : (
        <Virtuoso
          style={{ flex: 1, minHeight: 0 }}
          data={conversations}
          itemContent={(_, c) => (
            <ConversationListRow
              conv={c}
              active={c.id === activeId}
              onClick={() => onSelect(c.id)}
            />
          )}
        />
      )}
    </aside>
  );
}

/**
 * Right-click / long-press context menu state for a conversation row.
 * Module-level signal so only one menu is open at a time across rows.
 */
function ConversationListRow({
  conv,
  active,
  onClick,
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  const stage = STAGE_META[conv.stage];
  const ageLabel = conv.lastMessage.ageHrs < 1
    ? "now"
    : conv.lastMessage.ageHrs < 24
      ? `${conv.lastMessage.ageHrs}h`
      : `${Math.floor(conv.lastMessage.ageHrs / 24)}d`;
  const { toast } = useProto();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const longPressRef = useRef<number | null>(null);
  // Audit P0-3 — when the long-press timer fires, the subsequent
  // tap-release still triggers `onClick`, which would navigate AND
  // open the menu. This flag suppresses the click for one cycle.
  const longPressFiredRef = useRef(false);
  // Audit P0-4 — clamp the menu position to the viewport so it can't
  // open off-screen when a row near the bottom is long-pressed.
  const positionMenu = (x: number, y: number) => {
    const menuW = 240;
    const menuH = 280;
    const pad = 12;
    const vw = typeof window !== "undefined" ? window.innerWidth : 360;
    const vh = typeof window !== "undefined" ? window.innerHeight : 640;
    return {
      x: Math.max(pad, Math.min(x, vw - menuW - pad)),
      y: Math.max(pad, Math.min(y, vh - menuH - pad)),
    };
  };
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-tulala-row-menu]')) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  return (
    <button
      type="button"
      onClick={(e) => {
        if (longPressFiredRef.current) {
          longPressFiredRef.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuPos(positionMenu(e.clientX, e.clientY));
        setMenuOpen(true);
      }}
      onTouchStart={(e) => {
        if (longPressRef.current) window.clearTimeout(longPressRef.current);
        const touch = e.touches[0];
        longPressFiredRef.current = false;
        longPressRef.current = window.setTimeout(() => {
          longPressFiredRef.current = true;
          if (touch) setMenuPos(positionMenu(touch.clientX, touch.clientY));
          setMenuOpen(true);
        }, 500);
      }}
      onTouchEnd={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
      onTouchCancel={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
      onTouchMove={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        padding: "12px 14px",
        background: active ? "rgba(11,11,13,0.05)" : "transparent",
        borderLeft: active ? `3px solid ${COLORS.accent}` : "3px solid transparent",
        borderTop: "none",
        borderRight: "none",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
        position: "relative",
        // Audit P0-3 — suppress the iOS native touch-callout (copy/
        // share popup) so long-press surfaces our context menu cleanly.
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "manipulation",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(11,11,13,0.02)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar size={40} tone="auto" hashSeed={conv.client} initials={conv.clientInitials} />
        <ClientTrustBadge level={conv.clientTrust} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span data-tulala-conv-row-name style={{ fontSize: 13, fontWeight: conv.unreadCount > 0 ? 600 : 500, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {conv.client}
          </span>
          <span data-tulala-conv-row-age style={{ fontSize: 10.5, color: conv.unreadCount > 0 ? COLORS.ink : COLORS.inkDim, fontWeight: conv.unreadCount > 0 ? 600 : 400, flexShrink: 0 }}>
            {ageLabel}
          </span>
        </div>
        <div data-tulala-conv-row-brief style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {conv.brief}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <span
            data-tulala-conv-row-stage
            style={{
              fontSize: 9.5,
              fontWeight: 700,
                            padding: "1px 5px",
              borderRadius: 4,
              background: stage.bg,
              color: stage.tone,
            }}
          >
            {stage.label}
          </span>
          {MOCK_DRAFTS[conv.id] ? (
            <span data-tulala-conv-row-preview style={{
              fontSize: 11,
              fontStyle: "italic",
              color: COLORS.coral,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0,
            }}>
              <span style={{ fontStyle: "normal", fontWeight: 600, marginRight: 4 }}>Draft:</span>
              {MOCK_DRAFTS[conv.id]}
            </span>
          ) : (
            <span data-tulala-conv-row-preview style={{ fontSize: 11, color: COLORS.inkMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
              {conv.lastMessage.sender === "you" ? "You: " : ""}
              {conv.lastMessage.preview}
            </span>
          )}
          {conv.unreadCount > 0 && (
            <span
              style={{
                minWidth: 16,
                height: 16,
                padding: "0 5px",
                borderRadius: 999,
                background: COLORS.accent,
                color: "#fff",
                fontSize: 9.5,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {conv.unreadCount}
            </span>
          )}
        </div>
        {/* Participants row — stacked avatars of people on this shoot.
            Talents float left (most relevant to the user); crew fills
            the rest. Capped at 5 avatars + "+N" overflow. */}
        {conv.participants && conv.participants.length > 0 && (
          <ParticipantsStack participants={conv.participants} />
        )}
      </div>
      {menuOpen && menuPos && (
        <div
          data-tulala-row-menu
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: menuPos.y,
            left: menuPos.x,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(11,11,13,0.18)",
            padding: 6,
            zIndex: 200,
            minWidth: 220,
            fontFamily: FONTS.body,
            animation: "tulala-bubble-action-in .14s ease",
          }}
        >
          <div style={{
            fontSize: 10,
            fontWeight: 700,
                        color: COLORS.inkMuted,
            padding: "6px 10px 4px",
          }}>Snooze</div>
          <BubbleMenuItem icon="🕓" label="2 hours" onClick={() => { setMenuOpen(false); toast(`${conv.client} snoozed · returns in 2h`, { undo: () => toast("Snooze cancelled") }); }} />
          <BubbleMenuItem icon="🌅" label="Tomorrow 9 AM" onClick={() => { setMenuOpen(false); toast(`${conv.client} snoozed · returns Tomorrow 9 AM`, { undo: () => toast("Snooze cancelled") }); }} />
          <BubbleMenuItem icon="📆" label="Monday 9 AM" onClick={() => { setMenuOpen(false); toast(`${conv.client} snoozed · returns Monday 9 AM`, { undo: () => toast("Snooze cancelled") }); }} />
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 4px" }} />
          <BubbleMenuItem icon="📌" label="Pin to top" onClick={() => { setMenuOpen(false); toast("Pinned to top"); }} />
          <BubbleMenuItem icon="✓" label="Mark as read" onClick={() => { setMenuOpen(false); toast("Marked as read"); }} />
          <BubbleMenuItem icon="📁" label="Archive" onClick={() => { setMenuOpen(false); toast("Archived", { undo: () => toast("Restored") }); }} />
        </div>
      )}
    </button>
  );
}

/**
 * Stacked avatars showing who else is on this shoot. Talents are
 * sorted to the front (the user cares most about peers); crew fills
 * the rest. Visible cap = 5; the rest collapse into "+N".
 */
export function ParticipantsStack({ participants }: { participants: Participant[] }) {
  const sorted = [...participants].sort((a, b) => Number(!!b.isTalent) - Number(!!a.isTalent));
  const visible = sorted.slice(0, 5);
  const overflow = sorted.length - visible.length;
  return (
    <div
      aria-label={`${participants.length} on this shoot`}
      title={participants.map((p) => `${p.name} · ${p.role}`).join("\n")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginTop: 6,
        paddingTop: 6,
        borderTop: `1px dashed rgba(11,11,13,0.06)`,
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 10,
          color: COLORS.inkMuted,
          marginRight: 2,
          letterSpacing: 0.4,
        }}
      >
        with
      </span>
      <div style={{ display: "inline-flex", alignItems: "center" }}>
        {visible.map((p, i) => (
          <span
            key={`${p.initials}-${i}`}
            style={{
              marginLeft: i === 0 ? 0 : -6,
              width: 23,
              height: 23,
              boxSizing: "border-box",
              border: "1.5px solid #fff",
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 0,
              position: "relative",
              zIndex: visible.length - i,
              flexShrink: 0,
            }}
          >
            <Avatar size={20} tone="auto" hashSeed={p.name} initials={p.initials} />
          </span>
        ))}
        {overflow > 0 && (
          <span
            style={{
              marginLeft: -6,
              minWidth: 20,
              height: 20,
              padding: "0 5px",
              borderRadius: 999,
              border: "1.5px solid #fff",
              background: "rgba(11,11,13,0.10)",
              color: COLORS.inkMuted,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9.5,
              fontWeight: 700,
              fontFamily: FONTS.body,
              fontVariantNumeric: "tabular-nums",
              position: "relative",
              zIndex: 0,
            }}
          >
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}

// Module-level cache of scroll positions per conversation id. Survives
// conversation switches within the same mount of TalentMessagesPage so
// reopening a thread lands you back where you left off.
const __threadScrollMap = new Map<string, number>();

// Mock unsent drafts per conversation id. In production this is server-
// persisted (or local-storage-cached). Showing "Draft: …" on the inbox
// row is a tiny UX win that prevents talent from forgetting half-written
// replies. Keys must match Conversation.id.
const MOCK_DRAFTS: Record<string, string> = {
  "c4": "Sounds good, let me check…",
};

// Mock pre-existing reactions on specific message ids. Demonstrates the
// reactions UX without requiring a real reactions store. Keys must match
// Msg.id values from MOCK_THREAD.
const MOCK_REACTIONS: Record<string, string[]> = {
  "c1m4": ["👍"],
  "c2m4": ["❤️", "🙏"],
};

export function ConversationThread({
  conv,
  messages,
  onBackToList,
}: {
  conv: Conversation;
  messages: Msg[];
  onBackToList?: () => void;
}) {
  const isLocked = conv.stage === "booked";
  const isReadOnly = conv.stage === "past" || conv.stage === "cancelled";
  // Right info sidebar — open by default on desktop. Designed so the
  // top of the chat stays clean for the highlight; users open this
  // panel for full pinned info, files, action items, leader, etc.
  const [infoOpen, setInfoOpen] = useState(true);
  // AI thread summary — collapsible card at top of the message stream.
  // Default open for unread/active threads, collapsed for past/booked
  // (less surface noise once the thread is locked in). Audit P1-9 —
  // also default closed on phone where vertical space is precious.
  const isPhone = useIsPhone();
  const [summaryOpen, setSummaryOpen] = useState(!isReadOnly && !isLocked);
  // Audit P1-9 — useIsPhone resolves on the next paint after mount, so
  // sync the default once we know we're on phone (close it) without
  // forcing closed if the user explicitly opened it later.
  const phoneSyncedRef = useRef(false);
  useEffect(() => {
    if (isPhone && !phoneSyncedRef.current) {
      phoneSyncedRef.current = true;
      setSummaryOpen(false);
    }
  }, [isPhone]);
  // WS-13.3 — VirtuosoHandle replaces the old HTMLDivElement scrollRef.
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  // Restore scroll position when the open conversation changes. If no
  // saved position exists, jump to bottom (most-recent-message focus).
  useEffect(() => {
    const saved = __threadScrollMap.get(conv.id);
    if (saved != null) {
      virtuosoRef.current?.scrollTo({ top: saved });
    } else {
      // scrollToIndex with index 'LAST' is Virtuoso's idiomatic "bottom".
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: vsb() });
    }
  }, [conv.id]);
  return (
    <div
      data-tulala-thread-grid
      style={{
        display: "grid",
        gridTemplateColumns: infoOpen ? "1fr 320px" : "1fr",
        background: "#fff",
        minHeight: 0,
        transition: `grid-template-columns ${TRANSITION.layout}`,
      }}
    >
      <section
        data-tulala-thread-pane
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {/* Sticky thread header — highlight only */}
        <ThreadHeader conv={conv} infoOpen={infoOpen} onToggleInfo={() => setInfoOpen((v) => !v)} onBackToList={onBackToList} />

        {/* Read-only banner if past */}
        {isReadOnly && (
          <div
            style={{
              padding: "8px 18px",
              background: "rgba(11,11,13,0.04)",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: COLORS.inkMuted,
            }}
          >
            🔒 This thread is archived. Read-only.
          </div>
        )}

        {/* Message stream — warm cream background, day separators
            grouped via the renderer, breathable spacing. */}
        {/* WS-13.3 — Virtuoso virtualizes the message stream.
            followOutput auto-scrolls to bottom when new messages arrive
            and the user is already near the bottom (matches chat UX).
            Header renders the AI summary above the first message.     */}
        <Virtuoso
          ref={virtuosoRef}
          style={{
            flex: 1,
            minHeight: 0,
            background: COLORS.surfaceAlt,
            backgroundImage: `radial-gradient(circle at 20% 0%, rgba(15,79,62,0.025), transparent 50%)`,
          }}
          data={buildMsgRenderables(messages, conv.stage, conv.leader.name.split(" ")[0]!, conv.unreadCount)}
          components={{
            Header: () => (
              <AIThreadSummary conv={conv} open={summaryOpen} onToggle={() => setSummaryOpen((v) => !v)} />
            ),
          }}
          followOutput={(isAtBottom) => (isAtBottom ? vsb() : false)}
          onScroll={(e) => { __threadScrollMap.set(conv.id, (e.target as HTMLElement).scrollTop); }}
          itemContent={(_, item) => {
            if (item.kind === "separator") return <div style={{ padding: "0 24px" }}><DaySeparator label={item.label} /></div>;
            if (item.kind === "unread-divider") return <div style={{ padding: "0 24px" }}><NewMessagesDivider count={item.count} /></div>;
            if (item.kind === "typing") return <div style={{ padding: "0 24px 16px" }}><TypingIndicator name={item.typingName} /></div>;
            return <div style={{ padding: "3px 24px" }}><MessageBubble msg={item.msg} stage={item.stage} isFirstOfGroup={item.isFirstOfGroup} /></div>;
          }}
        />

        {/* Composer */}
        {!isReadOnly && (
          <Composer
            conv={conv}
            isLocked={isLocked}
            onAfterSend={() => {
              // WS-13.3 — scroll to bottom via Virtuoso handle instead of
              // direct DOM scrollTop manipulation.
              virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: vsb() });
            }}
          />
        )}
      </section>

      {/* Right info sidebar — full pinned info + extras. Closes via the
          ⓘ toggle in the thread header. Slides off-screen at <540px. */}
      {infoOpen && <ThreadInfoSidebar conv={conv} isLocked={isLocked} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

function ThreadHeader({
  conv,
  infoOpen,
  onToggleInfo,
  onBackToList,
}: {
  conv: Conversation;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onBackToList?: () => void;
}) {
  const stage = STAGE_META[conv.stage];
  return (
    <div
      data-tulala-thread-header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        fontFamily: FONTS.body,
      }}
    >
      {/* Mobile back button — visible only at narrow widths via CSS.
          Returns from thread → list pane in the single-pane stack. */}
      {onBackToList && (
        <button
          type="button"
          className="tulala-mobile-back"
          onClick={onBackToList}
          aria-label="Back to messages list"
          style={{
            display: "none",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: COLORS.ink,
            cursor: "pointer",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            flexShrink: 0,
            marginRight: -4,
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <Avatar size={36} tone="auto" hashSeed={conv.client} initials={conv.clientInitials} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div data-tulala-thread-header-titlerow style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{conv.client}</span>
          <span data-tulala-thread-header-trust style={{ display: "inline-flex", flexShrink: 0 }}>
            <ClientTrustChip level={conv.clientTrust} />
          </span>
          <span
            data-tulala-thread-header-stage
            style={{
              fontSize: 9.5,
              fontWeight: 700,
                            padding: "2px 6px",
              borderRadius: 999,
              background: stage.bg,
              color: stage.tone,
              flexShrink: 0,
            }}
          >
            {stage.label}
          </span>
        </div>
        <div data-tulala-thread-header-brief style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {conv.brief} {conv.date && `· ${conv.date}`}
        </div>
      </div>
      {/* Right side — search + options + info toggle. Leader, location,
          schedule, transport now live in the right info sidebar (toggle
          this with the panel button on the right). */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          title="Search in thread"
          aria-label="Search in thread"
          style={iconButtonSm}
        >
          <Icon name="search" size={13} color={COLORS.inkMuted} stroke={1.7} />
        </button>
        <ThreadOptionsMenu />

        {/* Info panel toggle — sidebar-icon glyph with active state */}
        <button
          type="button"
          onClick={onToggleInfo}
          aria-label={infoOpen ? "Hide info panel" : "Show info panel"}
          aria-pressed={infoOpen}
          title={infoOpen ? "Hide details" : "Show details"}
          style={{
            ...iconButtonSm,
            background: infoOpen ? COLORS.fill : "#fff",
            color: infoOpen ? "#fff" : COLORS.inkMuted,
            borderColor: infoOpen ? COLORS.ink : COLORS.borderSoft,
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const iconButtonSm: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 7,
  border: `1px solid ${COLORS.borderSoft}`,
  background: "#fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

/**
 * Thread options menu — the ⋯ button in the thread header. Houses
 * thread-level actions: pin to top, mute, star/favorite, archive, block
 * client. Local state seeds the toggles so the same menu shows the
 * current state per session.
 */
function ThreadOptionsMenu() {
  const { toast } = useProto();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [starred, setStarred] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-tulala-thread-options-menu]')) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        title="Thread options"
        aria-label="Thread options"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={iconButtonSm}
      >
        <span style={{ fontFamily: FONTS.body, fontWeight: 700, color: COLORS.inkMuted, letterSpacing: 1 }}>···</span>
      </button>
      {open && (
        <div
          data-tulala-thread-options-menu
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(11,11,13,0.15)",
            padding: 6,
            zIndex: 30,
            minWidth: 220,
            fontFamily: FONTS.body,
            animation: "tulala-bubble-action-in .14s ease",
          }}
        >
          <BubbleMenuItem icon={starred ? "⭐" : "☆"} label={starred ? "Starred" : "Star thread"} onClick={() => { setStarred((v) => !v); toast(starred ? "Removed from starred" : "Pinned to starred"); setOpen(false); }} />
          <BubbleMenuItem icon={muted ? "🔕" : "🔔"} label={muted ? "Muted · unmute" : "Mute notifications"} onClick={() => { setMuted((v) => !v); toast(muted ? "Notifications on" : "Notifications muted"); setOpen(false); }} />
          <BubbleMenuItem icon="📌" label="Pin to top of inbox" onClick={() => { toast("Pinned to top"); setOpen(false); }} />
          <BubbleMenuItem icon="📤" label="Export thread (PDF)" onClick={() => { toast("Generating PDF…"); setOpen(false); }} />
          <BubbleMenuItem icon="📁" label="Archive thread" onClick={() => { toast("Archived", { undo: () => toast("Restored") }); setOpen(false); }} />
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 4px" }} />
          <BubbleMenuItem icon="⛔" label="Block client" onClick={() => { toast("Client blocked", { tone: "error", action: { label: "Undo", onClick: () => toast("Unblocked") } }); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

/**
 * Right-rail info sidebar — full pinned info + extras for the open
 * thread. Toggleable from the thread header. Stays clean at the top
 * of the chat (just the highlight); details on-demand here.
 *
 * Sections (in priority order, shown only when populated):
 *   1. Schedule + call time + location (with map link)
 *   2. Transport (editable by coordinator/client)
 *   3. Your rate / Your take-home (locked when booked)
 *   4. Coordinator note (private to talent ↔ coordinator)
 *   5. Leader (who's running this for you)
 *   6. Files & attachments (count from chat)
 *   7. Action items (open + completed)
 *   8. Stage actions: drop / cancel (when booked) · resolve conflict
 *      (when hold conflict)
 */
function ThreadInfoSidebar({
  conv,
  isLocked,
  onClose,
}: {
  conv: Conversation;
  isLocked: boolean;
  onClose: () => void;
}) {
  const { openDrawer, toast } = useProto();
  const [infoTab, setInfoTab] = useState<"details" | "activity">("details");
  // Audit P1-8 — actual swipe-down-to-dismiss for the mobile bottom
  // sheet. The drag-pill rendered by CSS was previously cosmetic; now
  // it's a real affordance. Tracks touch deltaY, translates the sheet,
  // and dismisses past 80px or 30% sheet-height (whichever is smaller).
  const sheetRef = useRef<HTMLElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const sheetHeightRef = useRef<number>(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (!sheetRef.current) return;
    // Only start a drag if the touch begins near the top of the sheet
    // (within the drag-pill region) — touching deeper inside should
    // scroll content, not drag the sheet.
    const rect = sheetRef.current.getBoundingClientRect();
    if (e.touches[0]!.clientY - rect.top > 28) return;
    dragStartY.current = e.touches[0]!.clientY;
    sheetHeightRef.current = rect.height;
    sheetRef.current.style.transition = "none";
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null || !sheetRef.current) return;
    const dy = e.touches[0]!.clientY - dragStartY.current;
    if (dy <= 0) return;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStartY.current == null || !sheetRef.current) return;
    const endY = e.changedTouches[0]?.clientY ?? dragStartY.current;
    const dy = endY - dragStartY.current;
    const threshold = Math.min(80, sheetHeightRef.current * 0.3);
    sheetRef.current.style.transition = `transform ${TRANSITION.layout}`;
    if (dy > threshold) {
      sheetRef.current.style.transform = `translateY(100%)`;
      window.setTimeout(() => onClose(), 180);
    } else {
      sheetRef.current.style.transform = "translateY(0)";
    }
    dragStartY.current = null;
  };
  return (
    <aside
      ref={sheetRef as never}
      data-tulala-thread-info-sidebar
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        borderLeft: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        overflowY: "auto",
        minHeight: 0,
        fontFamily: FONTS.body,
        animation: "tulala-info-fade .18s ease",
      }}
    >
      <style>{`@keyframes tulala-info-fade { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }`}</style>

      {/* Sidebar header — Details / Activity tabs + close */}
      <InfoSidebarHeader onClose={onClose} tab={infoTab} onTabChange={setInfoTab} />
      {infoTab === "activity" ? (
        <ThreadActivityTimeline conv={conv} />
      ) : (
      <>

      {/* Section: Schedule */}
      {(conv.pinned.schedule || conv.pinned.callTime || conv.date) && (
        <InfoSection icon="calendar" label="Schedule">
          <div style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.5 }}>
            {conv.date && <div style={{ fontWeight: 500 }}>{conv.date}</div>}
            {conv.pinned.schedule && (
              <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 3 }}>
                {conv.pinned.schedule}
              </div>
            )}
          </div>
        </InfoSection>
      )}

      {/* Section: Location */}
      {conv.location && (
        <InfoSection icon="map-pin" label="Location">
          <div style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.5 }}>{conv.location}</div>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(conv.location)}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 8,
              fontSize: 11.5,
              fontWeight: 600,
              color: COLORS.indigo,
              textDecoration: "none",
            }}
          >
            <Icon name="external" size={11} color={COLORS.indigo} />
            Open in Maps
          </a>
        </InfoSection>
      )}

      {/* Section: Transport */}
      {conv.pinned.transport && (
        <InfoSection icon="external" label="Transport">
          <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.55 }}>
            {conv.pinned.transport}
          </div>
        </InfoSection>
      )}

      {/* Section: Your rate / Your take + change-request affordance */}
      {(conv.amountToYou || conv.pinned.rate) && (
        <InfoSection
          icon="info"
          label={conv.amountToYou ? "Your take-home" : conv.pinned.rate?.status === "you-quoted" ? "Your rate" : conv.pinned.rate?.status === "client-budget" ? "Client budget" : "Agreed rate"}
          locked={isLocked}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600, color: COLORS.green, fontFamily: FONTS.display, letterSpacing: -0.1 }}>
            {conv.amountToYou ?? conv.pinned.rate?.value ?? "—"}
          </div>
          {isLocked && (
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
              You see your take-home only. Full offer is between the agency and the client.
            </div>
          )}
          {/* Talent can ALWAYS request a change — even on a locked
              booking. Useful for scope creep, additional days, usage
              extensions. Sends a structured change-request to the
              coordinator who negotiates with the client. */}
          <RateChangeRequest currentValue={conv.amountToYou ?? conv.pinned.rate?.value ?? ""} />
        </InfoSection>
      )}

      {/* Section: Coordinator note (private) */}
      {conv.pinned.coordinatorNote && (
        <InfoSection icon="info" label="From your coordinator (private)">
          <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.55, fontStyle: "italic" }}>
            "{conv.pinned.coordinatorNote}"
          </div>
        </InfoSection>
      )}

      {/* Section: Leader */}
      <InfoSection icon="user" label="Leader on this">
        <button
          type="button"
          onClick={() => openDrawer("talent-agency-relationship")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 10px",
            background: "rgba(11,11,13,0.03)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: FONTS.body,
          }}
        >
          <Avatar size={28} tone="ink" initials={conv.leader.initials} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>{conv.leader.name}</div>
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>{conv.leader.role}</div>
          </div>
          <Icon name="chevron-right" size={11} color={COLORS.inkDim} />
        </button>
      </InfoSection>

      {/* Section: Files (mock counts based on stage) */}
      <InfoSection icon="external" label="Files & attachments">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            { name: "Mood board (4 images)", kind: "📷" },
            ...(conv.stage === "booked" ? [
              { name: "Vogue_callsheet_v2.pdf", kind: "📄" },
              { name: "Vogue_Italia_Editorial_May14-15.pdf", kind: "📑" },
            ] : []),
            ...(conv.stage === "past" ? [
              { name: "Loewe_invoice_Apr18.pdf", kind: "📄" },
              { name: "Selects (12 images)", kind: "📷" },
            ] : []),
          ].map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toast(`Open ${f.name}`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.ink,
                transition: `background ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 14 }}>{f.kind}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.name}
              </span>
            </button>
          ))}
        </div>
      </InfoSection>

      {/* Stage-specific actions: drop / cancel (when booked); resolve
          (when hold conflict) */}
      {conv.stage === "booked" && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <button
            type="button"
            onClick={() => toast("Drop request sent to coordinator")}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "transparent",
              border: `1px solid ${COLORS.coral}`,
              color: COLORS.coralDeep,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.coralSoft)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Drop / cancel booking
          </button>
          <p style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
            Sends a cancel request to your coordinator. They negotiate with the client.
          </p>
        </div>
      )}
      {conv.id === "c4" && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <button
            type="button"
            onClick={() => toast("Opened conflict resolver")}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: COLORS.coral,
              border: "none",
              color: "#fff",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            ✨ Resolve conflict
          </button>
          <p style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
            This thread overlaps with another booking. Open the smart resolver to pick a path.
          </p>
        </div>
      )}
      </>
      )}
    </aside>
  );
}

/**
 * Info-sidebar header with Details / Activity tabs. The "Activity" tab
 * shows a chronological log of stage transitions, status changes, and
 * key actions on this thread — useful for quick handover or compliance.
 */
function InfoSidebarHeader({ onClose, tab, onTabChange }: {
  onClose: () => void;
  tab: "details" | "activity";
  onTabChange: (t: "details" | "activity") => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px 0 16px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <div role="tablist" aria-label="Info tabs" style={{ display: "inline-flex", gap: 0 }}>
        {(["details", "activity"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t)}
              style={{
                padding: "8px 4px 10px",
                marginRight: 16,
                background: "transparent",
                border: "none",
                borderBottom: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                color: active ? COLORS.ink : COLORS.inkMuted,
                fontFamily: FONTS.display,
                fontSize: 13.5,
                fontWeight: active ? 500 : 400,
                letterSpacing: -0.05,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close info panel"
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          border: "none",
          background: "transparent",
          color: COLORS.inkMuted,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

/**
 * Activity timeline — shows the lifecycle of this conversation as a
 * timeline (stage transitions, calendar invites accepted, rates quoted,
 * etc.). Mock seeded from the conversation messages — in production this
 * would be a server-side activity log.
 */
function ThreadActivityTimeline({ conv }: { conv: Conversation }) {
  // Mock activity events derived from the conv state. Real impl would
  // query the activity_log table filtered by conversation_id.
  type TimelineEvent = { actor: string; action: string; target: string; timestamp: string; icon: string };
  const events: TimelineEvent[] = [
    { actor: "System",      action: "created inquiry from",  target: conv.client,           timestamp: "Apr 22 · 10:14", icon: "📩" },
    { actor: "Sara",        action: "assigned as",           target: "coordinator",          timestamp: "Apr 23 · 09:00", icon: "👤" },
    { actor: "Coordinator", action: "quoted rate",           target: "€1,200/day",           timestamp: "Apr 24 · 14:32", icon: "💸" },
    ...(conv.stage === "hold" || conv.stage === "booked" ? [
      { actor: "System",    action: "opened hold for",       target: conv.date ?? "TBD",     timestamp: "Apr 26 · 09:00", icon: "📅" },
    ] : []),
    ...(conv.stage === "booked" ? [
      { actor: "Client",    action: "confirmed booking",     target: "",                     timestamp: "Apr 27 · 11:18", icon: "✅" },
      { actor: "System",    action: "issued contract",       target: "",                     timestamp: "Apr 27 · 11:20", icon: "📑" },
    ] : []),
  ];
  return (
    <div style={{ padding: "16px 18px" }}>
      {/* Vertical timeline line runs behind the ActivityFeedItem icon circles */}
      <div style={{ position: "relative" }}>
        {events.length > 1 && (
          <div style={{
            position: "absolute",
            top: 24,
            bottom: 24,
            left: 13,
            width: 2,
            background: COLORS.borderSoft,
            borderRadius: 1,
          }} />
        )}
        {events.map((e, i) => (
          <ActivityFeedItem
            key={i}
            actor={e.actor}
            action={e.action}
            target={e.target}
            timestamp={e.timestamp}
            icon={e.icon}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Inline rate-change request — the talent can always ask for more,
 * even on a locked booking. Submits a structured request to the
 * coordinator (private), who decides whether/how to take it to the
 * client. The submission also drops a system-style message in the
 * chat thread so the request is visible in the timeline.
 */
function RateChangeRequest({ currentValue }: { currentValue: string }) {
  const { toast } = useProto();
  const [open, setOpen] = useState(false);
  const [proposed, setProposed] = useState("");
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "transparent",
          border: "none",
          padding: 0,
          marginTop: 8,
          cursor: "pointer",
          fontFamily: FONTS.body,
          fontSize: 11.5,
          fontWeight: 600,
          color: COLORS.indigo,
        }}
      >
        Request a change →
      </button>
    );
  }
  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: "rgba(11,11,13,0.03)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        fontFamily: FONTS.body,
        animation: "tulala-fade-in .15s ease",
      }}
    >
      <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 8, lineHeight: 1.5 }}>
        Currently <strong style={{ color: COLORS.ink }}>{currentValue || "—"}</strong>.
        Your reply goes private to the coordinator first.
      </div>
      <input
        type="text"
        placeholder="Proposed (e.g. €4,000)"
        value={proposed}
        onChange={(e) => setProposed(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.ink,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 6,
          marginBottom: 6,
          boxSizing: "border-box",
        }}
      />
      <textarea
        placeholder="Reason (optional) — e.g. scope expanded, extra usage…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.ink,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 6,
          marginBottom: 8,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => { setOpen(false); setProposed(""); setReason(""); }}
          style={{
            padding: "5px 10px",
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!proposed.trim()}
          onClick={() => {
            if (!proposed.trim()) return;
            toast(`Rate change request sent to coordinator · ${currentValue || "—"} → ${proposed}`);
            setOpen(false);
            setProposed("");
            setReason("");
          }}
          aria-disabled={!proposed.trim()}
          title={!proposed.trim() ? "Enter a proposed amount first" : ""}
          style={{
            padding: "5px 10px",
            background: COLORS.fill,
            border: "none",
            borderRadius: 6,
            cursor: !proposed.trim() ? "not-allowed" : "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 600,
            color: "#fff",
            opacity: !proposed.trim() ? 0.4 : 1,
            transition: "opacity .15s, background .15s",
          }}
        >
          Send request
        </button>
      </div>
    </div>
  );
}

function InfoSection({
  icon,
  label,
  locked,
  children,
}: {
  icon: "map-pin" | "calendar" | "external" | "info" | "user";
  label: string;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
          marginBottom: 8,
        }}
      >
        <Icon name={icon} size={11} color={COLORS.inkMuted} stroke={1.7} />
        {label}
        {locked && <span aria-label="locked" style={{ marginLeft: 4 }}>🔒</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Premium message stream renderer. Groups by day and inserts subtle
 * date separators between blocks. Also handles consecutive-from-same-
 * sender visual grouping (tighter spacing, avatar only on first).
 *
 * The "New messages" divider appears before the (unreadCount)-th
 * latest non-self message — matches WhatsApp/iMessage behaviour.
 */
// ─── WS-13.3: Virtuoso scroll-behavior helper ─────────────────────────────────
/** Maps our scrollBehavior() ("smooth"|"instant") to Virtuoso's narrower
 *  "smooth"|"auto" union.  "instant" → "auto" because Virtuoso treats
 *  "auto" as the non-animated option, matching prefers-reduced-motion. */
function vsb(): "smooth" | "auto" {
  return scrollBehavior() === "smooth" ? "smooth" : "auto";
}

// ─── WS-13.3: Data-driven renderables for Virtuoso virtualization ─────────────
type MsgRenderable =
  | { kind: "separator"; label: string }
  | { kind: "unread-divider"; count: number }
  | { kind: "message"; msg: Msg; stage: MsgStage; isFirstOfGroup: boolean }
  | { kind: "typing"; typingName: string };

function buildMsgRenderables(messages: Msg[], stage: MsgStage, typingName: string, unreadCount = 0): MsgRenderable[] {
  const out: MsgRenderable[] = [];
  let lastDay: string | null = null;
  let lastSender: string | null = null;
  let firstUnreadIdx = -1;
  if (unreadCount > 0) {
    const incoming: number[] = [];
    messages.forEach((m, i) => {
      const isSelf = "sender" in m && m.sender === "you";
      if (!isSelf && m.kind !== "system") incoming.push(i);
    });
    if (incoming.length >= unreadCount) {
      firstUnreadIdx = incoming[incoming.length - unreadCount]!;
    }
  }
  messages.forEach((m, i) => {
    const day = extractDay(m.ts);
    if (day !== lastDay) {
      out.push({ kind: "separator", label: day });
      lastDay = day;
      lastSender = null;
    }
    if (i === firstUnreadIdx) {
      out.push({ kind: "unread-divider", count: unreadCount });
      lastSender = null;
    }
    const senderId = m.kind === "system" || !("sender" in m) ? "system" : m.sender;
    const isFirstOfGroup = senderId !== lastSender;
    out.push({ kind: "message", msg: m, stage, isFirstOfGroup });
    lastSender = senderId ?? null;
  });
  if (stage === "inquiry") out.push({ kind: "typing", typingName });
  return out;
}

/** @deprecated Use buildMsgRenderables + Virtuoso instead. Kept only as
 *  a reference of the pre-WS-13.3 render pattern. */
function renderMessagesWithSeparators(messages: Msg[], stage: MsgStage, typingName: string, unreadCount = 0) {
  return buildMsgRenderables(messages, stage, typingName, unreadCount).map((item, i) => {
    if (item.kind === "separator") return <DaySeparator key={`sep-${i}`} label={item.label} />;
    if (item.kind === "unread-divider") return <NewMessagesDivider key={`unread-${i}`} count={item.count} />;
    if (item.kind === "typing") return <TypingIndicator key="typing" name={item.typingName} />;
    return <MessageBubble key={item.msg.id} msg={item.msg} stage={item.stage} isFirstOfGroup={item.isFirstOfGroup} />;
  });
}

function NewMessagesDivider({ count }: { count: number }) {
  return (
    <div
      role="separator"
      aria-label={`${count} new messages`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "8px 0 4px",
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "rgba(194,106,69,0.30)" }} />
      <span style={{
        fontSize: 10.5,
        fontWeight: 700,
                color: COLORS.coral,
        background: "rgba(194,106,69,0.08)",
        padding: "3px 9px",
        borderRadius: 999,
      }}>
        New · {count}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(194,106,69,0.30)" }} />
    </div>
  );
}

/**
 * AI thread summary card — sticky-ish at top of the message stream.
 * Collapsible. Synthesizes the current state of a thread in 1-3 lines
 * so a returning talent doesn't have to scroll back through 40 messages
 * to remember "where are we with Bvlgari".
 *
 * In production this would come from a server-side LLM digest of the
 * thread; here we mock per-stage copy from the conversation metadata.
 */
function AIThreadSummary({ conv, open, onToggle }: { conv: Conversation; open: boolean; onToggle: () => void }) {
  // Mock per-stage summary that pulls in real conv fields so the copy
  // feels written, not templated. Date strings get a CET timezone
  // suffix so cross-timezone talent know how the dates resolve.
  const dateWithZone = conv.date ? `${conv.date} CET` : "";
  const summary =
    conv.stage === "booked"
      ? `Booked · ${conv.brief}${dateWithZone ? ` · ${dateWithZone}` : ""}. Rate locked, transport agreed. Next: callsheet by Friday.`
      : conv.stage === "hold"
        ? `Holding ${dateWithZone || "dates"} for ${conv.brief}. Awaiting confirmation by client. ${conv.unreadCount > 0 ? `${conv.unreadCount} new from coordinator.` : ""}`
        : conv.stage === "inquiry"
          ? `Inquiry: ${conv.brief}. Coordinator collecting info. Rate not yet quoted.`
          : `Past · ${conv.brief}. Archived for reference.`;
  return (
    <div
      data-tulala-ai-summary
      style={{
        background: "linear-gradient(135deg, rgba(15,79,62,0.05) 0%, rgba(60,90,108,0.05) 100%)",
        border: "1px solid rgba(15,79,62,0.15)",
        borderRadius: 12,
        padding: open ? "10px 12px" : "8px 12px",
        marginBottom: 6,
        fontFamily: FONTS.body,
        transition: "all .18s ease",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
        }}
      >
        <span aria-hidden style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "rgba(15,79,62,0.15)",
          color: COLORS.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}>✨</span>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
                    color: COLORS.accent,
          flexShrink: 0,
        }}>AI summary</span>
        <span style={{
          flex: 1,
          fontSize: 12,
          color: COLORS.inkMuted,
          whiteSpace: open ? "normal" : "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "left",
        }}>
          {!open && summary}
        </span>
        <span aria-hidden style={{
          fontSize: 10,
          color: COLORS.inkMuted,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform .2s ease",
          flexShrink: 0,
        }}>▾</span>
      </button>
      {open && (
        <div style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid rgba(15,79,62,0.10)",
          fontSize: 13,
          lineHeight: 1.5,
          color: COLORS.ink,
        }}>
          {summary}
        </div>
      )}
    </div>
  );
}

function extractDay(ts: string): string {
  // ts looks like "Apr 28 · 10:14" or "5h ago" or "Yesterday · 16:42"
  if (ts.includes("ago")) return "Today";
  if (ts.startsWith("Yesterday")) return "Yesterday";
  // "Apr 28 · ..." or "May 1 · ..."
  const match = ts.match(/^([A-Z][a-z]+ \d+)/);
  return match ? match[1]! : ts;
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "16px 4px 8px",
        fontFamily: FONTS.body,
      }}
    >
      <span style={{ flex: 1, height: 1, background: "rgba(11,11,13,0.06)" }} />
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "rgba(11,11,13,0.06)" }} />
    </div>
  );
}

function MessageBubble({ msg, stage, isFirstOfGroup = true }: { msg: Msg; stage: MsgStage; isFirstOfGroup?: boolean }) {
  const fromYou = "sender" in msg && msg.sender === "you";
  const isSystem = msg.kind === "system";
  const isAction = msg.kind.startsWith("action-") || msg.kind === "calendar-invite" || msg.kind === "contract-sign" || msg.kind === "polaroid-request" || msg.kind === "payment-receipt";

  if (isSystem) {
    // Premium system message — subtle, italic, centered. No background
    // pill (felt heavy). Just a small caption with a refined dot.
    return (
      <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 6px", fontFamily: FONTS.body }}>
        <span
          style={{
            fontSize: 10.5,
            color: COLORS.inkMuted,
            fontStyle: "italic",
            letterSpacing: 0.05,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: COLORS.inkDim }} />
          {msg.body}
          <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: COLORS.inkDim }} />
        </span>
      </div>
    );
  }

  const align = fromYou ? "flex-end" : "flex-start";

  if (isAction) {
    return (
      <div style={{ display: "flex", justifyContent: align, fontFamily: FONTS.body, marginTop: isFirstOfGroup ? 8 : 0 }}>
        <ActionMessage msg={msg} fromYou={fromYou} stage={stage} />
      </div>
    );
  }

  // Regular content message — premium grouped layout.
  // First-in-group: shows avatar (incoming) + sender label
  // Subsequent: tighter spacing, avatar slot reserved (visually empty)
  // for vertical alignment.
  const senderLabel = "sender" in msg
    ? msg.sender === "coordinator"
      ? "Sara · Coordinator"
      : msg.sender === "agency"
        ? "Atelier Roma"
        : msg.sender === "client"
          ? "Client"
          : ""
    : "";
  return (
    <div style={{
      display: "flex",
      justifyContent: align,
      gap: 10,
      fontFamily: FONTS.body,
      marginTop: isFirstOfGroup ? 8 : 0,
    }}>
      {!fromYou && (
        isFirstOfGroup && "sender" in msg ? (
          <Avatar
            size={28}
            tone="auto"
            hashSeed={msg.sender}
            initials={msg.sender === "client" ? "" : msg.sender === "coordinator" ? "SM" : msg.sender === "agency" ? "AC" : ""}
          />
        ) : (
          <span style={{ width: 28, flexShrink: 0 }} aria-hidden />
        )
      )}
      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 3 }}>
        {!fromYou && isFirstOfGroup && senderLabel && (
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
              paddingLeft: 4,
            }}
          >
            {senderLabel}
          </div>
        )}
        <BubbleWithActions msg={msg} fromYou={fromYou}>
          <ContentMessageBody msg={msg} fromYou={fromYou} isFirstOfGroup={isFirstOfGroup} />
        </BubbleWithActions>
        <ReadReceiptRow msg={msg} fromYou={fromYou} />
      </div>
    </div>
  );
}

/**
 * SendButtonWithSchedule — primary send + long-press menu offering
 * "Schedule send" presets (Tomorrow 9am, Monday 9am, Custom). Right-click
 * also opens the menu. Useful for talent in different timezones who don't
 * want to ping coordinators at 11pm.
 */
function SendButtonWithSchedule({ disabled, onSend, onSchedule }: {
  disabled: boolean;
  onSend: () => void;
  onSchedule: (when: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressRef = useRef<number | null>(null);
  const close = () => setMenuOpen(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-tulala-send-menu]')) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { if (!disabled) onSend(); }}
        onContextMenu={(e) => { e.preventDefault(); if (!disabled) setMenuOpen(true); }}
        onTouchStart={() => {
          if (longPressRef.current) window.clearTimeout(longPressRef.current);
          longPressRef.current = window.setTimeout(() => { if (!disabled) setMenuOpen(true); }, 450);
        }}
        onTouchEnd={() => {
          if (longPressRef.current) window.clearTimeout(longPressRef.current);
        }}
        onTouchCancel={() => {
          if (longPressRef.current) window.clearTimeout(longPressRef.current);
        }}
        aria-label="Send"
        title="Tap to send · long-press / right-click for schedule"
        disabled={disabled}
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "none",
          background: !disabled ? COLORS.fill : "rgba(11,11,13,0.06)",
          color: !disabled ? "#fff" : COLORS.inkDim,
          cursor: !disabled ? "pointer" : "not-allowed",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: `background ${TRANSITION.micro}`,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
      {menuOpen && (
        <div
          data-tulala-send-menu
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(11,11,13,0.15)",
            padding: 6,
            zIndex: 30,
            minWidth: 200,
            fontFamily: FONTS.body,
            animation: "tulala-bubble-action-in .14s ease",
          }}
        >
          <div style={{
            fontSize: 10,
            fontWeight: 700,
                        color: COLORS.inkMuted,
            padding: "6px 10px 4px",
          }}>Schedule send</div>
          {[
            { label: "Tomorrow · 9:00", value: "tomorrow at 9:00 AM" },
            { label: "Monday · 9:00", value: "Monday at 9:00 AM" },
            { label: "In 1 hour", value: "in 1 hour" },
            { label: "Custom…", value: "custom time" },
          ].map((opt) => (
            <BubbleMenuItem
              key={opt.label}
              icon="🕓"
              label={opt.label}
              onClick={() => { onSchedule(opt.value); close(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * BubbleWithActions — wraps a chat bubble with hover/long-press actions:
 *   - Hover (desktop): small ⋯ trigger appears on the bubble's far side
 *   - Long-press (touch): same menu opens at the bubble
 *   - Right-click (desktop): same menu (contextmenu)
 *
 * The menu offers a quick-reaction row (👍 ❤️ 😂 ⭐ ❓ 🙏) plus the
 * standard chat actions: Reply, Copy, Pin, Translate, Forward, Schedule.
 *
 * Reactions render as small chips below the bubble. State is local to
 * this component and seeded from MOCK_REACTIONS for demonstration.
 */
function BubbleWithActions({ msg, fromYou, children }: { msg: Msg; fromYou: boolean; children: ReactNode }) {
  const { toast } = useProto();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactions, setReactions] = useState<string[]>(() => MOCK_REACTIONS[msg.id] ?? []);
  const longPressRef = useRef<number | null>(null);
  const close = () => setMenuOpen(false);
  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-tulala-bubble-menu]')) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  const onTouchStart = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => setMenuOpen(true), 450);
  };
  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };
  const addReaction = (e: string) => {
    setReactions((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
    close();
  };
  const action = (label: string) => {
    toast(label);
    close();
  };
  return (
    <div
      style={{ position: "relative", display: "inline-flex", flexDirection: "column", gap: 4, alignItems: fromYou ? "flex-end" : "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      onTouchStart={onTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchCancel={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      <div style={{ position: "relative" }}>
        {children}
        {hovered && !menuOpen && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Message actions"
            style={{
              position: "absolute",
              top: -10,
              [fromYou ? "left" : "right"]: -10,
              width: 26,
              height: 26,
              borderRadius: 999,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              boxShadow: "0 2px 6px rgba(11,11,13,0.10)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              color: COLORS.inkMuted,
              animation: "tulala-bubble-action-in .12s ease",
              zIndex: 5,
            } as CSSProperties}
          >
            ···
          </button>
        )}
      </div>
      {reactions.length > 0 && (
        <div style={{ display: "inline-flex", gap: 4, paddingRight: fromYou ? 0 : 4, paddingLeft: fromYou ? 4 : 0 }}>
          {Array.from(new Set(reactions)).map((e) => {
            const count = reactions.filter((r) => r === e).length;
            return (
              <button
                key={e}
                type="button"
                onClick={() => addReaction(e)}
                title="Toggle reaction"
                style={{
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 999,
                  padding: "1px 6px 1px 5px",
                  fontFamily: FONTS.body,
                  fontSize: 11,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  lineHeight: 1.2,
                  boxShadow: "0 1px 2px rgba(11,11,13,0.04)",
                }}
              >
                <span style={{ fontSize: 12 }}>{e}</span>
                {count > 1 && <span style={{ color: COLORS.inkMuted }}>{count}</span>}
              </button>
            );
          })}
        </div>
      )}
      {menuOpen && (
        <div
          data-tulala-bubble-menu
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            [fromYou ? "right" : "left"]: 0,
            marginTop: 6,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(11,11,13,0.15)",
            padding: 6,
            zIndex: 20,
            minWidth: 200,
            animation: "tulala-bubble-action-in .14s ease",
          } as CSSProperties}
        >
          <style>{`
            @keyframes tulala-bubble-action-in {
              from { opacity: 0; transform: translateY(-4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {/* Reaction row */}
          <div style={{
            display: "flex",
            gap: 4,
            padding: "4px 4px 6px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            marginBottom: 4,
          }}>
            {["👍", "❤️", "😂", "⭐", "❓", "🙏"].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => addReaction(e)}
                aria-label={`React with ${e}`}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 18,
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: `transform ${TRANSITION.micro}, background ${TRANSITION.micro}`,
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = "rgba(11,11,13,0.05)"; ev.currentTarget.style.transform = "scale(1.15)"; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; ev.currentTarget.style.transform = "scale(1)"; }}
              >
                {e}
              </button>
            ))}
          </div>
          {/* Action menu */}
          <BubbleMenuItem icon="↩" label="Reply" onClick={() => action("Reply quoted")} />
          <BubbleMenuItem icon="📋" label="Copy" onClick={() => {
            try {
              if ("body" in msg && typeof msg.body === "string") navigator.clipboard?.writeText(msg.body);
            } catch { /* noop */ }
            action("Copied");
          }} />
          <BubbleMenuItem icon="📌" label="Pin" onClick={() => action("Pinned to thread top")} />
          <BubbleMenuItem icon="🌐" label="Translate to English" onClick={() => action("Translating…")} />
          <BubbleMenuItem icon="↗" label="Forward" onClick={() => action("Forward picker…")} />
        </div>
      )}
    </div>
  );
}

function BubbleMenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: FONTS.body,
        fontSize: 13,
        color: COLORS.ink,
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span aria-hidden style={{ width: 18, textAlign: "center", fontSize: 13 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/**
 * Premium voice-note bubble. Replaces the dotted-line waveform with a
 * deterministic bar-pattern generated from the message id (so each
 * voice note has a unique waveform shape, not a generic fill). Adds:
 *   - Real ▶/❚❚ play toggle that animates a fake progress sweep
 *   - 1×/1.5×/2× speed toggle (cycle on tap)
 *   - Tappable scrub (clicking a bar jumps progress to that bar)
 *   - Pulse animation while "playing"
 */
function VoiceNoteBubble({ msg, fromYou, bg, fg, border }: {
  msg: Extract<Msg, { kind: "voice" }>;
  fromYou: boolean;
  bg: string;
  fg: string;
  border: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  // Generate 28 bar heights deterministically from the id so the
  // waveform looks "voice-like" but stable across renders.
  const bars = (() => {
    const out: number[] = [];
    let h = 0;
    for (let i = 0; i < msg.id.length; i++) h = (h * 31 + msg.id.charCodeAt(i)) >>> 0;
    for (let i = 0; i < 28; i++) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      const v = ((h >> 16) % 100) / 100;
      // Apply an envelope so beginning/end are quieter
      const envelope = Math.sin((Math.PI * (i + 0.5)) / 28);
      out.push(0.25 + 0.75 * v * envelope);
    }
    return out;
  })();
  // Fake play progress sweep
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const startProgress = progress >= 1 ? 0 : progress;
    if (progress >= 1) setProgress(0);
    const totalMs = (msg.durationSec * 1000) / speed;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = startProgress + elapsed / totalMs;
      if (p >= 1) {
        setProgress(1);
        setPlaying(false);
        return;
      }
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, msg.durationSec]);
  const remaining = Math.max(0, msg.durationSec * (1 - progress));
  const remainStr = `0:${Math.ceil(remaining).toString().padStart(2, "0")}`;
  const activeColor = fromYou ? "rgba(255,255,255,0.95)" : COLORS.accent;
  const inactiveColor = fromYou ? "rgba(255,255,255,0.30)" : "rgba(11,11,13,0.20)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px 9px 10px",
        background: bg,
        color: fg,
        border,
        borderRadius: 999,
        minWidth: 240,
      }}
    >
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: fromYou ? "rgba(255,255,255,0.18)" : "rgba(11,11,13,0.06)",
          border: "none",
          color: fg,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          role="slider"
          aria-label="Voice note progress"
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setProgress(ratio);
          }}
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: 22,
            cursor: "pointer",
          }}
        >
          {bars.map((h, i) => {
            const barProgress = (i + 1) / bars.length;
            const isActive = barProgress <= progress;
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.round(h * 100)}%`,
                  background: isActive ? activeColor : inactiveColor,
                  borderRadius: 1,
                  transition: `background ${TRANSITION.micro}`,
                }}
              />
            );
          })}
        </div>
        {msg.transcript && (
          <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 1, lineHeight: 1.4 }}>
            "{msg.transcript}"
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11, opacity: 0.8, fontVariantNumeric: "tabular-nums" }}>
          {remainStr}
        </span>
        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))}
          aria-label={`Playback speed ${speed}x — tap to change`}
          style={{
            padding: "1px 6px",
            background: fromYou ? "rgba(255,255,255,0.15)" : "rgba(11,11,13,0.06)",
            border: "none",
            borderRadius: 999,
            color: fg,
            fontSize: 10,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            cursor: "pointer",
            opacity: speed === 1 ? 0.7 : 1,
          }}
        >
          {speed}×
        </button>
      </div>
    </div>
  );
}

function ContentMessageBody({ msg, fromYou, isFirstOfGroup = true }: { msg: Msg; fromYou: boolean; isFirstOfGroup?: boolean }) {
  // Premium bubble palette:
  //   You    — ink with very subtle inner sheen (linear gradient)
  //   Other  — pure white with thin 1px borderSoft + soft shadow
  // Border-radius is uniform on the side AWAY from sender; tail-corner
  // (4px) only on the first-in-group, otherwise also rounded for
  // grouped consecutive messages.
  const youBg = `linear-gradient(180deg, ${COLORS.ink} 0%, #1a1a1d 100%)`;
  const otherBg = "#fff";
  const fg = fromYou ? "#fff" : COLORS.ink;
  const border = fromYou ? "none" : `1px solid ${COLORS.borderSoft}`;
  const shadow = fromYou
    ? "0 1px 1px rgba(11,11,13,0.20)"
    : "0 1px 2px rgba(11,11,13,0.04)";
  const radius = fromYou
    ? (isFirstOfGroup ? "18px 18px 6px 18px" : "18px 18px 18px 18px")
    : (isFirstOfGroup ? "18px 18px 18px 6px" : "18px 18px 18px 18px");

  if (msg.kind === "text") {
    return (
      <div
        style={{
          background: fromYou ? youBg : otherBg,
          color: fg,
          border,
          borderRadius: radius,
          padding: "10px 15px",
          fontSize: 13.5,
          lineHeight: 1.5,
          boxShadow: shadow,
          letterSpacing: 0.05,
        }}
      >
        {msg.body}
      </div>
    );
  }
  const bg = fromYou ? COLORS.ink : "#fff";
  if (msg.kind === "image") {
    return (
      <div
        style={{
          background: bg,
          color: fg,
          border,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: msg.count === 1 ? "1fr" : "repeat(2, 1fr)",
            gap: 2,
          }}
        >
          {(() => {
            // Premium-feeling thumbnail mocks — pseudo-randomised gradient
            // mood blocks per index so a 4-up grid feels like distinct
            // images, not a wall of identical placeholders. Real product
            // would render <img> with blurhash; this is the prototype-grade
            // proxy that doesn't rely on emoji.
            const moods = [
              ["#3a4a5a", "#7a8d9a"],
              ["#a08070", "#c9b39a"],
              ["#5a6e58", "#a9b89a"],
              ["#2a2f3c", "#5a5e72"],
              ["#a0584a", "#c08a72"],
              ["#3e3a52", "#7a6a8e"],
            ];
            return Array.from({ length: Math.min(msg.count, 4) }).map((_, i) => {
              const [a, b] = moods[i % moods.length]!;
              const lastVisible = i === Math.min(msg.count, 4) - 1 && msg.count > 4;
              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: "4 / 3",
                    background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
                    position: "relative",
                    overflow: "hidden",
                  }}
                  aria-label={`Photo ${i + 1}`}
                >
                  {/* Subtle texture overlay so it reads as photo, not flat block */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "radial-gradient(120% 80% at 30% 20%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(80% 60% at 80% 90%, rgba(0,0,0,0.18) 0%, transparent 60%)",
                  }} />
                  {lastVisible && (
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "rgba(0,0,0,0.45)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 16, fontWeight: 600,
                      fontFamily: FONTS.body, letterSpacing: 0.2,
                    }}>
                      +{msg.count - 3}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
        {msg.caption && (
          <div style={{ padding: "7px 14px", fontSize: 12.5, color: fg }}>{msg.caption}</div>
        )}
      </div>
    );
  }
  if (msg.kind === "file") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: bg,
          color: fg,
          border,
          borderRadius: 12,
          minWidth: 220,
        }}
      >
        <span style={{ fontSize: 22 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{msg.filename}</div>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 1 }}>
            {msg.sizeKB} KB · PDF
          </div>
        </div>
        <span style={{ fontSize: 11, opacity: 0.7 }}>↓</span>
      </div>
    );
  }
  if (msg.kind === "voice") {
    return <VoiceNoteBubble msg={msg} fromYou={fromYou} bg={bg} fg={fg} border={border} />;
  }
  if (msg.kind === "location") {
    return (
      <a
        href={`https://maps.google.com/?q=${encodeURIComponent(msg.label)}`}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "block",
          background: bg,
          color: fg,
          border,
          borderRadius: 12,
          overflow: "hidden",
          textDecoration: "none",
          minWidth: 240,
        }}
      >
        <div
          style={{
            aspectRatio: "5 / 2",
            background: `linear-gradient(135deg, ${COLORS.indigoSoft}, rgba(91,107,160,0.20))`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
          }}
        >
          📍
        </div>
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: fromYou ? "#fff" : COLORS.ink }}>
            {msg.label}
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>Tap to open in Maps</div>
        </div>
      </a>
    );
  }
  return null;
}

function ReadReceiptRow({ msg, fromYou }: { msg: Msg; fromYou: boolean }) {
  if (!fromYou || !("ts" in msg)) return null;
  const readBy = "readBy" in msg ? msg.readBy : undefined;
  const isRead = !!(readBy && readBy.length > 0);
  const checkmark = isRead ? "✓✓" : "✓";
  const checkColor = isRead ? COLORS.green : COLORS.inkDim;
  // Mock read-time — in real product this is when the recipient opened
  // the thread. For prototype, derive a plausible time string from the
  // sent ts so it reads consistently. e.g. "Read at 4:32pm"
  const readAtLabel = isRead
    ? `Read by ${readBy?.[0] ?? "client"}${readBy && readBy.length > 1 ? ` +${readBy.length - 1}` : ""} · ${msg.ts}`
    : `Sent · ${msg.ts}`;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3, fontSize: 10.5, color: COLORS.inkMuted }}>
      <span>{msg.ts}</span>
      <span
        title={readAtLabel}
        aria-label={readAtLabel}
        style={{ color: checkColor, fontFamily: "monospace", cursor: "help" }}
      >
        {checkmark}
      </span>
    </div>
  );
}

function ActionMessage({ msg, fromYou, stage }: { msg: Msg; fromYou: boolean; stage: MsgStage }) {
  const { toast } = useProto();

  if (msg.kind === "action-rate") {
    const [val, setVal] = useState(msg.resolved ?? "");
    const submitted = !!msg.resolved;
    return (
      <div
        style={{
          background: "#fff",
          border: `1px solid ${submitted ? "rgba(46,125,91,0.30)" : "rgba(194,106,69,0.30)"}`,
          borderLeft: `3px solid ${submitted ? COLORS.green : COLORS.coral}`,
          borderRadius: 14,
          padding: "14px 16px",
          maxWidth: 380,
          fontFamily: FONTS.body,
          boxShadow: "0 1px 3px rgba(11,11,13,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>💸</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: submitted ? COLORS.green : COLORS.ink }}>
            {submitted ? "Rate sent to coordinator" : "What's your rate for this?"}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
          1 day, full usage (web + social, 12 months, EU). Lunch + transport included.
          {!submitted && " Your reply goes private to the coordinator first — they negotiate with the client."}
        </div>
        {submitted ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.green }}>€{val} / day</div>
            <div style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${COLORS.borderSoft}`,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10.5,
              color: COLORS.inkMuted,
            }}>
              <span style={{ color: COLORS.green, fontFamily: "monospace" }}>✓✓</span>
              <span>Sent · Viewed by coordinator · Awaiting decision</span>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                padding: "0 10px",
                flex: 1,
              }}
            >
              <span style={{ fontSize: 13, color: COLORS.inkMuted, marginRight: 6 }}>€</span>
              <input
                type="text"
                placeholder="1,800"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  padding: "8px 0",
                  color: COLORS.ink,
                }}
              />
              <span style={{ fontSize: 11, color: COLORS.inkMuted }}>/day</span>
            </div>
            <PrimaryButton size="sm" onClick={() => toast(`Rate sent privately to coordinator · €${val}/day`)}>
              Send
            </PrimaryButton>
          </div>
        )}
      </div>
    );
  }
  if (msg.kind === "action-transport") {
    return (
      <div style={{ background: "#fff", border: `1px solid rgba(194,106,69,0.30)`, borderLeft: `3px solid ${COLORS.coral}`, borderRadius: 14, padding: "12px 14px", maxWidth: 380, fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>🚖</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>Confirm your transport</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {msg.options.map((opt) => (
            <button
              key={opt}
              onClick={() => toast(`Transport · ${opt}`)}
              style={{
                background: "rgba(11,11,13,0.04)",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 999,
                padding: "5px 11px",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (msg.kind === "action-confirm") {
    return (
      <div style={{ background: "#fff", border: `1px solid rgba(194,106,69,0.30)`, borderLeft: `3px solid ${COLORS.coral}`, borderRadius: 14, padding: "12px 14px", maxWidth: 360, fontFamily: FONTS.body }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink, marginBottom: 10 }}>{msg.label}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <PrimaryButton size="sm" onClick={() => toast("Call sheet confirmed")}>Confirm</PrimaryButton>
          <SecondaryButton size="sm" onClick={() => toast("Issue noted — coordinator will follow up")}>Has issues</SecondaryButton>
        </div>
      </div>
    );
  }
  if (msg.kind === "calendar-invite") {
    // Mock conflict detection — Bvlgari hold (May 18-20) overlaps with
    // a fictional Mango shoot (May 18-19). The real implementation would
    // query the calendar surface; this static check is enough for the
    // prototype to demonstrate the conflict-warning UX.
    const hasConflict = msg.date.includes("18") && msg.title.toLowerCase().includes("bvlgari");
    return (
      <div style={{ background: "#fff", border: `1px solid ${hasConflict ? "rgba(176,52,52,0.30)" : COLORS.borderSoft}`, borderRadius: 14, padding: "12px 14px", maxWidth: 320, fontFamily: FONTS.body }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.indigo, marginBottom: 4 }}>
          📅 Calendar invite
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{msg.title}</div>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{msg.date}</div>
        {hasConflict && (
          <div style={{
            marginTop: 8,
            padding: "6px 8px",
            background: "rgba(176,52,52,0.06)",
            border: "1px solid rgba(176,52,52,0.20)",
            borderRadius: 8,
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            fontSize: 11.5,
            color: "#902a2a",
            lineHeight: 1.4,
          }}>
            <span aria-hidden style={{ fontSize: 12 }}>⚠</span>
            <span><strong>Conflicts with Mango (May 18–19)</strong> · already on hold</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <PrimaryButton size="sm" onClick={() => toast("Added to your calendar")}>Add</PrimaryButton>
          <SecondaryButton size="sm" onClick={() => toast("Declined")}>Decline</SecondaryButton>
        </div>
      </div>
    );
  }
  if (msg.kind === "contract-sign") {
    return (
      <div style={{ background: "#fff", border: `1px solid ${msg.resolved ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`, borderRadius: 14, padding: "12px 14px", maxWidth: 360, fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>📑</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{msg.resolved ? "Contract signed" : "Sign contract"}</span>
          {msg.resolved && <span style={{ color: COLORS.green, fontSize: 11, fontWeight: 600 }}>✓</span>}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 8 }}>{msg.filename}</div>
        {!msg.resolved && (
          <PrimaryButton size="sm" onClick={() => toast("Opening signing flow…")}>Review & sign</PrimaryButton>
        )}
      </div>
    );
  }
  if (msg.kind === "polaroid-request") {
    return (
      <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: "12px 14px", maxWidth: 360, fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>📸</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
            Polaroids requested {msg.resolved ? `· ${msg.resolved} sent` : ""}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 8 }}>
          Recent, unretouched, full-body + face. 5 minimum.
        </div>
        {msg.resolved ? (
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>✓ {msg.resolved} polaroids delivered</div>
        ) : (
          <PrimaryButton size="sm" onClick={() => toast("Open camera roll…")}>Upload polaroids</PrimaryButton>
        )}
      </div>
    );
  }
  if (msg.kind === "payment-receipt") {
    return (
      <div style={{ background: "rgba(46,125,91,0.06)", border: `1px solid rgba(46,125,91,0.25)`, borderRadius: 14, padding: "12px 14px", maxWidth: 320, fontFamily: FONTS.body }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.green, marginBottom: 4 }}>
          ✓ Paid
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.ink, fontFamily: FONTS.display, letterSpacing: -0.2 }}>
          {msg.amount}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>via {msg.method} · {msg.ts}</div>
      </div>
    );
  }
  return null;
}

function TypingIndicator({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0 0 6px", fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted }}>
      <span style={{ display: "inline-flex", gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: COLORS.inkMuted,
              animation: `tulala-typing 1.2s infinite ease-in-out ${i * 0.15}s`,
              display: "inline-block",
            }}
          />
        ))}
      </span>
      {name} is typing…
      <style>{`
        @keyframes tulala-typing {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

function Composer({ conv, isLocked, onAfterSend }: { conv: Conversation; isLocked: boolean; onAfterSend?: () => void }) {
  const { toast } = useProto();
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  // @mention (#33) — show a small autocomplete popup when the user
  // types "@". Stub with mock teammates; real version queries the API.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const MENTION_NAMES = ["Marta Reyes", "Kai Lin", "Tomás Navarro", "Lina Park"];
  const mentionMatches = mentionQuery !== null
    ? MENTION_NAMES.filter((n) => n.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : [];
  // Smart replies are now opt-in via a ✨ toggle in the composer row,
  // not forced. Real-estate-respecting per design feedback.
  const [smartOpen, setSmartOpen] = useState(false);

  // Smart-reply chips — context-aware (mock)
  const smartReplies = isLocked
    ? ["Confirmed", "On my way 🚖", "Running 5 min late"]
    : conv.stage === "inquiry"
      ? ["Yes, available", "Need more info", "Send rate via 💸 above"]
      : ["Holding 👍", "Sounds good", "Will confirm later today"];

  // Quick-quote chips — when on inquiry/hold stages, prefilled rate
  // suggestions from the talent's recent history. The chip inserts a
  // rate sentence into the input, the talent edits as needed before
  // sending. Mocked from a static "history" so the prototype shows the
  // pattern without wiring a real rates API.
  const quickQuotes = (conv.stage === "inquiry" || conv.stage === "hold")
    ? [
        { rate: "€1,200/day", note: `Last with ${conv.client}` },
        { rate: "€950/day", note: "Last editorial" },
        { rate: "€1,800/day", note: "Top this month" },
      ]
    : [];

  return (
    <div
      style={{
        borderTop: `1px solid ${COLORS.borderSoft}`,
        padding: "10px 14px 12px",
        background: "#fff",
        position: "relative",
      }}
    >
      {/* Smart-reply chips — only visible when toggled on. Tap a chip
          to insert it into the input; tap again to refine. Hidden by
          default so the composer doesn't take extra real estate.
          On rate-relevant stages, quick-quote chips appear above the
          smart-replies — preset rates from talent history. */}
      {smartOpen && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 8,
            animation: "tulala-smart-fade .18s ease",
          }}
        >
          <style>{`@keyframes tulala-smart-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {quickQuotes.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                                color: COLORS.inkMuted,
                alignSelf: "center",
                marginRight: 2,
              }}>Quick quote</span>
              {quickQuotes.map((q) => (
                <button
                  key={q.rate}
                  type="button"
                  onClick={() => { setText(`My rate is ${q.rate}, full usage included.`); setSmartOpen(false); }}
                  title={q.note}
                  style={{
                    background: "rgba(15,79,62,0.06)",
                    border: "1px solid rgba(15,79,62,0.18)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 11.5,
                    color: COLORS.accent,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{q.rate}</span>
                  <span style={{ opacity: 0.7, fontSize: 10.5 }}>· {q.note}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
                            color: COLORS.inkMuted,
              alignSelf: "center",
              marginRight: 2,
            }}>Quick reply</span>
          {smartReplies.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setText(r); setSmartOpen(false); }}
              style={{
                background: "rgba(11,11,13,0.04)",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 999,
                padding: "4px 10px",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
                color: COLORS.ink,
              }}
            >
              {r}
            </button>
          ))}
          </div>
        </div>
      )}

      {/* @mention popup (#33) */}
      {mentionMatches.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 14,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(11,11,13,0.14)",
            padding: 4,
            zIndex: 30,
            fontFamily: FONTS.body,
            minWidth: 180,
          }}
        >
          {mentionMatches.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitem"
              onClick={() => {
                const cursor = text.lastIndexOf("@");
                setText(text.slice(0, cursor) + `@${name} `);
                setMentionQuery(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 10px",
                background: "transparent",
                border: "none",
                borderRadius: 7,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONTS.body,
                fontSize: 13,
                color: COLORS.ink,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accentSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: COLORS.surfaceAlt,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: COLORS.ink,
                  flexShrink: 0,
                }}
              >
                {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </span>
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Composer row — premium pill shape with subtle inner shadow */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 999,
          padding: "5px 6px 5px 8px",
          boxShadow: "inset 0 1px 2px rgba(11,11,13,0.025)",
        }}
      >
        {/* Attach trigger */}
        <button
          type="button"
          onClick={() => setAttachOpen((v) => !v)}
          aria-label="Attach"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.inkMuted,
          }}
        >
          <Icon name="plus" size={14} stroke={2} />
        </button>
        {/* Smart-reply toggle — ✨ icon. Active state when chips visible. */}
        <button
          type="button"
          onClick={() => setSmartOpen((v) => !v)}
          aria-label={smartOpen ? "Hide smart replies" : "Show smart replies"}
          aria-pressed={smartOpen}
          title="Smart replies (AI suggestions)"
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            border: smartOpen ? `1px solid ${COLORS.accentDeep}` : "none",
            background: smartOpen ? COLORS.accentSoft : "transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}
        >
          ✨
        </button>
        <textarea
          rows={1}
          placeholder={isLocked ? "Locked thread — only chat allowed" : "Message…"}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            // @mention detection (#33) — find "@word" at cursor
            const cursor = e.target.selectionStart ?? v.length;
            const before = v.slice(0, cursor);
            const match = before.match(/@(\w*)$/);
            setMentionQuery(match ? match[1]! : null);
            // Auto-grow up to ~5 rows then scroll. Reset before measuring.
            const el = e.currentTarget;
            el.style.height = "auto";
            const max = 5 * 20; // ~5 lines of 20px line-height
            el.style.height = Math.min(el.scrollHeight, max) + "px";
          }}
          onFocus={(e) => {
            // Mobile keyboard avoidance — bring composer above keyboard.
            // Defer slightly so the keyboard is in view before scroll.
            setTimeout(() => {
              try { e.target.scrollIntoView({ block: "end", behavior: scrollBehavior() }); } catch { /* noop */ }
            }, 250);
          }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter inserts a newline (chat convention)
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) {
                setText("");
                e.currentTarget.style.height = "auto";
                toast("Sent");
              }
            }
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily: FONTS.body,
            fontSize: 13,
            lineHeight: "20px",
            color: COLORS.ink,
            padding: "8px 0",
            maxHeight: 100,
            overflowY: "auto",
          }}
        />
        {/* Voice + send */}
        <button
          type="button"
          aria-label="Voice note"
          title="Hold to record"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.inkMuted,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <SendButtonWithSchedule disabled={!text.trim()} onSend={() => {
          if (!text.trim()) return;
          toast("Message sent");
          setText("");
          onAfterSend?.();
        }} onSchedule={(when) => {
          if (!text.trim()) return;
          toast(`Scheduled for ${when}`, { action: { label: "Cancel", onClick: () => toast("Schedule cancelled") } });
          setText("");
          onAfterSend?.();
        }} />
      </div>

      {/* Attach menu — popover above composer on desktop, slides up
          as a bottom sheet on mobile (CSS overrides at <720px). */}
      {attachOpen && (
        <div
          data-tulala-attach-menu
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 14,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 6px 24px rgba(11,11,13,0.10)",
            padding: 6,
            display: "grid",
            gridTemplateColumns: "repeat(3, 90px)",
            gap: 4,
            fontFamily: FONTS.body,
            zIndex: 20,
          }}
        >
          {[
            { icon: "📷", label: "Photo" },
            { icon: "📄", label: "File" },
            { icon: "📍", label: "Location" },
            { icon: "🎙️", label: "Voice" },
            { icon: "📅", label: "Calendar" },
            { icon: "💸", label: "Quote rate" },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => { toast(`${a.label} — coming soon`); setAttachOpen(false); }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "10px 6px",
                background: "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11,
                color: COLORS.inkMuted,
                transition: `background ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 20 }}>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
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
  const { openDrawer, setTalentPage, toast } = useProto();
  const goToMessages = (riOrConvId: string) => {
    pinNextConversationT(TALENT_INQUIRY_TO_CONV[riOrConvId] ?? riOrConvId);
    setTalentPage("messages");
  };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("action");
  // Audit #23 — bulk-select state. Set of row keys (`${source}-${id}`).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Audit #24 — saved views. Persisted per-session; production reads
  // from a `talent_saved_views` table.
  const [savedView, setSavedView] = useState<string>("default");
  // Audit #26 — smart-sort axis.
  const [sortAxis, setSortAxis] = useState<"urgency" | "newest" | "value" | "fit">("urgency");
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
        onOpen: () => goToMessages(i.id),
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
        onOpen: () => goToMessages(r.inquiryId ?? r.id),
      };
    }),
  ];

  // Audit #24 — saved-view filter rules. Each view is a function that
  // takes the items and returns the subset.
  const applySavedView = (its: InboxItem[]) => {
    if (savedView === "verified") return its.filter((it) => it.clientTrust !== "basic");
    if (savedView === "expiring") return its.filter((it) => (it.ageHrs ?? 0) > 16);
    if (savedView === "agency") return its.filter((it) => it.agency !== undefined);
    return its;
  };

  // Apply search + filter + saved view
  const filtered = applySavedView(
    items.filter((it) => {
      if (filter !== "all" && it.category !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!it.client.toLowerCase().includes(q) && !it.brief.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    }),
  );

  // Audit #26 — smart sort. Mutates filtered's sort axis.
  const sorted = [...filtered].sort((a, b) => {
    if (sortAxis === "newest") return (a.ageHrs ?? 0) - (b.ageHrs ?? 0);
    if (sortAxis === "value") {
      const valA = parseFloat((a.amount ?? "0").replace(/[^0-9.]/g, "")) || 0;
      const valB = parseFloat((b.amount ?? "0").replace(/[^0-9.]/g, "")) || 0;
      return valB - valA;
    }
    if (sortAxis === "fit") {
      // Mock: verified clients > silver > gold > basic; tie-broken by age.
      const tierRank: Record<string, number> = { gold: 0, silver: 1, verified: 2, basic: 3 };
      return (tierRank[a.clientTrust ?? "basic"] ?? 3) - (tierRank[b.clientTrust ?? "basic"] ?? 3);
    }
    // urgency: action items first, then by age
    const actA = a.category === "action" ? 0 : 1;
    const actB = b.category === "action" ? 0 : 1;
    if (actA !== actB) return actA - actB;
    return (b.ageHrs ?? 0) - (a.ageHrs ?? 0);
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
        title="Inbox"
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

      {/* Audit #24 + #26 — saved views + smart-sort toolbar. Sits above
          the list so all triage controls are in one place. */}
      <InboxPowerToolbar
        savedView={savedView}
        onSavedViewChange={setSavedView}
        sortAxis={sortAxis}
        onSortChange={setSortAxis}
        totalShown={filtered.length}
      />

      {/* Audit #23 — bulk action bar. Renders only when selection > 0. */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          onAction={(action) => {
            toast(`${action} · ${selected.size} item${selected.size === 1 ? "" : "s"}`);
            setSelected(new Set());
          }}
        />
      )}

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
                    ? "Inbox zero. Enjoy the quiet."
                    : filter === "closed"
                      ? "Archive is clear"
                      : filter === "all"
                        ? "Nothing in the inbox yet"
                        : `No ${filter} items`
              }
              body={
                filter === "action"
                  ? "You're caught up — every offer, hold, and request has been handled. Open a different filter to peek at what's in flight."
                  : filter === "all"
                    ? "Inquiries land here the moment a client or agency reaches out. Make sure your reach channels are on so the right ones find you."
                    : "Switch filter above to see other items."
              }
              compact
            />
          </div>
        ) : (
          sorted.map((it, idx) => {
            const key = `${it.source}-${it.id}`;
            return (
              <InboxRow
                key={key}
                item={it}
                first={idx === 0}
                checked={selected.has(key)}
                onToggleCheck={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
                onSnooze={() => toast(`Snoozed · ${it.client} returns to top in 1 day`)}
                onTemplate={() => openDrawer("reply-templates", { itemId: key })}
              />
            );
          })
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
                  background: COLORS.fill,
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

/**
 * Audit #24 + #26 — saved views + smart-sort toolbar. Premium triage
 * controls: predefined saved views (default / verified clients only /
 * holds expiring / from agencies) and a sort axis selector
 * (urgency / newest / value / fit). All persist for the session.
 */
function InboxPowerToolbar({
  savedView,
  onSavedViewChange,
  sortAxis,
  onSortChange,
  totalShown,
}: {
  savedView: string;
  onSavedViewChange: (v: string) => void;
  sortAxis: "urgency" | "newest" | "value" | "fit";
  onSortChange: (s: "urgency" | "newest" | "value" | "fit") => void;
  totalShown: number;
}) {
  const views = [
    { id: "default", label: "All inbox" },
    { id: "verified", label: "Verified+ clients only" },
    { id: "expiring", label: "Holds expiring" },
    { id: "agency", label: "From agencies" },
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 10,
        padding: "8px 0",
        fontFamily: FONTS.body,
        flexWrap: "wrap",
      }}
    >
      <CapsLabel>View</CapsLabel>
      <select
        value={savedView}
        onChange={(e) => onSavedViewChange(e.target.value)}
        style={inboxToolbarSelectStyle}
      >
        {views.map((v) => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
      </select>
      <span style={{ color: COLORS.borderSoft }}>|</span>
      <CapsLabel>Sort</CapsLabel>
      <select
        value={sortAxis}
        onChange={(e) => onSortChange(e.target.value as "urgency" | "newest" | "value" | "fit")}
        style={inboxToolbarSelectStyle}
      >
        <option value="urgency">Urgency</option>
        <option value="newest">Newest</option>
        <option value="value">Highest value</option>
        <option value="fit">Best fit (AI)</option>
      </select>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
        {totalShown} item{totalShown === 1 ? "" : "s"}
      </span>
    </div>
  );
}

const inboxToolbarSelectStyle: CSSProperties = {
  padding: "5px 10px",
  fontFamily: FONTS.body,
  fontSize: 12,
  fontWeight: 500,
  color: COLORS.ink,
  background: "#fff",
  border: `1px solid ${COLORS.borderSoft}`,
  borderRadius: 7,
  cursor: "pointer",
};

/**
 * Audit #23 — bulk action bar. Renders inline above the list when one
 * or more rows are selected. Decline / hold / archive in one click.
 */
function BulkActionBar({
  count,
  onClear,
  onAction,
}: {
  count: number;
  onClear: () => void;
  onAction: (label: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: COLORS.fill,
        color: "#fff",
        borderRadius: 10,
        fontFamily: FONTS.body,
        marginTop: 12,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        {count} selected
      </span>
      <span style={{ flex: 1 }} />
      {(["Hold open", "Decline", "Archive"] as const).map((label) => (
        <button
          key={label}
          onClick={() => onAction(label)}
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff",
            borderRadius: 7,
            padding: "5px 12px",
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 500,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
        >
          {label}
        </button>
      ))}
      <button
        onClick={onClear}
        aria-label="Clear selection"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
          padding: "4px 6px",
          fontSize: 14,
        }}
      >
        ✕
      </button>
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
              background: active ? COLORS.fill : "#fff",
              border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 500,
              color: active ? "#fff" : COLORS.ink,
              transition: `background ${TRANSITION.micro}`,
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
function InboxRow({
  item,
  first,
  checked,
  onToggleCheck,
  onSnooze,
  onTemplate,
}: {
  item: InboxItem;
  first: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  onSnooze?: () => void;
  onTemplate?: () => void;
}) {
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
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "14px 0",
        borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}`,
        background: checked ? "rgba(15,79,62,0.04)" : "transparent",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
      }}
    >
      {/* Audit #23 — bulk-select checkbox. Visible on hover, on checked
          state, or when other rows are checked (the parent controls). */}
      {onToggleCheck && (
        <label
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            cursor: "pointer",
            opacity: checked || hover ? 1 : 0.4,
            transition: `opacity ${TRANSITION.micro}`,
            flexShrink: 0,
            paddingLeft: 2,
          }}
        >
          <input
            type="checkbox"
            checked={!!checked}
            onChange={onToggleCheck}
            style={{
              width: 16,
              height: 16,
              cursor: "pointer",
              accentColor: COLORS.accent,
            }}
          />
        </label>
      )}
      <button
        type="button"
        onClick={item.onOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: 1,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
          padding: 0,
          minWidth: 0,
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
      {/* Audit #25 + #53 — hover-only quick actions: snooze + insert
          template. Click on these doesn't propagate to the row's open
          handler. Always reserve space (visibility:hidden when not
          hovering) so the row width doesn't jump. */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          visibility: hover ? "visible" : "hidden",
        }}
      >
        {onSnooze && (
          <button
            onClick={(e) => { e.stopPropagation(); onSnooze(); }}
            aria-label={`Snooze ${item.client}`}
            title="Snooze · returns to top in 1 day"
            style={inboxHoverIconStyle}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        )}
        {onTemplate && item.category === "action" && (
          <button
            onClick={(e) => { e.stopPropagation(); onTemplate(); }}
            aria-label="Insert reply template"
            title="Reply with template"
            style={inboxHoverIconStyle}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

const inboxHoverIconStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: `1px solid ${COLORS.borderSoft}`,
  background: "#fff",
  color: COLORS.inkMuted,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function inboxClientInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
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
                    let pattern: string | undefined;
                    if (mark.kind === "booking") {
                      bg = COLORS.successSoft;
                      fg = COLORS.successDeep;
                    } else if (mark.kind === "pending") {
                      // Hold/pending now uses a diagonal-stripe overlay so it
                      // visually reads "soft commitment, not booked yet" at
                      // a glance — distinct from solid confirmed bookings.
                      bg = COLORS.coralSoft;
                      fg = COLORS.coralDeep;
                      pattern = `repeating-linear-gradient(135deg, ${COLORS.coralSoft} 0, ${COLORS.coralSoft} 4px, rgba(194,106,69,0.18) 4px, rgba(194,106,69,0.18) 6px)`;
                    } else if (mark.kind === "inquiry") {
                      bg = COLORS.indigoSoft;
                      fg = COLORS.indigoDeep;
                    } else if (mark.kind === "block" && mark.type === "travel") {
                      bg = "rgba(82,96,109,0.12)";
                      fg = COLORS.amberDeep;
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
                        background: pattern ?? bg,
                        color: fg,
                        border: mark.kind === "pending" ? "1px dashed rgba(194,106,69,0.45)" : "none",
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
                        opacity: mark.kind === "inquiry" ? 0.85 : 1,
                      }}
                      title={mark.kind === "pending" ? `${mark.label} (pending hold — not yet confirmed)` : mark.label}
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

// ─── Calendar week + day views (F7) ──────────────────────────────
//
// Both views consume the same CalendarEvent[] used by the list. Week
// groups by start day across a 7-day strip; Day shows a single day's
// events bucketed by morning/afternoon/evening. Both are list-style —
// no time-grid column — because the prototype's data is day-granular,
// not hour-granular.

/**
 * Audit #34 — calendar color legend. Surfaces the meaning of the
 * left-border tones used by Week + Day views (and the conflict banner)
 * so the user doesn't have to memorize the system.
 */
function CalendarColorLegend() {
  const items: { tone: string; label: string }[] = [
    { tone: COLORS.green, label: "Booked" },
    { tone: COLORS.coral, label: "Pending / hold" },
    { tone: COLORS.indigo, label: "Inquiry" },
    { tone: COLORS.inkDim, label: "Past" },
  ];
  return (
    <div
      role="img"
      aria-label="Event status legend"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        color: COLORS.inkMuted,
      }}
    >
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: it.tone,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function CalendarWeekView({
  events,
  onOpen,
}: {
  events: { id: string; kind: string; client: string; brief: string; dateLabel: string; status: string; startDay: number | null; drawer: { id: import("./_state").DrawerId; payload: Record<string, unknown> } }[];
  onOpen: (d: { id: import("./_state").DrawerId; payload: Record<string, unknown> }) => void;
}) {
  // Anchor on May 12–18 (week containing the prototype's mock conflict).
  const weekStart = 12;
  const days = Array.from({ length: 7 }, (_, i) => weekStart + i);
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: FONTS.body,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <CapsLabel>Week of May 12 — May 18, 2026</CapsLabel>
          {/* Audit #34 — color legend so the left-border tones are scannable */}
          <CalendarColorLegend />
        </div>
        <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
          {events.filter((e) => e.startDay !== null && days.includes(e.startDay!)).length} events
        </span>
      </div>
      {days.map((d) => {
        const dayEvents = events.filter((e) => e.startDay === d);
        const dayName = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"][d - weekStart] ?? "";
        return (
          <div
            key={d}
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 14px",
              borderTop: d === weekStart ? "none" : `1px solid ${COLORS.borderSoft}`,
              background: dayEvents.length > 0 ? "#fff" : "rgba(11,11,13,0.015)",
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ width: 60, flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 500, color: COLORS.ink, fontFamily: FONTS.display, letterSpacing: -0.2 }}>
                {d}
              </div>
              <div style={{ fontSize: 10.5, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.7 }}>
                {dayName}
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {dayEvents.length === 0 ? (
                <div style={{ fontSize: 11.5, color: COLORS.inkDim, paddingTop: 4 }}>—</div>
              ) : (
                dayEvents.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpen(e.drawer)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: "rgba(11,11,13,0.03)",
                      border: "none",
                      borderLeft: `3px solid ${
                        e.kind === "booked" ? COLORS.green :
                        e.kind === "pending" ? COLORS.coral :
                        e.kind === "inquiry" ? COLORS.indigo :
                        e.kind === "cancelled" ? COLORS.coral :
                        COLORS.inkDim
                      }`,
                      borderRadius: 6,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: FONTS.body,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
                        {e.client} · {e.brief}
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                        {e.status}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CalendarDayView({
  events,
  onOpen,
}: {
  events: { id: string; kind: string; client: string; brief: string; dateLabel: string; status: string; amount?: string; startDay: number | null; drawer: { id: import("./_state").DrawerId; payload: Record<string, unknown> } }[];
  onOpen: (d: { id: import("./_state").DrawerId; payload: Record<string, unknown> }) => void;
}) {
  // Anchor on May 14 — the prototype's hot day with the conflict.
  const targetDay = 14;
  const dayEvents = events.filter((e) => e.startDay === targetDay);
  // Bucket assignment is mock — production reads time-of-day from event records.
  const bucketed = {
    morning: dayEvents.slice(0, Math.ceil(dayEvents.length / 3)),
    afternoon: dayEvents.slice(Math.ceil(dayEvents.length / 3), Math.ceil((dayEvents.length * 2) / 3)),
    evening: dayEvents.slice(Math.ceil((dayEvents.length * 2) / 3)),
  };
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, color: COLORS.ink, letterSpacing: -0.3 }}>
            Thursday, May {targetDay}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
            {dayEvents.length} events
          </div>
        </div>
      </div>
      {(["morning", "afternoon", "evening"] as const).map((bucket) => (
        <div
          key={bucket}
          style={{
            display: "flex",
            gap: 12,
            padding: "12px 16px",
            borderTop: bucket === "morning" ? "none" : `1px solid ${COLORS.borderSoft}`,
          }}
        >
          <div style={{ width: 90, flexShrink: 0 }}>
            <CapsLabel>{bucket}</CapsLabel>
            <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 2 }}>
              {bucket === "morning" ? "Before 12" : bucket === "afternoon" ? "12 — 6pm" : "After 6pm"}
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {bucketed[bucket].length === 0 ? (
              <div style={{ fontSize: 11.5, color: COLORS.inkDim, paddingTop: 4 }}>Free</div>
            ) : (
              bucketed[bucket].map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen(e.drawer)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "#fff",
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderLeft: `3px solid ${
                      e.kind === "booked" ? COLORS.green :
                      e.kind === "pending" ? COLORS.coral :
                      e.kind === "inquiry" ? COLORS.indigo :
                      COLORS.inkDim
                    }`,
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                      {e.client}
                    </div>
                    <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                      {e.brief} · {e.status}
                    </div>
                  </div>
                  {e.amount && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.green }}>
                      {e.amount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </section>
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
  // F7: Month / Week / Day view toggle. Month is the default — week and
  // day re-render the same event list with progressive zoom-in.
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");

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
        title="Calendar"
        subtitle="Bookings, holds & availability"
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

      {/* View mode toggle — Month / Week / Day. Same data, progressive
          zoom. Week + Day are list-style; only Month uses the grid. */}
      <div
        role="tablist"
        aria-label="Calendar view"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          background: "rgba(11,11,13,0.05)",
          borderRadius: 999,
          padding: 3,
          marginBottom: 12,
          fontFamily: FONTS.body,
        }}
      >
        {(["month", "week", "day"] as const).map((m) => {
          const active = viewMode === m;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={active}
              onClick={() => setViewMode(m)}
              style={{
                background: active ? COLORS.fill : "transparent",
                color: active ? "#fff" : COLORS.inkMuted,
                border: "none",
                borderRadius: 999,
                padding: "5px 12px",
                cursor: active ? "default" : "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                letterSpacing: 0.1,
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          );
        })}
      </div>

      {/* Month grid (visual context) — only shown in Month view. */}
      {viewMode === "month" && <CalendarMonthGrid />}

      {/* Week view — 7-row stack with day labels. Same row format as
          the list below but explicitly grouped by day. */}
      {viewMode === "week" && (
        <CalendarWeekView events={events} onOpen={(d) => openDrawer(d.id, d.payload)} />
      )}

      {/* Day view — single-day timeline with morning/afternoon/evening
          buckets. Uses the same event source. */}
      {viewMode === "day" && (
        <CalendarDayView events={events} onOpen={(d) => openDrawer(d.id, d.payload)} />
      )}

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
                  ? "Calendar's clear"
                  : filter === "pending"
                    ? "Nothing pending — you're caught up"
                    : filter === "inquiry"
                      ? "No live inquiries"
                      : "Archive's empty for now"
              }
              body={
                filter === "booked"
                  ? "No confirmed bookings on the books. The first one always lands faster than you think."
                  : filter === "pending"
                    ? "Every hold has been confirmed or released. Nice."
                    : filter === "inquiry"
                      ? "Open inquiries will surface here so they don't get lost in the inbox."
                      : "Past bookings will collect here once the first one wraps."
              }
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
              background: active ? COLORS.fill : "#fff",
              border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 500,
              color: active ? "#fff" : COLORS.ink,
              transition: `background ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
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
  const { openDrawer } = useProto();
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
                label="✨ Smart resolve"
                onClick={() => openDrawer("talent-conflict-resolve")}
                severe={severe}
              />
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
        transition: `background ${TRANSITION.micro}`,
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

/**
 * Earnings forecast tile (E3). Two numbers — projected year-end total
 * and the next-30-day forecast — surfaced as a compact strip so the
 * talent has a forward-looking view of their pipeline, not just a YTD
 * rear-view. Math here is intentionally naive (linear pace × pace
 * adjustment); production would consult a confidence-weighted model.
 *
 * The "Pipeline confidence" caption hints at the model's quality so the
 * talent doesn't over-trust an early-year extrapolation.
 */
/**
 * Audit #37 — Earnings goal progress ring. SVG-based circular
 * progress with the YTD total in the middle and remaining/percent
 * captions. Goal is configurable inline (click "Edit goal").
 *
 * Math: goal defaults to €30k/yr; progress = total / goal capped at
 * 100%. Stroke is forest accent for "on or above pace", amber if
 * pace is < 70% of where it should be by date, coral if < 40%.
 */
function EarningsGoalRing({ total }: { total: number }) {
  const { toast } = useProto();
  const [goal, setGoal] = useState(30000);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState(String(goal));

  const monthsElapsed = 4;          // mock — Apr
  const expectedByNow = (goal / 12) * monthsElapsed;
  const paceRatio = expectedByNow > 0 ? total / expectedByNow : 0;
  const tone = paceRatio >= 1 ? COLORS.green : paceRatio >= 0.7 ? COLORS.amber : COLORS.coral;
  const paceLabel = paceRatio >= 1 ? "On track" : paceRatio >= 0.7 ? "Slightly behind" : "Behind pace";
  const pct = Math.min(1, total / goal);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;

  return (
    <section
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 18px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        marginBottom: 16,
        fontFamily: FONTS.body,
      }}
    >
      {/* SVG ring */}
      <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
        <svg width={88} height={88} viewBox="0 0 88 88" aria-hidden>
          <circle cx={44} cy={44} r={radius} fill="none" stroke="rgba(11,11,13,0.08)" strokeWidth={6} />
          <circle
            cx={44}
            cy={44}
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 44 44)"
            style={{ transition: "stroke-dasharray .6s cubic-bezier(.4,.0,.2,1)" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.3,
            }}
          >
            {Math.round(pct * 100)}%
          </span>
          <span
            style={{
              fontSize: 9.5,
              color: COLORS.inkMuted,
              fontWeight: 600,
                          }}
          >
            of goal
          </span>
        </div>
      </div>

      {/* Right side — amount, goal, pace, edit */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
            marginBottom: 2,
          }}
        >
          2026 earnings goal
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, color: COLORS.ink, letterSpacing: -0.3 }}>
            €{total.toLocaleString()}
          </span>
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            of €{goal.toLocaleString()}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 999,
              background: tone === COLORS.green ? COLORS.successSoft : tone === COLORS.amber ? "rgba(176,141,82,0.12)" : COLORS.coralSoft,
              color: tone === COLORS.green ? COLORS.successDeep : tone === COLORS.amber ? COLORS.amber : COLORS.coralDeep,
              marginLeft: "auto",
            }}
          >
            {paceLabel}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4 }}>
          €{Math.max(0, goal - total).toLocaleString()} to go · expected by now ≈ €{Math.round(expectedByNow).toLocaleString()}
        </div>
        {editOpen ? (
          <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: COLORS.inkMuted }}>€</span>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              style={{
                width: 100,
                padding: "5px 8px",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 6,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => {
                const next = parseInt(editValue.replace(/[^0-9]/g, ""), 10);
                if (next > 0) {
                  setGoal(next);
                  toast(`Goal set to €${next.toLocaleString()}`);
                }
                setEditOpen(false);
              }}
              style={{
                padding: "5px 10px",
                background: COLORS.fill,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              style={{
                padding: "5px 8px",
                background: "transparent",
                color: COLORS.inkMuted,
                border: "none",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setEditValue(String(goal)); setEditOpen(true); }}
            style={{
              marginTop: 6,
              background: "transparent",
              border: "none",
              padding: 0,
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
              color: COLORS.indigo,
              cursor: "pointer",
            }}
          >
            Edit goal →
          </button>
        )}
      </div>
    </section>
  );
}

function ForecastTile({ total, bookingsCount }: { total: number; bookingsCount: number }) {
  // Assume we're 4 months into the year for the prototype's mock data
  // (April). Production reads this from the actual current month + the
  // talent's full earnings ledger.
  const monthsElapsed = 4;
  const avgPerMonth = total / monthsElapsed;
  const yearEndProjection = Math.round(avgPerMonth * 12);
  const next30 = Math.round(avgPerMonth * 1.05); // 5% pace bump from active pipeline
  const confidence = bookingsCount >= 8 ? "High" : bookingsCount >= 4 ? "Medium" : "Low";
  const confidenceColor = confidence === "High" ? COLORS.green : confidence === "Medium" ? COLORS.amber : COLORS.coral;

  return (
    <section
      data-tulala-forecast-tile
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, padding: "14px 18px" }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          Forecast · year-end
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 26,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: -0.4,
            marginTop: 2,
            lineHeight: 1.1,
          }}
        >
          €{yearEndProjection.toLocaleString()}
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4 }}>
          Based on YTD pace × 12. {bookingsCount < 4 ? "Few data points yet — wide error band." : "Updates monthly."}
        </div>
      </div>
      <div style={{ width: 1, background: COLORS.borderSoft }} />
      <div style={{ flex: 1, padding: "14px 18px" }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          Next 30 days
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 26,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: -0.4,
            marginTop: 2,
            lineHeight: 1.1,
          }}
        >
          €{next30.toLocaleString()}
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4 }}>
          Live pipeline + recent close-rate. Updated daily.
        </div>
      </div>
      <div style={{ width: 1, background: COLORS.borderSoft }} />
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          Confidence
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: confidenceColor,
          }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: confidenceColor }} />
          {confidence}
        </div>
      </div>
    </section>
  );
}

function ActivityPage() {
  const { openDrawer, toast } = useProto();
  const [filter, setFilter] = useState<"all" | "agency" | "personal" | "hub" | "studio" | "manual">("all");
  // Celebration moment is local-only in the prototype; production wires
  // this to talent_celebration_events with a dismissed_at flag so the
  // banner doesn't reappear on next session.
  const [celebrationDismissed, setCelebrationDismissed] = useState(false);

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
        title="Activity"
        subtitle="Earnings & history."
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

      {/* Audit #38 — multiple celebration thresholds, not just €1k.
          Picks the highest threshold the user crossed, in priority order:
          €10k YTD > €5k YTD > 10 bookings > €1k YTD > 5 bookings.
          Audit #39 — primary CTA now opens the booking detail that
          tipped past the milestone, instead of clicking back to "All". */}
      {!celebrationDismissed && (() => {
        const bookingsCount = EARNINGS_ROWS.length;
        const milestone =
          total >= 10000
            ? { eyebrow: "Milestone", title: `€${total.toLocaleString()} YTD — you crossed the €10k mark`, body: "Top quartile of platform earnings. Keep your channels healthy." }
            : total >= 5000
            ? { eyebrow: "Milestone", title: `€${total.toLocaleString()} YTD — €5k crossed`, body: "Reliable income. Halfway to a €10k year on the books." }
            : bookingsCount >= 10
            ? { eyebrow: "Milestone", title: `${bookingsCount} bookings closed this year`, body: "You've reached double digits. Repeat clients are usually next." }
            : total >= 1000
            ? { eyebrow: "Milestone", title: `€${total.toLocaleString()} this year — €1k mark crossed`, body: "Real, repeatable income. Keep reach healthy." }
            : bookingsCount >= 5
            ? { eyebrow: "Milestone", title: `${bookingsCount} bookings closed`, body: "Past your first handful. Patterns start to show now." }
            : null;
        if (!milestone) return null;
        // Drill-in to the most recent booking — the one that "tipped past" the threshold.
        const latestId = EARNINGS_ROWS[0]?.id;
        return (
          <div style={{ marginBottom: 16 }}>
            <CelebrationBanner
              tone="forest"
              eyebrow={milestone.eyebrow}
              title={milestone.title}
              body={milestone.body}
              primaryLabel={latestId ? "Open most recent booking" : undefined}
              onPrimary={latestId ? () => openDrawer("talent-closed-booking", { earningId: latestId }) : undefined}
              secondaryLabel="Share with my agency"
              onSecondary={() => toast("Shared with primary agency")}
              onDismiss={() => setCelebrationDismissed(true)}
            />
          </div>
        );
      })()}

      {/* Audit #37 — Earnings goal progress ring. Goal is set via the
          ring's edit affordance; defaults to €30k/yr. Sits beside the
          forecast tile below for tight contextual coupling. */}
      <EarningsGoalRing total={total} />

      {/* Compact stat strip — same pattern as Reach hero */}
      <div
        data-tulala-stat-strip
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

      {/* Earnings forecast tile (E3). Naive projection — current YTD pace
          extrapolated to year-end, trimmed to a 12-month rolling average
          for stability. Production wires this to a real model that
          factors seasonality + booking-pipeline confidence. */}
      <ForecastTile total={total} bookingsCount={EARNINGS_ROWS.length} />

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
                background: active ? COLORS.fill : "#fff",
                border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
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
              title={
                filter === "manual"
                  ? "Nothing logged off-platform"
                  : filter === "agency" || filter === "personal" || filter === "hub" || filter === "studio"
                    ? `No ${filter} earnings yet`
                    : "No earnings here yet"
              }
              body={
                filter === "manual"
                  ? "Use Log work to record gigs you booked outside Tulala. Keeps your earnings story complete in one place."
                  : filter === "agency"
                    ? "When your agency closes a booking on your behalf, it lands here automatically."
                    : filter === "personal"
                      ? "Earnings from inquiries through your personal page route here. Keep your reach channels healthy."
                      : filter === "hub"
                        ? "Earnings from Tulala Hub bookings show up here once any close."
                        : filter === "studio"
                          ? "Studio bookings — open a studio relationship in Reach to start receiving these."
                          : "Once you start booking, this view becomes the story of your income."
              }
              compact
            />
          </div>
        ) : (
          // Audit #36 — group by month with header + month-total
          // sub-line. Months ordered most-recent first; rows preserve
          // the original sort within each group.
          (() => {
            type Group = { key: string; label: string; total: number; rows: typeof filtered };
            const groups: Group[] = [];
            const groupOrder = ["Apr 2026", "Mar 2026", "Feb 2026", "Jan 2026", "Dec 2025", "Nov 2025", "Oct 2025"];
            for (const e of filtered) {
              // Mock: payoutDate "Apr 25 2026" or "Apr 25" → month label "Apr 2026"
              const m = e.payoutDate.match(/([A-Za-z]{3})/)?.[1] ?? "";
              const y = e.payoutDate.match(/(20\d\d)/)?.[1] ?? "2026";
              const key = `${m} ${y}`;
              let g = groups.find((x) => x.key === key);
              if (!g) {
                g = { key, label: key, total: 0, rows: [] };
                groups.push(g);
              }
              g.rows.push(e);
              g.total += parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
            }
            groups.sort((a, b) => groupOrder.indexOf(a.key) - groupOrder.indexOf(b.key));
            return groups.map((g) => (
              <div key={g.key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    padding: "12px 0 8px",
                    borderTop: groups.indexOf(g) === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.7,
                      textTransform: "uppercase",
                      color: COLORS.inkMuted,
                    }}
                  >
                    {g.label}
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                    €{g.total.toLocaleString()} · {g.rows.length} payout{g.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                {g.rows.map((e) => <EarningRow key={e.id} earning={e} />)}
              </div>
            ));
          })()
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

  // Audit #40 — dismissible Pro-tier card. Once dismissed for the
  // session, the page falls back to a compact strip at the same spot.
  const [proTierDismissed, setProTierDismissed] = useState(false);

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
        title="Reach"
        subtitle="Where you appear, and what each channel sent you."
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
      {/* Audit #44 — Reach health score. Single 0–100 number that
          summarizes how well distributed the talent is. Sits above the
          stat strip so it's the first thing scanned. */}
      <ReachHealthScore
        liveChannels={liveChannels}
        totalChannels={TALENT_CHANNELS.length}
        inquiries7d={totalInquiries7d}
      />
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
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <TextInput placeholder="Search Models.com, Cast Iron, Atelier Paris…" />
          </div>
          <SecondaryButton onClick={() => openDrawer("talent-hub-compare")}>
            Compare hubs
          </SecondaryButton>
        </div>
      </section>

      <div style={{ height: 24 }} />

      {/* Pro tier value card (E6) — only when on a non-Portfolio tier.
          Audit #40 — dismissible per-session. Shown until the talent
          dismisses it or upgrades; then a compact "Pro unlocks 3 modules
          → Compare" sticky strip lives at the bottom of Reach instead. */}
      {MY_TALENT_PROFILE.subscription.tier !== "portfolio" && (
        proTierDismissed ? (
          <ProTierCompactStrip
            currentTier={MY_TALENT_PROFILE.subscription.tier}
            onCompare={() => openDrawer("talent-tier-compare")}
          />
        ) : (
          <ProTierValueCard
            currentTier={MY_TALENT_PROFILE.subscription.tier}
            onCompare={() => openDrawer("talent-tier-compare")}
            onDismiss={() => setProTierDismissed(true)}
          />
        )
      )}

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
              background: confirmTone === "critical" ? COLORS.critical : COLORS.fill,
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
      data-tulala-stat-divider
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
                transition: `background ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
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
 * Pro-tier value card (E6). Surfaces a concrete unlock-list for the
 * next subscription tier, anchored to the talent's current tier so the
 * pitch reflects what they'd actually gain. Avoids the "feature wall"
 * trap by leading with the 3 highest-value modules first.
 *
 * Forest accent because tier upgrades are framed as earnings-adjacent
 * (more reach, better presentation, higher inquiry rate), not branded
 * marketing.
 */
function ProTierValueCard({
  currentTier,
  onCompare,
  onDismiss,
}: {
  currentTier: TalentSubscriptionTier;
  onCompare: () => void;
  onDismiss?: () => void;
}) {
  // Skip if already on top tier (parent gates this, but defensive).
  if (currentTier === "portfolio") return null;
  const isBasic = currentTier === "basic";
  const targetTier = isBasic ? "pro" : "portfolio";
  const targetMeta = TALENT_TIER_META[targetTier];

  // Anchor the pitch on what's missing today, in priority order.
  const unlocks = isBasic
    ? [
        { label: "Template picker", body: "Pick a personal-page template that matches your category — Roster, Magazine, Editorial, Reel." },
        { label: "Press + Media Kit", body: "Linked press band and a downloadable PDF media kit. Casting directors love these." },
        { label: "Video & social embeds", body: "Embed Instagram reels, TikTok, Vimeo right on your personal page." },
      ]
    : [
        { label: "Custom domain", body: "Use marta-reyes.com instead of tulala.digital/t/marta-reyes. Yours, kept on renewal." },
        { label: "Multi-section page-builder", body: "Up to 12 stacked sections. Tell a story, not just show a grid." },
        { label: "Priority discovery placement", body: "Higher position in Tulala Hub search + recommendations." },
      ];

  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, rgba(46,125,91,0.10) 0%, #fff 60%)`,
        border: `1px solid ${COLORS.green}`,
        borderRadius: 14,
        padding: "16px 18px",
        fontFamily: FONTS.body,
      }}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss — collapse to a compact strip"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
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
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.06)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Icon name="x" size={11} />
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.green,
            background: COLORS.successSoft,
            padding: "4px 9px",
            borderRadius: 999,
          }}
        >
          {targetMeta.label} · {targetMeta.monthlyPrice}
        </span>
        <span style={{ fontSize: 12, color: COLORS.inkMuted }}>vs your current {TALENT_TIER_META[currentTier].label}</span>
      </div>
      <h3
        style={{
          fontFamily: FONTS.display,
          fontSize: 20,
          fontWeight: 500,
          color: COLORS.ink,
          margin: 0,
          letterSpacing: -0.2,
          lineHeight: 1.2,
          marginBottom: 12,
        }}
      >
        {isBasic
          ? "Three things Pro unlocks that move inquiry rate"
          : "What Portfolio adds on top of Pro"}
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        {unlocks.map((item, idx) => (
          <SecondaryCard key={idx} title={item.label} description={item.body} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PrimaryButton onClick={onCompare}>See full comparison</PrimaryButton>
        <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
          Cancel anytime. Your URL stays the same.
        </span>
      </div>
    </section>
  );
}

/**
 * Audit #44 — Reach health score. Distills "how well-distributed are
 * you" into a single 0–100 number with tone (red/amber/green). Math is
 * intentionally simple (channel coverage + 7d inquiry signal). Tone
 * shifts at 50 / 75 thresholds.
 */
function ReachHealthScore({
  liveChannels,
  totalChannels,
  inquiries7d,
}: {
  liveChannels: number;
  totalChannels: number;
  inquiries7d: number;
}) {
  const coverage = Math.round((liveChannels / Math.max(totalChannels, 1)) * 60); // 0–60
  const volume = Math.min(inquiries7d * 5, 40); // 0–40
  const score = Math.min(coverage + volume, 100);
  const tone = score >= 75 ? "green" : score >= 50 ? "amber" : "coral";
  const toneColor = tone === "green" ? COLORS.green : tone === "amber" ? COLORS.amber : COLORS.coral;
  const label =
    score >= 90 ? "Excellent — fully distributed" :
    score >= 75 ? "Healthy — most channels live" :
    score >= 50 ? "Mixed — a few channels need attention" :
    "Low — turn on more channels";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        marginBottom: 10,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#fff",
          border: `3px solid ${toneColor}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: FONTS.display,
          fontSize: 18,
          fontWeight: 600,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkMuted }}>
          Reach health
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink, marginTop: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
          {liveChannels} of {totalChannels} channels live · {inquiries7d} inquiries in last 7d
        </div>
      </div>
    </div>
  );
}

/**
 * Audit #40 — compact strip variant of the Pro-tier value card. Shown
 * after the talent dismisses the full card. Single line, low visual
 * weight, but still the upgrade affordance is one click away.
 */
function ProTierCompactStrip({
  currentTier,
  onCompare,
}: {
  currentTier: TalentSubscriptionTier;
  onCompare: () => void;
}) {
  const isBasic = currentTier === "basic";
  const targetTier = isBasic ? "pro" : "portfolio";
  const targetMeta = TALENT_TIER_META[targetTier];
  return (
    <button
      type="button"
      onClick={onCompare}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 14px",
        background: "rgba(46,125,91,0.06)",
        border: `1px solid rgba(46,125,91,0.20)`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.successSoft)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(46,125,91,0.06)")}
    >
      <Icon name="sparkle" size={13} color={COLORS.green} stroke={1.7} />
      <span style={{ flex: 1, fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>
        On {TALENT_TIER_META[currentTier].label}.{" "}
        <span style={{ color: COLORS.green, fontWeight: 600 }}>{targetMeta.label}</span> unlocks 3 modules · {targetMeta.monthlyPrice}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.green }}>
        Compare →
      </span>
    </button>
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
    studio: { icon: "🎬", toneFg: COLORS.green, toneBg: COLORS.successSoft },
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
        transition: `opacity ${TRANSITION.micro}`,
      }}
      data-channel-row
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

// Mock count — production reads from the talent's circle table.
const MOCK_CIRCLE_PREVIEW_COUNT = 6;

/** Talent-side trust card — shows current verification posture + CTAs.
 *  Renders on the talent's Settings page. Tapping opens the talent-trust-detail
 *  drawer for the full lifecycle (Verify Instagram, Request Tulala Review,
 *  see claim status). */
function TalentTrustCard({ onOpenDetail }: { onOpenDetail: () => void }) {
  // Demo: the prototype's "current talent" maps to roster id `t1` (Marta).
  // In production this comes from the auth session.
  const TALENT_ID = "t1";
  const { getTrustSummary } = useProto();
  const trust = getTrustSummary("talent_profile", TALENT_ID);
  const igActive = trust.badges.some(b => b.type === "instagram_verified" && b.status === "active");
  const tulalaActive = trust.badges.some(b => b.type === "tulala_verified" && b.status === "active");
  const igPending = trust.pendingRequests.some(r => r.verificationType === "instagram_verified");
  const tulalaPending = trust.pendingRequests.some(r => r.verificationType === "tulala_verified");

  const rows: { label: string; status: string; tone: "good" | "pending" | "muted"; emoji: string }[] = [
    {
      label: "Account email",
      status: trust.account?.emailVerified ? "Verified" : "Not verified",
      tone: trust.account?.emailVerified ? "good" : "muted",
      emoji: "✉",
    },
    {
      label: "Profile ownership",
      status: trust.claimStatus === "claimed" ? "Claimed by you"
        : trust.claimStatus === "invite_sent" ? "Invite pending"
        : trust.claimStatus === "unclaimed" ? "Unclaimed"
        : trust.claimStatus ?? "—",
      tone: trust.claimStatus === "claimed" ? "good" : trust.claimStatus === "invite_sent" ? "pending" : "muted",
      emoji: "👤",
    },
    {
      label: "Instagram",
      status: igActive ? "Verified · public badge"
        : igPending ? "Pending review"
        : "Not verified",
      tone: igActive ? "good" : igPending ? "pending" : "muted",
      emoji: "📸",
    },
    {
      label: "Tulala Review",
      status: tulalaActive ? "Verified · public badge"
        : tulalaPending ? "In review"
        : "Not requested",
      tone: tulalaActive ? "good" : tulalaPending ? "pending" : "muted",
      emoji: "✓",
    },
    {
      label: "Agency",
      status: trust.badges.some(b => b.type === "agency_confirmed" && b.status === "active")
        ? "Confirmed by Atelier Roma"
        : "Not confirmed",
      tone: trust.badges.some(b => b.type === "agency_confirmed" && b.status === "active") ? "good" : "muted",
      emoji: "✦",
    },
  ];

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        width: "100%",
        padding: "16px 18px",
        marginBottom: 16,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5,
            color: COLORS.inkMuted, textTransform: "uppercase", marginBottom: 4,
          }}>Trust & Verification</div>
          <div style={{
            fontFamily: FONTS.display, fontSize: 16, fontWeight: 600,
            color: COLORS.ink, letterSpacing: -0.2,
          }}>
            {igActive && tulalaActive ? "You're fully verified."
              : igActive || tulalaActive ? "Almost there."
              : "Get verified."}
          </div>
        </div>
        <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 18 }}>›</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.label} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 8,
            background: r.tone === "good" ? COLORS.successSoft
              : r.tone === "pending" ? COLORS.amberSoft
              : "rgba(11,11,13,0.03)",
          }}>
            <span style={{ fontSize: 13 }}>{r.emoji}</span>
            <span style={{ flex: 1, fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>{r.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: r.tone === "good" ? COLORS.successDeep
                : r.tone === "pending" ? COLORS.amberDeep
                : COLORS.inkMuted,
            }}>{r.status}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

function SettingsPage() {
  const { openDrawer, setTalentPage } = useProto();
  // Settings privacy → admin section of profile shell. Same funnel
  // as MyProfilePage / ProfileHero / TalentTodayPage.
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: "t1", section });

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Agencies, notifications, privacy and payouts. Where you appear lives in Reach."
        actions={
          <SecondaryButton onClick={() => setTalentPage("reach")}>
            Open Reach →
          </SecondaryButton>
        }
      />

      {/* Trust & Verification — talent's view of their own trust state */}
      <TalentTrustCard onOpenDetail={() => openDrawer("talent-trust-detail")} />

      {/* Account security — passkey-based sign-in (WebAuthn). Real
          navigator.credentials API; in this prototype the credential ID
          round-trips localStorage instead of a server. */}
      <PasskeysCard userName={MY_TALENT_PROFILE.name} userId="talent-self" />

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

      <Divider label="My Circle" />
      <button
        type="button"
        onClick={() => openDrawer("circle-manage")}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          width: "100%", padding: "14px 16px", marginBottom: 16,
          background: COLORS.royalSoft, border: `1px solid rgba(95,75,139,0.18)`,
          borderRadius: 10, cursor: "pointer", fontFamily: FONTS.body, textAlign: "left",
        }}
      >
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(95,75,139,0.18)", color: COLORS.royal, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="team" size={14} stroke={1.7} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.royalDeep }}>My Circle</div>
          <div style={{ fontSize: 11.5, color: COLORS.royal, opacity: 0.78, marginTop: 2 }}>
            Trusted collaborators you can recommend into bookings in one tap. {MOCK_CIRCLE_PREVIEW_COUNT} people in your circle.
          </div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.royalDeep }}>Manage →</span>
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
          onClick={() => openSection("admin")}
        />
        <SecondaryCard
          title="Payouts"
          description="Bank info for direct payouts when an agency uses Tulala billing."
          affordance="Manage"
          onClick={() => openDrawer("talent-payouts")}
        />
        <SecondaryCard
          title="Identity verification"
          description="Get the Verified badge on every inquiry. ID + selfie · reviewed by our trust team within 24h."
          meta={<><StatDot tone="amber" /> Not yet verified</>}
          affordance="Verify identity"
          onClick={() => openDrawer("talent-verification")}
        />
        <SecondaryCard
          title="Refer a friend"
          description="When a talent you invite closes their first booking, you both earn €50 in payout credit."
          meta={<><StatDot tone="green" /> 1 active</>}
          affordance="Open referrals"
          onClick={() => openDrawer("talent-referrals")}
        />
        <SecondaryCard
          title="Tax documents"
          description="Year-end summaries, W-8BEN/W-9 on file, off-platform self-declaration."
          affordance="Open tax docs"
          onClick={() => openDrawer("talent-tax-docs")}
        />
        <SecondaryCard
          title="Talent network"
          description="Follow other talents, see who's working where, hand off briefs you can't take."
          meta={<><StatDot tone="green" /> 2 following</>}
          affordance="Open network"
          onClick={() => openDrawer("talent-network")}
        />
        <SecondaryCard
          title="Workspace · multi-agency"
          description="On the Network plan? Switch between agencies you own. Studio Reyes + Bumble live · Acme primary."
          meta={<><StatDot tone="green" /> 3 workspaces</>}
          affordance="Switch workspace"
          onClick={() => openDrawer("talent-multi-agency-picker")}
        />
        <SecondaryCard
          title="Help & support"
          description="Common questions, contracts, payouts, contact our team."
          affordance="Get help"
          onClick={() => openDrawer("help")}
        />
        {/* Audit #47 — "Sign out / leave" card removed. Sign out lives
            in the identity bar; ending an agency relationship lives in
            the per-agency relationship drawer (Agencies section above). */}
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
// WS-8.3 Earnings tile with cycle selector + sparkline
// ════════════════════════════════════════════════════════════════════

const EARNINGS_SPARKLINE = [820, 1100, 950, 1400, 1200, 1600, 1350, 1800, 1450, 2100, 1900, 2400];
const EARNINGS_CYCLE_DATA: Record<string, { total: number; count: number; label: string }> = {
  month: { total: 2400,  count: 3,  label: "This month" },
  quarter: { total: 7800, count: 9,  label: "This quarter" },
  year:  { total: 24600, count: 32, label: "This year" },
};

function EarningsTile({
  currency,
  monthTotal,
  onSeeAll,
  onLogWork,
}: {
  currency: string;
  monthTotal: number;
  onSeeAll: () => void;
  onLogWork: () => void;
}) {
  const [cycle, setCycle] = useState<"month" | "quarter" | "year">("month");
  const data = EARNINGS_CYCLE_DATA[cycle];
  const sparkMax = Math.max(...EARNINGS_SPARKLINE);
  const width = 180, height = 44;

  // Pending = booked-but-not-yet-wrapped conversations × their take-
  // home rate. Surfaces "money in flight" so the headline doesn't
  // pretend the month is over when the talent has 3 paydays coming.
  // Same source as the messages shell — single truth.
  const pendingConvs = MOCK_CONVERSATIONS.filter((c) => c.stage === "booked");
  const pendingTotal = pendingConvs.reduce((sum, c) => {
    const raw = TALENT_RATE_FOR_CONV[c.id];
    if (!raw || raw === "—") return sum;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const pendingCurrency = (() => {
    for (const c of pendingConvs) {
      const m = TALENT_RATE_FOR_CONV[c.id]?.match(/[€£$]/);
      if (m) return m[0];
    }
    return currency;
  })();
  // Trend signal — flat green bullet when month is stronger than the
  // 6-month average, amber when below. Tiny but it makes the tile feel
  // alive: the same number rendered as a chart already moves the eye.
  const sparkAvg = EARNINGS_SPARKLINE.reduce((s, v) => s + v, 0) / EARNINGS_SPARKLINE.length;
  const trendUp = monthTotal >= sparkAvg;

  const points = EARNINGS_SPARKLINE.map((v, i) => {
    const x = (i / (EARNINGS_SPARKLINE.length - 1)) * width;
    const y = height - (v / sparkMax) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <section style={{
      background: "#fff",
      border:     `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.lg,
      padding:    "16px 18px",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: COLORS.inkDim,
            fontFamily: FONTS.body, marginBottom: 4,
          }}>
            Earnings
            {/* Trend bullet — green = above 6-mo avg, amber = below.
                Tiny visual but adds a sense of momentum to the tile. */}
            <span aria-label={trendUp ? "Trending up vs 6-month average" : "Trending down vs 6-month average"} style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "1px 6px", borderRadius: 999,
              background: trendUp ? COLORS.successSoft : `${COLORS.amber}18`,
              color: trendUp ? (COLORS.successDeep ?? COLORS.success) : COLORS.amber,
              fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                {trendUp
                  ? <path d="M1 6l3-3 3 3M4 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  : <path d="M1 2l3 3 3-3M4 5V1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>}
              </svg>
              {trendUp ? "Up" : "Down"}
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body, letterSpacing: "-0.5px" }}>
            {currency}{(data.total).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, fontFamily: FONTS.body, marginTop: 2 }}>
            {data.count} payout{data.count !== 1 ? "s" : ""} · {data.label}
          </div>
        </div>

        {/* Cycle selector */}
        <div style={{ display: "flex", background: COLORS.surfaceAlt, borderRadius: RADIUS.md, padding: 2, gap: 1 }}>
          {(["month", "quarter", "year"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              style={{
                fontSize:    10,
                fontWeight:  cycle === c ? 700 : 500,
                padding:     "3px 8px",
                border:      "none",
                borderRadius: RADIUS.sm,
                cursor:      "pointer",
                background:  cycle === c ? COLORS.fill : "transparent",
                color:       cycle === c ? "#fff" : COLORS.inkMuted,
                fontFamily:  FONTS.body,
                transition:  `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
              }}
            >
              {c === "month" ? "Mo" : c === "quarter" ? "Qtr" : "Yr"}
            </button>
          ))}
        </div>
      </div>

      {/* Sparkline */}
      <svg width={width} height={height} style={{ display: "block", marginBottom: 12, overflow: "visible" }}>
        <defs>
          <linearGradient id="earnings-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.18} />
            <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill="url(#earnings-grad)"
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last dot */}
        <circle
          cx={width}
          cy={parseFloat(points.split(" ").at(-1)!.split(",")[1]!)}
          r={3}
          fill={COLORS.accent}
        />
      </svg>

      {/* Pending payouts strip — money already booked, not yet paid.
          Sourced from MOCK_CONVERSATIONS (booked stage) so it always
          mirrors the messages shell. Empty state hidden. */}
      {pendingTotal > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", marginBottom: 10,
          background: `linear-gradient(135deg, ${COLORS.accentSoft} 0%, ${COLORS.surfaceAlt} 100%)`,
          border: `1px solid rgba(15,79,62,0.16)`,
          borderRadius: RADIUS.md,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 8,
            background: "#fff", color: COLORS.accentDeep,
            border: `1px solid rgba(15,79,62,0.18)`,
            flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7 4v3l2 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
              textTransform: "uppercase", color: COLORS.accentDeep,
              fontFamily: FONTS.body,
            }}>
              In flight
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: COLORS.ink,
              fontFamily: FONTS.body, marginTop: 1,
              fontVariantNumeric: "tabular-nums",
            }}>
              {pendingCurrency}{Math.round(pendingTotal).toLocaleString()}
              <span style={{ fontWeight: 500, color: COLORS.inkMuted, marginLeft: 6 }}>
                · {pendingConvs.length} booked job{pendingConvs.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent rows */}
      <div style={{ marginBottom: 10 }}>
        {EARNINGS_ROWS.slice(0, 3).map((e) => (
          <EarningRow key={e.id} earning={e} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onSeeAll}
          style={{
            flex: 1, padding: "6px 0", background: COLORS.surfaceAlt,
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.md,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            color: COLORS.ink, fontFamily: FONTS.body,
          }}
        >
          See all earnings →
        </button>
        <button
          type="button"
          onClick={onLogWork}
          style={{
            padding: "6px 12px", background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.md,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            color: COLORS.inkMuted, fontFamily: FONTS.body,
          }}
        >
          + Log work
        </button>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-8.4 This-week rhythm strip — driven from MOCK_CONVERSATIONS so the
// booked/hold cells map to real conversations the talent can click into.
// ════════════════════════════════════════════════════════════════════

const DAY_COLORS: Record<string, { bg: string; label: string; border: string }> = {
  booked:    { bg: COLORS.accentSoft, label: COLORS.accent,    border: COLORS.accent },
  hold:      { bg: "rgba(217,119,6,0.08)", label: "rgba(180,100,0,1)", border: "rgba(217,119,6,0.3)" },
  available: { bg: COLORS.surfaceAlt, label: COLORS.inkMuted, border: COLORS.borderSoft },
  blocked:   { bg: COLORS.card,       label: COLORS.inkDim,   border: COLORS.borderSoft },
  today:     { bg: COLORS.accent,    label: "#fff",          border: COLORS.accent },
};

// Parse a conversation date label into the day-of-month it covers.
// Handles "Wed, May 14" / "May 14–15" / "Sat, Jun 21" / "Jul 4–5" etc.
// Returns the *first* day of the range when multi-day; null if unparsed.
function convFirstDay(label?: string): { month: string; day: number } | null {
  if (!label) return null;
  const m = label.match(/([A-Za-z]+)\s+(\d{1,2})/);
  if (!m) return null;
  const day = parseInt(m[2]!, 10);
  return isNaN(day) ? null : { month: m[1]!, day };
}

function WeekRhythmStrip() {
  const { setTalentPage } = useProto();
  // "Today" in the prototype's mock world is May 6 (anchored to align
  // with TALENT_BOOKINGS[0] / dashboard demo). Production reads the
  // actual Date.now(). Build a Mon-Sun strip starting from the most
  // recent Monday on or before "today".
  // Compute the 7 days of the current week (Mon → Sun). Mock today =
  // May 6 (Tue) → strip is May 5 (Mon) → May 11 (Sun). Real prod would
  // pull from Date.now(); here we keep it deterministic for demos.
  const todayDate = new Date(2026, 4, 6); // May 6, 2026 (year matches mock)
  const todayDow = todayDate.getDay(); // 0=Sun..6=Sat
  const offsetToMon = todayDow === 0 ? -6 : 1 - todayDow;
  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() + offsetToMon);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // For each day in the strip, find the first booked/hold conversation
  // whose date covers it. Returns the first match — multi-talent days
  // are rare and a single chip + click is cleaner than stacking.
  const cellFor = (date: Date) => {
    const dayNum = date.getDate();
    const monthShort = date.toLocaleString("en-US", { month: "short" });
    for (const c of MOCK_CONVERSATIONS) {
      if (c.stage !== "booked" && c.stage !== "hold") continue;
      const parsed = convFirstDay(c.date);
      if (!parsed) continue;
      // Match if the conversation's month + day equals the cell's
      // month + day. Multi-day shoots are matched on their first day
      // only; future improvement: span dashes across all matching cells.
      if (parsed.month.slice(0, 3).toLowerCase() === monthShort.toLowerCase() && parsed.day === dayNum) {
        return c;
      }
      // Multi-day range — match if the cell's day falls inside the
      // start–end span (same month).
      const range = c.date?.match(/([A-Za-z]+)\s+(\d{1,2})[–-](\d{1,2})/);
      if (range) {
        const rangeMonth = range[1]!.slice(0, 3).toLowerCase();
        const startDay = parseInt(range[2]!, 10);
        const endDay = parseInt(range[3]!, 10);
        if (rangeMonth === monthShort.toLowerCase() && dayNum >= startDay && dayNum <= endDay) {
          return c;
        }
      }
    }
    return null;
  };

  // Pin + open the conversation in the messages shell on the Booking tab.
  const openConv = (convId: string) => {
    pinNextConversationT(convId);
    pinNextThreadTabT("booking");
    setTalentPage("messages");
  };

  return (
    <section style={{
      background: "#fff",
      border:     `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.lg,
      padding:    "14px 18px",
      marginBottom: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body }}>
            This week
          </div>
          <div style={{ fontSize: 10.5, color: COLORS.inkMuted, fontFamily: FONTS.body, marginTop: 1 }}>
            {weekDays[0]!.toLocaleString("en-US", { month: "short", day: "numeric" })} – {weekDays[6]!.toLocaleString("en-US", { month: "short", day: "numeric" })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTalentPage("calendar")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: COLORS.inkMuted, fontFamily: FONTS.body }}
        >
          Open calendar →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {weekDays.map((date, i) => {
          const conv = cellFor(date);
          const isToday = date.toDateString() === todayDate.toDateString();
          const status: keyof typeof DAY_COLORS =
            isToday ? "today"
            : conv?.stage === "booked" ? "booked"
            : conv?.stage === "hold" ? "hold"
            : "available";
          const theme = DAY_COLORS[status]!;
          const dayShort = date.toLocaleString("en-US", { weekday: "short" });
          const dayNum = date.getDate();
          const label = conv ? `${conv.client.split(" ")[0]} · ${conv.brief.split(" ").slice(0, 3).join(" ")}` : null;
          const Tag = conv ? "button" : "div";
          return (
            <Tag
              key={i}
              {...(conv ? {
                onClick: () => openConv(conv.id),
                title: `${conv.client} · ${conv.brief}`,
                "aria-label": `${dayShort} ${dayNum} — ${conv.client}, open booking`,
                type: "button" as const,
              } : { title: status })}
              style={{
                background:   theme.bg,
                border:       `1px solid ${theme.border}`,
                borderRadius: RADIUS.sm,
                padding:      "6px 4px",
                textAlign:    "center",
                minHeight:    52,
                cursor:       conv ? "pointer" : "default",
                fontFamily:   FONTS.body,
                transition:   `transform ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
                ...(conv ? {
                  // Subtle lift on hover — signals interactivity without
                  // being noisy. Touch devices ignore the hover.
                } : {}),
              }}
              {...(conv ? {
                onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(11,11,13,0.10)";
                },
                onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
                  e.currentTarget.style.boxShadow = "none";
                },
              } : {})}
            >
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                textTransform: "uppercase", color: theme.label,
                fontFamily: FONTS.body, marginBottom: 1,
              }}>
                {dayShort}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, color: theme.label,
                fontFamily: FONTS.body, lineHeight: 1, marginBottom: 3,
                fontVariantNumeric: "tabular-nums",
              }}>
                {dayNum}
              </div>
              {label ? (
                <div style={{
                  fontSize: 9, color: theme.label, fontFamily: FONTS.body,
                  lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis",
                  wordBreak: "break-word",
                  display: "-webkit-box",
                  WebkitLineClamp: 2 as unknown as string,
                  WebkitBoxOrient: "vertical",
                }}>
                  {label}
                </div>
              ) : (
                <div style={{
                  fontSize: 9, color: theme.label, fontFamily: FONTS.body,
                  opacity: 0.6,
                }}>
                  {isToday ? "Today" : "Free"}
                </div>
              )}
            </Tag>
          );
        })}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-8.2 Agencies page (split from ReachPage)
// ════════════════════════════════════════════════════════════════════

function AgenciesPage() {
  const { openDrawer, setTalentPage, toast } = useProto();
  const [requestSent, setRequestSent] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body, margin: 0 }}>
          Agencies
        </h2>
        <p style={{ fontSize: 13, color: COLORS.inkMuted, fontFamily: FONTS.body, margin: "4px 0 0" }}>
          Your agency relationships and representation settings.
        </p>
      </div>

      {/* Active agencies */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkDim, fontFamily: FONTS.body, marginBottom: 12 }}>
          Your agencies ({MY_AGENCIES.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MY_AGENCIES.map((ag) => (
            <div
              key={ag.id}
              style={{
                background:   "#fff",
                border:       `1px solid ${COLORS.borderSoft}`,
                borderRadius: RADIUS.lg,
                padding:      "14px 16px",
                display:      "flex",
                alignItems:   "center",
                gap:          12,
              }}
            >
              {/* Agency avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: RADIUS.md,
                background: COLORS.accentSoft,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
              }}>
                🏢
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, fontFamily: FONTS.body }}>
                  {ag.name}
                </div>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, fontFamily: FONTS.body, marginTop: 1 }}>
                  {ag.status === "exclusive" ? "Exclusive · " : "Non-exclusive · "}
                  {ag.commissionRate * 100}% commission
                </div>
              </div>
              {/* Status chip */}
              <div style={{
                fontSize:     10, fontWeight: 700,                 padding:      "2px 8px", borderRadius: RADIUS.sm,
                background:   ag.status === "active" ? COLORS.accentSoft : COLORS.card,
                color:        ag.status === "active" ? COLORS.accent : COLORS.inkMuted,
                fontFamily:   FONTS.body,
              }}>
                {ag.status}
              </div>
              <button
                type="button"
                onClick={() => openDrawer("talent-agency-relationship", { agencyId: ag.id })}
                style={{
                  background: "none", border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.sm,
                  padding: "4px 10px", cursor: "pointer", fontSize: 11, color: COLORS.inkMuted,
                  fontFamily: FONTS.body, fontWeight: 600,
                }}
              >
                Manage →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Leave agency CTA */}
      <section style={{
        background: "rgba(220,38,38,0.04)",
        border:     "1px solid rgba(220,38,38,0.12)",
        borderRadius: RADIUS.lg,
        padding:    "14px 16px",
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: FONTS.body, marginBottom: 4 }}>
          Leave an agency
        </div>
        <p style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body, margin: "0 0 10px" }}>
          Ending representation is permanent and will cancel any active holds or bookings
          assigned through that agency.
        </p>
        <button
          type="button"
          onClick={() => openDrawer("talent-leave-agency")}
          style={{
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.18)",
            color: "#dc2626", borderRadius: RADIUS.md, padding: "5px 12px",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body,
          }}
        >
          Manage representation →
        </button>
      </section>

      {/* Request representation */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkDim, fontFamily: FONTS.body, marginBottom: 12 }}>
          Request representation
        </div>
        <p style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body, margin: "0 0 12px" }}>
          Search the Tulala network to find an agency that fits your market and reach goals.
        </p>
        <button
          type="button"
          onClick={() => {
            setRequestSent("sent");
            toast("Request sent — the agency will be notified.", { tone: "success" });
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: requestSent ? COLORS.surfaceAlt : COLORS.fill,
            color: requestSent ? COLORS.inkMuted : "#fff",
            border: "none", borderRadius: RADIUS.md,
            padding: "8px 16px", fontSize: 13, fontWeight: 600,
            cursor: requestSent ? "default" : "pointer", fontFamily: FONTS.body,
          }}
        >
          {requestSent ? "✓ Request sent" : "Find an agency →"}
        </button>
      </section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-8.2 Public page editor (split from ReachPage)
// ════════════════════════════════════════════════════════════════════

function PublicPageEditor() {
  const { openDrawer, toast } = useProto();
  const profile   = MY_TALENT_PROFILE;
  const [preview, setPreview] = useState(false);

  const tier = profile.subscription?.tier ?? "basic";
  const isPro  = tier === "pro"  || tier === "portfolio";
  const isPort = tier === "portfolio";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body, margin: 0 }}>
            Public page
          </h2>
          <p style={{ fontSize: 13, color: COLORS.inkMuted, fontFamily: FONTS.body, margin: "4px 0 0" }}>
            tulala.digital/t/{profile.name.toLowerCase().replace(/\s+/g, "-")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            style={{
              background: preview ? COLORS.fill : "transparent",
              color:      preview ? "#fff" : COLORS.ink,
              border:     `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
              padding:    "7px 14px", fontSize: 12, fontWeight: 600,
              cursor:     "pointer", fontFamily: FONTS.body,
            }}
          >
            {preview ? "✓ Preview on" : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => toast("Changes saved", { tone: "success" })}
            style={{
              background: COLORS.fill, color: "#fff",
              border: "none", borderRadius: RADIUS.md,
              padding: "7px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONTS.body,
            }}
          >
            Save
          </button>
        </div>
      </div>

      {/* Tier gate banner */}
      {!isPro && (
        <div style={{
          background: "rgba(79,70,229,0.06)", border: "1px solid rgba(79,70,229,0.18)",
          borderRadius: RADIUS.lg, padding: "12px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>✨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, fontFamily: FONTS.body }}>
              Unlock Pro to customise your page
            </div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
              Change layout, add a bio video, hide agency branding, and set contact controls.
            </div>
          </div>
          <button
            type="button"
            onClick={() => openDrawer("talent-tier-compare")}
            style={{
              background: COLORS.accent, color: "#fff",
              border: "none", borderRadius: RADIUS.md,
              padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONTS.body, flexShrink: 0,
            }}
          >
            Upgrade →
          </button>
        </div>
      )}

      {/* Animated cover (Pro only) — WebGPU shader. Falls back to a
          static gradient when WebGPU isn't available. */}
      {isPro && <GalleryFxCard />}

      {/* Layout selector */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkDim, fontFamily: FONTS.body, marginBottom: 10 }}>
          Page template
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {TALENT_PAGE_TEMPLATES.map((tpl) => {
            const tierOrder: TalentSubscriptionTier[] = ["basic", "pro", "portfolio"];
            const locked = tierOrder.indexOf(tier) < tierOrder.indexOf(tpl.availableAt);
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  if (locked) { openDrawer("talent-tier-compare"); return; }
                  toast(`Template changed to "${tpl.label}"`, { tone: "success" });
                }}
                style={{
                  background:    "#fff",
                  border:        `2px solid ${locked ? COLORS.borderSoft : COLORS.border}`,
                  borderRadius:  RADIUS.md,
                  padding:       "12px 10px",
                  cursor:        locked ? "not-allowed" : "pointer",
                  opacity:       locked ? 0.6 : 1,
                  textAlign:     "center",
                  fontFamily:    FONTS.body,
                  position:      "relative",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{tpl.thumb}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>{tpl.label}</div>
                <div style={{ fontSize: 10, color: COLORS.inkMuted, marginTop: 2 }}>{tpl.blurb}</div>
                {locked && (
                  <div style={{
                    position: "absolute", top: 6, right: 6,
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                    padding: "2px 5px", borderRadius: 4,
                    background: COLORS.accentSoft, color: COLORS.accent,
                  }}>
                    PRO
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Visibility + contact settings */}
      <section style={{
        background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg, padding: "16px 18px", marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body, marginBottom: 12 }}>
          Visibility &amp; contact
        </div>
        {[
          { label: "Show on agency roster",      key: "roster",   val: true },
          { label: "Allow direct contact (free clients)", key: "free_contact", val: false },
          { label: "Show earnings history",       key: "earnings", val: false },
          { label: "Show agency name",            key: "agency",   val: true },
        ].map((row) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <span style={{ fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body }}>{row.label}</span>
            <button
              type="button"
              onClick={() => toast(`${row.label}: ${!row.val ? "on" : "off"}`, { tone: "default" })}
              style={{
                width: 36, height: 20, borderRadius: 10,
                background: row.val ? COLORS.fill : COLORS.card,
                border: `1px solid ${row.val ? COLORS.accent : COLORS.border}`,
                cursor: "pointer", position: "relative", flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: 2,
                left: row.val ? 17 : 2,
                width: 14, height: 14,
                borderRadius: "50%", background: "#fff",
                transition: "left .15s",
              }} />
            </button>
          </div>
        ))}
      </section>

      {/* Custom domain — Portfolio only */}
      <section style={{
        background: isPort ? "#fff" : COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg, padding: "16px 18px",
        opacity: isPort ? 1 : 0.7,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body }}>
            Custom domain
          </span>
          {!isPort && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
              padding: "2px 6px", borderRadius: 4,
              background: COLORS.accentSoft, color: COLORS.accent, fontFamily: FONTS.body,
            }}>
              PORTFOLIO
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body, margin: "0 0 10px" }}>
          Point your own domain (e.g. yourname.com) to your Tulala public page.
        </p>
        {isPort ? (
          <button
            type="button"
            onClick={() => openDrawer("talent-custom-domain")}
            style={{
              background: COLORS.fill, color: "#fff", border: "none",
              borderRadius: RADIUS.md, padding: "6px 14px", fontSize: 12,
              fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body,
            }}
          >
            Connect a domain →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openDrawer("talent-tier-compare")}
            style={{
              background: "transparent", color: COLORS.accent,
              border: `1px solid ${COLORS.accent}`, borderRadius: RADIUS.md,
              padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONTS.body,
            }}
          >
            Upgrade to Portfolio →
          </button>
        )}
      </section>

      {/* Mobile preview pane — appears when "Preview" toggle is on.
          Renders an iPhone-shaped card showing what tulala.digital/t/<slug>
          looks like on a phone. Pure CSS frame; no iframe (we don't have
          the public-page route in the prototype yet, so we render a
          stylized mock from the same MY_TALENT_PROFILE data). */}
      {preview && (
        <section
          aria-label="Mobile preview"
          style={{
            marginTop: 24,
            padding: 20,
            background: COLORS.surfaceAlt,
            borderRadius: RADIUS.lg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkDim, fontFamily: FONTS.body }}>
            Mobile preview · 390 × 844
          </div>
          <div
            data-tulala-mobile-preview
            style={{
              width: 320,
              height: 640,
              borderRadius: 36,
              background: "#0B0B0D",
              padding: 8,
              boxShadow: "0 24px 60px -10px rgba(11,11,13,0.30)",
              position: "relative",
            }}
          >
            {/* Notch */}
            <div style={{
              position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
              width: 86, height: 22, borderRadius: 12, background: "#0B0B0D",
              zIndex: 2,
            }} />
            {/* Screen */}
            <div
              style={{
                width: "100%", height: "100%",
                borderRadius: 28,
                background: "#fff",
                overflowY: "auto",
                fontFamily: FONTS.body,
                position: "relative",
              }}
            >
              {/* Cover banner */}
              <div style={{
                height: 180,
                background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.accentDeep} 100%)`,
                display: "flex", alignItems: "flex-end", padding: 14, color: "#fff",
              }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {profile.specialties[0] ?? "Talent"}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 }}>
                    {profile.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                    {profile.currentLocation}
                  </div>
                </div>
              </div>
              {/* Stats / measurements */}
              <div style={{ padding: "16px 16px 8px" }}>
                <p style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5, margin: 0 }}>
                  {profile.measurementsSummary} · {profile.bookingStats.completedBookings} bookings · {profile.bookingStats.yearsActive}y experience
                </p>
              </div>
              {/* Photo grid */}
              <div style={{ padding: "0 12px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    paddingBottom: "100%", borderRadius: 8,
                    background: `linear-gradient(${i*45}deg, ${COLORS.accentSoft}, ${COLORS.surfaceAlt})`,
                  }} />
                ))}
              </div>
              {/* Contact CTA */}
              <div style={{ padding: "0 16px 20px" }}>
                <button type="button" disabled style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12,
                  background: COLORS.fill, color: "#fff", border: "none",
                  fontSize: 13, fontWeight: 700, fontFamily: FONTS.body,
                  cursor: "default",
                }}>
                  Send an inquiry
                </button>
                <div style={{ fontSize: 10.5, color: COLORS.inkDim, textAlign: "center", marginTop: 8 }}>
                  Powered by Tulala
                </div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
            This is what visitors see at <strong>tulala.digital/t/{profile.name.toLowerCase().replace(/\s+/g, "-")}</strong>
          </div>
        </section>
      )}
    </div>
  );
}

