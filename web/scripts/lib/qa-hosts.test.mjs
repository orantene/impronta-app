import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedParityBaseUrl, bypassHeaders, pickHost, isQaPoolHost, isQaPoolUrl, hostsToRelease, QA_HOSTS, LEASE_TTL_MS, shareLinksFrom, shareLinksFromAliasAndDeployment, pickShareLink, buildShareUrl, formatExpiry, SHARE_MIN_REMAINING_MS } from "./qa-hosts.mjs";

const now = 1_000_000_000_000;
const lease = (n, branch, ageMs) => ({ host: QA_HOSTS[n - 1], branch, createdAt: now - ageMs });

test("guard allows exactly qa-1..6", () => {
  for (let i = 1; i <= 6; i++) assert.ok(isQaPoolUrl(`https://qa-${i}.tulala.digital`));
  for (const bad of [
    "https://qa-7.tulala.digital", "https://qa-0.tulala.digital", "http://qa-1.tulala.digital",
    "https://qa-1.tulala.digital.evil.com", "https://evil.com@qa-1.tulala.digital:8443",
    "https://x.qa-1.tulala.digital", "https://tulala.digital", "https://app.tulala.digital", "nope",
  ]) assert.equal(isQaPoolUrl(bad), false, bad);
  assert.equal(isQaPoolHost("QA-3.tulala.digital"), true);
});

test("reuses the host already leased to the branch", () => {
  assert.equal(pickHost({ branch: "b", leases: [lease(2, "b", 1000)], liveBranches: new Set(["b"]), now }), QA_HOSTS[1]);
});

test("prefers an unassigned host", () => {
  const leases = [lease(1, "a", 1000)];
  assert.equal(pickHost({ branch: "b", leases, liveBranches: new Set(["a"]), now }), QA_HOSTS[1]);
});

test("when full, takes the oldest stale host (deleted branch or >24h)", () => {
  const leases = [
    lease(1, "a", 1000), lease(2, "gone", 5000), lease(3, "c", LEASE_TTL_MS + 9000),
    lease(4, "d", 1000), lease(5, "e", 1000), lease(6, "f", 1000),
  ];
  const live = new Set(["a", "c", "d", "e", "f"]);
  assert.equal(pickHost({ branch: "new", leases, liveBranches: live, now }), QA_HOSTS[2]);
});

test("when full and all fresh+live, returns null", () => {
  const leases = QA_HOSTS.map((_, i) => lease(i + 1, `b${i}`, 1000));
  assert.equal(pickHost({ branch: "x", leases, liveBranches: new Set(leases.map((l) => l.branch)), now }), null);
});

test("release resolves host or branch", () => {
  const leases = [lease(1, "a", 1), lease(2, "a", 1), lease(3, "b", 1)];
  assert.deepEqual(hostsToRelease(QA_HOSTS[2], leases), [QA_HOSTS[2]]);
  assert.deepEqual(hostsToRelease("a", leases), [QA_HOSTS[0], QA_HOSTS[1]]);
});

test("parity base-url guard: local + pool only", () => {
  assert.ok(isAllowedParityBaseUrl("http://localhost:3005"));
  assert.ok(isAllowedParityBaseUrl("https://qa-4.tulala.digital"));
  assert.equal(isAllowedParityBaseUrl("https://tulala.digital"), false);
  assert.equal(isAllowedParityBaseUrl("https://qa-9.tulala.digital"), false);
});

test("bypass header only for pool hosts and only when set", () => {
  const env = { VERCEL_AUTOMATION_BYPASS_SECRET: "s" };
  assert.deepEqual(bypassHeaders("https://qa-1.tulala.digital", env), { "x-vercel-protection-bypass": "s" });
  assert.deepEqual(bypassHeaders("http://localhost:3005", env), {});
  assert.deepEqual(bypassHeaders("https://qa-1.tulala.digital", {}), {});
});

test("shareLinksFrom keeps only shareable-link scope (never automation secrets)", () => {
  const links = shareLinksFrom({
    sharetok: { scope: "shareable-link", expires: now + 5 * 3600_000 },
    automation: { scope: "automation-bypass" },
    user: { scope: "user" },
    junk: null,
  });
  assert.deepEqual(links, [{ token: "sharetok", expiresAt: now + 5 * 3600_000 }]);
  assert.deepEqual(shareLinksFrom(undefined), []);
});

test("shareLinksFrom accepts expiry in seconds or ms, missing = never", () => {
  const [a, b] = shareLinksFrom({
    s: { scope: "shareable-link", expires: 1_800_000_000 },
    n: { scope: "shareable-link" },
  });
  assert.equal(a.expiresAt, 1_800_000_000_000);
  assert.equal(b.expiresAt, null);
});

test("pickShareLink reuses unexpired, skips expired or nearly expired, else null", () => {
  const h = 3600_000;
  assert.equal(pickShareLink([], now), null);
  assert.equal(pickShareLink([{ token: "old", expiresAt: now - 1 }], now), null);
  assert.equal(pickShareLink([{ token: "soon", expiresAt: now + SHARE_MIN_REMAINING_MS - 1 }], now), null);
  const links = [{ token: "a", expiresAt: now + 2 * h }, { token: "b", expiresAt: now + 20 * h }, { token: "x", expiresAt: now - h }];
  assert.equal(pickShareLink(links, now).token, "b");
  assert.equal(pickShareLink([...links, { token: "forever", expiresAt: null }], now).token, "forever");
});

test("buildShareUrl builds the openable link, pool hosts only", () => {
  assert.equal(buildShareUrl("qa-2.tulala.digital", "abc"), "https://qa-2.tulala.digital/?_vercel_share=abc");
  assert.equal(buildShareUrl("qa-2.tulala.digital", "a/b+c"), "https://qa-2.tulala.digital/?_vercel_share=a%2Fb%2Bc");
  assert.equal(buildShareUrl("tulala.digital", "abc"), null);
  assert.equal(buildShareUrl("qa-2.tulala.digital", ""), null);
});

test("formatExpiry", () => {
  assert.equal(formatExpiry(null, now), "no expiry");
  assert.equal(formatExpiry(now - 1, now), "expired");
  assert.equal(formatExpiry(now + 22 * 3600_000, now), "expires in 22h");
});

test("share links are read from the alias object as well as the deployment (Vercel puts them on the alias)", () => {
  const alias = { protectionBypass: { tokA: { scope: "shareable-link", expires: 1791488071 }, auto: { scope: "automation-bypass" } } };
  const links = shareLinksFromAliasAndDeployment(alias, { protectionBypass: undefined });
  assert.deepEqual(links, [{ token: "tokA", expiresAt: 1791488071 * 1000 }]);
  // the deployment alone, and neither, still work
  assert.equal(shareLinksFromAliasAndDeployment(null, { protectionBypass: { tokB: { scope: "shareable-link" } } }).length, 1);
  assert.deepEqual(shareLinksFromAliasAndDeployment(null, null), []);
  // an automation secret is never surfaced from either side
  assert.deepEqual(shareLinksFromAliasAndDeployment({ protectionBypass: { s: { scope: "automation-bypass" } } }, { protectionBypass: { t: { scope: "automation-bypass" } } }), []);
});
