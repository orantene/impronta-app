// Mocked-I/O tests for qa-host.mjs claim/list/shareUrlFor (TUL-196).
// No network, git or real clock: fetch, now, env, log and warn are injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createQaHost } from "./qa-host.mjs";

const NOW = 1_800_000_000_000;
const HOUR = 3600_000;
const VERCEL_TOKEN = "vcl_SECRET_API_TOKEN";
// secret-scan:allow: fake fixture for the mocked fetch below, never a real secret
const BYPASS = "bypass_SECRET_AUTOMATION";
const HOST = "qa-1.tulala.digital";
const share = (token, expiresMs) => ({ [token]: { scope: "shareable-link", expires: expiresMs } });
const automation = { [BYPASS]: { scope: "automation-bypass" } };
const failing = (status) => ({ ok: false, status, json: async () => ({}) });

/** Fake fetch routed by "METHOD /path" prefix; records every call. A route is
 * { body } (200), a raw { ok:false } response, or a function that may throw. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? "GET"} ${u.pathname}`;
    calls.push({ key, url, init });
    // Prefer the longest matching prefix so /v4/aliases/<host> wins over a bare /v4/aliases.
    const hit = Object.entries(routes)
      .filter(([k]) => key.startsWith(k))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (!hit) return failing(404);
    const r = typeof hit[1] === "function" ? hit[1](init) : hit[1];
    if (r.ok === false) return r;
    return { ok: true, status: 200, json: async () => r.body ?? null };
  };
  fn.calls = calls;
  return fn;
}

function harness(routes, extra = {}) {
  const out = [];
  const err = [];
  const fetch = fakeFetch(routes);
  const qa = createQaHost({
    fetch,
    now: () => NOW,
    env: { VERCEL_TOKEN, VERCEL_AUTOMATION_BYPASS_SECRET: BYPASS },
    log: (...a) => out.push(a.join(" ")),
    warn: (...a) => err.push(a.join(" ")),
    liveBranches: () => new Set(["factory/x"]),
    ...extra,
  });
  return { qa, out, err, fetch, all: () => [...out, ...err].join("\n") };
}

/** Free pool (every host lookup 404s) + READY preview + post-claim reads. */
const baseRoutes = (deploymentBypass, patch) => ({
  "GET /v6/deployments": { body: { deployments: [{ uid: "dpl_1" }] } },
  "POST /v2/deployments/dpl_1/aliases": { body: {} },
  "GET /v13/deployments/dpl_1": { body: { protectionBypass: deploymentBypass } },
  // After claim, current code re-reads the aliased host; absent = 404 → null alias.
  ...(patch ? { "PATCH /aliases/dpl_1/protection-bypass": patch } : {}),
});
const patches = (h) => h.fetch.calls.filter((c) => c.key.startsWith("PATCH"));

test("claim mints a share link when none exists and prints only the share URL", async () => {
  const h = harness(baseRoutes(automation, { body: { protectionBypass: { ...automation, ...share("tok_new", NOW + 23 * HOUR) } } }));
  await h.qa.claim("factory/x");
  assert.deepEqual(h.out, [`https://${HOST}/?_vercel_share=tok_new`]);
  assert.deepEqual(h.err, []);
  assert.equal(JSON.parse(patches(h)[0].init.body).ttl, 23 * 3600);
});

test("claim succeeds and warns when the share-link call fails", async () => {
  const h = harness(baseRoutes({}, failing(500)));
  await h.qa.claim("factory/x");
  assert.deepEqual(h.out, [`https://${HOST}`]); // bare host fallback, claim did not throw
  assert.equal(h.err.length, 1);
  assert.match(h.err[0], /warning: no share link/);
  assert.match(h.err[0], /-> 500/);
  assert.ok(h.fetch.calls.some((c) => c.key.startsWith("POST /v2/deployments/dpl_1/aliases")), "lease was created");
});

test("claim warns when the response carries no shareable link", async () => {
  const h = harness(baseRoutes({}, { body: { protectionBypass: automation } }));
  await h.qa.claim("factory/x");
  assert.deepEqual(h.out, [`https://${HOST}`]);
  assert.match(h.err[0], /no shareable link/);
});

test("claim warns when fetch itself rejects", async () => {
  const h = harness(baseRoutes({}, () => { throw new Error("socket hang up"); }));
  await h.qa.claim("factory/x");
  assert.deepEqual(h.out, [`https://${HOST}`]);
  assert.match(h.err[0], /socket hang up/);
});

test("an unexpired link is reused and no PATCH is made", async () => {
  const h = harness(baseRoutes({ ...automation, ...share("tok_old", NOW + 5 * HOUR) }));
  await h.qa.claim("factory/x");
  assert.deepEqual(h.out, [`https://${HOST}/?_vercel_share=tok_old`]);
  assert.equal(patches(h).length, 0);
});

