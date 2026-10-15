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
