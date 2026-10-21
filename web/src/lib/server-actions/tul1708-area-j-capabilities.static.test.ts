import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { roleGrantsCapability } from "@/lib/access/roles";

/**
 * TUL-1708, area group J (imports, discounts, refunds & misc operations).
 *
 * Seven files called `requireWorkspaceStaffAction()` / `await staff()` with
 * NO capability — which defaults to `agency.workspace.view`, held by every
 * membership role including `viewer`. A viewer could therefore reach every
 * WRITE in these files the same way an owner could.
 *
 * Two of the seven (`site-admin/collections/actions.ts`,
 * `server-actions/runs-events.ts`) already named a capability on every
 * mutation before this sweep touched them — only their two READS stay on
 * the viewer default, which is correct. They are included below as a
 * regression guard so a future edit cannot quietly reintroduce a bare write
 * guard.
 *
 * This is a SELF-CONTAINED test file, not a new entry in
 * `capabilityless-staff-guard.*` — that ratchet + baseline ship with #4288,
 * which is not on `main` yet (see the Acceptance section in this PR's body).
 *
 * Capability choices (lowest correct existing tier, never invented):
 *   - menu-import/import-actions.ts        apply: agency.site_admin.sections.edit (editor+)
 *   - server-actions/roster-import.ts      enqueue: manage_talent_roster (manager+)
 *   - api/admin/roster-import/route.ts     POST: manage_talent_roster (manager+)
 *   - admin/orders/refund-actions.ts       refund: booking.payment.refund (admin+)
 *   - server-actions/retry-starter-prepare.ts retry: agency.site_admin.design.publish (admin+)
 */

const WEB_SRC = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

function read(relPath: string): string {
  return readFileSync(join(WEB_SRC, relPath), "utf8");
}

const importActions = read("lib/menu-import/import-actions.ts");
const rosterImport = read("lib/server-actions/roster-import.ts");
const rosterImportRoute = read("app/api/admin/roster-import/route.ts");
const refundActions = read("app/(workspace)/[tenantSlug]/admin/orders/refund-actions.ts");
const retryStarterPrepare = read("lib/server-actions/retry-starter-prepare.ts");
const collectionsActions = read("lib/site-admin/collections/actions.ts");
const runsEvents = read("lib/server-actions/runs-events.ts");

// ── role-matrix: viewer refused, the right tier allowed ──────────────────────

test("agency.site_admin.sections.edit (menu import apply) is editor and above, not viewer", () => {
  assert.equal(roleGrantsCapability("viewer", "agency.site_admin.sections.edit"), false);
  assert.equal(roleGrantsCapability("editor", "agency.site_admin.sections.edit"), true);
  assert.equal(roleGrantsCapability("manager", "agency.site_admin.sections.edit"), true);
});

test("manage_talent_roster (roster import) is manager and above, not viewer or editor", () => {
  assert.equal(roleGrantsCapability("viewer", "manage_talent_roster"), false);
  assert.equal(roleGrantsCapability("editor", "manage_talent_roster"), false);
  assert.equal(roleGrantsCapability("manager", "manage_talent_roster"), true);
  assert.equal(roleGrantsCapability("admin", "manage_talent_roster"), true);
});

test("booking.payment.refund (refund desk) is admin and above, not viewer, editor or manager", () => {
  assert.equal(roleGrantsCapability("viewer", "booking.payment.refund"), false);
  assert.equal(roleGrantsCapability("editor", "booking.payment.refund"), false);
  assert.equal(roleGrantsCapability("manager", "booking.payment.refund"), false);
  assert.equal(roleGrantsCapability("admin", "booking.payment.refund"), true);
  assert.equal(roleGrantsCapability("owner", "booking.payment.refund"), true);
});

test("agency.site_admin.design.publish (starter-prepare retry) is admin and above, not viewer, editor or manager", () => {
  assert.equal(roleGrantsCapability("viewer", "agency.site_admin.design.publish"), false);
  assert.equal(roleGrantsCapability("editor", "agency.site_admin.design.publish"), false);
  assert.equal(roleGrantsCapability("manager", "agency.site_admin.design.publish"), false);
  assert.equal(roleGrantsCapability("admin", "agency.site_admin.design.publish"), true);
});

test("agency.site_admin.pages.edit (collections, already correct) is editor and above, not viewer", () => {
  assert.equal(roleGrantsCapability("viewer", "agency.site_admin.pages.edit"), false);
  assert.equal(roleGrantsCapability("editor", "agency.site_admin.pages.edit"), true);
});

test("manage_billing (runs-events, already correct) is owner only", () => {
  assert.equal(roleGrantsCapability("admin", "manage_billing"), false);
  assert.equal(roleGrantsCapability("owner", "manage_billing"), true);
});

// ── static: no bare write guard left, every read keeps the viewer default ────

