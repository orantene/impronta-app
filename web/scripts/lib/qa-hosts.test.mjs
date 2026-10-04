import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedParityBaseUrl, bypassHeaders, pickHost, isQaPoolHost, isQaPoolUrl, hostsToRelease, QA_HOSTS, LEASE_TTL_MS } from "./qa-hosts.mjs";

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
