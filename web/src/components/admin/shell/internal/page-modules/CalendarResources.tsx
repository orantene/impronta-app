"use client";

/**
 * CalendarResources — the Resources view of board WS006 (Calendar · resource
 * timeline): the day's people and resources as rows, the hours as columns,
 * every appointment as a block on the row of the person serving it and on
 * the row of the place it holds, every class session on its room's row.
 *
 * EVERY BLOCK IS A READER'S. Appointments come from `loadAppointments` (the
 * same rows the Appointments tab draws: who serves, which place, the state);
 * sessions from `loadSchedule` (booked / places from the pool); holds from
 * the shell's calendar bridge. The day is the workspace's, on the venue's
 * clock (`utcToZonedYmd`), never the browser's.
 *
 * NOT WIRED, said on the control (D-POS-120): the Rooms & stations filter
 * (a booking stores no room), the Processing and Imported busy legends, and
 * drag to reschedule (Move it on the Appointments page is the reschedule).
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 * The block's horizontal position is the one thing that must be a number,
 * so it is a table cell spanning 15-minute tracks (`colSpan`), not a style.
 */

import { useEffect, useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { loadAppointments } from "@/lib/scheduling/appointments-actions";
import type { AppointmentRow } from "@/lib/scheduling/appointments-board";
import { addUtcDays, utcToZonedYmd } from "@/lib/scheduling/tz";
import { loadSchedule, type ScheduleNight, type ScheduleSeries } from "@/lib/sessions/schedule-actions";
import type { CalendarEvent } from "@/app/(workspace)/[tenantSlug]/_data-bridge/calendar";
import { Icon } from "../primitives";
import { buildSessionRows, type SessionRow } from "./appointments-classes-model";
import { BUTTON_SECONDARY, CARD, FilterChip, Outcome } from "./appointments-classes-ui";

const K = "dashboard.adminCalendar.resources";
const TRACK_MINUTES = 15;

type Block = {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  tone: "confirmed" | "hold" | "session" | "other";
};
type Lane = { id: string; name: string; kind: "person" | "resource" | "room"; blocks: Block[] };

function minutesOfDay(iso: string, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).formatToParts(new Date(iso));
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h === 24 ? 0 : h) * 60 + m;
  } catch {
    return null;
  }
}

