import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleLineFor } from "./card-role-line";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a role that only repeats the name is dropped; a real role is kept", () => {
  assert.equal(roleLineFor("Concierge QA Instant", "Concierge QA Instant"), null);
  assert.equal(roleLineFor("Concierge QA Instant", "  concierge  qa instant "), null);
  assert.equal(roleLineFor("María", "maria"), null, "accents do not make it a different word");
  assert.equal(roleLineFor("Ana Lopez", "Barbero"), "Barbero");
  assert.equal(roleLineFor("Ana Lopez", null), null);
  assert.equal(roleLineFor("Ana Lopez", "   "), null);
  assert.equal(roleLineFor(null, "Barbero"), "Barbero");
});

test("the directory card mapper uses it for the role line", () => {
  const adapter = read("src/lib/site-admin/sections/directory/DirectoryCardAdapter.tsx");
  assert.match(adapter, /primaryType: roleLineFor\(card\.displayName, card\.primaryTalentTypeLabel\)/);
});

test("a card photo that fails to load falls back to the designed no-photo plate, not a blank box", () => {
  const photo = read("src/components/talent-cards/talent-card-photo.tsx");
  assert.match(photo, /^"use client";/);
  assert.match(photo, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(photo, /if \(failed\) return <TalentCardEmptyPlate discipline=\{discipline\} \/>/);
  const card = read("src/components/talent-cards/TalentCard.tsx");
  assert.match(card, /<TalentCardPhoto\s+src=\{data\.photoUrl\}/);
  assert.doesNotMatch(card, /<Image\s+src=\{data\.photoUrl\}/, "the primary photo no longer bypasses the fallback");
});
