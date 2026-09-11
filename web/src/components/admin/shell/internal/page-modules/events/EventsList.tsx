"use client";

/**
 * EventsList — W16. The page heading with Templates · Import · Create event,
 * the segment strip (Upcoming · Today · Drafts · Needs attention · Past |
 * List · Calendar), the Venue and Sales filters, the Used-in line, and the
 * table: Event · date, Venue, State, Sold, Left, Door alloc., Event day.
 *
 * Every row is `loadWorkspaceEvents`'s. Sold, Left and Door alloc. are PER
 * NIGHT and derived from capacity pools, which the list reader deliberately
 * does not fetch (see `_events-actions.ts`); the columns print a dash with
 * the reason and the event's Tickets tab shows the night's figures. Venue
 * is not on the row either (D-POS-56). Templates, Import, Calendar and the
 * two filters have no engine behind them and are disabled with their
 * sentence.
 */

import * as React from "react";
import type { EventListRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

import { ActionButton, FilterChip, StatePill, UsedIn, type PillTone } from "../appointments-classes-ui";
import { CARD, ListHead, ListRow, PageHeading, RowMenuButton, SegmentLinks } from "../catalog/catalog-ui";
import { Icon } from "../../primitives";
import type { EventsNav } from "./EventsPage";
import { EVENT_SEGMENTS, eventState, inSegment, segmentCounts, type EventState } from "./events-model";

const COLS = "grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_72px_56px_92px_minmax(0,1.3fr)_28px]";

const STATE_TONE: Record<EventState, PillTone> = {
  draft: "slate",
  salesOpen: "green",
  noNight: "coral",
  noTier: "coral",
  finished: "slate",
  cancelled: "critical",
};

export function whenLabel(iso: string | null, timeZone: string, locale: string, fallback: string, withTime = true): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(d);
  } catch {
    return `${d.toISOString()} (${timeZone})`;
  }
}

