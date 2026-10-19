import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOCS_HOST_REDIRECT_TARGET, TULALA_DOCS_HOST, docsHostRedirect } from "./docs-host-redirect";

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
  const redirectAt = proxy.indexOf("docsHostRedirect(");
  const resolveAt = proxy.indexOf("resolveTenantContext(request, hostHeader)");
  assert.ok(redirectAt > 0, "proxy.ts must call docsHostRedirect");
  assert.ok(redirectAt < resolveAt, "docs redirect must precede host resolution");
});
