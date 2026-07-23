"use client";

import { useRef, type ReactNode } from "react";
import { useDashboardText } from "./dashboard-i18n";
import { EmptyState, Icon, useRovingTabindex } from "./primitives";
import { COLORS, FONTS, MY_TALENT_PROFILE, TALENT_PAGE_META, TALENT_TIER_META, useAdminShell, type TalentPage } from "./state";
import { CalendarPage } from "./talent/pages/CalendarPage";
import { MyProfilePage } from "./talent/pages/MyProfilePage";
import { PublicPageEditor } from "./talent/pages/PublicPageEditor";
import { ReviewsPage } from "./talent/pages/ReviewsPage";
import { ServicesPage } from "./talent/pages/ServicesPage";
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
    <div
      data-tulala-workspace-grid
      className="grid min-h-[calc(100vh-56px-50px)] grid-cols-[240px_1fr] bg-admin-surface"
    >
      <TalentSidebar />
      <main
        id="tulala-talent-content"
        tabIndex={-1}
        data-tulala-surface-main
        className="mx-auto w-full max-w-[1240px] px-[28px] pb-[96px] pt-[28px] outline-none"
      >
        <TalentRouter />
      </main>
    </div>
  );
}


// ─── Sidebar (W11) ─────────────────────────────────────────────────
// The workspace's grouped left rail, ported to the talent surface so
// hybrid users get ONE navigation identity across both dashboards.
// Replaces the horizontal TalentTopbar tab strip. Mobile reuses the
// shell's existing responsive CSS: [data-tulala-workspace-grid]
// collapses to one column and [data-tulala-app-sidebar] hides, with
// MobileBottomNav (which already handles surface="talent") taking over.

const TALENT_SIDEBAR_GROUPS: Array<{ label: string | null; pages: TalentPage[] }> = [
  { label: null, pages: ["today"] },
  { label: "Work", pages: ["messages", "calendar", "money"] },
  { label: "Presence", pages: ["profile", "public-page", "services", "reviews"] },
];

const TALENT_SIDEBAR_ICON: Record<string, Parameters<typeof Icon>[0]["name"]> = {
  today: "home",
  messages: "mail",
  calendar: "calendar",
  money: "credit",
  profile: "user",
  "public-page": "globe",
  services: "briefcase",
  reviews: "star",
  settings: "settings",
};

