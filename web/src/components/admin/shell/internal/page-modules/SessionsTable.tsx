"use client";

/**
 * SessionsTable — the Sessions tab of Appointments & Classes, as board W39
 * draws it: Week / Day / List with the date arrows, the filter chips, and
 * the grouped-by-day table TIME · SESSION · ROOM · INSTRUCTOR · BOOKED /
 * PLACES · STATE with a row menu, plus the materialiser's refusals above it
 * (somebody opens this page because a class is missing; the answer comes
 * before the list that does not contain it).
 *
 * Rows are `<tr>` inside `[data-testid=schedule-nights]`, the hook the
 * classes journey finds a scheduled night by. A full row carries the
 * `session-open-waitlist` door in its seats cell ("N waiting"), because this
 * is where somebody notices a class is full.
 *
 * NOT WIRED, said on the control: the Room and Instructor chips are drawn
 * disabled when the engine has nothing to filter by (no instructor is stored
 * on a session; rooms come from the sessions' own venues).
 */

import type { ReactNode } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import type { ScheduleSeries } from "@/lib/sessions/schedule-actions";
import { Icon } from "../primitives";
import {
  filterRows,
  groupByDay,
  roomsOf,
  viewWindow,
  type SessionRow,
  type SessionRowState,
  type SessionsView,
} from "./appointments-classes-model";
import { BUTTON_SECONDARY, CARD, FilterChip, Segmented, StatePill, ToggleChip, type PillTone } from "./appointments-classes-ui";
import { formatWhen } from "./appointments-format";

const K = "dashboard.adminAppointments.board";

const STATE_TONE: Record<SessionRowState, PillTone> = {
  scheduled: "green",
  full: "slate",
  cancelled: "critical",
  completed: "indigo",
  needsSeats: "coral",
  unknown: "coral",
};

const ROW_GRID = "grid grid-cols-[64px_1.9fr_96px_120px_130px_140px_24px] items-center gap-[10px] px-[16px] *:min-w-0";

/** YYYY-MM-DD → its parts in the given locale, on a UTC-midnight instant. */
function ymdParts(ymd: string, locale: string): { weekday: string; day: string; month: string; year: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const at = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month").replace(/\.$/, ""), year: get("year") };
}

/** "Mon 14 Sep", the board's day heading, in any locale's own words. */
function dayHeading(ymd: string, locale: string): string {
  const p = ymdParts(ymd, locale);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "14 – 20 Sep 2026" for a week, "14 Sep 2026" for a day, "from 14 Sep 2026" for the list. */
function rangeLabel(view: SessionsView, anchorYmd: string, locale: string, fromWord: string): string {
  const window = viewWindow(view, anchorYmd);
  const from = ymdParts(window.from, locale);
  if (view === "day") return `${from.day} ${from.month} ${from.year}`;
  if (window.to === null) return `${fromWord} ${from.day} ${from.month} ${from.year}`;
  const [y, m, d] = window.to.split("-").map(Number);
  const lastYmd = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1)).toISOString().slice(0, 10);
  const last = ymdParts(lastYmd, locale);
  return from.month === last.month
    ? `${from.day} – ${last.day} ${last.month} ${last.year}`
    : `${from.day} ${from.month} – ${last.day} ${last.month} ${last.year}`;
}

