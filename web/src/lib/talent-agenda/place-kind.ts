import type { TalentAgendaItem } from "./types";

/**
 * TUL-1072: the agenda "where" of a booking, from its venue / location text.
 * Pure. `inquiries.event_location` / `agency_bookings.location_text` can hold
 * the offering's canned delivery label ("At studio", "En el estudio", "A
 * domicilio"...), which is a KIND, not a place. Those must not be treated as
 * an away address: a canned studio label stays `studio`, a client-site label
 * is `client_home`, and so on. Anything else is a real address (`away`).
 */

type Where = TalentAgendaItem["where"];

const CANNED: ReadonlyArray<{ keys: readonly string[]; mode: Where["mode"]; label: string }> = [
  { keys: ["at studio", "at your studio", "en el estudio", "en tu estudio", "studio", "estudio"], mode: "studio", label: "At studio" },
  { keys: ["at client", "at the client", "con el cliente", "a domicilio", "client home"], mode: "client_home", label: "At client" },
  { keys: ["remote", "remoto", "online", "en linea", "en línea"], mode: "online", label: "Remote" },
  { keys: ["by agreement", "a convenir"], mode: "away", label: "By agreement" },
];

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function bookingPlace(input: {
  venueName?: string | null;
  venueLocationText?: string | null;
  locationText?: string | null;
}): Pick<Where, "mode" | "label"> {
  const venue = input.venueName?.trim() || input.venueLocationText?.trim();
  if (venue) return { mode: "away", label: venue };
  const text = input.locationText?.trim();
  if (!text) return { mode: "studio", label: "Booking" };
  const key = norm(text);
  const hit = CANNED.find((c) => c.keys.includes(key));
  if (hit) return { mode: hit.mode, label: hit.label };
  return { mode: "away", label: text };
}
