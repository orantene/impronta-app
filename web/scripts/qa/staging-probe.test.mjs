import assert from "node:assert/strict";
import test from "node:test";

import { hostRefusal, jsonLdTypes, median, runProbe, scriptUrls } from "./staging-probe.core.mjs";

const SHA = "a".repeat(40);
const STAGING = "fxlankepwnvelxjrahwk";
const PROD = "pluhdapdnuiulvxmyspd";
const FAKE_KEY = "pk_live_FAKEKEY123456789";

const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const head = (extra = "") =>
  `<title>Hola</title><meta name="description" content="desc"><link rel="canonical" href="https://x/"><meta property="og:title" content="t"><meta property="og:description" content="d">${extra}`;

function makeSite(over = {}) {
  const bundle = over.bundle ?? `var u="https://${STAGING}.supabase.co";`;
  const routes = {
    "/llms.txt": "# llms\nhello",
    "/indexnow-key.txt": "abcdef0123456789",
    "/sitemap.xml": "<urlset><loc>https://app.staging.tulala.digital/w/hub</loc></urlset>",
    "/w/hub": head(),
    "/w/hub/posts": head('<link rel="alternate" hreflang="es" href="https://x/es">') + ld({ "@graph": [{ "@type": "BlogPosting" }, { "@type": "FAQPage" }] }),
    "/t/TAL-93940": head() + ld({ "@type": "Service" }) + '<script>{"translations":{"a":"b"}}</script>',
    "/en/t/TAL-93940": head().replace("Hola", "Stylist in Cancun"),
    "/": head(),
    "/login": `<html><head>${head()}<meta name="baggage" content="sentry-release=${over.sha ?? SHA},x"><script src="/_next/static/chunks/a.js"></script></head></html>`,
    "/_next/static/chunks/a.js": bundle,
    ...(over.routes ?? {}),
  };
  const requested = [];
  const fetchImpl = async (url, init) => {
    requested.push({ url, init });
    const u = new URL(url);
    const status = over.status?.[u.hostname] ?? (u.pathname in routes ? 200 : 404);
    const body = routes[u.pathname] ?? "";
    return { status, text: async () => body };
  };
  return { fetchImpl, requested };
}

async function probe(over = {}, opts = {}) {
  const site = makeSite(over);
  const lines = [];
  let t = 0;
  const res = await runProbe({
    opts: { expectSha: SHA, ...opts },
    fetchImpl: site.fetchImpl,
    now: over.now ?? (() => (t += 10)),
    gateToken: "gate-secret-token",
    out: (l) => lines.push(l),
  });
  return { ...res, lines, site, text: lines.join("\n") };
}
const row = (r, card, nameFrag) => r.rows.find((x) => x.card === card && x.name.includes(nameFrag));

test("host refusal: production hosts and lookalikes", () => {
  for (const h of ["tulala.digital", "app.tulala.digital", "impronta.tulala.digital", "hub.tulala.digital", "staging.tulala.digital.evil.com",
    "tulala.digital.staging.tulala.digital", "evil.com", "xstaging.tulala.digital", "https://app.tulala.digital", "app.tulala.digital@staging.tulala.digital", ""]) {
    assert.notEqual(hostRefusal(h), "", h);
  }
  for (const h of ["staging.tulala.digital", "app.staging.tulala.digital", "hub.staging.tulala.digital", "karla-beltran-demo.staging.tulala.digital", "localhost:3001"]) {
    assert.equal(hostRefusal(h), "", h);
  }
});

test("a refused host exits 2 and makes NO request", async () => {
  for (const key of ["hubHost", "appHost", "hubSubHost"]) {
    const site = makeSite();
    const r = await runProbe({ opts: { [key]: "app.tulala.digital" }, fetchImpl: site.fetchImpl, out: () => {} });
    assert.equal(r.code, 2);
    assert.equal(site.requested.length, 0);
  }
  const site = makeSite();
  const r = await runProbe({ opts: { hubHost: "staging.tulala.digital.evil.com" }, fetchImpl: site.fetchImpl, out: () => {} });
  assert.equal(r.code, 2);
  assert.equal(site.requested.length, 0);
});

test("all green: exit 0, never prints the gate token, sends it as a header", async () => {
  const r = await probe();
  assert.equal(r.code, 0, r.text);
  assert.ok(!r.text.includes("gate-secret-token"));
  assert.equal(r.site.requested[0].init.headers["x-staging-gate-token"], "gate-secret-token");
  assert.ok(r.site.requested.every((q) => q.init.method === "GET"));
});

test("TUL-589 llms.txt / IndexNow fail branches", async () => {
  const r = await probe({ routes: { "/llms.txt": "", "/indexnow-key.txt": "<html>" } });
  assert.equal(row(r, "TUL-589", "llms").status, "FAIL");
  assert.equal(row(r, "TUL-589", "IndexNow").status, "FAIL");
  assert.equal(r.code, 1);
});

test("TUL-591 /w tags and sitemap fail branches", async () => {
  const r = await probe({ routes: { "/w/hub": "<title>x</title>", "/sitemap.xml": "<urlset/>" } });
  assert.equal(row(r, "TUL-591", "title, canonical").status, "FAIL");
  assert.equal(row(r, "TUL-591", "sitemap").status, "FAIL");
});