function clock(iso: string, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SessionsTable({
  rows,
  series,
  view,
  anchorYmd,
  room,
  attentionOnly,
  selectedId,
  onView,
  onAnchor,
  onRoom,
  onAttention,
  onSelect,
  onOpenWaitlist,
}: {
  rows: readonly SessionRow[];
  series: readonly ScheduleSeries[];
  view: SessionsView;
  anchorYmd: string;
  room: string | null;
  attentionOnly: boolean;
  selectedId: string | null;
  onView: (v: SessionsView) => void;
  onAnchor: (ymd: string) => void;
  onRoom: (room: string | null) => void;
  onAttention: (on: boolean) => void;
  onSelect: (id: string) => void;
  onOpenWaitlist: (id: string) => void;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const rooms = roomsOf(rows);
  const visible = filterRows(rows, { view, anchorYmd, room, attentionOnly });
  const groups = groupByDay(visible);
  const step = view === "day" ? 1 : 7;

  const refusedSeries = series.filter((s) => s.refusalReason !== null);
  const collisions = series.flatMap((s) =>
    s.skipped.map((k) => ({ seriesTitle: s.title, timeZone: s.timeZone, ...k })),
  );

  const shift = (days: number) => {
    const [y, m, d] = anchorYmd.split("-").map(Number);
    onAnchor(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10));
  };

  const seatsCell = (row: SessionRow) => {
    if (row.seatsTotal === null) return <span className="text-admin-ink-muted">{t("dashboard.adminSessions.noPool")}</span>;
    const base = `${row.booked ?? "?"} / ${row.seatsTotal}`;
    const waitingLabel =
      row.waiting > 0
        ? interpolate(t(row.waiting === 1 ? `${K}.waitingOne` : `${K}.waitingOther`), { count: row.waiting })
        : null;
    if (row.state === "full") {
      return (
        <span className="tabular-nums">
          {base} ·{" "}
          <button
            type="button"
            data-testid="session-open-waitlist"
            className="cursor-pointer font-semibold text-admin-brand underline decoration-admin-border-strong underline-offset-2 hover:text-admin-brand-deep"
            onClick={(e) => {
              e.stopPropagation();
              onOpenWaitlist(row.id);
            }}
          >
            {waitingLabel ?? t(`${K}.waitlistDoor`)}
          </button>
        </span>
      );
    }
    return (
      <span className="tabular-nums">
        {base}
        {waitingLabel ? ` · ${waitingLabel}` : ""}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-[12px]">
      {/* Toolbar */}
      <div className="flex flex-nowrap items-center gap-[6px]">
        <Segmented<SessionsView>
          label={t(`${K}.viewLabel`)}
          value={view}
          onChange={onView}
          options={[
            { id: "week", label: t(`${K}.view.week`) },
            { id: "day", label: t(`${K}.view.day`) },
            { id: "list", label: t(`${K}.view.list`) },
          ]}
        />
        <button type="button" aria-label={t(`${K}.earlier`)} className={`${BUTTON_SECONDARY} h-[30px] w-[32px] shrink-0 px-0`} onClick={() => shift(-step)}>
          <span className="inline-block rotate-180"><Icon name="chevron-right" size={14} stroke={1.75} /></span>
        </button>
        <button type="button" aria-label={t(`${K}.later`)} className={`${BUTTON_SECONDARY} h-[30px] w-[32px] shrink-0 px-0`} onClick={() => shift(step)}>
          <span className="inline-block"><Icon name="chevron-right" size={14} stroke={1.75} /></span>
        </button>
        <span className="min-w-[96px] font-admin-body text-admin-13 font-semibold leading-[1.2] text-admin-ink">{rangeLabel(view, anchorYmd, locale, t(`${K}.from`))}</span>
        <span className="flex-1" />
        <FilterChip
          label={t(`${K}.filter.location`)}
          value={room ?? "any"}
          onChange={(id) => onRoom(id === "any" ? null : id)}
          options={[{ id: "any", label: t(`${K}.filter.any`) }, ...rooms.map((r) => ({ id: r, label: r }))]}
          reason={rooms.length === 0 ? t(`${K}.filter.noRooms`) : null}
        />
        <FilterChip
          label={t(`${K}.filter.room`)}
          value="any"
          onChange={() => undefined}
          options={[{ id: "any", label: t(`${K}.filter.any`) }]}
          reason={t(`${K}.filter.roomOff`)}
        />
        <FilterChip
          label={t(`${K}.filter.instructor`)}
          value="any"
          onChange={() => undefined}
          options={[{ id: "any", label: t(`${K}.filter.any`) }]}
          reason={t(`${K}.filter.instructorOff`)}
        />
        <ToggleChip label={t(`${K}.filter.attention`)} on={attentionOnly} onChange={onAttention} />
      </div>

      {/* The refusals: what the sweep would not create, and why. */}
      {refusedSeries.length > 0 || collisions.length > 0 ? (
        <div className="rounded-[12px] border border-admin-coral/30 bg-admin-coral-soft px-[16px] py-[12px] font-admin-body text-admin-13 text-admin-ink" data-testid="sessions-refusals">
          <div className="font-semibold">{t("dashboard.adminSessions.refusals.title")}</div>
          <p className="m-0 mt-[4px] text-admin-ink-muted">{t("dashboard.adminSessions.refusals.help")}</p>
          {refusedSeries.map((s) => (
            <div key={`r-${s.id}`} className="mt-[8px]">
              <span className="font-semibold">{s.title}</span> · {t(`dashboard.adminSessions.refusals.reason.${s.refusalReason}`)}
            </div>
          ))}
          {collisions.map((c) => (
            <div key={`c-${c.startsAt}-${c.collidesWithSessionId}`} className="mt-[8px]">
              <span className="font-semibold">{c.seriesTitle}</span> ·{" "}
              {t("dashboard.adminSessions.refusals.collision")
                .replace("{when}", formatWhen(c.startsAt, c.timeZone))
                .replace("{other}", c.collidesWithTitle ?? t("dashboard.adminSessions.refusals.anotherSession"))}
            </div>
          ))}
        </div>
      ) : null}

      {/* The table */}
      <div className={`${CARD} overflow-hidden`} data-testid="schedule-nights">
        <div className={`${ROW_GRID} py-[8px] font-admin-body text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted`} role="row">
          <span>{t(`${K}.col.time`)}</span>
          <span>{t(`${K}.col.session`)}</span>
          <span>{t(`${K}.col.room`)}</span>
          <span>{t(`${K}.col.instructor`)}</span>
          <span>{t(`${K}.col.seats`)}</span>
          <span>{t(`${K}.col.state`)}</span>
          <span />
        </div>
        {groups.length === 0 ? (
          <div className="border-t border-admin-border-soft px-[16px] py-[28px] font-admin-body text-admin-13 text-admin-ink-muted">
            {rows.length === 0 ? t("dashboard.adminSessions.empty.body") : t(`${K}.emptyWindow`)}
          </div>
        ) : (
          <table className="w-full border-collapse font-admin-body text-admin-12h">
            <tbody>
              {groups.map((group) => (
                <DayGroup
                  key={group.ymd}
                  heading={dayHeading(group.ymd, locale)}
                  rows={group.rows}
                  locale={locale}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  seatsCell={seatsCell}
                  stateLabel={(s) => t(`${K}.state.${s}`)}
                  menuLabel={t(`${K}.rowMenu`)}
                  sessionLine={(row) =>
                    row.seriesIndex !== null && row.seriesCount !== null
                      ? interpolate(t(`${K}.sessionOf`), { title: row.title, n: row.seriesIndex, of: row.seriesCount })
                      : row.title || t("dashboard.adminSessions.nights.untitled")
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DayGroup({
  heading,
  rows,
  locale,
  selectedId,
  onSelect,
  seatsCell,
  stateLabel,
  menuLabel,
  sessionLine,
}: {
  heading: string;
  rows: readonly SessionRow[];
  locale: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  seatsCell: (row: SessionRow) => ReactNode;
  stateLabel: (s: SessionRowState) => string;
  menuLabel: string;
  sessionLine: (row: SessionRow) => string;
}) {
  return (
    <>
      <tr>
        <td colSpan={7} className="border-t border-admin-border-soft bg-admin-surface px-[16px] py-[7px] text-admin-11 font-bold uppercase tracking-[0.06em] text-admin-ink-muted">
          {heading}
        </td>
      </tr>
      {rows.map((row) => {
        const selected = row.id === selectedId;
        return (
          <tr
            key={row.id}
            data-session-row={row.id}
            data-session-state={row.state}
            aria-selected={selected}
            className={`cursor-pointer border-t border-admin-border-soft ${selected ? "bg-admin-brand-soft" : "hover:bg-admin-surface"}`}
            onClick={() => onSelect(row.id)}
          >
            <td className="w-full p-0" colSpan={7}>
              <div className={`${ROW_GRID} py-[9px]`}>
                <span className="font-mono text-admin-ink-muted">{clock(row.startsAt, row.timeZone, locale)}</span>
                <span className="font-semibold text-admin-ink [overflow-wrap:anywhere]">{sessionLine(row)}</span>
                <span className="truncate text-admin-ink-muted">{row.room ?? "—"}</span>
                <span className="text-admin-ink-muted">—</span>
                <span className="text-admin-ink">{seatsCell(row)}</span>
                <span>
                  <StatePill tone={STATE_TONE[row.state]} state={row.state}>
                    {stateLabel(row.state)}
                  </StatePill>
                </span>
                <button
                  type="button"
                  aria-label={menuLabel}
                  className="inline-flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded-[6px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(row.id);
                  }}
                >
                  <Icon name="ellipsis" size={13} stroke={1.75} />
                </button>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
