"use client";

/**
 * classes-checkin.tsx — one session's check-in, as board B05 draws it: the
 * class fills the content area (the header names it, `classes-header.tsx`),
 * a strip of three chips under the header (Full · booked / here · not yet /
 * on the waitlist, `CheckinStrip`), then a 1fr + 360px grid: the name
 * search with All / Not here / Problems over the numbered roster (n · name ·
 * note · state pill · one action per row), and the right column (facts,
 * Scan a pass, Sell drop-in, Add to waitlist, Substitute instructor, the
 * problem notice, Close check-in). B06, "A place opened up", is the dialog
 * offered when a session that had a queue has a free place: offer it to the
 * next in line (the proven promote), sell it as a drop-in (the walk-in
 * seat), or leave it.
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

import { fill } from "./classes-format";
import { POS_CARD, POS_FIELD, PosAction, PosChip, PosChoice, PosDialog, PosFact, PosIcon, PosNote, PosSegmented } from "./classes-ui";

type RosterTab = "all" | "notHere" | "problems";

function isHere(entry: ClassesRosterEntry): boolean {
  return entry.kind === "admission" && entry.admittedCount >= entry.partySize && entry.partySize > 0;
}
function isProblem(entry: ClassesRosterEntry): boolean {
  return entry.kind === "admission" && entry.status !== "valid";
}

/** The numbers the strip, the facts card and the tabs all read. */
function facts(session: ClassesSession) {
  const seats = session.seats;
  const full = seats.kind === "counted" && seats.remaining <= 0;
  const booked = seats.kind === "counted" ? seats.total - seats.remaining : session.roster.length;
  const total = seats.kind === "counted" ? seats.total : null;
  const here = session.roster.filter(isHere).length;
  const notYet = session.roster.filter((r) => !isHere(r)).length;
  const problems = session.roster.filter(isProblem).length;
  const waiting = session.waitlist.filter((w) => w.state === "waiting" || w.state === "offered").length;
  const free = seats.kind === "counted" ? seats.remaining : 0;
  return { full, booked, total, here, notYet, problems, waiting, free };
}

/** The 46px strip under the header (B05): the three chips. */
export function CheckinStrip({ session, copy }: { session: ClassesSession; copy: ClassesCopy }) {
  const b = copy.board.checkin;
  const f = facts(session);
  return (
    <div className="flex h-[46px] shrink-0 items-center gap-[8px] border-b border-admin-border bg-admin-surface px-[22px]" data-pos-classes-checkin-strip>
      <PosChip tone={f.full ? "critical" : "green"}>
        {f.total === null ? fill(copy.sessions.seats, { taken: f.booked, total: "?" }) : f.full ? fill(b.fullChip, { booked: f.booked, total: f.total }) : fill(b.bookedChip, { booked: f.booked, total: f.total })}
      </PosChip>
      <PosChip tone="brand">{fill(b.hereChip, { here: f.here, notYet: f.notYet })}</PosChip>
      <PosChip tone="slate">{fill(b.waitlistChip, { count: f.waiting })}</PosChip>
    </div>
  );
}

