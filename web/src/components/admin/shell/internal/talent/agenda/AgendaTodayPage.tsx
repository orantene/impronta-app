"use client";

import { useEffect, useMemo, useState } from "react";
import { todayTotals } from "@/lib/talent-agenda/derive";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import {
  pinMoneyLanding,
  todayMoneyTilesFromLedger,
  type MoneyLanding,
} from "@/lib/money/today-money-tiles";
import type { TalentSelfProfile } from "../../data-bridge";
import { PageHeader } from "../shared/page-chrome-1";
import { SecondaryButton } from "../../primitives";
import {
  AgendaRow,
  EmptyDay,
  MoneyBlock,
  NowBox,
  TALENT_AGENDA_VARS,
} from "./primitives";
import { formatAgendaDate } from "./view-model";
import type { AgendaRowItem } from "./types";
import { AgendaFirstDay } from "./AgendaFirstDay";
import {
  moneyFromLedger,
  rebookHint,
  rowFromAgendaItem,
  todayFromAgenda,
} from "./present";
import {
  firstDayCompletedStepIds,
  hasBookingHoursWindows,
  isFirstDayEligible,
} from "@/lib/talent-agenda/first-day";
import type { BookingHours } from "@/lib/scheduling/hours-types";
import { useAgendaCopy } from "./use-agenda-copy";

