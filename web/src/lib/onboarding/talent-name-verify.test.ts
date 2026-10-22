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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { retryNameToVerify } from "./talent-display-name";

const draft = (businessName: string | null) => ({ businessName, headlineName: "Ana" });
const rbase = { choice: "myself" as const, briefBusinessName: null, essentialsName: null };

test("TUL-1839 retry: a talent draft verifies the stored display name, like the first build", () => {
  assert.equal(retryNameToVerify({ ...rbase, arrival: draft(null), storedDisplayName: "Casa Limpia" }), "Casa Limpia");
});

test("TUL-1839 retry: solo pro with a business name is not checked by the person name", () => {
  assert.equal(retryNameToVerify({ ...rbase, arrival: draft(null), storedDisplayName: null, briefBusinessName: "Casa Limpia" }), "Casa Limpia");
});

test("TUL-1839 retry: a workspace draft keeps its business name", () => {
  assert.equal(retryNameToVerify({ ...rbase, arrival: draft("Studio"), storedDisplayName: "Ana" }), "Studio");
});

test("TUL-1839 retry: build.server's saved-draft path uses retryNameToVerify with the stored name", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/onboarding/build.server.ts"), "utf8");
  const start = src.indexOf('existing.arrival?.variant === "draft_saved"');
  const block = src.slice(start, src.indexOf("return done(input, { ...existing", start));
  assert.match(block, /retryNameToVerify\(/);
  assert.match(block, /select\("display_name"\)/);
  assert.doesNotMatch(block, /a\.businessName \?\? a\.headlineName/);
});
