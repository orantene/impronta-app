"use client";

/**
 * AppointmentsWaitlist — who is waiting for a place, and giving one back out.
 *
 * SEATS COME FROM THE ENGINE. The header on each session says what
 * `capacity_remaining_public` said, not a count of rows on this screen. A
 * session with no pool says so out loud rather than reading as unlimited: a
 * wrongly sold-out class loses the sale silently and nobody reports it, and the
 * opposite error promises a place that was never counted.
 *
 * THE STALE-SCREEN GUARD IS THE ROW'S OWN STATUS. `promoteFromWaitlist` sends
 * the status this screen is SHOWING, and the RPC refuses with `conflict` when
 * the stored one has moved. Two people working the same list from two desks
 * cannot promote somebody who has already accepted or already been offered a
 * place by the other.
 *
 * AN EXPIRED OFFER IS SHOWN, NOT SWEPT. `deriveWaitlistState` turns "offered
 * plus a window that has closed" into `expired` at read time. There is no cron
 * and none is wanted; a row that quietly returned to "waiting" would hide that
 * somebody was offered a place and never answered.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  joinSessionWaitlist,
  promoteFromWaitlist,
  type WaitlistView,
} from "@/lib/scheduling/appointments-actions";
import { fill, formatClock, formatWhen } from "./appointments-format";

const K = "dashboard.adminAppointments.waitlist";

type Props = {
  tenantId: string;
  sessions: WaitlistView[];
  timeZone: string;
  onChanged: () => void;
};

type Notice = { sessionId: string; text: string; failed: boolean };

export function AppointmentsWaitlist({ tenantId, sessions, timeZone, onChanged }: Props) {
  const t = useT();
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [joinFor, setJoinFor] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);

  const promote = useCallback(
    async (view: WaitlistView, entryId: string, name: string, status: string) => {
      setBusyEntryId(entryId);
      setNotice(null);
      try {
        const result = await promoteFromWaitlist({
          tenantId,
          entryId,
          // The status the OPERATOR'S ROW says. A mismatch is a stale screen.
          expectedStatus: status as "waiting" | "offered" | "accepted" | "withdrawn",
        });
        if (!result.ok) {
          setNotice({
            sessionId: view.sessionId,
            failed: true,
            text: fill(t(`${K}.refusal.${result.refusalKey}`), {
              left: String(result.outstandingOffers ?? 0),
            }),
          });
          return;
        }
        setNotice({
          sessionId: view.sessionId,
          failed: false,
          text: result.already
            ? fill(t(`${K}.alreadyOffered`), { name })
            : fill(t(`${K}.promoted`), {
                name,
                when: result.offerExpiresAt ? formatClock(result.offerExpiresAt, timeZone) : "",
              }),
        });
        onChanged();
      } catch (err) {
        setNotice({
          sessionId: view.sessionId,
          failed: true,
          text: err instanceof Error ? err.message : t(`${K}.refusal.unavailable`),
        });
      } finally {
        setBusyEntryId(null);
      }
    },
    [onChanged, t, tenantId, timeZone],
  );

  const join = useCallback(
    async (view: WaitlistView) => {
      setJoinBusy(true);
      setNotice(null);
      try {
        const result = await joinSessionWaitlist({
          tenantId,
          sessionId: view.sessionId,
          customerName: joinName,
          customerEmail: joinEmail.trim() || null,
        });
        if (!result.ok) {
          setNotice({
            sessionId: view.sessionId,
            failed: true,
            text: fill(t(`${K}.refusal.${result.refusalKey}`), {
              left: String(result.seatsRemaining ?? 0),
            }),
          });
          return;
        }
        setNotice({
          sessionId: view.sessionId,
          failed: false,
          text: fill(t(`${K}.join.joined`), { name: joinName.trim() }),
        });
        setJoinName("");
        setJoinEmail("");
        setJoinFor(null);
        onChanged();
      } catch (err) {
        setNotice({
          sessionId: view.sessionId,
          failed: true,
          text: err instanceof Error ? err.message : t(`${K}.refusal.unavailable`),
        });
      } finally {
        setJoinBusy(false);
      }
    },
    [joinEmail, joinName, onChanged, t, tenantId],
  );

  if (sessions.length === 0) {
    return (
      <div className="max-w-[560px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px]">
        <div className="text-[15px] font-semibold text-admin-ink">{t(`${K}.empty.title`)}</div>
        <p className="mt-[8px] text-[13.5px] leading-[1.5] text-admin-ink-muted">
          {t(`${K}.empty.body`)}
        </p>
      </div>
    );
  }

  return (
    <>
      {sessions.map((view) => (
        <div
          key={view.sessionId}
          data-testid="waitlist-session"
          className="mb-[20px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[20px]"
        >
          <div className="text-[15px] font-semibold text-admin-ink">{view.sessionTitle}</div>
          <div className="mt-[4px] text-[13px] text-admin-ink-muted">
            {formatWhen(view.startsAt, timeZone)}
            {" · "}
            {view.seatsTotal === null
              ? t(`${K}.noPool`)
              : (view.seatsRemaining ?? 0) <= 0
                ? t(`${K}.full`)
                : fill(t(`${K}.seats`), {
                    left: String(view.seatsRemaining ?? 0),
                    total: String(view.seatsTotal),
                  })}
          </div>

          <div className="mt-[12px] overflow-x-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {view.entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-admin-border-soft align-top">
                    <td className="py-[8px] pr-[12px] text-admin-ink-muted">
                      {fill(t(`${K}.position`), { n: String(entry.position) })}
                    </td>
                    <td className="py-[8px] pr-[16px] text-admin-ink">
                      {entry.customerName}
                      {entry.id === view.nextInLineId ? (
                        <span className="ml-[8px] text-[12px] text-admin-ink-muted">
                          {t(`${K}.nextInLine`)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-[8px] pr-[16px] text-admin-ink-muted">
                      {t(`${K}.state.${entry.state}`)}
                      {entry.state === "offered" && entry.offerExpiresAt ? (
                        <span className="ml-[6px]">
                          {fill(t(`${K}.offerUntil`), {
                            when: formatClock(entry.offerExpiresAt, timeZone),
                          })}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-[8px] text-admin-ink">
                      {entry.state === "accepted" || entry.state === "withdrawn" ? null : (
                        <button
                          type="button"
                          data-testid="waitlist-promote"
                          className="rounded-admin border border-admin-line px-3 py-1 text-admin-ink disabled:opacity-60"
                          disabled={busyEntryId === entry.id}
                          onClick={() =>
                            void promote(view, entry.id, entry.customerName, entry.status)
                          }
                        >
                          {busyEntryId === entry.id ? t(`${K}.promoting`) : t(`${K}.promote`)}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {joinFor === view.sessionId ? (
            <div className="mt-[16px] rounded-[12px] border border-admin-border-soft bg-admin-surface-alt p-[16px]">
              <div className="text-[14px] font-semibold text-admin-ink">
                {t(`${K}.join.heading`)}
              </div>
              <label className="mt-[10px] block text-[12.5px] text-admin-ink-muted">
                {t(`${K}.join.name`)}
              </label>
              <input
                type="text"
                className="mt-[4px] w-full max-w-[320px] rounded-admin border border-admin-line px-3 py-2 text-admin-ink"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
              />
              <p className="mt-[4px] text-[12px] leading-[1.5] text-admin-ink-muted">
                {t(`${K}.join.nameHint`)}
              </p>
              <label className="mt-[10px] block text-[12.5px] text-admin-ink-muted">
                {t(`${K}.join.email`)}
              </label>
              <input
                type="email"
                className="mt-[4px] w-full max-w-[320px] rounded-admin border border-admin-line px-3 py-2 text-admin-ink"
                value={joinEmail}
                onChange={(e) => setJoinEmail(e.target.value)}
              />
              <div className="mt-[12px]">
                <button
                  type="button"
                  className="rounded-admin border border-admin-line px-3 py-2 text-admin-ink disabled:opacity-60"
                  disabled={joinBusy}
                  onClick={() => void join(view)}
                >
                  {joinBusy ? t(`${K}.join.submitting`) : t(`${K}.join.submit`)}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="mt-[12px] rounded-admin border border-admin-line px-3 py-2 text-admin-ink"
              onClick={() => {
                setJoinFor(view.sessionId);
                setNotice(null);
              }}
            >
              {t(`${K}.join.heading`)}
            </button>
          )}

          {notice?.sessionId === view.sessionId ? (
            <p
              data-testid="waitlist-message"
              className={
                notice.failed ? "mt-[10px] text-admin-critical" : "mt-[10px] text-admin-ink"
              }
            >
              {notice.text}
            </p>
          ) : null}
        </div>
      ))}
    </>
  );
}
