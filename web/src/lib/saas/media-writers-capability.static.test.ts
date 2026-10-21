/**
 * Claude found: viewer can still edit media. Every media WRITER in admin/media/actions.ts passes the capability it
 * needs to requireWorkspaceStaffAction (the default, agency.workspace.view, is held by the viewer role). Static
 * wiring + the role matrix; NO baseline: an export that is neither a listed writer nor a listed read fails by name.
 * (This file lives outside the [tenantSlug] path on purpose: Node 22 skips [bracketed] test paths.)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const UP = "agency.site_admin.media.upload";
const BRAND = "agency.site_admin.branding.edit";

const WRITERS: Record<string, string> = {
  actionUploadAndAssignMedia: UP,
  actionAssignMediaToTalent: UP,
  actionSetApprovalState: UP,
  actionReassignMediaToTalent: UP,
  actionSetAsCardPhoto: UP,
  actionSetAsHeroPhoto: UP,
  actionRevertCropToSource: UP,
  actionReorderMediaAssets: UP,
  actionUploadToStagingStorage: UP,
  actionCleanupStagedObjects: UP,
  actionBulkAssignStagedMedia: UP,
  actionImportSingleDriveFile: UP,
  actionImportFromGoogleDrive: UP,
  actionCreateSignedUploadUrl: UP,
  actionCreateStagingSignedUploadUrl: UP,
  actionRegisterUploadedAsset: UP,
  actionRegisterStagedAsset: UP,
  actionSetMediaWatermarkOverride: BRAND,
};

/** Reads (a viewer may read the library) and exports guarded by other means (talent self / document guards). */
const READS_OR_OTHER_GUARD = new Set([
  "actionLoadRosterTalents",
  "actionGetMediaCount",
  "actionListDriveFolder",
  "actionUploadTalentDocument",
  "actionCreateDocumentSignedUploadUrl",
  "actionFinalizeDocumentUpload",
  "actionGetTalentDocumentSignedUrl",
  "actionDeleteTalentDocument",
  "actionLoadTalentGallery",
  "actionLoadTalentMediaBundle",
  "actionLoadTalentMediaBundleAll",
]);
/** Media delete is wired in TUL-1629 (its own PR); accepted here with or without its capability. */
const ELSEWHERE = new Set(["actionDeleteMediaAssets"]);

const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/media/actions.ts"), "utf8");
const exportsIn = [...src.matchAll(/export async function (\w+)/g)].map((m) => ({ name: m[1]!, at: m.index! }));
const body = (i: number) => src.slice(exportsIn[i]!.at, i + 1 < exportsIn.length ? exportsIn[i + 1]!.at : src.length);

test("every media writer requires its capability; no export is unaccounted for", () => {
  const unknown = exportsIn.map((e) => e.name).filter((n) => !(n in WRITERS) && !READS_OR_OTHER_GUARD.has(n) && !ELSEWHERE.has(n));
  assert.deepEqual(unknown, [], "classify the new export: a writer goes in WRITERS with its capability, a read in READS_OR_OTHER_GUARD");
  for (const [name, cap] of Object.entries(WRITERS)) {
    const i = exportsIn.findIndex((e) => e.name === name);
    assert.ok(i >= 0, `${name} is no longer exported: remove it from WRITERS`);
    assert.match(body(i), new RegExp(`requireWorkspaceStaffAction\\(\\{ capability: "${cap.replace(/\./g, "\\.")}" \\}\\)`), `${name} must require ${cap}`);
    assert.doesNotMatch(body(i), /requireWorkspaceStaffAction\(\s*\)/, `${name} still has a capability-less guard`);
  }
});

test("behaviour on the role matrix: a viewer is refused what the media writers require; editor uploads, admin brands", () => {
  for (const cap of new Set(Object.values(WRITERS))) {
    assert.equal(roleGrantsCapability("viewer", cap as never), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap as never), true, `owner must hold ${cap}`);
  }
  assert.equal(roleGrantsCapability("editor", UP as never), true);
  assert.equal(roleGrantsCapability("editor", BRAND as never), false);
  assert.equal(roleGrantsCapability("admin", BRAND as never), true);
});
