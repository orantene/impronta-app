"use client";

/**
 * FloorClient: the Tables mode of the point of sale (T01, T03, T04, T05, T07,
 * T12, T13, T15, T24), wired. Mode id `floor`; the switch, the settings card
 * and this screen all call it "Tables" (`dashboard.pos.counter.mode.floor`,
 * `dashboard.adminWorkspace.posModes.modes.floor`, `dashboard.pos.floor.*`),
 * and its rail's first row, the room itself, is "Floor".
 *
 * WHAT THIS IS. The host's and server's view of the room FROM THE TILL, a
 * sibling of the counter inside the same `PosFrame`. It is a skin over the
 * engine the workspace Spaces page (`admin/tables`) already drives: every
 * read is `lib/visits/floor.ts::listFloor` and every write goes through the
 * SAME server actions that page calls (`../tables/actions`) plus the
 * counter's own `posSubmitPrep` for the kitchen. No second engine, no second
 * list of tables, no second set of refusal words.
 *
 * ONE SHEET, ONE NEXT ACTION. A tap on a table opens its sheet (T04) beside
 * the floor; the sheet's primary action depends on the table's state: seat a
 * party on a free or held table, open the check on an occupied one. The
 * check itself IS the counter's basket, reached with `?mode=counter&order=`:
 * the floor never grows a basket of its own.
 *
 * REFUSALS ARE SENTENCES. Every action answers `{ ok: false, reason }` with a
 * code; `refusalText` turns the code into the reader's language and an
 * unknown code reads as the generic sentence, never raw. A request that
 * throws (seen: HTTP 500 on the QA host) is caught and said the same way, and
 * the controls come back.
 *
 * THE CLOCK. Every instant printed here is formatted in the VENUE's zone
 * through `lib/spaces/venue-clock.ts`, and the zone is written on the screen.
 * Elapsed minutes are the server's read at render; the floor re-reads itself
 * once a minute so a party's time does not freeze at whatever it was when
 * the tablet was last touched.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PosFrame } from "@/components/admin/pos";
import {
  POS_PRIMARY_ACTION,
  POS_REFUSAL_BANNER,
  POS_SECONDARY_ACTION,
  POS_SURFACE,
} from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import type { FloorTable } from "@/lib/visits/floor";

import { tablesCloseVisit, tablesMoveVisit, tablesResetTable, tablesSeatParty } from "../tables/actions";
import { posSubmitPrep } from "./actions";

/** Every code the floor's own actions (`../tables/actions`) can return. */
export type FloorRefusalKey =
  | "not_found"
  | "wrong_tenant"
  | "already_open"
  | "invalid"
  | "party_too_small"
  | "party_too_large"
  | "not_combinable"
  | "joined_unavailable"
  | "joined_visit"
  | "not_open"
  | "outstanding"
  | "already_closed"
  | "version_conflict"
  | "not_allowed"
  | "unavailable"
  | "reservation_not_found"
  | "reservation_other_table"
  | "reservation_not_valid"
  | "reservation_already_seated"
  // The kitchen send (`posSubmitPrep` -> `submitOrderToPreparation`).
  | "kitchen_empty"
  | "kitchen_not_found";

/** What a kitchen ticket looks like from the floor: only its step and revision. */
export type FloorTicket = {
  status: "queued" | "acknowledged" | "ready";
  revision: number;
};

