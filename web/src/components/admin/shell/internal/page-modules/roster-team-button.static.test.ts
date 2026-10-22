import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../../../../..");
const src = readFileSync(join(__dirname, "TalentPage-1.tsx"), "utf8");

test("TUL-1926: the roster Team button goes through the message catalog, not a literal", () => {
  assert.ok(src.includes('t("admin.roster.list.team")'));
  assert.ok(!/openDrawer\("team"\)\}>\s*Team\s*</.test(src), "literal Team label is back");
});

test("TUL-1926: the key exists in en and es, and es says Equipo", () => {
  const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8"));
  const es = JSON.parse(readFileSync(join(root, "messages/es.json"), "utf8"));
  assert.equal(en.admin.roster.list.team, "Team");
  assert.equal(es.admin.roster.list.team, "Equipo");
});
