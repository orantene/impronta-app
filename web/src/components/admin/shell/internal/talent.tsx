"use client";

import { useRef, type ReactNode } from "react";
import { EmptyState, Icon, useRovingTabindex } from "./primitives";
import { COLORS, FONTS, MY_TALENT_PROFILE, TALENT_PAGES, TALENT_PAGE_META, TALENT_TIER_META, TRANSITION, useAdminShell } from "./state";
import { CalendarPage } from "./talent/pages/CalendarPage";
import { MyProfilePage } from "./talent/pages/MyProfilePage";
import { PublicPageEditor } from "./talent/pages/PublicPageEditor";
import { SettingsPage } from "./talent/pages/SettingsPage";
import { TalentPayoutsPage } from "./page-modules/TalentPayoutsPage";
import { TalentTodayPage } from "./talent/pages/TodayPage";
import { TalentMessagesPage } from "./talent/pages/messages/MessagesPage";
import { PageHeader } from "./talent/shared/page-chrome-1";
import { MoneyPage } from "@/components/talent/money/MoneyPage";

// ── Re-export barrel: public API preserved for external importers ──
export { TalentMessagesPage } from "./talent/pages/messages/MessagesPage";
export { CLIENT_MOCK_CONVERSATIONS_BY_PROFILE } from "./talent/shared/client-conversations-1";
export type { Msg } from "./talent/shared/client-conversations-1";
export { MOCK_THREAD } from "./talent/shared/client-conversations-2";
export { ConversationThread, ParticipantsStack } from "./talent/shared/client-threads-1";
export { useTalentConversations } from "./talent/shared/conversation-adapter-1";
export { MOCK_CONVERSATIONS } from "./talent/shared/conversations-1";
export type { ConvOutcome, ConvSource, Conversation, Participant } from "./talent/shared/conversations-1";



// ════════════════════════════════════════════════════════════════════
// Surface entry
// ════════════════════════════════════════════════════════════════════

export function TalentSurface() {
  return (
    <div style={{ minHeight: "calc(100vh - 50px - 56px)" }} className="bg-admin-surface">
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
  const { state, setTalentPage, openDrawer, bridgeTalentSelfProfile } = useAdminShell();
  // Prefer bridge data so a freshly-provisioned talent sees their own
  // public URL in the topbar, not Marta's. The bridge supplies a
  // `profileCode` which we resolve against the canonical /t/<code> path;
  // fall back to MY_TALENT_PROFILE only in standalone prototype mode.
  const previewUrl = bridgeTalentSelfProfile?.profileCode
    ? `tulala.digital/t/${bridgeTalentSelfProfile.profileCode}`
    : (bridgeTalentSelfProfile ? null : MY_TALENT_PROFILE.publicUrl);
  // WS-12.6 — roving tabindex on talent topbar page nav
  const talentNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(talentNavRef, "button", { orientation: "horizontal" });

  // Current talent plan tier for the "Plan" nav badge — read from shared
  // shell state so the badge reflects live plan switches.
  const tier = state.talentTier;
  const tierLabel = TALENT_TIER_META[tier].label;
  const planBadge =
    tier === "max"
      ? { bg: COLORS.fill, fg: "#fff", border: COLORS.fill }
      : tier === "pro"
        ? { bg: COLORS.accentSoft, fg: COLORS.accent, border: "rgba(15,79,62,0.28)" }
        : { bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted, border: "rgba(11,11,13,0.10)" };

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

        {/* Plan — opens the talent tier-compare drawer. The badge shows
            the current tier (Free / Pro / Max). Stays visible at every
            breakpoint — it's a primary affordance, not secondary. */}
        <button
          type="button"
          onClick={() => openDrawer("talent-tier-compare")}
          data-tulala-talent-plan-nav
          aria-label={`Plan — currently ${tierLabel}. Open plan comparison.`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "8px 12px",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.inkMuted,
            letterSpacing: 0.1,
            borderRadius: 7,
            transition: `color ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; }}
        >
          Plan
          <span
            aria-hidden
            style={{
              fontFamily: FONTS.body,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: 999,
              background: planBadge.bg,
              color: planBadge.fg,
              border: `1px solid ${planBadge.border}`,
            }}
          >
            {tierLabel}
          </span>
        </button>

        {/* Preview public profile — secondary link on desktop only.
            Hidden on mobile because the topbar gets cramped and this
            isn't a primary action; talent can still preview from
            Profile / Public page. Was a chunky pill on a colored bg —
            now it's an unstyled link, calmer alongside the page nav. */}
        {previewUrl && (
          <a
            data-tulala-talent-preview-link
            href={`https://${previewUrl}`}
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
        )}
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
  const { state } = useAdminShell();
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
      // Legacy alias → the real Messages shell. The old InboxPage rendered a
      // hardcoded TALENT_REQUESTS fixture (Mango/Bvlgari/Vogue); messages is
      // the canonical, bridge-backed surface.
      page = <TalentMessagesPage />;
      break;
    case "calendar":
      page = <CalendarPage />;
      break;
    case "activity":
      // Legacy URL alias → money (earnings absorbed into Money page)
      page = <MoneyPage />;
      break;
    case "reach":
      // Legacy URL alias → money
      page = <MoneyPage />;
      break;
    case "agencies":
      // Legacy URL alias → money
      page = <MoneyPage />;
      break;
    case "money":
      page = <MoneyPage />;
      break;
    case "payouts":
      page = <TalentPayoutsPage />;
      break;
    case "public-page":
      // WS-8.2 — new canonical page
      page = <PublicPageEditor />;
      break;
    case "settings":
      page = <SettingsPage />;
      break;
  }
  // Task 0.6 — defensive fallback. If `state.talentPage` is ever an unknown
  // value (e.g. URL race, stale persisted state) `page` would stay null and
  // the body would render blank. Surface a visible loading / unknown-state
  // card instead so the user never sees an empty shell.
  if (page === null) {
    page = <TalentRouterFallback talentPage={state.talentPage} />;
  }
  return (
    <div key={state.talentPage} data-tulala-talent-page-anim style={{ animation: "tulala-page-fade .22s cubic-bezier(.4,0,.2,1)" }}>
      <style>{`@keyframes tulala-page-fade { from { opacity: 0; } to { opacity: 1; } } @media (prefers-reduced-motion: reduce) { [data-tulala-talent-page-anim] { animation: none !important; } }`}</style>
      {page}
    </div>
  );
}


/**
 * Task 0.6 — Defensive fallback rendered when the talent router can't match
 * `state.talentPage` to a known case. Ensures the body never renders blank
 * inside the talent shell. Title is generic ("Loading talent surface") so a
 * fast subsequent setTalentPage() update can swap to the correct page
 * without surfacing an alarming error to the user.
 */
function TalentRouterFallback({ talentPage }: { talentPage: string }) {
  return (
    <>
      <PageHeader
        title="Loading"
        subtitle="One moment — preparing your talent surface."
      />
      <EmptyState
        title="Almost there"
        body={`We're loading the "${talentPage}" view. If this card stays up, refresh the page or pick another section from the top nav.`}
      />
    </>
  );
}
