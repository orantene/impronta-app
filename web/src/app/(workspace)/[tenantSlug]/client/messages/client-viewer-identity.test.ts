// TUL-610: while staff view as a client, the client Messages "mine" side must
// be decided by the EFFECTIVE (impersonated) client, never the staff actor.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = join(process.cwd(), "src", "app", "(workspace)", "[tenantSlug]", "client", "messages");
const STAFF = "staff-actor";
const CLIENT = "effective-client";

test("realtime row from the effective client is mine, from the staff actor is not", async () => {
  const mod = await import("./client-thread-adapter");
  const fn = (mod as Record<string, unknown>).isOwnClientMessage as
    | ((sender: string | null, viewer: string | null) => boolean)
    | undefined;
  assert.equal(typeof fn, "function", "isOwnClientMessage must exist");
  assert.equal(fn!(CLIENT, CLIENT), true);
  assert.equal(fn!(STAFF, CLIENT), false);
  assert.equal(fn!(CLIENT, null), false);
  assert.equal(fn!(null, CLIENT), false);
});

test("the shell takes the viewer id from the server (effective user), not the browser session", () => {
  const shell = readFileSync(join(DIR, "ClientMessagesShell.tsx"), "utf8");
  assert.ok(!/auth\.getUser\(\)/.test(shell), "shell must not read the staff session user for mine");
  const page = readFileSync(join(DIR, "page.tsx"), "utf8");
  assert.ok(/viewerUserId=\{pageData\.read\.userId\}/.test(page), "page must pass the effective user id");
});
