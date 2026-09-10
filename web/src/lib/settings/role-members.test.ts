import test from "node:test";
import assert from "node:assert/strict";

import {
  groupMembersByRole,
  SETTINGS_ROLE_ORDER,
  type RoleMember,
} from "./role-members";

/**
 * The member count on Settings › Roles & limits used to count every row the
 * team list carried, invitations included. `status` is a real field — the
 * shell maps the loader's `pending_acceptance` onto `"invited"` — and someone
 * who has not accepted cannot sign in, hold a role, or open a register. A
 * count taken correctly over those rows is a count of the wrong rows.
 */

const people: RoleMember[] = [
  { id: "a", name: "Ana", role: "owner", status: "active" },
  { id: "b", name: "Beto", role: "editor", status: "active" },
  { id: "c", name: "Caro", role: "editor", status: "invited" },
  { id: "d", name: "Dani", role: "editor", status: "invited" },
];

test("an unaccepted invitation is not counted as a member of the role", () => {
  const grouped = groupMembersByRole(people);
  const editor = grouped.get("editor")!;
  assert.equal(editor.active.length, 1, "only Beto holds editor today");
  assert.deepEqual(editor.active.map((m) => m.name), ["Beto"]);
  assert.deepEqual(editor.invited.map((m) => m.name), ["Caro", "Dani"]);
});

test("the pending people are kept, not dropped", () => {
  const grouped = groupMembersByRole(people);
  const total = [...grouped.values()].reduce((n, g) => n + g.active.length + g.invited.length, 0);
  assert.equal(total, people.length, "every person appears exactly once");
});

test("every role in the ladder is present even when nobody holds it", () => {
  const grouped = groupMembersByRole([]);
  assert.deepEqual([...grouped.keys()], [...SETTINGS_ROLE_ORDER]);
  for (const role of SETTINGS_ROLE_ORDER) {
    assert.deepEqual(grouped.get(role), { active: [], invited: [] }, role);
  }
});

test("a role the ladder does not know is ignored rather than crashing the card", () => {
  const grouped = groupMembersByRole([
    { id: "x", name: "Ghost", role: "sorcerer" as RoleMember["role"], status: "active" },
  ]);
  const total = [...grouped.values()].reduce((n, g) => n + g.active.length + g.invited.length, 0);
  assert.equal(total, 0);
});