test("an expired (or nearly expired) link is replaced by a fresh one", async () => {
  for (const exp of [NOW - HOUR, NOW + 10 * 60_000]) {
    const h = harness(
      baseRoutes(share("tok_old", exp), { body: { protectionBypass: { ...share("tok_old", exp), ...share("tok_fresh", NOW + 23 * HOUR) } } }),
    );
    await h.qa.claim("factory/x");
    assert.deepEqual(h.out, [`https://${HOST}/?_vercel_share=tok_fresh`]);
    assert.equal(patches(h).length, 1);
  }
});

test("the injected clock decides expiry", async () => {
  const bypass = share("tok_t", NOW + 5 * HOUR);
  const early = harness(baseRoutes(bypass), { now: () => NOW });
  await early.qa.claim("factory/x");
  assert.match(early.out[0], /tok_t/);
  const late = harness(baseRoutes(bypass, { body: { protectionBypass: share("tok_u", NOW + 30 * HOUR) } }), { now: () => NOW + 6 * HOUR });
  await late.qa.claim("factory/x");
  assert.match(late.out[0], /tok_u/);
});

test("the Vercel token and automation bypass secret never reach logs", async () => {
  const scenarios = [
    harness(baseRoutes(automation, { body: { protectionBypass: { ...automation, ...share("tok_new", NOW + 23 * HOUR) } } })),
    harness(baseRoutes(automation, failing(403))),
    harness(baseRoutes(automation, { body: { protectionBypass: automation } })),
    harness(baseRoutes({ ...automation, ...share("tok_old", NOW + 5 * HOUR) })),
  ];
  for (const h of scenarios) {
    await h.qa.claim("factory/x");
    const text = h.all();
    assert.ok(!text.includes(VERCEL_TOKEN), "api token leaked");
    assert.ok(!text.includes(BYPASS), "automation bypass leaked");
    // The only credential allowed in output is the share token inside the share URL.
    for (const line of h.out) assert.match(line, /^https:\/\/qa-1\.tulala\.digital(\/\?_vercel_share=tok_\w+)?$/);
  }
  // The API token travels only in the Authorization header, never in a URL or body.
  for (const c of scenarios[0].fetch.calls) {
    assert.ok(!c.url.includes(VERCEL_TOKEN));
    assert.ok(!String(c.init.body ?? "").includes(VERCEL_TOKEN));
    assert.equal(c.init.headers.authorization, `Bearer ${VERCEL_TOKEN}`);
  }
});

test("a missing VERCEL_TOKEN fails without calling fetch", async () => {
  const h = harness({}, { env: {} });
  await assert.rejects(() => h.qa.claim("factory/x"), /VERCEL_TOKEN is not set/);
  assert.equal(h.fetch.calls.length, 0);
});

test("claim throws when the branch has no READY preview", async () => {
  const h = harness({ "GET /v6/deployments": { body: { deployments: [] } } });
  await assert.rejects(() => h.qa.claim("factory/x"), /no READY preview/);
});

test("list prints host, branch and share link with expiry, and never secrets", async () => {
  const h = harness({
    [`GET /v4/aliases/${HOST}`]: {
      body: { alias: HOST, uid: "al_1", deploymentId: "dpl_1", updatedAt: NOW - 2 * HOUR },
    },
    "GET /v13/deployments/dpl_1": {
      body: { meta: { githubCommitRef: "factory/x", githubCommitSha: "abcdef1234567890" }, protectionBypass: { ...automation, ...share("tok_l", NOW + 5 * HOUR) } },
    },
  });
  await h.qa.list();
  assert.equal(h.out[0], `${HOST} -> factory/x  abcdef123  2h`);
  assert.equal(h.out[1], `    https://${HOST}/?_vercel_share=tok_l  (expires in 5h)`);
  assert.ok(h.out.includes("qa-2.tulala.digital -> (free)"));
  assert.ok(!h.all().includes(BYPASS) && !h.all().includes(VERCEL_TOKEN));
});

test("list says to re-claim when the only link is expired", async () => {
  const h = harness({
    [`GET /v4/aliases/${HOST}`]: {
      body: { alias: HOST, uid: "al_1", deploymentId: "dpl_1", updatedAt: NOW - HOUR },
    },
    "GET /v13/deployments/dpl_1": { body: { meta: { githubCommitRef: "b" }, protectionBypass: share("tok_e", NOW - HOUR) } },
  });
  await h.qa.list();
  assert.match(h.out[1], /no valid share link/);
  assert.ok(!h.all().includes("tok_e"));
});
