"use client";

/**
 * ClassesClient — the Appointments & Classes mode, wired.
 *
 * The front desk's view of one venue day from the till: the appointments in
 * arrival order with a check-in, the sessions with seats taken against
 * capacity and a roster to mark attendance, a walk-in onto a free slot or
 * seat with the money taken through the Counter's own charge, the queue for
 * a full session with a promote, and a move that runs the proven
 * all-or-nothing reschedule.
 *
 * SAME DISCIPLINE AS THE COUNTER (`pos-client.tsx`). Every pixel is a prop the
 * server resolved or a value the operator just typed; every write goes
 * through a server action and comes back as data; every refusal becomes a
 * sentence from the catalogue before it reaches the screen. No `useEffect`:
 * the day is read on the server and re-read with `router.refresh()` after
 * each write, so what is on screen is what is in the rows. The one fetch an
 * operator triggers by hand, the free times for a chosen service, runs in the
 * change handler that chose it.
 *
 * THE MONEY IS THE COUNTER'S. `posStartCollection` with `posCollectionKey`
 * (derived, never minted per tap) and the sale's `expectedVersion`: a cash
 * payment taken here is exactly one taken at the register, on the same
 * shift, with the same idempotency, refused with the same sentences.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { PosFrame, PosRefusalBanner, type PosRefusalCopy, type PosRefusalReason } from "@/components/admin/pos";
import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ClassesAppointment, ClassesDay, ClassesSession } from "@/lib/pos/classes/day";
import {
  actionRefusalKey,
  attendanceRefusalKey,
  checkInRefusalKey,
  noSlotsKey,
  slotsRefusalKey,
  walkInRefusalKey,
  type ClassesRefusalKey,
} from "@/lib/pos/classes/refusals";
import { refusalFromResult } from "@/lib/pos/refusal-reason";
import { parseLocalDateTime } from "@/lib/scheduling/appointments-board";
import {
  acceptWaitlistPlace,
  joinSessionWaitlist,
  promoteFromWaitlist,
  rescheduleAppointment,
} from "@/lib/scheduling/appointments-actions";
import { fillRefusalSentence } from "@/lib/scheduling/reschedule-refusal";
import type { WaitlistEntry } from "@/lib/scheduling/session-waitlist";
import { zonedLocalToUtc } from "@/lib/scheduling/tz";

import { posStartCollection } from "./actions";
import {
  classesBookWalkIn,
  classesCheckIn,
  classesHoldSeat,
  classesMarkAttendance,
  classesWalkInSlots,
  type ClassesWalkInResult,
} from "./classes-actions";
import { fill, formatDay, formatWhen, venueLocalInputValue } from "./classes-format";
import {
  ClassesNotice,
  SessionsPanel,
  TodayPanel,
  WaitlistPanel,
  WalkInPanel,
  type WalkInKind,
  type WalkInOutcome,
  type WalkInService,
  type WalkInSlots,
} from "./classes-panels";
import { posCollectionKey } from "./counter-model";

type Destination = "today" | "sessions" | "walkin" | "waitlist";

export type ClassesClientProps = {
  tenantId: string;
  workspaceName: string;
  posPath: string;
  locale: string;
  currency: string;
  day: ClassesDay;
  services: readonly WalkInService[];
  copy: {
    frame: { navLabel: string; destinationLabels: Readonly<Record<string, string>> };
    classes: ClassesCopy;
    counterRefusal: PosRefusalCopy;
  };
};

type Notice =
  | { kind: "refused"; sentence: string }
  | { kind: "done"; sentence: string }
  | { kind: "counter"; reason: PosRefusalReason };

function parseDestination(raw: string): Destination {
  return raw === "sessions" || raw === "walkin" || raw === "waitlist" ? raw : "today";
}

export function ClassesClient(props: ClassesClientProps) {
  const router = useRouter();
  const { copy, day } = props;
  const c = copy.classes;

  const [destination, setDestination] = useState<Destination>("today");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Today
  const [moving, setMoving] = useState<string | null>(null);
  const [moveValue, setMoveValue] = useState("");

  // Waitlist
  const [joinFor, setJoinFor] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");

  // Walk-in
  const [kind, setKind] = useState<WalkInKind>("appointment");
  const [serviceId, setServiceId] = useState("");
  const [slots, setSlots] = useState<WalkInSlots>({ status: "idle" });
  const [slotIso, setSlotIso] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [tierId, setTierId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [attemptKey, setAttemptKey] = useState(() => `walkin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const [outcome, setOutcome] = useState<WalkInOutcome | null>(null);
  const [sale, setSale] = useState<{ orderId: string; version: number; outstandingCents: number; currency: string } | null>(null);

  const dayHref = (offset: number) => `${props.posPath}?mode=classes&day=${offset}`;

  const refuse = useCallback(
    (key: ClassesRefusalKey) => setNotice({ kind: "refused", sentence: c.refusal[key] }),
    [c.refusal],
  );

  /** Run one command; on success re-read the day so the screen is the rows. */
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, after: (result: T) => boolean): Promise<T | null> => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await fn();
        if (after(result)) router.refresh();
        return result;
      } catch {
        refuse("unavailable");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refuse, router],
  );

  /* ── Today ─────────────────────────────────────────────────────────── */

  const checkIn = (row: ClassesAppointment) =>
    void run(
      () => classesCheckIn({ bookingId: row.id, expectedState: row.state }),
      (r) => {
        if (!r.ok) {
          refuse(r.reason === "not_allowed" || r.reason === "invalid" ? actionRefusalKey(r.reason) : checkInRefusalKey(r.reason));
          return false;
        }
        setNotice({ kind: "done", sentence: `${row.customerName ?? c.today.nobody}: ${c.today.arrived}` });
        return true;
      },
    );

  const submitMove = (row: ClassesAppointment) => {
    const parsed = parseLocalDateTime(moveValue);
    if (!parsed) {
      setNotice({ kind: "refused", sentence: c.reschedule.needStart });
      return;
    }
    // The control hands back a wall clock with no zone. It means the VENUE's
    // clock, so the venue's zone is what turns it into an instant.
    const instant = zonedLocalToUtc(parsed.ymd, parsed.minutesOfDay, day.timeZone);
    if (!instant) {
      setNotice({ kind: "refused", sentence: c.reschedule.nonexistentTime });
      return;
    }
    void run(
      () =>
        rescheduleAppointment({
          tenantId: props.tenantId,
          bookingId: row.id,
          newStartsAt: instant.toISOString(),
          newEndsAt: null,
          // The window the operator was looking at, so a stale screen is
          // refused rather than overwriting a colleague's move.
          expectedStartsAt: row.startsAt,
          expectedEndsAt: row.endsAt,
        }),
      (r) => {
        if (!r.ok) {
          setNotice({
            kind: "refused",
            sentence: fillRefusalSentence(c.reschedule.refusal[r.refusal.key], r.refusal.params),
          });
          return false;
        }
        setMoving(null);
        setNotice({
          kind: "done",
          sentence: r.already
            ? c.reschedule.already
            : fill(c.reschedule.moved, { when: formatWhen(r.startsAt, day.timeZone, props.locale) }),
        });
        return true;
      },
    );
  };

  /**
   * THE CHARGE, the Counter's. Key derived from the sale, version carried,
   * whole outstanding balance, cash tendered exactly.
   */
  const collectCash = (target: { orderId: string; version: number; outstandingCents: number }) =>
    run(
      () =>
        posStartCollection({
          orderId: target.orderId,
          method: "cash",
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          displayName: name.trim() || undefined,
          amountCents: target.outstandingCents > 0 ? target.outstandingCents : undefined,
          tenderedCents: target.outstandingCents,
          idempotencyKey: posCollectionKey({
            orderId: target.orderId,
            version: target.version,
            method: "cash",
            amountCents: target.outstandingCents,
          }),
          expectedVersion: target.version,
        }),
      (r) => {
        const refused = refusalFromResult(r, "sale");
        if (refused) {
          setNotice({ kind: "counter", reason: refused });
          return false;
        }
        return true;
      },
    );

  const collectRow = (row: ClassesAppointment) => {
    if (!row.orderId || row.orderVersion === null) return;
    void collectCash({ orderId: row.orderId, version: row.orderVersion, outstandingCents: row.outstandingCents }).then((r) => {
      if (r && r.ok) {
        setNotice({ kind: "done", sentence: fill(c.walkin.collected, { amount: formatOrderMoney(row.outstandingCents, row.currency) }) });
      }
    });
  };

  /* ── Sessions ──────────────────────────────────────────────────────── */

  const mark = (admissionId: string) =>
    void run(
      () => classesMarkAttendance({ admissionId }),
      (r) => {
        if (!r.ok) {
          refuse(r.reason === "not_allowed" ? actionRefusalKey(r.reason) : attendanceRefusalKey(r.reason));
          return false;
        }
        setNotice({ kind: "done", sentence: c.sessions.here });
        return true;
      },
    );

  /* ── Waitlist ──────────────────────────────────────────────────────── */

  const promote = (session: ClassesSession, entry: WaitlistEntry) =>
    void run(
      () => promoteFromWaitlist({ tenantId: props.tenantId, entryId: entry.id, expectedStatus: entry.status }),
      (r) => {
        if (!r.ok) {
          setNotice({ kind: "refused", sentence: c.waitlist.promoteRefusal[r.refusalKey] });
          return false;
        }
        setNotice({
          kind: "done",
          sentence: r.already
            ? fill(c.waitlist.alreadyOffered, { name: entry.customerName })
            : fill(c.waitlist.promoted, {
                name: entry.customerName,
                when: r.offerExpiresAt ? formatWhen(r.offerExpiresAt, day.timeZone, props.locale) : "",
              }),
        });
        return true;
      },
    );

  const accept = (session: ClassesSession, entry: WaitlistEntry) =>
    void run(
      () => acceptWaitlistPlace({ tenantId: props.tenantId, entryId: entry.id, expectedStatus: entry.status }),
      (r) => {
        if (!r.ok) {
          setNotice({ kind: "refused", sentence: c.waitlist.acceptRefusal[r.refusalKey] });
          return false;
        }
        setNotice({ kind: "done", sentence: fill(c.waitlist.accepted, { name: entry.customerName }) });
        return true;
      },
    );

  const join = (session: ClassesSession) =>
    void run(
      () =>
        joinSessionWaitlist({
          tenantId: props.tenantId,
          sessionId: session.id,
          customerName: joinName,
          customerEmail: joinEmail.trim() || null,
        }),
      (r) => {
        if (!r.ok) {
          setNotice({
            kind: "refused",
            sentence: fill(c.waitlist.joinRefusal[r.refusalKey], { left: r.seatsRemaining ?? 0 }),
          });
          return false;
        }
        setNotice({ kind: "done", sentence: fill(c.waitlist.join.joined, { name: joinName.trim() }) });
        setJoinFor(null);
        setJoinName("");
        setJoinEmail("");
        return true;
      },
    );

  /* ── Walk-in ───────────────────────────────────────────────────────── */

  const chooseService = (id: string) => {
    setServiceId(id);
    setSlotIso("");
    if (!id) {
      setSlots({ status: "idle" });
      return;
    }
    setSlots({ status: "loading" });
    void classesWalkInSlots({ offeringId: id, dayOffset: day.dayOffset }).then(
      (r) => {
        if (!r.ok) {
          setSlots({ status: "empty", sentence: c.refusal[r.reason === "not_allowed" || r.reason === "invalid" ? actionRefusalKey(r.reason) : slotsRefusalKey(r.reason)] });
          return;
        }
        if (r.starts.length === 0) {
          setSlots({ status: "empty", sentence: c.refusal[r.emptyReason ? noSlotsKey(r.emptyReason) : "closedToday"] });
          return;
        }
        setSlots({ status: "ready", starts: r.starts });
      },
      () => setSlots({ status: "empty", sentence: c.refusal.unavailable }),
    );
  };

  const afterWalkIn = (r: ClassesWalkInResult, sentence: string): boolean => {
    if (!r.ok) {
      if (r.reason === "not_allowed" || r.reason === "unavailable") {
        refuse(actionRefusalKey(r.reason));
      } else if (kind === "seat") {
        // The seat path runs the Counter's draft commands; its words are the
        // Counter's and so are its sentences.
        const counter = refusalFromResult({ ok: false, reason: r.reason }, "sale");
        if (counter) setNotice({ kind: "counter", reason: counter });
        else refuse("couldNotBook");
      } else {
        refuse(walkInRefusalKey(r.reason));
      }
      return false;
    }
    setSale({ orderId: r.orderId, version: r.version, outstandingCents: r.outstandingCents, currency: r.currency });
    setOutcome({ stage: "booked", sentence, outstandingCents: r.outstandingCents, currency: r.currency });
    return true;
  };

  const book = () => {
    if (kind === "appointment") {
      const service = props.services.find((s) => s.offeringId === serviceId);
      if (!service || !slotIso) return;
      void run(
        () => classesBookWalkIn({ offeringId: serviceId, startsAt: slotIso, name, email, phone, attemptKey }),
        (r) => afterWalkIn(r, fill(c.walkin.booked, { when: formatWhen(slotIso, day.timeZone, props.locale) })),
      );
      return;
    }
    const session = day.sessions.find((s) => s.id === sessionId);
    if (!session || !session.offeringId) return;
    const tier = session.tiers.length === 1 ? session.tiers[0] : session.tiers.find((t) => t.variantId === tierId);
    if (session.tiers.length > 1 && !tier) return;
    void run(
      () => classesHoldSeat({ sessionId: session.id, offeringId: session.offeringId ?? "", variantId: tier?.variantId ?? null }),
      (r) => afterWalkIn(r, fill(c.walkin.seatBooked, { session: session.title })),
    );
  };

  const collectWalkIn = () => {
    if (!sale) return;
    void collectCash(sale).then((r) => {
      if (r && r.ok) {
        setOutcome({ stage: "collected", sentence: fill(c.walkin.collected, { amount: formatOrderMoney(sale.outstandingCents, sale.currency) }) });
      }
    });
  };

  const startAgain = () => {
    setOutcome(null);
    setSale(null);
    setSlotIso("");
    setSlots({ status: "idle" });
    setServiceId("");
    setSessionId("");
    setTierId("");
    setName("");
    setEmail("");
    setPhone("");
    setNotice(null);
    setAttemptKey(`walkin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  };

  /* ── Screens ───────────────────────────────────────────────────────── */

  const dayLabel =
    day.dayOffset === 0 ? c.day.today : day.dayOffset === 1 ? c.day.tomorrow : day.dayOffset === -1 ? c.day.yesterday : formatDay(day.ymd, props.locale);

  const screen =
    destination === "today" ? (
      <TodayPanel
        rows={day.appointments}
        timeZone={day.timeZone}
        locale={props.locale}
        copy={c}
        busy={busy}
        moving={moving}
        moveValue={moveValue}
        onMoveValueChange={setMoveValue}
        onCheckIn={checkIn}
        onOpenMove={(row) => {
          setMoving(row.id);
          setMoveValue(venueLocalInputValue(row.startsAt, day.timeZone));
          setNotice(null);
        }}
        onSubmitMove={submitMove}
        onCancelMove={() => setMoving(null)}
        onCollect={collectRow}
      />
    ) : destination === "sessions" ? (
      <SessionsPanel
        sessions={day.sessions}
        timeZone={day.timeZone}
        locale={props.locale}
        copy={c}
        busy={busy}
        onMark={mark}
        onBookSeat={(session) => {
          setKind("seat");
          setSessionId(session.id);
          setTierId(session.tiers.length === 1 ? (session.tiers[0]?.variantId ?? "") : "");
          setDestination("walkin");
        }}
        onOpenQueue={(session) => {
          setJoinFor(session.id);
          setDestination("waitlist");
        }}
      />
    ) : destination === "waitlist" ? (
      <WaitlistPanel
        sessions={day.sessions}
        timeZone={day.timeZone}
        locale={props.locale}
        copy={c}
        busy={busy}
        joinFor={joinFor}
        joinName={joinName}
        joinEmail={joinEmail}
        onJoinNameChange={setJoinName}
        onJoinEmailChange={setJoinEmail}
        onOpenJoin={(session) => setJoinFor(session.id)}
        onSubmitJoin={join}
        onPromote={promote}
        onAccept={accept}
      />
    ) : (
      <WalkInPanel
        kind={kind}
        onKindChange={(next) => {
          setKind(next);
          setNotice(null);
        }}
        services={props.services}
        sessions={day.sessions}
        serviceId={serviceId}
        onServiceChange={chooseService}
        slots={slots}
        slotIso={slotIso}
        onSlotChange={setSlotIso}
        sessionId={sessionId}
        onSessionChange={(id) => {
          setSessionId(id);
          const s = day.sessions.find((row) => row.id === id);
          setTierId(s && s.tiers.length === 1 ? (s.tiers[0]?.variantId ?? "") : "");
        }}
        tierId={tierId}
        onTierChange={setTierId}
        name={name}
        email={email}
        phone={phone}
        onNameChange={setName}
        onEmailChange={setEmail}
        onPhoneChange={setPhone}
        timeZone={day.timeZone}
        locale={props.locale}
        currency={props.currency}
        copy={c}
        busy={busy}
        outcome={outcome}
        onBook={book}
        onCollect={collectWalkIn}
        onStartAgain={startAgain}
      />
    );

  return (
    <div className="flex min-h-[calc(100vh-56px)] w-full flex-col">
      <PosFrame
        mode="classes"
        navLabel={copy.frame.navLabel}
        activeDestination={destination}
        onSelectDestination={(id) => {
          setDestination(parseDestination(id));
          setNotice(null);
        }}
        destinationLabels={copy.frame.destinationLabels}
        className="flex-1 rounded-none border-0"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{props.workspaceName}</p>
            <h1 className="m-0 text-base font-semibold text-foreground">{c.title}</h1>
            <p className="m-0 text-sm text-muted-foreground" data-pos-classes-day={day.ymd} data-pos-classes-zone={day.timeZone}>
              {dayLabel} · {fill(c.day.clock, { date: formatDay(day.ymd, props.locale), zone: day.timeZone })}
            </p>
          </div>
          <nav className="flex gap-2" aria-label={c.title}>
            <button type="button" className={`${POS_SECONDARY_ACTION} h-11 min-w-0 px-4`} onClick={() => router.push(dayHref(day.dayOffset - 1))}>
              {c.day.prev}
            </button>
            {day.dayOffset !== 0 && (
              <button type="button" className={`${POS_SECONDARY_ACTION} h-11 min-w-0 px-4`} onClick={() => router.push(dayHref(0))}>
                {c.day.backToToday}
              </button>
            )}
            <button type="button" className={`${POS_SECONDARY_ACTION} h-11 min-w-0 px-4`} onClick={() => router.push(dayHref(day.dayOffset + 1))}>
              {c.day.next}
            </button>
            <button type="button" className={`${POS_SECONDARY_ACTION} h-11 min-w-0 px-4`} onClick={() => router.refresh()}>
              {c.day.reload}
            </button>
          </nav>
        </header>
        {notice && (
          <div className="px-4 pt-4">
            {notice.kind === "counter" ? (
              <PosRefusalBanner
                reason={notice.reason}
                copy={copy.counterRefusal}
                onRetry={() => {
                  setNotice(null);
                  router.refresh();
                }}
              />
            ) : (
              <ClassesNotice kind={notice.kind}>{notice.sentence}</ClassesNotice>
            )}
          </div>
        )}
        <h2 className="m-0 px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {destination === "today"
            ? c.today.heading
            : destination === "sessions"
              ? c.sessions.heading
              : destination === "waitlist"
                ? c.waitlist.heading
                : c.walkin.heading}
        </h2>
        {screen}
      </PosFrame>
    </div>
  );
}
