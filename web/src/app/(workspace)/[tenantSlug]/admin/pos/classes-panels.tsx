"use client";

/**
 * classes-panels.tsx — the four screens of the Classes mode, as
 * presentational pieces: props in, callbacks out, no fetching. The wiring
 * (which command a tap runs, which sentence a refusal becomes) is in
 * `classes-client.tsx`.
 *
 * Every primary action is `POS_PRIMARY_ACTION` (56px tall): this runs on a
 * tablet at a front desk, standing up. Colours are token classes only.
 */

import { cn } from "@/lib/utils";
import {
  POS_INPUT,
  POS_PRIMARY_ACTION,
  POS_REFUSAL_BANNER,
  POS_SECONDARY_ACTION,
  POS_SURFACE,
} from "@/components/admin/pos/pos-classes";
import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type {
  ClassesAppointment,
  ClassesRosterEntry,
  ClassesSession,
} from "@/lib/pos/classes/day";
import type { WaitlistEntry } from "@/lib/scheduling/session-waitlist";

import { fill, formatClock, formatWhen } from "./classes-format";

/**
 * One sentence, one outcome. `data-pos-classes-notice` names the kind so a
 * browser journey can find THIS notice rather than the first live region on
 * the page (the same lesson `PosRefusalBanner` records).
 */
export function ClassesNotice({
  kind,
  children,
}: {
  kind: "refused" | "done";
  children: string;
}) {
  return (
    <div
      role={kind === "refused" ? "alert" : "status"}
      data-pos-classes-notice={kind}
      className={cn(
        kind === "refused" ? POS_REFUSAL_BANNER : `${POS_SURFACE} p-4 text-sm text-foreground`,
      )}
    >
      <p className="m-0 flex-1">{children}</p>
    </div>
  );
}

/* ── Today ─────────────────────────────────────────────────────────────── */

