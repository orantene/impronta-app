import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isWorkspacePath,
  parseAbsoluteReturn,
  resolvePostAuthRedirect,
  safeRelativePath,
} from "./post-auth-return";

const APP = "https://app.tulala.digital";
const registry = new Set(["jorgelina.com", "impronta.tulala.digital"]);
const isRegisteredHost = async (h: string) => registry.has(h);

function run(rawNext: string | null, requestOrigin = APP, destination = "/account") {
  return resolvePostAuthRedirect({
    rawNext,
    requestOrigin,
    appUrl: APP,
    destination,
    isRegisteredHost,
  });
}

test("claim started on a talent custom domain returns to that domain and page", async () => {
  assert.equal(
    await run("https://jorgelina.com/servicios?x=1"),
    "https://jorgelina.com/servicios?x=1",
  );
});

test("confirm link served on the custom domain with a relative next stays there", async () => {
  assert.equal(
    await run("/book/abc", "https://jorgelina.com"),
    "https://jorgelina.com/book/abc",
  );
  assert.equal(await run("/", "https://jorgelina.com"), "https://jorgelina.com/");
});

test("business (agency_domains) host is allowed", async () => {
  assert.equal(
    await run("https://impronta.tulala.digital/models"),
    "https://impronta.tulala.digital/models",
  );
});

test("workspace paths on a site host still go to the app host", async () => {
  assert.equal(await run("/client/messages", "https://jorgelina.com"), `${APP}/account`);
  assert.equal(await run("https://jorgelina.com/account"), `${APP}/account`);
  assert.equal(await run("/acme/client/messages", "https://jorgelina.com"), `${APP}/account`);
});

test("app-host relative next keeps today's role-gated destination", async () => {
  assert.equal(await run("/acme/client/messages", APP, "/acme/client/messages"), `${APP}/acme/client/messages`);
});

test("open redirect: external host is rejected", async () => {
  assert.equal(await run("https://evil.com/phish"), `${APP}/account`);
  assert.equal(await run("https://evil.com/phish", "https://jorgelina.com"), `${APP}/account`);
});

test("open redirect: protocol-relative and backslash tricks are rejected", async () => {
  for (const bad of ["//evil.com", "//evil.com/x", "/\\evil.com", "\\\\evil.com", " //evil.com"]) {
    assert.equal(await run(bad, "https://jorgelina.com"), `${APP}/account`, bad);
    assert.equal(safeRelativePath(bad), null, bad);
  }
});

test("open redirect: other schemes and credentials are rejected", async () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,x",
    "https://jorgelina.com@evil.com/",
    "https://user:pw@jorgelina.com/",
    "https://evil.com\\@jorgelina.com",
  ]) {
    assert.equal(await run(bad), `${APP}/account`, bad);
  }
  assert.equal(parseAbsoluteReturn("ftp://jorgelina.com/"), null);
});

test("lookalike hosts are not registered", async () => {
  assert.equal(await run("https://jorgelina.com.evil.com/"), `${APP}/account`);
  assert.equal(await run("https://evil-jorgelina.com/"), `${APP}/account`);
});

test("missing next keeps the app-host destination", async () => {
  assert.equal(await run(null, "https://jorgelina.com"), `${APP}/account`);
});

test("isWorkspacePath", () => {
  assert.equal(isWorkspacePath("/es/client"), true);
  assert.equal(isWorkspacePath("/servicios"), false);
  assert.equal(isWorkspacePath("/"), false);
});

test("confirm and callback routes use the host-aware resolver", () => {
  const root = path.resolve(__dirname, "../../app/auth");
  for (const f of ["confirm/route.ts", "callback/route.ts"]) {
    const src = readFileSync(path.join(root, f), "utf8");
    assert.match(src, /resolvePostAuthRedirect\(/, f);
    assert.match(src, /isRegisteredReturnHost/, f);
  }
});

// ── TUL-691 E1c: session hand-off to custom domains ─────────────────────────
const customDomains = new Set(["jorgelina.com"]);
function runHandoff(rawNext: string | null, requestOrigin = APP) {
  return resolvePostAuthRedirect({
    rawNext,
    requestOrigin,
    appUrl: APP,
    destination: "/account",
    isRegisteredHost,
    needsSessionHandoff: async (h) => customDomains.has(h),
  });
}

test("custom-domain return signed in on the app host goes through /auth/sso/start", async () => {
  const target = "https://jorgelina.com/servicios?x=1";
  assert.equal(
    await runHandoff(target),
    `${APP}/auth/sso/start?return=${encodeURIComponent(target)}`,
  );
});

test("platform hosts (shared cookies) skip the hand-off", async () => {
  assert.equal(
    await runHandoff("https://impronta.tulala.digital/models"),
    "https://impronta.tulala.digital/models",
  );
});

test("already on the custom domain: no hand-off, plain return", async () => {
  assert.equal(
    await runHandoff("https://jorgelina.com/servicios", "https://jorgelina.com"),
    "https://jorgelina.com/servicios",
  );
  assert.equal(await runHandoff("/book/abc", "https://jorgelina.com"), "https://jorgelina.com/book/abc");
});

test("hand-off is never offered for http targets or unregistered hosts", async () => {
  assert.equal(await runHandoff("http://jorgelina.com/x"), "http://jorgelina.com/x");
  assert.equal(await runHandoff("https://evil.com/x"), `${APP}/account`);
});

test("callback and confirm wire the hand-off check", () => {
  const root = path.resolve(__dirname, "../../app/auth");
  for (const f of ["confirm/route.ts", "callback/route.ts"]) {
    const src = readFileSync(path.join(root, f), "utf8");
    assert.match(src, /needsSessionHandoff: needsSsoHandoffHost/, f);
  }
});
