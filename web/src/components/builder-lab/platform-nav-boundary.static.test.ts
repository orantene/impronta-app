import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * TUL-1000: a soft click on the HQ side-nav "Builder Lab" tab looked dead. The
 * page is force-dynamic and reads the hub tenant with the service role before it
 * renders, and the /platform/admin segment had no loading or error boundary, so
 * the click gave no feedback and a client render error had no local boundary.
 * (Lives here, not next to the route, because tests under platform/admin run in
 * no CI lane.)
 */
const ADMIN = fileURLToPath(
  new URL("../../app/(workspace)/platform/admin/", import.meta.url),
);
const read = (f: string) => readFileSync(ADMIN + f, "utf8");

test("the HQ segment has a loading boundary that fills the page slot only", () => {
  assert.ok(existsSync(ADMIN + "loading.tsx"), "platform/admin/loading.tsx is missing");
  const src = read("loading.tsx");
  assert.match(src, /role="status"/);
  assert.match(src, /data-testid="platform-admin-route-loading"/);
  assert.doesNotMatch(src, /PlatformTopbar|<header/, "the layout already paints the topbar");
});

test("the HQ segment has a client error boundary with retry", () => {
  assert.ok(existsSync(ADMIN + "error.tsx"), "platform/admin/error.tsx is missing");
  const src = read("error.tsx");
  assert.match(src, /^"use client";/);
  assert.match(src, /reset\(\)/);
  assert.match(src, /role="alert"/);
});

test("the side-nav Builder Lab tab is still a plain Link to the existing route", () => {
  const nav = read("platform-topbar.tsx");
  assert.match(nav, /segment: "builder-lab"/);
  assert.match(nav, /<Link\s+key=\{tab\.id\}\s+href=\{href\}/);
  assert.ok(existsSync(ADMIN + "builder-lab/page.tsx"));
});
