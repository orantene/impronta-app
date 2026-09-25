/**
 * A3.2 — Evidence PNGs must be present (blocker-free without QA_TALENT_*).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.resolve(ROOT, "../../../../docs/plans/program/evidence/today-calendar");

const REQUIRED = [
  "today-evidence.png",
  "calendar-evidence.png",
  "attention-evidence.png",
  "new-booking-evidence.png",
] as const;

describe("A3.2 evidence PNGs", () => {
  for (const file of REQUIRED) {
    it(`includes ${file}`, () => {
      assert.ok(existsSync(path.join(EVIDENCE, file)), `missing ${file} under ${EVIDENCE}`);
    });
  }
});
