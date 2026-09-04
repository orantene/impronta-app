/**
 * QR & Links Q1 — which destination a code resolves to, right now.
 *
 * PURE. No I/O, no clock, no database. Everything it needs is an argument, and
 * that is the point: this is the one piece of the engine whose failure is
 * invisible until a guest is standing at a table holding a phone, so it has to
 * be the piece that is exhaustively testable without a server.
 *
 * THE MODEL
 * A link carries an ORDERED list of rules. The first one that matches wins. The
 * last one must be `{ when: "always" }`. That is not a convention, it is checked
 * by a database constraint (`links_targets_shape`) and again here, because the
 * failure it prevents — a scan at an hour nobody wrote a rule for — cannot be
 * caught by looking at the configuration. It can only be caught by a guest.
 *
 * WHY IT REFUSES INSTEAD OF FALLING BACK
 * The tempting shape is "no rule matched, send them to the homepage". This
 * codebase has a recorded lesson against exactly that: a function that answers
 * instead of refusing makes absence indistinguishable from a value, and the DST
 * gap incident resolved an hour early because of it. So `resolveTarget` returns
 * a discriminated `{ ok: false, reason }` and the caller decides what a guest
 * sees. Absence is structurally distinct from a destination here.
 *
 * WHY THE CLOCK IS AN ARGUMENT
 * `ZonedNow` is a WALL CLOCK in the venue's timezone — minutes since local
 * midnight and a local weekday — not an instant. Every production workspace was
 * on UTC until Spaces S1, and "before doors" means 7pm where the venue is, not
 * 7pm UTC. Reading a clock in here would make the rule silently wrong for every
 * workspace outside UTC and untestable besides. The caller resolves the zone
 * through `resolveTenantTimezone` (the one timezone read path) and converts.
 */

/** A destination a rule can point at. Rendered to a URL by the caller. */
export type Destination = {
  /** Where to send the guest. A path on the tenant host, or an absolute URL. */
  to: string;
  /**
   * A short stable label for what this destination IS ("tickets", "menu",
   * "reserve"). Written to `link_scans.resolved_to` so the detail drawer can
   * answer "what did people get at 9pm" without replaying rules against a
   * `targets` list that has since been edited.
   */
  label: string;
};

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TargetRule =
  /** The default. Must be last, and must be present. */
  | { when: "always"; to: Destination }
  /**
   * A local-time window, optionally restricted to weekdays. `fromMinute` and
   * `toMinute` are minutes since local midnight. A window whose end is less
   * than its start CROSSES MIDNIGHT and is treated as such — "22:00 to 02:00"
   * is one window, not an empty one. That case is the whole reason nightlife
   * venues need this rule at all, so getting it wrong would be getting the
   * feature wrong.
   */
  | {
      when: "time_of_day";
      fromMinute: number;
      toMinute: number;
      days?: Weekday[];
      to: Destination;
    }
  /** Only when the venue has an event tonight and doors have NOT opened yet. */
  | { when: "event_before_doors"; to: Destination }
  /** Only when the venue has an event tonight and doors HAVE opened. */
  | { when: "event_after_doors"; to: Destination }
  /** Only when there is no event tonight at all. */
  | { when: "nothing_on"; to: Destination };

/** A wall clock in the venue's timezone. Never an instant, never UTC-implied. */
export type ZonedNow = {
  /** Minutes since local midnight, 0 to 1439. */
  minuteOfDay: number;
  /** Local weekday, 0 = Sunday, matching `Date.prototype.getDay`. */
  weekday: Weekday;
};

/**
 * Facts about tonight, resolved SERVER-SIDE by the caller and passed in. The
 * library never queries — same discipline the menu_board block follows, and the
 * reason a print design can render this without a database.
 */
export type WorldFacts = {
  /**
   * Tonight's event, if there is one. `doorsAtMinute` is minutes since local
   * midnight in the same venue timezone as `ZonedNow`.
   *
   * `null` means "we know there is nothing on". `undefined` means "we did not
   * find out", which is a different thing and is treated as such below.
   */
  eventTonight?: { doorsAtMinute: number } | null;
};

export type ResolveFailure =
  /** The list was empty, malformed, or had no `always` rule to fall back on. */
  | { ok: false; reason: "no_default" }
  /** Every rule was evaluable and none matched, including the default. */
  | { ok: false; reason: "no_match" };

export type ResolveResult = { ok: true; destination: Destination } | ResolveFailure;

const MINUTES_PER_DAY = 1440;

function isValidMinute(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < MINUTES_PER_DAY
  );
}

/**
 * Does `minute` fall inside [from, to)?
 *
 * Half-open on purpose: two adjacent windows ("18:00 to 22:00" and "22:00 to
 * 02:00") must not both claim 22:00. With a closed interval the first-match
 * rule would silently decide it, which is the kind of thing that looks correct
 * in every test written by the person who wrote the bug.
 *
 * A window whose end is not after its start wraps past midnight.
 */
export function isWithinWindow(minute: number, fromMinute: number, toMinute: number): boolean {
  if (fromMinute === toMinute) return false; // A zero-width window matches nothing.
  if (fromMinute < toMinute) return minute >= fromMinute && minute < toMinute;
  return minute >= fromMinute || minute < toMinute; // wraps midnight
}

