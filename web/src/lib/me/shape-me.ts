/**
 * shape-me.ts — what a customer's home page shows, as a pure function.
 *
 * F5. `/me` is the lighter door the five non-agency business types need: a
 * customer's view of ONE tenant, signed in by email code, no password and no
 * profile to fill. The registered client dashboard is not replaced; it stays
 * for agency-style clients who manage quotes and approvals, and it links here.
 *
 * WHY THIS READS THE INQUIRY SPINE AND NOT `orders`
 * ────────────────────────────────────────────────
 * `orders`, `order_lines` and `customers` exist in production but are absent
 * from `database.types.ts`, so nothing can read them in TypeScript yet. More
 * importantly they hold ZERO rows: a `/me` built on them would render an empty
 * page for every human on the platform. A customer's real history today lives
 * on inquiries and bookings, so that is what this shows. When orders become
 * reachable, `/me` gains order rows without changing shape.
 *
 * PURE. No I/O, no clock of its own (`nowMs` is passed), so the rules below are
 * asserted without a database and the server render and any test agree.
 */

export type MeRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly status: string | null;
  readonly title: string | null;
  readonly eventDate: string | null;
  readonly eventLocation: string | null;
  readonly createdAt: string;
  readonly nextActionBy: string | null;
  readonly booking: {
    readonly id: string | null;
    readonly amountCents: number | null;
    readonly currencyCode: string | null;
    readonly paymentStatus: string | null;
  } | null;
};

export type MeItem = MeRow & {
  /** Rendered under the tenant's own words by the page, never here. */
  readonly kind: "upcoming" | "waiting_on_you" | "past";
};

export type MeData = {
  readonly upcoming: MeItem[];
  readonly waitingOnYou: MeItem[];
  readonly past: MeItem[];
  readonly isEmpty: boolean;
};

export const EMPTY_ME: MeData = {
  upcoming: [],
  waitingOnYou: [],
  past: [],
  isEmpty: true,
};

/** Statuses that mean the thing is over and should never read as upcoming. */
const TERMINAL = new Set(["cancelled", "declined", "expired", "closed", "archived"]);

function eventMs(row: MeRow): number | null {
  if (!row.eventDate) return null;
  const ms = Date.parse(row.eventDate);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Split a customer's rows into the three things they came to see.
 *
 * The day boundary is deliberate: an event happening TODAY is upcoming, not
 * past. A diner opening `/me` at 19:00 to check tonight's table must not find
 * it filed under history, which is what a naive `eventDate < now` does.
 */
export function shapeMeData(rows: readonly MeRow[], nowMs: number): MeData {
  const startOfTodayMs = nowMs - 24 * 60 * 60 * 1000;

  const upcoming: MeItem[] = [];
  const waitingOnYou: MeItem[] = [];
  const past: MeItem[] = [];

  for (const row of rows) {
    const status = (row.status ?? "").toLowerCase();
    const when = eventMs(row);

    if (TERMINAL.has(status)) {
      past.push({ ...row, kind: "past" });
      continue;
    }

    // The ball being in the customer's court outranks the date: a quote that
    // expires on Friday is the thing they need to act on, whenever it happens.
    if (row.nextActionBy === "client") {
      waitingOnYou.push({ ...row, kind: "waiting_on_you" });
      continue;
    }

    if (when === null || when >= startOfTodayMs) {
      upcoming.push({ ...row, kind: "upcoming" });
    } else {
      past.push({ ...row, kind: "past" });
    }
  }

  // Soonest first for things ahead; most recent first for things behind.
  upcoming.sort((a, b) => (eventMs(a) ?? Infinity) - (eventMs(b) ?? Infinity));
  past.sort((a, b) => (eventMs(b) ?? 0) - (eventMs(a) ?? 0));
  waitingOnYou.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    upcoming,
    waitingOnYou,
    past,
    isEmpty: upcoming.length === 0 && waitingOnYou.length === 0 && past.length === 0,
  };
}

/** Money for display. Integer cents in, never a float anywhere. */
export function formatAmount(cents: number | null, currency: string | null): string | null {
  if (cents === null || !Number.isFinite(cents)) return null;
  const code = (currency ?? "USD").toUpperCase();
  const value = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${code === "USD" ? "$" : `${code} `}${value}`;
}