function withOpen(item: AgendaRowItem, onOpenRecord?: (id: string) => void): AgendaRowItem {
  if (!onOpenRecord) return item;
  return { ...item, onOpen: () => onOpenRecord(item.id) };
}

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatBookedMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} h ${m}`;
  if (h > 0) return `${h} h`;
  return `${m} m`;
}

export function AgendaTodayPage({
  profile,
  items = [],
  onOpenAttention,
  onOpenCalendar,
  onNewBooking,
  onOpenRecord,
  onOpenAvailability,
  onOpenServices,
  onOpenSite,
  onOpenMoney,
  newLabel,
  now,
  loadError,
  hours,
  completionMissingKeys,
}: {
  profile: TalentSelfProfile | null;
  items?: TalentAgendaItem[];
  onOpenAttention: () => void;
  onOpenCalendar: () => void;
  onNewBooking?: () => void;
  onOpenRecord?: (id: string) => void;
  onOpenAvailability?: () => void;
  onOpenServices?: () => void;
  onOpenSite?: () => void;
  /** Open Money after pinning a landing (M3 Due by today → mc_out_today). */
  onOpenMoney?: (landing: MoneyLanding) => void;
  newLabel?: string;
  now?: Date;
  loadError?: string | null;
  hours?: BookingHours | null;
  /** Keys from bridgeTalentCompletion.missing — drives first-day steps. */
  completionMissingKeys?: string[] | null;
}) {
  const copy = useAgendaCopy();
  const clock = now ?? new Date();
  const [attentionLimit, setAttentionLimit] = useState(3);
  const [rebookDismissed, setRebookDismissed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const apply = () => setAttentionLimit(media.matches ? 2 : 3);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const derived = todayFromAgenda(items, clock);
  const attentionItems = derived.attention.map((item) =>
    withOpen(rowFromAgendaItem(item, clock), onOpenRecord),
  );
  const nextUp = derived.next ? withOpen(rowFromAgendaItem(derived.next, clock), onOpenRecord) : null;
  const restOfToday = derived.rest.map((item) => withOpen(rowFromAgendaItem(item, clock), onOpenRecord));
  const totals = todayTotals(items, clock, localYmd(clock));
  const ledgerTiles = useMemo(() => todayMoneyTilesFromLedger(), []);
  const moneyItems = useMemo(() => {
    if (!onOpenMoney) return [];
    return moneyFromLedger({
      tiles: ledgerTiles,
      isSpanish: copy.isSpanish,
      onOpen: (landing) => {
        pinMoneyLanding(landing);
        onOpenMoney(landing);
      },
    });
  }, [copy.isSpanish, ledgerTiles, onOpenMoney]);
  const firstName = profile?.displayName?.split(" ")[0] ?? "";
  const city = profile?.homeCity ?? "";
  const rebook = rebookDismissed ? null : rebookHint(items, derived.next);

  const completedStepIds = firstDayCompletedStepIds({
    missingKeys: completionMissingKeys,
    portfolioCount: profile?.portfolioCount,
    primaryTypeLabel: profile?.primaryTypeLabel,
    homeCity: profile?.homeCity,
    profileCode: profile?.profileCode,
    workflowStatus: profile?.workflowStatus,
    hours,
  });
  const hasAvailability = hasBookingHoursWindows(hours);
  const isFirstDay = isFirstDayEligible({
    loadError,
    agendaItemCount: items.length,
    completedStepIds,
  });
  const liveSiteUrl =
    profile?.workflowStatus === "published" && profile.profileCode
      ? `https://tulala.digital/t/${encodeURIComponent(profile.profileCode)}`
      : null;

  if (loadError) {
    return (
      <div style={TALENT_AGENDA_VARS} className="space-y-4">
        <PageHeader
          title={firstName ? `${copy.t("Hi")}, ${firstName}` : copy.t("Today")}
          subtitle={[formatAgendaDate(clock), city].filter(Boolean).join(" · ")}
        />
        <NowBox
          tone="danger"
          title={copy.t("Could not load your agenda")}
          body={loadError}
          primaryAction={{
            label: copy.t("Refresh"),
            onClick: () => {
              if (typeof window !== "undefined") window.location.reload();
            },
          }}
        />
      </div>
    );
  }

  if (isFirstDay) {
    return (
      <div style={TALENT_AGENDA_VARS} className="space-y-4">
        <PageHeader
          title={firstName ? `${copy.t("Hi")}, ${firstName}` : copy.t("Today")}
          subtitle={[formatAgendaDate(clock), city].filter(Boolean).join(" · ")}
        />
        <AgendaFirstDay
          completedStepIds={completedStepIds}
          hasAvailability={hasAvailability}
          liveSiteUrl={liveSiteUrl}
          onOpenAvailability={onOpenAvailability ?? onOpenCalendar}
          onOpenServices={onOpenServices ?? (() => undefined)}
          onOpenSite={onOpenSite ?? (() => undefined)}
          onEditSite={onOpenSite}
        />
      </div>
    );
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="space-y-4">
      <PageHeader
        title={firstName ? `${copy.t("Hi")}, ${firstName}` : copy.t("Today")}
        subtitle={[formatAgendaDate(clock), city].filter(Boolean).join(" · ")}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {/* Website % lives only in the top-bar reward control (criterion 1:
                one number everywhere). Do not show a second first-day
                readiness chip on a populated Today. */}
            <SecondaryButton onClick={onNewBooking ?? onOpenCalendar}>
              {newLabel ?? copy.t("New booking")}
            </SecondaryButton>
          </div>
        )}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">
            {copy.t("Needs attention")}
          </h2>
          {attentionItems.length > attentionLimit ? (
            <button
              type="button"
              onClick={onOpenAttention}
              className="min-h-[44px] px-2 text-[12.5px] font-medium text-[var(--tc-accent)]"
            >
              {copy.t("View all")} {attentionItems.length}
            </button>
          ) : null}
        </div>
        {attentionItems.length > 0 ? (
          <div className="space-y-3">
            {attentionItems.slice(0, attentionLimit).map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <NowBox
            tone="info"
            title={copy.t("Nothing needs attention")}
            body={copy.t("You are clear for now.")}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">{copy.t("Next up")}</h2>
        {nextUp ? (
          <AgendaRow item={nextUp} />
        ) : (
          <EmptyDay title={copy.t("Nothing next")} body={copy.t("The rest of the day is open.")} />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">
            {copy.t("Rest of today")}
          </h2>
          <p className="mt-1 text-[13px] text-[#5F6368]">
            {totals.appointmentsToday} {copy.t("appointments")} · {formatBookedMinutes(totals.bookedMinutes)}
          </p>
        </div>
        {restOfToday.length > 0 ? (
          <div className="space-y-3">
            {restOfToday.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyDay title={copy.t("Nothing else today")} body={copy.t("Open the calendar to see the week.")} />
        )}
      </section>

      {moneyItems.length > 0 ? <MoneyBlock items={moneyItems} /> : null}

      {rebook ? (
        <div className="rounded-[16px] border border-[rgba(11,11,13,0.10)] bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--tc-accent)]">
                {copy.t("Suggestion")}
              </div>
              <p className="mt-1 text-[14px] text-[var(--tc-primary)]">
                {copy.t("Rebook")} {rebook.clientName} · {rebook.lastService}
              </p>
            </div>
            <button
              type="button"
              className="min-h-[44px] text-[13px] text-[var(--tc-accent)]"
              onClick={() => setRebookDismissed(true)}
            >
              {copy.t("Dismiss")}
            </button>
          </div>
          {onNewBooking ? (
            <SecondaryButton onClick={onNewBooking}>{copy.t("New booking")}</SecondaryButton>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onOpenCalendar}
        className="min-h-[44px] text-[13px] font-medium text-[var(--tc-accent)]"
      >
        {copy.t("Open calendar")}
      </button>
    </div>
  );
}
