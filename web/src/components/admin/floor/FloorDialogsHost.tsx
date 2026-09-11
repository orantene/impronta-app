"use client";

/**
 * FloorDialogsHost — which sheet or dialog is open over the board, and what
 * each one does when confirmed. Kept apart from `FloorBoard` so the board
 * reads as layout and this reads as the table of moves.
 */

import { interpolate } from "@/i18n/interpolate";
import type { FloorTable } from "@/lib/visits/floor";

import type { FloorBoardCopy } from "./floor-copy";
import { tableCode, type FloorBookEntry } from "./floor-model";
import type { FloorActions, FloorBoardData, FloorOutcome, FloorWaitlistEntry } from "./floor-types";
import type { FloorOverlay } from "./FloorBoard";
import { ChangeServerSheet } from "./ChangeServerSheet";
import { DepartedDialog, ResetDialog } from "./FloorDialogs";
import { MergeChecksSheet } from "./MergeChecksSheet";
import { MoveSheet } from "./MoveSheet";
import { SplitCheckSheet } from "./SplitCheckSheet";
import { ReservationSheet } from "./ReservationSheet";
import { SeatPartySheet } from "./SeatPartySheet";
import { WaitingSheet, WalkInSheet } from "./WalkInSheets";

/** A short, stable digest of a set of ids (djb2 over the sorted list). */
function foldIds(ids: readonly string[]): string {
  let h = 5381;
  for (const ch of [...ids].sort().join(",")) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return `${ids.length}-${h.toString(36)}`;
}

export type FloorDialogsHostProps = {
  readonly overlay: FloorOverlay;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly actions: FloorActions;
  readonly busy: boolean;
  readonly run: (fn: () => Promise<FloorOutcome>) => Promise<FloorOutcome>;
  readonly checkHref: (orderId: string) => string;
  readonly onClose: () => void;
  readonly onSeat: (input: { spaceId: string; joinedSpaceId?: string; partySize: number; admissionId?: string }) => Promise<void>;
  readonly onOpenWalkIn: () => void;
  readonly onSeatEntry: (entry: FloorBookEntry) => void;
  readonly onSeatWaitlist: (entry: FloorWaitlistEntry) => void;
  readonly onSelect: (spaceId: string | null) => void;
  readonly onNotice: (text: string) => void;
  /** T12 → T16: the chooser's merge card opens the merge sheet. */
  readonly onOpenMerge: (table: FloorTable) => void;
  /** T16 → T12: the merge sheet's Back returns to the chooser. */
  readonly onOpenMove: (table: FloorTable) => void;
};

