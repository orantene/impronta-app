import test from "node:test";
import assert from "node:assert/strict";
import {
  isStreetAutocompleteEnabled,
  parseDetailsInput,
  parseSuggestInput,
  STREET_AUTOCOMPLETE_FLAG,
} from "./street-suggest-contract";
import { handleStreetDetails, handleStreetSuggest } from "./street-suggest-handler";
import { checkStreetSuggestLimit } from "./street-suggest-limiter";
import {
  createDebouncer,
  createStreetSession,
  fetchStreetDetails,
  isSuggestableQuery,
  suggestStreets,
} from "./street-suggest-client";
import { isPathAllowedForHostKind, type HostKind } from "@/lib/saas/surface-allow-list";

const TOKEN = "3f2b8c1e-9a4d-4e6b-8c7a-1d2e3f4a5b6c";
const KEY = "AIza-SECRET-KEY-VALUE";
const ON = { [STREET_AUTOCOMPLETE_FLAG]: "1", GOOGLE_PLACES_API_KEY: KEY };
const OK_LIMIT = async () => ({ ok: true }) as const;
const base = { ip: "1.2.3.4", host: "jor.tulala.digital" };

type Call = { url: string };
function fakeGoogle(payload: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string) => {
    calls.push({ url });
    return new Response(JSON.stringify(payload), { status });
  };
  return { calls, fetchImpl };
}

const GOOGLE_PREDICTIONS = {
  status: "OK",
  predictions: [
    {
      place_id: "ChIJabcdefghij1",
      description: "Calle Reforma 12, Ciudad",
      structured_formatting: { main_text: "Calle Reforma 12", secondary_text: "Ciudad, MX" },
      types: ["street_address"],
      matched_substrings: [{ length: 3, offset: 0 }],
    },
  ],
};

test("flag off: disabled, no limiter slot, no Google call", async () => {
  const g = fakeGoogle(GOOGLE_PREDICTIONS);
  let limiterCalls = 0;
  for (const env of [{}, { [STREET_AUTOCOMPLETE_FLAG]: "0" }, { [STREET_AUTOCOMPLETE_FLAG]: "true" }]) {
    const out = await handleStreetSuggest(
      { ...base, body: { query: "Reforma", sessionToken: TOKEN } },
      { env, fetchImpl: g.fetchImpl, checkLimit: async () => (limiterCalls++, { ok: true }) },
    );
    assert.equal(out.status, 404);
    assert.deepEqual(out.body, { ok: false, code: "disabled" });
    const det = await handleStreetDetails(
      { ...base, body: { placeId: "ChIJabcdefghij1", sessionToken: TOKEN } },
      { env, fetchImpl: g.fetchImpl, checkLimit: async () => (limiterCalls++, { ok: true }) },
    );
    assert.equal(det.status, 404);
  }
  assert.equal(g.calls.length, 0);
  assert.equal(limiterCalls, 0);
  assert.equal(isStreetAutocompleteEnabled({}), false);
});

test("validation: short, long, missing and non-uuid token never reach Google", async () => {
  const g = fakeGoogle(GOOGLE_PREDICTIONS);
  const deps = { env: ON, fetchImpl: g.fetchImpl, checkLimit: OK_LIMIT, log: () => {} };
  const bad: Array<[unknown, string]> = [
    [{ query: "ab", sessionToken: TOKEN }, "invalid_query"],
    [{ query: "  a ", sessionToken: TOKEN }, "invalid_query"],
    [{ query: "x".repeat(121), sessionToken: TOKEN }, "invalid_query"],
    [{ query: 42, sessionToken: TOKEN }, "invalid_query"],
    [{ query: "Reforma", sessionToken: "not-a-uuid" }, "invalid_session"],
    [{ query: "Reforma" }, "invalid_session"],
    [null, "invalid_session"],
  ];
  for (const [body, code] of bad) {
    const out = await handleStreetSuggest({ ...base, body }, deps);
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, { ok: false, code });
  }
  const badDetails = await handleStreetDetails(
    { ...base, body: { placeId: "short", sessionToken: TOKEN } },
    deps,
  );
  assert.deepEqual(badDetails.body, { ok: false, code: "invalid_place" });
  assert.equal(g.calls.length, 0);
  // boundaries are accepted
  assert.equal(parseSuggestInput({ query: "abc", sessionToken: TOKEN }).ok, true);
  assert.equal(parseSuggestInput({ query: "x".repeat(120), sessionToken: TOKEN }).ok, true);
});

