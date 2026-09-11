"use client";

/**
 * AppointmentsPage — the destination the registry calls `appts`, drawn as
 * boards W39 (Sessions) and W40 (Series): the title and subtitle, Generate
 * sessions / + New series, the four tabs with their counts (Appointments ·
 * Sessions · Series · Waitlist), the tab's body on the left and, for a
 * selected session or appointment, the panel on the right.
 *
 * FOUR VIEWS, ONE ROUTE. The registry's sub-views for `appts` are states of
 * this page under a `view` query, exactly as Events' Tickets tab is: they
 * are not routes. The rail links carry `?view=`; this reads it.
 *
 * EVERY NUMBER IS A READER'S. `loadAppointments` (the board), `loadSchedule`
 * (series, dated sessions, the sweep's refusals), `loadSessionWaitlists` (the
 * queues) and `loadBookingHoursProposals` (the banner). Nothing is mocked; a
 * reader that refuses puts its sentence above the tabs.
 *
 * NOT WIRED, said on the control (D-POS-18): "Generate sessions" (the sweep
 * runs nightly for 90 days; there is no on-demand generator) and "+ New
 * series" (no series writer exists; the one write on this page is the
 * one-off night form on the Sessions tab, which is what the classes journey
 * schedules through).
 *
 * NOTHING HERE LOOKS AT A CLOCK for layout: the buckets on each appointment
 * row are decided on the server; the Sessions view's anchor day is the
 * workspace's today, read once from the board's own zone.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAdminShell } from "../state";
import { useT } from "@/i18n/use-t";
import { Icon } from "../primitives";
import { AppointmentsList } from "./AppointmentsList";
import { AppointmentPanel } from "./AppointmentPanel";
import { AppointmentsWaitlist } from "./AppointmentsWaitlist";
import { BookingHoursProposalsBanner } from "./BookingHoursProposalsBanner";
import { ScheduleNightForm } from "./ScheduleNightForm";
import { SessionsTable } from "./SessionsTable";
import { SessionPanel } from "./SessionPanel";
import { SeriesTable } from "./SeriesTable";
import { ActionButton, UsedIn } from "./appointments-classes-ui";
import {
  buildSeriesRows,
  buildSessionRows,
  waitlistCount,
  type SessionsView,
} from "./appointments-classes-model";
import {
  loadAppointments,
  loadBookingHoursProposals,
  loadSessionWaitlists,
  type BookingHoursProposalRow,
  type WaitlistView,
} from "@/lib/scheduling/appointments-actions";
import type { AppointmentRow } from "@/lib/scheduling/appointments-board";
import { loadSchedule, type ScheduleNight, type ScheduleSeries } from "@/lib/sessions/schedule-actions";

const K = "dashboard.adminAppointments";
const B = "dashboard.adminAppointments.board";

/** The four views, and the `view` query value that selects each. */
export const APPOINTMENT_VIEWS = ["list", "sessions", "series", "waitlist"] as const;
export type AppointmentView = (typeof APPOINTMENT_VIEWS)[number];

function viewFromQuery(raw: string | null): AppointmentView {
  return (APPOINTMENT_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as AppointmentView) : "list";
}

