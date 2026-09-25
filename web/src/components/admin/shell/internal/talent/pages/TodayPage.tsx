"use client";

/**
 * Talent Today — Agenda V2 only (ROLLOUT Step 4).
 * Legacy conversation-first Today was removed after TALENT_AGENDA_V2=all.
 * Kill switch: set TALENT_AGENDA_V2=0 (stops agenda load; UI stays V2 empty).
 */

import { computePaidThisMonth } from "@/lib/talent/paid-this-month";
import { useDashboardText } from "../../dashboard-i18n";
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
