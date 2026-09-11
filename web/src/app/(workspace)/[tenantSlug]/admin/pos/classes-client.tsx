"use client";

/**
 * ClassesClient — the Appointments & Classes mode ("Front desk"), wired, as
 * boards B01 to B06 draw it: the day's list on the left with the selected
 * appointment or class on the right, the Walk-in sheet, the Add-extra
 * sheet, the class check-in, the "A place opened up" dialog, the waitlist.
 *
 * SAME DISCIPLINE AS THE COUNTER (`pos-client.tsx`). Every pixel is a prop the
 * server resolved or a value the operator just typed; every write goes
 * through a server action and comes back as data; every refusal becomes a
 * sentence from the catalogue before it reaches the screen. No `useEffect`:
 * the day is read on the server and re-read with `router.refresh()` after
 * each write. The two fetches an operator triggers by hand, the free times
 * for a chosen service and the sale behind a selected appointment, run in
 * the handler that chose it.
 *
 * THE MONEY IS THE COUNTER'S. `posStartCollection` with `posCollectionKey`
 * (derived, never minted per tap) and the sale's `expectedVersion`; an extra
 * added at the chair is the Counter's `posAddLine` on the same sale.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  PosFrame,
  PosRefusalBanner,
  type PosRefusalCopy,
  type PosRefusalReason,
} from "@/components/admin/pos";
import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type {
  ClassesAppointment,
  ClassesDay,
  ClassesSession,
} from "@/lib/pos/classes/day";
import type { ClassesExtra } from "@/lib/pos/classes/extras";
import {
  actionRefusalKey,
  attendanceRefusalKey,
  checkInRefusalKey,
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

import { posAddLine, posLoadSale, posStartCollection } from "./actions";
import { classesCheckIn, classesMarkAttendance } from "./classes-actions";
import { SessionCheckIn } from "./classes-checkin";
import { fill, formatWhen, venueLocalInputValue } from "./classes-format";
import { ClassesNotice, WaitlistPanel, WalkInSheet, type WalkInService } from "./classes-panels";
import {
  AddExtraSheet,
  AppointmentDetail,
  TodayList,
  type SaleDetail,
  type TodaySegment,
  type TodayTab,
} from "./classes-today";
import { PosAction } from "./classes-ui";
import { useWalkIn } from "./classes-walkin-state";
import { posCollectionKey } from "./counter-model";

type Destination = "today" | "sessions" | "walkin" | "waitlist";

export type ClassesClientProps = {
  tenantId: string;
  workspaceName: string;
  /** The venue the day is read on, when the workspace names one. */
  venueName: string | null;
  operatorName: string;
  posPath: string;
  locale: string;
  currency: string;
  /** The server's clock at render, ISO; "starts in N min" reads it, never the browser's. */
  nowIso: string;
  day: ClassesDay;
  services: readonly WalkInService[];
  extras: readonly ClassesExtra[];
  copy: {
    frame: {
      navLabel: string;
      destinationLabels: Readonly<Record<string, string>>;
    };
    classes: ClassesCopy;
    counterRefusal: PosRefusalCopy;
  };
};

type Notice =
  | { kind: "refused"; sentence: string }
  | { kind: "done"; sentence: string }
  | { kind: "counter"; reason: PosRefusalReason };

function parseDestination(raw: string): Destination {
  return raw === "sessions" || raw === "walkin" || raw === "waitlist"
    ? raw
    : "today";
}

