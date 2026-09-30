import type { TalentPage } from "./types";

/**
 * TalentPage → URL segment under `/talent/` (and `/<slug>/talent/`).
 * Moved out of context.tsx (size ratchet) with the F44 fix: the booking
 * record has no index route, only `/talent/bookings/[id]`, so its segment
 * carries the id or is null (the caller then leaves the URL alone). The
 * old bare "bookings" segment pushed Money → Record payment → pick booking
 * to `/talent/bookings`, which is "Page not found".
 */
const SEGMENTS: Partial<Record<TalentPage, string>> = {
  today: "today",
  attention: "attention",
  messages: "inbox", // messages → inbox canonical route
  inbox: "inbox",
  profile: "profile",
  reviews: "reviews",
  calendar: "calendar",
  "calendar-availability": "calendar/availability",
  "bookings-new": "bookings/new",
  money: "money",
  clients: "clients",
  payouts: "payouts",
  agencies: "money", // legacy alias
  activity: "money", // legacy alias
  reach: "money", // legacy alias
  "public-page": "site",
  settings: "settings",
};

export function talentPageToSegment(p: TalentPage, bookingId?: string | null): string | null {
  if (p === "booking-record") {
    const id = bookingId?.trim();
    return id && id !== "new" && id !== "undefined" ? `bookings/${encodeURIComponent(id)}` : null;
  }
  return SEGMENTS[p] ?? p;
}

/** The booking id in a `/talent/bookings/<id>` path, or null ("new" is not a record). */
export function bookingIdFromTalentPath(pathname: string): string | null {
  const match = pathname.match(/\/talent\/bookings\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]) : null;
  return id && id !== "new" && id !== "undefined" ? id : null;
}
