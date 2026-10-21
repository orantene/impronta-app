/**
 * TUL-1708: the sessions and door WRITERS were behind a capability-less staff guard, which a `viewer` passes.
 * They now require `operate_venue` (editor and above); their readers say `agency.workspace.view` out loud.
 * Wiring (the source of each function) plus the role matrix.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DOOR = "src/app/(workspace)/[tenantSlug]/admin/_door-actions.ts";

/** The text of one exported function, up to the next top-level export. */
function body(src: string, fn: string): string {
  const i = src.indexOf(`export async function ${fn}`);
  assert.ok(i > -1, `${fn} not found`);
  const rest = src.slice(i + 10);
  const next = rest.search(/\nexport (?:async )?(?:function|type|const)/);
  return next === -1 ? rest : rest.slice(0, next);
}

const WRITERS: Array<[file: string, fns: string[]]> = [
  ["src/lib/sessions/schedule-actions.ts", ["scheduleSession"]],
  ["src/lib/sessions/door-actions.ts", ["scanAdmission"]],
  [DOOR, ["admitAtDoor", "sellAtDoor", "settleHeldOrderAtDoor"]],
];
const READERS: Array<[file: string, fns: string[]]> = [
  ["src/lib/sessions/schedule-actions.ts", ["loadSchedulableEvents"]],
  ["src/lib/sessions/roster-actions.ts", ["loadSessionParticipants"]],
  ["src/lib/sessions/date-roster-actions.ts", ["loadDateRoster"]],
  [DOOR, ["loadDoor", "loadDoorTiers", "loadHeldDoorOrders"]],
];

test("no capability-less staff guard is left in these files", () => {
  for (const f of new Set([...WRITERS, ...READERS, ["src/app/(workspace)/[tenantSlug]/admin/events/door/page.tsx", []] as [string, string[]]].map(([x]) => x))) {
    assert.doesNotMatch(read(f), /\brequireWorkspaceStaffAction\(\s*\)/, f);
  }
});

test("every writer requires operate_venue", () => {
  for (const [file, fns] of WRITERS) {
    const src = read(file);
    for (const fn of fns) assert.match(body(src, fn), /requireWorkspaceStaffAction\(\{ capability: "operate_venue" \}\)/, `${file} ${fn}`);
  }
});

test("every reader keeps the default capability, named explicitly", () => {
  for (const [file, fns] of READERS) {
    const src = read(file);
    for (const fn of fns) assert.match(body(src, fn), /requireWorkspaceStaffAction\(\{ capability: "agency\.workspace\.view" \}\)/, `${file} ${fn}`);
  }
  assert.match(read("src/app/(workspace)/[tenantSlug]/admin/events/door/page.tsx"), /capability: "agency\.workspace\.view"/);
});

test("a viewer is refused operate_venue; editor, manager, admin and owner are allowed; every role reads", () => {
  assert.equal(roleGrantsCapability("viewer", "operate_venue"), false);
  for (const role of ["editor", "manager", "admin", "owner"] as const) assert.equal(roleGrantsCapability(role, "operate_venue"), true, role);
  for (const role of ["viewer", "editor", "manager", "admin", "owner"] as const) assert.equal(roleGrantsCapability(role, "agency.workspace.view"), true, role);
});
