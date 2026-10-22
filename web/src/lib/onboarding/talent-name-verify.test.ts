import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderDisplayName, talentNameToVerify } from "./talent-display-name";

const base = { choice: "myself" as const, businessName: null, essentialsName: null, briefPersonName: null };

test("the stored profile name wins: it is what the page prints", () => {
  assert.equal(talentNameToVerify({ ...base, storedDisplayName: "Casa Limpia", briefPersonName: "Ana" }), "Casa Limpia");
});

test("a solo pro with a business name is checked by that name, not the brief person name", () => {
  assert.equal(talentNameToVerify({ ...base, storedDisplayName: null, businessName: "Casa Limpia", briefPersonName: "Ana" }), "Casa Limpia");
});

test("a placeholder stored name falls back to the wizard name", () => {
  assert.equal(talentNameToVerify({ ...base, storedDisplayName: "My page", essentialsName: "Ana Ruiz" }), "Ana Ruiz");
  assert.equal(talentNameToVerify({ ...base, storedDisplayName: "  ", briefPersonName: "Ana" }), "Ana");
});

test("no name anywhere stays null (the check reports no_name, not name_missing)", () => {
  assert.equal(talentNameToVerify({ ...base }), null);
});

test("both: the talent page stays personal even when a business name exists", () => {
  assert.equal(talentNameToVerify({ ...base, choice: "both", businessName: "Studio", essentialsName: "Ana" }), "Ana");
});

test("placeholder detection", () => {
  assert.equal(isPlaceholderDisplayName(null), true);
  assert.equal(isPlaceholderDisplayName("my page"), true);
  assert.equal(isPlaceholderDisplayName("Ana"), false);
});
