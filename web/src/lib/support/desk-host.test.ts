import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";

import {
  isHostScopedAuthHost,
  isPathAllowedOnSupportDeskHost,
  isSupportDeskHost,
  normalizeHostname,
  supportDeskHostDeadResponse,
  supportDeskHostSurfaceResponse,
} from "./desk-host";

test("normalizeHostname strips port and lowercases", () => {
  assert.equal(normalizeHostname("Support.Tulala.Digital:443"), "support.tulala.digital");
  assert.equal(normalizeHostname(null), "");
});

test("isSupportDeskHost recognizes primary + alias + local mirrors", () => {
  assert.equal(isSupportDeskHost("support.tulala.digital"), true);
  assert.equal(isSupportDeskHost("DESK.tulala.digital"), true);
  assert.equal(isSupportDeskHost("support.local:3001"), true);
  assert.equal(isSupportDeskHost("app.tulala.digital"), false);
  assert.equal(isSupportDeskHost("tulala.digital"), false);
});

test("isHostScopedAuthHost matches Support Desk hosts only", () => {
  assert.equal(isHostScopedAuthHost("support.tulala.digital"), true);
  assert.equal(isHostScopedAuthHost("app.tulala.digital"), false);
});

test("seeded support host still 404s when flag is off", () => {
  const req = new NextRequest("https://support.tulala.digital/");
  const dead = supportDeskHostDeadResponse(req, "support.tulala.digital", {
    SUPPORT_DESK_ENABLED: "0",
    NODE_ENV: "production",
    VERCEL_ENV: "production",
  });
  assert.ok(dead, "must 404 while flag off even if domain is seeded");
  assert.equal(dead.status, 404);
  assert.match(
    dead.headers.get("x-middleware-rewrite") ?? "",
    /\/_page-not-found$/,
  );
});

test("unset flag in production → support host is dead", () => {
  const req = new NextRequest("https://support.tulala.digital/login");
  const dead = supportDeskHostDeadResponse(req, "support.tulala.digital", {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
  });
  assert.ok(dead);
  assert.equal(dead.status, 404);
});

test("flag on → support host is not killed at the dead gate", () => {
  const req = new NextRequest("https://support.tulala.digital/");
  assert.equal(
    supportDeskHostDeadResponse(req, "support.tulala.digital", {
      SUPPORT_DESK_ENABLED: "1",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    }),
    null,
  );
});

test("non-desk hosts are never killed by this gate", () => {
  const req = new NextRequest("https://app.tulala.digital/");
  assert.equal(
    supportDeskHostDeadResponse(req, "app.tulala.digital", {
      SUPPORT_DESK_ENABLED: "0",
      VERCEL_ENV: "production",
    }),
    null,
  );
});

test("support host surface allows desk + auth; rejects platform admin", () => {
  assert.equal(isPathAllowedOnSupportDeskHost("/"), true);
  assert.equal(isPathAllowedOnSupportDeskHost("/login"), true);
  assert.equal(isPathAllowedOnSupportDeskHost("/desk"), true);
  assert.equal(isPathAllowedOnSupportDeskHost("/desk/inbox"), true);
  assert.equal(isPathAllowedOnSupportDeskHost("/api/support-desk/tickets"), true);
  assert.equal(isPathAllowedOnSupportDeskHost("/platform/admin"), false);
  assert.equal(isPathAllowedOnSupportDeskHost("/admin"), false);
  assert.equal(isPathAllowedOnSupportDeskHost("/directory"), false);

  const req = new NextRequest("https://support.tulala.digital/platform/admin");
  const blocked = supportDeskHostSurfaceResponse(
    req,
    "/platform/admin",
    "support.tulala.digital",
  );
  assert.ok(blocked);
  assert.equal(blocked.status, 404);
});

test("proxy wires the support-desk dead-host gate after resolve", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(proxy, /supportDeskHostDeadResponse/);
  assert.match(proxy, /supportDeskHostSurfaceResponse/);
  const resolveAt = proxy.indexOf("resolveTenantContext(request, hostHeader)");
  const deadAt = proxy.indexOf("supportDeskHostDeadResponse(");
  assert.ok(resolveAt > 0 && deadAt > resolveAt, "gate runs after host resolve");
  assert.ok(
    deadAt < proxy.indexOf('hostContext.kind === "talent_site"'),
    "runs before surface dispatch",
  );
});

test("Support Desk Phase 1a prefixes are reachable on the app host", () => {
  assert.equal(isPathAllowedForHostKind("app", "/desk"), true);
  assert.equal(isPathAllowedForHostKind("app", "/desk/inbox"), true);
  assert.equal(isPathAllowedForHostKind("app", "/platform/admin/support/desk"), true);
  assert.equal(isPathAllowedForHostKind("app", "/api/support-desk"), true);
  assert.equal(isPathAllowedForHostKind("app", "/api/support-desk/tickets"), true);
  assert.equal(isPathAllowedForHostKind("marketing", "/desk"), false);
  assert.equal(isPathAllowedForHostKind("marketing", "/api/support-desk"), false);
});
