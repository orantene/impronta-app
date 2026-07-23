"use client";

import { useState } from "react";
import Link from "next/link";
import { logServerError } from "@/lib/server/safe-error";
import { useDashboardText } from "../../dashboard-i18n";
import { computePaidThisMonth } from "@/lib/talent/paid-this-month";
import { pinNextConversation as pinNextConversationT, pinNextThreadTab as pinNextThreadTabT } from "../../messages";
import { EmptyState, Icon, PrimaryButton } from "../../primitives";
import { COLORS, EARNINGS_ROWS, FONTS, MY_TALENT_PROFILE, RADIUS, TALENT_PROFILES_BY_ID, buildFreshTalentProfile, computeProfileCompleteness, useAdminShell } from "../../state";
import { TalentFirstRunBanner, TalentFunnelCard } from "../../wave2";
import { useTalentConversations } from "../shared/conversation-adapter-1";
import { EarningsTile } from "../shared/earnings-tile-1";
import { FirstSessionChecklist, ProfileCompletenessBanner } from "../shared/today-1";
import { SectionHeader, TalentTodayHero } from "../shared/today-2";
import { ConversationCalendarRow, NeedsReplySection } from "../shared/today-3";
import { WeekRhythmStrip } from "../shared/week-rhythm-1";
import { TalentAgencyFilterChips } from "../shared/TalentAgencyFilterChips";
import { TalentReviewsCard } from "../shared/reviews-card-1";
import { TalentServicesNudge } from "@/components/talent/services/TalentServicesNudge";

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", MXN: "MX$" };

