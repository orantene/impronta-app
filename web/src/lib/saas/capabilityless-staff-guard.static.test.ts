/**
 * TUL-1629: a `viewer` workspace member holds `agency.workspace.view`, which is what
 * `requireWorkspaceStaffAction()` checks when no capability is passed. So a WRITER that calls it without a
 * capability lets a viewer write. This ratchet:
 *  - fails when any file gains a capability-less staff guard (counts may only go DOWN), or a new file adds one;
 *  - pins the writers fixed in TUL-1629 to zero;
 *  - proves, on the role matrix, that a viewer is refused every capability those writers now require while an
 *    owner (and a manager) is allowed.
 * To lower a count: pass the capability the writer needs, then run the file's number down in the baseline.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";
import { MESSAGING_WRITE_CAPABILITY } from "@/lib/messaging/write-capabilities";

import baseline from "./capabilityless-staff-guard.baseline.json";

// `await staff()` is the local alias several modules give the same guard (messaging-engine, pos, venue...).
const GUARD = /\brequireWorkspaceStaffAction\(\s*\)|\bmessagingStaff\(\s*\)|\bawait staff\(\s*\)/g;

function files(): string[] {
  const out = execFileSync("git", ["ls-files", "src"], { cwd: process.cwd(), encoding: "utf8" });
  return out.split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
}
function counts(): Record<string, number> {
  const found: Record<string, number> = {};
  for (const f of files()) {
    const src = readFileSync(join(process.cwd(), f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const n = (src.match(GUARD) ?? []).length;
    if (n > 0) found[f] = n;
  }
  return found;
}

test("no file gains a capability-less staff guard (counts only go down)", () => {
  const found = counts();
  const grew = Object.entries(found).filter(([f, n]) => n > ((baseline.counts as Record<string, number>)[f] ?? 0));
  assert.deepEqual(grew, [], "a writer must pass the capability it needs: requireWorkspaceStaffAction({ capability })");
});

test("the baseline has no stale entries (a fixed file is removed from it)", () => {
  const found = counts();
  const stale = Object.entries(baseline.counts as Record<string, number>).filter(([f, n]) => (found[f] ?? 0) < n);
  assert.deepEqual(stale, [], "lower or remove these baseline entries: the guard count dropped");
});

test("the writers fixed in TUL-1629 have no capability-less guard left", () => {
  const found = counts();
  for (const f of [
    "src/lib/server-actions/messaging-engine.ts",
    "src/lib/server-actions/messaging-offers.ts",
    "src/app/(workspace)/[tenantSlug]/admin/media/actions.ts",
    "src/lib/server-actions/admin-workspace-settings.ts",
    "src/lib/talent/menu-offerings-actions.ts",
  ]) {
    // media/actions.ts and admin-workspace-settings.ts still have other (baselined) read/edit guards; the specific writers are pinned below
    if (f.endsWith("messaging-offers.ts") || f.endsWith("menu-offerings-actions.ts")) assert.equal(found[f] ?? 0, 0, f);
  }
  const media = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/media/actions.ts"), "utf8");
  const del = media.slice(media.indexOf("export async function actionDeleteMediaAssets"));
  assert.match(del.slice(0, 600), /requireWorkspaceStaffAction\(\{ capability: "agency\.site_admin\.media\.delete" \}\)/);
  const settings = readFileSync(join(process.cwd(), "src/lib/server-actions/admin-workspace-settings.ts"), "utf8");
  const brand = settings.slice(settings.indexOf("export async function updateAgencyBranding"));
  assert.match(brand.slice(0, 600), /requireWorkspaceStaffAction\(\{ capability: "edit_branding" \}\)/);
});

test("every Messages writer passes its capability from the one map; reads pass none", () => {
  const engine = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-engine.ts"), "utf8");
  for (const [action, fn] of [
    ["reply", "messagingReply"], ["internalNote", "messagingInternalNote"], ["rename", "messagingRename"], ["merge", "messagingMerge"],
    ["assignOwner", "messagingAssignOwner"], ["handOver", "messagingHandOver"], ["linkRecord", "messagingLinkRecord"],
    ["unlinkRecord", "messagingUnlinkRecord"], ["closeLost", "messagingCloseLost"], ["scheduleReminder", "messagingScheduleReminder"],
    ["cancelReminder", "messagingCancelReminder"], ["sendOptions", "messagingSendOptions"], ["requestPayment", "messagingRequestPayment"],
    ["sendOffer", "messagingSendOffer"], ["ensureSharedDraft", "messagingEnsureSharedDraft"],
  ] as const) {
    const body = engine.slice(engine.indexOf(`export async function ${fn}`));
    const next = body.indexOf("export async function", 10);
    const fnBody = next > 0 ? body.slice(0, next) : body;
    assert.match(fnBody, new RegExp(`WRITE_CAP\\.${action}\\b`), `${fn} must require MESSAGING_WRITE_CAPABILITY.${action}`);
  }
  for (const reader of ["messagingLoadInbox", "messagingLoadThread", "messagingLoadEssentials", "messagingSearch"]) {
    const body = engine.slice(engine.indexOf(`export async function ${reader}`));
    const next = body.indexOf("export async function", 10);
    assert.doesNotMatch(next > 0 ? body.slice(0, next) : body, /WRITE_CAP\./, `${reader} is a read and keeps the viewer default`);
  }
  const offers = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-offers.ts"), "utf8");
  for (const fn of ["messagingCreateOffer", "messagingUpdateOfferDraft", "messagingReopenOfferForAmendment", "messagingCounterOffer", "messagingSeedOfferFromShared"]) {
    const body = offers.slice(offers.indexOf(`export async function ${fn}`));
    const next = body.indexOf("export async function", 10);
    assert.match(next > 0 ? body.slice(0, next) : body, /WRITE_CAP\.offerDraft/, fn);
  }
});

// Every exported Messages function that still calls the guard with NO capability must be a READ. A writer that does
// (messagingRecoverSnapshot was one) fails here by name. Adding a new reader means adding it to this list on purpose.
const ENGINE_READS = [
  "loadConversationHistory",
  "messagingLoadEssentials",
  "messagingLoadInbox",
  "messagingLoadThread",
  "messagingRelinkImpact",
  "messagingResolveOrderThread",
  "messagingSearch",
];

test("messaging-engine: the only functions left on the capability-less guard are the known reads", () => {
  const engine = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-engine.ts"), "utf8");
  const bare: string[] = [];
  const re = /export async function (\w+)/g;
  const starts = [...engine.matchAll(re)].map((m) => ({ name: m[1]!, at: m.index! }));
  starts.forEach((st, i) => {
    const body = engine.slice(st.at, i + 1 < starts.length ? starts[i + 1]!.at : engine.length);
    if (/await staff\(\s*\)/.test(body)) bare.push(st.name);
  });
  assert.deepEqual(bare.sort(), [...ENGINE_READS].sort(), "a writer is on the viewer default: pass WRITE_CAP.<action> (see write-capabilities.ts)");
  const recover = engine.slice(engine.indexOf("export async function messagingRecoverSnapshot"), engine.indexOf("export async function messagingSendOffer"));
  assert.match(recover, /staff\(WRITE_CAP\.recoverSnapshot\)/);
  assert.equal(MESSAGING_WRITE_CAPABILITY.recoverSnapshot, "coordinate_inquiry");
});

test("behaviour on the role matrix: a viewer is refused every capability these writers require; owner and manager are allowed", () => {
  const required = new Set<string>([
    ...Object.values(MESSAGING_WRITE_CAPABILITY),
    "agency.site_admin.media.delete",
    "edit_branding",
    "agency.site_admin.sections.edit",
  ]);
  for (const cap of required) {
    assert.equal(roleGrantsCapability("viewer", cap as never), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap as never), true, `owner must hold ${cap}`);
  }
  // Messages / media delete are manager+; branding is admin+; menu edits are editor+.
  for (const cap of [...Object.values(MESSAGING_WRITE_CAPABILITY), "agency.site_admin.media.delete"]) {
    assert.equal(roleGrantsCapability("manager", cap as never), true, `manager must hold ${cap}`);
  }
  assert.equal(roleGrantsCapability("admin", "edit_branding"), true);
  assert.equal(roleGrantsCapability("editor", "agency.site_admin.sections.edit"), true);
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true, "the viewer default still reads");
});
