"use client";

/**
 * Talent Today — Agenda V2 only (ROLLOUT Step 4).
 * Soft kill switch empties the agenda bridge in layout; this page always
 * mounts AgendaTodayPage (no legacy WeekRhythm / conversation Today).
 */

import { useDashboardText } from "../../dashboard-i18n";
import { computePaidThisMonth } from "@/lib/talent/paid-this-month";
import { useAdminShell } from "../../state";
import { AgendaTodayPage } from "../agenda/AgendaTodayPage";
import { moneyFromEarnings } from "../agenda/present";
import { readAgendaNowClient } from "@/lib/talent-agenda/agenda-now";
import { resolveTradeProfile } from "@/lib/talent-agenda/trades";

export function TalentTodayPage() {
  const copy = useDashboardText();
  const {
    setTalentPage,
    bridgeTalentCompletion,
    bridgeTalentSelfProfile,
    bridgeTalentAgendaItems,
    bridgeTalentAgendaHours,
    bridgeTalentAgendaError,
    bridgeTalentEarnings,
    bridgeTalentPayoutSnapshot,
  } = useAdminShell();

  const payoutSet =
    bridgeTalentPayoutSnapshot?.ok === true
      ? bridgeTalentPayoutSnapshot.data.payoutsEnabled
      : false;

  const openAgendaPath = (path: string, fallbackPage: Parameters<typeof setTalentPage>[0]) => {
    const href = path.startsWith("/") ? path : `/talent/${path}`;
    const bookingMatch = href.match(/\/talent\/bookings\/([^/?#]+)/);
    if (bookingMatch?.[1] && bookingMatch[1] !== "new") {
      try {
        sessionStorage.setItem("tulala:agenda:bookingId", bookingMatch[1]);
      } catch {
        /* ignore */
      }
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

  return (
    <AgendaTodayPage
      profile={bridgeTalentSelfProfile}
      items={bridgeTalentAgendaItems ?? []}
      now={readAgendaNowClient(new Date())}
      loadError={bridgeTalentAgendaError}
      hours={bridgeTalentAgendaHours}
      completionMissingKeys={bridgeTalentCompletion?.missing.map((m) => m.key) ?? null}
      moneyItems={moneyFromEarnings({
        // Collected/payout come from earnings bridge; AgendaTodayPage
        // overwrites "Still to collect" with todayTotals from agenda items.
        collectedLabel: bridgeTalentEarnings
          ? `${(computePaidThisMonth(bridgeTalentEarnings).totalCents / 100).toFixed(2)} ${computePaidThisMonth(bridgeTalentEarnings).currency}`
          : "not shared",
        owedCents: bridgeTalentEarnings?.totals.pendingCents ?? null,
        currency: bridgeTalentEarnings?.totals.currency ?? "",
        cardPayouts: payoutSet,
      })}
      newLabel={resolveTradeProfile(bridgeTalentSelfProfile?.primaryTypeLabel).words.newLabel[copy.isSpanish ? 1 : 0]}
      onOpenAttention={() => setTalentPage("attention")}
      onOpenCalendar={() => setTalentPage("calendar")}
      onNewBooking={() => openAgendaPath("/talent/bookings/new", "bookings-new")}
      onOpenAvailability={() => setTalentPage("calendar-availability")}
      onOpenServices={() => setTalentPage("services")}
      onOpenSite={() => setTalentPage("public-page")}
      onOpenRecord={(id) => openAgendaPath(`/talent/bookings/${id}`, "booking-record")}
    />
  );
}