test("limiter exceeded => 429 + Retry-After and no Google call", async () => {
  const g = fakeGoogle(GOOGLE_PREDICTIONS);
  const out = await handleStreetSuggest(
    { ...base, body: { query: "Reforma", sessionToken: TOKEN } },
    {
      env: ON,
      fetchImpl: g.fetchImpl,
      checkLimit: async () => ({ ok: false, reason: "rate_limited", retryAfterMs: 4200 }),
    },
  );
  assert.equal(out.status, 429);
  assert.deepEqual(out.body, { ok: false, code: "rate_limited" });
  assert.equal(out.headers?.["Retry-After"], "5");
  assert.equal(g.calls.length, 0);
});

test("limiter unavailable => closed (503), no Google call", async () => {
  const g = fakeGoogle(GOOGLE_PREDICTIONS);
  const out = await handleStreetSuggest(
    { ...base, body: { query: "Reforma", sessionToken: TOKEN } },
    { env: ON, fetchImpl: g.fetchImpl, checkLimit: async () => ({ ok: false, reason: "unavailable" }) },
  );
  assert.equal(out.status, 503);
  assert.deepEqual(out.body, { ok: false, code: "unavailable" });
  assert.equal(g.calls.length, 0);
});

test("real limiter: no backend or a throwing backend is closed, exhausted is 429", async () => {
  assert.deepEqual(await checkStreetSuggestLimit(base, null), { ok: false, reason: "unavailable" });
  const boom = { limit: async () => { throw new Error("redis down"); } };
  assert.deepEqual(await checkStreetSuggestLimit(base, { ip: boom, host: boom }), {
    ok: false,
    reason: "unavailable",
  });
  const allow = { limit: async () => ({ success: true, reset: 0 }) };
  const deny = { limit: async () => ({ success: false, reset: Date.now() + 3000 }) };
  assert.deepEqual(await checkStreetSuggestLimit(base, { ip: allow, host: allow }), { ok: true });
  const byIp = await checkStreetSuggestLimit(base, { ip: deny, host: allow });
  assert.equal(byIp.ok, false);
  assert.equal(byIp.ok === false && byIp.reason, "rate_limited");
  const byHost = await checkStreetSuggestLimit(base, { ip: allow, host: deny });
  assert.equal(byHost.ok === false && byHost.reason, "rate_limited");
});

test("suggest: only 3 fields out, key and token only go to Google, address types + country + session", async () => {
  const g = fakeGoogle(GOOGLE_PREDICTIONS);
  const logs: string[] = [];
  const out = await handleStreetSuggest(
    { ...base, body: { query: "Reforma 12", sessionToken: TOKEN, country: "co" } },
    {
      env: ON,
      fetchImpl: g.fetchImpl,
      checkLimit: OK_LIMIT,
      log: (event, fields) => logs.push(JSON.stringify({ event, fields })),
    },
  );
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, {
    ok: true,
    suggestions: [{ placeId: "ChIJabcdefghij1", mainText: "Calle Reforma 12", secondaryText: "Ciudad, MX" }],
  });
  const serialized = JSON.stringify(out);
  assert.equal(serialized.includes(KEY), false);
  assert.equal(serialized.includes("matched_substrings"), false);
  assert.equal(g.calls.length, 1);
  const u = new URL(g.calls[0].url);
  assert.equal(u.searchParams.get("types"), "address");
  assert.equal(u.searchParams.get("components"), "country:co");
  assert.equal(u.searchParams.get("sessiontoken"), TOKEN);
  assert.equal(u.searchParams.get("input"), "Reforma 12");
  // no query text, token or key in logs
  const logged = logs.join("\n");
  assert.equal(logged.includes("Reforma"), false);
  assert.equal(logged.includes(TOKEN), false);
  assert.equal(logged.includes(KEY), false);
  assert.match(logged, /"count":1/);
});

