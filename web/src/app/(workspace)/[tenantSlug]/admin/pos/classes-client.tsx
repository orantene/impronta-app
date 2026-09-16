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

import { POS_MESSAGES_DESTINATION, posMessagesHref } from "@/lib/pos/modes";

import {
  PosFrame,
  PosRefusalBanner,
  type PosChromeCopy,
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
import { joinSessionWaitlist } from "@/lib/scheduling/appointments-actions";

import type { PaymentLinkCopy } from "@/components/admin/pos/PaymentLinkPanel";

import { posAddLine, posLoadSale, posStartCollection } from "./actions";
import { classesCheckIn, classesMarkAttendance } from "./classes-actions";
import { BookingFlow } from "./classes-booking";
import { CheckinStrip, SessionCheckIn } from "./classes-checkin";
import { ClassesHeader } from "./classes-header";
import { fill, formatClock, formatWhen } from "./classes-format";
import { MoveSheet } from "./classes-move";
import { useMove } from "./classes-move-state";
import { AppointmentLinkSheet, ClassesNotice, WaitlistPanel, WalkInSheet, type WalkInService } from "./classes-panels";
import {
  AddExtraSheet,
  AppointmentDetail,
  TodayList,
  type SaleDetail,
  type TodaySegment,
  type TodayTab,
} from "./classes-today";
import { useClassesWaitlist } from "./classes-waitlist";
import { useWalkIn } from "./classes-walkin-state";
import { posCollectionKey } from "./counter-model";

type Destination = "today" | "sessions" | "walkin" | "waitlist";

export type ClassesClientProps = {
  tenantId: string;
  /** The Messages inbox's unread count: the rail's `messages` badge (seam 10). */
  messagesUnread?: number;
  workspaceName: string;
  /** The venue the day is read on, when the workspace names one. */
  venueName: string | null;
  operatorName: string;
  posPath: string;
  /** The door back out of the till (the rail's Workspace row). */
  workspacePath: string;
  /** The MODE chip's label ("Front desk"), translated. */
  modeLabel: string;
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
    /** `dashboard.pos.engine.refusal.*`, for the queue's offers (D-POS-68). */
    engineRefusal: Readonly<Record<string, string>>;
    paymentLink: PaymentLinkCopy;
    /** The till's chrome words (Mode, Lock, Workspace), the Counter's own. */
    chrome: PosChromeCopy;
  };
  /** What `/pay/<code>` does on this workspace (`PaymentLinkPanel`). */
  linkProvider: "stripe" | "mock";
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
  const [extraFor, setExtraFor] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<string | null>(null);

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

  /* ── Move (A09) ────────────────────────────────────────────────────── */

  const move = useMove({
    tenantId: props.tenantId,
    day,
    locale: props.locale,
    copy: c,
    run,
    refuse,
    setNotice,
  });

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
    move.close();
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

  const queue = useClassesWaitlist({
    copy: c,
    engineRefusal: copy.engineRefusal,
    formatWhen: (iso) => formatWhen(iso, day.timeZone, props.locale),
    run,
    setNotice,
  });
  const promote = queue.offer;
  const accept = queue.accept;

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

  // B05 fills the content area: the list steps aside while a class is open
  // for check-in, and the rail's Sessions row brings it back.
  const checkinOpen = segment === "classes" && selectedSession !== null;
  const minutes = selectedSession ? Math.round((Date.parse(selectedSession.startsAt) - Date.parse(props.nowIso)) / 60_000) : 0;
  const twoPane = (
    <div className="relative flex min-h-0 flex-1">
      {checkinOpen ? null : (
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
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {segment === "classes" ? (
          selectedSession ? (
            <SessionCheckIn
              session={selectedSession}
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
            extras={props.extras}
            timeZone={day.timeZone}
            locale={props.locale}
            copy={c}
            busy={busy}
            onCheckIn={checkIn}
            onOpenMove={move.open}
            onCollect={collectRow}
            onAddExtra={() => setExtraFor(selected.id)}
            onSendLink={(row) => setLinkFor(row.id)}
          >
            {move.bookingId === selected.id ? (
              <MoveSheet
                row={selected}
                sale={sale.status === "ready" ? sale.sale : null}
                dayYmd={day.ymd}
                viewedOffset={day.dayOffset}
                dayOffset={move.dayOffset}
                slots={move.slots}
                slotIso={move.slotIso}
                manual={move.manual}
                chosenIso={move.chosenIso}
                timeZone={day.timeZone}
                locale={props.locale}
                copy={c}
                busy={busy}
                onDay={move.pickDay}
                onSlot={move.pickSlot}
                onManual={move.typeManual}
                onKeep={move.close}
                onMove={() => move.submit(selected)}
              />
            ) : null}
          </AppointmentDetail>
        ) : (
          <p className="m-0 p-[20px] font-admin-body text-[15px] text-admin-ink-muted">
            {b.list.pickOne}
          </p>
        )}
      </div>
      {destination === "walkin" && walkIn.intent === "walkin" ? (
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
      {linkFor && selected && selected.id === linkFor ? (
        <AppointmentLinkSheet
          row={selected}
          workspaceName={props.workspaceName}
          provider={props.linkProvider}
          timeZone={day.timeZone}
          locale={props.locale}
          engineRefusal={copy.engineRefusal}
          copy={copy.paymentLink}
          closeLabel={c.board.sheet.close}
          onClose={() => setLinkFor(null)}
        />
      ) : null}
      {extraFor && selected && selected.id === extraFor ? (
        <AddExtraSheet
          row={selected}
          sale={sale.status === "ready" ? sale.sale : null}
          extras={props.extras}
          copy={c}
          currency={props.currency}
          timeZone={day.timeZone}
          locale={props.locale}
          busy={busy}
          onAdd={(extra) => addExtra(selected, extra)}
          onClose={() => setExtraFor(null)}
        />
      ) : null}
    </div>
  );

  // The header is the screen's: the day and its counts on Today, the class
  // and "starts in N min" while a check-in is open (B05).
  const startsLine = minutes >= 0 ? fill(b.checkin.startsIn, { minutes }) : fill(b.checkin.startedAgo, { minutes: -minutes });
  // A01 to A06: the Book door is its own screen, not a sheet over the list.
  const bookingOpen = destination === "walkin" && walkIn.intent === "book";
  const [bookingStep, setBookingStep] = useState<string>("service");
  // A02 to A06: the subtitle accumulates what the flow has settled (the
  // customer, the time, the person), as the boards' header lines do.
  const bookingService = props.services.find((s) => s.offeringId === walkIn.serviceId) ?? null;
  const bookingWhen = walkIn.slotIso ? formatWhen(walkIn.slotIso, day.timeZone, props.locale) : null;
  const bookingName = walkIn.name.trim();
  const headerTitle = bookingOpen
    ? walkIn.outcome && bookingName
      ? fill(b.booking.titleBooked, { name: bookingName })
      : bookingStep === "review"
        ? b.booking.titleReview
        : b.booking.title
    : checkinOpen && selectedSession
      ? `${selectedSession.title} · ${formatClock(selectedSession.startsAt, day.timeZone, props.locale)}`
      : c.title;
  const headerSubtitle = bookingOpen
    ? walkIn.outcome && bookingWhen && bookingService
      ? fill(b.booking.subtitleBooked, { when: bookingWhen, name: bookingService.personName })
      : [bookingName || b.booking.subtitleNew, bookingWhen, bookingService?.personName ?? null, bookingService ? (props.venueName ?? props.workspaceName) : null]
          .filter((part): part is string => Boolean(part))
          .join(" · ")
    : checkinOpen
      ? `${props.venueName ?? props.workspaceName} · ${startsLine}`
      : null;

  return (
    <div className="flex h-[calc(100vh-var(--proto-cbar,50px))] min-h-[560px] w-full flex-col overflow-hidden">
      <PosFrame
        mode="classes"
        navLabel={copy.frame.navLabel}
        activeDestination={destination}
        onSelectDestination={(id) => {
          if (id === POS_MESSAGES_DESTINATION) {
            router.push(posMessagesHref("classes"));
            return;
          }
          if (walkIn.settled) walkIn.startAgain();
          const next = parseDestination(id);
          if (next === "walkin") {
            openWalkIn("walkin");
            return;
          }
          // The Sessions row from an open check-in is the way back to the list.
          if (next === "sessions" && destination === "sessions" && selectedSessionId) setSelectedSessionId(null);
          setDestination(next);
          setNotice(null);
        }}
        destinationLabels={copy.frame.destinationLabels}
        counts={{ messages: props.messagesUnread ?? 0 }}
        modeLabel={props.modeLabel}
        modeEyebrow={copy.chrome.modeEyebrow}
        lock={{ label: copy.chrome.lock, disabledReason: copy.chrome.lockUnavailable }}
        workspace={{ label: copy.chrome.workspace, href: props.workspacePath }}
        className="flex-1 rounded-none border-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <ClassesHeader
            title={headerTitle}
            subtitle={headerSubtitle}
            summary={summary}
            day={day}
            copy={c}
            locationName={props.venueName ?? props.workspaceName}
            operatorName={props.operatorName}
            onDay={(offset) => router.push(dayHref(offset))}
            onReload={() => router.refresh()}
          />
          {checkinOpen && selectedSession ? <CheckinStrip session={selectedSession} copy={c} /> : null}
          {notice ? (
            <div className="px-[22px] pt-[12px]">
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
          {bookingOpen ? (
            <BookingFlow
              onStep={setBookingStep}
              day={day}
              venueName={props.venueName ?? props.workspaceName}
              services={props.services}
              serviceId={walkIn.serviceId}
              onService={walkIn.chooseService}
              slotsDay={walkIn.slotsDay}
              onDay={walkIn.pickDay}
              slots={walkIn.slots}
              slotIso={walkIn.slotIso}
              onSlot={walkIn.setSlotIso}
              name={walkIn.name}
              email={walkIn.email}
              phone={walkIn.phone}
              onName={walkIn.setName}
              onEmail={walkIn.setEmail}
              onPhone={walkIn.setPhone}
              outcome={walkIn.outcome}
              timeZone={day.timeZone}
              locale={props.locale}
              currency={props.currency}
              copy={c}
              busy={busy}
              onBook={walkIn.book}
              onCollect={walkIn.collect}
              onStartAgain={walkIn.startAgain}
              onClose={closeWalkIn}
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
              onDecline={queue.decline}
            />
          ) : (
            twoPane
          )}
        </div>
      </PosFrame>
    </div>
  );
}
