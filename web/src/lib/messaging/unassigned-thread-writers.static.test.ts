import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * D-MSG-345 (Part C): a client writer must never hard-fail on an UNASSIGNED
 * thread.
 *
 * Every guest inquiry starts with `owner_user_id = null` and stays that way
 * until staff pick it up, so any writer that treats the owner as required is
 * broken for every fresh visitor. That is exactly what D-MSG-226 found: "Add
 * to inquiry" (when no shared draft existed yet) and "Book again" both refused
 * `no_owner`, silently, for the most common state a thread can be in.
 *
 * These are static assertions rather than clicks because the failure is a
 * missing fallback in a code path that only runs when an order does not exist
 * yet - a state a seeded fixture rarely has and a passing UI test would not
 * notice. Pin the fallback where it lives.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("the shared-draft helper falls back to the workspace owner", () => {
  const src = read("lib/server-actions/messaging-client.ts");
  assert.match(src, /resolveTenantOwnerId/, "messaging-client must import the tenant-owner fallback");
  // The owner read and the fallback must be ONE expression: a fallback added
  // on a later line can be skipped by an early `return fail("no_owner")`.
  assert.match(
    src,
    /owner_user_id\s*\?\?\s*\(await resolveTenantOwnerId\(/,
    "the draft actor must fall back to the workspace owner in the same expression as the owner read",
  );
});

test("book again falls back to the workspace owner for the draft actor", () => {
  const src = read("lib/messaging/client-book-again.ts");
  assert.match(
    src,
    /row\.owner_user_id\s*\?\?\s*\(await input\.resolveOwner/,
    "bookAgainFromRecord must fall back to the injected owner resolver",
  );
  assert.match(src, /actorUserId:\s*draftActor/, "the POS draft must use the resolved actor, not the raw owner");
});

test("the client link's owner read is display-only and cannot refuse", () => {
  const src = read("lib/messaging/client-link.ts");
  // It reads the owner to name the handler in an email. If that ever becomes a
  // refusal, an unassigned thread stops being able to send its own link.
  assert.match(src, /if \(ownerId\) \{/, "the owner read must stay guarded");
  assert.doesNotMatch(src, /no_owner/, "client-link must never refuse on a missing owner");
});

test("no client writer refuses `no_owner` without a fallback in the same file", () => {
  for (const rel of [
    "lib/server-actions/messaging-client.ts",
    "lib/messaging/client-book-again.ts",
    "lib/messaging/client-rename.ts",
    "lib/messaging/client-link.ts",
  ]) {
    const src = read(rel);
    if (!/no_owner/.test(src)) continue;
    assert.match(
      src,
      /resolveTenantOwnerId|resolveOwner/,
      `${rel} refuses no_owner but has no workspace-owner fallback`,
    );
  }
});
