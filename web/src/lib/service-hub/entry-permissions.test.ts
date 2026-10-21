import assert from "node:assert/strict";
import test from "node:test";

import { ENTRY_SETTING_FIELDS, can, fieldsAllowed, validateEntryPatch } from "./entry-permissions";

test("editors edit entries and decide the queue; they do not touch money or terms", () => {
  for (const a of ["entry_edit", "queue_decide", "group_edit"] as const) assert.equal(can(["editor"], a), true, a);
  for (const a of ["send_offer", "terms_edit", "money_edit"] as const) assert.equal(can(["editor"], a), false, a);
});

test("managers coordinate and send offers, nothing else by themselves", () => {
  assert.equal(can(["manager"], "send_offer"), true);
  for (const a of ["entry_edit", "queue_decide", "group_edit", "terms_edit", "money_edit"] as const) assert.equal(can(["manager"], a), false, a);
});

test("admins can do everything; roles add up; no roles can do nothing", () => {
  for (const a of ["entry_edit", "queue_decide", "group_edit", "send_offer", "terms_edit", "money_edit"] as const) assert.equal(can(["admin"], a), true, a);
  assert.equal(can(["editor", "manager"], "send_offer"), true);
  assert.equal(can(["editor", "manager"], "money_edit"), false);
  assert.equal(can([], "entry_edit"), false);
});

test("field rights: editors change name, category, photo, booking type, feature and hide; admins also hub price, show who and who talks to the client", () => {
  assert.deepEqual(fieldsAllowed(["editor"]).sort(), ["bookingType", "categoryId", "featured", "hidden", "name", "photoMediaId"]);
  assert.deepEqual(fieldsAllowed(["manager"]), []);
  assert.deepEqual([...fieldsAllowed(["admin"])].sort(), [...ENTRY_SETTING_FIELDS].sort());
});

test("a patch is refused when it touches a field the roles may not change", () => {
  assert.deepEqual(validateEntryPatch({ name: "Massage" }, ["editor"]), { ok: true, patch: { name: "Massage" } });
  assert.deepEqual(validateEntryPatch({ name: "Massage", hubPriceCents: 5000 }, ["editor"]), { ok: false, reason: "not_allowed", fields: ["hubPriceCents"] });
  assert.deepEqual(validateEntryPatch({ hubPriceCents: 5000 }, ["admin"]), { ok: true, patch: { hubPriceCents: 5000 } });
  assert.deepEqual(validateEntryPatch({ name: "x" }, []), { ok: false, reason: "not_allowed", fields: ["name"] });
});

test("values are checked: name length, whole non-negative cents, known enums; unknown fields are refused", () => {
  assert.deepEqual(validateEntryPatch({ name: "   " }, ["admin"]), { ok: false, reason: "invalid", fields: ["name"] });
  assert.deepEqual(validateEntryPatch({ name: "x".repeat(121) }, ["admin"]), { ok: false, reason: "invalid", fields: ["name"] });
  assert.deepEqual(validateEntryPatch({ hubPriceCents: -1 }, ["admin"]), { ok: false, reason: "invalid", fields: ["hubPriceCents"] });
  assert.deepEqual(validateEntryPatch({ hubPriceCents: 10.5 }, ["admin"]), { ok: false, reason: "invalid", fields: ["hubPriceCents"] });
  assert.deepEqual(validateEntryPatch({ showWho: "everyone" }, ["admin"]), { ok: false, reason: "invalid", fields: ["showWho"] });
  assert.deepEqual(validateEntryPatch({ clientContact: "talent" }, ["admin"]), { ok: true, patch: { clientContact: "talent" } });
  assert.deepEqual(validateEntryPatch({ bookingType: "walk_in" }, ["admin"]), { ok: false, reason: "invalid", fields: ["bookingType"] });
  assert.deepEqual(validateEntryPatch({ evil: 1 }, ["admin"]), { ok: false, reason: "unknown_field", fields: ["evil"] });
  assert.deepEqual(validateEntryPatch({}, ["admin"]), { ok: false, reason: "empty", fields: [] });
});

test("name is trimmed; a featured entry cannot also be hidden", () => {
  assert.deepEqual(validateEntryPatch({ name: "  Deep massage " }, ["editor"]), { ok: true, patch: { name: "Deep massage" } });
  assert.deepEqual(validateEntryPatch({ featured: true, hidden: true }, ["editor"]), { ok: false, reason: "invalid", fields: ["featured", "hidden"] });
  assert.deepEqual(validateEntryPatch({ featured: true, hidden: false }, ["editor"]), { ok: true, patch: { featured: true, hidden: false } });
});

import { hubRolesFromMembership } from "./entry-permissions";

test("membership roles map to hub roles; viewer and unknown map to nothing", () => {
  assert.deepEqual(hubRolesFromMembership("owner"), ["admin"]);
  assert.deepEqual(hubRolesFromMembership("admin"), ["admin"]);
  assert.deepEqual(hubRolesFromMembership("coordinator"), ["manager"]);
  assert.deepEqual(hubRolesFromMembership("editor"), ["editor"]);
  for (const r of ["viewer", "", null, undefined, "root"]) assert.deepEqual(hubRolesFromMembership(r as never), []);
});
