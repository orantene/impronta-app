import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";

import { NextRequest } from "next/server";

import {
  clearSuspendedWorkspaceCache,
  isWorkspaceSuspended,
  suspendedWorkspaceResponse,
} from "./suspended-workspace-gate";

beforeEach(() => clearSuspendedWorkspaceCache());

test("a suspended workspace is hidden behind the branded 404; active and unknown are served", async () => {
  const req = new NextRequest("https://acme.example/");
  const hidden = await suspendedWorkspaceResponse(req, "t-suspended", async () => "suspended");
  assert.ok(hidden);
  assert.equal(hidden.status, 404);
  assert.match(hidden.headers.get("x-middleware-rewrite") ?? "", /\/_page-not-found$/);
  for (const status of ["active", "trial", "past_due", null]) {
    assert.equal(await suspendedWorkspaceResponse(req, `t-${status}`, async () => status), null, String(status));
  }
});

test("a POST to a suspended storefront (checkout, inquiry) is refused too", async () => {
  const req = new NextRequest("https://acme.example/api/checkout", { method: "POST" });
  const res = await suspendedWorkspaceResponse(req, "t-post", async () => "suspended");
  assert.equal(res?.status, 404);
});

test("fails open on a read error and does not cache the failure", async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) throw new Error("db blip");
    return "suspended";
  };
  assert.equal(await isWorkspaceSuspended("t-flaky", flaky), false);
  assert.equal(await isWorkspaceSuspended("t-flaky", flaky), true, "next request re-reads");
});

test("caches a status for the TTL window, then re-reads", async () => {
  let calls = 0;
  const reader = async () => (calls++ === 0 ? "suspended" : "active");
  const t0 = 1_000_000;
  assert.equal(await isWorkspaceSuspended("t-cache", reader, t0), true);
  assert.equal(await isWorkspaceSuspended("t-cache", reader, t0 + 30_000), true);
  assert.equal(calls, 1);
  assert.equal(await isWorkspaceSuspended("t-cache", reader, t0 + 61_000), false, "reinstated workspace is served after the TTL");
});

test("proxy wires the gate for agency and hub hosts", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  const at = proxy.indexOf("suspendedWorkspaceResponse(request, hostContext.tenantId)");
  assert.ok(at > 0);
  assert.match(proxy.slice(at - 200, at), /hostContext\.kind === "agency" \|\| hostContext\.kind === "hub"/);
  assert.ok(at < proxy.indexOf("hostContext.kind === \"talent_site\""), "runs before the surface dispatch");
});