test("TUL-1010 posts JSON-LD / hreflang fail branch", async () => {
  const r = await probe({ routes: { "/w/hub/posts": head() + ld({ "@type": "BlogPosting" }) } });
  const x = row(r, "TUL-1010", "Posts");
  assert.equal(x.status, "FAIL");
  assert.match(x.detail, /FAQPage/);
  assert.match(x.detail, /hreflang/);
});

test("TUL-1273 services JSON-LD fail branch", async () => {
  const r = await probe({ routes: { "/t/TAL-93940": head() } });
  assert.equal(row(r, "TUL-1273", "services").status, "FAIL");
});

test("TUL-890 demo hosts: 200 passes, non-200 fails", async () => {
  const ok = await probe();
  assert.equal(ok.rows.filter((x) => x.card === "TUL-890" && x.status === "PASS").length, 3);
  const bad = await probe({ status: { "mateo-ferrer-demo.staging.tulala.digital": 404 } });
  assert.equal(bad.rows.filter((x) => x.card === "TUL-890" && x.status === "FAIL").length, 1);
});

test("TUL-858 EN meta with Spanish category words fails", async () => {
  const r = await probe({ routes: { "/en/t/TAL-93940": head().replace("Hola", "Limpieza profunda") } });
  assert.equal(row(r, "TUL-858", "EN meta").status, "FAIL");
});

test("TUL-1156 payload budget", async () => {
  const big = `<script>{"translations":"${"x".repeat(500)}"}</script>`;
  const r = await probe({ routes: { "/t/TAL-93940": head() + ld({ "@type": "Service" }) + big } }, { payloadBudgetBytes: 100 });
  assert.equal(row(r, "TUL-1156", "payload").status, "FAIL");
  assert.equal(row(await probe(), "TUL-1156", "payload").status, "PASS");
});

test("median of 3 and TUL-1181 cold render, cache-busted", async () => {
  assert.equal(median([300, 100, 200]), 200);
  let clock = 0;
  const durations = [1000, 9000, 1200]; // median 1200
  let call = 0;
  const site = makeSite();
  const times = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    if (u.searchParams.has("_cb")) {
      times.push(init.headers["cache-control"]);
      clock += durations[call++];
    }
    return site.fetchImpl(url, init);
  };
  const r = await runProbe({ opts: { expectSha: SHA, coldMs: 2000 }, fetchImpl, now: () => clock, out: () => {} });
  assert.equal(call, 3);
  assert.deepEqual(times, ["no-cache", "no-cache", "no-cache"]);
  const x = row(r, "TUL-1181", "cold-render");
  assert.equal(x.status, "PASS");
  assert.match(x.detail, /median 1200/);
  const r2 = await runProbe({ opts: { expectSha: SHA, coldMs: 1000 }, fetchImpl: async (u, i) => { if (new URL(u).searchParams.has("_cb")) clock += 3000; return site.fetchImpl(u, i); }, now: () => clock, out: () => {} });
  assert.equal(row(r2, "TUL-1181", "cold-render").status, "FAIL");
});

test("TUL-554 TTFB and SEO sanity", async () => {
  assert.equal(row(await probe(), "TUL-554", "TTFB").status, "PASS");
  assert.equal(row(await probe({ routes: { "/": "<html></html>" } }), "TUL-554", "TTFB").status, "FAIL");
  assert.equal(row(await probe({}, { ttfbMs: 1 }), "TUL-554", "TTFB").status, "FAIL");
});

test("cut: staging ref present, prod ref absent -> PASS; prod ref present -> FAIL", async () => {
  assert.equal(row(await probe(), "CUT", "fxlank").status, "PASS");
  const bad = await probe({ bundle: `var a="${STAGING}",b="${PROD}";` });
  assert.equal(row(bad, "CUT", "fxlank").status, "FAIL");
  const none = await probe({ bundle: "var a=1;" });
  assert.equal(row(none, "CUT", "fxlank").status, "FAIL");
});

test("cut: pk_live_ -> FAIL without echoing the key; clean and pk_test_ -> PASS", async () => {
  const bad = await probe({ bundle: `var u="${STAGING}",k="${FAKE_KEY}";` });
  assert.equal(row(bad, "CUT", "pk_live_").status, "FAIL");
  assert.ok(!bad.text.includes(FAKE_KEY));
  assert.ok(!bad.text.includes("FAKEKEY"));
  assert.ok(bad.text.includes("pk_live_****"));
  assert.ok(bad.text.includes("/_next/static/chunks/a.js"));
  assert.equal(row(await probe(), "CUT", "pk_live_").status, "PASS");
  const test_ = await probe({ bundle: `var u="${STAGING}",k="pk_test_abc123DEF";` });
  assert.equal(row(test_, "CUT", "pk_live_").status, "PASS");
});

test("cut: sentry-release equals --expect-sha", async () => {
  assert.equal(row(await probe(), "CUT", "sentry-release").status, "PASS");
  assert.equal(row(await probe({ sha: "b".repeat(40) }), "CUT", "sentry-release").status, "FAIL");
  const skip = await probe({}, { expectSha: "" });
  assert.equal(row(skip, "CUT", "sentry-release").status, "SKIP");
});

test("helpers", () => {
  assert.deepEqual([...jsonLdTypes(ld({ "@graph": [{ "@type": ["A", "B"] }] }))].sort(), ["A", "B"]);
  assert.deepEqual(scriptUrls('<script src="/_next/static/c/x.js?v=1"></script><script src="/other.js"></script>', "https://h"), ["https://h/_next/static/c/x.js?v=1"]);
});