export function EventsList({ events, nav, nowIso, locale }: { events: EventListRow[]; nav: EventsNav; nowIso: string; locale: string }) {
  const t = useT();
  const counts = segmentCounts(events, nowIso);
  const rows = events.filter((e) => inSegment(e, nav.segment, nowIso));
  const stateLabel: Record<EventState, string> = {
    draft: t("dashboard.events.state.draft"),
    salesOpen: t("dashboard.events.state.salesOpen"),
    noNight: t("dashboard.events.state.noNight"),
    noTier: t("dashboard.events.state.noTier"),
    finished: t("dashboard.events.state.finished"),
    cancelled: t("dashboard.events.state.cancelled"),
  };
  const segmentLabel = {
    upcoming: t("dashboard.events.segment.upcoming"),
    today: t("dashboard.events.segment.today"),
    drafts: t("dashboard.events.segment.drafts"),
    attention: t("dashboard.events.segment.attention"),
    past: t("dashboard.events.segment.past"),
  };
  const perNight = t("dashboard.events.list.perNightReason");

  return (
    <div className="flex flex-col gap-[14px]" data-testid="events-list">
      <PageHeading
        title={t("dashboard.events.list.title")}
        intro={t("dashboard.events.list.intro")}
        actions={
          <>
            <ActionButton reason={t("dashboard.events.list.templatesReason")}>{t("dashboard.events.list.templates")}</ActionButton>
            <ActionButton reason={t("dashboard.events.list.importReason")}>{t("dashboard.events.list.import")}</ActionButton>
            <ActionButton tone="primary" onClick={() => nav.go({ compose: true })} testId="events-create">
              <Icon name="plus" size={14} stroke={2} />
              {t("dashboard.events.list.create")}
            </ActionButton>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-[10px]">
        <SegmentLinks
          label={t("dashboard.events.segment.label")}
          items={EVENT_SEGMENTS.map((id) => ({ id, label: `${segmentLabel[id]}${counts[id] ? ` · ${counts[id]}` : ""}`, href: nav.href({ segment: id }), active: nav.segment === id }))}
        />
        <SegmentLinks
          label={t("dashboard.events.view.label")}
          items={[
            { id: "list", label: t("dashboard.events.view.list"), href: nav.href({ segment: nav.segment }), active: true },
            { id: "calendar", label: t("dashboard.events.view.calendar"), href: "#", active: false, reason: t("dashboard.events.view.calendarReason") },
          ]}
        />
        <span className="flex-1" />
        <FilterChip label={t("dashboard.events.filter.venue")} value="any" options={[{ id: "any", label: t("dashboard.events.filter.any") }]} onChange={() => undefined} reason={t("dashboard.events.filter.venueReason")} />
        <FilterChip label={t("dashboard.events.filter.sales")} value="any" options={[{ id: "any", label: t("dashboard.events.filter.any") }]} onChange={() => undefined} reason={t("dashboard.events.filter.salesReason")} />
      </div>
      <UsedIn
        count={2}
        label={t("dashboard.events.usedIn.label")}
        parts={[
          { where: t("dashboard.events.usedIn.pos"), what: t("dashboard.events.usedIn.posWhat") },
          { where: t("dashboard.events.usedIn.web"), what: t("dashboard.events.usedIn.webWhat") },
        ]}
      />
      <div className={CARD}>
        <ListHead cols={COLS}>
          <span>{t("dashboard.events.columns.event")}</span>
          <span>{t("dashboard.events.columns.venue")}</span>
          <span>{t("dashboard.events.columns.state")}</span>
          <span>{t("dashboard.events.columns.sold")}</span>
          <span>{t("dashboard.events.columns.left")}</span>
          <span>{t("dashboard.events.columns.doorAlloc")}</span>
          <span>{t("dashboard.events.columns.eventDay")}</span>
          <span />
        </ListHead>
        {rows.length === 0 && (
          <p className="m-0 border-t border-admin-border-soft px-[18px] py-[24px] text-center font-admin-body text-admin-13 text-admin-ink-muted">
            {events.length === 0 ? t("dashboard.events.list.empty") : t("dashboard.events.list.emptySegment")}
          </p>
        )}
        {rows.map((e) => {
          const state = eventState(e);
          const dash = <span title={perNight} className="text-admin-ink-dim">—</span>;
          const nightsLabel = e.runFinished
            ? t("dashboard.events.list.runFinished")
            : e.sessionCount === 0
              ? t("dashboard.events.list.noNight")
              : e.sessionCount === 1
                ? t("dashboard.events.list.nightOne")
                : interpolate(t("dashboard.events.list.nights"), { count: e.sessionCount });
          return (
            <React.Fragment key={e.id}>
            {/* The phone's row (MW25 opens from here): the event and its next night, the state as a pill. */}
            <button
              type="button"
              onClick={() => nav.go({ event: e.id })}
              className="hidden w-full cursor-pointer items-center gap-[10px] border-t border-admin-border-soft px-[14px] py-[12px] text-left max-[720px]:flex"
              data-testid={`events-open-phone-${e.id}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-admin-body text-[14.5px] font-semibold text-admin-ink">
                  {e.title}
                  {e.nextSessionAt ? ` · ${whenLabel(e.nextSessionAt, e.timeZone, locale, "")}` : ""}
                </span>
                <span className="block truncate font-admin-body text-admin-12h text-admin-ink-muted">{nightsLabel}</span>
              </span>
              <StatePill tone={STATE_TONE[state]} state={state}>
                {stateLabel[state]}
              </StatePill>
            </button>
            <ListRow cols={COLS} testId={`events-row-${e.id}`} className="max-[720px]:hidden">
              <button type="button" onClick={() => nav.go({ event: e.id })} className="min-w-0 cursor-pointer text-left" data-testid={`events-open-${e.id}`}>
                <span className="block truncate font-admin-body text-[13px] font-semibold text-admin-ink">
                  {e.title}
                  {e.nextSessionAt ? ` · ${whenLabel(e.nextSessionAt, e.timeZone, locale, "")}` : ""}
                </span>
                <span className="block truncate font-admin-body text-[11.5px] text-admin-ink-muted">
                  {e.runFinished
                    ? t("dashboard.events.list.runFinished")
                    : e.sessionCount === 0
                      ? t("dashboard.events.list.noNight")
                      : e.sessionCount === 1
                        ? t("dashboard.events.list.nightOne")
                        : interpolate(t("dashboard.events.list.nights"), { count: e.sessionCount })}
                </span>
              </button>
              <span className="truncate text-admin-ink-dim" title={t("dashboard.events.list.venueReason")}>
                —
              </span>
              <span className="min-w-0">
                <StatePill tone={STATE_TONE[state]} state={state}>
                  {stateLabel[state]}
                </StatePill>
              </span>
              <span className="tabular-nums">{dash}</span>
              <span className="tabular-nums">{dash}</span>
              <span className="tabular-nums">{dash}</span>
              <span className="truncate text-admin-ink-muted">
                {state === "salesOpen" ? t("dashboard.events.list.dayReady") : state === "finished" || state === "cancelled" ? "—" : t("dashboard.events.list.dayNotYet")}
              </span>
              <RowMenuButton label={t("dashboard.events.list.rowMenu")} onClick={() => nav.go({ event: e.id })} />
            </ListRow>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
