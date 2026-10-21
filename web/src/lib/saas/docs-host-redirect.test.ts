import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOCS_HOST_REDIRECT_TARGET, TULALA_DOCS_HOST, docsHostRedirect, docsHostResponse } from "./docs-host-redirect";

test("docs host hops to the help center", () => {
  assert.equal(TULALA_DOCS_HOST, "docs.tulala.digital");
  assert.deepEqual(docsHostRedirect("docs.tulala.digital", "GET"), { kind: "redirect", location: "https://tulala.digital/help" });
  assert.deepEqual(docsHostRedirect("DOCS.Tulala.Digital:443", "HEAD"), { kind: "redirect", location: DOCS_HOST_REDIRECT_TARGET });
});

test("unsafe methods on the docs host are refused, not redirected", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.deepEqual(docsHostRedirect("docs.tulala.digital", method), { kind: "wrong_method" });
  }
});

test("no other host is ever redirected", () => {
  for (const host of [
    "tulala.digital",
    "www.tulala.digital",
    "app.tulala.digital",
    "support.tulala.digital",
    "docs.tulala.digital.evil.com",
    "evildocs.tulala.digital",
    "mydocs.tulala.digital",
    "docs.example.com",
    "",
    null,
    undefined,
  ]) {
    assert.equal(docsHostRedirect(host, "GET"), null, String(host));
  }
});

test("the proxy runs the docs redirect before host resolution", () => {
  const proxy = readFileSync(join(__dirname, "../../proxy.ts"), "utf8");
  const redirectAt = proxy.indexOf("docsHostResponse(");
  const resolveAt = proxy.indexOf("resolveTenantContext(request, hostHeader)");
  assert.ok(redirectAt > 0, "proxy.ts must call docsHostResponse");
  assert.ok(redirectAt < resolveAt, "docs redirect must precede host resolution");
});

test("the proxy response is a 308 to /help, a 421 for unsafe methods, and null elsewhere", () => {
  const hop = docsHostResponse("docs.tulala.digital", "GET");
  assert.ok(hop);
  assert.equal(hop.status, 308);
  assert.equal(hop.headers.get("location"), "https://tulala.digital/help");
  assert.equal(docsHostResponse("docs.tulala.digital", "POST")?.status, 421);
  assert.equal(docsHostResponse("tulala.digital", "GET"), null);
});

test("proxy.ts stays under its line cap and keeps the docs call to a couple of lines", () => {
  const proxy = readFileSync(join(__dirname, "../../proxy.ts"), "utf8");
  assert.ok(proxy.split("\n").length <= 800);
  assert.equal(proxy.split("\n").filter((l) => l.includes("docsHostResponse")).length, 2);
});
