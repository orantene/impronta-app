"use client";

/**
 * T01/T04-T07/T12-T15/T24 — the floor, in one screen.
 *
 * Three states per card (free / held / occupied), matching `FloorTable.state`
 * from `lib/visits/floor.ts`. Seating always goes through `tablesSeatParty`,
 * which is refused server-side when the party does not fit the table
 * (`party_too_small` / `party_too_large`) — this component never seats a
 * party the engine would refuse, it only decides how to SHOW that refusal:
 * as a sentence, plus — when the table has join candidates — the join picker
 * so the host's next move is one tap, not a second guess.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tablesCloseVisit, tablesMoveVisit, tablesOpenVisit, tablesResetTable, tablesSeatParty } from "./actions";
import type { FloorTable } from "@/lib/visits/floor";
import { interpolate } from "@/i18n/interpolate";

type RefusalKey =
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
  | "unavailable";

export type TablesCopy = {
  empty: string;
  close: string;
  sale: string;
  occupied: string;
  free: string;
  held: string;
  minSpend: string;
  move: string;
  openTab: string;
  seatParty: string;
  partySizeLabel: string;
  confirmSeat: string;
  cancel: string;
  heldForNamed: string;
  heldUnnamed: string;
  heldArriving: string;
  heldLate: string;
  partySizeShort: string;
  elapsedMinutes: string;
  dueBy: string;
  overdueBy: string;
  turnMinutesLabel: string;
  moveHeading: string;
  joinHeading: string;
  joinNeeded: string;
  noFreeTables: string;
  noJoinOptions: string;
  joinedWith: string;
  needsReset: string;
  needsResetSince: string;
  markReset: string;
  refusal: Record<RefusalKey, string>;
};

type ActionOutcome = { ok: true } | { ok: false; reason?: string; error?: string };

function refusalText(copy: TablesCopy, result: ActionOutcome): string {
  const code = (result.ok ? "" : (result.reason ?? result.error ?? "unavailable")) as RefusalKey;
  return copy.refusal[code] ?? copy.refusal.unavailable;
}

function hhmm(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "--:--";
  }
}

const STATE_BADGE: Record<FloorTable["state"], string> = {
  free: "border-border bg-muted text-muted-foreground",
  held: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  occupied: "border-foreground/20 bg-foreground/5 text-foreground",
};

export function TablesClient(props: {
  tenantSlug: string;
  locale: string;
  tables: FloorTable[];
  copy: TablesCopy;
}) {
  const { copy, locale } = props;
  const router = useRouter();
  // The clock, read only inside an effect (never during render — Date.now()
  // there is an impure read the render-purity rule catches, and the deeper
  // reason is the same one that rule exists for: the server has no clock of
  // its own to agree with, so a value read during render would differ between
  // the server's markup and the client's first paint). Null until mount, so
  // "how late" waits one tick rather than showing a value the server could
  // not have produced; every 30s after that is plenty for a minutes display.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [seatFor, setSeatFor] = useState<string | null>(null);
  const [partyInput, setPartyInput] = useState("2");
  const [joinOffer, setJoinOffer] = useState<Array<{ spaceId: string; code: string | null }> | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);

  async function run(fn: () => Promise<ActionOutcome>): Promise<ActionOutcome> {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setMsg(refusalText(copy, r));
    else router.refresh();
    return r;
  }

  function codeFor(spaceId: string): string | null {
    const t = props.tables.find((x) => x.spaceId === spaceId);
    return t ? (t.code ?? t.name) : null;
  }

  async function seat(table: FloorTable, joinedSpaceId?: string) {
    const partySize = Math.max(1, Math.trunc(Number(partyInput) || 0));
    const r = await run(() => tablesSeatParty({ spaceId: table.spaceId, partySize, joinedSpaceId }));
    if (r.ok) {
      setSeatFor(null);
      setJoinOffer(null);
      return;
    }
    if (!joinedSpaceId && (r.reason === "party_too_small" || r.reason === "party_too_large")) {
      const candidates = table.combinableWith
        .filter((c) => partySize >= c.partyMin && partySize <= c.partyMax)
        .map((c) => ({ spaceId: c.spaceId, code: codeFor(c.spaceId) }));
      setJoinOffer(candidates.length > 0 ? candidates : []);
    }
  }

  if (props.tables.length === 0) return <p className="text-sm text-muted-foreground">{copy.empty}</p>;

  return (
    <div>
      {msg ? (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {msg}
        </p>
      ) : null}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {props.tables.map((table) => {
          const label = table.code ?? table.name;
          const isSeatOpen = seatFor === table.spaceId;
          const isMoveOpen = moveFor === table.visitId;

          return (
            <li key={table.spaceId} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <strong className="text-base text-foreground">{label}</strong>
                  <span
                    className={`ml-2 inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATE_BADGE[table.state]}`}
                  >
                    {table.state === "occupied" ? copy.occupied : table.state === "held" ? copy.held : copy.free}
                  </span>
                  {table.state !== "occupied" && table.needsResetSinceIso ? (
                    <span className="ml-1.5 inline-block rounded-full border border-orange-700/40 bg-orange-600/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                      {copy.needsReset}
                    </span>
                  ) : null}
                  {table.joinedWithSpaceId ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {interpolate(copy.joinedWith, { code: codeFor(table.joinedWithSpaceId) ?? "" })}
                    </div>
                  ) : null}
                  {table.joinedFromSpaceId ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {interpolate(copy.joinedWith, { code: codeFor(table.joinedFromSpaceId) ?? "" })}
                    </div>
                  ) : null}

                  {table.state === "held" && table.held ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {table.held.holderName
                        ? interpolate(copy.heldForNamed, { name: table.held.holderName })
                        : copy.heldUnnamed}
                      {" · "}
                      {table.held.late
                        ? interpolate(copy.heldLate, {
                            n:
                              now === null
                                ? 0
                                : Math.max(0, Math.floor((now - new Date(table.held.startsAtIso).getTime()) / 60_000)),
                          })
                        : interpolate(copy.heldArriving, { time: hhmm(table.held.startsAtIso, locale) })}
                    </div>
                  ) : null}

                  {table.state === "occupied" ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {table.partySize != null ? interpolate(copy.partySizeShort, { n: table.partySize }) : null}
                      {table.elapsedMinutes != null ? (
                        <>
                          {" · "}
                          {interpolate(copy.elapsedMinutes, { n: table.elapsedMinutes })}
                        </>
                      ) : null}
                      {table.turnMinutes != null ? (
                        <>
                          {" · "}
                          <span className={table.overdue ? "font-medium text-destructive" : undefined}>
                            {table.overdue
                              ? interpolate(copy.overdueBy, {
                                  n: Math.max(0, (table.elapsedMinutes ?? 0) - table.turnMinutes),
                                })
                              : interpolate(copy.dueBy, { time: table.dueAtIso ? hhmm(table.dueAtIso, locale) : "" })}
                          </span>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {table.state !== "occupied" && table.needsResetSinceIso ? (
                    <div className="mt-1 text-xs text-orange-700 dark:text-orange-400">
                      {interpolate(copy.needsResetSince, { time: hhmm(table.needsResetSinceIso, locale) })}
                    </div>
                  ) : null}

                  {table.minSpendCents > 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {copy.minSpend}: {table.remainingMinSpendCents}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {table.state !== "occupied" ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
                      onClick={() => {
                        setSeatFor(isSeatOpen ? null : table.spaceId);
                        setJoinOffer(null);
                        setMsg(null);
                        if (!isSeatOpen) setPartyInput(String(Math.max(1, table.partyMin)));
                      }}
                    >
                      {copy.seatParty}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-accent disabled:opacity-40"
                      onClick={() => void run(() => tablesOpenVisit(table.spaceId, "tab"))}
                    >
                      {copy.openTab}
                    </button>
                    {table.needsResetSinceIso ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="min-h-11 rounded-lg border border-orange-700/40 bg-orange-600/10 px-3 text-sm font-medium text-orange-700 hover:bg-orange-600/20 disabled:opacity-40 dark:text-orange-400"
                        onClick={() => void run(() => tablesResetTable(table.spaceId))}
                      >
                        {copy.markReset}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    {table.orderId ? (
                      <button
                        type="button"
                        className="min-h-11 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:opacity-90"
                        onClick={() => router.push(`/${props.tenantSlug}/admin/pos?order=${table.orderId}`)}
                      >
                        {copy.sale}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:bg-accent disabled:opacity-40"
                      onClick={() =>
                        void run(() =>
                          tablesCloseVisit({
                            visitId: table.visitId!,
                            expectedVersion: table.visitVersion ?? undefined,
                          }),
                        )
                      }
                    >
                      {copy.close}
                    </button>
                    {!table.joinedWithSpaceId ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:bg-accent disabled:opacity-40"
                        onClick={() => setMoveFor(isMoveOpen ? null : table.visitId)}
                      >
                        {copy.move}
                      </button>
                    ) : null}
                  </>
                )}
              </div>

              {isSeatOpen ? (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {copy.partySizeLabel}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={partyInput}
                      onChange={(e) => setPartyInput(e.target.value)}
                      className="h-11 w-20 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-11 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
                      onClick={() => void seat(table)}
                    >
                      {copy.confirmSeat}
                    </button>
                    <button
                      type="button"
                      className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-accent"
                      onClick={() => {
                        setSeatFor(null);
                        setJoinOffer(null);
                      }}
                    >
                      {copy.cancel}
                    </button>
                  </div>

                  {joinOffer !== null ? (
                    <div className="mt-3">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        {interpolate(copy.joinNeeded, { n: Math.max(1, Math.trunc(Number(partyInput) || 0)) })}
                      </p>
                      {joinOffer.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{copy.noJoinOptions}</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {joinOffer.map((c) => (
                            <button
                              key={c.spaceId}
                              type="button"
                              disabled={busy}
                              className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:bg-accent disabled:opacity-40"
                              onClick={() => void seat(table, c.spaceId)}
                            >
                              {copy.joinHeading} {c.code ?? c.spaceId}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isMoveOpen ? (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{copy.moveHeading}</p>
                  {(() => {
                    const candidates = props.tables.filter(
                      (t) =>
                        t.state !== "occupied" &&
                        t.spaceId !== table.spaceId &&
                        (table.partySize == null || (table.partySize >= t.partyMin && table.partySize <= t.partyMax)),
                    );
                    if (candidates.length === 0) {
                      return <p className="text-xs text-muted-foreground">{copy.noFreeTables}</p>;
                    }
                    return (
                      <div className="flex flex-wrap gap-2">
                        {candidates.map((dest) => (
                          <button
                            key={dest.spaceId}
                            type="button"
                            disabled={busy}
                            className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:bg-accent disabled:opacity-40"
                            onClick={() =>
                              void run(async () => {
                                const r = await tablesMoveVisit({
                                  visitId: table.visitId!,
                                  spaceId: dest.spaceId,
                                  expectedVersion: table.visitVersion ?? undefined,
                                });
                                if (r.ok) setMoveFor(null);
                                return r;
                              })
                            }
                          >
                            {dest.code ?? dest.name}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