export type FloorCopy = {
  railLabel: string;
  rail: { tables: string; seating: string };
  title: string;
  summary: string;
  emptyFloor: string;
  emptySeated: string;
  tapHint: string;
  sheetHeading: string;
  closeSheet: string;
  guests: string;
  fewerGuests: string;
  moreGuests: string;
  seatHere: string;
  seatAcross: string;
  joinOffer: string;
  noJoinOptions: string;
  openCheck: string;
  sendKitchen: string;
  movePartyHeading: string;
  noFreeTables: string;
  endVisit: string;
  markReady: string;
  kitchenNone: string;
  kitchenQueued: string;
  kitchenAcknowledged: string;
  kitchenReady: string;
  sentToKitchen: string;
  amendedInKitchen: string;
  checkTotal: string;
  noCheckYet: string;
  seatedNotMarked: string;
  state: {
    free: string;
    held: string;
    occupied: string;
    needsReset: string;
    tableCheck: string;
    tabCheck: string;
  };
  card: {
    partySizeShort: string;
    elapsedMinutes: string;
    dueBy: string;
    overdueBy: string;
    heldForNamed: string;
    heldUnnamed: string;
    heldArriving: string;
    joinedWith: string;
    needsResetSince: string;
  };
  refusal: Record<FloorRefusalKey, string>;
};

export type FloorClientProps = {
  workspaceName: string;
  /** This request's own `/…/admin/pos` path, so links keep the host shape. */
  posPath: string;
  locale: string;
  /** The VENUE's IANA zone; see `lib/spaces/venue-clock.ts`. */
  timeZone: string;
  /** The zone as a sentence, built on the server (it reads a clock). */
  zoneNote: string;
  tables: FloorTable[];
  /** The active kitchen ticket per order id, resolved on the server. */
  tickets: Readonly<Record<string, FloorTicket>>;
  /** Each open check's own currency, by order id; a check not listed reads as USD. */
  currencies: Readonly<Record<string, string>>;
  copy: FloorCopy;
};

type Destination = "tables" | "seating";

/** Every action answers in this shape: a code, never a sentence. */
type Outcome = { ok: true; reservationWarning?: string } | { ok: false; reason: string };

/** A code as a sentence. An unknown code reads as the generic one, never raw. */
export function refusalText(copy: FloorCopy, code: string): string {
  const table: Readonly<Record<string, string | undefined>> = copy.refusal;
  return table[code] ?? copy.refusal.unavailable;
}

/**
 * The kitchen send's result, folded onto the floor's codes.
 *
 * `posSubmitPrep` answers with either the engine's `reason` (`empty`,
 * `not_found`, `wrong_tenant`, `unavailable`) or the route guard's `error`
 * (`not_allowed`, `invalid`, `unavailable`, or a sentence when the session
 * itself is gone). `empty` and the two "gone" reasons get the floor's own
 * kitchen sentences; the guard's words are already in the floor's table; and
 * anything else, including a sentence, is the generic refusal.
 */
export function kitchenOutcome(result: { ok: boolean; reason?: unknown; error?: unknown }): Outcome {
  if (result.ok) return { ok: true };
  const raw = typeof result.reason === "string" ? result.reason : typeof result.error === "string" ? result.error : "";
  if (raw === "empty") return { ok: false, reason: "kitchen_empty" };
  if (raw === "not_found" || raw === "wrong_tenant") return { ok: false, reason: "kitchen_not_found" };
  if (raw === "not_allowed" || raw === "invalid") return { ok: false, reason: raw };
  return { ok: false, reason: "unavailable" };
}

/** The line under a table's code that says how its kitchen ticket stands. */
export function kitchenLine(copy: FloorCopy, ticket: FloorTicket | undefined): string {
  if (!ticket) return copy.kitchenNone;
  const key =
    ticket.status === "ready"
      ? copy.kitchenReady
      : ticket.status === "acknowledged"
        ? copy.kitchenAcknowledged
        : copy.kitchenQueued;
  return interpolate(key, { n: ticket.revision });
}

/**
 * The floor's headline figures, from the same rows the cards render.
 *
 * "Seated" counts SEATINGS, not occupied spaces: two tables pushed together
 * are one party, so the joined half (`joinedFromSpaceId`) is not counted
 * again. "Total" is every space on the floor, because the joined half is
 * still a table the venue owns.
 */