function dayTitle(ymd: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00.000Z`));
  } catch {
    return ymd;
  }
}

function clockOf(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

type Cell = { span: number; block: Block | null };

/**
 * Lay a lane's blocks onto sub-rows of track cells: a block goes on the first
 * sub-row whose last block ends before it starts; gaps become empty cells.
 */
function stack(blocks: readonly Block[], col: (min: number) => number): Cell[][] {
  const rows: Array<{ end: number; cells: Cell[]; cursor: number }> = [];
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  for (const b of sorted) {
    const start = col(b.startMin);
    const end = Math.max(start + 1, col(b.endMin));
    let row = rows.find((r) => r.end <= start);
    if (!row) {
      row = { end: 1, cells: [], cursor: 1 };
      rows.push(row);
    }
    if (start > row.cursor) row.cells.push({ span: start - row.cursor, block: null });
    row.cells.push({ span: end - start, block: b });
    row.cursor = end;
    row.end = end;
  }
  return rows.map((r) => r.cells);
}

const TONE: Record<Block["tone"], string> = {
  confirmed: "border-admin-brand bg-admin-brand-soft text-admin-brand-deep",
  hold: "border-dashed border-admin-coral bg-admin-coral-soft text-admin-coral-deep",
  session: "border-admin-indigo/40 bg-admin-indigo-soft text-admin-indigo",
  other: "border-admin-border bg-admin-surface-alt text-admin-ink-muted",
};

export function CalendarResources({ tenantId, holds }: { tenantId: string; holds: readonly CalendarEvent[] }) {
  const t = useT();
  const locale = useDashboardLocale();
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [series, setSeries] = useState<ScheduleSeries[]>([]);
  const [nights, setNights] = useState<ScheduleNight[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [ymd, setYmd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState("any");
  const [person, setPerson] = useState("any");
  const [service, setService] = useState("any");
  const [state, setState] = useState<"holds" | "confirmed">("holds");

  useEffect(() => {
    let alive = true;
    Promise.all([loadAppointments(tenantId), loadSchedule(tenantId)]).then(
      ([board, schedule]) => {
        if (!alive) return;
        if (board.ok) {
          setRows(board.rows);
          setTimeZone(board.timeZone);
          setYmd((prev) => prev ?? board.todayYmd);
        } else {
          setRows([]);
          setError(board.error);
        }
        if (schedule.ok) {
          setSeries(schedule.series);
          setNights(schedule.nights);
        } else {
          setError((prev) => prev ?? schedule.error);
        }
      },
      (err) => {
        if (!alive) return;
        setRows([]);
        setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const sessions = useMemo(() => buildSessionRows({ series, nights, waitlists: [], fallbackTimeZone: timeZone }), [series, nights, timeZone]);

  const day = ymd ?? "";
  const dayRows = (rows ?? []).filter((r) => r.startsAt && utcToZonedYmd(new Date(r.startsAt), r.timeZone ?? timeZone) === day);
  const daySessions: SessionRow[] = sessions.filter((s) => s.ymd === day);
  const dayHolds = holds.filter((h) => h.kind === "hold" && h.starts_at && utcToZonedYmd(new Date(h.starts_at), timeZone) === day);

  const locations = [...new Set([...dayRows.flatMap((r) => r.places), ...daySessions.map((s) => s.room).filter((r): r is string => r !== null)])].sort();
  const people = [...new Set(dayRows.flatMap((r) => r.servedBy))].sort();
  const services = [...new Set(dayRows.map((r) => r.title))].sort();

  const shownRows = dayRows.filter(
    (r) =>
      (location === "any" || r.places.includes(location)) &&
      (person === "any" || r.servedBy.includes(person)) &&
      (service === "any" || r.title === service) &&
      r.status !== "cancelled" &&
      (state === "holds" || r.status === "confirmed" || r.status === "in_progress" || r.status === "completed"),
  );
  const shownSessions = daySessions.filter((s) => (location === "any" || s.room === location) && s.state !== "cancelled");

  const lanes: Lane[] = [];
  const lane = (id: string, name: string, kind: Lane["kind"]) => {
    let found = lanes.find((l) => l.id === id);
    if (!found) {
      found = { id, name, kind, blocks: [] };
      lanes.push(found);
    }
    return found;
  };
  const push = (target: Lane, block: Block) => {
    target.blocks.push(block);
  };
  for (const r of shownRows) {
    if (!r.startsAt) continue;
    const zone = r.timeZone ?? timeZone;
    const startMin = minutesOfDay(r.startsAt, zone);
    const endMin = r.endsAt ? minutesOfDay(r.endsAt, zone) : null;
    if (startMin === null) continue;
    const block: Block = {
      id: r.id,
      label: `${r.customerName ?? t("dashboard.adminAppointments.unknownCustomer")} · ${r.title}`,
      startMin,
      endMin: endMin !== null && endMin > startMin ? endMin : startMin + 30,
      tone: r.status === "confirmed" || r.status === "in_progress" || r.status === "completed" ? "confirmed" : r.status === "tentative" || r.status === "draft" ? "hold" : "other",
    };
    const servers = r.servedBy.length > 0 ? r.servedBy : [t(`${K}.unassigned`)];
    for (const who of servers) push(lane(`p:${who}`, who, "person"), block);
    for (const place of r.places) push(lane(`r:${place}`, place, "resource"), { ...block, id: `${r.id}:${place}` });
  }
  for (const s of shownSessions) {
    const startMin = minutesOfDay(s.startsAt, s.timeZone);
    const endMin = minutesOfDay(s.endsAt, s.timeZone);
    if (startMin === null) continue;
    push(lane(`m:${s.room ?? "-"}`, s.room ?? t(`${K}.room`), "room"), {
      id: s.id,
      label: interpolate(t(`${K}.sessionBlock`), { title: s.title || t("dashboard.adminSessions.nights.untitled"), booked: s.booked ?? 0, places: s.seatsTotal ?? "—" }),
      startMin,
      endMin: endMin !== null && endMin > startMin ? endMin : startMin + 60,
      tone: "session",
    });
  }
  for (const h of dayHolds) {
    if (!h.starts_at) continue;
    const startMin = minutesOfDay(h.starts_at, timeZone);
    const endMin = h.ends_at ? minutesOfDay(h.ends_at, timeZone) : null;
    if (startMin === null || state === "confirmed") continue;
    push(lane(`p:${t(`${K}.unassigned`)}`, t(`${K}.unassigned`), "person"), {
      id: h.id,
      label: `${t("dashboard.adminCalendar.holdLabel")}: ${h.contact_name}`,
      startMin,
      endMin: endMin !== null && endMin > startMin ? endMin : startMin + 60,
      tone: "hold",
    });
  }
  lanes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "person" ? -1 : b.kind === "person" ? 1 : a.kind === "resource" ? -1 : 1));

  // The hour window: from the earliest block's hour to the latest, never
  // narrower than 09:00–17:00, so a quiet day still reads as a day.
  const allBlocks = lanes.flatMap((l) => l.blocks);
  const fromHour = Math.min(9, ...allBlocks.map((b) => Math.floor(b.startMin / 60)));
  const toHour = Math.max(17, ...allBlocks.map((b) => Math.ceil(b.endMin / 60)));
  const tracks = ((toHour - fromHour) * 60) / TRACK_MINUTES;
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const col = (min: number) => Math.max(1, Math.min(tracks + 1, Math.round((min - fromHour * 60) / TRACK_MINUTES) + 1));

  if (rows === null || ymd === null) {
    return <div className="p-6 font-admin-body text-sm text-admin-ink-muted">{t(`${K}.loading`)}</div>;
  }

  return (
    <div className="flex flex-col gap-[12px] font-admin-body leading-[1.2]" data-testid="calendar-resources">
      {error ? <Outcome kind="refused">{error}</Outcome> : null}
      <div className="flex flex-wrap items-center gap-[8px]">
        <button type="button" aria-label={t(`${K}.prevDay`)} className={`${BUTTON_SECONDARY} h-[30px] w-[32px] px-0`} onClick={() => setYmd(addUtcDays(day, -1) ?? day)}>
          <span className="inline-block rotate-180"><Icon name="chevron-right" size={14} stroke={1.75} /></span>
        </button>
        <button type="button" aria-label={t(`${K}.nextDay`)} className={`${BUTTON_SECONDARY} h-[30px] w-[32px] px-0`} onClick={() => setYmd(addUtcDays(day, 1) ?? day)}>
          <Icon name="chevron-right" size={14} stroke={1.75} />
        </button>
        <span className="text-admin-13 font-semibold text-admin-ink">{dayTitle(day, locale)}</span>
        <span className="text-admin-12h text-admin-ink-muted">{timeZone}</span>
        <span className="flex-1" />
        <FilterChip label={t(`${K}.filterLocation`)} value={location} onChange={setLocation} options={[{ id: "any", label: t(`${K}.any`) }, ...locations.map((l) => ({ id: l, label: l }))]} />
        <FilterChip label={t(`${K}.filterPeople`)} value={person} onChange={setPerson} options={[{ id: "any", label: t(`${K}.all`) }, ...people.map((p) => ({ id: p, label: p }))]} />
        <FilterChip label={t(`${K}.filterRooms`)} value="any" onChange={() => undefined} options={[{ id: "any", label: t(`${K}.all`) }]} reason={t(`${K}.filterRoomsOff`)} />
        <FilterChip label={t(`${K}.filterService`)} value={service} onChange={setService} options={[{ id: "any", label: t(`${K}.any`) }, ...services.map((s) => ({ id: s, label: s }))]} />
        <FilterChip
          label={t(`${K}.filterState`)}
          value={state}
          onChange={(id) => setState(id === "confirmed" ? "confirmed" : "holds")}
          options={[
            { id: "holds", label: t(`${K}.stateHoldsConfirmed`) },
            { id: "confirmed", label: t(`${K}.stateConfirmed`) },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-[14px] text-admin-11 text-admin-ink-muted">
        <span className="inline-flex items-center gap-[6px]"><span className={`h-[10px] w-[10px] rounded-[3px] border ${TONE.confirmed}`} />{t(`${K}.legendConfirmed`)}</span>
        <span className="inline-flex items-center gap-[6px]"><span className={`h-[10px] w-[10px] rounded-[3px] border ${TONE.hold}`} />{t(`${K}.legendHold`)}</span>
        <span className="inline-flex cursor-not-allowed items-center gap-[6px] opacity-50" title={t(`${K}.legendProcessingOff`)} data-not-wired="true"><span className="h-[10px] w-[10px] rounded-[3px] border border-admin-border bg-admin-surface-alt" />{t(`${K}.legendProcessing`)}</span>
        <span className="inline-flex cursor-not-allowed items-center gap-[6px] opacity-50" title={t(`${K}.legendImportedOff`)} data-not-wired="true"><span className="h-[10px] w-[10px] rounded-[3px] bg-admin-border" />{t(`${K}.legendImported`)}</span>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        {/* A TABLE OF 15-MINUTE TRACKS. A block is a cell spanning its tracks
            (`colSpan`), so its place on the hour axis is markup, not a style;
            blocks that overlap on one lane fall onto a second sub-row. */}
        <table className="w-full min-w-[900px] table-fixed border-collapse font-admin-body" data-testid="calendar-timeline">
          <colgroup>
            <col className="w-[180px]" />
            {Array.from({ length: tracks }, (_, i) => (
              <col key={i} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="w-[180px] border-b border-admin-border-soft px-[14px] py-[10px] text-left text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted">{t(`${K}.peopleResources`)}</th>
              {hours.map((h) => (
                <th key={h} colSpan={60 / TRACK_MINUTES} className="border-b border-l border-admin-border-soft px-[8px] py-[10px] text-left font-mono text-admin-11 font-normal text-admin-ink-muted">
                  {clockOf(h * 60)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lanes.length === 0 ? (
              <tr>
                <td colSpan={tracks + 1} className="px-[14px] py-[28px] text-admin-13 text-admin-ink-muted">{t(`${K}.emptyDay`)}</td>
              </tr>
            ) : (
              lanes.map((l) => {
                const subRows = stack(l.blocks, col);
                return subRows.map((sub, i) => (
                  <tr key={`${l.id}:${i}`} data-calendar-lane={l.kind} className="border-b border-admin-border-soft">
                    {i === 0 ? (
                      <td rowSpan={subRows.length} className="w-[180px] px-[14px] py-[10px] align-top">
                        <span className="flex items-center gap-[10px]">
                          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-admin-surface-alt text-admin-ink-muted">
                            <Icon name={l.kind === "person" ? "user" : l.kind === "room" ? "layers" : "archive"} size={13} stroke={1.75} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-admin-13 font-semibold text-admin-ink">{l.name}</span>
                            <span className="block text-admin-11 text-admin-ink-muted">{t(`${K}.${l.kind}`)}</span>
                          </span>
                        </span>
                      </td>
                    ) : null}
                    {sub.map((cell, j) =>
                      cell.block ? (
                        <td key={j} colSpan={cell.span} className="h-[54px] px-[2px] py-[8px] align-top">
                          <button
                            type="button"
                            title={`${cell.block.label} · ${clockOf(cell.block.startMin)}–${clockOf(cell.block.endMin)} · ${t(`${K}.dragOff`)}`}
                            className={`block h-[38px] w-full cursor-default truncate rounded-[8px] border px-[10px] text-left text-admin-12h font-medium ${TONE[cell.block.tone]}`}
                            data-calendar-block={cell.block.tone}
                          >
                            {cell.block.label}
                          </button>
                        </td>
                      ) : (
                        <td key={j} colSpan={cell.span} className="h-[54px] border-l border-admin-border-soft" />
                      ),
                    )}
                  </tr>
                ));
              })
            )}
          </tbody>
        </table>
      </div>

      {dayHolds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-[8px] text-admin-13 text-admin-ink">
          <Icon name="alert" size={14} stroke={1.75} color="var(--color-admin-coral)" />
          {dayHolds.slice(0, 3).map((h) => (
            <span key={h.id} className="font-semibold text-admin-coral-deep">
              {interpolate(t(`${K}.holdExpires`), { title: h.contact_name, time: h.starts_at ? clockOf(minutesOfDay(h.starts_at, timeZone) ?? 0) : "" })}
            </span>
          ))}
          {dayHolds.length > 3 ? <span className="text-admin-ink-muted">{interpolate(t("dashboard.adminCalendar.moreCount"), { count: dayHolds.length - 3 })}</span> : null}
          <span className="text-admin-ink-muted">· {t(`${K}.dragOff`)}</span>
        </div>
      ) : (
        <div className="text-admin-12h text-admin-ink-muted">{t(`${K}.dragOff`)}</div>
      )}
    </div>
  );
}
