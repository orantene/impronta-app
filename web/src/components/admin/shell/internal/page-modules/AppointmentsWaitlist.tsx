"use client";

/**
 * AppointmentsWaitlist — who is waiting for a place, and giving one back out.
 *
 * THE ENTRY POINT IS THE POINT OF THIS SCREEN. It used to draw a card only for
 * sessions that already had somebody on them, and the control that adds a
 * person sits on a card, so the first person could never be added to any queue
 * and nothing could ever be promoted. The loader now also hands over every
 * upcoming session the engine calls FULL, with an empty queue, and each of
 * those cards is where an operator starts one.
 *
 * SEATS COME FROM THE ENGINE, AND "COULD NOT READ" IS NOT "FULL". The header on
 * each card renders the three states of `WaitlistSeats` — counted, never
 * counted, unreadable — as three different sentences. A wrongly sold-out class
 * loses the sale silently and nobody reports it; the opposite error promises a
 * place that was never counted.
 *
 * THE STALE-SCREEN GUARD IS THE ROW'S OWN STATUS. `promoteFromWaitlist` sends
 * the status this screen is SHOWING, and the RPC refuses with `conflict` when
 * the stored one has moved. Two people working the same list from two desks
 * cannot promote somebody who has already accepted or already been offered a
 * place by the other.
 *
 * ACCEPTING TAKES THE SEAT (D-105). "They took it" is not a label change: the
 * action behind it reserves and commits a real capacity allocation for the
 * party through the engine, in the same transaction that marks the entry
 * accepted. Before it existed, an accepted place held nothing at all, so the
 * pool went straight back to reporting the seat free and the next promote gave
 * the same seat to somebody else. Giving a place back is two different writes
 * for two different things — an offer that never held capacity, and a seat that
 * does — and the row's own state chooses between them.
 *
 * AN EXPIRED OFFER IS SHOWN, NOT SWEPT. `deriveWaitlistState` turns "offered
 * plus a window that has closed" into `expired` at read time. There is no cron
 * and none is wanted; a row that quietly returned to "waiting" would hide that
 * somebody was offered a place and never answered.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  acceptWaitlistPlace,
  joinSessionWaitlist,
  promoteFromWaitlist,
  releaseWaitlistPlace,
  type WaitlistSeats,
  type WaitlistView,
} from "@/lib/scheduling/appointments-actions";
import { fill, formatClock, formatWhen } from "./appointments-format";

const K = "dashboard.adminAppointments.waitlist";

type Props = {
  tenantId: string;
  sessions: WaitlistView[];
  /** Upcoming sessions left off because their seats could not be read. */
  unreadableSessions: number;
  /** How many upcoming sessions the desk examined for fullness. */
  checkedAhead: number;
  /** True when there were more upcoming sessions than that. */
  truncated: boolean;
  timeZone: string;
  /** A session the operator arrived here to queue somebody for, from the Sessions view. */
  focusSessionId: string | null;
  onChanged: () => void;
};

type Notice = { sessionId: string; text: string; failed: boolean };

/** The one sentence a card's seats line says. Three states, three sentences. */
function seatsLine(seats: WaitlistSeats, t: (key: string) => string): string {
  if (seats.kind === "uncounted") return t(`${K}.noPool`);
  if (seats.kind === "unreadable") return t(`${K}.seatsUnknown`);
  if (seats.remaining <= 0) return t(`${K}.full`);
  return fill(t(`${K}.seats`), {
    left: String(seats.remaining),
    total: String(seats.total),
  });
}

