import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Provisioning must read the brief, and must do it BEFORE the scaffold runs.
 *
 * The intake fetches someone's page, extracts facts, scores them and stores
 * them with their source URL — and provisioning read one string off the lead
 * row and walked past the rest. The facts were never missing; nothing looked.
 *
 * These are source assertions rather than a live provisioning run: the function
 * creates a workspace, a membership and a profile patch against the service
 * role, and there is no fixture for that short of provisioning a real tenant.
 * What CAN be pinned without one is the wiring and the ORDER, which is the part
 * that was wrong and the part that silently stays wrong.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");
const signup = readFileSync(join(SRC, "lib/saas/workspace-signup.server.ts"), "utf8");

test("provisioning looks the brief up and stamps the tenant on it", () => {
  assert.match(signup, /loadBriefForSignupLead\(/, "provisioning never reads the brief");
  assert.match(signup, /linkBriefObjects\(/, "the brief is never linked to the workspace");
  assert.match(
    signup,
    /linkBriefObjects\([\s\S]{0,80}tenantId:/,
    "the brief is looked up but the tenant is not stamped, so a workspace cannot find its own brief",
  );
});

test("the stamp happens BEFORE the scaffold, not after", () => {
  // `ensureWorkspaceScaffold` seeds navigation and homepage copy once from
  // settings and never re-derives them. A fact that lands afterwards produces a
  // workspace whose settings and whose visible page disagree permanently.
  const read = signup.indexOf("loadBriefForSignupLead(");
  const scaffold = signup.lastIndexOf("await ensureWorkspaceScaffold({");
  assert.ok(read > 0 && scaffold > 0, "one of the two calls is missing");
  assert.ok(
    read < scaffold,
    "the brief is linked AFTER the scaffold seeds the site, so the facts arrive too late to shape it",
  );
});

test("a missing brief does not take the signup down", () => {
  // Most signups have no brief at all — the short form creates none. Provisioning
  // must treat that as ordinary, not as an error, or adding this reader would
  // break every signup that does not use the conversational intake.
  assert.match(
    signup,
    /const brief = await loadBriefForSignupLead\([\s\S]{0,40}\n\s*if \(brief\) \{/,
    "the brief must be optional: no brief is the common case, not a failure",
  );
});

test("the lookup is not owner-scoped, and that is deliberate", () => {
  // Every other brief read is owner-scoped because a brief id must never be
  // enough to read a brief. This one is addressed by the signup lead, which the
  // provisioner already holds — there is no guessable id in the signature.
  const store = readFileSync(join(SRC, "lib/tulala/brief-store.server.ts"), "utf8");
  const fn = store.slice(store.indexOf("export async function loadBriefForSignupLead"));
  assert.match(fn.slice(0, 900), /eq\("signup_lead_id", signupLeadId\)/);
  assert.doesNotMatch(fn.slice(0, 900), /BriefOwner/, "it must not take an owner it cannot have");
});
