"use client";

/**
 * DoorClient — the Door mode ("Tickets and admissions"), wired.
 *
 * TWO SCREENS ON ONE RAIL. `checkin` is the gate (G01 to G07 of the design):
 * tonight's events with admitted against capacity, one scan field, one
 * verdict, the guest list with a tap-to-admit, and the walk-up who pays at
 * the door. `tickets` is the box office (G06): sell a ticket at this till and
 * hand over the code the holder shows at the gate. Both sell through ONE
 * panel (`TicketSalePanel`), which differs only in whether the person is
 * admitted the moment the cash is confirmed.
 *
 * THE VERDICT COMES FROM THE ENGINE AND NOWHERE ELSE. A scan goes to
 * Sessions' `scanAdmission`, a tap to Events' `admitAtDoor`; the outcome is
 * mapped by `doorVerdict` (pure, tested) onto a sentence key and rendered
 * once, in the language of the request. Green is `tone === "in"`, which is
 * exactly `doorAdmits(outcome)`: no branch here decides admission.
 *
 * REFUSALS ARE SENTENCES. Money refusals go through `refusalFromResult` and
 * `PosRefusalBanner`, the counter's own path; door refusals through the
 * verdict box. An engine word never reaches the screen.
 *
 * NO EFFECTS. Tonight's list is a prop the server resolved. Everything else
 * this screen shows is a value the operator asked for by tapping: choosing an
 * event loads its door, opening a sale creates it. Nothing synchronises after
 * mount, so there is no `useEffect` here, for the same reason the counter has
 * none.
 *
 * THE CLOCK IS THE VENUE'S. Every time printed goes through `venueClock`
 * with the workspace's zone, and the header says so.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CollectSheet,
  PosFrame,
  PosRefusalBanner,
  type PosCollectionMethodId,
  type PosCollectionMethodState,
  type PosRefusalCopy,
  type PosRefusalReason,
} from "@/components/admin/pos";
import type { CollectSheetCopy } from "@/components/admin/pos";
import {
  POS_INPUT,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
  POS_SURFACE,
} from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { doorVerdict, matchesGuest, splitTonight, venueClock, type DoorVerdict } from "@/lib/pos/door-model";
import { refusalFromResult } from "@/lib/pos/refusal-reason";
import { scanAdmission } from "@/lib/sessions/door-actions";
import type { DoorOutcome } from "@/lib/sessions/door";
import {
  admitAtDoor,
  loadDoor,
  loadDoorTiers,
  type DoorRow,
  type DoorTier,
} from "@/app/(workspace)/[tenantSlug]/admin/_door-actions";
import type { DoorCounts } from "@/lib/events/summary";

import { posCollectionKey, tenderAfterKey } from "./counter-model";
import {
  posDoorCancelTicketSale,
  posDoorCollectTicket,
  posDoorOpenTicketSale,
  type DoorIssuedTicket,
  type DoorTicketSale,
  type DoorTonightSession,
} from "./door-actions";
import type { DoorCopy } from "./door-copy";

export type DoorClientProps = {
  tenantId: string;
  workspaceName: string;
  receiptOrigin: string;
  locale: string;
  zone: string;
  nowIso: string;
  sessions: DoorTonightSession[];
  /** The server could not read tonight's list: said in a sentence, never rendered as an empty door. */
  tonightFailed: boolean;
  /** The currency tier prices are shown in before a sale exists; the sale carries its own. */
  currency: string;
  /** Only cash is live at the door; the rest carry their sentence. */
  methods: PosCollectionMethodState[];
  copy: {
    door: DoorCopy;
    collect: CollectSheetCopy;
    refusal: PosRefusalCopy;
    frameNavLabel: string;
  };
};

type Destination = "checkin" | "tickets";

type OpenDoor = { session: DoorTonightSession; rows: DoorRow[]; counts: DoorCounts; tiers: DoorTier[] };

/** "19:30 CST" on the venue's clock, or the raw instant when the zone is unusable. */
function timeAt(iso: string, zone: string, locale: string): string {
  const c = venueClock(iso, zone, locale);
  return c ? `${c.time} ${c.zoneName}` : iso;
}

