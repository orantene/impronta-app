"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useDashboardText } from "./dashboard-i18n";
import { EmptyState, Icon, useRovingTabindex } from "./primitives";
import { TALENT_SIDEBAR_ICON } from "./talent-nav-icons";
import { COLORS, FONTS, MY_TALENT_PROFILE, TALENT_PAGE_META, TALENT_TIER_META, useAdminShell, type TalentPage } from "./state";
import { PageHeader } from "./talent/shared/page-chrome-1";
import { ProfilePageSkeleton } from "./talent/pages/ProfilePageSkeleton";
import { TodaySkeleton } from "./talent/pages/today-skeleton";
import { useTalentStudioV2 } from "@/components/talent/studio/flag";
import { readAgendaNowClient } from "@/lib/talent-agenda/agenda-now";
import { tradeCalendarRules } from "@/lib/talent-agenda/trade-calendar";
import { resolveTalentPublicPreviewDestinations } from "@/lib/talent/public-profile-href";
import { useCurrentOrigin } from "@/lib/talent/use-public-profile-href";
import { useTalentSiteDashboardInitialLoad } from "@/components/talent/site/TalentSiteDashboardProvider";
import { bookingIdFromTalentPath } from "./state/talent-page-segment";
import { WorkingHoursPanelHost, openWorkingHoursPanel } from "./talent/agenda/WorkingHoursPanel";
import { NewBookingPanelHost, openNewBookingPanel } from "./talent/agenda/NewBookingPanel";
import { SendQuotePanelHost } from "./talent/agenda/SendQuotePanel";
import { pinNextConversation } from "./messages/conversation-pending";

