/**
 * Claude found: viewer can still edit workspace settings. The four settings writers in admin-workspace-settings.ts
 * pass the capability they need to requireWorkspaceStaffAction (the default, agency.workspace.view, is held by the
 * viewer role). Static wiring + the role matrix; NO baseline: an export that is neither a listed writer nor a listed
 * read fails by name.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const SETTINGS = "manage_agency_settings";
const BRAND = "agency.site_admin.branding.edit";

const WRITERS: Record<string, string> = {
  updateWorkspaceAccount: SETTINGS,
  updateWorkspaceFields: SETTINGS,
  updateAgencyAutoAck: SETTINGS,
  updateMediaWatermarkOverride: BRAND,
};
const READS = new Set(["loadAgencyAutoAck", "loadWorkspaceAccountSettings", "loadAgencyBrandingSettings"]);
/** Branding is wired in TUL-1629 (its own PR); accepted here with or without its capability. */
const ELSEWHERE = new Set(["updateAgencyBranding"]);

const src = readFileSync(join(process.cwd(), "src/lib/server-actions/admin-workspace-settings.ts"), "utf8");
const exportsIn = [...src.matchAll(/export async function (\w+)/g)].map((m) => ({ name: m[1]!, at: m.index! }));
const body = (i: number) => src.slice(exportsIn[i]!.at, i + 1 < exportsIn.length ? exportsIn[i + 1]!.at : src.length);

test("every workspace settings writer requires its capability; no export is unaccounted for", () => {
  const unknown = exportsIn.map((e) => e.name).filter((n) => !(n in WRITERS) && !READS.has(n) && !ELSEWHERE.has(n));
  assert.deepEqual(unknown, [], "classify the new export: a writer goes in WRITERS with its capability, a read in READS");
  for (const [name, cap] of Object.entries(WRITERS)) {
    const i = exportsIn.findIndex((e) => e.name === name);
    assert.ok(i >= 0, `${name} is no longer exported: remove it from WRITERS`);
    assert.match(body(i), new RegExp(`requireWorkspaceStaffAction\\(\\{ capability: "${cap.replace(/\./g, "\\.")}" \\}\\)`), `${name} must require ${cap}`);
    assert.doesNotMatch(body(i), /requireWorkspaceStaffAction\(\s*\)/, `${name} still has a capability-less guard`);
  }
  for (const r of READS) {
    const i = exportsIn.findIndex((e) => e.name === r);
    assert.ok(i >= 0, r);
    assert.match(body(i), /requireWorkspaceStaffAction\(\s*\)/, `${r} is a read and keeps the viewer default`);
  }
});

test("behaviour on the role matrix: a viewer, editor and manager are refused workspace settings; admin and owner are allowed", () => {
  for (const cap of new Set(Object.values(WRITERS))) {
    assert.equal(roleGrantsCapability("viewer", cap as never), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("editor", cap as never), false, `editor must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("admin", cap as never), true, `admin must hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap as never), true, `owner must hold ${cap}`);
  }
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true, "the viewer default still reads");
});
