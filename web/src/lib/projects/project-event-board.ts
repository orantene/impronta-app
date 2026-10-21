/**
 * project-event-board.ts — the Event board on Projects > Team (TUL-1603). Pure.
 * Feeds the project's assignments and each person's own answer into
 * `buildEventBoard`, so there is one board and not a second screen for the same data.
 *
 * Each assignment is one seat. Seats with the same role label are one role
 * ("needed" = how many seats). Only a person who confirmed fills a seat; no
 * state, an unknown read, or a seat with no profile behind it is "awaiting".
 */

import { buildEventBoard, type BoardRole, type EventBoard } from "@/lib/coordinator/event-board";
import type { ConfirmationsRead } from "./assignment-confirmation";
import type { ProjectAssignment } from "./project-record";

export type SeatState = "confirmed" | "declined" | "awaiting";

export type ProjectEventBoard = {
  board: EventBoard;
  stateByAssignment: Record<string, SeatState>;
  /** False when confirmations could not be read; the UI says so instead of showing zero as fact. */
  stateAvailable: boolean;
};

export function projectEventBoard(input: {
  assignments: readonly ProjectAssignment[];
  startsAt: string | null;
  confirmations: ConfirmationsRead;
}): ProjectEventBoard {
  const known = input.confirmations.ok ? input.confirmations.byAssignment : {};
  const stateByAssignment: Record<string, SeatState> = {};
  const roles = new Map<string, BoardRole>();
  for (const a of input.assignments) {
    const state: SeatState = a.talentProfileId ? (known[a.id] ?? "awaiting") : "awaiting";
    stateByAssignment[a.id] = state;
    const key = (a.roleLabel ?? "").trim();
    const role = roles.get(key) ?? { id: key || "role", role: key, needed: 0, callTime: input.startsAt, people: [] };
    role.needed += 1;
    role.people.push({
      talentProfileId: a.talentProfileId ?? a.id,
      name: a.name,
      status: state === "confirmed" ? "confirmed" : state === "declined" ? "declined" : "invited",
      locale: "",
    });
    roles.set(key, role);
  }
  return {
    board: buildEventBoard([...roles.values()]),
    stateByAssignment,
    stateAvailable: input.confirmations.ok,
  };
}