export function TalentTodayPage() {
  const copy = useDashboardText();
  const {
    openDrawer,
    setTalentPage,
    bridgeTalentSelfProfile,
    bridgeTalentEarnings,
    bridgeTalentPayoutSnapshot,
    bridgeTalentRepresentation,
    bridgeTalentChecklistDismissed,
    state,
  } = useAdminShell();
  // "Start a workspace" tile is for talents who don't already own one.
  // `state.alsoTalent` flips to true once a workspace is provisioned for
  // this user (the hybrid identity), so we hide the tile in that case.
  const showStartWorkspaceTile = !state.alsoTalent;
  // Use real bridge data when available so a freshly-provisioned talent
  // sees their own name/photo/city in the Today header instead of Marta's.
  const profile = bridgeTalentSelfProfile
    ? buildFreshTalentProfile(bridgeTalentSelfProfile)
    : MY_TALENT_PROFILE;
  // Bridge-aware conversations. Falls back to MOCK_CONVERSATIONS when the
  // bridge array is empty (prototype / mock-mode sessions). See
  // `useTalentConversations()` above for the full adapter contract.
  const conversations = useTalentConversations();
  // Use real talentId from bridge when available; fall back to mock "t1".
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: selfTalentId, section });
  // W14 — real Day-1 checklist inputs, so a talent who already uploaded
  // photos or finished Stripe onboarding sees those rows ticked.
  const portfolioCount = bridgeTalentSelfProfile?.portfolioCount ?? 0;
  const payoutSet =
    bridgeTalentPayoutSnapshot?.ok === true
      ? bridgeTalentPayoutSnapshot.data.payoutsEnabled
      : false;
  // "Channels" = agency relationships actually representing this talent
  // publicly (the talent's global hide switch turns them all off).
  const channelsLive = bridgeTalentRepresentation
    ? bridgeTalentRepresentation.globalHidden
      ? 0
      : bridgeTalentRepresentation.entries.filter((e) => e.effective === "live").length
    : 0;
  // Dismissal persists per user (user_prefs.talent_checklist_dismissed).
  // Seeded from the bridge, then optimistic on click.
  const [dismissedLocal, setFirstSessionDismissed] = useState(false);
  const firstSessionDismissed = dismissedLocal || bridgeTalentChecklistDismissed === true;

  // ── Today's data is derived from conversations (bridge-aware) — the
  //    same source the messages shell reads. One source, one truth.
  //    Every Today row click pins that exact conversation and lands the
  //    talent inside the messages shell where they can act on it.
  // ──
  // "Needs your reply" — the talent owes the next message: stage is in
  // an active negotiation (inquiry/hold) and the last message wasn't
  // from them. Sorted oldest-first so the most overdue surfaces at top.
  const replyConvs = conversations
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
  const watchingConvs = conversations.filter((c) =>
    (c.stage === "inquiry" || c.stage === "hold") && !replyConvIds.has(c.id),
  );

  // "Next on the calendar" — derived from conversations (same source as
  // the messages shell's Booked filter). The booked jobs appear here;
  // click takes the talent straight to the logistics tab inside the
  // messages shell where the call sheet, transport, hotel, schedule live.
  const upcoming = conversations.filter((c) => c.stage === "booked");
  // Paid this month — REAL data when the talent bridge is active (matches the
  // Money page); the EARNINGS_ROWS fixture only renders in standalone/demo mode
  // (no bridge). A real talent with no paid bookings now honestly sees 0
  // instead of the old hard-coded €6,800 demo total.
  let paidThisMonthTotal: number;
  let paidThisMonthCurrency: string;
  if (bridgeTalentEarnings != null) {
    const ptm = computePaidThisMonth(bridgeTalentEarnings);
    paidThisMonthTotal = ptm.totalCents / 100;
    paidThisMonthCurrency = CURRENCY_SYMBOL[ptm.currency.toUpperCase()] ?? ptm.currency.toUpperCase();
  } else {
    const fixtureRows = EARNINGS_ROWS.filter((e) => e.payoutDate.includes("Apr"));
    paidThisMonthTotal = fixtureRows.reduce((sum, e) => {
      const num = parseFloat(e.amount.replace(/[^0-9.]/g, ""));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
    paidThisMonthCurrency = fixtureRows[0]?.amount.match(/[€£$]/)?.[0] ?? "€";
  }
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

  // ── Onboarding banner: freshly-provisioned talents show a prominent
  // "Finish setting up your profile" card at the top of Today until they
  // hit 100% completeness. Clicking a chip deep-links to the matching
  // drawer section. Only renders when the bridge has provided a real
  // talent profile (skips the prototype demo path).
  const isFreshSelf = !!bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId];
  const onboardingCompleteness = isFreshSelf
    ? computeProfileCompleteness(profile, [profile.primaryType, ...profile.secondaryTypes])
    : null;
  const onboardingSectionForLabel = (label: string): string => {
    const lower = label.toLowerCase();
    if (lower.includes("polaroid")) return "polaroids";
    if (lower.includes("rate")) return "rates";
    if (lower.includes("showreel") || lower.includes("photo") || lower.includes("portfolio") || lower.includes("album")) return "media";
    if (lower.includes("language")) return "languages";
    if (lower.includes("availab")) return "availability";
    if (lower.includes("skill")) return "services";
    if (lower.includes("credit")) return "credits";
    if (lower.includes("limit")) return "limits";
    if (lower.includes("verif")) return "verifications";
    if (lower.includes("bio") || lower.includes("about") || lower.includes("tagline")) return "about";
    if (lower.includes("location") || lower.includes("city") || lower.includes("travel")) return "location";
    if (lower.includes("type") || lower.includes("primary") || lower.includes("category")) return "services";
    return "identity";
  };

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

      <TalentAgencyFilterChips />

      {showStartWorkspaceTile && <StartWorkspaceTile />}

      {/* Fresh-talent onboarding banner — only for talents who were just
          provisioned via "Create your talent page" (bridge has their
          profile but the prototype mock index doesn't). Renders ABOVE
          everything else so the talent's first action is to finish their
          profile. Hidden once completeness hits 100 — but always shows on
          first session even if the math returns 100 (defensive: a freshly-
          provisioned profile still has nothing in it). */}
      {isFreshSelf && onboardingCompleteness && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "16px 18px",
            marginBottom: 16,
            borderRadius: 14,
            background: "linear-gradient(135deg, rgba(15,79,62,0.08), rgba(91,107,160,0.08))",
            border: `1px solid rgba(15,79,62,0.18)`,
            fontFamily: FONTS.body,
          }}
        >
          <div className="flex items-center gap-3.5">
            <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: "50%", background: "#fff", border: `2px solid ${COLORS.accent}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-accent-deep">
              {onboardingCompleteness.percent}%
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }} className="text-admin-ink">
                {copy.t("Finish setting up your profile")}
              </div>
              <div className="text-admin-ink-muted text-admin-12h">
                {onboardingCompleteness.missing.length} {onboardingCompleteness.missing.length === 1 ? copy.t("field") : copy.t("fields")} {copy.t("left before you can publish + take bookings.")}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <PrimaryButton
                size="sm"
                onClick={() => {
                  const first = onboardingCompleteness.missing[0];
                  openSection(first ? onboardingSectionForLabel(first.label) : "identity");
                }}
              >
                {copy.t("Continue setup →")}
              </PrimaryButton>
              {/* Additive alternate path: the guided step-by-step wizard. The
                  drawer-based "Continue setup" above stays the default. */}
              <Link
                href="/talent/onboarding"
                className="text-admin-11h font-semibold text-admin-accent-deep underline underline-offset-2 hover:opacity-80"
              >
                {copy.t("Guided setup")}
              </Link>
            </div>
          </div>
          {onboardingCompleteness.missing.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {onboardingCompleteness.missing.slice(0, 8).map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => openSection(onboardingSectionForLabel(m.label))}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 999,
                    background: "#fff",
                    border: `1px solid ${COLORS.borderSoft}`,
                    color: COLORS.ink,
                    fontFamily: FONTS.body,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + {copy.t(m.label)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* First-session checklist — shows ONCE on Day-1 and routes the
          new talent through the 4 onboarding wins that unlock inquiries.
          Sits above the hero so it's the first thing they see.
          W14: every row now reflects real bridge state (photo count, live
          agency channels, payouts-enabled), so a talent who already did a
          step sees it ticked instead of a permanently-empty checklist. */}
      {isDay1 && !firstSessionDismissed && !onboardingCompleteness && (
        <FirstSessionChecklist
          completeness={profile.completeness}
          polaroidCount={portfolioCount}
          channelsLive={channelsLive}
          payoutSet={payoutSet}
          onProfile={() => openSection("identity")}
          onPolaroids={() => openSection("polaroids")}
          onReach={() => setTalentPage("money")}
          onPayouts={() => setTalentPage("payouts")}
          onDismiss={() => {
            setFirstSessionDismissed(true);
            import("@/lib/server-actions/user-prefs")
              .then(({ markTalentChecklistDismissed }) => markTalentChecklistDismissed())
              .catch((err: unknown) => logServerError("talentchecklistdismiss", err));
          }}
        />
      )}

      {/* WS-9.2 — modern first-run banner for returning-but-incomplete users
          (after Day-1 so it doesn't clash with FirstSessionChecklist).
          Also hidden while the fresh-talent setup band above is showing —
          ONE card owns onboarding at a time; they used to stack. */}
      {!isDay1 && profile.completeness < 40 && !onboardingCompleteness && (
        <TalentFirstRunBanner />
      )}

      {/* Profile-completeness banner — only when below the visibility
          threshold. Indigo soft (info, not urgent) with a clear CTA.
          Auto-disappears at >= 80% so it never becomes wallpaper. Hidden
          on Day-1 since the FirstSessionChecklist owns that moment. */}
      {!isDay1 && profile.completeness >= 40 && profile.completeness < 80 && !onboardingCompleteness && (
        <ProfileCompletenessBanner
          percent={profile.completeness}
          missing={profile.missing}
          onFinish={() => openSection("identity")}
        />
      )}

      {/* Lane E — "add your first service" nudge. Renders only for a real
          (bridge-backed) talent with ZERO offerings; the component hides
          itself otherwise, so this never fires for mock/prototype sessions. */}
      {bridgeTalentSelfProfile && (
        <TalentServicesNudge
          talentId={bridgeTalentSelfProfile.id}
          onAddService={() => setTalentPage("services")}
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
          title={copy.t("Next on the calendar")}
          subtitle={
            upcoming.length === 0
              ? undefined
              : `${upcoming.length} ${copy.t("upcoming")} · ${copy.t("next")} ${upcoming[0]?.date}`
          }
          actionLabel={copy.t("See calendar →")}
          onAction={() => setTalentPage("calendar")}
        />
        {upcoming.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={copy.t("Calendar's clear")}
            body={copy.t("No confirmed bookings yet. The first one always lands faster than you think.")}
            compact
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {upcoming.map((c) => (
              <ConversationCalendarRow
                key={c.id}
                conv={c}
                onOpen={() => openInMessagesAt(c.id, "booking")}
              />
            ))}
          </div>
        )}
      </section>

      <div style={{ height: 12 }} />

      {/* 4 — WS-8.4 This-week rhythm strip */}
      <WeekRhythmStrip />

      {/* 5 — Looking back: earnings tile (WS-8.3), full width. The old
          "Profile views · last 7 days" analytics card was removed — it showed
          a fabricated 48 views / "from Mango site" / 3 inquiries with no real
          per-talent view metric behind it. Re-add it here once a real
          profile-view signal exists in the bridge. */}
      <EarningsTile
        currency={paidThisMonthCurrency}
        monthTotal={paidThisMonthTotal}
        earnings={bridgeTalentEarnings}
        // "See all earnings" belongs on the Money page (real ledger + payouts),
        // not the career-analytics drawer it used to open.
        onSeeAll={() => setTalentPage("money")}
      />

      {/* W8 — two-sided reviews. The talent's received (client→talent) rating
          summary + recent reviews, and a "Rate your clients" list for the
          talent→client direction. Self-suppresses when there's nothing yet. */}
      <TalentReviewsCard />

      {/* WS-8.14 Agency analytics quick-access */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => openDrawer("talent-career-analytics")}
          style={{
            flex: 1, padding: "9px 0", border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }} className="bg-admin-surface-alt rounded-admin-md text-admin-ink-muted">
          <Icon name="sparkle" size={12} color={COLORS.inkMuted} />
          {copy.t("Career analytics")}
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
          {copy.t("Agency analytics")}
        </button>
      </div>
    </>
  );
}

/**
 * StartWorkspaceTile — top-of-page nudge that invites talent to run their
 * own roster. Click fires the global "open start-workspace dialog" event
 * the TulalaIdentityBar listens for; the existing StartFreeWorkspaceDialog
 * handles the actual provisioning.
 *
 * Hidden once the user is hybrid (state.alsoTalent). Visual register matches
 * the Tulala marketing palette (parchment + forest accent), not the workspace
 * shell — so it reads as opportunity, not a system notice.
 */
function StartWorkspaceTile() {
  const copy = useDashboardText();
  return (
    <div
      data-platform-surface="marketing"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        marginBottom: 12,
        borderRadius: 14,
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--plt-forest) 9%, var(--plt-bg-elevated)) 0%, var(--plt-bg-elevated) 60%)",
        border: "1px solid color-mix(in srgb, var(--plt-forest) 22%, transparent)",
        fontFamily: FONTS.body,
      }}
    >
      {/* Glyph */}
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "var(--plt-bg)",
          border: "1px solid color-mix(in srgb, var(--plt-forest) 22%, transparent)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--plt-forest)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12 11v5M9.5 13.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>

      {/* Copy */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.25,
            color: "var(--plt-ink)",
            letterSpacing: "-0.005em",
          }}
        >
          {copy.t("Run your own talent business?")}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 12.5,
            lineHeight: 1.4,
            color: "var(--plt-muted)",
          }}
        >
          {copy.t("Start a free workspace — invite roster, send pitches, take bookings end-to-end. 1 minute, no card.")}
        </div>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("tulala:open-start-workspace-dialog"))
        }
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "9px 16px",
          borderRadius: 999,
          background: "var(--plt-forest)",
          color: "var(--plt-forest-on)",
          border: "none",
          cursor: "pointer",
          fontFamily: FONTS.body,
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          transition: "background 120ms ease, transform 120ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--plt-forest-deep)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--plt-forest)";
        }}
      >
        {copy.t("Start a workspace")}
        <svg width="11" height="9" viewBox="0 0 14 10" fill="none" aria-hidden>
          <path
            d="M1 5H13M13 5L9 1M13 5L9 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