function TalentSidebarNavButton({
  page,
  active,
  badge,
  badgeTitle,
  onSelect,
  label,
}: {
  page: TalentPage;
  active: boolean;
  badge?: number;
  badgeTitle?: string;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={`flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] border px-[10px] py-[8px] text-left font-admin-body text-[13px] tracking-[0.05px] [transition:background_var(--transition-admin-micro),color_var(--transition-admin-micro),box-shadow_var(--transition-admin-micro)] ${
        active
          ? "border-admin-border-soft bg-white font-semibold text-admin-ink shadow-admin-rest"
          : "border-transparent bg-transparent font-medium text-admin-ink-muted hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink"
      }`}
    >
      <Icon
        name={TALENT_SIDEBAR_ICON[page] ?? "circle"}
        size={15}
        stroke={1.6}
        color="currentColor"
      />
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {label}
      </span>
      {badge != null && badge > 0 && (
        <span
          title={badgeTitle}
          aria-label={badgeTitle ?? `${badge}`}
          className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-admin-brand px-[5px] text-[10px] font-bold leading-none text-white"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function TalentSidebar() {
  const copy = useDashboardText();
  const { state, setTalentPage, openDrawer, bridgeTalentSelfProfile, bridgeTalentUnread } = useAdminShell();
  // WS-12.6 — roving tabindex on the rail: arrow keys move between pages.
  const railNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(railNavRef, "button");

  // Prefer bridge data so a freshly-provisioned talent sees their own
  // public URL, not the demo talent's.
  const previewUrl = bridgeTalentSelfProfile?.profileCode
    ? `tulala.digital/t/${bridgeTalentSelfProfile.profileCode}`
    : (bridgeTalentSelfProfile ? null : MY_TALENT_PROFILE.publicUrl);

  const tier = state.talentTier;
  const tierLabel = TALENT_TIER_META[tier].label;
  const tierChipClass =
    tier === "max"
      ? "bg-admin-ink text-white border border-admin-ink"
      : tier === "pro"
        ? "bg-[rgba(15,79,62,0.10)] text-admin-accent border border-[rgba(15,79,62,0.28)]"
        : "bg-[rgba(11,11,13,0.05)] text-admin-ink-muted border border-[rgba(11,11,13,0.10)]";

  const unread = bridgeTalentUnread ?? 0;

  const renderItem = (p: TalentPage) => {
    const active =
      state.talentPage === p ||
      (p === "messages" && state.talentPage === "inbox") ||
      (p === "money" && ["payouts", "agencies", "activity", "reach"].includes(state.talentPage));
    const badge = p === "messages" ? unread : 0;
    const badgeTitle =
      p === "messages"
        ? copy.isSpanish
          ? `${unread} sin leer`
          : `${unread} unread`
        : undefined;
    return (
      <TalentSidebarNavButton
        key={p}
        page={p}
        active={active}
        badge={badge}
        badgeTitle={badgeTitle}
        onSelect={() => setTalentPage(p)}
        label={copy.t(TALENT_PAGE_META[p].label)}
      />
    );
  };

  return (
    <aside
      data-tulala-app-sidebar
      className="sticky top-[calc(var(--proto-cbar,50px)+56px)] flex h-[calc(100vh-var(--proto-cbar,50px)-56px)] flex-col gap-[12px] self-start overflow-y-auto border-r border-admin-border-soft bg-admin-surface-alt px-[10px] pb-[12px] pt-[14px] font-admin-body"
    >
      {/* Keyboard users can bypass the rail nav entirely. */}
      <a href="#tulala-talent-content" className="skip-to-main">
        {copy.t("Skip to page content")}
      </a>

      <nav ref={railNavRef} aria-label={copy.t("Talent sections")} className="flex flex-col gap-[2px]">
        {TALENT_SIDEBAR_GROUPS.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`} className="flex flex-col gap-[2px]">
            {group.label && (
              <div
                aria-hidden
                className="px-[10px] pb-[4px] pt-[10px] text-[10px] font-bold uppercase tracking-[0.14em] text-admin-ink-dim"
              >
                {copy.t(group.label)}
              </div>
            )}
            {group.pages.map(renderItem)}
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Rail footer — what the old topbar carried: the Plan badge (opens
          the tier-compare drawer), the public-profile preview link, and
          Settings pinned Shopify-style. */}
      <div className="flex flex-col gap-[6px] border-t border-admin-border pt-[6px]">
        <button
          type="button"
          onClick={() => openDrawer("talent-tier-compare")}
          data-tulala-talent-plan-nav
          aria-label={`${copy.t("Plan")}, ${copy.t("currently")} ${tierLabel}. ${copy.t("Open plan comparison.")}`}
          className="flex w-full cursor-pointer items-center justify-between gap-[8px] rounded-[8px] border border-transparent bg-transparent px-[10px] py-[8px] text-left font-admin-body text-[13px] font-medium text-admin-ink-muted hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink [transition:background_var(--transition-admin-micro),color_var(--transition-admin-micro)]"
        >
          <span>{copy.t("Plan")}</span>
          <span
            aria-hidden
            className={`rounded-full px-[6px] py-[2px] text-[9.5px] font-bold uppercase tracking-[0.4px] ${tierChipClass}`}
          >
            {tierLabel}
          </span>
        </button>
        {previewUrl && (
          <a
            data-tulala-talent-preview-link
            href={`https://${previewUrl}`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-[8px] rounded-[8px] px-[10px] py-[8px] font-admin-body text-[12.5px] font-medium text-admin-ink-muted no-underline hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink [transition:background_var(--transition-admin-micro),color_var(--transition-admin-micro)]"
          >
            <Icon name="external" size={12} stroke={1.7} color="currentColor" />
            {copy.t("Preview profile")}
          </a>
        )}
        {renderItem("settings")}
      </div>
    </aside>
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
    case "services":
      page = <ServicesPage />;
      break;
    case "reviews":
      page = <ReviewsPage />;
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
  const copy = useDashboardText();
  return (
    <>
      <PageHeader
        title={copy.t("Loading")}
        subtitle={copy.t("One moment — preparing your talent surface.")}
      />
      <EmptyState
        title={copy.t("Almost there")}
        body={`${copy.t("We're loading this view:")} "${talentPage}". ${copy.t("If this card stays up, refresh the page or pick another section from the top nav.")}`}
      />
    </>
  );
}
