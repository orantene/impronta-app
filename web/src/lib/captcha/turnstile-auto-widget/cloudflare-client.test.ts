import assert from "node:assert/strict";
import { test } from "node:test";

import { createTurnstileWidgetClient, type FetchLike } from "./cloudflare-client";

type Call = { url: string; method: string; body: unknown; auth: string | null; hasSignal: boolean };

function mockFetch(responder: (call: Call) => Response | Promise<Response>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      auth: headers.get("authorization"),
      hasSignal: init?.signal instanceof AbortSignal,
    };
    calls.push(call);
    return responder(call);
  };
  return { fetch, calls };
}

const BASE = "https://api.cloudflare.com/client/v4/accounts/acct-1/challenges/widgets";

function client(fetch: FetchLike, timeoutMs?: number) {
  return createTurnstileWidgetClient({ accountId: "acct-1", apiToken: "tok-secret", fetch, timeoutMs });
}

test("listWidgets: GET with bearer token and timeout signal, parses sitekey + name", async () => {
  const { fetch, calls } = mockFetch(() =>
    Response.json({
      success: true,
      result: [
        { sitekey: "0xA", name: "tulala:a.com", domains: ["a.com"] },
        { sitekey: 7, name: "bad" },
      ],
      result_info: { total_count: 2 },
    }),
  );
  const r = await client(fetch).listWidgets();
  assert.deepEqual(r, { ok: true, widgets: [{ sitekey: "0xA", name: "tulala:a.com" }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "GET");
  assert.equal(calls[0]?.url, `${BASE}?page=1&per_page=50`);
  assert.equal(calls[0]?.auth, "Bearer tok-secret");
  assert.equal(calls[0]?.hasSignal, true);
});

test("listWidgets follows pages until total_count is reached", async () => {
  const page = (n: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({ sitekey: `0x${n}-${i}`, name: `w${n}-${i}` }));
  const { fetch, calls } = mockFetch((call) => {
    const p = Number(new URL(call.url).searchParams.get("page"));
    return Response.json({ success: true, result: p === 1 ? page(1, 50) : page(2, 3), result_info: { total_count: 53 } });
  });
  const r = await client(fetch).listWidgets();
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.widgets.length, 53);
  assert.equal(calls.length, 2);
});

test("createWidget: POST name + both domains + managed mode; returns sitekey + secret", async () => {
  const { fetch, calls } = mockFetch(() =>
    Response.json({ success: true, result: { sitekey: "0xNEW", secret: "0xSECRET", name: "tulala:maria-nails.com" } }),
  );
  const r = await client(fetch).createWidget({
    name: "tulala:maria-nails.com",
    domains: ["maria-nails.com", "www.maria-nails.com"],
  });
  assert.deepEqual(r, { ok: true, widget: { sitekey: "0xNEW", secret: "0xSECRET", name: "tulala:maria-nails.com" } });
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, BASE);
  assert.deepEqual(calls[0]?.body, {
    name: "tulala:maria-nails.com",
    domains: ["maria-nails.com", "www.maria-nails.com"],
    mode: "managed",
  });
});

test("createWidget without a secret in the body is a failure (never stores half keys)", async () => {
  const { fetch } = mockFetch(() => Response.json({ success: true, result: { sitekey: "0xNEW" } }));
  const r = await client(fetch).createWidget({ name: "tulala:a.com", domains: ["a.com"] });
  assert.deepEqual(r, { ok: false, status: 200, code: "bad_body" });
});

test("deleteWidget: DELETE on the sitekey path", async () => {
  const { fetch, calls } = mockFetch(() => Response.json({ success: true, result: { sitekey: "0xA" } }));
  const r = await client(fetch).deleteWidget("0xA");
  assert.deepEqual(r, { ok: true });
  assert.equal(calls[0]?.method, "DELETE");
  assert.equal(calls[0]?.url, `${BASE}/0xA`);
  assert.equal(calls[0]?.body, null);
});

test("errors come back as results, never throws: http, api, bad body, network, timeout", async () => {
  const http = mockFetch(() => Response.json({ success: false }, { status: 403 }));
  assert.deepEqual(await client(http.fetch).listWidgets(), { ok: false, status: 403, code: "http_error" });

  const api = mockFetch(() => Response.json({ success: false, errors: [{ code: 1 }] }));
  assert.deepEqual(await client(api.fetch).createWidget({ name: "n", domains: [] }), {
    ok: false,
    status: 200,
    code: "api_error",
  });

  const bad = mockFetch(() => new Response("<html>", { status: 200 }));
  assert.deepEqual(await client(bad.fetch).deleteWidget("0xA"), { ok: false, status: 200, code: "bad_body" });

  const net: FetchLike = async () => {
    throw new TypeError("fetch failed");
  };
  assert.deepEqual(await client(net).listWidgets(), { ok: false, status: null, code: "network" });

  const slow: FetchLike = (_url, init) =>
    new Promise((_resolve, reject) => {
      // AbortSignal.timeout's timer is unref'd; hold the event loop open until it fires.
      const keepAlive = setTimeout(() => reject(new Error("timeout signal never fired")), 5_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        reject(init?.signal?.reason);
      });
    });
  assert.deepEqual(await client(slow, 20).listWidgets(), { ok: false, status: null, code: "timeout" });
});
