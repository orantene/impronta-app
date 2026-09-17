import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The Event Day tab's "Run of show" strip reads `event_schedule_items` ONLY
 * through the guarded staff action `listScheduleItems` in
 * `_events-schedule-actions.ts`. A client component that reached the table,
 * the store, or the public loader directly would typecheck and read
 * naturally; this pins the one door at the source (the same shape as
 * `schedule-actions.guard.static.test.ts`).
 */

const DAY_TAB = "src/components/admin/shell/internal/page-modules/events/event-tab-day.tsx";
const ACTIONS = "@/app/(workspace)/[tenantSlug]/admin/_events-schedule-actions";
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = strip(readFileSync(join(process.cwd(), DAY_TAB), "utf8"));

test("the Day tab is a client component that imports listScheduleItems from the schedule actions module", () => {
  assert.match(src, /^"use client";/);
  assert.match(src, new RegExp(`import \\{ listScheduleItems \\} from "${ACTIONS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}";`));
  assert.match(src, /await listScheduleItems\(\{ eventId \}\)|listScheduleItems\(\{ eventId \}\)/);
});

test("no other road to the schedule rows: no table, no store, no public loader, no Supabase client", () => {
  assert.doesNotMatch(src, /event_schedule_items/);
  assert.doesNotMatch(src, /schedule\/staff-store/);
  assert.doesNotMatch(src, /schedule\/public-loader/);
  assert.doesNotMatch(src, /schedule\/contract/);
  assert.doesNotMatch(src, /\.from\(/);
  assert.doesNotMatch(src, /supabase/i);
  assert.doesNotMatch(src, /event-program-actions/);
});

test("the strip is read-only: no schedule writer is imported into the Day tab", () => {
  for (const writer of ["saveScheduleItem", "deleteScheduleItem", "duplicateScheduleItem", "reorderScheduleItems", "saveEventProgramSettings", "importLineupAsScheduleItems"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${writer}\\b`), `${writer} must not appear in the Day tab`);
  }
});

test("rows are normalised and grouped by the shared pure model before they render", () => {
  assert.match(src, /normalizeScheduleItemRow\(/);
  assert.match(src, /groupItemsByNight\(/);
  assert.match(src, /nowItemIds\(/);
  // "Ahora" is computed after mount from the client clock, never on the server render.
  assert.match(src, /useState<number \| null>\(null\)/);
});

test("the copy lives in the catalog under dashboard.events.day.runOfShow", () => {
  for (const key of ["title", "staffOnly", "now", "tba", "empty", "emptyLink", "editLink"]) {
    assert.match(src, new RegExp(`t\\("dashboard\\.events\\.day\\.runOfShow\\.${key}"\\)`), key);
  }
  for (const loc of ["es", "en", "fr"]) {
    const catalog = JSON.parse(readFileSync(join(process.cwd(), `messages/${loc}.json`), "utf8")) as { dashboard: { events: { day: { runOfShow: Record<string, string> } } } };
    const ros = catalog.dashboard.events.day.runOfShow;
    for (const key of ["title", "staffOnly", "now", "tba", "empty", "emptyLink", "editLink"]) {
      assert.equal(typeof ros[key], "string", `${loc}: ${key}`);
      assert.doesNotMatch(ros[key]!, /—/, `${loc}: ${key} has an em dash`);
    }
  }
});