export function ClassesClient(props: ClassesClientProps) {
  const router = useRouter();
  const { copy, day } = props;
  const c = copy.classes;

  const [destination, setDestination] = useState<Destination>("today");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Today
  const [tab, setTab] = useState<TodayTab>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [sale, setSale] = useState<SaleDetail>({ status: "idle" });
  const [moving, setMoving] = useState<string | null>(null);
  const [moveValue, setMoveValue] = useState("");
  const [extraFor, setExtraFor] = useState<string | null>(null);

  // Waitlist
  const [joinFor, setJoinFor] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");

  const dayHref = (offset: number) =>
    `${props.posPath}?mode=classes&day=${offset}`;
  const segment: TodaySegment =
    destination === "sessions" ? "classes" : "appts";
  const selected = day.appointments.find((r) => r.id === selectedId) ?? null;
  const selectedSession =
    day.sessions.find((s) => s.id === selectedSessionId) ?? null;

  const refuse = useCallback(
    (key: ClassesRefusalKey) =>
      setNotice({ kind: "refused", sentence: c.refusal[key] }),
    [c.refusal],
  );

  /** Run one command; on success re-read the day so the screen is the rows. */
  const run = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      after: (result: T) => boolean,
    ): Promise<T | null> => {
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

  /** The sale behind an appointment, read when the operator opens it. */
  const readSale = (row: ClassesAppointment) => {
    if (!row.orderId) {
      setSale({ status: "idle" });
      return;
    }
    setSale({ status: "loading" });
    void posLoadSale(row.orderId).then(
      (r) =>
        setSale(
          r.ok ? { status: "ready", sale: r.sale } : { status: "unreadable" },
        ),
      () => setSale({ status: "unreadable" }),
    );
  };

  const select = (row: ClassesAppointment) => {
    setSelectedId(row.id);
    setMoving(null);
    setNotice(null);
    readSale(row);
  };

  const checkIn = (row: ClassesAppointment) =>
    void run(
      () => classesCheckIn({ bookingId: row.id, expectedState: row.state }),
      (r) => {
        if (!r.ok) {
          refuse(
            r.reason === "not_allowed" || r.reason === "invalid"
              ? actionRefusalKey(r.reason)
              : checkInRefusalKey(r.reason),
          );
          return false;
        }
        setNotice({
          kind: "done",
          sentence: `${row.customerName ?? c.today.nobody}: ${c.today.arrived}`,
        });
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
    const instant = zonedLocalToUtc(
      parsed.ymd,
      parsed.minutesOfDay,
      day.timeZone,
    );
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
            sentence: fillRefusalSentence(
              c.reschedule.refusal[r.refusal.key],
              r.refusal.params,
            ),
          });
          return false;
        }
        setMoving(null);
        setNotice({
          kind: "done",
          sentence: r.already
            ? c.reschedule.already
            : fill(c.reschedule.moved, {
                when: formatWhen(r.startsAt, day.timeZone, props.locale),
              }),
        });
        return true;
      },
    );
  };

  /**
   * THE CHARGE, the Counter's. Key derived from the sale, version carried,
   * whole outstanding balance, cash tendered exactly.
   */
  const collectCash = (
    target: { orderId: string; version: number; outstandingCents: number },
    // The walk-in form's own contact rides with the walk-in's collection and
    // with nothing else: a booking made elsewhere already names its customer.
    contact?: { name: string; email: string; phone: string },
  ) =>
    run(
      () =>
        posStartCollection({
          orderId: target.orderId,
          method: "cash",
          email: contact?.email.trim() || undefined,
          phone: contact?.phone.trim() || undefined,
          displayName: contact?.name.trim() || undefined,
          amountCents:
            target.outstandingCents > 0 ? target.outstandingCents : undefined,
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
    void collectCash({
      orderId: row.orderId,
      version: row.orderVersion,
      outstandingCents: row.outstandingCents,
    }).then((r) => {
      if (r && r.ok) {
        setNotice({
          kind: "done",
          sentence: fill(c.walkin.collected, {
            amount: formatOrderMoney(row.outstandingCents, row.currency),
          }),
        });
        readSale(row);
      }
    });
  };

  /** B02: one more line on the appointment's own sale, the sale's version carried. */
  const addExtra = (row: ClassesAppointment, extra: ClassesExtra) => {
    if (!row.orderId) return;
    const version =
      sale.status === "ready"
        ? sale.sale.version
        : (row.orderVersion ?? undefined);
    void run(
      () =>
        posAddLine({
          orderId: row.orderId ?? "",
          offeringId: extra.offeringId,
          units: 1,
          expectedVersion: version,
        }),
      (r) => {
        const refused = refusalFromResult(r, "sale");
        if (refused) {
          setNotice({ kind: "counter", reason: refused });
          return false;
        }
        setExtraFor(null);
        setNotice({
          kind: "done",
          sentence: fill(c.board.extra.added, { item: extra.title }),
        });
        readSale(row);
        return true;
      },
    );
  };

  /* ── Sessions ──────────────────────────────────────────────────────── */

  const mark = (admissionId: string) =>
    void run(
      () => classesMarkAttendance({ admissionId }),
      (r) => {
        if (!r.ok) {
          refuse(
            r.reason === "not_allowed"
              ? actionRefusalKey(r.reason)
              : attendanceRefusalKey(r.reason),
          );
          return false;
        }
        setNotice({ kind: "done", sentence: c.sessions.here });
        return true;
      },
    );

  /* ── Waitlist ──────────────────────────────────────────────────────── */

  const promote = (session: ClassesSession, entry: WaitlistEntry) =>
    void run(
      () =>
        promoteFromWaitlist({
          tenantId: props.tenantId,
          entryId: entry.id,
          expectedStatus: entry.status,
        }),
      (r) => {
        if (!r.ok) {
          setNotice({
            kind: "refused",
            sentence: c.waitlist.promoteRefusal[r.refusalKey],
          });
          return false;
        }
        setNotice({
          kind: "done",
          sentence: r.already
            ? fill(c.waitlist.alreadyOffered, { name: entry.customerName })
            : fill(c.waitlist.promoted, {
                name: entry.customerName,
                when: r.offerExpiresAt
                  ? formatWhen(r.offerExpiresAt, day.timeZone, props.locale)
                  : "",
              }),
        });
        return true;
      },
    );

  const accept = (session: ClassesSession, entry: WaitlistEntry) =>
    void run(
      () =>
        acceptWaitlistPlace({
          tenantId: props.tenantId,
          entryId: entry.id,
          expectedStatus: entry.status,
        }),
      (r) => {
        if (!r.ok) {
          setNotice({
            kind: "refused",
            sentence: c.waitlist.acceptRefusal[r.refusalKey],
          });
          return false;
        }
        setNotice({
          kind: "done",
          sentence: fill(c.waitlist.accepted, { name: entry.customerName }),
        });
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
            sentence: fill(c.waitlist.joinRefusal[r.refusalKey], {
              left: r.seatsRemaining ?? 0,
            }),
          });
          return false;
        }
        setNotice({
          kind: "done",
          sentence: fill(c.waitlist.join.joined, { name: joinName.trim() }),
        });
        setJoinFor(null);
        setJoinName("");
        setJoinEmail("");
        return true;
      },
    );

  /* ── Walk-in ───────────────────────────────────────────────────────── */

  const walkIn = useWalkIn({
    day,
    services: props.services,
    locale: props.locale,
    copy: c,
    run,
    refuse,
    setNotice,
    collectCash,
    refreshDay: () => router.refresh(),
  });

  const openWalkIn = (next: "walkin" | "book", seat?: ClassesSession) => {
    walkIn.prepare(next, seat);
    setNotice(null);
    setDestination("walkin");
  };

  const closeWalkIn = () => {
    if (walkIn.settled) walkIn.startAgain();
    setDestination(walkIn.kind === "seat" && selectedSessionId ? "sessions" : "today");
  };

  /* ── Screens ───────────────────────────────────────────────────────── */

  const b = c.board;
  // "Tue 8 Sep", the board's order, whatever the locale's default order is.
  const dayParts = new Intl.DateTimeFormat(props.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).formatToParts(new Date(`${day.ymd}T12:00:00.000Z`));
  const dayPart = (type: string) =>
    dayParts.find((x) => x.type === type)?.value ?? "";
  const dayLabel = `${dayPart("weekday")} ${dayPart("day")} ${dayPart("month").replace(/\.$/, "")}`;
  const summary = fill(b.header.summary, {
    date: dayLabel,
    appointments: day.appointments.length,
    classes: day.sessions.length,
  });

  const twoPane = (
    <div className="relative flex min-h-0 flex-1">
      <TodayList
        rows={day.appointments}
        sessions={day.sessions}
        tab={tab}
        segment={segment}
        selectedId={selectedId}
        selectedSessionId={selectedSessionId}
        timeZone={day.timeZone}
        locale={props.locale}
        copy={c}
        onTab={setTab}
        onSegment={(next) =>
          setDestination(next === "classes" ? "sessions" : "today")
        }
        onSelect={select}
        onSelectSession={(session) => {
          setSelectedSessionId(session.id);
          setNotice(null);
        }}
        onWalkIn={() => openWalkIn("walkin")}
        onBook={() => openWalkIn("book")}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {segment === "classes" ? (
          selectedSession ? (
            <SessionCheckIn
              session={selectedSession}
              nowIso={props.nowIso}
              timeZone={day.timeZone}
              locale={props.locale}
              copy={c}
              busy={busy}
              onMark={mark}
              onBookSeat={(session) => openWalkIn("walkin", session)}
              onOpenQueue={(session) => {
                setJoinFor(session.id);
                setDestination("waitlist");
              }}
              onOfferPlace={promote}
            />
          ) : (
            <p className="m-0 p-[20px] font-admin-body text-[15px] text-admin-ink-muted">
              {b.list.pickSession}
            </p>
          )
        ) : selected ? (
          <AppointmentDetail
            row={selected}
            sale={sale}
            timeZone={day.timeZone}
            locale={props.locale}
            copy={c}
            busy={busy}
            moving={moving === selected.id}
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
            onAddExtra={() => setExtraFor(selected.id)}
          />
        ) : (
          <p className="m-0 p-[20px] font-admin-body text-[15px] text-admin-ink-muted">
            {b.list.pickOne}
          </p>
        )}
      </div>
      {destination === "walkin" ? (
        <WalkInSheet
          intent={walkIn.intent}
          kind={walkIn.kind}
          onKindChange={(next) => {
            walkIn.setKind(next);
            setNotice(null);
          }}
          services={props.services}
          sessions={day.sessions}
          serviceId={walkIn.serviceId}
          onServiceChange={walkIn.chooseService}
          slots={walkIn.slots}
          slotIso={walkIn.slotIso}
          onSlotChange={walkIn.setSlotIso}
          sessionId={walkIn.sessionId}
          onSessionChange={walkIn.chooseSession}
          tierId={walkIn.tierId}
          onTierChange={walkIn.setTierId}
          name={walkIn.name}
          email={walkIn.email}
          phone={walkIn.phone}
          onNameChange={walkIn.setName}
          onEmailChange={walkIn.setEmail}
          onPhoneChange={walkIn.setPhone}
          timeZone={day.timeZone}
          locale={props.locale}
          currency={props.currency}
          copy={c}
          busy={busy}
          outcome={walkIn.outcome}
          onBook={walkIn.book}
          onCollect={walkIn.collect}
          onStartAgain={walkIn.startAgain}
          onClose={closeWalkIn}
        />
      ) : null}
      {extraFor && selected && selected.id === extraFor ? (
        <AddExtraSheet
          row={selected}
          sale={sale.status === "ready" ? sale.sale : null}
          extras={props.extras}
          copy={c}
          currency={props.currency}
          busy={busy}
          onAdd={(extra) => addExtra(selected, extra)}
          onClose={() => setExtraFor(null)}
        />
      ) : null}
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-var(--proto-cbar,50px))] min-h-[560px] w-full flex-col overflow-hidden">
      <PosFrame
        mode="classes"
        navLabel={copy.frame.navLabel}
        activeDestination={destination}
        onSelectDestination={(id) => {
          if (walkIn.settled) walkIn.startAgain();
          const next = parseDestination(id);
          if (next === "walkin") {
            openWalkIn("walkin");
            return;
          }
          setDestination(next);
          setNotice(null);
        }}
        destinationLabels={copy.frame.destinationLabels}
        className="flex-1 rounded-none border-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-[12px] border-b border-admin-border px-[20px] py-[12px]">
            <div className="min-w-0">
              <h1 className="m-0 font-admin-body text-[22px] font-semibold leading-[1.15] text-admin-ink">
                {c.title}
              </h1>
              <p
                className="m-0 flex items-center gap-[8px] font-admin-body text-[14px] text-admin-ink-muted"
                data-pos-classes-day={day.ymd}
                data-pos-classes-zone={day.timeZone}
              >
                <button
                  type="button"
                  aria-label={c.day.prev}
                  className="cursor-pointer rounded-[6px] px-[4px] text-admin-ink-dim hover:text-admin-ink"
                  onClick={() => router.push(dayHref(day.dayOffset - 1))}
                >
                  ‹
                </button>
                <span>{summary}</span>
                <button
                  type="button"
                  aria-label={c.day.next}
                  className="cursor-pointer rounded-[6px] px-[4px] text-admin-ink-dim hover:text-admin-ink"
                  onClick={() => router.push(dayHref(day.dayOffset + 1))}
                >
                  ›
                </button>
                {day.dayOffset !== 0 ? (
                  <button
                    type="button"
                    className="cursor-pointer text-[13px] font-semibold text-admin-brand underline underline-offset-2"
                    onClick={() => router.push(dayHref(0))}
                  >
                    {c.day.backToToday}
                  </button>
                ) : null}
                <span className="text-admin-ink-dim">· {day.timeZone}</span>
              </p>
            </div>
            <div className="flex items-center gap-[8px]">
              <span
                className="inline-flex h-[44px] items-center gap-[8px] rounded-[12px] border border-admin-border bg-admin-card px-[14px] font-admin-body text-[15px] font-semibold text-admin-ink"
                title={b.header.location}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-admin-ink-muted"
                >
                  <path d="M12 21s7-6.5 7-11.5a7 7 0 0 0-14 0C5 14.5 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
                {props.venueName ?? props.workspaceName}
              </span>
              <span
                className="inline-flex h-[44px] items-center gap-[8px] rounded-[12px] border border-admin-border bg-admin-card px-[10px] pr-[14px] font-admin-body text-[15px] font-semibold text-admin-ink"
                title={b.header.operator}
              >
                <span className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-admin-indigo-soft text-[11px] font-bold text-admin-indigo">
                  {initialsOf(props.operatorName)}
                </span>
                {props.operatorName}
              </span>
              <PosAction className="h-[44px]" onClick={() => router.refresh()}>
                {c.day.reload}
              </PosAction>
            </div>
          </header>
          {notice ? (
            <div className="px-[20px] pt-[12px]">
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
                <ClassesNotice kind={notice.kind}>
                  {notice.sentence}
                </ClassesNotice>
              )}
            </div>
          ) : null}
          {destination === "waitlist" ? (
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
            twoPane
          )}
        </div>
      </PosFrame>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return (
    `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`.toUpperCase() ||
    "·"
  );
}
