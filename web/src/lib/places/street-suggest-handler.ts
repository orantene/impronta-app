import "server-only";

import {
  isStreetAutocompleteEnabled,
  parseDetailsInput,
  parseSuggestInput,
  type StreetDetailsResponse,
  type StreetFailureCode,
  type StreetSuggestResponse,
} from "./street-suggest-contract";
import {
  fetchStreetDetails,
  fetchStreetSuggestions,
  type StreetFetch,
} from "./street-suggest-google";
import { checkStreetSuggestLimit, type StreetLimitVerdict } from "./street-suggest-limiter";
import { improntaLog } from "@/lib/server/structured-log";

/**
 * Transport-free core of the public street-address routes. The route files only
 * adapt Request/Response; everything that matters (flag, order of checks, the
 * output shape, what is logged) is here so it can be tested without HTTP.
 *
 * Order is deliberate and cheapest first:
 *   1. flag off      -> 404 disabled, nothing else runs, nothing is billed
 *   2. validation    -> 400, no limiter slot spent on junk
 *   3. rate limit    -> 429, or 503 when the limiter is unavailable (fail closed)
 *   4. Google call   -> the only billable step
 *
 * Logging: counts and error classes only. The query text, the place id and the
 * session token are never logged.
 */

export type StreetHandlerDeps = {
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: StreetFetch;
  checkLimit?: (input: { ip: string; host: string }) => Promise<StreetLimitVerdict>;
  log?: (event: string, fields: Record<string, string | number | boolean>) => void;
};

export type StreetHandlerInput = {
  body: unknown;
  ip: string;
  host: string;
};

export type StreetHandlerOutput<B> = {
  status: number;
  body: B;
  headers?: Record<string, string>;
};

type Failure = { ok: false; code: StreetFailureCode };

function fail(
  status: number,
  code: StreetFailureCode,
  headers?: Record<string, string>,
): StreetHandlerOutput<Failure> {
  return { status, body: { ok: false, code }, ...(headers ? { headers } : {}) };
}

function defaultLog(event: string, fields: Record<string, string | number | boolean>): void {
  void improntaLog(event, fields);
}

async function gate(
  input: StreetHandlerInput,
  deps: StreetHandlerDeps,
): Promise<StreetHandlerOutput<Failure> | null> {
  const limit = deps.checkLimit ?? ((i) => checkStreetSuggestLimit(i));
  const verdict = await limit({ ip: input.ip, host: input.host });
  if (verdict.ok) return null;
  if (verdict.reason === "rate_limited") {
    const retryAfter = Math.max(1, Math.ceil(verdict.retryAfterMs / 1000));
    return fail(429, "rate_limited", { "Retry-After": String(retryAfter) });
  }
  return fail(503, "unavailable");
}

export async function handleStreetSuggest(
  input: StreetHandlerInput,
  deps: StreetHandlerDeps = {},
): Promise<StreetHandlerOutput<StreetSuggestResponse>> {
  if (!isStreetAutocompleteEnabled(deps.env)) return fail(404, "disabled");

  const parsed = parseSuggestInput(input.body);
  if (!parsed.ok) return fail(400, parsed.code);

  const blocked = await gate(input, deps);
  if (blocked) return blocked;

  const log = deps.log ?? defaultLog;
  const result = await fetchStreetSuggestions(parsed, {
    fetchImpl: deps.fetchImpl ?? ((url, init) => fetch(url, init)),
    env: deps.env,
  });
  if (!result.ok) {
    log("street_suggest.error", { reason: result.reason });
    return fail(result.reason === "not_configured" ? 503 : 502, result.reason === "not_configured" ? "unavailable" : "upstream");
  }
  log("street_suggest.ok", { count: result.value.length });
  return { status: 200, body: { ok: true, suggestions: result.value } };
}

export async function handleStreetDetails(
  input: StreetHandlerInput,
  deps: StreetHandlerDeps = {},
): Promise<StreetHandlerOutput<StreetDetailsResponse>> {
  if (!isStreetAutocompleteEnabled(deps.env)) return fail(404, "disabled");

  const parsed = parseDetailsInput(input.body);
  if (!parsed.ok) return fail(400, parsed.code);

  const blocked = await gate(input, deps);
  if (blocked) return blocked;

  const log = deps.log ?? defaultLog;
  const result = await fetchStreetDetails(parsed, {
    fetchImpl: deps.fetchImpl ?? ((url, init) => fetch(url, init)),
    env: deps.env,
  });
  if (!result.ok) {
    log("street_details.error", { reason: result.reason });
    return fail(result.reason === "not_configured" ? 503 : 502, result.reason === "not_configured" ? "unavailable" : "upstream");
  }
  log("street_details.ok", { count: 1 });
  return { status: 200, body: { ok: true, place: result.value } };
}

/** Trusted client IP: the platform-appended hop (same rule as the booking slots route). */
export function resolveStreetClientIp(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }
  return "x";
}
