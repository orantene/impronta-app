/**
 * DEFAULT PAGES CONTRACT — deletion guards.
 *
 * Run: npx tsx --test src/lib/site-admin/server/page-deletion-guard.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  PROTECTED_PAGE_ROLES,
  roleDeletionBlockReason,
} from "./page-deletion-guard";
import { EMPTY_PAGE_ROLES } from "./page-roles-shape";

test("home and notFound are the protected roles; directory is not", () => {
  assert.deepEqual([...PROTECTED_PAGE_ROLES], ["home", "notFound"]);
});

test("an ordinary page is deletable", () => {
  const roles = { ...EMPTY_PAGE_ROLES, home: "welcome", notFound: "404" };
  assert.equal(roleDeletionBlockReason({ slug: "about", roles }), null);
});

test("the page holding `home` cannot be deleted, and the message names the swap", () => {
  const roles = { ...EMPTY_PAGE_ROLES, home: "welcome" };
  const reason = roleDeletionBlockReason({ slug: "welcome", roles });
  assert.ok(reason, "expected a block reason");
  assert.match(reason, /homepage/);
  assert.match(reason, /another published page/);
  assert.match(reason, /delete this one/);
  // Plain language only — never a code, never a stack trace: this string is
  // surfaced verbatim to the operator.
  assert.doesNotMatch(reason, /SYSTEM_PAGE_IMMUTABLE|Error|undefined/);
});

test("the page holding `notFound` cannot be deleted", () => {
  const roles = { ...EMPTY_PAGE_ROLES, notFound: "404" };
  const reason = roleDeletionBlockReason({ slug: "404", roles });
  assert.ok(reason);
  assert.match(reason, /404 page/);
});

test("archiving is blocked too, and the verb matches the action", () => {
  const roles = { ...EMPTY_PAGE_ROLES, home: "welcome" };
  const reason = roleDeletionBlockReason({
    slug: "welcome",
    roles,
    verb: "archive",
  });
  assert.ok(reason);
  assert.match(reason, /archive this one/);
});

test("holding BOTH protected roles names both, in a stable order", () => {
  const roles = { ...EMPTY_PAGE_ROLES, home: "welcome", notFound: "welcome" };
  const reason = roleDeletionBlockReason({ slug: "welcome", roles });
  assert.ok(reason);
  assert.match(reason, /homepage and your 404 page/);
});

test("the directory role is NOT protected — a roster-less workspace may drop it", () => {
  const roles = { ...EMPTY_PAGE_ROLES, directory: "our-roster" };
  assert.equal(roleDeletionBlockReason({ slug: "our-roster", roles }), null);
});

test("SWAP, not block: reassigning the role first unblocks the delete", () => {
  const before = { ...EMPTY_PAGE_ROLES, home: "welcome" };
  assert.ok(roleDeletionBlockReason({ slug: "welcome", roles: before }));
  // Operator assigns `home` to a different published page…
  const after = { ...EMPTY_PAGE_ROLES, home: "landing" };
  // …and the old page is now free to delete. That is the whole contract:
  // a role page can be swapped, never deleted into a hole.
  assert.equal(roleDeletionBlockReason({ slug: "welcome", roles: after }), null);
});

test("an empty or missing slug never blocks", () => {
  const roles = { ...EMPTY_PAGE_ROLES, home: "welcome" };
  assert.equal(roleDeletionBlockReason({ slug: "", roles }), null);
  assert.equal(roleDeletionBlockReason({ slug: null, roles }), null);
  assert.equal(roleDeletionBlockReason({ slug: undefined, roles }), null);
});
