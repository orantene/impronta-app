"use client";

/**
 * EventDetail — one event as the boards draw it: the header with its date
 * chips, zone, status and the three actions; the ten-row sub-nav on the
 * left; the tab on the right. Tickets & Offers (`event-tab-tickets`), Venue
 * & Seating and Event Day (`event-tab-day`) are their own files; Overview
 * and Details & Schedule live here; Orders, Guests, Page & Promotion, Money
 * & Reports and Settings say what they wait on rather than draw a blank.
 *
 * `Publish` and `Cancel event` are `setEventStatus`; `Open event day` is the
 * POS Door mode; `Preview` is the public event page. `Share` has no link
 * writer and is disabled with its sentence.
 */

import { useState, useTransition } from "react";

import { setEventStatus, type EventListRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";

import { ActionButton, FactRow, Outcome, StatePill, type PillTone } from "../appointments-classes-ui";
import { CARD } from "../catalog/catalog-ui";
import { Icon } from "../../primitives";
import type { EventsNav } from "./EventsPage";
import { whenLabel } from "./EventsList";
import { EventDayTab, EventVenueTab } from "./event-tab-day";
import { SessionSeats, TicketsTab } from "./event-tab-tickets";
import { DETAIL_TABS, eventState, type DetailTab, type EventState } from "./events-model";

const STATE_TONE: Record<EventState, PillTone> = { draft: "slate", salesOpen: "green", noNight: "coral", noTier: "coral", finished: "slate", cancelled: "critical" };

export function EventDetail({ event, nav, locale, onChanged }: { event: EventListRow; nav: EventsNav; locale: string; onChanged: () => void }) {
  const t = useT();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, startStatus] = useTransition();
  const [dateId, setDateId] = useState<string | null>(null);
  const state = eventState(event);
  const stateLabel: Record<EventState, string> = {
    draft: t("dashboard.events.state.draft"),
    salesOpen: t("dashboard.events.state.salesOpen"),
    noNight: t("dashboard.events.state.noNight"),
    noTier: t("dashboard.events.state.noTier"),
    finished: t("dashboard.events.state.finished"),
    cancelled: t("dashboard.events.state.cancelled"),
  };
  const tabLabel: Record<DetailTab, string> = {
    overview: t("dashboard.events.tab.overview"),
    schedule: t("dashboard.events.tab.schedule"),
    tickets: t("dashboard.events.tab.tickets"),
    venue: t("dashboard.events.tab.venue"),
    orders: t("dashboard.events.tab.orders"),
    guests: t("dashboard.events.tab.guests"),
    day: t("dashboard.events.tab.day"),
    page: t("dashboard.events.tab.page"),
    money: t("dashboard.events.tab.money"),
    settings: t("dashboard.events.tab.settings"),
  };
  const noDate = t("dashboard.events.detail.noDate");
  const sessions = event.sessions;
  const selectedSession = sessions.find((s) => s.id === dateId) ?? null;
  const when = (iso: string | null) => whenLabel(iso, event.timeZone, locale, noDate);

  const setStatus = (to: "published" | "cancelled") => {
    if (to === "cancelled" && !window.confirm(t("dashboard.events.detail.cancelConfirm"))) return;
    setStatusError(null);
    startStatus(async () => {
      const r = await setEventStatus({ eventId: event.id, to });
      if (!r.ok) setStatusError(r.error);
      else onChanged();
    });
  };

  const notBuilt = (what: string, waitingOn: string, testId: string) => (
    <div className="rounded-[10px] border border-dashed border-admin-border-soft p-[20px]" data-testid={testId}>
      <div className="font-admin-body text-[14px] font-semibold text-admin-ink">{what}</div>
      <p className="m-0 mt-[6px] max-w-[560px] font-admin-body text-[13px] leading-[1.5] text-admin-ink-muted">{waitingOn}</p>
    </div>
  );

  const body = (() => {
    switch (nav.tab) {
      case "overview":
        return (
          <div className="flex max-w-[640px] flex-col gap-[14px]" data-testid="events-panel-overview">
            <div className={`${CARD} px-[16px] py-[8px]`}>
              <FactRow label={t("dashboard.events.overview.status")}>
                <StatePill tone={STATE_TONE[state]} state={state} testId="events-status-pill">
                  {stateLabel[state]}
                </StatePill>
              </FactRow>
              <FactRow label={t("dashboard.events.overview.soldAs")}>{event.admissionKind}</FactRow>
              <FactRow label={t("dashboard.events.overview.nextSession")}>{event.runFinished ? t("dashboard.events.list.runFinished") : when(event.nextSessionAt)}</FactRow>
              <FactRow label={t("dashboard.events.overview.doors")}>
                {event.doorsOffsetMinutes > 0 ? interpolate(t("dashboard.events.overview.doorsBefore"), { minutes: event.doorsOffsetMinutes }) : t("dashboard.events.overview.doorsWith")}
              </FactRow>
              <FactRow label={t("dashboard.events.overview.refunds")}>
                {event.refundCutoffHours === null ? t("dashboard.events.overview.refundsDefault") : interpolate(t("dashboard.events.overview.refundsUntil"), { hours: event.refundCutoffHours })}
              </FactRow>
              <FactRow label={t("dashboard.events.overview.payout")}>{event.payoutReleaseRule.replace(/_/g, " ")}</FactRow>
              <FactRow label={t("dashboard.events.overview.publicAddress")} muted>
                /events/{event.slug}
                {event.status === "published" ? ` ${t("dashboard.events.overview.live")}` : event.status === "cancelled" ? ` ${t("dashboard.events.overview.cancelledSuffix")}` : ` ${t("dashboard.events.overview.draftSuffix")}`}
              </FactRow>
            </div>
            <div className="flex flex-wrap items-center gap-[8px]">
              {event.status === "draft" ? (
                <ActionButton tone="primary" onClick={() => setStatus("published")} disabled={statusBusy} testId="events-publish">
                  {statusBusy ? t("dashboard.events.detail.publishing") : t("dashboard.events.detail.publish")}
                </ActionButton>
              ) : null}
              {event.status === "published" ? (
                <ActionButton tone="danger" onClick={() => setStatus("cancelled")} disabled={statusBusy} testId="events-cancel">
                  {t("dashboard.events.detail.cancelEvent")}
                </ActionButton>
              ) : null}
            </div>
            {state === "noNight" ? <Outcome kind="note">{t("dashboard.events.detail.warnNoNight")}</Outcome> : null}
            {state === "noTier" ? <Outcome kind="note">{t("dashboard.events.detail.warnNoTier")}</Outcome> : null}
            {statusError ? <Outcome kind="refused">{statusError}</Outcome> : null}
          </div>
        );
      case "schedule":
        return (
          <div className="flex max-w-[720px] flex-col gap-[12px]" data-testid="events-panel-schedule">
            <p className="m-0 font-admin-body text-admin-13 text-admin-ink">
              {event.sessionCount === 0
                ? t("dashboard.events.schedule.none")
                : event.runFinished
                  ? interpolate(t("dashboard.events.schedule.finished"), { count: event.sessionCount })
                  : interpolate(t("dashboard.events.schedule.next"), { count: event.sessionCount, when: when(event.nextSessionAt) })}
            </p>
            <a href={`${nav.base}/appts?tab=sessions`} className="font-admin-body text-[12.5px] font-semibold text-admin-brand no-underline hover:underline">
              {t("dashboard.events.schedule.scheduleLink")}
            </a>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
              {sessions.map((sn) => (
                <li key={sn.id} className={`${CARD} px-[14px] py-[10px]`}>
                  <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{when(sn.startsAt)}</div>
                  <SessionSeats sessionId={sn.id} onSaved={onChanged} />
                </li>
              ))}
            </ul>
          </div>
        );
      case "tickets":
        return <TicketsTab event={event} sessionId={selectedSession?.id ?? sessions[0]?.id ?? null} locale={locale} onChanged={onChanged} />;
      case "venue":
        return <EventVenueTab event={event} sessionId={selectedSession?.id ?? sessions[0]?.id ?? null} locale={locale} />;
      case "day":
        return <EventDayTab event={event} sessionId={selectedSession?.id ?? sessions[0]?.id ?? null} nav={nav} locale={locale} />;
      case "orders":
        return notBuilt(t("dashboard.events.tab.orders"), t("dashboard.events.notBuilt.orders"), "events-panel-orders");
      case "guests":
        return (
          <div className="flex flex-col gap-[10px]" data-testid="events-panel-guests">
            {notBuilt(t("dashboard.events.tab.guests"), t("dashboard.events.notBuilt.guests"), "events-panel-guests-note")}
            {sessions.length > 0 ? (
              <ul className="m-0 flex max-w-[560px] list-none flex-col divide-y divide-admin-border-soft p-0 font-admin-body text-admin-13">
                {sessions.map((sn) => (
                  <li key={sn.id} className="flex items-center justify-between gap-[12px] py-[8px]">
                    <span className="text-admin-ink">{when(sn.startsAt)}</span>
                    <a href={`${nav.base}/events/door?session=${sn.id}`} className="font-semibold text-admin-brand no-underline hover:underline">
                      {t("dashboard.events.guests.openDoor")}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      case "page":
        return notBuilt(t("dashboard.events.tab.page"), t("dashboard.events.notBuilt.page"), "events-panel-page");
      case "money":
        return notBuilt(t("dashboard.events.tab.money"), t("dashboard.events.notBuilt.money"), "events-panel-money");
      default:
        return notBuilt(t("dashboard.events.tab.settings"), t("dashboard.events.notBuilt.settings"), "events-panel-settings");
    }
  })();

  return (
    <div className="flex flex-col gap-[16px]" data-testid="events-detail">
      <header className="flex flex-wrap items-center gap-[12px]">
        <button type="button" onClick={() => nav.go({})} aria-label={t("dashboard.events.detail.back")} className="inline-flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-[8px] text-admin-ink-muted hover:bg-admin-surface-alt">
          <span className="inline-flex rotate-180">
            <Icon name="chevron-right" size={14} stroke={1.75} />
          </span>
        </button>
        <h1 className="m-0 font-admin-body text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink" data-tulala-h1>
          {event.title}
        </h1>
        <div role="group" aria-label={t("dashboard.events.detail.dates")} className="inline-flex gap-[2px] rounded-[9px] bg-admin-surface-alt p-[3px]">
          <button type="button" aria-pressed={dateId === null} onClick={() => setDateId(null)} className={`rounded-[7px] px-[10px] py-[5px] font-admin-body text-[12px] font-semibold ${dateId === null ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted"}`}>
            {t("dashboard.events.detail.allDates")}
          </button>
          {sessions.slice(0, 6).map((sn) => (
            <button key={sn.id} type="button" aria-pressed={dateId === sn.id} onClick={() => setDateId(sn.id)} className={`rounded-[7px] px-[10px] py-[5px] font-admin-body text-[12px] font-semibold ${dateId === sn.id ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted"}`}>
              {whenLabel(sn.startsAt, event.timeZone, locale, noDate, false)}
            </button>
          ))}
        </div>
        <span className="font-admin-body text-[12px] text-admin-ink-muted">{event.timeZone}</span>
        <StatePill tone={STATE_TONE[state]} state={state}>
          {stateLabel[state]}
        </StatePill>
        <span className="flex-1" />
        <a href={`/events/${event.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-[34px] items-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] font-admin-body text-admin-13 font-semibold text-admin-ink no-underline hover:border-admin-border-strong">
          {t("dashboard.events.detail.preview")}
        </a>
        <ActionButton reason={t("dashboard.events.detail.shareReason")}>{t("dashboard.events.detail.share")}</ActionButton>
        <a href={`${nav.base}/pos?mode=door`} className="inline-flex h-[34px] items-center gap-[6px] rounded-[9px] border border-admin-brand bg-admin-brand px-[14px] font-admin-body text-admin-13 font-semibold text-white no-underline hover:bg-admin-brand-deep" data-testid="events-open-day">
          <Icon name="bolt" size={13} stroke={2} />
          {t("dashboard.events.detail.openEventDay")}
        </a>
      </header>
      <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-[24px]">
        <nav aria-label={t("dashboard.events.detail.sections")} className="flex flex-col gap-[2px] border-r border-admin-border pr-[12px]">
          {DETAIL_TABS.map((id) => (
            <a
              key={id}
              href={nav.href({ event: event.id, tab: id })}
              aria-current={nav.tab === id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                nav.go({ event: event.id, tab: id });
              }}
              data-testid={`events-tab-${id}`}
              className={`rounded-[8px] px-[10px] py-[7px] font-admin-body text-admin-13 no-underline ${nav.tab === id ? "bg-admin-card font-semibold text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted hover:text-admin-ink"}`}
            >
              {tabLabel[id]}
            </a>
          ))}
        </nav>
        <section className="min-w-0">{body}</section>
      </div>
    </div>
  );
}
