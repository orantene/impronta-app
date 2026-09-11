"use client";

/**
 * FloorDialogsHost — which sheet or dialog is open over the board, and what
 * each one does when confirmed. Kept apart from `FloorBoard` so the board
 * reads as layout and this reads as the table of moves.
 */

import type { FloorTable } from "@/lib/visits/floor";

import type { FloorBoardCopy } from "./floor-copy";
import type { FloorBookEntry } from "./floor-model";
import type { FloorActions, FloorBoardData, FloorOutcome } from "./floor-types";
import type { FloorOverlay } from "./FloorBoard";
import { DepartedDialog, ResetDialog } from "./FloorDialogs";
import { MoveSheet } from "./MoveSheet";
import { ReservationSheet } from "./ReservationSheet";
import { SeatPartySheet } from "./SeatPartySheet";
import { WaitingSheet, WalkInSheet } from "./WalkInSheets";

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
  readonly onSelect: (spaceId: string | null) => void;
  readonly onNotice: (text: string) => void;
};

export function FloorDialogsHost(props: FloorDialogsHostProps) {
  const { overlay, data, copy, actions, busy, run } = props;

  async function move(table: FloorTable, dest: FloorTable) {
    const r = await run(() =>
      actions.moveVisit({ visitId: table.visitId ?? "", spaceId: dest.spaceId, expectedVersion: table.visitVersion ?? undefined }),
    );
    if (r.ok) {
      props.onClose();
      props.onSelect(dest.spaceId);
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

  async function addToWaitlist(input: { holderName: string; partySize: number }) {
    const r = await run(() => actions.takeWalkIn(input));
    if (r.ok) {
      props.onClose();
      props.onNotice(copy.walkIn.added);
    }
  }

  switch (overlay.kind) {
    case "seat":
      return (
        <SeatPartySheet
          key={`${overlay.table?.spaceId ?? ""}:${overlay.entry?.admissionId ?? ""}`}
          open
          data={data}
          copy={copy}
          table={overlay.table}
          entry={overlay.entry}
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
      return <WaitingSheet open data={data} copy={copy} busy={busy} onClose={props.onClose} onSeat={props.onSeatEntry} onAddParty={props.onOpenWalkIn} />;
    case "move":
      return <MoveSheet key={overlay.table.spaceId} open data={data} copy={copy} table={overlay.table} busy={busy} onClose={props.onClose} onMove={(dest) => void move(overlay.table, dest)} />;
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
