/**
 * tracking.test.ts — the whole rule set for Website → Setup → Tracking.
 *
 * Isolation is asserted here too, but its home is
 * `lib/saas/tracking-tenant-isolation.test.ts`, which runs in the
 * `test:tenant-isolation` lane — the lane a reviewer opens when they ask "what
 * stops cross-tenant leakage".
 *
 * The last test in this file is the unusual one: it reads `next.config.ts` and
 * asserts that every host a provider spec declares actually appears in the CSP
 * directive it needs. That pairing has no other guard, and getting it wrong is
 * invisible — the admin screen says "Connected", the browser blocks the tag, and
 * the tenant collects nothing for months.
 *
 * LANE
 * ────
 * `npm run test:builder-capabilities:a`, which expands every `*.test.ts` at
 * depth 1 under `src/lib/site-admin`, so this file is registered by existing.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  TRACKING_PROVIDERS,
  TRACKING_PROVIDER_IDS,
  connectedProviders,
  isTrackingProviderId,
  normalizeTrackingId,
  parseTrackingConfig,
  selectTrackingForRender,
  trackingCspHosts,
  trackingToSettings,
  withTrackingId,
  type OwnedTrackingConfig,
} from "./tracking";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function owned(providers: Record<string, string>): OwnedTrackingConfig {
  return { tenantId: TENANT, providers: providers as OwnedTrackingConfig["providers"] };
}

// ── validation: the accept side ──────────────────────────────────────────────

test("a well-formed ID is accepted for every provider", () => {
  const valid: Record<string, string> = {
    ga4: "G-1A2B3C4D5E",
    gtm: "GTM-A1B2C3D",
    metaPixel: "123456789012345",
    plausible: "yoursite.com",
  };
  for (const id of TRACKING_PROVIDER_IDS) {
    const res = normalizeTrackingId(id, valid[id]);
    assert.equal(res.ok, true, `${id} rejected a valid ID`);
    if (res.ok) assert.equal(res.value, valid[id]);
  }
});

test("case and surrounding whitespace are forgiven, not rejected", () => {
  const ga = normalizeTrackingId("ga4", "  g-1a2b3c4d5e  ");
  assert.deepEqual(ga, { ok: true, value: "G-1A2B3C4D5E" });
  const gtm = normalizeTrackingId("gtm", "gtm-a1b2c3d");
  assert.deepEqual(gtm, { ok: true, value: "GTM-A1B2C3D" });
  const dom = normalizeTrackingId("plausible", "  YourSite.COM ");
  assert.deepEqual(dom, { ok: true, value: "yoursite.com" });
});

test("a Plausible domain pasted as a full URL is cleaned up rather than refused", () => {
  for (const pasted of [
    "https://yoursite.com",
    "https://www.yoursite.com/",
    "http://yoursite.com/pricing?ref=x",
    "yoursite.com.",
  ]) {
    assert.deepEqual(
      normalizeTrackingId("plausible", pasted),
      { ok: true, value: "yoursite.com" },
      `failed on ${pasted}`,
    );
  }
});

test("an empty or absent value means DISCONNECT, not an error", () => {
  for (const id of TRACKING_PROVIDER_IDS) {
    assert.deepEqual(normalizeTrackingId(id, ""), { ok: true, value: null });
    assert.deepEqual(normalizeTrackingId(id, "   "), { ok: true, value: null });
    assert.deepEqual(normalizeTrackingId(id, null), { ok: true, value: null });
    assert.deepEqual(normalizeTrackingId(id, undefined), { ok: true, value: null });
  }
});

// ── validation: the reject side ──────────────────────────────────────────────

test("a malformed ID is refused with a plain-language reason, never stored", () => {
  const bad: Record<string, string[]> = {
    // The classic mistakes: the OLD Universal Analytics id, a property number,
    // a whole snippet pasted in, the right prefix with nothing after it.
    ga4: ["UA-12345-1", "12345678", "G-", "G-1A2B3C4D5E extra", "<script>G-ABCD1</script>"],
    // A GA measurement id in the GTM field is the single most common mix-up.
    gtm: ["G-1A2B3C4D5E", "GTM", "GTM-", "gtm a1b2c3d"],
    metaPixel: ["G-1A2B3C4D5E", "abc123456789012", "1234", "123-456-789012345"],
    plausible: ["not a domain", "yoursite", "https://", "-yoursite.com", "yoursite..com"],
  };
  for (const id of TRACKING_PROVIDER_IDS) {
    for (const value of bad[id]) {
      const res = normalizeTrackingId(id, value);
      assert.equal(res.ok, false, `${id} accepted ${JSON.stringify(value)}`);
      if (!res.ok) {
        assert.ok(res.error.length > 30, "rejection copy must explain, not just say no");
        assert.ok(!/regex|pattern|invalid input/i.test(res.error), "no jargon in the reason");
      }
    }
  }
});

test("nothing that could break out of a script tag can be stored", () => {
  const hostile = [
    "G-ABCD1'};alert(1);//",
    'G-ABCD1";fetch("https://evil.test")',
    "G-ABCD1</script><script>alert(1)</script>",
    "G-ABCD1\\u0027",
    "G-ABCD1\nalert(1)",
  ];
  for (const value of hostile) {
    for (const id of TRACKING_PROVIDER_IDS) {
      assert.equal(
        normalizeTrackingId(id, value).ok,
        false,
        `${id} accepted hostile ${JSON.stringify(value)}`,
      );
    }
  }
});

test("every accepted ID is drawn from a character set that cannot break markup", () => {
  // The property the emitted tags rely on, asserted directly on the patterns
  // rather than inferred from the examples above.
  const forbidden = ['"', "'", "\\", "<", ">", "&", " ", "\n", "\r", "\t", "`", "/"];
  const samples: Record<string, string> = {
    ga4: "G-1A2B3C4D5E",
    gtm: "GTM-A1B2C3D",
    metaPixel: "123456789012345",
    plausible: "yoursite.co.uk",
  };
  for (const id of TRACKING_PROVIDER_IDS) {
    for (const ch of forbidden) {
      assert.equal(
        TRACKING_PROVIDERS[id].pattern.test(`${samples[id]}${ch}`),
        false,
        `${id} pattern admits ${JSON.stringify(ch)}`,
      );
      assert.equal(
        TRACKING_PROVIDERS[id].pattern.test(`${ch}${samples[id]}`),
        false,
        `${id} pattern admits a leading ${JSON.stringify(ch)}`,
      );
    }
  }
});

test("an ID longer than the storage cap is refused", () => {
  assert.equal(normalizeTrackingId("ga4", `G-${"A".repeat(400)}`).ok, false);
});

test("an unknown provider key is not a provider", () => {
  for (const v of ["", "GA4", "matomo", "__proto__", 7, null]) {
    assert.equal(isTrackingProviderId(v), false, `accepted ${JSON.stringify(v)}`);
  }
  for (const id of TRACKING_PROVIDER_IDS) assert.equal(isTrackingProviderId(id), true);
});

// ── settings JSON ────────────────────────────────────────────────────────────

test("parsing tolerates any shape of settings and drops anything invalid", () => {
  assert.deepEqual(parseTrackingConfig(null), {});
  assert.deepEqual(parseTrackingConfig("nope"), {});
  assert.deepEqual(parseTrackingConfig([]), {});
  assert.deepEqual(parseTrackingConfig({ tracking: "nope" }), {});
  assert.deepEqual(parseTrackingConfig({ tracking: [] }), {});
  assert.deepEqual(
    parseTrackingConfig({
      tracking: { ga4: "G-1A2B3C4D5E", gtm: "not-a-container", matomo: "x", metaPixel: 7 },
    }),
    { ga4: "G-1A2B3C4D5E" },
  );
});

test("writing one provider preserves every other settings key", () => {
  const settings = { pageRoles: { home: "welcome" }, tracking: { ga4: "G-1A2B3C4D5E" } };
  const next = withTrackingId(parseTrackingConfig(settings), "metaPixel", "123456789012345");
  const merged = trackingToSettings(settings, next);
  assert.deepEqual(merged.pageRoles, { home: "welcome" });
  assert.deepEqual(merged.tracking, { ga4: "G-1A2B3C4D5E", metaPixel: "123456789012345" });
});

test("disconnecting the last provider removes the tracking key entirely", () => {
  const settings = { pageRoles: { home: "welcome" }, tracking: { ga4: "G-1A2B3C4D5E" } };
  const next = withTrackingId(parseTrackingConfig(settings), "ga4", null);
  const merged = trackingToSettings(settings, next);
  assert.equal("tracking" in merged, false);
  assert.deepEqual(merged.pageRoles, { home: "welcome" });
});

test("withTrackingId does not mutate its input", () => {
  const before = { ga4: "G-1A2B3C4D5E" } as const;
  const after = withTrackingId({ ...before }, "gtm", "GTM-A1B2C3D");
  assert.deepEqual(before, { ga4: "G-1A2B3C4D5E" });
  assert.equal(after.gtm, "GTM-A1B2C3D");
});

// ── render ───────────────────────────────────────────────────────────────────

test("a provider that is not connected emits nothing", () => {
  assert.deepEqual(selectTrackingForRender(owned({}), { tenantId: TENANT }).tags, []);
  assert.deepEqual(selectTrackingForRender(null, { tenantId: TENANT }).tags, []);
  assert.deepEqual(selectTrackingForRender(undefined, { tenantId: TENANT }).tags, []);
  const only = selectTrackingForRender(owned({ ga4: "G-1A2B3C4D5E" }), { tenantId: TENANT });
  assert.deepEqual(
    [...new Set(only.tags.map((tag) => tag.provider))],
    ["ga4"],
    "a connected provider must not drag its neighbours onto the page",
  );
});

test("each connected provider emits its canonical snippet, carrying its own ID", () => {
  const sel = selectTrackingForRender(
    owned({
      ga4: "G-1A2B3C4D5E",
      gtm: "GTM-A1B2C3D",
      metaPixel: "123456789012345",
      plausible: "yoursite.com",
    }),
    { tenantId: TENANT },
  );
  const blob = sel.tags.map((tag) => `${tag.src ?? ""}${tag.code ?? ""}`).join("\n");
  assert.match(blob, /googletagmanager\.com\/gtag\/js\?id=G-1A2B3C4D5E/);
  assert.match(blob, /gtag\('config',"G-1A2B3C4D5E"\)/);
  assert.match(blob, /'script','dataLayer',"GTM-A1B2C3D"/);
  assert.match(blob, /connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(blob, /fbq\('init',"123456789012345"\)/);
  assert.equal(
    sel.tags.some((tag) => tag.src === "https://plausible.io/js/script.js"),
    true,
  );
  assert.equal(
    sel.tags.find((tag) => tag.provider === "plausible")?.attrs?.["data-domain"],
    "yoursite.com",
  );
  // Every external script must declare async or defer — a blocking synchronous
  // tracker on every storefront page is a performance bug, and `@next/next/
  // no-sync-scripts` fails the lint on the injector if this slips.
  for (const tag of sel.tags) {
    if (tag.src) {
      assert.ok(
        tag.loading === "async" || tag.loading === "defer",
        `${tag.key} loads synchronously`,
      );
    }
  }
});

test("no emitted tag ever leaves an unterminated script element", () => {
  const sel = selectTrackingForRender(
    owned({
      ga4: "G-1A2B3C4D5E",
      gtm: "GTM-A1B2C3D",
      metaPixel: "123456789012345",
      plausible: "yoursite.com",
    }),
    { tenantId: TENANT },
  );
  for (const tag of sel.tags) {
    const body = `${tag.src ?? ""}${tag.code ?? ""}`;
    assert.equal(/<\/script/i.test(body), false, `breakout in ${tag.key}`);
    assert.equal(/<!--/.test(body), false, `comment breakout in ${tag.key}`);
    assert.ok(tag.src || tag.code, `${tag.key} emits neither a src nor code`);
  }
});

test("the GTM noscript iframe is NOT emitted (frame-src is deliberately unchanged)", () => {
  const sel = selectTrackingForRender(owned({ gtm: "GTM-A1B2C3D" }), { tenantId: TENANT });
  const blob = sel.tags.map((tag) => `${tag.src ?? ""}${tag.code ?? ""}`).join("\n");
  assert.equal(/ns\.html/.test(blob), false);
  assert.equal(/<iframe/i.test(blob), false);
});

test("a stored value that no longer passes validation is dropped at render time", () => {
  // Storage is not trust: a row written by hand, by a bug, or by an older,
  // looser build must not become markup.
  const sel = selectTrackingForRender(
    owned({ ga4: "G-OK1234", gtm: "'};alert(1);//", metaPixel: "not-a-number" }),
    { tenantId: TENANT },
  );
  assert.deepEqual([...new Set(sel.tags.map((tag) => tag.provider))], ["ga4"]);
  assert.equal(sel.dropped.invalid, 2);
});

test("connectedProviders reports exactly what is set", () => {
  assert.deepEqual(connectedProviders({}), []);
  assert.deepEqual(
    connectedProviders({ metaPixel: "123456789012345", ga4: "G-1A2B3C4D5E" }),
    ["ga4", "metaPixel"],
  );
});

// ── the CSP pairing ──────────────────────────────────────────────────────────

test("every host a provider needs is allow-listed in next.config.ts", () => {
  const configPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "next.config.ts",
  );
  const source = readFileSync(configPath, "utf8");

  // Read the two directive strings out of the built policy. Matching the
  // template literal rather than the interpolated result keeps this readable;
  // the host constants are string literals in the same file, so a host that is
  // referenced but never defined would fail the `includes` below anyway.
  const hosts = trackingCspHosts();
  for (const host of hosts.script) {
    assert.ok(
      source.includes(host),
      `${host} is emitted by a tracking provider but never appears in next.config.ts — the browser would block the tag while the admin screen says "Connected"`,
    );
  }
  for (const host of hosts.connect) {
    assert.ok(source.includes(host), `${host} missing from next.config.ts`);
  }
  // The two hosts this feature ADDED must be in the directives that need them,
  // not merely somewhere in the file.
  const scriptSrc = source.match(/script-src [^`]*/g)?.join(" ") ?? "";
  const connectSrc = source.match(/connect-src [^`]*/g)?.join(" ") ?? "";
  assert.ok(scriptSrc.includes("tenantTrackingCsp.script"), "script-src must include the tracking hosts");
  assert.ok(connectSrc.includes("tenantTrackingCsp.connect"), "connect-src must include the tracking hosts");
  assert.match(source, /const tenantTrackingCsp = \{[\s\S]*?connect\.facebook\.net[\s\S]*?\}/);
  // No wildcard crept into the hosts this feature owns.
  const declared = source.match(/const tenantTrackingCsp = \{[\s\S]*?\};/)?.[0] ?? "";
  assert.equal(/\*/.test(declared), false, "tracking CSP hosts must be exact origins");
});
