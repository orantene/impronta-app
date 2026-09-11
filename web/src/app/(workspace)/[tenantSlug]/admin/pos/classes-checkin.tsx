"use client";

/**
 * classes-checkin.tsx — one session's check-in, as board B05 draws it: the
 * title with "starts in N min", the three chips (Full · booked / here · not
 * yet / on the waitlist), a name search, All / Not here / Problems, the
 * numbered roster with a state pill and one action per row, and the right
 * column (facts, Scan a pass, Sell drop-in, Add to waitlist, Substitute
 * instructor, the problem notice, Close check-in). B06, "A place opened
 * up", is the dialog offered when a session that had a queue has a free
 * place: offer it to the next in line (the proven promote), sell it as a
 * drop-in (the walk-in seat), or leave it.
 *
 * The pane is `[data-pos-classes-checkin]` keyed by the session id; each
 * ticket row is `[data-pos-classes-roster]` keyed by the admission id with
 * `data-pos-classes-admitted`, the journey's hooks.
 *
 * WIRED: Check in (mark attendance, the `check_in` RPC), Sell drop-in (the
 * walk-in seat), Add to waitlist, Offer the place. NOT WIRED, said on the
 * control (D-POS-19): Undo (no un-admit), Fix (a bad ticket is a refund and
 * a new sale), Scan a pass, Substitute instructor, Close check-in (no
 * no-show state), seat positions.
 */

import { useState } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import type { ClassesRosterEntry, ClassesSession } from "@/lib/pos/classes/day";
import { DEFAULT_WAITLIST_OFFER_MINUTES, type WaitlistEntry } from "@/lib/scheduling/session-waitlist";
import { cn } from "@/lib/utils";

import { fill, formatClock } from "./classes-format";
import { seatsSentence } from "./classes-today";
import { POS_CARD, POS_FIELD, PosAction, PosChip, PosChoice, PosDialog, PosFact, PosPill } from "./classes-ui";

type RosterTab = "all" | "notHere" | "problems";

function isHere(entry: ClassesRosterEntry): boolean {
  return entry.kind === "admission" && entry.admittedCount >= entry.partySize && entry.partySize > 0;
}
function isProblem(entry: ClassesRosterEntry): boolean {
  return entry.kind === "admission" && entry.status !== "valid";
}

