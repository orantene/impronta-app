import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { verifyCaptchaToken } from "./verify";

const realFetch = globalThis.fetch;
const saved = { t: process.env.TURNSTILE_SECRET, h: process.env.HCAPTCHA_SECRET };
let calls: Array<{ url: string; body: URLSearchParams }> = [];

function mockFetch(res: () => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as URLSearchParams });
    return res();
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.TURNSTILE_SECRET = "tsecret";
  delete process.env.HCAPTCHA_SECRET;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (saved.t === undefined) delete process.env.TURNSTILE_SECRET;
  else process.env.TURNSTILE_SECRET = saved.t;
  if (saved.h === undefined) delete process.env.HCAPTCHA_SECRET;
  else process.env.HCAPTCHA_SECRET = saved.h;
});

test("turnstile success posts secret + response + remoteip to siteverify", async () => {
  mockFetch(() => Response.json({ success: true }));
  const r = await verifyCaptchaToken({ token: "tok", ip: "1.2.3.4" });
  assert.deepEqual(r, { ok: true });
  assert.equal(calls[0]!.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(calls[0]!.body.get("secret"), "tsecret");
  assert.equal(calls[0]!.body.get("response"), "tok");
  assert.equal(calls[0]!.body.get("remoteip"), "1.2.3.4");
});

test("turnstile success:false with error codes is rejected", async () => {
  mockFetch(() => Response.json({ success: false, "error-codes": ["invalid-input-response"] }));
  const r = await verifyCaptchaToken({ token: "tok" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "captcha_failed");
});

test("fails CLOSED on network error, non-2xx and bad JSON", async () => {
  mockFetch(() => {
    throw new Error("network");
  });
  assert.equal((await verifyCaptchaToken({ token: "tok" })).ok, false);
  mockFetch(() => new Response("oops", { status: 500 }));
  assert.equal((await verifyCaptchaToken({ token: "tok" })).ok, false);
  mockFetch(() => new Response("not json", { status: 200 }));
  assert.equal((await verifyCaptchaToken({ token: "tok" })).ok, false);
});

test("missing token with a secret configured is captcha_required", async () => {
  mockFetch(() => Response.json({ success: true }));
  const r = await verifyCaptchaToken({ token: "  " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "captcha_required");
  assert.equal(calls.length, 0);
});
