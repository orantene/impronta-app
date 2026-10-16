/**
 * TUL-782 (PM 2026-10-15): a signed-in client lands on a safe same-origin `next` (e.g. /account);
 * anything else (none, an unsafe or another role's path) goes to /client.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePostAuthDestination } from "./auth-flow";

const client = { app_role: "client", account_status: "active" } as never;

test("a client with no next lands on /client", () => {
  assert.equal(resolvePostAuthDestination(client, null), "/client");
});

test("a client honors a same-origin /account next", () => {
  assert.equal(resolvePostAuthDestination(client, "/account"), "/account");
  assert.equal(resolvePostAuthDestination(client, "/account?tab=messages"), "/account?tab=messages");
});

test("a client never follows an unsafe or foreign next", () => {
  assert.equal(resolvePostAuthDestination(client, "https://evil.example/account"), "/client");
  assert.equal(resolvePostAuthDestination(client, "//evil.example"), "/client");
  assert.equal(resolvePostAuthDestination(client, "/admin"), "/client");
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

// TUL-782: one table, every hostile or foreign `next` shape, for an active client.
const REJECTED_NEXT: ReadonlyArray<string> = [
  "//evil.com",
  "//evil.com/account",
  "https://evil.com",
  "https://evil.com/account",
  "http://evil.com",
  "javascript:alert(1)",
  "data:text/html,x",
  "/\\evil.com",
  "evil.com/account",
  "",
  "/admin",
  "/talent",
];
const HONORED_NEXT: ReadonlyArray<string> = ["/account", "/account?tab=messages", "/client"];

test("TUL-782: table, an active client's landing for every next shape", () => {
  for (const next of HONORED_NEXT) assert.equal(resolvePostAuthDestination(client, next), next, `honored: ${next}`);
  for (const next of REJECTED_NEXT) {
    const dest = resolvePostAuthDestination(client, next);
    assert.equal(dest, "/client", `rejected: ${JSON.stringify(next)} -> ${dest}`);
  }
  assert.equal(resolvePostAuthDestination(client, undefined), "/client");
  assert.equal(resolvePostAuthDestination(client, null), "/client");
});

test("TUL-782: the landing never leaves the origin, whatever the next", () => {
  for (const next of [...REJECTED_NEXT, ...HONORED_NEXT]) {
    const dest = resolvePostAuthDestination(client, next);
    assert.ok(dest.startsWith("/") && !dest.startsWith("//"), `${JSON.stringify(next)} -> ${dest}`);
  }
});

test("TUL-782: every sign-in entry point (code, password, magic link, Google callback) uses the one rule", () => {
  const entries = ["src/app/auth/otp-actions.ts", "src/app/auth/actions.ts", "src/app/auth/confirm/route.ts", "src/app/auth/callback/route.ts"];
  for (const rel of entries) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(src, /resolvePostAuthDestination\(/, rel);
  }
});
