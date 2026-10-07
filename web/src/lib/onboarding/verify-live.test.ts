import test from "node:test";
import assert from "node:assert/strict";
import { verifyLivePage, verifyLivePageWithRetry } from "./verify-live";

const res = (status: number, body: string) => ({ status, text: async () => body }) as unknown as Response;
const stub = (fn: () => Promise<Response>) => fn as unknown as typeof fetch;

test("passes on 200 containing the name (accent and case insensitive)", async () => {
  const r = await verifyLivePage({ url: "https://x.test", name: "Jose Perez", fetchImpl: stub(async () => res(200, "<h1>JOSÉ Pérez</h1>")) });
  assert.deepEqual(r, { ok: true });
});

test("fails on non-200", async () => {
  const r = await verifyLivePage({ url: "https://x.test", name: "Ana", fetchImpl: stub(async () => res(404, "Page not found")) });
  assert.deepEqual(r, { ok: false, reason: "status", status: 404 });
});

test("fails when 200 but not about the person", async () => {
  const r = await verifyLivePage({ url: "https://x.test", name: "Ana", fetchImpl: stub(async () => res(200, "<h1>marta reyes</h1>")) });
  assert.deepEqual(r, { ok: false, reason: "name_missing" });
});

test("fails on network error, missing url, missing name", async () => {
  const boom = stub(async () => { throw new Error("x"); });
  assert.deepEqual(await verifyLivePage({ url: "https://x.test", name: "Ana", fetchImpl: boom }), { ok: false, reason: "network" });
  assert.deepEqual(await verifyLivePage({ url: null, name: "Ana" }), { ok: false, reason: "no_url" });
  assert.deepEqual(await verifyLivePage({ url: "https://x.test", name: " " }), { ok: false, reason: "no_name" });
});

test("retries a lagging publish, then reports the truth", async () => {
  let n = 0;
  const sleep = async () => {};
  const lag = stub(async () => (++n < 3 ? res(404, "") : res(200, "Ana")));
  assert.deepEqual(await verifyLivePageWithRetry({ url: "https://x.test", name: "Ana", fetchImpl: lag, sleep }), { ok: true });
  const dead = stub(async () => res(404, ""));
  const r = await verifyLivePageWithRetry({ url: "https://x.test", name: "Ana", fetchImpl: dead, sleep, attempts: 2 });
  assert.equal(r.ok, false);
});