export function SessionCheckIn({
  session,
  copy,
  busy,
  onMark,
  onBookSeat,
  onOpenQueue,
  onOfferPlace,
}: {
  session: ClassesSession;
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

  const f = facts(session);
  const next = session.waitlist.find((w) => w.id === session.nextInLineId) ?? null;
  // A place opened up: a queue exists and a place is free. Shown once per
  // session unless dismissed.
  const showOpened = f.free > 0 && next !== null && next.state === "waiting" && openedDismissed !== session.id;

  const filtered = session.roster.filter((r) => {
    if (tab === "notHere" && isHere(r)) return false;
    if (tab === "problems" && !isProblem(r)) return false;
    const name = r.kind === "admission" ? (r.name ?? "") : r.name;
    return query.trim() === "" || name.toLowerCase().includes(query.trim().toLowerCase());
  });
  const firstProblem = session.roster.find(isProblem);

  return (
    <div data-pos-classes-checkin={session.id} className="relative grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-h-0 min-w-0 flex-col gap-[12px] px-[22px] py-[14px]">
        <div className="flex items-center gap-[10px]">
          <label className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-admin-ink-dim">
              <PosIcon name="search" size={18} />
            </span>
            <input className={cn(POS_FIELD, "pl-[42px]")} placeholder={b.search} aria-label={b.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <PosSegmented<RosterTab>
            label={b.tabAll}
            value={tab}
            onChange={setTab}
            size="lg"
            options={[
              { id: "all", label: fill(b.tabAll, { count: session.roster.length }) },
              { id: "notHere", label: fill(b.tabNotHere, { count: f.notYet }) },
              { id: "problems", label: fill(b.tabProblems, { count: f.problems }) },
            ]}
          />
        </div>
        <div className={cn(POS_CARD, "min-h-0 flex-1 overflow-y-auto")}>
          {session.roster.length === 0 ? (
            <p className="m-0 px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">{b.nobody}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {filtered.map((entry, index) => (
                <RosterRow key={entry.kind === "admission" ? entry.admissionId : entry.entryId} n={index + 1} entry={entry} copy={copy} busy={busy} onMark={onMark} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-[12px] border-l border-admin-border bg-admin-card p-[18px]">
        <div className={cn(POS_CARD, "px-[14px] py-[12px]")}>
          <PosFact label={b.places}>{f.total === null ? "—" : f.full ? `${f.total} · ${copy.board.list.full.toLowerCase()}` : `${f.booked} / ${f.total}`}</PosFact>
          <PosFact label={b.here}>{f.here}</PosFact>
          <PosFact label={b.waitlist}>{f.waiting}</PosFact>
          <PosFact label={b.positions} muted>
            {b.positionsOff}
          </PosFact>
        </div>
        <PosAction tone="outline" reason={b.scanPassOff} className="w-full">
          <PosIcon name="scan" />
          {b.scanPass}
        </PosAction>
        <PosAction
          tone="secondary"
          reason={!session.offeringId ? b.sellDropInOff : null}
          disabled={busy || f.full}
          title={f.full ? b.sellDropInFull : undefined}
          onClick={() => onBookSeat(session)}
          testAttr={{ "data-pos-classes-sell-dropin": session.id }}
          className={cn("w-full", f.full && "border-transparent bg-admin-surface-alt text-admin-ink-dim")}
        >
          {f.full ? b.sellDropInFull : b.sellDropIn}
        </PosAction>
        <PosAction disabled={busy} onClick={() => onOpenQueue(session)} testAttr={{ "data-pos-classes-open-queue": session.id }} className="w-full">
          <PosIcon name="plus" />
          {b.addToWaitlist}
        </PosAction>
        <PosAction reason={b.substituteOff} className="w-full">
          <PosIcon name="person" />
          {b.substitute}
        </PosAction>
        <div className="flex-1" />
        {firstProblem && firstProblem.kind === "admission" ? (
          <PosNote tone="coral" role="alert">
            {fill(b.notValidNotice, { name: firstProblem.name ?? copy.sessions.unnamed, status: firstProblem.status })}
          </PosNote>
        ) : null}
        <PosAction reason={b.closeCheckinOff} className="w-full whitespace-normal px-[12px]">
          {fill(b.closeCheckin, { count: f.notYet })}
        </PosAction>
      </div>

      {showOpened ? (
        <PosDialog
          title={copy.board.opened.title}
          subtitle={fill(copy.board.opened.subtitle, { free: f.free, waiting: f.waiting })}
          onClose={() => setOpenedDismissed(session.id)}
          closeLabel={copy.board.opened.later}
          footer={
            <>
              <PosAction onClick={() => setOpenedDismissed(session.id)}>{copy.board.opened.later}</PosAction>
              <PosAction
                tone="primary"
                size="lg"
                disabled={busy}
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
          <PosNote tone="slate">{copy.board.opened.policyNote}</PosNote>
        </PosDialog>
      ) : null}
    </div>
  );
}

const ROSTER_ROW = "grid grid-cols-[36px_1.3fr_1.1fr_140px_110px] items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[12px] font-admin-body first:border-t-0";

function RosterRow({ n, entry, copy, busy, onMark }: { n: number; entry: ClassesRosterEntry; copy: ClassesCopy; busy: boolean; onMark: (admissionId: string) => void }) {
  const b = copy.board.checkin;
  if (entry.kind === "waitlist_place") {
    return (
      <li className={ROSTER_ROW} data-pos-classes-roster="waitlist_place">
        <span className="text-[15px] text-admin-ink-muted">{n}</span>
        <span className="min-w-0 truncate text-[15px] font-semibold text-admin-ink">{entry.name}</span>
        <span className="min-w-0 text-[14px] text-admin-ink-muted" title={copy.sessions.fromListHint}>
          {copy.sessions.fromList}
        </span>
        <PosChip tone="slate" size="sm">
          {b.bookedState}
        </PosChip>
        <span />
      </li>
    );
  }
  const here = isHere(entry);
  const problem = entry.status !== "valid";
  const partial = entry.admittedCount > 0 && !here;
  return (
    <li className={ROSTER_ROW} data-pos-classes-roster={entry.admissionId} data-pos-classes-admitted={entry.admittedCount}>
      <span className="text-[15px] text-admin-ink-muted">{n}</span>
      <span className="min-w-0 truncate text-[15px] font-semibold text-admin-ink">{entry.name ?? copy.sessions.unnamed}</span>
      <span className="min-w-0 text-[14px] leading-[1.2] text-admin-ink-muted">
        {problem
          ? fill(copy.sessions.notValid, { status: entry.status })
          : partial
            ? fill(copy.sessions.partOfParty, { admitted: entry.admittedCount, party: entry.partySize })
            : entry.partySize > 1
              ? fill(copy.sessions.partOfParty, { admitted: 0, party: entry.partySize })
              : b.bookedState}
      </span>
      <PosChip tone={problem ? "critical" : here ? "green" : "slate"} size="sm">
        {problem ? b.cantAttend : here ? b.hereState : b.bookedState}
      </PosChip>
      {problem ? (
        <PosAction tone="danger" size="sm" reason={b.fixOff} className="w-full px-[10px]">
          {b.fix}
        </PosAction>
      ) : here ? (
        <PosAction size="sm" reason={b.undoOff} className="w-full px-[10px]">
          {b.undo}
        </PosAction>
      ) : (
        <PosAction tone="outline" size="sm" disabled={busy} className="w-full px-[10px]" onClick={() => onMark(entry.admissionId)}>
          {busy ? copy.sessions.marking : copy.sessions.mark}
        </PosAction>
      )}
    </li>
  );
}
