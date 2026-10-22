/**
 * TUL-1368: approving a join application sends the workspace's terms, so the talent's terms card
 * appears after ANY join (new row, reactivated removed row, repair). Build 6 sent nothing here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { applicationsCopy } from "@/components/admin/applications/applications-copy";
import { pruneLateSlices } from "@/components/admin/shell/internal/bridge-slices";
import type { JoinTermsInput, JoinTermsOutcome } from "@/lib/service-hub/join-terms";
import type { WorkModel } from "@/lib/service-hub/terms";

import { proposeDefaultTermsAfterApprove, type ProposeAfterApproveDeps } from "./propose-terms-after-approve";

type Call = { tenantId: string; talentProfileId: string; input: JoinTermsInput; defaultModel: WorkModel };

function makeDeps(over: { pending?: boolean; canPropose?: boolean; outcome?: JoinTermsOutcome; throws?: boolean } = {}) {
  const calls: Call[] = [];
  const deps: ProposeAfterApproveDeps = {
    hasPendingTerms: async () => {
      if (over.throws) throw new Error("boom");
      return over.pending === true;
    },
    loadContext: async () => ({ defaultModel: "coordinator_agency", canPropose: over.canPropose !== false, workspaceCurrency: "MXN" }),
    propose: async (c) => {
      calls.push(c);
      return over.outcome ?? "sent";
    },
  };
  return { deps, calls };
}

const args = { tenantId: "t1", talentProfileId: "p1", userId: "u1", rosterAdded: true };

test("a join (new, reactivated or repaired roster row) sends the workspace default terms", async () => {
  const { deps, calls } = makeDeps();
  assert.equal(await proposeDefaultTermsAfterApprove(args, deps), "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.send, true);
  assert.equal(calls[0].tenantId, "t1");
  assert.equal(calls[0].talentProfileId, "p1");
});

test("no terms when the talent was already active (nothing joined)", async () => {
  const { deps, calls } = makeDeps();
  assert.equal(await proposeDefaultTermsAfterApprove({ ...args, rosterAdded: false }, deps), "skipped");
  assert.equal(calls.length, 0);
});

test("a pending version already waiting is not stacked (double click, repair)", async () => {
  const { deps, calls } = makeDeps({ pending: true });
  assert.equal(await proposeDefaultTermsAfterApprove(args, deps), "skipped");
  assert.equal(calls.length, 0);
});

test("a manager may approve but cannot propose terms; the outcome says so", async () => {
  const { deps, calls } = makeDeps({ canPropose: false });
  assert.equal(await proposeDefaultTermsAfterApprove(args, deps), "not_allowed");
  assert.equal(calls.length, 0);
});

test("a terms failure never throws into the approve", async () => {
  const { deps } = makeDeps({ throws: true });
  assert.equal(await proposeDefaultTermsAfterApprove(args, deps), "failed");
});

test("decideTalentApplication wires the terms step after the roster write and revalidates the roster", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent/apply-actions.ts"), "utf8");
  const decide = src.slice(src.indexOf("export async function decideTalentApplication"), src.indexOf("export async function withdrawOwnApplication"));
  assert.match(decide, /proposeDefaultTermsAfterApprove\(/);
  assert.match(decide, /rosterAdded: outcome\.rosterAdded/);
  assert.match(decide, /revalidatePath\("\/\[tenantSlug\]\/admin\/roster", "page"\)/);
});

test("a server refresh drops stale late slices the new bridge carries, keeps the ones it leaves out", () => {
  const late = { roster: [{ id: "old" }], clients: [{ id: "c" }] };
  const next = pruneLateSlices(late, { roster: [{ id: "new" }], clients: null });
  assert.equal("roster" in next, false);
  assert.deepEqual(next.clients, [{ id: "c" }]);
});

test("Roster · Applications copy: every string exists in en and es, es differs, no em dashes", () => {
  const en = applicationsCopy("en");
  const es = applicationsCopy("es");
  const flat = (c: ReturnType<typeof applicationsCopy>): string[] => [
    c.title, c.intro, ...Object.values(c.status), c.acceptTitle, c.acceptOn, c.acceptOff,
    c.approvedToast("X"), c.rejectedToast("X"), c.openRoster, c.goToRoster, c.addToRoster, c.emptyClosed,
    c.emptyOpen, c.pendingHeading, c.noPending, c.decidedHeading, c.dialogTitle("approved", "X"),
    c.dialogTitle("rejected", "X"), c.approveBody, c.notePlaceholder, c.cancel, c.saving, c.approve,
    c.reject, c.decisionNote, c.submitted, c.decided,
  ];
  const a = flat(en);
  const b = flat(es);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.ok(a[i].length > 0 && b[i].length > 0);
    assert.doesNotMatch(a[i] + b[i], /—/);
  }
  for (const k of ["title", "intro", "acceptTitle", "emptyClosed", "pendingHeading", "decidedHeading", "cancel", "approve", "reject"] as const) {
    assert.notEqual(en[k], es[k]);
  }
});
