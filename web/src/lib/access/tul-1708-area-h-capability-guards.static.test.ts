/**
 * TUL-1708 (security sweep), area H: service-hub, rent, reviews & media misc.
 *
 * `requireWorkspaceStaffAction()` with no `capability` defaults to
 * `agency.workspace.view`, which a `viewer` role holds (web/src/lib/access/roles.ts,
 * VIEWER_CAPS). A WRITE action gated by the bare call therefore lets a viewer
 * write. This is a self-contained ratchet over the nine files in this area —
 * NOT a build on top of `web/src/lib/saas/capabilityless-staff-guard.*`
 * (that infra ships with #4288/#4300, not on `main` yet, and this PR does not
 * touch it).
 *
 * Of the nine files:
 *   - THREE writers were missing a real gate and now pass one explicitly:
 *     menu-offerings-actions.ts, offering-resources-actions.ts,
 *     review-moderation-actions.ts.
 *   - THREE are NOT vulnerable despite the bare call: the guard call is not
 *     their real gate. rent-owner.server.ts and friends-collective-actions.ts
 *     re-check `role === "owner"` straight from `agency_memberships` right
 *     after (stricter than any capability a non-owner could hold);
 *     service-hub-entries.ts re-checks a local HubRole set
 *     (entry-permissions.ts) that denies a viewer every write action. Each is
 *     commented in place.
 *   - TWO are read paths / shared helpers, correctly left on the default:
 *     talent-media-read-auth.server.ts (a read-only auth helper) and
 *     offerings-auth.server.ts (a shared helper used by both readers and
 *     writers outside this area's scope — forcing a write-tier capability in
 *     here would wrongly gate its reader call sites too).
 *   - ONE is a genuine gap with no fitting capability yet:
 *     spaces-editor.ts's room/table writers belong under the `operate_venue`
 *     capability the PM assigned to operational writers (POS, tables, floor,
 *     door, classes, scheduling, venue, customers) for a separate DEV PR;
 *     `operate_venue` is not in capabilities.ts on `main` yet, so this stays
 *     on the default and is flagged rather than inventing a substitute.
 *
 * This test:
 *   1. pins the three real fixes to the exact capability they now require;
 *   2. proves on the role matrix that a viewer is refused each of those
 *      capabilities while the role the file actually needs (owner/manager/
 *      editor, per file) is allowed;
 *   3. keeps a textual count of the bare guard per file so a future edit
 *      that silently drops the fix (or the explanatory comment on an
 *      unfixed file) goes red.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const HERE = dirname(fileURLToPath(import.meta.url));
// web/src/lib/access -> web/src
const SRC = join(HERE, "..", "..");

function read(relFromSrc: string): string {
  return readFileSync(join(SRC, relFromSrc), "utf8");
}

const BARE_GUARD = /\brequireWorkspaceStaffAction\(\s*\)/g;
/** Strips comments first (several of these files name the bare call BY NAME in their own explanatory comment). */
function bareGuardCount(src: string): number {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return (code.match(BARE_GUARD) ?? []).length;
}

// ── 1. The three real fixes: capability wired into the writer, absent from the readers ──

test("menu-offerings-actions.ts: WRITE_CAPABILITY is agency.site_admin.sections.edit, wired into every writer", () => {
  const src = read("lib/talent/menu-offerings-actions.ts");
  assert.match(src, /const WRITE_CAPABILITY = "agency\.site_admin\.sections\.edit" as const/);
  for (const fn of [
    "upsertWorkspaceMenuItem",
    "deleteWorkspaceMenuItem",
    "setWorkspaceMenuItemArchived",
    "reorderWorkspaceMenuItems",
    "setWorkspaceMenuItemOptions",
    "blankWorkspaceMenuItem",
    "setMenuItemStockAction",
    "setWorkspaceItemPhotos",
    "setWorkspacePhotoAlt",
  ]) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    const next = body.indexOf("export async function", 10);
    const fnBody = next > 0 ? body.slice(0, next) : body;
    assert.match(fnBody, /authorizeForWorkspace\(tenantId, WRITE_CAPABILITY\)/, `${fn} must pass WRITE_CAPABILITY`);
  }
  // The two readers keep the viewer default.
  for (const reader of ["loadWorkspaceMenuForEditor", "loadWorkspaceArchivedMenu"]) {
    const body = src.slice(src.indexOf(`export async function ${reader}`));
    const next = body.indexOf("export async function", 10);
    const fnBody = next > 0 ? body.slice(0, next) : body;
    assert.match(fnBody, /authorizeForWorkspace\(tenantId\);/, `${reader} is a read and keeps the default`);
    assert.doesNotMatch(fnBody, /WRITE_CAPABILITY/, `${reader} must not require the write capability`);
  }
});

