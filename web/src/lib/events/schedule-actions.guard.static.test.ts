import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The schedule actions follow the `_events-actions.ts` guard pattern to the
 * letter (see `event-page-actions.guard.static.test.ts`, whose shape this
 * copies). THE TENANT IS NEVER A PARAMETER: every staff action calls
 * `requireWorkspaceStaffAction` before anything else, every write is
 * capability-gated, and the public action takes its tenant from the host.
 * Pinned at the source, because a `loadX(tenantId)` would typecheck, read
 * naturally and pass review.
 */

const STAFF = "src/app/(workspace)/[tenantSlug]/admin/_events-schedule-actions.ts";
const PUBLIC = "src/app/(public)/_events/event-program-actions.ts";
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const staffSrc = readFileSync(join(process.cwd(), STAFF), "utf8");
const staff = strip(staffSrc);
const publicSrc = readFileSync(join(process.cwd(), PUBLIC), "utf8");
const pub = strip(publicSrc);

const staffActions = [...staff.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]!);
const WRITES = ["saveScheduleItem", "deleteScheduleItem", "duplicateScheduleItem", "reorderScheduleItems", "saveEventProgramSettings", "importLineupAsScheduleItems"];
const READS = ["listScheduleItems", "searchPerformers", "listEventSpaces"];

function fnBody(src: string, actions: string[], name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  const next = actions.map((n) => src.indexOf(`export async function ${n}(`)).filter((i) => i > start).sort((a, b) => a - b)[0] ?? src.length;
  return src.slice(start, next);
}

test("the staff file is a server-action module with exactly the nine actions the tab uses", () => {
  assert.match(staffSrc, /^"use server";/);
  assert.deepEqual([...staffActions].sort(), [...WRITES, ...READS].sort());
});

test("no tenant identifier enters through any staff signature or schema", () => {
  for (const name of staffActions) {
    const sig = staff.match(new RegExp(`export async function ${name}\\(([^)]*)\\)`))![1]!;
    assert.doesNotMatch(sig, /tenant/i, `${name}: ${sig}`);
  }
  assert.doesNotMatch(staff, /tenantId:\s*z\./, "no schema accepts a tenant id");
  assert.doesNotMatch(staff, /requireStaffTenantAction/);
});

test("every staff action calls the guard before the store, fails closed, and hands the store the guard's tenant", () => {
  for (const name of staffActions) {
    const fn = fnBody(staff, staffActions, name);
    const guardAt = fn.indexOf("await requireWorkspaceStaffAction(");
    assert.ok(guardAt > 0, `${name} calls the guard`);
    const storeCall = fn.search(/await (list|save|delete|duplicate|reorder|import|search)\w+Rows?\(admin, guard\.tenantId/);
    assert.ok(storeCall > guardAt, `${name}: the store is called after the guard, with guard.tenantId`);
    assert.match(fn, /if \(!guard\.ok\) return \{ ok: false, error: guard\.error \};/, `${name} fails closed`);
    assert.doesNotMatch(fn, /\.from\(/, `${name}: no inline reads; the store owns every read`);
  }
});

test("writes are capability-gated; reads use the view capability", () => {
  assert.match(staff, /const CAPABILITY = "manage_agency_settings" as const;/);
  for (const name of WRITES) assert.match(fnBody(staff, staffActions, name), /requireWorkspaceStaffAction\(\{ capability: CAPABILITY \}\)/, `${name} is gated`);
  for (const name of READS) assert.match(fnBody(staff, staffActions, name), /requireWorkspaceStaffAction\(\)/, `${name} is a plain staff read`);
});

test("the store scopes every read and write by the tenant it is handed, and checks each foreign key inside it", () => {
  const store = strip(readFileSync(join(process.cwd(), "src/lib/events/schedule/staff-store.ts"), "utf8"));
  // Every .from(...) chain in the store that touches a tenant-owned table carries the tenant predicate.
  const tenantTables = ["event_schedule_items", "events", "sessions", "spaces", "agency_talent_roster", "inquiries"];
  for (const t of tenantTables) {
    const uses = [...store.matchAll(new RegExp(`\\.from\\(${t === "event_schedule_items" ? "EVENT_SCHEDULE_ITEMS_TABLE" : `"${t}"`}\\)([^;]*)`, "g"))];
    assert.ok(uses.length > 0, `${t} is read`);
    for (const u of uses) {
      // An INSERT carries the tenant in its payload rather than as a predicate; the payload builders are pinned below.
      if (/^\.insert\(/.test(u[1]!)) continue;
      assert.match(u[1]!, /\.eq\("tenant_id", tenantId\)/, `${t}: ${u[1]!.slice(0, 120)}`);
    }
  }
  // Every inserted row is stamped with the tenant the store was handed: the create payload, the duplicate copy, the lineup import.
  assert.equal((store.match(/tenant_id: tenantId,/g) ?? []).length, 3, "three insert payload builders stamp the tenant");
  assert.match(store, /\.from\("sessions"\)\.select\("id"\)\.eq\("tenant_id", tenantId\)\.eq\("event_id", eventId\)\.eq\("id", sessionId\)/);
  assert.match(store, /\.from\("spaces"\)\.select\("id"\)\.eq\("tenant_id", tenantId\)\.eq\("venue_id", venueId\)\.eq\("id", spaceId\)/);
  assert.match(store, /\.from\("agency_talent_roster"\)\.select\("id"\)\.eq\("tenant_id", tenantId\)\.eq\("talent_profile_id", talentProfileId\)\.eq\("status", "active"\)/);
  // No unchecked read: every Supabase read is routed through one()/many().
  assert.doesNotMatch(store, /const \{ data(?:: \w+)? \} = await/);
});

test("the public action takes its tenant from the host, never from the wire, and degrades to enabled:false", () => {
  assert.match(publicSrc, /^"use server";/);
  const actions = [...pub.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]!);
  assert.deepEqual(actions, ["loadEventProgram"]);
  const sig = pub.match(/export async function loadEventProgram\(([^)]*)\)/)![1]!;
  assert.doesNotMatch(sig, /tenant/i);
  assert.match(pub, /await getPublicHostContext\(\)/);
  assert.match(pub, /host\.kind === "agency" \|\| host\.kind === "hub" \? host\.tenantId : null/);
  assert.match(pub, /if \(!tenantId \|\| !uuidWire\.safeParse\(tenantId\)\.success\) return OFF;/);
  assert.match(pub, /loadPublicEventProgram\(admin, \{ tenantId, eventId: parsed\.data\.eventId, locale \}\)/);
  assert.doesNotMatch(pub, /\.from\(/, "no inline reads in the public action");
});
