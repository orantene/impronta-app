/**
 * TUL-589: the IndexNow ping helper must never ping outside Vercel's actual
 * production environment (staging/preview must never ping a real search
 * engine), and must never throw — a publish/unpublish action must succeed
 * even if IndexNow itself is down or misconfigured.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { indexNowPingAllowed, pingIndexNow, pingIndexNowUrl, INDEXNOW_KEY_LOCATION_PATH, INDEXNOW_TIMEOUT_MS } from "./indexnow";

const PROD_ENV = { VERCEL_ENV: "production", INDEXNOW_API_KEY: "test-key-123" };

test("indexNowPingAllowed: false unless VERCEL_ENV=production AND a key is set", () => {
  assert.equal(indexNowPingAllowed(PROD_ENV), true);
  assert.equal(indexNowPingAllowed({ VERCEL_ENV: "preview", INDEXNOW_API_KEY: "k" }), false, "preview must never ping");
  assert.equal(indexNowPingAllowed({ VERCEL_ENV: "development", INDEXNOW_API_KEY: "k" }), false, "local dev must never ping");
  assert.equal(indexNowPingAllowed({ VERCEL_ENV: "production" }), false, "no key configured must never ping");
  assert.equal(indexNowPingAllowed({}), false);
});

test("pingIndexNow: no-ops (no fetch call) outside production", async () => {
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    await pingIndexNow(["https://example.tulala.digital/posts/hello"], { VERCEL_ENV: "preview", INDEXNOW_API_KEY: "k" });
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("pingIndexNow: no-ops on an empty urls array even in production", async () => {
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    await pingIndexNow([], PROD_ENV);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("pingIndexNow: posts host, key, keyLocation and urlList to the IndexNow endpoint in production", async () => {
  let capturedUrl: string | undefined;
  let capturedBody: unknown;
  const originalFetch = global.fetch;
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body));
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  try {
    await pingIndexNow(
      ["https://talent-slug.tulala.digital/about", "https://talent-slug.tulala.digital/contact"],
      PROD_ENV,
    );
    assert.equal(capturedUrl, "https://api.indexnow.org/indexnow");
    assert.deepEqual(capturedBody, {
      host: "talent-slug.tulala.digital",
      key: "test-key-123",
      keyLocation: `https://talent-slug.tulala.digital${INDEXNOW_KEY_LOCATION_PATH}`,
      urlList: ["https://talent-slug.tulala.digital/about", "https://talent-slug.tulala.digital/contact"],
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("pingIndexNow: refuses (no fetch) when the urls don't share one host", async () => {
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    await pingIndexNow(["https://a.tulala.digital/x", "https://b.tulala.digital/y"], PROD_ENV);
    assert.equal(fetchCalled, false, "IndexNow requires every url in one submission to share a host");
  } finally {
    global.fetch = originalFetch;
  }
});

test("pingIndexNow: passes an AbortSignal timing out at INDEXNOW_TIMEOUT_MS, so a slow api.indexnow.org can never hang a publish click", async () => {
  let capturedSignal: AbortSignal | undefined;
  const originalFetch = global.fetch;
  global.fetch = (async (_url: string | URL, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  try {
    await pingIndexNow(["https://example.tulala.digital/x"], PROD_ENV);
    assert.ok(capturedSignal instanceof AbortSignal, "fetch must receive an AbortSignal");
    assert.equal(INDEXNOW_TIMEOUT_MS, 3000);
  } finally {
    global.fetch = originalFetch;
  }
});

test("pingIndexNow: swallows an aborted (timed-out) request instead of throwing", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  }) as typeof fetch;
  try {
    await assert.doesNotReject(() => pingIndexNow(["https://example.tulala.digital/x"], PROD_ENV));
  } finally {
    global.fetch = originalFetch;
  }
});

test("pingIndexNow: swallows a network failure instead of throwing", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    await assert.doesNotReject(() => pingIndexNow(["https://example.tulala.digital/x"], PROD_ENV));
  } finally {
    global.fetch = originalFetch;
  }
});

test("pingIndexNow: swallows a non-ok response instead of throwing", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
  try {
    await assert.doesNotReject(() => pingIndexNow(["https://example.tulala.digital/x"], PROD_ENV));
  } finally {
    global.fetch = originalFetch;
  }
});

test("pingIndexNowUrl: no-ops on null/undefined (the common 'URL not resolved' hook-call shape)", async () => {
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    await pingIndexNowUrl(null, PROD_ENV);
    await pingIndexNowUrl(undefined, PROD_ENV);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});