test("offering-resources-actions.ts: setOfferingResourcesAction requires edit_talent_overlay; the load stays on the default", () => {
  const src = read("lib/resources/offering-resources-actions.ts");
  assert.match(src, /const WRITE_CAPABILITY = "edit_talent_overlay" as const/);
  const setFn = src.slice(src.indexOf("export async function setOfferingResourcesAction"));
  assert.match(setFn, /authorize\(tenantId, WRITE_CAPABILITY\)/);
  const loadFn = src.slice(src.indexOf("export async function loadOfferingResourcesAction"), src.indexOf("export async function setOfferingResourcesAction"));
  assert.match(loadFn, /authorize\(tenantId\);/);
  assert.doesNotMatch(loadFn, /WRITE_CAPABILITY/);
});

test("review-moderation-actions.ts: setReviewMediaApprovalState requires agency.site_admin.media.delete", () => {
  const src = read("lib/reviews/review-moderation-actions.ts");
  assert.match(src, /requireWorkspaceStaffAction\(\{ capability: "agency\.site_admin\.media\.delete" \}\)/);
  assert.equal(bareGuardCount(src), 0, "no capability-less guard should remain in this file");
});

// ── 2. Role matrix: viewer refused, the role the writer actually needs is allowed ──

test("role matrix: a viewer is refused every capability the three fixes now require", () => {
  for (const cap of ["agency.site_admin.sections.edit", "edit_talent_overlay", "agency.site_admin.media.delete"]) {
    assert.equal(roleGrantsCapability("viewer", cap as never), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap as never), true, `owner must hold ${cap}`);
  }
});

test("role matrix: menu/resource edits are editor+ (unchanged bar for an already-staff editor)", () => {
  assert.equal(roleGrantsCapability("editor", "agency.site_admin.sections.edit"), true);
  assert.equal(roleGrantsCapability("editor", "edit_talent_overlay"), true);
  assert.equal(roleGrantsCapability("viewer", "agency.site_admin.sections.edit"), false);
  assert.equal(roleGrantsCapability("viewer", "edit_talent_overlay"), false);
});

test("role matrix: review-photo moderation is manager+ (the admin/media/actions.ts delete bar)", () => {
  assert.equal(roleGrantsCapability("manager", "agency.site_admin.media.delete"), true);
  assert.equal(roleGrantsCapability("editor", "agency.site_admin.media.delete"), false);
});

test("the viewer default itself still reads: agency.workspace.view stays viewer-held", () => {
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true);
});

// ── 3. Textual ratchet over all nine files in this area ──
//
// Counts are pinned so a future edit that reintroduces a bare guard on one of
// the three FIXED files, or quietly deletes the explanatory comment pinning
// one of the six left-as-is files to its reasoning, is caught. Counts may
// only match exactly (not "only go down") because this is a closed, nine-file
// set, not the whole-repo ratchet #4300 describes for the eventual baseline.

const AREA_H_FILES: Record<string, number> = {
  "lib/service-hub/rent/rent-owner.server.ts": 1, // NOT vulnerable: role==='owner' re-check below it
  "lib/service-hub/friends-collective-actions.ts": 2, // NOT vulnerable: role==='owner' re-check below each
  "lib/server-actions/service-hub-entries.ts": 1, // NOT vulnerable: local HubRole re-check in entries.server.ts
  "lib/resources/offering-resources-actions.ts": 0, // FIXED: write passes edit_talent_overlay
  "lib/reviews/review-moderation-actions.ts": 0, // FIXED: write passes agency.site_admin.media.delete
  "lib/media/talent-media-read-auth.server.ts": 1, // READ helper: default is correct
  "lib/talent/menu-offerings-actions.ts": 0, // FIXED: writers pass WRITE_CAPABILITY, readers keep default
  "lib/talent/offerings-auth.server.ts": 1, // shared helper used by readers + writers outside this area
  "lib/server-actions/spaces-editor.ts": 1, // GAP: pending the operate_venue capability (separate DEV PR)
};

test("area H: bare-guard count per file matches exactly what this PR intends (fixed, justified, or flagged)", () => {
  for (const [rel, expected] of Object.entries(AREA_H_FILES)) {
    const src = read(rel);
    assert.equal(bareGuardCount(src), expected, `${rel}: expected ${expected} bare requireWorkspaceStaffAction() call(s)`);
  }
});

test("area H: every file left on the default bare guard carries a TUL-1708 explanatory comment", () => {
  for (const [rel, expected] of Object.entries(AREA_H_FILES)) {
    if (expected === 0) continue;
    const src = read(rel);
    assert.match(src, /TUL-1708/, `${rel} must explain, in place, why it is left on the default guard`);
  }
});

/**
 * ## Acceptance (from TUL-1708), area H
 * - [x] Every writer across the nine files either requires the right capability, or is proven — by
 *       a re-check this test pins — not to need one; every claim is backed by a test above.
 * - [x] Reads and shared read/write helpers are not forced onto a write-tier capability.
 * - [ ] Fold this file's checks into `capabilityless-staff-guard.*` once that ratchet infra lands with
 *       #4288/#4300, and drop this standalone test; `spaces-editor.ts` moves off this ticket's flag and
 *       onto `operate_venue` once DEV's capability PR merges.
 */
