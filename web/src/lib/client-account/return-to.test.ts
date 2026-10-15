import assert from "node:assert/strict";
import { test } from "node:test";

import { accountReturnPath, safeClientReturnTo } from "./return-to";

const siteUrl = "https://tulala.digital";
const appUrl = "https://app.tulala.digital";
const opts = { siteUrl, appUrl };

test("relative /w/ paths resolve against the site host (TUL-709)", () => {
  assert.equal(safeClientReturnTo("/w/qa-grok-workspace", opts), "https://tulala.digital/w/qa-grok-workspace");
  assert.equal(
    safeClientReturnTo("/w/qa-grok-workspace/book?x=1#top", opts),
    "https://tulala.digital/w/qa-grok-workspace/book?x=1#top",
  );
});

test("absolute URLs on an allow-listed host are kept", () => {
  assert.equal(safeClientReturnTo("https://tulala.digital/w/abc", opts), "https://tulala.digital/w/abc");
  assert.equal(safeClientReturnTo("https://app.tulala.digital/account", opts), "https://app.tulala.digital/account");
});

test("open redirects are rejected", () => {
  const bad = [
    "https://evil.com/w/x",
    "//evil.com/w/x",
    "/\\evil.com",
    "\\\\evil.com",
    "https://tulala.digital.evil.com/w/x",
    "https://eviltulala.digital/w/x",
    "https://tulala.digital@evil.com/w/x",
    "https://user:pw@tulala.digital/w/x",
    "http://tulala.digital/w/x",
    "javascript:alert(1)",
    "data:text/html,hi",
    "/w/x\n//evil.com",
    "/%2F%2Fevil.com",
    "w/x",
    "",
    "   ",
    null,
    undefined,
  ];
  for (const raw of bad) assert.equal(safeClientReturnTo(raw, opts), null, String(raw));
});

test("non-http site urls never widen the allow-list", () => {
  assert.equal(safeClientReturnTo("/w/x", { siteUrl: "not a url", appUrl: "" }), null);
});

test("local dev: http allowed only when the configured origin is http", () => {
  const dev = { siteUrl: "http://localhost:3000", appUrl: "http://localhost:3001" };
  assert.equal(safeClientReturnTo("/w/x", dev), "http://localhost:3000/w/x");
  assert.equal(safeClientReturnTo("http://localhost:3001/account", dev), "http://localhost:3001/account");
  assert.equal(safeClientReturnTo("http://localhost:4000/w/x", dev), null);
});

test("accountReturnPath carries the site path through app-relative next", () => {
  assert.equal(accountReturnPath("/w/qa-grok-workspace/book"), "/account/return?to=%2Fw%2Fqa-grok-workspace%2Fbook");
  assert.equal(accountReturnPath("//evil.com"), "/account");
  assert.equal(accountReturnPath("https://evil.com"), "/account");
});

test("the /account/return route only redirects through safeClientReturnTo", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = readFileSync(join(__dirname, "..", "..", "app", "account", "return", "route.ts"), "utf8");
  assert.match(src, /safeClientReturnTo\(/);
  assert.match(src, /target \?\? new URL\("\/account"/);
});
