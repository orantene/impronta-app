"use client";

/**
 * The Reservations destination: the workspace's Live Floor (`LiveFloor.dc.html`).
 *
 * The SAME board the till's Tables mode draws (`components/admin/floor`),
 * inside the admin shell instead of the POS frame: the page header with the
 * venue's service and the Live dot, `Walk-in · New reservation · Pause
 * online bookings`, the Arrivals / Waitlist / Seated column, the map, the
 * timeline and the list. Every write is the Spaces page's own action, the
 * host stand's walk-in, and the till's staff reservation: one engine, a
 * second door. "Open order" opens the check on the counter.
 */

import { useState } from "react";

import { FloorBoard } from "@/components/admin/floor/FloorBoard";
import type { FloorBoardCopy } from "@/components/admin/floor/floor-copy";
import type { FloorActions, FloorBoardData } from "@/components/admin/floor/floor-types";

import { floorCreateReservation, floorLoadReserveTimes } from "../pos/floor-actions";
import { tablesCloseVisit, tablesMoveVisit, tablesResetTable, tablesSeatParty } from "../tables/actions";
import { reservationsTakeWalkIn } from "./actions";

const ACTIONS: FloorActions = {
  seatParty: (input) => tablesSeatParty(input),
  closeVisit: (input) => tablesCloseVisit(input),
  moveVisit: (input) => tablesMoveVisit(input),
  resetTable: (spaceId) => tablesResetTable(spaceId),
  takeWalkIn: (input) => reservationsTakeWalkIn(input),
  loadReserveTimes: (input) => floorLoadReserveTimes(input),
  createReservation: (input) => floorCreateReservation(input),
};

export function LiveFloorClient(props: {
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly title: string;
  readonly subtitle: string;
  /** This request's own `/…/admin/pos` path, so the check opens on the right host. */
  readonly posPath: string;
}) {
  const [view, setView] = useState<"floor" | "timeline" | "list">("floor");
  return (
    <FloorBoard
      data={props.data}
      actions={ACTIONS}
      copy={props.copy}
      checkHref={(orderId) => `${props.posPath}?mode=counter&order=${encodeURIComponent(orderId)}`}
      view={view}
      onViewChange={setView}
      header={{ title: props.title, subtitle: props.subtitle }}
    />
  );
}
