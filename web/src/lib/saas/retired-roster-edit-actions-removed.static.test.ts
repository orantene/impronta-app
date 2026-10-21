/**
 * TUL-1269: the retired roster editor (admin/roster/[id]/TalentEditForm.tsx) was
 * dead UI, but its "use server" actions stayed directly callable by action id.
 * updateRosterTalentProfile wrote phone / date_of_birth unconditionally. All
 * three actions and the form were removed; this pins them gone so a revert or a
 * copy-paste cannot quietly bring a second, ungated write path back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const SELF = fileURLToPath(import.meta.url);

const REMOVED_ACTIONS = ["updateRosterTalentProfile", "registerRosterTalentPhoto", "updateRosterTalentWorkflow"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(full);
  }
  return out;
}

test("the retired roster editor's server actions are not defined or exported anywhere under src", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    if (file === SELF) continue;
    const text = readFileSync(file, "utf8");
    for (const name of REMOVED_ACTIONS) {
      const definition = new RegExp(`(function|const|let|var)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`);
      if (definition.test(text)) offenders.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [], "a removed roster-edit server action is defined again");
});

test("TalentEditForm.tsx stays deleted", () => {
  const form = join(SRC, "app", "(workspace)", "[tenantSlug]", "admin", "roster", "[id]", "TalentEditForm.tsx");
  assert.equal(existsSync(form), false);
});
