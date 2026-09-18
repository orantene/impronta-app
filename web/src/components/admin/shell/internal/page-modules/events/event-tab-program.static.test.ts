/**
 * event-tab-program.static.test.ts — the Programa tab writes ONLY through
 * the staff actions of `_events-schedule-actions.ts` (Wave 2, PR C).
 *
 * The tenant is never a parameter there: the guard resolves it from the
 * session and every id is checked inside the tenant before a write. A tab
 * file that reached Supabase directly, or imported a writer from anywhere
 * else, would be a second path around that guard. This pins the three tab
 * files to the one path, and pins the tab into the detail's tab list.
 *
 * Run: node_modules/.bin/tsx --test src/components/admin/shell/internal/page-modules/events/event-tab-program.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { DETAIL_TABS } from "./events-model";

const HERE = dirname(fileURLToPath(import.meta.url));
const TAB_FILES = ["event-tab-program.tsx", "event-tab-program-list.tsx", "event-tab-program-sheet.tsx"] as const;
const ACTIONS_MODULE = "@/app/(workspace)/[tenantSlug]/admin/_events-schedule-actions";

const ACTIONS_EXPORTED = [
  "listScheduleItems",
  "saveScheduleItem",
  "deleteScheduleItem",
  "duplicateScheduleItem",
  "reorderScheduleItems",
  "saveEventProgramSettings",
  "importLineupAsScheduleItems",
  "searchPerformers",
  "listEventSpaces",
];

function source(file: string): string {
  return readFileSync(join(HERE, file), "utf8");
}

function importSpecifiers(src: string): string[] {
  return [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
}

test("no tab file touches Supabase, a store, or a server-only module", () => {
  for (const file of TAB_FILES) {
    const src = source(file);
    for (const spec of importSpecifiers(src)) {
      assert.ok(!/supabase/i.test(spec), `${file} imports ${spec}: the tab must not reach Supabase`);
      assert.ok(!/schedule\/staff-store|schedule\/public-loader|schedule\/contract|schedule\/row-shape/.test(spec), `${file} imports ${spec}: the store is server-only and behind the actions`);
      assert.ok(!/^server-only$/.test(spec), `${file} imports server-only`);
    }
    assert.ok(!/createServiceRoleClient|createClient\(/.test(src), `${file} constructs a Supabase client`);
  }
});

test("every action the tab calls is an export of _events-schedule-actions.ts", () => {
  const actionsSrc = readFileSync(join(HERE, "..", "..", "..", "..", "..", "..", "app", "(workspace)", "[tenantSlug]", "admin", "_events-schedule-actions.ts"), "utf8");
  assert.ok(/^"use server";/m.test(actionsSrc), "the actions file is a server-actions module");
  const exported = new Set([...actionsSrc.matchAll(/export async function (\w+)/g)].map((m) => m[1]!));
  for (const name of ACTIONS_EXPORTED) assert.ok(exported.has(name), `${name} is no longer exported by the actions file`);

  for (const file of TAB_FILES) {
    const src = source(file);
    const block = src.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${ACTIONS_MODULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    if (!block) continue;
    const names = block[1]!
      .split(",")
      .map((s) => s.trim().replace(/^type\s+/, ""))
      .filter(Boolean)
      .filter((n) => !/^(List|Save|Delete|Reorder|Import|Search)\w*Result$/.test(n));
    for (const n of names) assert.ok(exported.has(n), `${file} imports ${n} which the actions file does not export`);
  }
});

test("the only writer the tab imports from the OTHER events actions file is a type", () => {
  // `EventListRow` is the detail's row shape; no write from `_events-actions.ts` belongs on this tab.
  for (const file of TAB_FILES) {
    const src = source(file);
    const m = src.match(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*"@\/app\/\(workspace\)\/\[tenantSlug\]\/admin\/_events-actions"/);
    if (!m) continue;
    const typeOnly = Boolean(m[1]) || m[2]!.split(",").every((s) => /^\s*type\s+/.test(s));
    assert.ok(typeOnly, `${file} imports a value from _events-actions.ts`);
  }
});

test("the Programa tab is in the detail's tab list, after Tickets", () => {
  const i = DETAIL_TABS.indexOf("program");
  assert.ok(i > -1, "program is not a detail tab");
  assert.equal(DETAIL_TABS[i - 1], "tickets");
  const detail = source("EventDetail.tsx");
  assert.ok(/case "program":\s*return <EventProgramTab/.test(detail), "EventDetail does not render the Programa tab");
  assert.ok(/program: t\("dashboard\.events\.tab\.program"\)/.test(detail), "EventDetail has no label for the Programa tab");
});

test("every t() key the tab reads is in all three catalogs", () => {
  const catalogs = ["en", "es", "fr"].map((l) => JSON.parse(readFileSync(join(HERE, "..", "..", "..", "..", "..", "..", "..", "messages", `${l}.json`), "utf8")) as Record<string, unknown>);
  const lookup = (cat: Record<string, unknown>, key: string): unknown => key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), cat);
  const keys = new Set<string>();
  for (const file of [...TAB_FILES, "EventDetail.tsx"]) {
    for (const m of source(file).matchAll(/\bt\("(dashboard\.events\.program\.[\w.]+|dashboard\.events\.tab\.program)"\)/g)) keys.add(m[1]!);
  }
  assert.ok(keys.size > 40, `only ${keys.size} program keys found; the sweep is not seeing the tab`);
  for (const key of keys) {
    for (const [i, cat] of catalogs.entries()) {
      assert.equal(typeof lookup(cat, key), "string", `${key} missing in ${["en", "es", "fr"][i]}.json`);
    }
  }
  // The kind chips are a template family; pin every kind in every catalog.
  for (const cat of catalogs) {
    const kinds = lookup(cat, "dashboard.events.program.kind") as Record<string, unknown>;
    assert.equal(Object.keys(kinds).length, 16, "one label per SCHEDULE_ITEM_KINDS entry");
  }
});

test("no em dash in the program copy", () => {
  for (const l of ["en", "es", "fr"]) {
    const cat = JSON.parse(readFileSync(join(HERE, "..", "..", "..", "..", "..", "..", "..", "messages", `${l}.json`), "utf8")) as { dashboard: { events: { program: unknown } } };
    const text = JSON.stringify(cat.dashboard.events.program);
    assert.ok(!text.includes("—"), `${l}.json program copy has an em dash`);
  }
});
