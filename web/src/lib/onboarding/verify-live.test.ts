import test from "node:test";
import assert from "node:assert/strict";
import { resolveLiveCheckOrigin, verifyLivePage, verifyLivePageWithRetry } from "./verify-live";

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

const DEF = "https://ana.tulala.digital";
const base = { vercelEnv: undefined, nodeEnv: "development", defaultOrigin: DEF };
const LOCAL = "http://127.0.0.1:3008";

test("origin: unset or empty override returns the default", () => {
  assert.equal(resolveLiveCheckOrigin({ ...base, override: undefined }), DEF);
  assert.equal(resolveLiveCheckOrigin({ ...base, override: "" }), DEF);
});

test("origin: valid override is used", () => {
  assert.equal(resolveLiveCheckOrigin({ ...base, override: LOCAL }), LOCAL);
  assert.equal(resolveLiveCheckOrigin({ ...base, override: `${LOCAL}/x`, vercelEnv: "development" }), LOCAL);
});

test("origin: VERCEL_ENV production or preview refuses the override", () => {
  assert.equal(resolveLiveCheckOrigin({ ...base, override: LOCAL, vercelEnv: "production" }), DEF);
  assert.equal(resolveLiveCheckOrigin({ ...base, override: LOCAL, vercelEnv: "preview" }), DEF);
});

test("origin: NODE_ENV production refuses the override", () => {
  assert.equal(resolveLiveCheckOrigin({ ...base, override: LOCAL, nodeEnv: "production" }), DEF);
});

test("origin: garbage override refused", () => {
  for (const o of ["javascript:alert(1)", "not a url", "ftp://x.test", "   "]) {
    assert.equal(resolveLiveCheckOrigin({ ...base, override: o }), DEF);
  }
});

test("verifyLivePage fetches the override origin with the original host header", async () => {
  const prev = process.env.LIVE_CHECK_ORIGIN;
  const prevV = process.env.VERCEL_ENV;
  process.env.LIVE_CHECK_ORIGIN = LOCAL;
  delete process.env.VERCEL_ENV;
  try {
    let seen = "";
    let host = "";
    const f = stub((async (u: string, init: RequestInit) => {
      seen = u;
      host = (init.headers as Record<string, string>).host;
      return res(200, "Ana");
    }) as never);
    const r = await verifyLivePage({ url: "https://ana.tulala.digital/", name: "Ana", fetchImpl: f });
    assert.deepEqual(r, { ok: true });
    assert.equal(seen, `${LOCAL}/`);
    assert.equal(host, "ana.tulala.digital");
  } finally {
    if (prev === undefined) delete process.env.LIVE_CHECK_ORIGIN; else process.env.LIVE_CHECK_ORIGIN = prev;
    if (prevV !== undefined) process.env.VERCEL_ENV = prevV;
  }
});

test("with LIVE_CHECK_ORIGIN the page is fetched from the local server and routed by the original Host (undici drops host, node:http keeps it)", async () => {
  const { createServer } = await import("node:http");
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(String(req.headers.host));
    if (req.headers.host === "rosa.tulala.digital") {
      res.statusCode = 200;
      res.end("<h1>Rosa Díaz</h1>");
    } else {
      res.statusCode = 404;
      res.end("Host not registered");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const prev = { o: process.env.LIVE_CHECK_ORIGIN, v: process.env.VERCEL_ENV };
  try {
    delete process.env.VERCEL_ENV;
    process.env.LIVE_CHECK_ORIGIN = `http://127.0.0.1:${port}`;
    const ok = await verifyLivePage({ url: "https://rosa.tulala.digital/", name: "Rosa Díaz" });
    assert.deepEqual(ok, { ok: true });
    assert.deepEqual(seen, ["rosa.tulala.digital"]);
    const wrong = await verifyLivePage({ url: "https://other.tulala.digital/", name: "Rosa Díaz" });
    assert.deepEqual(wrong, { ok: false, reason: "status", status: 404 });
  } finally {
    if (prev.o === undefined) delete process.env.LIVE_CHECK_ORIGIN; else process.env.LIVE_CHECK_ORIGIN = prev.o;
    if (prev.v === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prev.v;
    await new Promise((r) => server.close(r));
  }
});
