/**
 * ServicesHome "Save draft" must force status "draft". blankOffering defaults
 * to published; keeping next.status made draft saves validate as live Instant
 * offerings and refuse without a price (Story 3 Manicure Gel QA).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(process.cwd(), "src/components/talent/services/ServicesHome.tsx"),
  "utf8",
);

test("Save draft forces status draft (not next.status)", () => {
  assert.match(
    src,
    /status:\s*publish\s*\?\s*"published"\s*:\s*"draft"/,
  );
  assert.doesNotMatch(
    src,
    /status:\s*publish\s*\?\s*"published"\s*:\s*next\.status/,
  );
});