test("country defaults to MX when absent or malformed", async () => {
  const g = fakeGoogle({ status: "ZERO_RESULTS", predictions: [] });
  for (const country of [undefined, "Mexico", "1x", 7]) {
    await handleStreetSuggest(
      { ...base, body: { query: "Reforma", sessionToken: TOKEN, country } },
      { env: ON, fetchImpl: g.fetchImpl, checkLimit: OK_LIMIT, log: () => {} },
    );
  }
  for (const c of g.calls) {
    assert.equal(new URL(c.url).searchParams.get("components"), "country:mx");
  }
});

test("upstream failure and missing key never leak details or the key", async () => {
  const logs: string[] = [];
  const log = (e: string, f: Record<string, unknown>) => logs.push(JSON.stringify({ e, f }));
  const denied = fakeGoogle({ status: "REQUEST_DENIED", error_message: `bad key ${KEY}` });
  const a = await handleStreetSuggest(
    { ...base, body: { query: "Reforma", sessionToken: TOKEN } },
    { env: ON, fetchImpl: denied.fetchImpl, checkLimit: OK_LIMIT, log },
  );
  assert.equal(a.status, 502);
  assert.deepEqual(a.body, { ok: false, code: "upstream" });
  const noKey = fakeGoogle(GOOGLE_PREDICTIONS);
  const b = await handleStreetSuggest(
    { ...base, body: { query: "Reforma", sessionToken: TOKEN } },
    { env: { [STREET_AUTOCOMPLETE_FLAG]: "1" }, fetchImpl: noKey.fetchImpl, checkLimit: OK_LIMIT, log },
  );
  assert.equal(b.status, 503);
  assert.equal(noKey.calls.length, 0);
  const all = JSON.stringify([a, b]) + logs.join("");
  assert.equal(all.includes(KEY), false);
  assert.equal(all.includes("Reforma"), false);
});

test("details: returns only placeId + formattedAddress, requests address fields with the session", async () => {
  const g = fakeGoogle({
    status: "OK",
    result: {
      place_id: "ChIJabcdefghij1",
      formatted_address: "Calle Reforma 12, Ciudad",
      geometry: { location: { lat: 1, lng: 2 } },
      name: "Secret Biz",
    },
  });
  const out = await handleStreetDetails(
    { ...base, body: { placeId: "ChIJabcdefghij1", sessionToken: TOKEN } },
    { env: ON, fetchImpl: g.fetchImpl, checkLimit: OK_LIMIT, log: () => {} },
  );
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, {
    ok: true,
    place: { placeId: "ChIJabcdefghij1", formattedAddress: "Calle Reforma 12, Ciudad" },
  });
  const u = new URL(g.calls[0].url);
  assert.equal(u.searchParams.get("sessiontoken"), TOKEN);
  assert.equal(u.searchParams.get("fields"), "place_id,formatted_address");
  assert.equal(JSON.stringify(out).includes(KEY), false);
});