export function TodayPanel({
  rows,
  timeZone,
  locale,
  copy,
  busy,
  moving,
  moveValue,
  onMoveValueChange,
  onCheckIn,
  onOpenMove,
  onSubmitMove,
  onCancelMove,
  onCollect,
}: {
  rows: readonly ClassesAppointment[];
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  /** The booking whose move form is open. */
  moving: string | null;
  moveValue: string;
  onMoveValueChange: (value: string) => void;
  onCheckIn: (row: ClassesAppointment) => void;
  onOpenMove: (row: ClassesAppointment) => void;
  onSubmitMove: (row: ClassesAppointment) => void;
  onCancelMove: () => void;
  onCollect: (row: ClassesAppointment) => void;
}) {
  if (rows.length === 0) {
    return <p className="m-0 p-4 text-sm text-muted-foreground">{copy.today.empty}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-4">
      {rows.map((row) => {
        const arrived = row.state === "in_progress";
        const canCheckIn = row.state === "confirmed" || row.state === "tentative" || row.state === "draft";
        const canMove = canCheckIn || arrived;
        return (
          <li key={row.id} data-pos-classes-appointment={row.id} className={`${POS_SURFACE} flex flex-col gap-3 p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-2xl font-semibold tabular-nums text-foreground">
                  {formatClock(row.startsAt, timeZone, locale)}
                </p>
                <p className="m-0 text-base font-medium text-foreground">
                  {row.customerName ?? copy.today.nobody}
                </p>
                <p className="m-0 text-sm text-muted-foreground">{row.title}</p>
              </div>
              <div className="flex flex-col items-end gap-1 text-sm">
                <span
                  data-pos-classes-state={row.state}
                  className={cn(
                    "rounded-full border px-3 py-1 font-medium",
                    arrived ? "border-foreground bg-foreground text-background" : "border-border text-foreground",
                  )}
                >
                  {arrived ? copy.today.arrived : copy.state[row.state]}
                </span>
                <span className="text-muted-foreground">
                  {row.orderId
                    ? row.outstandingCents > 0
                      ? fill(copy.today.owed, { amount: formatOrderMoney(row.outstandingCents, row.currency) })
                      : copy.today.paid
                    : copy.today.noOrder}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canCheckIn && (
                <button type="button" disabled={busy} className={`${POS_PRIMARY_ACTION} flex-1`} onClick={() => onCheckIn(row)}>
                  {busy ? copy.today.checkingIn : copy.today.checkIn}
                </button>
              )}
              {row.orderId && row.collectable && row.outstandingCents > 0 && (
                <button type="button" disabled={busy} className={`${POS_PRIMARY_ACTION} flex-1`} onClick={() => onCollect(row)}>
                  {fill(copy.today.collect, { amount: formatOrderMoney(row.outstandingCents, row.currency) })}
                </button>
              )}
              {canMove && moving !== row.id && (
                <button type="button" disabled={busy} className={`${POS_SECONDARY_ACTION} flex-1`} onClick={() => onOpenMove(row)}>
                  {copy.today.move}
                </button>
              )}
            </div>
            {moving === row.id && (
              <form
                className="flex flex-col gap-3 border-t border-border pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitMove(row);
                }}
              >
                <p className="m-0 text-sm font-semibold text-foreground">{copy.reschedule.heading}</p>
                <label className="flex flex-col gap-1 text-sm text-foreground">
                  <span>{fill(copy.reschedule.newStart, { zone: timeZone })}</span>
                  <input
                    type="datetime-local"
                    className={POS_INPUT}
                    value={moveValue}
                    onChange={(event) => onMoveValueChange(event.target.value)}
                    data-pos-classes-move-input
                  />
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className={`${POS_PRIMARY_ACTION} flex-1`}>
                    {busy ? copy.reschedule.submitting : copy.reschedule.submit}
                  </button>
                  <button type="button" disabled={busy} className={`${POS_SECONDARY_ACTION} flex-1`} onClick={onCancelMove}>
                    {copy.reschedule.cancel}
                  </button>
                </div>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ── Sessions ──────────────────────────────────────────────────────────── */

function seatsLine(session: ClassesSession, copy: ClassesCopy): string {
  const seats = session.seats;
  if (seats.kind === "counted") {
    return seats.remaining <= 0
      ? `${fill(copy.sessions.seats, { taken: seats.total - seats.remaining, total: seats.total })} · ${copy.sessions.seatsFull}`
      : fill(copy.sessions.seats, { taken: seats.total - seats.remaining, total: seats.total });
  }
  if (seats.kind === "unreadable") return copy.sessions.seatsUnknown;
  return copy.sessions.seatsUncounted;
}

function RosterRow({
  entry,
  copy,
  busy,
  onMark,
}: {
  entry: ClassesRosterEntry;
  copy: ClassesCopy;
  busy: boolean;
  onMark: (admissionId: string) => void;
}) {
  if (entry.kind === "waitlist_place") {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2" data-pos-classes-roster="waitlist_place">
        <div>
          <p className="m-0 font-medium text-foreground">{entry.name}</p>
          <p className="m-0 text-xs text-muted-foreground">{copy.sessions.fromList}. {copy.sessions.fromListHint}</p>
        </div>
      </li>
    );
  }
  const present = entry.admittedCount >= entry.partySize && entry.partySize > 0;
  const partial = entry.admittedCount > 0 && !present;
  const valid = entry.status === "valid";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2" data-pos-classes-roster={entry.admissionId} data-pos-classes-admitted={entry.admittedCount}>
      <div className="min-w-0">
        <p className="m-0 font-medium text-foreground">{entry.name ?? copy.today.nobody}</p>
        <p className="m-0 text-xs text-muted-foreground">
          {!valid
            ? fill(copy.sessions.notValid, { status: entry.status })
            : present
              ? copy.sessions.here
              : partial
                ? fill(copy.sessions.partOfParty, { admitted: entry.admittedCount, party: entry.partySize })
                : fill(copy.sessions.partOfParty, { admitted: 0, party: entry.partySize })}
        </p>
      </div>
      {valid && !present && (
        <button type="button" disabled={busy} className={`${POS_PRIMARY_ACTION} min-w-[10rem]`} onClick={() => onMark(entry.admissionId)}>
          {busy ? copy.sessions.marking : copy.sessions.mark}
        </button>
      )}
      {present && (
        <span className="rounded-full border border-foreground bg-foreground px-3 py-1 text-sm font-medium text-background">
          {copy.sessions.here}
        </span>
      )}
    </li>
  );
}

export function SessionsPanel({
  sessions,
  timeZone,
  locale,
  copy,
  busy,
  onMark,
  onBookSeat,
  onOpenQueue,
}: {
  sessions: readonly ClassesSession[];
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  onMark: (admissionId: string) => void;
  onBookSeat: (session: ClassesSession) => void;
  onOpenQueue: (session: ClassesSession) => void;
}) {
  if (sessions.length === 0) {
    return <p className="m-0 p-4 text-sm text-muted-foreground">{copy.sessions.empty}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-4">
      {sessions.map((session) => {
        const full = session.seats.kind === "counted" && session.seats.remaining <= 0;
        return (
          <li key={session.id} data-pos-classes-session={session.id} className={`${POS_SURFACE} flex flex-col gap-3 p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-2xl font-semibold tabular-nums text-foreground">
                  {formatClock(session.startsAt, timeZone, locale)}
                  <span className="text-base font-normal text-muted-foreground"> · {formatClock(session.endsAt, timeZone, locale)}</span>
                </p>
                <p className="m-0 text-base font-medium text-foreground">{session.title}</p>
              </div>
              <p className="m-0 text-sm font-medium text-foreground" data-pos-classes-seats>
                {seatsLine(session, copy)}
              </p>
            </div>
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.sessions.roster}</p>
              {session.roster.length === 0 ? (
                <p className="m-0 py-2 text-sm text-muted-foreground">{copy.sessions.rosterEmpty}</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-border p-0">
                  {session.roster.map((entry) => (
                    <RosterRow
                      key={entry.kind === "admission" ? entry.admissionId : entry.entryId}
                      entry={entry}
                      copy={copy}
                      busy={busy}
                      onMark={onMark}
                    />
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!full && session.offeringId && (
                <button type="button" disabled={busy} className={`${POS_SECONDARY_ACTION} flex-1`} onClick={() => onBookSeat(session)}>
                  {copy.sessions.bookSeat}
                </button>
              )}
              {full && (
                <button type="button" disabled={busy} className={`${POS_SECONDARY_ACTION} flex-1`} onClick={() => onOpenQueue(session)}>
                  {copy.sessions.openQueue}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Waitlist ──────────────────────────────────────────────────────────── */

export function WaitlistPanel({
  sessions,
  timeZone,
  locale,
  copy,
  busy,
  joinFor,
  joinName,
  joinEmail,
  onJoinNameChange,
  onJoinEmailChange,
  onOpenJoin,
  onSubmitJoin,
  onPromote,
  onAccept,
}: {
  sessions: readonly ClassesSession[];
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  joinFor: string | null;
  joinName: string;
  joinEmail: string;
  onJoinNameChange: (v: string) => void;
  onJoinEmailChange: (v: string) => void;
  onOpenJoin: (session: ClassesSession) => void;
  onSubmitJoin: (session: ClassesSession) => void;
  onPromote: (session: ClassesSession, entry: WaitlistEntry) => void;
  onAccept: (session: ClassesSession, entry: WaitlistEntry) => void;
}) {
  const listed = sessions.filter(
    (s) => s.waitlist.length > 0 || (s.seats.kind === "counted" && s.seats.remaining <= 0),
  );
  if (listed.length === 0) {
    return <p className="m-0 p-4 text-sm text-muted-foreground">{copy.waitlist.empty}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-4">
      {listed.map((session) => (
        <li key={session.id} data-pos-classes-queue={session.id} className={`${POS_SURFACE} flex flex-col gap-3 p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="m-0 text-xl font-semibold tabular-nums text-foreground">{formatClock(session.startsAt, timeZone, locale)}</p>
              <p className="m-0 text-base font-medium text-foreground">{session.title}</p>
            </div>
            <p className="m-0 text-sm font-medium text-foreground">{seatsLine(session, copy)}</p>
          </div>
          {session.waitlist.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{copy.waitlist.empty}</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-border p-0">
              {session.waitlist.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-pos-classes-entry={entry.id} data-pos-classes-entry-state={entry.state}>
                  <div className="min-w-0">
                    <p className="m-0 font-medium text-foreground">
                      <span className="text-muted-foreground">{fill(copy.waitlist.position, { n: entry.position })} </span>
                      {entry.customerName}
                      {session.nextInLineId === entry.id && (
                        <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs">{copy.waitlist.nextInLine}</span>
                      )}
                    </p>
                    <p className="m-0 text-xs text-muted-foreground">
                      {copy.waitlist.state[entry.state]}
                      {entry.state === "offered" && entry.offerExpiresAt
                        ? ` · ${fill(copy.waitlist.offerUntil, { when: formatWhen(entry.offerExpiresAt, timeZone, locale) })}`
                        : ""}
                    </p>
                  </div>
                  {(entry.state === "waiting" || entry.state === "expired") && (
                    <button type="button" disabled={busy} className={`${POS_PRIMARY_ACTION} min-w-[10rem]`} onClick={() => onPromote(session, entry)}>
                      {busy ? copy.waitlist.promoting : copy.waitlist.promote}
                    </button>
                  )}
                  {entry.state === "offered" && (
                    <button type="button" disabled={busy} className={`${POS_PRIMARY_ACTION} min-w-[10rem]`} onClick={() => onAccept(session, entry)}>
                      {busy ? copy.waitlist.accepting : copy.waitlist.accept}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {joinFor === session.id ? (
            <form
              className="flex flex-col gap-3 border-t border-border pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitJoin(session);
              }}
            >
              <p className="m-0 text-sm font-semibold text-foreground">{copy.waitlist.join.heading}</p>
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{copy.waitlist.join.name}</span>
                <input className={POS_INPUT} value={joinName} onChange={(e) => onJoinNameChange(e.target.value)} data-pos-classes-join-name />
              </label>
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{copy.waitlist.join.email}</span>
                <input className={POS_INPUT} type="email" value={joinEmail} onChange={(e) => onJoinEmailChange(e.target.value)} />
              </label>
              <button type="submit" disabled={busy} className={POS_PRIMARY_ACTION}>
                {busy ? copy.waitlist.join.submitting : copy.waitlist.join.submit}
              </button>
            </form>
          ) : (
            <button type="button" disabled={busy} className={POS_SECONDARY_ACTION} onClick={() => onOpenJoin(session)}>
              {copy.sessions.openQueue}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── Walk-in ───────────────────────────────────────────────────────────── */

export type WalkInKind = "appointment" | "seat";

export type WalkInService = {
  readonly offeringId: string;
  readonly title: string;
  readonly amountCents: number;
  readonly durationMinutes: number;
  readonly personName: string;
  readonly allowPayInPerson: boolean;
};

export type WalkInSlots =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; starts: string[] }
  | { status: "empty"; sentence: string };

/** What the walk-in has become so far, after "Book it". */
export type WalkInOutcome =
  | { stage: "booked"; sentence: string; outstandingCents: number; currency: string }
  | { stage: "collected"; sentence: string };

export function WalkInPanel({
  kind,
  onKindChange,
  services,
  sessions,
  serviceId,
  onServiceChange,
  slots,
  slotIso,
  onSlotChange,
  sessionId,
  onSessionChange,
  tierId,
  onTierChange,
  name,
  email,
  phone,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  timeZone,
  locale,
  currency,
  copy,
  busy,
  outcome,
  onBook,
  onCollect,
  onStartAgain,
}: {
  kind: WalkInKind;
  onKindChange: (kind: WalkInKind) => void;
  services: readonly WalkInService[];
  sessions: readonly ClassesSession[];
  serviceId: string;
  onServiceChange: (id: string) => void;
  slots: WalkInSlots;
  slotIso: string;
  onSlotChange: (iso: string) => void;
  sessionId: string;
  onSessionChange: (id: string) => void;
  tierId: string;
  onTierChange: (id: string) => void;
  name: string;
  email: string;
  phone: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  timeZone: string;
  locale: string;
  currency: string;
  copy: ClassesCopy;
  busy: boolean;
  outcome: WalkInOutcome | null;
  onBook: () => void;
  onCollect: () => void;
  onStartAgain: () => void;
}) {
  const sellable = sessions.filter(
    (s) => s.offeringId && !(s.seats.kind === "counted" && s.seats.remaining <= 0),
  );
  const session = sellable.find((s) => s.id === sessionId) ?? null;
  const service = services.find((s) => s.offeringId === serviceId) ?? null;

  if (outcome) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <ClassesNotice kind="done">{outcome.sentence}</ClassesNotice>
        {outcome.stage === "booked" && outcome.outstandingCents > 0 && (
          <button type="button" disabled={busy} className={POS_PRIMARY_ACTION} onClick={onCollect} data-pos-classes-collect>
            {busy
              ? copy.walkin.collecting
              : fill(copy.walkin.collect, { amount: formatOrderMoney(outcome.outstandingCents, outcome.currency) })}
          </button>
        )}
        {outcome.stage === "booked" && outcome.outstandingCents <= 0 && (
          <p className="m-0 text-sm text-muted-foreground">{copy.walkin.nothingToCollect}</p>
        )}
        <button type="button" disabled={busy} className={POS_SECONDARY_ACTION} onClick={onStartAgain}>
          {copy.walkin.startAgain}
        </button>
      </div>
    );
  }

  const kindButton = (value: WalkInKind, label: string) => (
    <button
      type="button"
      aria-pressed={kind === value}
      className={cn(
        POS_SECONDARY_ACTION,
        "flex-1",
        kind === value && "border-foreground bg-foreground text-background hover:bg-foreground",
      )}
      onClick={() => onKindChange(value)}
    >
      {label}
    </button>
  );

  const detailsReady = name.trim().length > 0;
  const targetReady = kind === "appointment" ? Boolean(service && slotIso) : Boolean(session && (session.tiers.length <= 1 || tierId));

  return (
    <form
      className="flex flex-col gap-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onBook();
      }}
    >
      <div className="flex gap-2">
        {kindButton("appointment", copy.walkin.kindAppointment)}
        {kindButton("seat", copy.walkin.kindSeat)}
      </div>

      {kind === "appointment" ? (
        <>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            <span>{copy.walkin.service}</span>
            {services.length === 0 ? (
              <span className="text-muted-foreground">{copy.walkin.noServices}</span>
            ) : (
              <select className={POS_INPUT} value={serviceId} onChange={(e) => onServiceChange(e.target.value)} data-pos-classes-service>
                <option value="">{copy.walkin.service}</option>
                {services.map((s) => (
                  <option key={s.offeringId} value={s.offeringId}>
                    {s.title} · {fill(copy.walkin.withPerson, { name: s.personName })} · {fill(copy.walkin.minutes, { n: s.durationMinutes })} · {formatOrderMoney(s.amountCents, currency)}
                  </option>
                ))}
              </select>
            )}
          </label>
          {service && service.amountCents > 0 && !service.allowPayInPerson && (
            <p className="m-0 text-sm text-muted-foreground">{copy.walkin.mustPayOnlineHint}</p>
          )}
          {service && (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-sm text-foreground">{copy.walkin.pickTime}</p>
              {slots.status === "loading" && <p className="m-0 text-sm text-muted-foreground">{copy.walkin.loadingTimes}</p>}
              {slots.status === "empty" && <ClassesNotice kind="refused">{slots.sentence}</ClassesNotice>}
              {slots.status === "ready" && (
                <div className="flex flex-wrap gap-2" data-pos-classes-slots>
                  {slots.starts.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      aria-pressed={slotIso === iso}
                      className={cn(
                        POS_SECONDARY_ACTION,
                        "min-w-[5.5rem] px-3 tabular-nums",
                        slotIso === iso && "border-foreground bg-foreground text-background hover:bg-foreground",
                      )}
                      onClick={() => onSlotChange(iso)}
                    >
                      {formatClock(iso, timeZone, locale)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            <span>{copy.walkin.session}</span>
            {sellable.length === 0 ? (
              <span className="text-muted-foreground">{copy.walkin.noSessions}</span>
            ) : (
              <select className={POS_INPUT} value={sessionId} onChange={(e) => onSessionChange(e.target.value)} data-pos-classes-session-pick>
                <option value="">{copy.walkin.session}</option>
                {sellable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatClock(s.startsAt, timeZone, locale)} · {s.title} · {seatsLine(s, copy)}
                  </option>
                ))}
              </select>
            )}
          </label>
          {session && session.tiers.length > 1 && (
            <label className="flex flex-col gap-1 text-sm text-foreground">
              <span>{copy.walkin.tier}</span>
              <select className={POS_INPUT} value={tierId} onChange={(e) => onTierChange(e.target.value)} data-pos-classes-tier>
                <option value="">{copy.walkin.tier}</option>
                {session.tiers.map((t) => (
                  <option key={t.variantId} value={t.variantId}>
                    {t.label} · {formatOrderMoney(t.amountCents, currency)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      <label className="flex flex-col gap-1 text-sm text-foreground">
        <span>{copy.walkin.name}</span>
        <input className={POS_INPUT} value={name} onChange={(e) => onNameChange(e.target.value)} autoComplete="off" data-pos-classes-name />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-foreground">
          <span>{copy.walkin.email}</span>
          <input className={POS_INPUT} type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} autoComplete="off" data-pos-classes-email />
        </label>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          <span>{copy.walkin.phone}</span>
          <input className={POS_INPUT} type="tel" value={phone} onChange={(e) => onPhoneChange(e.target.value)} autoComplete="off" />
        </label>
      </div>
      <button type="submit" disabled={busy || !detailsReady || !targetReady} className={POS_PRIMARY_ACTION} data-pos-classes-book>
        {busy ? copy.walkin.booking : copy.walkin.book}
      </button>
    </form>
  );
}
