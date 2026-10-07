import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { isGuestCaptchaWidgetReady, verifyCaptchaToken, type CaptchaResolver } from "./verify";

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; body: URLSearchParams }> = [];

function mockFetch(res: () => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as URLSearchParams });
    return res();
  }) as typeof fetch;
}

const tenantTurnstile: CaptchaResolver = async () => ({
  provider: "turnstile",
  getSecret: async () => "tenant-secret",
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GUEST_CHAT_CAPTCHA_WIDGET_READY;
});

test("tenant Turnstile config verifies against siteverify with the TENANT secret", async () => {
  mockFetch(() => Response.json({ success: true }));
  const r = await verifyCaptchaToken({
    token: "tok",
    ip: "1.2.3.4",
    tenantId: "t1",
    resolver: tenantTurnstile,
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(calls[0]!.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(calls[0]!.body.get("secret"), "tenant-secret");
  assert.equal(calls[0]!.body.get("response"), "tok");
  assert.equal(calls[0]!.body.get("remoteip"), "1.2.3.4");
});

test("tenant hCaptcha config uses the hCaptcha endpoint", async () => {
  mockFetch(() => Response.json({ success: true }));
  const r = await verifyCaptchaToken({
    token: "tok",
    tenantId: "t1",
    resolver: async () => ({ provider: "hcaptcha", getSecret: async () => "hs" }),
  });
  assert.equal(r.ok, true);
  assert.equal(calls[0]!.url, "https://api.hcaptcha.com/siteverify");
});

test("a missing secret is rejected (fail closed) and no vendor call is made", async () => {
  mockFetch(() => Response.json({ success: true }));
  const r = await verifyCaptchaToken({
    token: "tok",
    tenantId: "t1",
    resolver: async () => ({ provider: "turnstile", getSecret: async () => null }),
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "captcha_failed");
  assert.equal(calls.length, 0);
});

test("resolver or secret errors fail closed", async () => {
  mockFetch(() => Response.json({ success: true }));
  const a = await verifyCaptchaToken({
    token: "tok",
    tenantId: "t1",
    resolver: async () => {
      throw new Error("db");
    },
  });
  assert.equal(a.ok, false);
  const b = await verifyCaptchaToken({
    token: "tok",
    tenantId: "t1",
    resolver: async () => ({
      provider: "turnstile",
      getSecret: async () => {
        throw new Error("vault");
      },
    }),
  });
  assert.equal(b.ok, false);
});

test("success:false, non-2xx, network and bad JSON all fail closed", async () => {
  const run = () => verifyCaptchaToken({ token: "tok", tenantId: "t1", resolver: tenantTurnstile });
  mockFetch(() => Response.json({ success: false, "error-codes": ["invalid-input-response"] }));
  assert.equal((await run()).ok, false);
  mockFetch(() => {
    throw new Error("network");
  });
  assert.equal((await run()).ok, false);
  mockFetch(() => new Response("oops", { status: 500 }));
  assert.equal((await run()).ok, false);
  mockFetch(() => new Response("not json", { status: 200 }));
  assert.equal((await run()).ok, false);
});

test("missing token with a provider is captcha_required; no provider is a no-op", async () => {
  mockFetch(() => Response.json({ success: true }));
  const r = await verifyCaptchaToken({ token: "  ", tenantId: "t1", resolver: tenantTurnstile });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "captcha_required");
  const none = await verifyCaptchaToken({
    token: null,
    tenantId: "t1",
    resolver: async () => ({ provider: "none", getSecret: async () => null }),
  });
  assert.equal(none.ok, true);
  assert.equal(calls.length, 0);
});

test("widget-ready gate needs the flag AND a resolved provider", async () => {
  assert.equal(await isGuestCaptchaWidgetReady("t1", tenantTurnstile), false);
  process.env.GUEST_CHAT_CAPTCHA_WIDGET_READY = "1";
  assert.equal(await isGuestCaptchaWidgetReady("t1", tenantTurnstile), true);
  assert.equal(
    await isGuestCaptchaWidgetReady("t1", async () => ({
      provider: "none",
      getSecret: async () => null,
    })),
    false,
  );
});