// ── Page bodies load ON DEMAND (perf/talent-dev-bundle) ──
// Every talent page body used to be a static import here, so /talent/today
// downloaded the site builder + edit-chrome (PublicPageEditor), the messages
// v5 shell, Money, Agenda, etc. before it could hydrate (~30 MB of dev JS,
// measured with curl on 2026-09-28). Each body is now its own chunk group,
// fetched only when that page renders. `ssr` stays ON, so a hard load of any
// route still paints the page on the server.
// TUL-303: Today's `loading` MUST match the SSR first paint (TodaySkeleton).
// `loading: () => null` raced the SSR skeleton and threw React #418 on cold
// loads when the chunk arrived after hydrate started (harness: Today 2/3).
const CalendarPage = dynamic(() => import("./talent/pages/CalendarPage").then((m) => ({ default: m.CalendarPage })), { loading: () => null });
const MyProfilePage = dynamic(() => import("./talent/pages/MyProfilePage").then((m) => ({ default: m.MyProfilePage })), { loading: () => <ProfilePageSkeleton /> });
const PublicPageEditor = dynamic(() => import("./talent/pages/PublicPageEditor").then((m) => ({ default: m.PublicPageEditor })), { loading: () => null });
const ReviewsPage = dynamic(() => import("./talent/pages/ReviewsPage").then((m) => ({ default: m.ReviewsPage })), { loading: () => null });
const ServicesPage = dynamic(() => import("./talent/pages/ServicesPage").then((m) => ({ default: m.ServicesPage })), { loading: () => null });
const SettingsPage = dynamic(() => import("./talent/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })), { loading: () => null });
const TalentPayoutsPage = dynamic(() => import("./page-modules/TalentPayoutsPage").then((m) => ({ default: m.TalentPayoutsPage })), { loading: () => null });
const TalentTodayPage = dynamic(() => import("./talent/pages/TodayPage").then((m) => ({ default: m.TalentTodayPage })), { loading: () => <TodaySkeleton /> });
const TalentMessagesPage = dynamic(() => import("./talent/pages/messages/MessagesPage").then((m) => ({ default: m.TalentMessagesPage })), { loading: () => null });
const MoneyPage = dynamic(() => import("@/components/talent/money/MoneyPage").then((m) => ({ default: m.MoneyPage })), { loading: () => null });
const TalentClientsPage = dynamic(() => import("./talent/pages/ClientsPage").then((m) => ({ default: m.TalentClientsPage })), { loading: () => null });
const AgendaAttentionPage = dynamic(() => import("./talent/agenda/AgendaAttentionPage").then((m) => ({ default: m.AgendaAttentionPage })), { loading: () => null });
const AgendaCalendarPage = dynamic(() => import("./talent/agenda/AgendaCalendarPage").then((m) => ({ default: m.AgendaCalendarPage })), { loading: () => null });
const AgendaAvailabilityPage = dynamic(() => import("./talent/agenda/AgendaAvailabilityPage").then((m) => ({ default: m.AgendaAvailabilityPage })), { loading: () => null });
const BookingRecordRoute = dynamic(() => import("./talent/agenda/BookingRecordRoute").then((m) => ({ default: m.BookingRecordRoute })), { loading: () => null });
const AgendaNewBooking = dynamic(() => import("./talent/agenda/AgendaNewBooking").then((m) => ({ default: m.AgendaNewBooking })), { loading: () => null });

// ── Re-export barrel: public API preserved for external importers ──
export { CLIENT_MOCK_CONVERSATIONS_BY_PROFILE } from "./talent/shared/client-conversations-1";
export type { Msg } from "./talent/shared/client-conversations-1";
export { MOCK_THREAD } from "./talent/shared/client-conversations-2";
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
      // Talent Studio primaries are the brand fill, not the workspace slate.
      className="grid min-h-[calc(100vh-56px-50px)] grid-cols-[240px_1fr] bg-[var(--tc-canvas)] [--tulala-primary-fill:var(--tc-action)] [--tulala-primary-fill-deep:var(--tc-action-hover)]"
    >
      {/* The column carries the rail background so it runs the full page
          height; the sticky aside inside only pins the nav. */}
      <div data-tulala-app-sidebar-col className="border-r border-[var(--tc-border)] bg-[var(--tc-canvas)]">
        <TalentSidebar />
      </div>
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
  { label: "Work", pages: ["messages", "calendar", "clients", "money"] },
  { label: "Presence", pages: ["profile", "public-page", "services", "reviews"] },
];

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
          ? "border-[var(--tc-action)] bg-[var(--tc-soft)] font-semibold text-[var(--tc-ink)]"
          : "border-transparent bg-transparent font-medium text-[var(--tc-muted)] hover:bg-[var(--tc-soft)] hover:text-[var(--tc-ink)]"
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
          className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--tc-action)] px-[5px] text-[10px] font-bold leading-none text-white"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function TalentSidebar() {
  // The Support launcher portals into the rail slot only after this sidebar
  // has hydrated; a portal child present during hydration is a mismatch.
  const [supportSlotReady, setSupportSlotReady] = useState(false);
  useEffect(() => setSupportSlotReady(true), []);
  const copy = useDashboardText();
  const { state, setTalentPage, openDrawer, bridgeTalentSelfProfile, bridgeTalentUnread, bridgeTalentPlanTrial } = useAdminShell();
  const studioV2 = useTalentStudioV2();
  // WS-12.6 — roving tabindex on the rail: arrow keys move between pages.
  const railNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(railNavRef, "button");

  // Prefer bridge data so a freshly-provisioned talent sees their own
  // public URL, not the demo talent's. When a personal website is live,
  // default there (same rule as the top-bar eye); hub remains available
  // from the eye chooser / account menu.
  const origin = useCurrentOrigin();
  const siteLoad = useTalentSiteDashboardInitialLoad();
  const previewResolved = bridgeTalentSelfProfile?.profileCode
    ? resolveTalentPublicPreviewDestinations({
        profileCode: bridgeTalentSelfProfile.profileCode,
        publicSiteUrl: siteLoad?.ok ? siteLoad.state.publicSiteUrl : null,
        currentOrigin: origin,
      })
    : null;
  const previewHref = previewResolved
    ? previewResolved.defaultHref
    : bridgeTalentSelfProfile
      ? null
      : `https://${MY_TALENT_PROFILE.publicUrl}`;
  const previewLabel =
    previewResolved?.destinations[0]?.kind === "website" ? "Preview site" : "Preview profile";

  const tier = state.talentTier;
  const trialOn = studioV2 && bridgeTalentPlanTrial?.active === true;
  const tierLabel = copy.t(trialOn ? "Trial" : TALENT_TIER_META[tier].label);
  const tierChipClass =
    tier === "max"
      ? "border border-[var(--tc-action)] bg-[var(--tc-soft)] text-[var(--tc-action-ink)]"
      : tier === "pro"
        ? "border border-[var(--tc-action)] bg-[var(--tc-soft)] text-[var(--tc-action-ink)]"
        : "border border-[var(--tc-border)] bg-white text-[var(--tc-muted)]";

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
      className="sticky top-[calc(var(--proto-cbar,50px)+56px)] flex h-[calc(100vh-var(--proto-cbar,50px)-56px)] flex-col gap-[12px] self-start overflow-y-auto bg-[var(--tc-canvas)] px-[10px] pb-[12px] pt-[14px] font-admin-body"
    >
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
            title={trialOn && bridgeTalentPlanTrial?.expiresAt ? bridgeTalentPlanTrial.expiresAt : undefined}
            className={`rounded-full px-[6px] py-[2px] text-[9.5px] font-bold uppercase tracking-[0.4px] ${tierChipClass}`}
          >
            {tierLabel}
          </span>
        </button>
        <div aria-hidden className="mx-[10px] border-t border-admin-border" />
        {previewHref && (
          <a
            data-tulala-talent-preview-link
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-[8px] rounded-[8px] px-[10px] py-[8px] font-admin-body text-[12.5px] font-medium text-admin-ink-muted no-underline hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink [transition:background_var(--transition-admin-micro),color_var(--transition-admin-micro)]"
          >
            <Icon name="external" size={12} stroke={1.7} color="currentColor" />
            {copy.t(previewLabel)}
          </a>
        )}
        {/* Support Center launcher portals in here instead of floating. */}
        <div
          data-tulala-support-slot="rail"
          data-ready={supportSlotReady ? "" : undefined}
          className="contents"
        />
        {renderItem("settings")}
      </div>
    </aside>
  );
}