test("details: limiter exceeded and closed both skip Google", async () => {
  const g = fakeGoogle({ status: "OK", result: { formatted_address: "x" } });
  const body = { placeId: "ChIJabcdefghij1", sessionToken: TOKEN };
  const a = await handleStreetDetails(
    { ...base, body },
    { env: ON, fetchImpl: g.fetchImpl, checkLimit: async () => ({ ok: false, reason: "rate_limited", retryAfterMs: 1000 }) },
  );
  const b = await handleStreetDetails(
    { ...base, body },
    { env: ON, fetchImpl: g.fetchImpl, checkLimit: async () => ({ ok: false, reason: "unavailable" }) },
  );
  assert.equal(a.status, 429);
  assert.equal(b.status, 503);
  assert.equal(g.calls.length, 0);
  assert.equal(parseDetailsInput(body).ok, true);
});

test("reachability: /api/public/places/* is served on every host kind", () => {
  const kinds: HostKind[] = ["app", "agency", "hub", "marketing"];
  for (const kind of kinds) {
    assert.equal(isPathAllowedForHostKind(kind, "/api/public/places/street-suggest"), true, kind);
    assert.equal(isPathAllowedForHostKind(kind, "/api/public/places/street-details"), true, kind);
  }
});

test("client: session is a uuid, new each open; query bounds mirror the server", () => {
  const a = createStreetSession();
  const b = createStreetSession();
  assert.match(a.token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(isSuggestableQuery("ab"), false);
  assert.equal(isSuggestableQuery(" abc "), true);
  assert.equal(isSuggestableQuery("x".repeat(121)), false);
});

test("client: sends POST body (not the URL), detects flag-off and rate limit", async () => {
  const session = { token: TOKEN };
  const seen: Array<{ url: string; body: string }> = [];
  const mk = (status: number, json: unknown, headers: Record<string, string> = {}) =>
    async (url: string, init: { body: string }) => {
      seen.push({ url, body: init.body });
      return new Response(JSON.stringify(json), { status, headers });
    };
  const ok = await suggestStreets(
    { query: " Reforma ", session, country: "MX" },
    { fetchImpl: mk(200, { ok: true, suggestions: [{ placeId: "p", mainText: "m", secondaryText: "s" }] }) },
  );
  assert.equal(ok.kind, "ok");
  assert.equal(seen[0].url, "/api/public/places/street-suggest");
  assert.equal(seen[0].url.includes("Reforma"), false);
  assert.deepEqual(JSON.parse(seen[0].body), { query: "Reforma", sessionToken: TOKEN, country: "MX" });

  const off = await suggestStreets({ query: "Reforma", session }, { fetchImpl: mk(404, { ok: false, code: "disabled" }) });
  assert.deepEqual(off, { kind: "disabled" });
  const limited = await suggestStreets(
    { query: "Reforma", session },
    { fetchImpl: mk(429, { ok: false, code: "rate_limited" }, { "Retry-After": "7" }) },
  );
  assert.deepEqual(limited, { kind: "rate_limited", retryAfterSeconds: 7 });
  const boom = await fetchStreetDetails(
    { placeId: "ChIJabcdefghij1", session },
    { fetchImpl: async () => { throw new Error("net"); } },
  );
  assert.deepEqual(boom, { kind: "error" });
  const det = await fetchStreetDetails(
    { placeId: "ChIJabcdefghij1", session },
    { fetchImpl: mk(200, { ok: true, place: { placeId: "ChIJabcdefghij1", formattedAddress: "A" } }) },
  );
  assert.equal(det.kind, "ok");
});

test("client: debouncer keeps only the last call and can cancel", () => {
  const pending = new Map<number, () => void>();
  let id = 0;
  const timers = {
    set: (fn: () => void) => { pending.set(++id, fn); return id; },
    clear: (h: unknown) => { pending.delete(h as number); },
  };
  const d = createDebouncer(250, timers);
  const ran: string[] = [];
  d.run(() => ran.push("a"));
  d.run(() => ran.push("b"));
  assert.equal(pending.size, 1);
  for (const [k, fn] of [...pending]) { pending.delete(k); fn(); }
  assert.deepEqual(ran, ["b"]);
  d.run(() => ran.push("c"));
  d.cancel();
  assert.equal(pending.size, 0);
});