export function floorSummary(tables: readonly FloorTable[]): {
  seated: number;
  total: number;
  arriving: number;
  reset: number;
} {
  let seated = 0;
  let arriving = 0;
  let reset = 0;
  for (const t of tables) {
    if (t.state === "occupied" && !t.joinedFromSpaceId) seated += 1;
    if (t.state === "held") arriving += 1;
    if (t.state !== "occupied" && t.needsResetSinceIso) reset += 1;
  }
  return { seated, total: tables.length, arriving, reset };
}

const CARD_BY_STATE: Record<FloorTable["state"], string> = {
  free: "border-border bg-card text-foreground",
  held: "border-foreground/40 border-dashed bg-card text-foreground",
  occupied: "border-foreground bg-foreground/5 text-foreground",
};

const BADGE_BY_STATE: Record<FloorTable["state"], string> = {
  free: "border-border bg-muted text-muted-foreground",
  held: "border-foreground/40 bg-background text-foreground",
  occupied: "border-foreground bg-foreground text-background",
};

export function FloorClient(props: FloorClientProps) {
  const { copy, locale, timeZone, tables } = props;
  const router = useRouter();

  const [destination, setDestination] = useState<Destination>("tables");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [joinOffer, setJoinOffer] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  // The floor re-reads itself once a minute so elapsed times keep moving.
  // Only the interval lives here; nothing rendered depends on a clock read
  // during render, so the server's markup and the first paint agree.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  const selected = selectedId ? (tables.find((t) => t.spaceId === selectedId) ?? null) : null;

  const codeOf = useCallback(
    (spaceId: string | null): string => {
      if (!spaceId) return "";
      const t = tables.find((x) => x.spaceId === spaceId);
      return t ? (t.code ?? t.name) : "";
    },
    [tables],
  );

  const run = useCallback(
    async (fn: () => Promise<Outcome>): Promise<Outcome> => {
      setBusy(true);
      setRefusal(null);
      setNotice(null);
      let r: Outcome;
      try {
        r = await fn();
      } catch {
        // The request itself failed, not the engine refusing: still a
        // sentence, and the floor comes back.
        r = { ok: false, reason: "unavailable" };
      } finally {
        setBusy(false);
      }
      if (!r.ok) {
        setRefusal(refusalText(copy, r.reason));
      } else {
        if (r.reservationWarning) {
          setNotice(`${copy.seatedNotMarked} ${refusalText(copy, r.reservationWarning)}`);
        }
        router.refresh();
      }
      return r;
    },
    [copy, router],
  );

  function select(table: FloorTable | null) {
    setSelectedId(table ? table.spaceId : null);
    setJoinOffer(false);
    setMoveOpen(false);
    setRefusal(null);
    setNotice(null);
    if (table && table.state !== "occupied") {
      setParty(Math.max(1, table.held?.partySize ?? table.partyMin));
    }
  }

  async function seat(table: FloorTable, joinedSpaceId?: string) {
    const partySize = Math.max(1, party);
    const r = await run(() =>
      tablesSeatParty({
        spaceId: table.spaceId,
        partySize,
        joinedSpaceId,
        admissionId: table.held?.admissionId,
      }),
    );
    if (r.ok) {
      setSelectedId(null);
      setJoinOffer(false);
      return;
    }
    if (!joinedSpaceId && (r.reason === "party_too_small" || r.reason === "party_too_large")) {
      setJoinOffer(true);
    }
  }

  async function sendToKitchen(table: FloorTable) {
    if (!table.orderId) return;
    const orderId = table.orderId;
    const r = await run(async () => {
      const result = await posSubmitPrep({ orderId, destination: "table" });
      const outcome = kitchenOutcome(result);
      if (outcome.ok && result.ok && "revision" in result) {
        setNotice(
          interpolate(result.amended ? copy.amendedInKitchen : copy.sentToKitchen, {
            n: result.revision,
          }),
        );
      }
      return outcome;
    });
    return r;
  }

  const checkHref = (orderId: string) =>
    `${props.posPath}?mode=counter&order=${encodeURIComponent(orderId)}`;

  const summary = floorSummary(tables);

  /** The line under the code: who is here, for how long, and the check. */
  function cardLines(table: FloorTable): string[] {
    const lines: string[] = [];
    if (table.state === "occupied") {
      const bits: string[] = [];
      if (table.partySize != null) bits.push(interpolate(copy.card.partySizeShort, { n: table.partySize }));
      if (table.elapsedMinutes != null) bits.push(interpolate(copy.card.elapsedMinutes, { n: table.elapsedMinutes }));
      if (table.turnMinutes != null) {
        bits.push(
          table.overdue
            ? interpolate(copy.card.overdueBy, {
                n: Math.max(0, (table.elapsedMinutes ?? 0) - table.turnMinutes),
              })
            : interpolate(copy.card.dueBy, {
                time: table.dueAtIso ? venueHhmm(table.dueAtIso, timeZone, locale) : "",
              }),
        );
      }
      lines.push(bits.join(" · "));
      lines.push(
        table.orderId
          ? interpolate(copy.checkTotal, {
              amount: formatOrderMoney(table.orderTotalCents, props.currencies[table.orderId] ?? "USD"),
            })
          : copy.noCheckYet,
      );
    } else if (table.state === "held" && table.held) {
      const who = table.held.holderName
        ? interpolate(copy.card.heldForNamed, { name: table.held.holderName })
        : copy.card.heldUnnamed;
      // The booked time, in the venue's clock, whether the party is early or
      // late: "how late" needs a clock read during render, which this screen
      // does not do (see the file header), so the time itself is what is said.
      const when = interpolate(copy.card.heldArriving, {
        time: venueHhmm(table.held.startsAtIso, timeZone, locale),
      });
      lines.push(`${who} · ${interpolate(copy.card.partySizeShort, { n: table.held.partySize })} · ${when}`);
    }
    if (table.state !== "occupied" && table.needsResetSinceIso) {
      lines.push(
        interpolate(copy.card.needsResetSince, {
          time: venueHhmm(table.needsResetSinceIso, timeZone, locale),
        }),
      );
    }
    const joined = table.joinedWithSpaceId ?? table.joinedFromSpaceId;
    if (joined) lines.push(interpolate(copy.card.joinedWith, { code: codeOf(joined) }));
    return lines;
  }

  function tableCard(table: FloorTable) {
    const code = table.code ?? table.name;
    const active = selectedId === table.spaceId;
    const needsReset = table.state !== "occupied" && Boolean(table.needsResetSinceIso);
    return (
      <li key={table.spaceId} data-floor-table={code} data-floor-state={table.state}>
        <button
          type="button"
          aria-pressed={active}
          disabled={busy}
          onClick={() => select(active ? null : table)}
          className={`flex min-h-[7rem] w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors hover:bg-accent disabled:opacity-60 ${CARD_BY_STATE[table.state]} ${active ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
        >
          <span className="flex w-full flex-wrap items-center gap-2">
            <strong className="text-lg font-semibold">{code}</strong>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_BY_STATE[table.state]}`}>
              {table.state === "occupied"
                ? copy.state.occupied
                : table.state === "held"
                  ? copy.state.held
                  : copy.state.free}
            </span>
            {table.state === "occupied" ? (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {table.serviceKind === "tab" ? copy.state.tabCheck : copy.state.tableCheck}
              </span>
            ) : null}
            {needsReset ? (
              <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {copy.state.needsReset}
              </span>
            ) : null}
          </span>
          {cardLines(table).map((line, i) => (
            <span key={i} className="text-sm text-muted-foreground">
              {line}
            </span>
          ))}
          {table.state === "occupied" && table.orderId ? (
            <span className="text-xs text-muted-foreground">{kitchenLine(copy, props.tickets[table.orderId])}</span>
          ) : null}
        </button>
      </li>
    );
  }

  const seated = tables
    .filter((t) => t.state === "occupied" && !t.joinedFromSpaceId)
    .sort((a, b) => (b.elapsedMinutes ?? 0) - (a.elapsedMinutes ?? 0));

  const floorList =
    tables.length === 0 ? (
      <p className="m-0 p-4 text-sm text-muted-foreground">{copy.emptyFloor}</p>
    ) : (
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
        {tables.map(tableCard)}
      </ul>
    );

  const seatedList =
    seated.length === 0 ? (
      <p className="m-0 p-4 text-sm text-muted-foreground">{copy.emptySeated}</p>
    ) : (
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-4">{seated.map(tableCard)}</ul>
    );

  /** T04: the sheet for the tapped table. */
  function sheet(table: FloorTable) {
    const code = table.code ?? table.name;
    const partySize = Math.max(1, party);
    const fitsAlone = partySize >= table.partyMin && partySize <= table.partyMax;
    const joinCandidates = table.combinableWith.filter(
      (c) => partySize >= c.partyMin && partySize <= c.partyMax,
    );
    const showJoin = table.state !== "occupied" && (joinOffer || !fitsAlone);
    const moveCandidates = tables.filter(
      (t) =>
        t.state !== "occupied" &&
        t.spaceId !== table.spaceId &&
        (table.partySize == null || (table.partySize >= t.partyMin && table.partySize <= t.partyMax)),
    );

    return (
      <aside data-floor-sheet={code} className={`${POS_SURFACE} flex flex-col gap-4 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-base font-semibold text-foreground">
            {interpolate(copy.sheetHeading, { code })}
          </h2>
          <button type="button" className={`${POS_SECONDARY_ACTION} h-11 min-w-0 px-4 text-sm`} onClick={() => select(null)}>
            {copy.closeSheet}
          </button>
        </div>
        {cardLines(table).map((line, i) => (
          <p key={i} className="m-0 text-sm text-muted-foreground">
            {line}
          </p>
        ))}

        {table.state !== "occupied" ? (
          <>
            <div className="flex items-center gap-3">
              <span id={`floor-guests-${table.spaceId}`} className="text-sm font-medium text-muted-foreground">
                {copy.guests}
              </span>
              <button
                type="button"
                aria-label={copy.fewerGuests}
                disabled={busy || partySize <= 1}
                className={`${POS_SECONDARY_ACTION} min-w-0 px-5 text-xl`}
                onClick={() => {
                  setParty((n) => Math.max(1, n - 1));
                  setJoinOffer(false);
                }}
              >
                -
              </button>
              <output
                aria-labelledby={`floor-guests-${table.spaceId}`}
                data-floor-party
                className="min-w-[3rem] text-center text-2xl font-semibold text-foreground"
              >
                {partySize}
              </output>
              <button
                type="button"
                aria-label={copy.moreGuests}
                disabled={busy}
                className={`${POS_SECONDARY_ACTION} min-w-0 px-5 text-xl`}
                onClick={() => {
                  setParty((n) => Math.min(200, n + 1));
                  setJoinOffer(false);
                }}
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              className={`${POS_PRIMARY_ACTION} w-full`}
              onClick={() => void seat(table)}
            >
              {interpolate(copy.seatHere, { n: partySize, code })}
            </button>
            {showJoin ? (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-sm font-medium text-muted-foreground">
                  {interpolate(copy.joinOffer, { code, n: partySize })}
                </p>
                {joinCandidates.length === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">{copy.noJoinOptions}</p>
                ) : (
                  joinCandidates.map((c) => (
                    <button
                      key={c.spaceId}
                      type="button"
                      disabled={busy}
                      className={`${POS_SECONDARY_ACTION} w-full`}
                      onClick={() => void seat(table, c.spaceId)}
                    >
                      {interpolate(copy.seatAcross, { n: partySize, code, other: codeOf(c.spaceId) })}
                    </button>
                  ))
                )}
              </div>
            ) : null}
            {table.needsResetSinceIso ? (
              <button
                type="button"
                disabled={busy}
                className={`${POS_SECONDARY_ACTION} w-full`}
                onClick={() =>
                  void run(async () => {
                    const r = await tablesResetTable(table.spaceId);
                    if (r.ok) setSelectedId(null);
                    return r;
                  })
                }
              >
                {copy.markReady}
              </button>
            ) : null}
          </>
        ) : (
          <>
            {table.orderId ? (
              <>
                <p className="m-0 text-sm text-muted-foreground">{kitchenLine(copy, props.tickets[table.orderId])}</p>
                <button
                  type="button"
                  disabled={busy}
                  className={`${POS_PRIMARY_ACTION} w-full`}
                  onClick={() => router.push(checkHref(table.orderId ?? ""))}
                >
                  {copy.openCheck}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={`${POS_SECONDARY_ACTION} w-full`}
                  onClick={() => void sendToKitchen(table)}
                >
                  {copy.sendKitchen}
                </button>
              </>
            ) : null}
            {!table.joinedWithSpaceId && !table.joinedFromSpaceId ? (
              <button
                type="button"
                disabled={busy}
                aria-expanded={moveOpen}
                className={`${POS_SECONDARY_ACTION} w-full`}
                onClick={() => setMoveOpen((v) => !v)}
              >
                {copy.movePartyHeading}
              </button>
            ) : null}
            {moveOpen ? (
              moveCandidates.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">{copy.noFreeTables}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {moveCandidates.map((dest) => (
                    <button
                      key={dest.spaceId}
                      type="button"
                      disabled={busy}
                      data-floor-move-to={dest.code ?? dest.name}
                      className={`${POS_SECONDARY_ACTION} min-w-0`}
                      onClick={() =>
                        void run(async () => {
                          const r = await tablesMoveVisit({
                            visitId: table.visitId ?? "",
                            spaceId: dest.spaceId,
                            expectedVersion: table.visitVersion ?? undefined,
                          });
                          if (r.ok) {
                            setMoveOpen(false);
                            setSelectedId(dest.spaceId);
                          }
                          return r;
                        })
                      }
                    >
                      {dest.code ?? dest.name}
                    </button>
                  ))}
                </div>
              )
            ) : null}
            <button
              type="button"
              disabled={busy}
              className={`${POS_SECONDARY_ACTION} w-full`}
              onClick={() =>
                void run(async () => {
                  const r = await tablesCloseVisit({
                    visitId: table.visitId ?? "",
                    expectedVersion: table.visitVersion ?? undefined,
                  });
                  return r;
                })
              }
            >
              {copy.endVisit}
            </button>
          </>
        )}
      </aside>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] w-full flex-col">
      <PosFrame
        mode="floor"
        navLabel={copy.railLabel}
        activeDestination={destination}
        onSelectDestination={(id) => setDestination(id === "seating" ? "seating" : "tables")}
        destinationLabels={copy.rail}
        className="flex-1 rounded-none border-0"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {props.workspaceName}
            </p>
            <h1 className="m-0 text-base font-semibold text-foreground">{copy.title}</h1>
          </div>
          <div className="min-w-0 text-right">
            <p className="m-0 text-sm text-foreground" data-floor-summary>
              {interpolate(copy.summary, summary)}
            </p>
            <p className="m-0 text-xs text-muted-foreground">{props.zoneNote}</p>
          </div>
        </header>
        {refusal ? (
          <div className="px-4 pt-4">
            <div role="alert" data-floor-refusal className={POS_REFUSAL_BANNER}>
              <p className="m-0 flex-1">{refusal}</p>
            </div>
          </div>
        ) : null}
        {notice ? (
          <div className="px-4 pt-4">
            <p
              role="status"
              data-floor-notice
              className="m-0 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground"
            >
              {notice}
            </p>
          </div>
        ) : null}
        <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <div className={`${POS_SURFACE} min-h-0 overflow-y-auto`}>
            {destination === "seating" ? seatedList : floorList}
          </div>
          <div className="flex min-h-0 flex-col gap-3">
            {selected ? sheet(selected) : <p className="m-0 p-4 text-sm text-muted-foreground">{copy.tapHint}</p>}
          </div>
        </div>
      </PosFrame>
    </div>
  );
}
