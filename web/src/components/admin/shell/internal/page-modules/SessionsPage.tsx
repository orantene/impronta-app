"use client";

/**
 * Sessions — the Schedule tab. Series, their occurrences, and the refusals.
 *
 * THE REFUSALS PANEL IS THE POINT OF THIS SCREEN, not a detail of it. The
 * nightly materialiser refuses occurrences for two reasons — a series whose
 * venue timezone was never confirmed, and an occurrence a daylight-saving shift
 * landed on an instant another session at the same venue already holds. Until
 * this page existed, both went only to `improntaLog`, so an operator whose
 * class silently did not appear had nowhere to look. A refusal a person cannot
 * see is met in the data and not for them.
 *
 * The refusals are computed by the SAME function the cron calls, at read time,
 * never persisted — so this cannot drift from the sweep, because it is not a
 * copy of the sweep's behaviour, it is the behaviour.
 *
 * Rendered inside the shell's own <main>, so this returns a fragment. Token
 * classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useEffect, useState } from "react";

import { useAdminShell } from "../state";
import { useT } from "@/i18n/use-t";
import { PageHeader } from "./pages-shared";
import {
  loadSchedule,
  type ScheduleNight,
  type ScheduleOccurrence,
  type ScheduleSeries,
} from "@/lib/sessions/schedule-actions";
import { ScheduleNightForm } from "./ScheduleNightForm";

const ISO_WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function weekdayLabel(day: number, t: (k: string) => string): string {
  const key = ISO_WEEKDAY_KEYS[day - 1];
  return key ? t(`dashboard.adminSessions.weekday.${key}`) : String(day);
}

/**
 * The occurrence's own zone, not the reader's. A schedule read in one country
 * for a venue in another must show the venue's clock, or the operator reads a
 * time nobody at that venue will ever see.
 */
