/**
 * TUL-1415 / TUL-1587 · rules that overrule the model on what a rule can read exactly:
 *  - a relative day ("el sábado") is a calendar date in the workspace time zone;
 *  - "10 personas" is how many people ATTEND, not how many talents are wanted. The model summed
 *    "10 personas" and "2 meseros" into 12 talents, so with a party named the model's talent count
 *    is dropped and the party travels on its own (`partySize`).
 * Pure.
 */
import type { GuestMessageCapture } from "./guest-message-extract";
import { resolveRelativeEventDate } from "./relative-event-date";

const PEOPLE_NOUN = "people|persons|guests|pax|attendees|personas|invitados|comensales|gente|asistentes";
const PARTY_RE = new RegExp(`\\b(\\d{1,4})\\s*(?:${PEOPLE_NOUN})\\b`);
const PARTY_MAX = 5000;

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** How many people attend, when the sentence says so ("for 10 people", "10 personas"). */
export function extractPartySize(message: string): number | null {
  const m = fold(message).match(PARTY_RE);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= PARTY_MAX ? n : null;
}

export function applyDeterministicFixups(
  capture: GuestMessageCapture,
  message: string,
  ctx: { now: Date; timeZone: string | null | undefined },
): GuestMessageCapture {
  const out: GuestMessageCapture = { ...capture };
  const day = resolveRelativeEventDate(message, ctx.now, ctx.timeZone);
  if (day) out.date = { ...(out.date?.duration ? { duration: out.date.duration } : {}), status: "exact", event_date: day };
  const party = extractPartySize(message);
  if (party) {
    out.partySize = party;
    if (out.talent?.count_needed !== undefined) {
      const { count_needed: _dropped, ...rest } = out.talent;
      void _dropped;
      if (Object.keys(rest).length > 0) out.talent = rest;
      else delete out.talent;
    }
  }
  return out;
}
