/**
 * TUL-1708 (area A — talent profile taxonomy & fields): a viewer must not write through a
 * capability-less staff guard. Every WRITE action across these 8 files now names the capability
 * it needs on `requireWorkspaceStaffAction({ capability })` itself, via the shared map in
 * admin-talent-write-capabilities.ts. Reads are untouched and keep the guard's default
 * (`agency.workspace.view`, which every role including `viewer` holds).
 *
 * Two checks per file:
 *   1. static — every listed WRITE function's body contains the wired
 *      `requireWorkspaceStaffAction({ capability: <MAP>.<fn> })` call and not a bare
 *      `requireWorkspaceStaffAction()` call.
 *   2. role-matrix — for every capability actually used in the map, a viewer (and, for the
 *      manager+ `agency.roster.invite` capability, an editor too) is refused; every role at or
 *      above the capability's tier is allowed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { CapabilityKey } from "@/lib/access";
import { roleGrantsCapability, TENANT_ROLE_KEYS, type TenantRoleKey } from "@/lib/access/roles";
import {
  PROFILE_SECTIONS_WRITE_CAPABILITY,
  SKILLS_WRITE_CAPABILITY,
  EXTRAS_WRITE_CAPABILITY,
  HUB_FACE_WRITE_CAPABILITY,
  FIELD_VALUES_WRITE_CAPABILITY,
  CONTEXTS_WRITE_CAPABILITY,
  LANGUAGES_WRITE_CAPABILITY,
  SERVICE_AREAS_WRITE_CAPABILITY,
} from "./admin-talent-write-capabilities";

const SRC_DIR = join(process.cwd(), "src/lib/server-actions");

function readSrc(file: string): string {
  return readFileSync(join(SRC_DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

type FileSpec = {
  file: string;
  mapName: string;
  map: Record<string, CapabilityKey>;
};

const FILES: FileSpec[] = [
  { file: "admin-talent-profile-sections.ts", mapName: "PROFILE_SECTIONS_WRITE_CAPABILITY", map: PROFILE_SECTIONS_WRITE_CAPABILITY },
  { file: "admin-talent-skills.ts", mapName: "SKILLS_WRITE_CAPABILITY", map: SKILLS_WRITE_CAPABILITY },
  { file: "admin-talent-extras.ts", mapName: "EXTRAS_WRITE_CAPABILITY", map: EXTRAS_WRITE_CAPABILITY },
  { file: "admin-talent-hub-face.ts", mapName: "HUB_FACE_WRITE_CAPABILITY", map: HUB_FACE_WRITE_CAPABILITY },
  { file: "admin-talent-field-values.ts", mapName: "FIELD_VALUES_WRITE_CAPABILITY", map: FIELD_VALUES_WRITE_CAPABILITY },
  { file: "admin-talent-contexts.ts", mapName: "CONTEXTS_WRITE_CAPABILITY", map: CONTEXTS_WRITE_CAPABILITY },
  { file: "admin-talent-languages.ts", mapName: "LANGUAGES_WRITE_CAPABILITY", map: LANGUAGES_WRITE_CAPABILITY },
  { file: "admin-talent-service-areas.ts", mapName: "SERVICE_AREAS_WRITE_CAPABILITY", map: SERVICE_AREAS_WRITE_CAPABILITY },
];

/** Slice `src` to just the body of `export async function <fnName>` through the next export. */
function sliceFunctionBody(src: string, fnName: string): string {
  const startRe = new RegExp(`export async function ${fnName}\\b`);
  const startMatch = startRe.exec(src);
  assert.ok(startMatch, `could not find export async function ${fnName}`);
  const start = startMatch.index;
  const rest = src.slice(start + startMatch[0].length);
  const nextExport = /\nexport async function /.exec(rest);
  const end = nextExport ? start + startMatch[0].length + nextExport.index : src.length;
  return src.slice(start, end);
}

for (const { file, mapName, map } of FILES) {
  const src = readSrc(file);

  test(`${file}: every writer names its capability; no bare guard left for a writer`, () => {
    for (const [fn, cap] of Object.entries(map)) {
      const body = sliceFunctionBody(src, fn);
      assert.match(
        body,
        new RegExp(`requireWorkspaceStaffAction\\(\\{ capability: ${mapName}\\.${fn} \\}\\)`),
        `${file}#${fn} must pass { capability: ${mapName}.${fn} } to the guard`,
      );
      assert.doesNotMatch(
        body,
        /\brequireWorkspaceStaffAction\(\s*\)/,
        `${file}#${fn} must not call requireWorkspaceStaffAction() bare (it is a writer)`,
      );
      assert.equal(map[fn], cap);
    }
  });
}

test("every file's capability map entries are declared CapabilityKey values (type-level; smoke-checked at runtime via roleGrantsCapability)", () => {
  for (const { map } of FILES) {
    for (const cap of Object.values(map)) {
      // roleGrantsCapability throws / returns false for an unknown key the same way — this just
      // proves every value round-trips through the real role table without throwing.
      assert.equal(typeof roleGrantsCapability("owner", cap), "boolean");
    }
  }
});

test("a viewer is refused every capability used across this area's writers; owner is always allowed", () => {
  const allCaps = new Set<CapabilityKey>(FILES.flatMap(({ map }) => Object.values(map)));
  assert.ok(allCaps.size > 0);
  for (const cap of allCaps) {
    assert.equal(roleGrantsCapability("viewer", cap), false, `viewer must not hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap), true, `owner should hold ${cap}`);
  }
});

test("agency.roster.edit (the content-edit capability): viewer refused, editor and up allowed", () => {
  const cap: CapabilityKey = "agency.roster.edit";
  const usedSomewhere = FILES.some(({ map }) => Object.values(map).includes(cap));
  assert.ok(usedSomewhere, "expected agency.roster.edit to be used by at least one writer in this area");
  const expected: Record<TenantRoleKey, boolean> = {
    viewer: false,
    editor: true,
    manager: true,
    admin: true,
    owner: true,
  };
  for (const role of TENANT_ROLE_KEYS) {
    assert.equal(roleGrantsCapability(role, cap), expected[role], `${role} x ${cap}`);
  }
});

test("agency.roster.invite (the claim-invite capability): viewer and editor refused, manager and up allowed", () => {
  const cap: CapabilityKey = "agency.roster.invite";
  const usedSomewhere = FILES.some(({ map }) => Object.values(map).includes(cap));
  assert.ok(usedSomewhere, "expected agency.roster.invite to be used by at least one writer in this area");
  const expected: Record<TenantRoleKey, boolean> = {
    viewer: false,
    editor: false,
    manager: true,
    admin: true,
    owner: true,
  };
  for (const role of TENANT_ROLE_KEYS) {
    assert.equal(roleGrantsCapability(role, cap), expected[role], `${role} x ${cap}`);
  }
});
