/**
 * TUL-524 — first-publish dialog contract (static).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const drawer = readFileSync(join(here, "publish-drawer.tsx"), "utf8");
const esPublish = readFileSync(join(here, "editor-i18n-es-publish.ts"), "utf8");
const filter = readFileSync(
  join(
    here,
    "../../lib/site-admin/edit-mode/publish-preflight-owner-filter.ts",
  ),
  "utf8",
);

test("TUL-524: primary sentence uses host + More options disclosure", () => {
  assert.match(drawer, /Your page will be published at \{host\}/);
  assert.match(drawer, /data-testid="publish-more-options"/);
  assert.match(drawer, /More options/);
  assert.match(esPublish, /Tu página se publicará en \{host\}/);
  assert.match(esPublish, /"More options": "Más opciones"/);
});

test("TUL-524: no Publish blocked banner and no owner-facing legacy copy", () => {
  // Owner-visible string only (comments may mention the old banner).
  assert.doesNotMatch(drawer, />\s*Publish blocked\s*</);
  assert.doesNotMatch(drawer, /["'`]Publish blocked["'`]/);
  assert.doesNotMatch(drawer, /Show \$\{.*\} legacy/i);
  assert.doesNotMatch(drawer, /Hide \$\{.*\} legacy/i);
  assert.doesNotMatch(drawer, /["'`][^"'`]*legacy sections[^"'`]*["'`]/i);
});

test("TUL-524: owner filter strips snapshot / policy / locale / legacy", () => {
  assert.match(filter, /snapshot\|policy\|locale\|legacy/);
  assert.match(filter, /finalizeOwnerPreflightIssues/);
});
