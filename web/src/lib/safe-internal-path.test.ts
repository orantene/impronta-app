import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNextPath } from "@/lib/auth-flow";
import {
  pathnameWithoutAnyLocalePrefix,
  stripDefaultLocalePrefixFromPath,
} from "@/i18n/pathnames";
import { hostSafeDestination } from "@/lib/saas/host-safe-destination";
import { collapseLeadingSeparators, isSafeInternalPath } from "@/lib/safe-internal-path";

const EVIL = [
  "//evil.example",
  "/\\evil.example",
  "/\t/evil.example",
  "/en//evil.example",
  "/es//evil.example/x",
  "/en/\\evil.example",
  "/en/en//evil.example",
];

test("TUL-1269 open redirect: normalizeNextPath falls back for every protocol-relative form", () => {
  for (const bad of EVIL) assert.equal(normalizeNextPath(bad, "/home"), "/home", JSON.stringify(bad));
  assert.equal(normalizeNextPath("/admin?next=//x", "/home"), "/admin?next=//x");
  assert.equal(normalizeNextPath("/en/admin", "/home"), "/en/admin");
});

test("locale stripping never yields a protocol-relative path", () => {
  for (const bad of EVIL) {
    const a = pathnameWithoutAnyLocalePrefix(bad);
    const b = stripDefaultLocalePrefixFromPath(bad);
    assert.ok(!/^[/\\]{2}/.test(a) && !a.startsWith("/\\"), `any: ${JSON.stringify(bad)} -> ${a}`);
    assert.ok(!/^[/\\]{2}/.test(b) && !b.startsWith("/\\"), `default: ${JSON.stringify(bad)} -> ${b}`);
  }
  assert.equal(stripDefaultLocalePrefixFromPath("/en/login?x=1"), "/login?x=1");
  assert.equal(stripDefaultLocalePrefixFromPath("/en//evil.example"), "/evil.example");
});

test("hostSafeDestination refuses protocol-relative and backslash destinations", () => {
  for (const bad of ["//evil.example/admin", "/\\evil.example", "/\t/evil.example"]) {
    assert.equal(hostSafeDestination(bad, "marketing"), "/", JSON.stringify(bad));
  }
  assert.equal(hostSafeDestination("https://app.example.com/client", "marketing"), "https://app.example.com/client");
});

test("isSafeInternalPath / collapseLeadingSeparators", () => {
  assert.equal(isSafeInternalPath("/a/b?c=//d"), true);
  assert.equal(isSafeInternalPath("//a"), false);
  assert.equal(isSafeInternalPath("/\\a"), false);
  assert.equal(isSafeInternalPath("a"), false);
  assert.equal(isSafeInternalPath(null), false);
  assert.equal(collapseLeadingSeparators("//a"), "/a");
  assert.equal(collapseLeadingSeparators("/\\a"), "/a");
  assert.equal(collapseLeadingSeparators("/a//b"), "/a//b");
});
