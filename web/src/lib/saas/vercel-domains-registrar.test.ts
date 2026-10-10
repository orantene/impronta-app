import test from "node:test";
import assert from "node:assert/strict";

import {
  buyDomain,
  checkRegistrarSearchRateLimit,
  getDomainAuthCode,
  getDomainAvailability,
  getDomainPrice,
  readVercelRegistrarConfig,
  resetRegistrarSearchRateLimitForTests,
  searchDomainQuote,
  setDomainAutoRenew,
} from "./vercel-domains-registrar";

test("readVercelRegistrarConfig returns null when token missing", () => {
  assert.equal(readVercelRegistrarConfig({}), null);
  assert.equal(readVercelRegistrarConfig({ VERCEL_TEAM_ID: "team_1" }), null);
});

test("readVercelRegistrarConfig accepts VERCEL_API_TOKEN or VERCEL_TOKEN", () => {
  assert.deepEqual(readVercelRegistrarConfig({ VERCEL_API_TOKEN: " tok " }), {
    token: "tok",
    teamId: null,
  });
  assert.deepEqual(
    readVercelRegistrarConfig({ VERCEL_TOKEN: "t2", VERCEL_TEAM_ID: "team_x" }),
    { token: "t2", teamId: "team_x" },
  );
});

test("getDomainAvailability skips cleanly without token", async () => {
  const result = await getDomainAvailability("example.com", { env: {} });
  assert.equal(result.attempted, false);
  assert.match(result.skippedReason ?? "", /VERCEL_API_TOKEN/);
});

test("getDomainAvailability parses available=true", async () => {
  const calls: string[] = [];
  const result = await getDomainAvailability("available.test", {
    env: { VERCEL_API_TOKEN: "tok", VERCEL_TEAM_ID: "team_1" },
    fetchFn: async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ available: true }), { status: 200 });
    },
  });
  assert.equal(result.attempted, true);
  assert.equal(result.available, true);
  assert.match(calls[0] ?? "", /\/v1\/registrar\/domains\/available\.test\/availability/);
  assert.match(calls[0] ?? "", /teamId=team_1/);
});

test("getDomainPrice skips without token and parses price when present", async () => {
  const skipped = await getDomainPrice("x.com", { env: {} });
  assert.equal(skipped.attempted, false);

  const priced = await getDomainPrice("x.com", {
    env: { VERCEL_TOKEN: "tok" },
    fetchFn: async () =>
      new Response(JSON.stringify({ price: 12.5, currency: "usd", years: 1 }), {
        status: 200,
      }),
  });
  assert.equal(priced.attempted, true);
  assert.equal(priced.price, 12.5);
  assert.equal(priced.currency, "usd");
});

test("searchDomainQuote returns unavailable without calling price", async () => {
  let priceCalled = false;
  const result = await searchDomainQuote("taken.com", {
    env: { VERCEL_API_TOKEN: "tok" },
    fetchFn: async (url) => {
      if (url.includes("/price")) {
        priceCalled = true;
        return new Response("{}", { status: 200 });
      }
      return new Response(JSON.stringify({ available: false }), { status: 200 });
    },
  });
  assert.equal(result.attempted, true);
  assert.equal(result.quotes[0]?.available, false);
  assert.equal(priceCalled, false);
});

test("searchDomainQuote includes priceCents when available", async () => {
  const result = await searchDomainQuote("fresh.dev", {
    env: { VERCEL_API_TOKEN: "tok" },
    fetchFn: async (url) => {
      if (url.includes("/availability")) {
        return new Response(JSON.stringify({ available: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ price: 14, currency: "usd" }), {
        status: 200,
      });
    },
  });
  assert.equal(result.quotes[0]?.available, true);
  assert.equal(result.quotes[0]?.priceCents, 1400);
});

test("buyDomain skips without token and posts buy body when configured", async () => {
  const skipped = await buyDomain("a.com", {
    expectedPrice: 10,
    contactInformation: {
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
      phone: "+15551234567",
      address1: "1 Main",
      city: "NYC",
      state: "NY",
      zip: "10001",
      country: "US",
    },
    env: {},
  });
  assert.equal(skipped.attempted, false);

  let body = "";
  const bought = await buyDomain("a.com", {
    expectedPrice: 10,
    contactInformation: {
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
      phone: "+15551234567",
      address1: "1 Main",
      city: "NYC",
      state: "NY",
      zip: "10001",
      country: "US",
    },
    env: { VERCEL_API_TOKEN: "tok", VERCEL_TEAM_ID: "team_1" },
    fetchFn: async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ orderId: "ord_1" }), { status: 200 });
    },
  });
  assert.equal(bought.purchased, true);
  assert.equal(bought.orderId, "ord_1");
  assert.match(body, /"autoRenew":true/);
  assert.match(body, /"years":1/);
  assert.match(body, /"expectedPrice":10/);
});

test("checkRegistrarSearchRateLimit caps per talent id", () => {
  resetRegistrarSearchRateLimitForTests();
  const now = 1_000_000;
  for (let i = 0; i < 10; i++) {
    assert.equal(checkRegistrarSearchRateLimit("tal_1", now + i).ok, true);
  }
  const blocked = checkRegistrarSearchRateLimit("tal_1", now + 11);
  assert.equal(blocked.ok, false);
  assert.equal(checkRegistrarSearchRateLimit("tal_2", now + 11).ok, true);
});

test("setDomainAutoRenew skips without token and PATCHes when configured", async () => {
  const skipped = await setDomainAutoRenew("bought.test", false, { env: {} });
  assert.equal(skipped.attempted, false);

  let method = "";
  let body = "";
  const updated = await setDomainAutoRenew("bought.test", false, {
    env: { VERCEL_API_TOKEN: "tok", VERCEL_TEAM_ID: "team_1" },
    fetchFn: async (url, init) => {
      method = String(init?.method ?? "");
      body = String(init?.body ?? "");
      assert.match(url, /\/v1\/registrar\/domains\/bought\.test\/auto-renew/);
      assert.match(url, /teamId=team_1/);
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(updated.attempted, true);
  assert.equal(updated.updated, true);
  assert.equal(method, "PATCH");
  assert.match(body, /"autoRenew":false/);
});

test("getDomainAuthCode skips without token and returns authCode", async () => {
  const skipped = await getDomainAuthCode("bought.test", { env: {} });
  assert.equal(skipped.attempted, false);

  const got = await getDomainAuthCode("bought.test", {
    env: { VERCEL_TOKEN: "tok" },
    fetchFn: async (url) => {
      assert.match(url, /\/v1\/registrar\/domains\/bought\.test\/auth-code/);
      return new Response(JSON.stringify({ authCode: "AUTH-99" }), { status: 200 });
    },
  });
  assert.equal(got.attempted, true);
  assert.equal(got.authCode, "AUTH-99");
});
