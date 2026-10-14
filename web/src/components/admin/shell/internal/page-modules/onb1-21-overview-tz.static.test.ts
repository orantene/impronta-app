/**
 * onb1-21-overview-tz.static.test.ts — Admin Resumen greeting + date share
 * the venue timezone (not Date#getHours / bare host clock).
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/admin/shell/internal/page-modules/onb1-21-overview-tz.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { utcToZonedHour } from "@/lib/scheduling/tz";

const BOARD = join(dirname(fileURLToPath(import.meta.url)), "OverviewBoard.tsx");

test("utcToZonedHour: Cancún evening is not UTC morning", () => {
  // 2026-10-10 01:39 UTC ≈ 2026-10-09 20:39 America/Cancun
  const instant = new Date("2026-10-10T01:39:00.000Z");
  assert.equal(utcToZonedHour(instant, "UTC"), 1);
  assert.equal(utcToZonedHour(instant, "America/Cancun"), 20);
});

test("OverviewBoard greets from venue zone, not Date#getHours", () => {
  const src = readFileSync(BOARD, "utf8");
  assert.match(src, /utcToZonedHour/);
  assert.doesNotMatch(src, /greetingKey\(now\.getHours\(\)\)/);
});
