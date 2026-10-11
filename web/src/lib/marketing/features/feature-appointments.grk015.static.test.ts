/**
 * GRK-015 — developer word "endpoint" must not appear in the public
 * appointments FAQ (EN or ES).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/marketing/features/feature-appointments.ts"),
  "utf8",
);

test("GRK-015: appointments FAQ answers do not say endpoint", () => {
  // Strip the file-level comment block; only user-facing faq strings matter.
  const withoutHeader = SRC.replace(/^[\s\S]*?export const/, "export const");
  assert.doesNotMatch(withoutHeader, /endpoint/i);
  assert.match(withoutHeader, /public availability schedule/);
  assert.match(withoutHeader, /horario público de disponibilidad/);
});