export function AppointmentsWaitlist({
  tenantId,
  sessions,
  unreadableSessions,
  checkedAhead,
  truncated,
  timeZone,
  focusSessionId,
  onChanged,
}: Props) {
  const t = useT();
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [joinFor, setJoinFor] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  // Arriving from a full class on the Sessions view opens that card's form and
  // brings it into view. Without this the operator lands on a list of every
  // full class and has to find the one they just clicked.
  useEffect(() => {
    if (!focusSessionId) return;
    setJoinFor(focusSessionId);
    cardRefs.current.get(focusSessionId)?.scrollIntoView({ block: "nearest" });
  }, [focusSessionId]);

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

  const accept = useCallback(
    async (view: WaitlistView, entryId: string, name: string) => {
      setBusyEntryId(entryId);
      setNotice(null);
      try {
        const result = await acceptWaitlistPlace({
          tenantId,
          entryId,
          // Only a live offer can be taken, and the screen showing one is what
          // the RPC checks against.
          expectedStatus: "offered",
        });
        if (!result.ok) {
          setNotice({
            sessionId: view.sessionId,
            failed: true,
            text: t(`${K}.refusal.${result.refusalKey}`),
          });
          return;
        }
        setNotice({
          sessionId: view.sessionId,
          failed: false,
          text: result.already
            ? fill(t(`${K}.alreadyHasPlace`), { name })
            : fill(t(`${K}.accepted`), { name }),
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
    [onChanged, t, tenantId],
  );

  const release = useCallback(
    async (view: WaitlistView, entryId: string, name: string, holding: "offer" | "seat") => {
      setBusyEntryId(entryId);
      setNotice(null);
      try {
        const result = await releaseWaitlistPlace({
          tenantId,
          entryId,
          holding,
          expectedStatus: holding === "seat" ? "accepted" : "offered",
        });
        if (!result.ok) {
          setNotice({
            sessionId: view.sessionId,
            failed: true,
            text: t(`${K}.refusal.${result.refusalKey}`),
          });
          return;
        }
        setNotice({
          sessionId: view.sessionId,
          failed: false,
          text: result.already
            ? fill(t(`${K}.alreadyOffList`), { name })
            : holding === "seat"
              ? fill(t(`${K}.cancelledSeat`), { name })
              : fill(t(`${K}.declined`), { name }),
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
    [onChanged, t, tenantId],
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

  // Two sentences for the two reasons this list can be shorter than the truth.
  // A list that is short for a reason nobody is told is the defect this screen
  // already had, so neither reason is allowed to be silent.
  const shortNotice =
    unreadableSessions > 0 || truncated ? (
      <div
        data-testid="waitlist-partial"
        className="mb-[16px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[16px] text-[13.5px] text-admin-ink"
      >
        {unreadableSessions > 0 ? (
          <p>{fill(t(`${K}.partial`), { n: String(unreadableSessions) })}</p>
        ) : null}
        {truncated ? (
          <p className={unreadableSessions > 0 ? "mt-[8px]" : undefined}>
            {fill(t(`${K}.checkedAhead`), { n: String(checkedAhead) })}
          </p>
        ) : null}
      </div>
    ) : null;

  if (sessions.length === 0) {
    return (
      <>
        {shortNotice}
        <div className="max-w-[560px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px]">
          <div className="text-[15px] font-semibold text-admin-ink">{t(`${K}.empty.title`)}</div>
          <p className="mt-[8px] text-[13.5px] leading-[1.5] text-admin-ink-muted">
            {t(`${K}.empty.body`)}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {shortNotice}
      {sessions.map((view) => (
        <div
          key={view.sessionId}
          data-testid="waitlist-session"
          ref={(node) => {
            if (node) cardRefs.current.set(view.sessionId, node);
            else cardRefs.current.delete(view.sessionId);
          }}
          className="mb-[20px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[20px]"
        >
          <div className="text-[15px] font-semibold text-admin-ink">{view.sessionTitle}</div>
          <div className="mt-[4px] text-[13px] text-admin-ink-muted">
            {formatWhen(view.startsAt, timeZone)}
            {" · "}
            {seatsLine(view.seats, t)}
          </div>

          {view.entries.length === 0 ? (
            // A full class with nobody on it. This is the state the whole
            // journey used to be unreachable from, so it says what to do.
            <p data-testid="waitlist-nobody" className="mt-[12px] text-[13px] text-admin-ink-muted">
              {t(`${K}.nobodyYet`)}
            </p>
          ) : (
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
                        <div className="flex flex-wrap gap-[6px]">
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
                          {/* Only a LIVE offer can be taken or handed back. An
                              expired one is offered again, not accepted: the
                              place may already be somebody else's, and the RPC
                              refuses it rather than reserving a seat on a
                              window that closed. */}
                          {entry.state === "offered" ? (
                            <>
                              <button
                                type="button"
                                data-testid="waitlist-accept"
                                className="rounded-admin border border-admin-line px-3 py-1 text-admin-ink disabled:opacity-60"
                                disabled={busyEntryId === entry.id}
                                onClick={() => void accept(view, entry.id, entry.customerName)}
                              >
                                {busyEntryId === entry.id
                                  ? t(`${K}.accepting`)
                                  : t(`${K}.accept`)}
                              </button>
                              <button
                                type="button"
                                data-testid="waitlist-decline"
                                className="rounded-admin border border-admin-line px-3 py-1 text-admin-ink-muted disabled:opacity-60"
                                disabled={busyEntryId === entry.id}
                                onClick={() =>
                                  void release(view, entry.id, entry.customerName, "offer")
                                }
                              >
                                {busyEntryId === entry.id
                                  ? t(`${K}.declining`)
                                  : t(`${K}.decline`)}
                              </button>
                            </>
                          ) : null}
                          {/* A place that WAS taken holds a committed seat.
                              Giving it up has to release that seat, or the
                              class stays sold out with nobody in it. */}
                          {entry.state === "accepted" ? (
                            <button
                              type="button"
                              data-testid="waitlist-cancel-seat"
                              className="rounded-admin border border-admin-line px-3 py-1 text-admin-ink-muted disabled:opacity-60"
                              disabled={busyEntryId === entry.id}
                              onClick={() =>
                                void release(view, entry.id, entry.customerName, "seat")
                              }
                            >
                              {busyEntryId === entry.id
                                ? t(`${K}.cancellingSeat`)
                                : t(`${K}.cancelSeat`)}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {joinFor === view.sessionId ? (
            <div className="mt-[16px] rounded-[12px] border border-admin-border-soft bg-admin-surface-alt p-[16px]">
              <div className="text-[14px] font-semibold text-admin-ink">
                {t(`${K}.join.heading`)}
              </div>
              <label className="mt-[10px] block text-[12.5px] text-admin-ink-muted">
                {t(`${K}.join.name`)}
                <input
                  type="text"
                  className="mt-[4px] block w-full max-w-[320px] rounded-admin border border-admin-line px-3 py-2 text-admin-ink"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                />
              </label>
              <p className="mt-[4px] text-[12px] leading-[1.5] text-admin-ink-muted">
                {t(`${K}.join.nameHint`)}
              </p>
              <label className="mt-[10px] block text-[12.5px] text-admin-ink-muted">
                {t(`${K}.join.email`)}
                <input
                  type="email"
                  className="mt-[4px] block w-full max-w-[320px] rounded-admin border border-admin-line px-3 py-2 text-admin-ink"
                  value={joinEmail}
                  onChange={(e) => setJoinEmail(e.target.value)}
                />
              </label>
              <div className="mt-[12px] flex flex-wrap gap-[8px]">
                <button
                  type="button"
                  data-testid="waitlist-join-submit"
                  className="rounded-admin border border-admin-line px-3 py-2 text-admin-ink disabled:opacity-60"
                  disabled={joinBusy}
                  onClick={() => void join(view)}
                >
                  {joinBusy ? t(`${K}.join.submitting`) : t(`${K}.join.submit`)}
                </button>
                <button
                  type="button"
                  className="rounded-admin border border-admin-line px-3 py-2 text-admin-ink-muted disabled:opacity-60"
                  disabled={joinBusy}
                  onClick={() => {
                    setJoinFor(null);
                    setNotice(null);
                  }}
                >
                  {t(`${K}.join.cancel`)}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="waitlist-join-open"
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
