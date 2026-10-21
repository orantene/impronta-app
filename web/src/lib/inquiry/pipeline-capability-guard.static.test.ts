/**
 * pipeline-capability-guard.static.test.ts — TUL-1708 (area C: inquiries,
 * pipeline & call sheets).
 *
 * Source-level "no bare guard left" check. `requireWorkspaceStaffAction()` /
 * a local `staff()` alias with NO capability argument defaults to
 * `agency.workspace.view` (viewer-held) — the bug this sweep fixes. This
 * pins every WRITE call site in the 9 files this ticket covers to a capability
 * from `PIPELINE_WRITE_CAPABILITY`, and separately pins the small, named set
 * of READ call sites that are allowed to stay on the bare default.
 *
 * Acceptance (from TUL-1708): "no capability-less guard left in the file"
 * (static test) + role-matrix test (pipeline-write-capabilities.test.ts).
 *
 * NOTE: there is no `capabilityless-staff-guard.baseline.json` /
 * `.static.test.ts` on main yet (that machinery ships with #4288, the
 * messaging-engine PR this sweep mirrors). When #4288 merges, add these 9
 * files' entries to that baseline's REMOVAL list — see the unticked
 * acceptance line in this PR's description.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// This file lives at web/src/lib/inquiry/ — three levels up is the `web/` root.
const WEB_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const src = (p: string) => readFileSync(join(WEB_ROOT, p), "utf8");

// A bare guard call has EMPTY parens — any capability argument makes the
// call non-bare, so matching literal `()` is sufficient (no lookahead needed).
const BARE_GUARD_RE = /\bawait (?:requireWorkspaceStaffAction|staff)\(\)/g;

/**
 * Each file's expected count of bare (capability-less) guard calls that MUST
 * remain — these are the READS, which keep the `agency.workspace.view`
 * default on purpose. Every other call in the file must carry an explicit
 * `{ capability: ... }`.
 */
const EXPECTED_BARE_READS: Record<string, number> = {
  "src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts": 3, // loadAgencySettingsNamespace, loadWorkspaceCoordinatorCandidates, loadCoordinatorAssignCandidates
  "src/lib/server-actions/admin-inquiries.ts": 0,
  "src/app/(workspace)/[tenantSlug]/admin/_pipeline-attachment-actions.ts": 0,
  "src/lib/server-actions/admin-inquiry-roster.ts": 0,
  "src/lib/server-actions/inquiry-attachment-signed.ts": 0,
  "src/lib/server-actions/inquiry-message-edit.ts": 0,
  "src/lib/server-actions/admin-call-sheet.ts": 0,
  "src/lib/call-sheet/actions.ts": 0,
  "src/lib/server-actions/reservation-propose.ts": 0,
};

for (const [relPath, expectedBare] of Object.entries(EXPECTED_BARE_READS)) {
  test(`${relPath}: exactly ${expectedBare} bare (capability-less) guard call(s) remain, all other writers pass a capability`, () => {
    const code = src(relPath);
    const bareMatches = code.match(BARE_GUARD_RE) ?? [];
    assert.equal(
      bareMatches.length,
      expectedBare,
      `expected ${expectedBare} bare guard call(s) in ${relPath}, found ${bareMatches.length}`,
    );
  });

  test(`${relPath}: every non-bare guard call references PIPELINE_WRITE_CAPABILITY (no inline/ad-hoc capability string)`, () => {
    const code = src(relPath);
    const withCapability = code.match(/(?:requireWorkspaceStaffAction|staff)\(\s*\{\s*capability:\s*([^}]+)\}\s*\)/g) ?? [];
    for (const call of withCapability) {
      // patchAgencySettingsNamespace is the one deliberate exception: it
      // gates PER NAMESPACE via PATCH_AGENCY_SETTINGS_NAMESPACE_CAPABILITY
      // (a sibling lookup map in the same module, keyed by namespace) rather
      // than a single flat WRITE_CAP.<action> — see pipeline-write-capabilities.ts.
      if (/PATCH_AGENCY_SETTINGS_NAMESPACE_CAPABILITY\[/.test(call)) continue;
      assert.match(
        call,
        /WRITE_CAP\.\w+/,
        `${relPath}: "${call}" must source its capability from the WRITE_CAP map, not an inline literal`,
      );
    }
  });
}