test("menu-import: preview reads with the default guard, apply names its capability", () => {
  assert.match(importActions, /APPLY_CAPABILITY: CapabilityKey = "agency\.site_admin\.sections\.edit"/);
  assert.match(importActions, /authorize\(tenantId, APPLY_CAPABILITY\)/);
  // previewMenuImport's call site passes no capability at all.
  const previewBody = importActions.slice(
    importActions.indexOf("export async function previewMenuImport"),
    importActions.indexOf("export async function applyParsedMenu"),
  );
  assert.match(previewBody, /await authorize\(tenantId\);/);
  assert.doesNotMatch(previewBody, /authorize\(tenantId, APPLY_CAPABILITY\)/);
});

test("roster-import: enqueue names manage_talent_roster, the list read keeps the default", () => {
  assert.match(rosterImport, /requireWorkspaceStaffAction\(\{ capability: "manage_talent_roster" \}\)/);
  const listBody = rosterImport.slice(rosterImport.indexOf("export async function listRosterImportJobs"));
  assert.match(listBody, /await requireWorkspaceStaffAction\(\);/);
});

test("roster-import API route: POST names manage_talent_roster", () => {
  assert.match(rosterImportRoute, /requireWorkspaceStaffAction\(\{ capability: "manage_talent_roster" \}\)/);
});

test("refund-actions: refundOrderAtDesk names booking.payment.refund in the guard itself, loadOrderLinesForDesk keeps the default", () => {
  assert.match(refundActions, /requireWorkspaceStaffAction\(\{ capability: "booking\.payment\.refund" \}\)/);
  // The old pattern checked `manage_billing` via a second userHasCapability call
  // AFTER a bare guard — that pattern, and the import it needed, are gone.
  assert.doesNotMatch(refundActions, /userHasCapability\("manage_billing"/);
  assert.doesNotMatch(refundActions, /from "@\/lib\/access"/);
  const readBody = refundActions.slice(
    refundActions.indexOf("export async function loadOrderLinesForDesk"),
    refundActions.indexOf("export async function refundOrderAtDesk"),
  );
  assert.match(readBody, /await requireWorkspaceStaffAction\(\);/);
});

test("retry-starter-prepare: the retry action names agency.site_admin.design.publish, the load read keeps the default", () => {
  assert.match(retryStarterPrepare, /requireWorkspaceStaffAction\(\{ capability: "agency\.site_admin\.design\.publish" \}\)/);
  const loadBody = retryStarterPrepare.slice(
    retryStarterPrepare.indexOf("export async function loadStarterPrepareStateAction"),
    retryStarterPrepare.indexOf("export async function retryStarterPrepareAction"),
  );
  assert.match(loadBody, /await requireWorkspaceStaffAction\(\);/);
});

test("REGRESSION GUARD: collections/actions.ts mutations still all name agency.site_admin.pages.edit", () => {
  const mutationNames = [
    "createCollectionAction",
    "updateCollectionAction",
    "deleteCollectionAction",
    "addCollectionItemAction",
    "updateCollectionItemAction",
    "deleteCollectionItemAction",
    "reorderCollectionItemsAction",
  ];
  for (const name of mutationNames) {
    const start = collectionsActions.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `missing export ${name}`);
    const nextExport = collectionsActions.indexOf("\nexport async function", start + 1);
    const body = collectionsActions.slice(start, nextExport < 0 ? undefined : nextExport);
    assert.match(
      body,
      /requireWorkspaceStaffAction\(\{\s*capability: "agency\.site_admin\.pages\.edit",?\s*\}\)/,
      `${name} must name agency.site_admin.pages.edit`,
    );
  }
  // The two reads keep the viewer default.
  for (const name of ["listCollectionsAction", "getCollectionAction"]) {
    const start = collectionsActions.indexOf(`export async function ${name}`);
    const nextExport = collectionsActions.indexOf("\nexport async function", start + 1);
    const body = collectionsActions.slice(start, nextExport < 0 ? undefined : nextExport);
    assert.match(body, /await requireWorkspaceStaffAction\(\);/);
  }
});

test("REGRESSION GUARD: runs-events.ts setRunsEvents still names manage_billing, getRunsEvents keeps the default", () => {
  const setBody = runsEvents.slice(runsEvents.indexOf("export async function setRunsEvents"));
  assert.match(setBody, /requireWorkspaceStaffAction\(\{ capability: CAPABILITY \}\)/);
  const getBody = runsEvents.slice(
    runsEvents.indexOf("export async function getRunsEvents"),
    runsEvents.indexOf("export async function setRunsEvents"),
  );
  assert.match(getBody, /await requireWorkspaceStaffAction\(\);/);
});

// ── Acceptance (from TUL-1708) ────────────────────────────────────────────
// - [x] Every WRITE across the 7 area-J files names its own capability.
// - [x] Reads keep the viewer default; role-matrix proves viewer is refused
//       on every write capability chosen above.
// - [ ] Fold this file's checks into `capabilityless-staff-guard.*` and remove
//       area-J's entries from its baseline once #4288 lands the ratchet on
//       main (this file stays as the standalone proof in the meantime).
