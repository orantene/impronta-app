/**
 * floor-types.ts — what the floor board is given, and what it may call.
 *
 * The board never fetches and never imports a server action: the route that
 * mounts it (the POS Tables mode, the workspace's Live Floor) hands it the
 * rows it read and the writers it may call, so the same component draws the
 * same room in both places over the same engine.
 */

import type { FloorTable } from "@/lib/visits/floor";

import type { FloorBoardCopy } from "./floor-copy";
import type { FloorBookEntry, FloorTicket } from "./floor-model";

export type FloorWaitlistEntry = {
  readonly id: string;
  readonly holderName: string;
  readonly partySize: number;
  readonly holderPhone: string | null;
  readonly holderEmail: string | null;
  readonly quotedMinutes: number | null;
  readonly status: "waiting" | "notified";
  readonly joinedAtIso: string;
  readonly notifiedAtIso: string | null;
  readonly notifyExpiresAtIso: string | null;
  readonly position: number;
  readonly version: number;
};

/** Every writer answers in this shape: a code, never a sentence. */
export type FloorOutcome =
  | { ok: true; reservationWarning?: string; revision?: number; amended?: boolean; admissionId?: string }
  | { ok: false; reason: string };

export type FloorReserveSlot = {
  readonly startsAtIso: string;
  readonly label: string;
  readonly isLastSeating: boolean;
  readonly isUpsize: boolean;
};

export type FloorReserveTimes =
  | { ok: true; onDate: string; dates: string[]; slots: FloorReserveSlot[]; depositCents: number; currency: string }
  | { ok: false; reason: string; dates: string[] };

export type FloorReserveResult =
  | { ok: true; orderId: string; admissionId: string; collectCents: number }
  | { ok: false; reason: string };

/** One line of an open check, for the split sheet (T18). */
export type FloorCheckLine = {
  readonly id: string;
  readonly label: string;
  readonly units: number;
  readonly totalCents: number;
};

export type FloorCheckLinesResult =
  | { ok: true; currency: string; version: number; lines: FloorCheckLine[] }
  | { ok: false; reason: string };

/** A person a table can be handed to (T17). */
export type FloorServer = {
  readonly userId: string;
  readonly name: string;
};

export type FloorActions = {
  readonly seatParty: (input: {
    spaceId: string;
    partySize: number;
    joinedSpaceId?: string;
    admissionId?: string;
  }) => Promise<FloorOutcome>;
  readonly closeVisit: (input: { visitId: string; expectedVersion?: number }) => Promise<FloorOutcome>;
  /**
   * T13: the engine's `visit_transfer`, with the version the floor read so a
   * stale screen is refused (`conflict`) rather than moving a party twice.
   */
  readonly moveVisit: (input: { visitId: string; spaceId: string; expectedVersion: number; operationKey: string }) => Promise<FloorOutcome>;
  /** T16: `visit_merge_checks`; absent where the surface has no writer for it. */
  readonly mergeChecks?: (input: { fromVisitId: string; intoVisitId: string; operationKey: string }) => Promise<FloorOutcome>;
  /** T17: `visit_change_server`. */
  readonly changeServer?: (input: { visitId: string; userId: string }) => Promise<FloorOutcome>;
  /** T18: `visit_split_check`, the chosen lines onto a new draft on the same visit. */
  readonly splitCheck?: (input: { visitId: string; lineIds: string[]; operationKey: string }) => Promise<FloorOutcome & { orderId?: string }>;
  /** The lines of one open check, for the split sheet. */
  readonly loadCheckLines?: (orderId: string) => Promise<FloorCheckLinesResult>;
  readonly resetTable: (spaceId: string) => Promise<FloorOutcome>;
  /** Absent on a surface with no kitchen send (the workspace's Live Floor). */
  readonly sendToKitchen?: (orderId: string) => Promise<FloorOutcome>;
  /** T26: fire one course's lines on the open visit. */
  readonly fireCourse?: (input: { visitId: string; courseSeq: number }) => Promise<FloorOutcome>;
  readonly takeWalkIn: (input: { holderName: string; partySize: number; holderPhone?: string }) => Promise<FloorOutcome>;
  readonly notifyWaitlist: (input: { id: string; expectedVersion?: number; holderPhone?: string | null; holderEmail?: string | null }) => Promise<FloorOutcome>;
  readonly seatWaitlist: (input: { id: string; spaceId: string; expectedVersion?: number }) => Promise<FloorOutcome>;
  readonly leaveWaitlist: (input: { id: string; expectedVersion?: number }) => Promise<FloorOutcome>;
  /** The staff reservation (R01). Absent when the surface has no writer for it. */
  readonly loadReserveTimes?: (input: { onDate: string | null; partySize: number }) => Promise<FloorReserveTimes>;
  readonly createReservation?: (input: {
    onDate: string;
    startsAtIso: string;
    partySize: number;
    name: string;
    email: string;
    phone: string;
  }) => Promise<FloorReserveResult>;
};

export type FloorBoardData = {
  readonly locale: string;
  /** The VENUE's IANA zone; every instant printed goes through it. */
  readonly timeZone: string;
  /** The server's clock at render, ISO. The board never reads its own. */
  readonly nowIso: string;
  /** Tonight's service, when the venue has one configured for today. */
  readonly service: { label: string; startsAtIso: string; endsAtIso: string } | null;
  readonly defaultTurnMinutes: number;
  readonly tables: readonly FloorTable[];
  readonly book: readonly FloorBookEntry[];
  readonly partyWaitlist: readonly FloorWaitlistEntry[];
  readonly tickets: Readonly<Record<string, FloorTicket>>;
  /** Each open check's own currency, by order id; a check not listed reads as USD. */
  readonly currencies: Readonly<Record<string, string>>;
  readonly walkinsEnabled: boolean;
  readonly waitlistEnabled: boolean;
  /** Whether the venue's rules make it bookable at all (`reservationOfferingId` set). */
  readonly bookable: boolean;
  /** Active layout canvas from W13; tiles use it when tables carry layoutRect. */
  readonly layoutCanvas?: { w: number; h: number } | null;
  /** The workspace's people, for `Change server` (T17); empty where not read. */
  readonly servers?: readonly FloorServer[];
};

export type FloorBoardProps = {
  readonly data: FloorBoardData;
  readonly actions: FloorActions;
  readonly copy: FloorBoardCopy;
  /** Where "Open order" and "Collect" go: the counter's basket on this check. */
  readonly checkHref: (orderId: string) => string;
  /** The board's view, owned by the caller so the header can name it. */
  readonly view: "floor" | "timeline" | "list";
  readonly onViewChange: (view: "floor" | "timeline" | "list") => void;
  /** "Orders": the list narrowed to the open checks. */
  readonly ordersOnly?: boolean;
  /**
   * The workspace's Live Floor (`LiveFloor.dc.html`) carries the page's own
   * header: title, venue line, the Live dot and the actions on one row above
   * the board, and the view switch as text under it. The till's frame
   * (`POSLiveFloor`) puts the actions under the map instead.
   */
  readonly header?: { readonly title: string; readonly subtitle: string };
  readonly className?: string;
};