export function FloorDialogsHost(props: FloorDialogsHostProps) {
  const { overlay, data, copy, actions, busy, run } = props;

  // The version the floor read goes with the move (`visit_transfer`'s
  // `expectedVersion`): a host looking at a stale board is refused as a
  // conflict, never applied on top of another host's move. The operation
  // key is derived from the same facts, so a double tap is one move.
  async function move(table: FloorTable, dest: FloorTable) {
    const visitId = table.visitId ?? "";
    const version = table.visitVersion ?? 0;
    const r = await run(() =>
      actions.moveVisit({ visitId, spaceId: dest.spaceId, expectedVersion: version, operationKey: `move:${visitId}:${version}:${dest.spaceId.slice(0, 8)}` }),
    );
    if (r.ok) {
      props.onClose();
      props.onSelect(dest.spaceId);
    }
  }

  async function merge(into: FloorTable, from: FloorTable) {
    const mergeChecks = actions.mergeChecks;
    if (!mergeChecks) return;
    const r = await run(() =>
      mergeChecks({ fromVisitId: from.visitId ?? "", intoVisitId: into.visitId ?? "", operationKey: `merge:${from.visitId}:${(into.visitId ?? "").slice(0, 8)}:${from.visitVersion ?? 0}` }),
    );
    if (r.ok) {
      props.onClose();
      props.onNotice(interpolate(copy.engine.merge.done, { code: tableCode(from), into: tableCode(into) }));
    }
  }

  async function changeServer(table: FloorTable, userId: string) {
    const change = actions.changeServer;
    if (!change) return;
    const r = await run(() => change({ visitId: table.visitId ?? "", userId }));
    if (r.ok) {
      props.onClose();
      props.onNotice(interpolate(copy.engine.server.done, { code: tableCode(table), name: data.servers?.find((p) => p.userId === userId)?.name ?? "" }));
    }
  }

  async function split(table: FloorTable, lineIds: string[]) {
    const splitCheck = actions.splitCheck;
    if (!splitCheck) return;
    // The key names THIS selection of lines, folded so it fits the engine's
    // 80-char cap: the same lines twice is one split, a different pick is another.
    const r = await run(() => splitCheck({ visitId: table.visitId ?? "", lineIds, operationKey: `split:${table.visitId}:${foldIds(lineIds)}` }));
    if (r.ok) {
      props.onClose();
      props.onNotice(interpolate(copy.engine.split.done, { n: lineIds.length }));
    }
  }

  async function endVisit(table: FloorTable) {
    const r = await run(() => actions.closeVisit({ visitId: table.visitId ?? "", expectedVersion: table.visitVersion ?? undefined }));
    if (r.ok) {
      props.onClose();
      props.onSelect(null);
    }
  }

  async function reset(table: FloorTable) {
    const r = await run(() => actions.resetTable(table.spaceId));
    if (r.ok) {
      props.onClose();
      props.onSelect(null);
    }
  }

  async function addToWaitlist(input: { holderName: string; partySize: number; holderPhone?: string }) {
    const r = await run(() => actions.takeWalkIn(input));
    if (r.ok) {
      props.onClose();
      props.onNotice(copy.walkIn.added);
    }
  }

  async function offerWaitlist(entry: FloorWaitlistEntry) {
    const r = await run(() =>
      actions.notifyWaitlist({
        id: entry.id,
        expectedVersion: entry.version,
        holderPhone: entry.holderPhone,
        holderEmail: entry.holderEmail,
      }),
    );
    if (r.ok) props.onNotice(copy.waiting.notifyNone);
  }

  async function removeWaitlist(entry: FloorWaitlistEntry) {
    const r = await run(() => actions.leaveWaitlist({ id: entry.id, expectedVersion: entry.version }));
    if (r.ok) props.onClose();
  }

  switch (overlay.kind) {
    case "seat":
      return (
        <SeatPartySheet
          key={`${overlay.table?.spaceId ?? ""}:${overlay.entry?.admissionId ?? overlay.waitlist?.id ?? ""}`}
          open
          data={data}
          copy={copy}
          table={overlay.table}
          entry={overlay.entry}
          waitlist={overlay.waitlist ?? null}
          busy={busy}
          onClose={props.onClose}
          onSeat={(input) => void props.onSeat(input)}
        />
      );
    case "walk-in":
      return (
        <WalkInSheet
          open
          data={data}
          copy={copy}
          busy={busy}
          onClose={props.onClose}
          onSeatNow={(table, partySize) => void props.onSeat({ spaceId: table.spaceId, partySize })}
          onAddToWaitlist={(input) => void addToWaitlist(input)}
        />
      );
    case "waiting":
      return (
        <WaitingSheet
          open
          data={data}
          copy={copy}
          busy={busy}
          onClose={props.onClose}
          onSeat={props.onSeatWaitlist}
          onOffer={(entry) => void offerWaitlist(entry)}
          onRemove={(entry) => void removeWaitlist(entry)}
          onAddParty={props.onOpenWalkIn}
        />
      );
    case "move":
      return (
        <MoveSheet
          key={overlay.table.spaceId}
          open
          data={data}
          copy={copy}
          table={overlay.table}
          busy={busy}
          onClose={props.onClose}
          onMove={(dest) => void move(overlay.table, dest)}
          onMerge={actions.mergeChecks ? () => props.onOpenMerge(overlay.table) : undefined}
        />
      );
    case "merge":
      return (
        <MergeChecksSheet
          key={overlay.table.spaceId}
          open
          data={data}
          copy={copy}
          table={overlay.table}
          busy={busy}
          onClose={props.onClose}
          onBack={() => props.onOpenMove(overlay.table)}
          onMerge={(from) => void merge(overlay.table, from)}
        />
      );
    case "server":
      return (
        <ChangeServerSheet key={overlay.table.spaceId} open data={data} copy={copy} table={overlay.table} busy={busy} onClose={props.onClose} onChange={(userId) => void changeServer(overlay.table, userId)} />
      );
    case "split":
      return actions.loadCheckLines ? (
        <SplitCheckSheet
          key={overlay.table.spaceId}
          open
          data={data}
          copy={copy}
          table={overlay.table}
          busy={busy}
          loadLines={actions.loadCheckLines}
          checkHref={props.checkHref}
          onClose={props.onClose}
          onSplit={(lineIds) => void split(overlay.table, lineIds)}
        />
      ) : null;
    case "departed":
      return <DepartedDialog open data={data} copy={copy} table={overlay.table} busy={busy} onClose={props.onClose} onConfirm={() => void endVisit(overlay.table)} />;
    case "reset":
      return <ResetDialog key={overlay.table.spaceId} open data={data} copy={copy} table={overlay.table} busy={busy} onClose={props.onClose} onConfirm={() => void reset(overlay.table)} />;
    case "reservation":
      return actions.loadReserveTimes && actions.createReservation ? (
        <ReservationSheet
          open
          data={data}
          copy={copy}
          busy={busy}
          loadTimes={actions.loadReserveTimes}
          create={actions.createReservation}
          checkHref={props.checkHref}
          onClose={props.onClose}
          onDone={(text) => {
            props.onNotice(text);
          }}
        />
      ) : null;
    default:
      return null;
  }
}