export function AppointmentsPage() {
  const { bridgeTenantIdentity, adminBasePath, workspacePosEnabled, workspacePosModes } = useAdminShell();
  const searchParams = useSearchParams();
  const t = useT();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;

  const [view, setView] = useState<AppointmentView>(() => viewFromQuery(searchParams.get("view")));
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [series, setSeries] = useState<ScheduleSeries[] | null>(null);
  const [nights, setNights] = useState<ScheduleNight[]>([]);
  const [waitlists, setWaitlists] = useState<WaitlistView[] | null>(null);
  const [unreadableSessions, setUnreadableSessions] = useState(0);
  const [checkedAhead, setCheckedAhead] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<BookingHoursProposalRow[]>([]);
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");
  const [timeZone, setTimeZone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);

  // Sessions tab state: the view, the anchor day, the filters, the selection.
  const [sessionsView, setSessionsView] = useState<SessionsView>("week");
  const [anchorYmd, setAnchorYmd] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  // THE LAST REFRESH ASKED FOR IS THE ONLY ONE ALLOWED TO PAINT: a stale
  // answer is dropped by comparing its ticket to the latest one issued.
  const refreshTicket = useRef(0);

  const queryView = viewFromQuery(searchParams.get("view"));
  useEffect(() => {
    setView(queryView);
  }, [queryView]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const ticket = refreshTicket.current + 1;
    refreshTicket.current = ticket;
    setError(null);
    try {
      const [board, schedule, queue, pending] = await Promise.all([
        loadAppointments(tenantId),
        loadSchedule(tenantId),
        loadSessionWaitlists(tenantId, focusSessionId),
        loadBookingHoursProposals(tenantId),
      ]);
      if (refreshTicket.current !== ticket) return;

      if (board.ok) {
        setRows(board.rows);
        setTimeZone(board.timeZone);
        // The anchor day is the READER's today, decided on the server in the
        // workspace's zone; this page never reads the browser's clock.
        setAnchorYmd((prev) => prev ?? board.todayYmd);
      } else {
        setRows([]);
        setError(board.error);
      }
      if (schedule.ok) {
        setSeries(schedule.series);
        setNights(schedule.nights);
      } else {
        setSeries([]);
        setNights([]);
        setError((prev) => prev ?? schedule.error);
      }
      if (queue.ok) {
        setWaitlists(queue.sessions);
        setUnreadableSessions(queue.unreadableSessions);
        setCheckedAhead(queue.checkedAhead);
        setTruncated(queue.truncated);
      } else {
        setWaitlists([]);
        setUnreadableSessions(0);
        setTruncated(false);
        setError((prev) => prev ?? queue.error);
      }
      if (pending.ok) {
        setProposals(pending.proposals);
        setDefaultTimezone(pending.defaultTimezone);
      } else {
        setProposals([]);
        setError((prev) => prev ?? pending.error);
      }
    } catch (err) {
      if (refreshTicket.current !== ticket) return;
      setRows([]);
      setSeries([]);
      setNights([]);
      setWaitlists([]);
      setProposals([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [focusSessionId, tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sessionRows = useMemo(
    () => buildSessionRows({ series: series ?? [], nights, waitlists: waitlists ?? [], fallbackTimeZone: timeZone }),
    [series, nights, waitlists, timeZone],
  );
  const seriesRows = useMemo(() => buildSeriesRows(series ?? []), [series]);
  const selectedSession = sessionRows.find((r) => r.id === selectedSessionId) ?? null;
  const selectedAppointment = (rows ?? []).find((r) => r.id === selectedAppointmentId) ?? null;
  const posOn = workspacePosEnabled && workspacePosModes.includes("classes");

  const openWaitlist = (sessionId: string) => {
    setFocusSessionId(sessionId);
    setView("waitlist");
  };

  if (!tenantId) {
    return (
      <div className="font-admin-body">
        <h1 className="m-0 text-[22px]! font-semibold text-admin-ink">{t(`${K}.title`)}</h1>
        <div className="p-6 text-sm text-admin-ink-muted">{t(`${K}.noTenant`)}</div>
      </div>
    );
  }

  const counts: Record<AppointmentView, number | null> = {
    list: rows === null ? null : rows.length,
    sessions: series === null ? null : sessionRows.length,
    series: series === null ? null : seriesRows.length,
    waitlist: waitlists === null ? null : waitlistCount(waitlists),
  };

  const panel =
    view === "sessions" && selectedSession ? (
      <SessionPanel
        row={selectedSession}
        waitlist={(waitlists ?? []).find((w) => w.sessionId === selectedSession.id) ?? null}
        tenantId={tenantId}
        onChanged={() => void refresh()}
        onOpenWaitlist={openWaitlist}
      />
    ) : view === "list" && selectedAppointment ? (
      <AppointmentPanel
        row={selectedAppointment}
        tenantId={tenantId}
        adminBase={adminBasePath}
        moveOpen={moveOpen}
        onMoveOpen={setMoveOpen}
        onChanged={() => void refresh()}
      />
    ) : null;

  return (
    <div
      data-tulala-appointments-board
      // `leading-[1.2]`: the boards set no line-height (the browser's
      // `normal`); the admin body's 1.65 made every row, chip and fact a few
      // pixels taller than drawn.
      className={`-mx-[28px] -mt-[24px] -mb-[60px] grid min-h-[calc(100vh-56px-var(--proto-cbar,50px))] font-admin-body leading-[1.2] max-[720px]:-mx-[14px] max-[720px]:-mt-[14px] max-[720px]:mb-0 max-[720px]:min-h-0 max-[720px]:grid-cols-[1fr] ${
        panel ? "grid-cols-[1fr_380px]" : "grid-cols-[1fr]"
      }`}
    >
      <div className={`flex min-w-0 flex-col gap-[12px] py-[20px] max-[720px]:border-r-0 max-[720px]:px-[14px] max-[720px]:py-[14px] ${panel ? "border-r border-admin-border px-[24px]" : "px-[28px]"}`}>
        {/* Title, subtitle, the two header actions. W40 titles the tab
            "Series" and offers Templates; W39 titles the page and offers
            Generate sessions. */}
        <div className="flex items-start justify-between gap-[12px] max-[720px]:flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">
              {view === "series" ? t(`${K}.tabs.series`) : t(`${K}.title`)}
            </h1>
            <p className="m-0 mt-[4px] text-admin-13 leading-[1.2] text-admin-ink-muted max-[720px]:text-admin-12h">{t(`${B}.subtitle.${view}`)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-[8px] max-[720px]:hidden">
            {view === "series" ? (
              <ActionButton reason={t(`${B}.templatesOff`)}>{t(`${B}.templates`)}</ActionButton>
            ) : (
              <ActionButton reason={t(`${B}.generateOff`)}>{t(`${B}.generate`)}</ActionButton>
            )}
            <ActionButton reason={t(`${B}.newSeriesOff`)} tone="primary">
              <Icon name="plus" size={14} stroke={1.75} />
              {t(`${B}.newSeries`)}
            </ActionButton>
          </div>
        </div>

        {error ? (
          <div role="alert" className="rounded-[12px] border border-admin-border-soft bg-admin-card px-[16px] py-[12px] text-admin-13 text-admin-ink">
            {error}
          </div>
        ) : null}

        <BookingHoursProposalsBanner proposals={proposals} defaultTimezone={defaultTimezone} onAccepted={() => void refresh()} />

        {/* Tabs with counts; the phone's chip strip (MW13) */}
        <div className="flex gap-[2px] border-b border-admin-border max-[720px]:gap-[6px] max-[720px]:overflow-x-auto max-[720px]:border-b-0 max-[720px]:[scrollbar-width:none]" role="tablist">
          {APPOINTMENT_VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              data-testid={`appointments-tab-${id}`}
              className={`-mb-px cursor-pointer border-b-2 px-[12px] py-[10px] font-admin-body text-admin-13 leading-[1.2] max-[720px]:mb-0 max-[720px]:shrink-0 max-[720px]:whitespace-nowrap max-[720px]:rounded-full max-[720px]:border max-[720px]:px-[12px] max-[720px]:py-[7px] max-[720px]:font-semibold ${
                view === id
                  ? "border-admin-brand font-semibold text-admin-ink max-[720px]:border-admin-ink max-[720px]:bg-admin-ink max-[720px]:text-white"
                  : "border-transparent font-medium text-admin-ink-muted hover:text-admin-ink max-[720px]:border-admin-border max-[720px]:bg-admin-card"
              }`}
              onClick={() => setView(id)}
            >
              {t(`${K}.tabs.${id}`)}
              {counts[id] === null ? "" : ` · ${counts[id]}`}
            </button>
          ))}
        </div>

        {view === "sessions" ? (
          series === null || anchorYmd === null ? (
            <div className="p-6 text-sm text-admin-ink-muted">{t("dashboard.adminSessions.loading")}</div>
          ) : (
            <>
              <SessionsTable
                rows={sessionRows}
                series={series}
                view={sessionsView}
                anchorYmd={anchorYmd}
                room={room}
                attentionOnly={attentionOnly}
                selectedId={selectedSessionId}
                onView={setSessionsView}
                onAnchor={setAnchorYmd}
                onRoom={setRoom}
                onAttention={setAttentionOnly}
                onSelect={setSelectedSessionId}
                onOpenWaitlist={openWaitlist}
              />
              <UsedIn
                count={posOn ? 2 : 1}
                label={t(`${B}.usedIn`)}
                parts={[
                  { where: t(`${B}.usedPos`), what: posOn ? t(`${B}.usedPosOn`) : t(`${B}.usedPosOff`) },
                  { where: t(`${B}.usedWeb`), what: t(`${B}.usedWebWhat`) },
                ]}
              />
              {/* The write path: a one-off night. Below the list on purpose,
                  so somebody whose class is missing reads the refusal first. */}
              <ScheduleNightForm tenantId={tenantId} onScheduled={() => void refresh()} />
            </>
          )
        ) : view === "series" ? (
          series === null ? (
            <div className="p-6 text-sm text-admin-ink-muted">{t("dashboard.adminSessions.loading")}</div>
          ) : (
            <SeriesTable
              rows={seriesRows}
              posOn={posOn}
              onShowSessions={(seriesId) => {
                const first = sessionRows.find((r) => r.seriesId === seriesId);
                setSessionsView("list");
                if (first) {
                  setAnchorYmd(first.ymd);
                  setSelectedSessionId(first.id);
                }
                setView("sessions");
              }}
            />
          )
        ) : view === "waitlist" ? (
          waitlists === null ? (
            <div className="p-6 text-sm text-admin-ink-muted">{t(`${K}.waitlist.loading`)}</div>
          ) : (
            <AppointmentsWaitlist
              tenantId={tenantId}
              sessions={waitlists}
              unreadableSessions={unreadableSessions}
              checkedAhead={checkedAhead}
              truncated={truncated}
              timeZone={timeZone}
              focusSessionId={focusSessionId}
              onChanged={() => void refresh()}
            />
          )
        ) : rows === null ? (
          <div className="p-6 text-sm text-admin-ink-muted">{t(`${K}.loading`)}</div>
        ) : (
          <AppointmentsList
            rows={rows}
            adminBase={adminBasePath}
            selectedId={selectedAppointmentId}
            onSelect={(id) => {
              setSelectedAppointmentId(id);
              setMoveOpen(false);
            }}
            onMove={(id) => {
              setSelectedAppointmentId(id);
              setMoveOpen(true);
            }}
          />
        )}
      </div>

      {panel ? (
        <>
          {/* MW14/MW15: on the phone the panel is a bottom sheet over the list;
              the scrim closes it. */}
          <button
            type="button"
            aria-label={t("dashboard.mobile.close")}
            tabIndex={-1}
            onClick={() => {
              setSelectedAppointmentId(null);
              setSelectedSessionId(null);
              setMoveOpen(false);
            }}
            className="fixed inset-0 z-[209] hidden border-0 bg-admin-ink/35 max-[720px]:block"
          />
          <aside
            data-testid="appointments-panel"
            className="sticky top-[56px] flex h-[calc(100vh-56px)] min-w-0 flex-col self-start overflow-y-auto bg-admin-surface p-[18px] max-[720px]:fixed max-[720px]:inset-x-0 max-[720px]:top-auto max-[720px]:bottom-0 max-[720px]:z-[210] max-[720px]:h-auto max-[720px]:max-h-[86vh] max-[720px]:rounded-t-[20px] max-[720px]:bg-admin-card max-[720px]:px-[18px] max-[720px]:pb-[max(26px,env(safe-area-inset-bottom))] max-[720px]:pt-[22px] max-[720px]:shadow-[0_-20px_50px_-30px_rgba(0,0,0,0.5)]"
          >
            <span aria-hidden className="absolute left-1/2 top-[8px] hidden h-[4px] w-[38px] -translate-x-1/2 rounded-full bg-admin-border-strong max-[720px]:block" />
            {panel}
          </aside>
        </>
      ) : null}
    </div>
  );
}