// ─── Router ───────────────────────────────────────────────────────

function TalentRouter() {
  const dashboardCopy = useDashboardText();
  const router = useRouter();
  const { state, setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgendaItems, bridgeTalentAgendaHours, bridgeTalentAgendaError, bridgeTalentAgendaV2, toast } = useAdminShell();
  const agendaV2 = bridgeTalentAgendaV2;
  // The clock is read after hydration: `new Date()` in render differs between
  // the server pass and the browser pass (React #418). Until it is known the
  // two clock-driven agenda pages render nothing for a frame.
  const [agendaNow, setAgendaNow] = useState<Date | null>(null);
  useEffect(() => {
    setAgendaNow(readAgendaNowClient(new Date()));
  }, []);
  const tradeRules = tradeCalendarRules(bridgeTalentSelfProfile?.primaryTypeLabel);
  const openAgendaPath = (path: string, fallbackPage: TalentPage) => {
    // Absolute /talent/… paths only. Relative "bookings/new" breaks under
    // /talent/calendar/availability → /talent/calendar/bookings/new.
    const href = path.startsWith("/") ? path : `/talent/${path}`;
    const bookingMatch = href.match(/\/talent\/bookings\/([^/?#]+)/);
    if (bookingMatch?.[1] && bookingMatch[1] !== "new") {
      try {
        sessionStorage.setItem("tulala:agenda:bookingId", bookingMatch[1]);
      } catch {
        /* ignore */
      }
      // Soft-nav keeps bridge agenda items in memory (full assign drops them
      // for the QA clock window and hides Finish and collect on the stub).
      setTalentPage("booking-record");
      if (typeof window !== "undefined") {
        const pinnedAgendaNow = new URLSearchParams(window.location.search).get("agendaNow");
        const next = pinnedAgendaNow
          ? `${href}${href.includes("?") ? "&" : "?"}agendaNow=${encodeURIComponent(pinnedAgendaNow)}`
          : href;
        window.history.pushState({}, "", next);
      }
      return;
    }
    if (typeof window !== "undefined") {
      const pinnedAgendaNow = new URLSearchParams(window.location.search).get("agendaNow");
      const withPin =
        pinnedAgendaNow && !href.includes("agendaNow=")
          ? `${href}${href.includes("?") ? "&" : "?"}agendaNow=${encodeURIComponent(pinnedAgendaNow)}`
          : href;
      window.location.assign(withPin);
      return;
    }
    setTalentPage(fallbackPage);
  };
  // W12 — the entry fade must NOT run on the very first paint: the browser
  // holds a CSS animation's timeline at frame 0 (from{opacity:0}) until the
  // JS bundle finishes loading, so animating the initial page left the WHOLE
  // dashboard invisible for the full hydration window (measured: opacity 0,
  // animation "running", 8s after navigation). The animation only attaches
  // once the user has actually SWITCHED pages — a fresh keyed remount plays
  // it; the SSR'd first page never carries it, so first paint is instant.
  const [initialPage] = useState(state.talentPage);
  const navigatedAway = state.talentPage !== initialPage;
  const [everNavigated, setEverNavigated] = useState(false);
  // Bumped when Send quote opens the new conversation, so Messages remounts on it.
  const [threadEpoch, setThreadEpoch] = useState(0);
  useEffect(() => { if (navigatedAway) setEverNavigated(true); }, [navigatedAway]);
  const animate = everNavigated || navigatedAway;
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
      page = agendaV2
        ? agendaNow === null ? null : (
          <AgendaCalendarPage
            items={bridgeTalentAgendaItems ?? []}
            hours={bridgeTalentAgendaHours}
            now={agendaNow}
            talentProfileId={bridgeTalentSelfProfile?.id}
            overnightToHour={tradeRules.overnightDisplayToHour}
            loadError={bridgeTalentAgendaError}
            tradeRules={tradeRules}
            onOpenToday={() => setTalentPage("today")}
            onNewBooking={openNewBookingPanel}
            onOpenAvailability={openWorkingHoursPanel}
            onOpenRecord={(id) => openAgendaPath(`/talent/bookings/${id}`, "booking-record")}
            onOpenMessages={() => setTalentPage("messages")}
          />
        )
        : <CalendarPage />;
      break;
    case "attention":
      page = agendaV2
        ? agendaNow === null ? null : (
          <AgendaAttentionPage
            items={bridgeTalentAgendaItems ?? []}
            now={agendaNow}
            loadError={bridgeTalentAgendaError}
            onOpenCalendar={() => setTalentPage("calendar")}
            onOpenBooking={(id) => openAgendaPath(`/talent/bookings/${id}`, "booking-record")}
            onOpenMessages={() => setTalentPage("messages")}
          />
        )
        : <TalentTodayPage />;
      break;
    case "bookings-new":
      page = agendaV2
        ? (
          <AgendaNewBooking
            talentTypeSlug={bridgeTalentSelfProfile?.primaryTypeLabel}
            talentProfileId={bridgeTalentSelfProfile?.id}
            agendaItems={bridgeTalentAgendaItems ?? []}
            hours={bridgeTalentAgendaHours}
            onCancel={() => setTalentPage("calendar")}
            // F63: one outcome every time. Back to where she opened New booking (Today or
            // Calendar), a "Booking saved" toast with View booking, and fresh agenda data (F42).
            onSaved={(id) => {
              toast(dashboardCopy.t("Booking saved"), id ? { action: { label: dashboardCopy.t("View booking"), onClick: () => openAgendaPath(`/talent/bookings/${id}`, "booking-record") } } : undefined);
              if (window.history.length > 1) router.back();
              else setTalentPage("calendar");
              router.refresh();
            }}
          />
        )
        : <TalentTodayPage />;
      break;
    case "booking-record": {
      const storedId = (() => {
        // The URL leads (F44); sessionStorage only covers a soft nav without an id in the path.
        const fromPath = typeof window !== "undefined" ? bookingIdFromTalentPath(window.location.pathname) : null;
        if (fromPath) {
          try {
            sessionStorage.setItem("tulala:agenda:bookingId", fromPath);
          } catch {
            /* ignore */
          }
          return fromPath;
        }
        try {
          const fromStore = sessionStorage.getItem("tulala:agenda:bookingId");
          if (fromStore && fromStore !== "undefined") return fromStore;
        } catch {
          /* ignore */
        }
        return "";
      })();
      if (agendaV2) {
        page = (
          <BookingRecordRoute
            bookingId={storedId}
            snapshot={bridgeTalentAgendaItems ?? null}
            onBack={() => setTalentPage("calendar")}
            onMessage={() => setTalentPage("messages")}
          />
        );
      }
      break;
    }
    case "calendar-availability":
      // TUL-358: hours editor whenever we have a profile id. Do not fall through
      // to the week CalendarPage (Disponibilidad there is block-dates, no zone).
      page = bridgeTalentSelfProfile?.id
        ? (
          <AgendaAvailabilityPage
            talentProfileId={bridgeTalentSelfProfile.id}
            initialHours={bridgeTalentAgendaHours}
            onBack={() => setTalentPage("calendar")}
          />
        )
        : <CalendarPage />;
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
    case "clients":
      page = <TalentClientsPage />;
      break;
    case "payouts":
      page = <TalentPayoutsPage />;
      break;
    case "public-page":
      // WS-8.2 — new canonical page
      page = <PublicPageEditor locale={dashboardCopy.isSpanish ? "es" : "en"} />;
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
    <div key={`${state.talentPage}:${threadEpoch}`} data-tulala-talent-page-anim style={animate ? { animation: "tulala-page-fade .22s cubic-bezier(.4,0,.2,1)" } : undefined}>
      <style>{`@keyframes tulala-page-fade { from { opacity: 0; } to { opacity: 1; } } @media (prefers-reduced-motion: reduce) { [data-tulala-talent-page-anim] { animation: none !important; } }`}</style>
      {page}
      <WorkingHoursPanelHost />
      <SendQuotePanelHost
        onOpenThread={(inquiryId) => {
          pinNextConversation(inquiryId);
          setTalentPage("messages");
          setThreadEpoch((n) => n + 1);
        }}
        onFallback={() => setTalentPage("messages")}
      />
      <NewBookingPanelHost
        onOpenRecord={(id) => openAgendaPath(`/talent/bookings/${id}`, "booking-record")}
        onFallback={() => openAgendaPath("/talent/bookings/new", "bookings-new")}
      />
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
