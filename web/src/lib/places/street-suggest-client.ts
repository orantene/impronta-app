/**
 * Browser helper for the public street-address routes. Import-safe on the
 * client (no server-only code). The booking sheet imports this; nothing here
 * renders UI.
 *
 * Usage: call `createStreetSession()` once when the sheet OPENS, pass its token
 * to every `suggestStreets` call and to the final `fetchStreetDetails`, then
 * discard it (a new open starts a new Google billing session). When any call
 * resolves `{ kind: "disabled" }` the flag is off: stop calling and fall back to
 * the plain text field for the rest of the session.
 */

import {
  STREET_DETAILS_PATH,
  STREET_QUERY_MAX,
  STREET_QUERY_MIN,
  STREET_SUGGEST_PATH,
  type StreetPlaceDetails,
  type StreetSuggestion,
} from "./street-suggest-contract";

export type StreetSession = { readonly token: string };

export type StreetClientResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "disabled" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "error" };

type FetchLike = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<Response>;

export type StreetClientOptions = {
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
};

/** One session per sheet open. Throws nothing; falls back when randomUUID is missing. */
export function createStreetSession(): StreetSession {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return { token: c.randomUUID() };
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return {
    token: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`,
  };
}

/** True when the text is worth a network call (same bounds the server enforces). */
export function isSuggestableQuery(text: string): boolean {
  const t = text.trim();
  return t.length >= STREET_QUERY_MIN && t.length <= STREET_QUERY_MAX;
}

async function post<T>(
  path: string,
  payload: Record<string, string>,
  pick: (json: unknown) => T | null,
  opts: StreetClientOptions,
): Promise<StreetClientResult<T>> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  try {
    const response = await doFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    const code =
      json && typeof json === "object" && "code" in json
        ? String((json as { code: unknown }).code)
        : null;
    if (code === "disabled") return { kind: "disabled" };
    if (response.status === 429) {
      const ra = Number(response.headers.get("Retry-After"));
      return { kind: "rate_limited", retryAfterSeconds: Number.isFinite(ra) && ra > 0 ? ra : 1 };
    }
    if (!response.ok) return { kind: "error" };
    const value = pick(json);
    return value === null ? { kind: "error" } : { kind: "ok", value };
  } catch {
    return { kind: "error" };
  }
}

export function suggestStreets(
  input: { query: string; session: StreetSession; country?: string },
  opts: StreetClientOptions = {},
): Promise<StreetClientResult<StreetSuggestion[]>> {
  return post(
    STREET_SUGGEST_PATH,
    {
      query: input.query.trim(),
      sessionToken: input.session.token,
      ...(input.country ? { country: input.country } : {}),
    },
    (json) => {
      const list = (json as { suggestions?: unknown } | null)?.suggestions;
      return Array.isArray(list) ? (list as StreetSuggestion[]) : null;
    },
    opts,
  );
}

export function fetchStreetDetails(
  input: { placeId: string; session: StreetSession },
  opts: StreetClientOptions = {},
): Promise<StreetClientResult<StreetPlaceDetails>> {
  return post(
    STREET_DETAILS_PATH,
    { placeId: input.placeId, sessionToken: input.session.token },
    (json) => {
      const place = (json as { place?: StreetPlaceDetails } | null)?.place;
      return place && typeof place.formattedAddress === "string" ? place : null;
    },
    opts,
  );
}

/**
 * Trailing-edge debounce with cancel. `delayMs` defaults to 250.
 * The timer functions are injectable so tests need no real clock.
 */
export function createDebouncer(
  delayMs = 250,
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
): { run: (fn: () => void) => void; cancel: () => void } {
  let handle: unknown = null;
  const cancel = () => {
    if (handle !== null) timers.clear(handle);
    handle = null;
  };
  return {
    run(fn) {
      cancel();
      handle = timers.set(() => {
        handle = null;
        fn();
      }, delayMs);
    },
    cancel,
  };
}
