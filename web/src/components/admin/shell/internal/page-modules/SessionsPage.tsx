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
import { loadSchedule, type ScheduleSeries } from "@/lib/sessions/schedule-actions";

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

export function SessionsPage() {
  const { bridgeTenantIdentity } = useAdminShell();
  const t = useT();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;

  const [series, setSeries] = useState<ScheduleSeries[] | null>(null);
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
      if (result.ok) setSeries(result.series);
      else {
        setSeries([]);
        setError(result.error);
      }
    } catch (err) {
      setSeries([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!tenantId) {
    return (
      <>
        <PageHeader title={t("dashboard.adminSessions.title")} />
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
      <PageHeader
        title={t("dashboard.adminSessions.title")}
        subtitle={t("dashboard.adminSessions.subtitle")}
      />

      {error ? (
        <div className="mb-[16px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[16px] text-[13.5px] text-admin-ink">
          {error}
        </div>
      ) : null}

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

      {/* ── Series and occurrences ─────────────────────────────────────────── */}
      {series === null ? (
        <div className="p-6 text-sm text-admin-ink-muted">
          {t("dashboard.adminSessions.loading")}
        </div>
      ) : series.length === 0 ? (
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
                      <tr key={o.id} className="border-t border-admin-border-soft">
                        <td className="py-[6px] pr-[16px] text-admin-ink">
                          {formatWhen(o.startsAt, s.timeZone)}
                        </td>
                        <td className="py-[6px] pr-[16px] text-admin-ink">
                          {o.seatsTotal === null
                            ? /* No pool means this occurrence cannot be sold at
                                 all — a repair the sweep will make, and a fact
                                 an operator should see rather than read as
                                 "unlimited". */
                              t("dashboard.adminSessions.noPool")
                            : t("dashboard.adminSessions.seatsLeft")
                                .replace("{left}", String(o.seatsRemaining ?? o.seatsTotal))
                                .replace("{total}", String(o.seatsTotal))}
                        </td>
                        <td className="py-[6px] text-admin-ink-muted">
                          {t(`dashboard.adminSessions.status.${o.status}`)}
                        </td>
                      </tr>
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