function matches(rule: TargetRule, now: ZonedNow, world: WorldFacts): boolean {
  switch (rule.when) {
    case "always":
      return true;

    case "time_of_day": {
      if (!isValidMinute(rule.fromMinute) || !isValidMinute(rule.toMinute)) return false;
      if (rule.days && rule.days.length > 0 && !rule.days.includes(now.weekday)) return false;
      return isWithinWindow(now.minuteOfDay, rule.fromMinute, rule.toMinute);
    }

    // The three event rules all require KNOWING about tonight. `undefined`
    // means the caller could not find out, and an unknown is not a "no": a
    // failed events read must not silently turn the door code into the
    // nothing-on destination while an event is selling out inside. So an
    // unknown matches none of the three and falls through to the default,
    // which is the honest answer to "we do not know".
    case "event_before_doors": {
      const event = world.eventTonight;
      if (event === undefined || event === null) return false;
      return now.minuteOfDay < event.doorsAtMinute;
    }

    case "event_after_doors": {
      const event = world.eventTonight;
      if (event === undefined || event === null) return false;
      return now.minuteOfDay >= event.doorsAtMinute;
    }

    case "nothing_on":
      return world.eventTonight === null;

    default:
      // An unknown `when` from a row written by a newer deploy. Skipping it is
      // right: it lets an old server keep serving a link a new server edited,
      // and the `always` rule at the end guarantees there is still an answer.
      return false;
  }
}

/**
 * Pick the destination for a scan happening at `now`.
 *
 * Refuses rather than guessing. `no_default` means the link is misconfigured
 * (the caller should 404 and the link should never have been written);
 * `no_match` is unreachable while the default rule is present and is kept as a
 * distinct reason so that if it ever IS returned, the log says which invariant
 * broke instead of blaming the guest's clock.
 */
export function resolveTarget(
  rules: readonly TargetRule[],
  now: ZonedNow,
  world: WorldFacts = {},
): ResolveResult {
  if (!Array.isArray(rules) || rules.length === 0) return { ok: false, reason: "no_default" };

  const last = rules[rules.length - 1];
  if (!last || last.when !== "always") return { ok: false, reason: "no_default" };

  for (const rule of rules) {
    if (matches(rule, now, world)) return { ok: true, destination: rule.to };
  }

  return { ok: false, reason: "no_match" };
}

/**
 * Validate a rule list before it is stored. The database enforces the shape of
 * the list; this enforces the shape of each rule, and is the gate the editor
 * calls so a user is told at save time rather than a guest at scan time.
 */
export function validateTargets(rules: readonly TargetRule[]): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(rules) || rules.length === 0) {
    return { ok: false, reason: "A link needs at least one destination." };
  }

  const last = rules[rules.length - 1];
  if (!last || last.when !== "always") {
    return { ok: false, reason: "The last destination must be the default, so every scan has an answer." };
  }

  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if (!rule || typeof rule.to?.to !== "string" || rule.to.to.length === 0) {
      return { ok: false, reason: `Destination ${i + 1} has nowhere to point.` };
    }
    if (typeof rule.to.label !== "string" || rule.to.label.length === 0) {
      return { ok: false, reason: `Destination ${i + 1} needs a name.` };
    }
    if (rule.when === "always" && i !== rules.length - 1) {
      return { ok: false, reason: "The default must be last; anything after it can never be reached." };
    }
    if (rule.when === "time_of_day") {
      if (!isValidMinute(rule.fromMinute) || !isValidMinute(rule.toMinute)) {
        return { ok: false, reason: `Destination ${i + 1} has a time outside the day.` };
      }
      if (rule.fromMinute === rule.toMinute) {
        return { ok: false, reason: `Destination ${i + 1} starts and ends at the same time, so it never applies.` };
      }
    }
  }

  return { ok: true };
}

/**
 * Turn a rule's destination into a URL, refusing anything that leaves this site.
 *
 * WHY A PRINTED CODE NEEDS THIS MORE THAN A LINK DOES
 * With an ordinary link a person can read the URL before they click, and a
 * browser shows them where they landed. With a QR code they can do neither:
 * the destination is unreadable ink, and by the time it is on screen they have
 * already arrived. So a code that can be retargeted to an arbitrary origin is a
 * phishing primitive stapled to a table, and the fact that only staff can write
 * `targets` is not much comfort — a compromised staff account, or a support
 * agent pasting something helpful, is exactly how this gets used.
 *
 * Returns `null` for a cross-origin destination and for anything unparseable,
 * so the caller refuses rather than redirects. Same discipline as the rest of
 * this module: absence is a distinct answer, never a fallback.
 *
 * `//evil.com` is the case worth naming. It is protocol-relative, so it looks
 * like a path and resolves to another ORIGIN. `new URL()` handles it correctly
 * and the origin comparison below catches it; a `startsWith("/")` check, which
 * is the obvious way to write this, would wave it straight through.
 */
export function resolveDestinationUrl(to: string, base: string): URL | null {
  let url: URL;
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
    url = new URL(to, base);
  } catch {
    return null;
  }
  if (url.origin !== baseUrl.origin) return null;
  // A code may only send someone to a page. `javascript:` and `data:` cannot
  // reach here through `new URL(to, base)` with an http base, but stating the
  // allowed set means a future change to how `base` is derived cannot open it.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url;
}

/** Minutes since local midnight for an instant, in a named timezone. */
export function zonedNowIn(instant: Date, timeZone: string): ZonedNow {
  // `en-GB` gives a 24-hour clock; `weekday: "short"` avoids parsing a locale
  // month name. Intl is the only correct way to do this: adding an offset to a
  // UTC timestamp is wrong twice a year, and both times it is wrong at night,
  // which is when these links matter most.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number.parseInt(get("hour"), 10);
  const minute = Number.parseInt(get("minute"), 10);
  const weekdayIndex: Record<string, Weekday> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  // Intl renders local midnight as "24" in some ICU versions; normalise it.
  const safeHour = Number.isFinite(hour) ? hour % 24 : 0;
  const safeMinute = Number.isFinite(minute) ? minute : 0;

  return {
    minuteOfDay: safeHour * 60 + safeMinute,
    weekday: weekdayIndex[get("weekday")] ?? 0,
  };
}