test("every file that references WRITE_CAP imports it from the shared pipeline-write-capabilities map", () => {
  for (const relPath of Object.keys(EXPECTED_BARE_READS)) {
    const code = src(relPath);
    if (!/WRITE_CAP\./.test(code)) continue;
    assert.match(
      code,
      /import \{ PIPELINE_WRITE_CAPABILITY as WRITE_CAP \} from "@\/lib\/inquiry\/pipeline-write-capabilities"/,
      `${relPath}: must import the shared capability map`,
    );
  }
});

/**
 * TUL-1708 P1: `requireInquiryManagerAction(inquiryId)` is a DIFFERENT guard
 * from `requireWorkspaceStaffAction` — it admits workspace staff OR the
 * appointed inquiry coordinator. Its staff fast-path used to call
 * `requireWorkspaceStaffAction()` with NO capability, so a viewer passed
 * every write gated behind it (offers, bookings, payouts, coordinator
 * assignment…). This is the P1 security fix: every WRITE call now passes
 * `{ capability: WRITE_CAP.<action> }` as a SECOND argument. A bare call
 * (single argument, no capability) is only allowed for the named READS
 * below — this list must shrink to exactly these as the only exemptions,
 * so a future bare `requireInquiryManagerAction(inquiryId)` call on a NEW
 * writer fails this test instead of shipping another viewer-passable write.
 */
const BARE_MANAGER_GUARD_RE = /\bawait requireInquiryManagerAction\([^,()]*\)/g;

const EXPECTED_BARE_MANAGER_READS: Record<string, number> = {
  // loadInquiryPaymentState, loadEditableJobFields, loadInquiryLineup,
  // loadOfferDraft, loadInquiryPayoutReceiverCandidates,
  // loadSecondaryCoordinators, loadBookingCommissionSnapshotAction.
  "src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts": 7,
  "src/lib/server-actions/admin-inquiries.ts": 0,
  // loadInquiryAttachments.
  "src/app/(workspace)/[tenantSlug]/admin/_pipeline-attachment-actions.ts": 1,
  "src/lib/server-actions/admin-inquiry-roster.ts": 0,
  "src/lib/server-actions/inquiry-attachment-signed.ts": 0,
  "src/lib/server-actions/inquiry-message-edit.ts": 0,
  "src/lib/server-actions/admin-call-sheet.ts": 0,
  "src/lib/call-sheet/actions.ts": 0,
  "src/lib/server-actions/reservation-propose.ts": 0,
};

for (const [relPath, expectedBare] of Object.entries(EXPECTED_BARE_MANAGER_READS)) {
  test(`${relPath}: exactly ${expectedBare} bare requireInquiryManagerAction() read(s) remain, every writer passes a capability`, () => {
    const code = src(relPath);
    const bareMatches = code.match(BARE_MANAGER_GUARD_RE) ?? [];
    assert.equal(
      bareMatches.length,
      expectedBare,
      `expected ${expectedBare} bare requireInquiryManagerAction(inquiryId) call(s) in ${relPath}, found ${bareMatches.length}. ` +
        `A new write behind this guard MUST pass { capability: WRITE_CAP.<action> } as a second argument.`,
    );
  });

  test(`${relPath}: every requireInquiryManagerAction call with a capability sources it from WRITE_CAP`, () => {
    const code = src(relPath);
    const withCapability = code.match(/requireInquiryManagerAction\([^,()]*,\s*\{\s*capability:\s*([^}]+)\}\s*\)/g) ?? [];
    for (const call of withCapability) {
      assert.match(
        call,
        /WRITE_CAP\.\w+/,
        `${relPath}: "${call}" must source its capability from the WRITE_CAP map, not an inline literal`,
      );
    }
  });
}
