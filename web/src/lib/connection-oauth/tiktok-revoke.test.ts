import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

/**
 * D4 — disconnect must kill the TikTok grant upstream. Pins the wire shape
 * (`client_key`, `client_secret`, `token`, form-encoded POST to
 * /v2/oauth/revoke/) and the failure contract (status present for a vendor
 * refusal, absent for transport failure).
 */

const ENV = {
  TIKTOK_OAUTH_CLIENT_KEY: "tt-key-test",
  TIKTOK_OAUTH_CLIENT_SECRET: "tt-secret-test",
};
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
});

test("revoke posts client_key + client_secret + token, form-encoded, to /v2/oauth/revoke/", async () => {
  const { revokeTikTokToken } = await import("./tiktok");
  let seen: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), init: init ?? {} };
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const res = await revokeTikTokToken("act-123");
  assert.deepEqual(res, { ok: true });
  assert.ok(seen);
  const s = seen as unknown as { url: string; init: RequestInit };
  assert.equal(s.url, "https://open.tiktokapis.com/v2/oauth/revoke/");
  assert.equal(s.init.method, "POST");
  const body = s.init.body as URLSearchParams;
  assert.equal(body.get("client_key"), "tt-key-test");
  assert.equal(body.get("client_secret"), "tt-secret-test");
  assert.equal(body.get("token"), "act-123");
});

test("a vendor refusal carries its status; a transport failure carries none", async () => {
  const { revokeTikTokToken } = await import("./tiktok");
  globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  const refused = await revokeTikTokToken("act-123");
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.status, 401);

  globalThis.fetch = (async () => {
    throw new Error("ECONNRESET");
  }) as typeof fetch;
  const down = await revokeTikTokToken("act-123");
  assert.equal(down.ok, false);
  if (!down.ok) assert.equal(down.status, undefined);
});

test("missing credentials refuse before any network call", async () => {
  const { revokeTikTokToken } = await import("./tiktok");
  delete process.env.TIKTOK_OAUTH_CLIENT_SECRET;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const res = await revokeTikTokToken("act-123");
  assert.equal(res.ok, false);
  assert.equal(called, false);
});
