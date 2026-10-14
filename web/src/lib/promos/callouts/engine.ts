/**
 * Smart callouts (design doc L5). Pure: real inputs in, at most ONE callout out.
 *
 * Priority: cancellation slot > empty days > lapsed clients > idle service.
 * Holiday and launch callouts are not built in v1 (no calendar / site-age input yet).
 * Budget: 1 per day, 3 per week. [Ahora no] snoozes the type 7 days; 3 dismissals
 * in a row quiet it for 30 days; [No mostrar de nuevo] hides it until re-enabled.
 */

export type CalloutType = "cancellation" | "empty_days" | "lapsed_clients" | "idle_service";

export const CALLOUT_PRIORITY: readonly CalloutType[] = ["cancellation", "empty_days", "lapsed_clients", "idle_service"];

export const SNOOZE_DAYS = 7;
export const QUIET_DAYS = 30;
export const QUIET_AFTER_DISMISSALS = 3;
export const MAX_PER_DAY = 1;
export const MAX_PER_WEEK = 3;

export type CalloutTypeState = {
  hidden?: boolean;
  snoozedUntil?: string | null;
  quietUntil?: string | null;
  consecutiveDismissals?: number;
};

export type CalloutState = {
  types: Partial<Record<CalloutType, CalloutTypeState>>;
  /** ISO instants of callouts shown in the last 7 days. */
  shown: readonly string[];
};

export const EMPTY_CALLOUT_STATE: CalloutState = { types: {}, shown: [] };

export type CalloutInputs = {
  now: string | Date;
  /** Next days (local), nearest first. */
  upcomingDays?: readonly { label: string; openHours: number; bookedHours: number; coveredByLivePromo: boolean }[];
  hasAvailability?: boolean;
  pastBookings?: number;
  /** Cancelled slot: hours until it starts, and whether it sits in working hours. */
  cancellation?: { slotLabel: string; hoursAway: number; withinWorkingHours: boolean } | null;
  /** Clients with >=2 past visits, last one >60 days ago, with a contact. */
  lapsedClients?: number;
  /** Published services, with bookings in the last 30 days. */
  services?: readonly { id: string; name: string; bookings30d: number }[];
  state: CalloutState;
};

export type Callout =
  | { type: "cancellation"; slotLabel: string }
  | { type: "empty_days"; dayLabel: string; booked: number; open: number }
  | { type: "lapsed_clients"; count: number }
  | { type: "idle_service"; serviceId: string; serviceName: string };

const DAY = 86_400_000;
const t = (v: string | Date) => new Date(v).getTime();

export function typeAllowed(state: CalloutTypeState | undefined, now: number): boolean {
  if (!state) return true;
  if (state.hidden) return false;
  if (state.snoozedUntil && t(state.snoozedUntil) > now) return false;
  if (state.quietUntil && t(state.quietUntil) > now) return false;
  return true;
}

export function budgetLeft(shown: readonly string[], now: number): boolean {
  const day = shown.filter((s) => now - t(s) < DAY && t(s) <= now).length;
  const week = shown.filter((s) => now - t(s) < 7 * DAY && t(s) <= now).length;
  return day < MAX_PER_DAY && week < MAX_PER_WEEK;
}

function candidate(type: CalloutType, i: CalloutInputs): Callout | null {
  switch (type) {
    case "cancellation": {
      const c = i.cancellation;
      return c && c.hoursAway >= 3 && c.withinWorkingHours ? { type, slotLabel: c.slotLabel } : null;
    }
    case "empty_days": {
      if (!i.hasAvailability || (i.pastBookings ?? 0) < 3) return null;
      const days = (i.upcomingDays ?? []).slice(0, 3);
      if (days.length === 0 || days.some((d) => d.coveredByLivePromo)) return null;
      const open = days.reduce((s, d) => s + d.openHours, 0);
      const booked = days.reduce((s, d) => s + d.bookedHours, 0);
      if (open <= 0 || booked / open >= 0.3) return null;
      // Show the emptiest day: the data the copy quotes.
      const worst = days.slice().sort((a, b) => a.bookedHours / Math.max(a.openHours, 1) - b.bookedHours / Math.max(b.openHours, 1))[0]!;
      return { type, dayLabel: worst.label, booked: worst.bookedHours, open: worst.openHours };
    }
    case "lapsed_clients":
      return (i.lapsedClients ?? 0) >= 1 ? { type, count: i.lapsedClients! } : null;
    case "idle_service": {
      const s = i.services ?? [];
      if (!s.some((x) => x.bookings30d > 0)) return null;
      const idle = s.find((x) => x.bookings30d === 0);
      return idle ? { type, serviceId: idle.id, serviceName: idle.name } : null;
    }
  }
}

/** The single callout to show now, or null. */
export function pickCallout(i: CalloutInputs): Callout | null {
  const now = t(i.now);
  if (!budgetLeft(i.state.shown, now)) return null;
  for (const type of CALLOUT_PRIORITY) {
    if (!typeAllowed(i.state.types[type], now)) continue;
    const c = candidate(type, i);
    if (c) return c;
  }
  return null;
}

export type CalloutAction = "snooze" | "hide" | "accept" | "unhide";

/** Pure state transition for a talent's response. */
export function applyCalloutAction(state: CalloutState, type: CalloutType, action: CalloutAction, now: string | Date): CalloutState {
  const n = t(now);
  const cur = state.types[type] ?? {};
  let next: CalloutTypeState;
  if (action === "snooze") {
    const count = (cur.consecutiveDismissals ?? 0) + 1;
    next = {
      ...cur,
      consecutiveDismissals: count,
      snoozedUntil: new Date(n + SNOOZE_DAYS * DAY).toISOString(),
      quietUntil: count >= QUIET_AFTER_DISMISSALS ? new Date(n + QUIET_DAYS * DAY).toISOString() : cur.quietUntil ?? null,
    };
    if (count >= QUIET_AFTER_DISMISSALS) next.consecutiveDismissals = 0;
  } else if (action === "hide") {
    next = { ...cur, hidden: true };
  } else if (action === "unhide") {
    next = { ...cur, hidden: false };
  } else {
    next = { hidden: cur.hidden, consecutiveDismissals: 0, snoozedUntil: null, quietUntil: null };
  }
  return { ...state, types: { ...state.types, [type]: next } };
}

/** Record that a callout was shown (call once per day it renders), pruning to the last 7 days. */
export function recordShown(state: CalloutState, now: string | Date): CalloutState {
  const n = t(now);
  const shown = [...state.shown.filter((s) => n - t(s) < 7 * DAY), new Date(n).toISOString()];
  return { ...state, shown };
}

export function isCalloutState(v: unknown): v is CalloutState {
  if (!v || typeof v !== "object") return false;
  const o = v as { types?: unknown; shown?: unknown };
  return !!o.types && typeof o.types === "object" && Array.isArray(o.shown);
}