function formatWhen(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** A class the engine has actually called full. Unknown seats are not full. */
function isFull(occurrence: ScheduleOccurrence): boolean {
  return occurrence.seatsTotal !== null && occurrence.seatsRemaining !== null
    && occurrence.seatsRemaining <= 0;
}

/**
 * One occurrence row — a series' night and a one-off night are the same row.
 *
 * Shared rather than copied because the waitlist door lives in it: when it was
 * written twice, the standalone half was the one that did not have it, which is
 * the whole reason a full one-off class had no queue anyone could start.
 */
function OccurrenceRow({
  occurrence,
  timeZone,
  label,
  t,
  onOpenWaitlist,
}: {
  occurrence: ScheduleOccurrence;
  timeZone: string | null;
  /** A one-off night names itself; a series' occurrence is named by its series. */
  label?: string | null;
  t: (k: string) => string;
  onOpenWaitlist?: (sessionId: string) => void;
}) {
  return (
    <tr className="border-t border-admin-border-soft">
      <td className="py-[6px] pr-[16px] text-admin-ink">
        {formatWhen(occurrence.startsAt, timeZone)}
        {label ? <div className="text-[12px] text-admin-ink-muted">{label}</div> : null}
      </td>
      <td className="py-[6px] pr-[16px] text-admin-ink">
        {occurrence.seatsTotal === null
          ? /* No pool means this occurrence cannot be sold at all — a repair
               the sweep will make, and a fact an operator should see rather
               than read as "unlimited". */
            t("dashboard.adminSessions.noPool")
          : t("dashboard.adminSessions.seatsLeft")
              .replace("{left}", String(occurrence.seatsRemaining ?? occurrence.seatsTotal))
              .replace("{total}", String(occurrence.seatsTotal))}
      </td>
      <td className="py-[6px] text-admin-ink-muted">
        {t(`dashboard.adminSessions.status.${occurrence.status}`)}
        {onOpenWaitlist && isFull(occurrence) ? (
          <button
            type="button"
            data-testid="session-open-waitlist"
            className="ml-[10px] rounded-admin border border-admin-line px-2 py-1 text-[12.5px] text-admin-ink"
            onClick={() => onOpenWaitlist(occurrence.id)}
          >
            {t("dashboard.adminAppointments.waitlist.openFromSession")}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * `embedded` suppresses this module's own PageHeader.
 *
 * The Schedule surface is now one VIEW of the Appointments destination
 * (`AppointmentsPage`), which has already drawn the page heading by the time
 * this renders; two headings stacked reads as a broken layout. It is a prop
 * rather than a split component because the body below is the whole point of
 * the file and nothing else about it changes.
 *
 * `onOpenWaitlist` is the door to the queue, and it is here because THIS is
 * the screen where somebody finds out a class is full. Without it the waitlist
 * was a tab you had to already know about, listing only queues that already
 * existed, so no first person could ever be added to one. Absent (the
 * standalone Schedule route), a full class simply says it is full.
 */
export function SessionsPage({
  embedded = false,
  onOpenWaitlist,
}: { embedded?: boolean; onOpenWaitlist?: (sessionId: string) => void } = {}) {
  const { bridgeTenantIdentity } = useAdminShell();
  const t = useT();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;

  const [series, setSeries] = useState<ScheduleSeries[] | null>(null);
  // The one-off nights, which is what "Schedule a night" above creates. Held
  // separately from `series` because a night has no recurrence, no horizon and
  // no materialiser refusal, and dressing one up as a one-occurrence series
  // would put a repeat on screen that nothing will ever repeat.
  const [nights, setNights] = useState<ScheduleNight[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setError(null);
    // A REJECTED action must not leave the page loading for ever. Without this
    // catch the promise rejects, `series` stays null, and the page shows
    // "Loading the schedule..." permanently with nothing in the console — which
    // is indistinguishable from a slow server and is the exact failure that
    // renders a screen showing nothing, correctly. Found by clicking it.
    try {
      const result = await loadSchedule(tenantId);
      if (result.ok) {
        setSeries(result.series);
        setNights(result.nights);
      } else {
        setSeries([]);
        setNights([]);
        setError(result.error);
      }
    } catch (err) {
      setSeries([]);
      setNights([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!tenantId) {
    return (
      <>
        {embedded ? null : <PageHeader title={t("dashboard.adminSessions.title")} />}
        <div className="p-6 text-sm text-admin-ink-muted">
          {t("dashboard.adminSessions.noTenant")}
        </div>
      </>
    );
  }

  const refusedSeries = (series ?? []).filter((s) => s.refusalReason !== null);
  const collisions = (series ?? []).flatMap((s) =>
    s.skipped.map((k) => ({ seriesTitle: s.title, timeZone: s.timeZone, ...k })),
  );

  return (
    <>
      {embedded ? null : (
        <PageHeader
          title={t("dashboard.adminSessions.title")}
          subtitle={t("dashboard.adminSessions.subtitle")}
        />
      )}

      {error ? (
        <div className="mb-[16px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[16px] text-[13.5px] text-admin-ink">
          {error}
        </div>
      ) : null}

      {/* The write path. Below the refusals on purpose: someone whose class is
          missing needs the reason before they are offered a way to make
          another one. */}
      <ScheduleNightForm tenantId={tenantId} onScheduled={() => void refresh()} />

      {/* ── Refusals ─────────────────────────────────────────────────────────
          Above the schedule on purpose. Someone opens this page because a class
          is missing; the answer must be the first thing, not below a list that
          does not contain it. */}
      {refusedSeries.length > 0 || collisions.length > 0 ? (
        <div className="mb-[20px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[20px]">
          <div className="text-[15px] font-semibold text-admin-ink">
            {t("dashboard.adminSessions.refusals.title")}
          </div>
          <p className="mt-[6px] text-[13px] leading-[1.5] text-admin-ink-muted">
            {t("dashboard.adminSessions.refusals.help")}
          </p>

          {refusedSeries.map((s) => (
            <div key={`r-${s.id}`} className="mt-[14px] text-[13.5px] text-admin-ink">
              <span className="font-semibold">{s.title}</span>
              {" — "}
              {t(`dashboard.adminSessions.refusals.reason.${s.refusalReason}`)}
            </div>
          ))}

          {collisions.map((c) => (
            <div key={`c-${c.startsAt}-${c.collidesWithSessionId}`} className="mt-[14px] text-[13.5px] text-admin-ink">
              <span className="font-semibold">{c.seriesTitle}</span>
              {" — "}
              {t("dashboard.adminSessions.refusals.collision")
                .replace("{when}", formatWhen(c.startsAt, c.timeZone))
                .replace("{other}", c.collidesWithTitle ?? t("dashboard.adminSessions.refusals.anotherSession"))}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── One-off nights ───────────────────────────────────────────────────
          Above the series on purpose: this is what the form directly above
          creates, so the first thing after scheduling a night must be the
          night. It used to be nowhere on this page at all. */}
      {series !== null && nights.length > 0 ? (
        <div
          data-testid="schedule-nights"
          className="mb-[20px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[20px]"
        >
          <div className="text-[15px] font-semibold text-admin-ink">
            {t("dashboard.adminSessions.nights.title")}
          </div>
          <p className="mt-[6px] text-[13px] leading-[1.5] text-admin-ink-muted">
            {t("dashboard.adminSessions.nights.help")}
          </p>
          <div className="mt-[12px] overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-admin-ink-muted">
                  <th className="py-[6px] pr-[16px] font-medium">
                    {t("dashboard.adminSessions.col.when")}
                  </th>
                  <th className="py-[6px] pr-[16px] font-medium">
                    {t("dashboard.adminSessions.col.seats")}
                  </th>
                  <th className="py-[6px] font-medium">
                    {t("dashboard.adminSessions.col.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {nights.map((n) => (
                  <OccurrenceRow
                    key={n.id}
                    occurrence={n}
                    // A one-off night has no series to carry a zone, so it is
                    // read in the reader's own. Saying nothing about the zone
                    // is honest; naming the workspace's would be a guess.
                    timeZone={null}
                    label={n.title ?? t("dashboard.adminSessions.nights.untitled")}
                    t={t}
                    onOpenWaitlist={onOpenWaitlist}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── Series and occurrences ─────────────────────────────────────────── */}
      {series === null ? (
        <div className="p-6 text-sm text-admin-ink-muted">
          {t("dashboard.adminSessions.loading")}
        </div>
      ) : series.length === 0 && nights.length === 0 ? (
        <div className="max-w-[560px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px]">
          <div className="text-[15px] font-semibold text-admin-ink">
            {t("dashboard.adminSessions.empty.title")}
          </div>
          <p className="mt-[8px] text-[13.5px] leading-[1.5] text-admin-ink-muted">
            {t("dashboard.adminSessions.empty.body")}
          </p>
        </div>
      ) : (
        series.map((s) => (
          <div
            key={s.id}
            className="mb-[20px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[20px]"
          >
            <div className="text-[15px] font-semibold text-admin-ink">{s.title}</div>
            <div className="mt-[4px] text-[13px] text-admin-ink-muted">
              {s.weekdays.map((d) => weekdayLabel(d, t)).join(", ")}
              {" · "}
              {s.localTime}
              {" · "}
              {t("dashboard.adminSessions.minutes").replace("{n}", String(s.durationMinutes))}
              {s.venueName ? ` · ${s.venueName}` : ""}
              {/* The zone is shown, not assumed. A series with none is the
                  commonest reason a schedule is empty and it must be visible. */}
              {s.timeZone
                ? ` · ${s.timeZone}`
                : ` · ${t("dashboard.adminSessions.noTimezone")}`}
            </div>

            {s.occurrences.length === 0 ? (
              <p className="mt-[12px] text-[13px] text-admin-ink-muted">
                {t("dashboard.adminSessions.noOccurrences")}
              </p>
            ) : (
              <div className="mt-[12px] overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-admin-ink-muted">
                      <th className="py-[6px] pr-[16px] font-medium">
                        {t("dashboard.adminSessions.col.when")}
                      </th>
                      <th className="py-[6px] pr-[16px] font-medium">
                        {t("dashboard.adminSessions.col.seats")}
                      </th>
                      <th className="py-[6px] font-medium">
                        {t("dashboard.adminSessions.col.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.occurrences.map((o) => (
                      <OccurrenceRow
                        key={o.id}
                        occurrence={o}
                        timeZone={s.timeZone}
                        t={t}
                        onOpenWaitlist={onOpenWaitlist}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