export function SessionCheckIn({
  session,
  nowIso,
  timeZone,
  locale,
  copy,
  busy,
  onMark,
  onBookSeat,
  onOpenQueue,
  onOfferPlace,
}: {
  session: ClassesSession;
  /** The server's clock at render, so "starts in N min" is not the browser's. */
  nowIso: string;
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  onMark: (admissionId: string) => void;
  onBookSeat: (session: ClassesSession) => void;
  onOpenQueue: (session: ClassesSession) => void;
  onOfferPlace: (session: ClassesSession, entry: WaitlistEntry) => void;
}) {
  const b = copy.board.checkin;
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<RosterTab>("all");
  const [opened, setOpened] = useState<"offer" | "sell" | "leave" | null>(null);
  const [openedDismissed, setOpenedDismissed] = useState<string | null>(null);

  const seats = session.seats;
  const full = seats.kind === "counted" && seats.remaining <= 0;
  const booked = seats.kind === "counted" ? seats.total - seats.remaining : session.roster.length;
  const total = seats.kind === "counted" ? seats.total : null;
  const here = session.roster.filter(isHere).length;
  const notYet = session.roster.filter((r) => !isHere(r)).length;
  const problems = session.roster.filter(isProblem).length;
  const waiting = session.waitlist.filter((w) => w.state === "waiting" || w.state === "offered").length;
  const minutes = Math.round((Date.parse(session.startsAt) - Date.parse(nowIso)) / 60_000);
  const next = session.waitlist.find((w) => w.id === session.nextInLineId) ?? null;
  const free = seats.kind === "counted" ? seats.remaining : 0;
  // A place opened up: a queue exists and a place is free. Shown once per
  // session unless dismissed.
  const showOpened = free > 0 && next !== null && next.state === "waiting" && openedDismissed !== session.id;

  const filtered = session.roster.filter((r) => {
    if (tab === "notHere" && isHere(r)) return false;
    if (tab === "problems" && !isProblem(r)) return false;
    const name = r.kind === "admission" ? (r.name ?? "") : r.name;
    return query.trim() === "" || name.toLowerCase().includes(query.trim().toLowerCase());
  });
  const firstProblem = session.roster.find(isProblem);

  return (
    <div data-pos-classes-checkin={session.id} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-[10px] border-b border-admin-border px-[16px] py-[12px]">
        <div>
          <div className="font-admin-body text-[22px] font-semibold leading-[1.15] text-admin-ink">
            {session.title} · {formatClock(session.startsAt, timeZone, locale)}
          </div>
          <div className="font-admin-body text-[14px] text-admin-ink-muted">
            {session.offeringTitle && session.offeringTitle !== session.title ? `${session.offeringTitle} · ` : ""}
            {minutes >= 0 ? fill(b.startsIn, { minutes }) : fill(b.startedAgo, { minutes: -minutes })}
          </div>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          <PosChip tone={full ? "critical" : "green"} size="sm">
            {total === null ? seatsSentence(session, copy) : full ? fill(b.fullChip, { booked, total }) : fill(b.bookedChip, { booked, total })}
          </PosChip>
          <PosChip tone="green" size="sm">{fill(b.hereChip, { here, notYet })}</PosChip>
          <PosChip tone="slate" size="sm">{fill(b.waitlistChip, { count: waiting })}</PosChip>
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_240px] gap-[14px] p-[16px]">
        <div className="flex min-h-0 flex-col gap-[12px]">
          <div className="flex items-center gap-[10px]">
            <input className={POS_FIELD} placeholder={b.search} aria-label={b.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div role="group" aria-label={b.tabAll} className="flex shrink-0 gap-[2px] rounded-[12px] bg-admin-surface-alt p-[4px]">
              {(
                [
                  ["all", fill(b.tabAll, { count: session.roster.length })],
                  ["notHere", fill(b.tabNotHere, { count: notYet })],
                  ["problems", fill(b.tabProblems, { count: problems })],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tab === id}
                  className={cn("cursor-pointer whitespace-nowrap rounded-[9px] px-[10px] py-[8px] font-admin-body text-[13px] font-semibold", tab === id ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted")}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={cn(POS_CARD, "min-h-0 flex-1 overflow-y-auto")}>
            {session.roster.length === 0 ? (
              <p className="m-0 px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">{b.nobody}</p>
            ) : (
              <ul className="m-0 list-none divide-y divide-admin-border-soft p-0">
                {filtered.map((entry, index) => (
                  <RosterRow key={entry.kind === "admission" ? entry.admissionId : entry.entryId} n={index + 1} entry={entry} copy={copy} busy={busy} onMark={onMark} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-[10px]">
          <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
            <PosFact label={b.places}>{total === null ? "—" : full ? `${total} · ${copy.board.list.full.toLowerCase()}` : `${booked} / ${total}`}</PosFact>
            <PosFact label={b.here}>{here}</PosFact>
            <PosFact label={b.waitlist}>{waiting}</PosFact>
            <PosFact label={b.positions} muted>
              {b.positionsOff}
            </PosFact>
          </div>
          <PosAction tone="outline" reason={b.scanPassOff} className="px-[10px] text-[14px]">
            {b.scanPass}
          </PosAction>
          <PosAction
            tone="secondary"
            reason={!session.offeringId ? b.sellDropInOff : null}
            disabled={busy || full}
            title={full ? b.sellDropInFull : undefined}
            onClick={() => onBookSeat(session)}
            testAttr={{ "data-pos-classes-sell-dropin": session.id }}
            className="px-[10px] text-[14px]"
          >
            {full ? b.sellDropInFull : b.sellDropIn}
          </PosAction>
          <PosAction disabled={busy} onClick={() => onOpenQueue(session)} testAttr={{ "data-pos-classes-open-queue": session.id }} className="px-[10px] text-[14px]">
            + {b.addToWaitlist}
          </PosAction>
          <PosAction reason={b.substituteOff} className="px-[10px] text-[14px]">
            {b.substitute}
          </PosAction>
          <div className="flex-1" />
          {firstProblem && firstProblem.kind === "admission" ? (
            <div role="alert" className="rounded-[12px] bg-admin-coral-soft px-[14px] py-[12px] font-admin-body text-[14px] leading-[1.45] text-admin-coral-deep">
              {fill(b.notValidNotice, { name: firstProblem.name ?? copy.sessions.unnamed, status: firstProblem.status })}
            </div>
          ) : null}
          <PosAction reason={b.closeCheckinOff} className="whitespace-normal px-[10px] text-[13px] leading-[1.2]">
            {fill(b.closeCheckin, { count: notYet })}
          </PosAction>
        </div>
      </div>

      {showOpened ? (
        <PosDialog
          title={copy.board.opened.title}
          subtitle={fill(copy.board.opened.subtitle, { free, waiting })}
          onClose={() => setOpenedDismissed(session.id)}
          closeLabel={copy.board.opened.later}
          footer={
            <>
              <PosAction onClick={() => setOpenedDismissed(session.id)}>{copy.board.opened.later}</PosAction>
              <PosAction
                tone="primary"
                disabled={busy}
                className="h-[56px] text-[17px]"
                onClick={() => {
                  if (opened === "sell") onBookSeat(session);
                  else if (opened === "leave") setOpenedDismissed(session.id);
                  else onOfferPlace(session, next);
                }}
                testAttr={{ "data-pos-classes-opened-confirm": session.id }}
              >
                {opened === "sell" ? b.sellDropIn : opened === "leave" ? copy.board.opened.leaveEmpty : fill(copy.board.opened.offerButton, { name: next.customerName })}
              </PosAction>
            </>
          }
        >
          <PosChoice
            selected={opened === null || opened === "offer"}
            title={fill(copy.board.opened.offerTo, { name: next.customerName, n: next.position })}
            hint={fill(copy.board.opened.offerHint, { minutes: DEFAULT_WAITLIST_OFFER_MINUTES })}
            onSelect={() => setOpened("offer")}
          />
          <PosChoice selected={opened === "sell"} title={copy.board.opened.sellDropIn} hint={copy.board.opened.sellHint} onSelect={() => setOpened("sell")} reason={session.offeringId ? null : b.sellDropInOff} />
          <PosChoice selected={opened === "leave"} title={copy.board.opened.leaveEmpty} hint="" onSelect={() => setOpened("leave")} />
        </PosDialog>
      ) : null}
    </div>
  );
}

function RosterRow({ n, entry, copy, busy, onMark }: { n: number; entry: ClassesRosterEntry; copy: ClassesCopy; busy: boolean; onMark: (admissionId: string) => void }) {
  const b = copy.board.checkin;
  if (entry.kind === "waitlist_place") {
    return (
      <li className="grid grid-cols-[24px_minmax(0,1fr)_96px_104px] items-center gap-[10px] px-[14px] py-[10px] font-admin-body" data-pos-classes-roster="waitlist_place">
        <span className="text-[15px] text-admin-ink-muted">{n}</span>
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-semibold text-admin-ink">{entry.name}</span>
          <span className="block text-[13px] text-admin-ink-muted">{copy.sessions.fromList}</span>
        </span>
        <span title={copy.sessions.fromListHint}>
          <PosPill tone="slate">{b.bookedState}</PosPill>
        </span>
        <span />
      </li>
    );
  }
  const here = isHere(entry);
  const problem = entry.status !== "valid";
  const partial = entry.admittedCount > 0 && !here;
  return (
    <li
      className="grid grid-cols-[24px_minmax(0,1fr)_96px_104px] items-center gap-[10px] px-[14px] py-[10px] font-admin-body"
      data-pos-classes-roster={entry.admissionId}
      data-pos-classes-admitted={entry.admittedCount}
    >
      <span className="text-[15px] text-admin-ink-muted">{n}</span>
      <span className="min-w-0">
        <span className="block truncate text-[16px] font-semibold text-admin-ink">{entry.name ?? copy.sessions.unnamed}</span>
        <span className="block text-[13px] text-admin-ink-muted">
          {problem
            ? fill(copy.sessions.notValid, { status: entry.status })
            : partial
              ? fill(copy.sessions.partOfParty, { admitted: entry.admittedCount, party: entry.partySize })
              : entry.partySize > 1
                ? fill(copy.sessions.partOfParty, { admitted: 0, party: entry.partySize })
                : b.bookedState}
        </span>
      </span>
      <PosPill tone={problem ? "critical" : here ? "green" : "slate"}>{problem ? b.cantAttend : here ? b.hereState : b.bookedState}</PosPill>
      {problem ? (
        <PosAction tone="danger" reason={b.fixOff} className="h-[40px] px-[10px]">
          {b.fix}
        </PosAction>
      ) : here ? (
        <PosAction reason={b.undoOff} className="h-[40px]">
          {b.undo}
        </PosAction>
      ) : (
        <PosAction tone="outline" disabled={busy} className="h-[40px] px-[10px]" onClick={() => onMark(entry.admissionId)}>
          {busy ? copy.sessions.marking : copy.sessions.mark}
        </PosAction>
      )}
    </li>
  );
}
