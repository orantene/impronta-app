/**
 * The profile preview link must never point at production before the browser
 * origin is known: useCurrentOrigin() is null during the hydration render, and
 * talentPublicProfileHref() then falls back to https://tulala.digital, so a click
 * on localhost/staging would leave for the live site (TESTING.md: never leave localhost).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/talent/pages/MyProfilePage.tsx"),
  "utf8",
);

test("preview link has no href until the origin is read", () => {
  assert.match(SRC, /href=\{origin \? previewHref : undefined\}/);
  assert.doesNotMatch(SRC, /href=\{previewHref\}/);
});