function dateAt(iso: string, zone: string, locale: string): string {
  return venueClock(iso, zone, locale)?.date ?? iso;
}

export function DoorClient(props: DoorClientProps) {
  const router = useRouter();
  const { copy, zone, locale } = props;
  const [destination, setDestination] = useState<Destination>("checkin");
  const [busy, setBusy] = useState(false);
  const [door, setDoor] = useState<OpenDoor | null>(null);
  const [doorFailed, setDoorFailed] = useState(props.tonightFailed);
  const [verdict, setVerdict] = useState<DoorVerdict | null>(null);
  const [filter, setFilter] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  const dateFor = useCallback((iso: string) => venueClock(iso, zone, locale)?.date ?? null, [locale, zone]);

  /** (Re)read one session's door through the real reader, never from a success line. */
  const openDoor = useCallback(async (session: DoorTonightSession) => {
    setBusy(true);
    setDoorFailed(false);
    try {
      const [loaded, tiers] = await Promise.all([loadDoor(session.id), loadDoorTiers(session.id)]);
      if (!loaded.ok) {
        setDoorFailed(true);
        return;
      }
      setDoor({ session, rows: loaded.rows, counts: loaded.counts, tiers: tiers.ok ? tiers.tiers : [] });
    } finally {
      setBusy(false);
    }
  }, []);

  const showOutcome = useCallback(
    (outcome: DoorOutcome) => {
      const v = doorVerdict(outcome, dateFor);
      setVerdict(v);
      return v;
    },
    [dateFor],
  );

  const onScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || busy || !door) return;
      setBusy(true);
      try {
        const { outcome } = await scanAdmission(props.tenantId, door.session.id, code, 1);
        const v = showOutcome(outcome);
        if (v.tone === "in") await openDoor(door.session);
      } finally {
        setBusy(false);
        if (scanRef.current) {
          scanRef.current.value = "";
          scanRef.current.focus();
        }
      }
    },
    [busy, door, openDoor, props.tenantId, showOutcome],
  );

  const onAdmitRow = useCallback(
    async (row: DoorRow) => {
      if (busy || !door) return;
      setBusy(true);
      try {
        const { outcome } = await admitAtDoor(row.id, door.session.id);
        const v = showOutcome(outcome);
        if (v.tone === "in") await openDoor(door.session);
      } finally {
        setBusy(false);
      }
    },
    [busy, door, openDoor, showOutcome],
  );

  const { tonight, later } = splitTonight(props.sessions, props.nowIso, zone);

  const sessionCounts = (s: DoorTonightSession) => (
    <span className="text-sm text-muted-foreground">
      {interpolate(copy.door.counts.admitted, { admitted: s.admitted })} ·{" "}
      {interpolate(copy.door.counts.expected, { expected: s.expected })} ·{" "}
      {s.capacity === null
        ? copy.door.counts.noPool
        : interpolate(copy.door.counts.capacity, { capacity: s.capacity })}
    </span>
  );

  const sessionButton = (s: DoorTonightSession) => (
    <button
      key={s.id}
      type="button"
      disabled={busy}
      data-door-session={s.id}
      onClick={() => void openDoor(s)}
      className={`${POS_SURFACE} flex min-h-14 w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-accent disabled:opacity-40`}
    >
      <span className="text-base font-semibold text-foreground">{s.title}</span>
      <span className="text-sm text-muted-foreground">
        {dateAt(s.startsAt, zone, locale)} · {timeAt(s.startsAt, zone, locale)}
      </span>
      {sessionCounts(s)}
    </button>
  );

  const sessionList = (
    <div className="flex flex-col gap-4 p-4" data-door-sessions>
      <p className="m-0 text-sm text-muted-foreground">{copy.door.pickSession}</p>
      {props.sessions.length === 0 && !doorFailed && (
        <p className="m-0 text-sm text-muted-foreground">{copy.door.noSessions}</p>
      )}
      {tonight.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.door.tonight}
          </h2>
          {tonight.map(sessionButton)}
        </section>
      )}
      {later.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.door.comingUp}
          </h2>
          {later.map(sessionButton)}
        </section>
      )}
      {doorFailed && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {copy.door.loadFailed}
        </p>
      )}
    </div>
  );

  const verdictTone =
    verdict?.tone === "in"
      ? "bg-foreground text-background"
      : verdict?.tone === "refused"
        ? "border border-destructive bg-destructive/10 text-destructive"
        : verdict?.tone === "warn"
          ? "border border-border bg-muted text-foreground"
          : "bg-muted text-muted-foreground";

  const gateScreen = door ? (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
      <div className="flex min-h-0 flex-col gap-4">
        <div className={`${POS_SURFACE} flex flex-col gap-2 p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 text-lg font-semibold text-foreground">{door.session.title}</h2>
              <p className="m-0 text-sm text-muted-foreground">
                {dateAt(door.session.startsAt, zone, locale)} · {timeAt(door.session.startsAt, zone, locale)}
              </p>
            </div>
            <button
              type="button"
              className={`${POS_SECONDARY_ACTION} h-11 min-w-0 px-4 text-sm`}
              onClick={() => {
                setDoor(null);
                setVerdict(null);
                router.refresh();
              }}
            >
              {copy.door.changeSession}
            </button>
          </div>
          <p className="m-0 text-sm text-foreground" data-door-counts>
            {interpolate(copy.door.counts.admitted, { admitted: door.counts.arrived })} ·{" "}
            {interpolate(copy.door.counts.expected, { expected: door.counts.expected })} ·{" "}
            {door.session.capacity === null
              ? copy.door.counts.noPool
              : interpolate(copy.door.counts.capacity, { capacity: door.session.capacity })}
          </p>
        </div>

        <form
          className={`${POS_SURFACE} flex flex-col gap-2 p-4`}
          onSubmit={(e) => {
            e.preventDefault();
            void onScan(scanRef.current?.value ?? "");
          }}
        >
          <label htmlFor="door-scan" className="text-sm font-medium text-foreground">
            {copy.door.scan.label}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="door-scan"
              ref={scanRef}
              autoFocus
              autoComplete="off"
              disabled={busy}
              className={`${POS_INPUT} h-14 flex-1 font-mono`}
              placeholder={copy.door.scan.placeholder}
            />
            <button type="submit" disabled={busy} className={POS_PRIMARY_ACTION}>
              {copy.door.scan.submit}
            </button>
          </div>
        </form>

        <div
          role="status"
          aria-live="assertive"
          data-door-verdict={verdict?.key ?? "ready"}
          className={`rounded-2xl px-4 py-5 text-center text-lg font-semibold ${verdictTone}`}
        >
          {verdict ? interpolate(copy.door.verdict[verdict.key], verdict.vars) : copy.door.scan.ready}
        </div>

        <section className={`${POS_SURFACE} flex min-h-0 flex-col gap-3 p-4`}>
          <h3 className="m-0 text-sm font-semibold text-foreground">{copy.door.list.title}</h3>
          <label htmlFor="door-filter" className="sr-only">
            {copy.door.list.search}
          </label>
          <input
            id="door-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={copy.door.list.searchPlaceholder}
            className={POS_INPUT}
          />
          <GuestList
            rows={door.rows.filter((r) => matchesGuest(r, filter))}
            emptyText={door.rows.length === 0 ? copy.door.list.empty : copy.door.list.noMatch}
            busy={busy}
            zone={zone}
            locale={locale}
            copy={copy.door}
            onAdmit={(row) => void onAdmitRow(row)}
          />
          <p className="m-0 text-xs text-muted-foreground">{copy.door.noScanOut}</p>
        </section>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <TicketSalePanel
          key={door.session.id}
          title={copy.door.sell.gateTitle}
          session={door.session}
          tiers={door.tiers}
          admitNow
          busy={busy}
          setBusy={setBusy}
          methods={props.methods}
          currency={props.currency}
          receiptOrigin={props.receiptOrigin}
          copy={copy}
          onIssued={(admitted) => {
            if (admitted && admitted.length > 0) showOutcome(admitted[0]!.outcome);
            void openDoor(door.session);
          }}
        />
      </div>
    </div>
  ) : (
    sessionList
  );

  const boxOfficeScreen = (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-sm text-muted-foreground">{copy.door.sell.boxIntro}</p>
        {props.sessions.length === 0 && !doorFailed ? (
          <p className="m-0 text-sm text-muted-foreground">{copy.door.noSessions}</p>
        ) : (
          [...tonight, ...later].map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={busy}
              aria-pressed={door?.session.id === s.id}
              data-door-session={s.id}
              onClick={() => void openDoor(s)}
              className={`${POS_SURFACE} flex min-h-14 w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-accent disabled:opacity-40 ${
                door?.session.id === s.id ? "border-foreground" : ""
              }`}
            >
              <span className="text-base font-semibold text-foreground">{s.title}</span>
              <span className="text-sm text-muted-foreground">
                {dateAt(s.startsAt, zone, locale)} · {timeAt(s.startsAt, zone, locale)}
              </span>
              {sessionCounts(s)}
            </button>
          ))
        )}
        {doorFailed && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {copy.door.loadFailed}
          </p>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {door ? (
          <TicketSalePanel
            key={`box-${door.session.id}`}
            title={copy.door.sell.boxTitle}
            session={door.session}
            tiers={door.tiers}
            admitNow={false}
            busy={busy}
            setBusy={setBusy}
            methods={props.methods}
            currency={props.currency}
            receiptOrigin={props.receiptOrigin}
            copy={copy}
            onIssued={() => void openDoor(door.session)}
          />
        ) : (
          <p className="m-0 text-sm text-muted-foreground">{copy.door.pickSession}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-56px)] w-full flex-col">
      <PosFrame
        mode="door"
        navLabel={copy.frameNavLabel}
        activeDestination={destination}
        onSelectDestination={(id) => setDestination(id === "tickets" ? "tickets" : "checkin")}
        destinationLabels={copy.door.rail}
        className="flex-1 rounded-none border-0"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {props.workspaceName}
            </p>
            <h1 className="m-0 text-base font-semibold text-foreground">{copy.door.title}</h1>
          </div>
          <p className="m-0 text-xs text-muted-foreground" data-door-zone={zone}>
            {interpolate(copy.door.clock, { zone })}
          </p>
        </header>
        {destination === "tickets" ? boxOfficeScreen : gateScreen}
      </PosFrame>
    </div>
  );
}

// ── The guest list ──────────────────────────────────────────────────────

function GuestList(props: {
  rows: DoorRow[];
  emptyText: string;
  busy: boolean;
  zone: string;
  locale: string;
  copy: DoorCopy;
  onAdmit: (row: DoorRow) => void;
}) {
  const { copy, zone, locale } = props;
  if (props.rows.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">{props.emptyText}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border p-0" data-door-list>
      {props.rows.map((r) => {
        const full = r.admittedCount >= r.partySize;
        const dead = r.status !== "valid";
        const remaining = r.partySize - r.admittedCount;
        const name =
          r.holderName ??
          (r.walkUp
            ? copy.list.walkUp
            : r.partySize > 1
              ? interpolate(copy.list.party, { size: r.partySize })
              : copy.list.ticket);
        const state = dead
          ? r.status === "refunded"
            ? copy.list.statusRefunded
            : copy.list.statusVoid
          : r.noShowAt && r.admittedCount === 0
            ? copy.list.noShow
            : full
              ? `${copy.list.in}${r.seatedAt ? ` · ${timeAt(r.seatedAt, zone, locale)}` : ""}`
              : r.admittedCount > 0
                ? interpolate(copy.list.partial, { admitted: r.admittedCount, party: r.partySize })
                : copy.list.notYet;
        return (
          <li key={r.id} data-door-row={r.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className={`m-0 truncate text-sm font-medium ${dead ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {name}
              </p>
              <p className="m-0 text-xs text-muted-foreground">{state}</p>
            </div>
            {!dead && !full && (
              <button
                type="button"
                disabled={props.busy}
                onClick={() => props.onAdmit(r)}
                className={`${POS_PRIMARY_ACTION} min-w-0 px-4`}
              >
                {remaining > 1 ? interpolate(copy.list.admitMany, { count: remaining }) : copy.list.admit}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Selling a ticket, through the counter's money path ──────────────────

type Issued = {
  amountCents: number;
  changeCents: number;
  currency: string;
  receiptCode: string | null;
  tickets: DoorIssuedTicket[];
  admitted: Array<{ admissionId: string; outcome: DoorOutcome }> | null;
};

function TicketSalePanel(props: {
  title: string;
  session: DoorTonightSession;
  tiers: DoorTier[];
  admitNow: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  methods: PosCollectionMethodState[];
  currency: string;
  receiptOrigin: string;
  copy: DoorClientProps["copy"];
  onIssued: (admitted: Issued["admitted"]) => void;
}) {
  const { copy, tiers } = props;
  const sellable = tiers.filter((t) => t.hasPool);
  const [tier, setTier] = useState<string>(sellable[0]?.variantId ?? "");
  const [holderName, setHolderName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sale, setSale] = useState<DoorTicketSale | null>(null);
  const [method, setMethod] = useState<PosCollectionMethodId>("cash");
  const [tenderedCents, setTenderedCents] = useState(0);
  const [tenderTouched, setTenderTouched] = useState(false);
  const [refusal, setRefusal] = useState<PosRefusalReason | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);

  const run = useCallback(
    async <T extends { ok: boolean; reason?: unknown; error?: unknown }>(fn: () => Promise<T>): Promise<T> => {
      props.setBusy(true);
      setRefusal(null);
      try {
        const result = await fn();
        setRefusal(refusalFromResult(result, "sale"));
        return result;
      } finally {
        props.setBusy(false);
      }
    },
    [props],
  );

  const openSale = useCallback(async () => {
    if (!tier) return;
    const result = await run(() => posDoorOpenTicketSale({ sessionId: props.session.id, variantId: tier }));
    if (result.ok && "sale" in result) {
      setSale(result.sale);
      setTenderedCents(result.sale.totalCents);
      setTenderTouched(false);
    }
  }, [props.session.id, run, tier]);

  const cancelSale = useCallback(async () => {
    if (!sale) return;
    const result = await run(() => posDoorCancelTicketSale(sale.orderId, sale.version));
    if (result.ok) setSale(null);
  }, [run, sale]);

  /**
   * THE CHARGE, with the counter's own derived key: the same sale, version,
   * tender and amount is the same attempt, so a second tap replays the first.
   */
  const collect = useCallback(async () => {
    if (!sale) return;
    const amountCents = sale.totalCents;
    const result = await run(() =>
      posDoorCollectTicket({
        orderId: sale.orderId,
        sessionId: props.session.id,
        expectedVersion: sale.version,
        amountCents,
        tenderedCents: Math.max(tenderedCents, amountCents),
        idempotencyKey: posCollectionKey({ orderId: sale.orderId, version: sale.version, method: "cash", amountCents }),
        holderName: holderName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        admitNow: props.admitNow,
      }),
    );
    if (!result.ok || !("tickets" in result)) return;
    const done: Issued = {
      amountCents: result.amountCents,
      changeCents: result.changeCents,
      currency: sale.currency,
      receiptCode: result.receiptCode,
      tickets: result.tickets,
      admitted: result.admitted,
    };
    setIssued(done);
    setSale(null);
    props.onIssued(done.admitted);
  }, [email, holderName, phone, props, run, sale, tenderedCents]);

  const reset = () => {
    setIssued(null);
    setHolderName("");
    setEmail("");
    setPhone("");
    setTenderedCents(0);
    setRefusal(null);
  };

  const receiptHref = issued?.receiptCode && props.receiptOrigin ? `${props.receiptOrigin}/r/${issued.receiptCode}` : null;

  return (
    <section className={`${POS_SURFACE} flex flex-col gap-3 p-4`} data-door-sale={props.admitNow ? "gate" : "box"}>
      <h3 className="m-0 text-sm font-semibold text-foreground">{props.title}</h3>
      {refusal && <PosRefusalBanner reason={refusal} copy={copy.refusal} onRetry={() => setRefusal(null)} />}

      {issued ? (
        <div className="flex flex-col gap-3" data-door-issued>
          <p className="m-0 text-lg font-semibold text-foreground">
            {issued.tickets.length === 1
              ? copy.door.sell.issued
              : interpolate(copy.door.sell.issuedMany, { count: issued.tickets.length })}
          </p>
          <p className="m-0 text-sm text-muted-foreground">
            {copy.collect.amountDue} {formatOrderMoney(issued.amountCents, issued.currency)} · {copy.collect.change}{" "}
            {formatOrderMoney(issued.changeCents, issued.currency)}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {issued.tickets.map((t) => {
              const verdict = issued.admitted?.find((a) => a.admissionId === t.admissionId);
              return (
                <li key={t.admissionId} className="rounded-xl border border-border p-3" data-door-ticket={t.admissionId}>
                  <p className="m-0 text-sm font-medium text-foreground">
                    {t.holderName ?? copy.door.list.ticket}
                    {t.partySize > 1 ? ` · ${interpolate(copy.door.list.party, { size: t.partySize })}` : ""}
                  </p>
                  <p className="m-0 mt-1 text-xs text-muted-foreground">{copy.door.sell.code}</p>
                  {t.code ? (
                    <code className="block break-all text-xs text-foreground" data-door-code>
                      {t.code}
                    </code>
                  ) : (
                    <p className="m-0 text-xs text-destructive">{copy.door.sell.codeUnavailable}</p>
                  )}
                  {verdict && (
                    <p className="m-0 mt-1 text-xs text-muted-foreground">
                      {copy.door.sell.admittedNow}: {verdict.outcome.kind === "admitted" ? copy.door.list.in : copy.door.list.notYet}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {receiptHref && (
            <a href={receiptHref} target="_blank" rel="noopener noreferrer" data-pos-receipt-link className="break-all text-sm text-foreground underline">
              {copy.door.sell.receipt}: {receiptHref}
            </a>
          )}
          <button type="button" className={POS_PRIMARY_ACTION} onClick={reset}>
            {copy.door.sell.next}
          </button>
        </div>
      ) : sale ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-foreground">{interpolate(copy.door.sell.openedFor, { label: sale.label })}</p>
          <CollectSheet
            amountDueCents={sale.totalCents}
            currency={sale.currency}
            methods={props.methods}
            activeMethod={method}
            onSelectMethod={setMethod}
            tenderedCents={tenderedCents}
            onKeypadPress={(key) => {
              setTenderedCents((current) => tenderAfterKey(current, tenderTouched, key));
              setTenderTouched(true);
            }}
            onConfirmCash={() => void collect()}
            confirmLoading={props.busy}
            copy={{
              ...copy.collect,
              confirmCash: props.admitNow ? copy.door.sell.collectGate : copy.door.sell.collectBox,
            }}
          />
          <button type="button" disabled={props.busy} className={POS_SECONDARY_ACTION} onClick={() => void cancelSale()}>
            {copy.door.sell.cancel}
          </button>
        </div>
      ) : sellable.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{copy.door.sell.noTiers}</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void openSale();
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-foreground">
            {copy.door.sell.tier}
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              disabled={props.busy}
              className={POS_INPUT}
              data-door-tier
            >
              {tiers.map((t) => (
                <option key={t.variantId} value={t.variantId} disabled={!t.hasPool}>
                  {t.label} · {formatOrderMoney(t.amountCents, props.currency)}
                  {t.admitsPerUnit > 1 ? ` · ${interpolate(copy.door.list.party, { size: t.admitsPerUnit })}` : ""}
                  {t.hasPool ? "" : ` · ${copy.door.sell.tierNoPool}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            {copy.door.sell.holderName}
            <input
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              disabled={props.busy}
              autoComplete="off"
              placeholder={copy.door.sell.holderNamePlaceholder}
              className={POS_INPUT}
              data-door-holder-name
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
              {copy.door.sell.email}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={props.busy}
                autoComplete="off"
                className={POS_INPUT}
                data-door-email
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
              {copy.door.sell.phone}
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={props.busy}
                autoComplete="off"
                className={POS_INPUT}
              />
            </label>
          </div>
          <p className="m-0 text-xs text-muted-foreground">{copy.door.sell.contactHint}</p>
          <button type="submit" disabled={props.busy || !tier} className={POS_PRIMARY_ACTION}>
            {copy.door.sell.open}
          </button>
        </form>
      )}
    </section>
  );
}
