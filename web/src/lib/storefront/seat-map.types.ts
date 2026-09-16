/**
 * seat_map — the types the island codes against.
 *
 * A pinch-zoom map of one event night: every seat with its state, the
 * person's own live hold and when it runs out. The act holds seats through
 * the admissions engine (with its TTL) or releases the person's own hold.
 * Buying the held seats is `ticket_picker`'s `startTicketPurchase` with the
 * hold ids.
 */

import type { StorefrontRefusal } from "./refusals";

export type SeatMapProps = {
  eventId: string;
  /** The night. Omit to take the event's next scheduled session. */
  sessionId?: string | null;
  locale?: string | null;
};

export type SeatState = "free" | "held" | "mine" | "sold";

export type SeatMapSeat = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  shape: string | null;
  state: SeatState;
};

export type SeatMapData = {
  eventId: string;
  eventTitle: string;
  sessionId: string;
  startsAtIso: string;
  endsAtIso: string;
  timezone: string | null;
  layout: { id: string; name: string; canvas: { w: number; h: number } } | null;
  seats: SeatMapSeat[];
  /** The person's live hold on this night, if any. */
  hold: { ids: string[]; seatIds: string[]; expiresAtIso: string } | null;
  /** How long a fresh hold lasts. */
  holdTtlSeconds: number;
};

export type SeatMapInput =
  | {
      op: "hold";
      tenantId: string;
      eventId: string;
      sessionId: string;
      seatIds: string[];
      /** Per selection; the engine replays the same hold for the same key. */
      operationKey: string;
      locale?: string | null;
    }
  | { op: "release"; tenantId: string; sessionId: string; locale?: string | null };

export type SeatMapDone =
  | { ok: true; op: "hold"; holdId: string; holdIds: string[]; seatIds: string[]; expiresAtIso: string; already: boolean }
  | { ok: true; op: "release"; released: number };

export type SeatMapResult = SeatMapDone | StorefrontRefusal;
