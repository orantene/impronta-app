"use client";

/**
 * ScheduleNightForm — the door to the session engine.
 *
 * The materialiser has created sessions and their capacity pools since #1621,
 * but `session_series` was only ever SELECTed in this repository: nothing a
 * human could touch produced its input. The sweep faithfully materialised
 * series that could not be created. This is the one-off half of the door.
 *
 * SEATS ARE ENTERED PER NIGHT, and the form says so in as many words. The same
 * "VIP table" tier is six tables one night and four the next, so the number
 * belongs to the night rather than to the tier. Reading it off the tier row
 * would be tidier and wrong.
 *
 * Every refusal comes from the server. `planSession` decides, and this renders
 * the sentence it returns, so the screen cannot develop its own opinion about
 * what is valid and disagree with the writer.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  loadSchedulableEvents,
  scheduleSession,
  type ScheduleEventOption,
} from "@/lib/sessions/schedule-actions";
import { DEFAULT_POOL_KEY } from "@/lib/sessions/session-plan";

type Props = {
  tenantId: string;
  onScheduled: () => void;
};

export function ScheduleNightForm({ tenantId, onScheduled }: Props) {
  const t = useT();
  const [events, setEvents] = useState<ScheduleEventOption[] | null>(null);
  const [eventId, setEventId] = useState<string>("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [seats, setSeats] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    // Same catch as the schedule read beside it: a rejected action would
    // otherwise leave this permanently blank with nothing in the console.
    void (async () => {
      try {
        const result = await loadSchedulableEvents(tenantId);
        if (!live) return;
        if (result.ok) setEvents(result.events);
        else {
          setEvents([]);
          setFailed(true);
          setMessage(result.message);
        }
      } catch {
        if (!live) return;
        setEvents([]);
        setFailed(true);
        setMessage(t("dashboard.adminSessions.schedule.loadFailed"));
      }
    })();
    return () => {
      live = false;
    };
  }, [tenantId, t]);

  const selected = events?.find((e) => e.id === eventId) ?? null;
  // With no event there is one undifferentiated pool of seats, which is the
  // key the cron already writes for a series.
  const tiers = selected
    ? selected.tiers
    : [{ poolKey: DEFAULT_POOL_KEY, label: t("dashboard.adminSessions.schedule.defaultTier"), amountCents: 0 }];

  const submit = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const result = await scheduleSession({
        tenantId,
        eventId: eventId || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : "",
        endsAt: endsAt ? new Date(endsAt).toISOString() : "",
        tiers: tiers.map((tier) => ({
          poolKey: tier.poolKey,
          // An empty box is NaN, which the plan refuses by name rather than
          // silently treating as zero seats.
          units: Number.parseInt(seats[tier.poolKey] ?? "", 10),
        })),
      });
      if (result.ok) {
        setMessage(
          t("dashboard.adminSessions.schedule.created").replace(
            "{count}",
            String(result.poolsCreated),
          ),
        );
        setSeats({});
        setStartsAt("");
        setEndsAt("");
        onScheduled();
      } else {
        setFailed(true);
        setMessage(result.message);
      }
    } catch (err) {
      setFailed(true);
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [tenantId, eventId, startsAt, endsAt, tiers, seats, t, onScheduled]);

  const noTiers = selected !== null && selected.tiers.length === 0;

  return (
    <div className="mb-6 rounded-admin border border-admin-line p-4">
      <h3 className="mb-3 text-admin-ink">
        {t("dashboard.adminSessions.schedule.heading")}
      </h3>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-admin-ink-muted">
            {t("dashboard.adminSessions.schedule.event")}
          </span>
          <select
            className="w-full rounded-admin border border-admin-line bg-transparent p-2 text-admin-ink"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setSeats({});
            }}
          >
            <option value="">{t("dashboard.adminSessions.schedule.noEvent")}</option>
            {(events ?? []).map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-admin-ink-muted">
            {t("dashboard.adminSessions.schedule.starts")}
          </span>
          <input
            type="datetime-local"
            className="w-full rounded-admin border border-admin-line bg-transparent p-2 text-admin-ink"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-admin-ink-muted">
            {t("dashboard.adminSessions.schedule.ends")}
          </span>
          <input
            type="datetime-local"
            className="w-full rounded-admin border border-admin-line bg-transparent p-2 text-admin-ink"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
      </div>

      {noTiers ? (
        <p className="mb-3 text-admin-ink-muted">
          {t("dashboard.adminSessions.schedule.noTiers")}
        </p>
      ) : (
        <>
          <span className="mb-1 block text-admin-ink-muted">
            {t("dashboard.adminSessions.schedule.seats")}
          </span>
          <div className="mb-2 grid gap-3 sm:grid-cols-3">
            {tiers.map((tier) => (
              <label key={tier.poolKey} className="block">
                <span className="mb-1 block text-admin-ink-muted">{tier.label}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  className="w-full rounded-admin border border-admin-line bg-transparent p-2 text-admin-ink"
                  value={seats[tier.poolKey] ?? ""}
                  onChange={(e) =>
                    setSeats((prev) => ({ ...prev, [tier.poolKey]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          <p className="mb-3 text-admin-ink-muted">
            {t("dashboard.adminSessions.schedule.seatsHint")}
          </p>
        </>
      )}

      <button
        type="button"
        className="rounded-admin border border-admin-line px-3 py-2 text-admin-ink disabled:opacity-60"
        disabled={busy || noTiers}
        onClick={() => void submit()}
      >
        {busy
          ? t("dashboard.adminSessions.schedule.submitting")
          : t("dashboard.adminSessions.schedule.submit")}
      </button>

      {message ? (
        <p className={failed ? "mt-3 text-admin-danger" : "mt-3 text-admin-ink"}>{message}</p>
      ) : null}
    </div>
  );
}
