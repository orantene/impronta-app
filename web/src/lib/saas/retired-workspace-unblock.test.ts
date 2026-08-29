/**
 * REGRESSION — a soft-deleted workspace blocked its owner forever and burned
 * its slug.
 *
 * `actionDeleteTenant` is a SOFT delete: it only sets
 * `agencies.status = 'cancelled'`. Two readers never asked about that column:
 *
 *   1. `listOwnedFreeWorkspaces` filtered on the MEMBERSHIP row's status and on
 *      `plan_tier`, so a cancelled workspace kept occupying its owner's single
 *      Free slot and `findFreeWorkspaceLimitBlocker` refused them a new one,
 *      permanently, with no self-serve way out.
 *   2. `isRequestedLinkTaken` matched `agencies.slug` with no status filter, so
 *      the name was burned for everyone including its own owner.
 *
 * Both are I/O against a service-role client the caller cannot inject, so the
 * predicate is tested directly and the WIRING is pinned against the sources.
 * That split is deliberate: the bug was never in a predicate, it was in which
 * columns the queries asked for.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  RETIRED_WORKSPACE_STATUSES,
  isRetiredWorkspaceStatus,
  retiredWorkspaceSlugTombstone,
} from "./workspace-lifecycle";

const SRC = path.join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

/** Every value the CHECK constraint on `agencies.status` allows. */
const ALL_AGENCY_STATUSES = [
  "draft",
  "onboarding",
  "trial",
  "active",
  "past_due",
  "restricted",
  "suspended",
  "cancelled",
  "archived",
] as const;

// ── the predicate ──────────────────────────────────────────────────────────

test("exactly two of the nine agency statuses are terminal", () => {
  const retired = ALL_AGENCY_STATUSES.filter(isRetiredWorkspaceStatus);
  assert.deepEqual(retired, ["cancelled", "archived"]);
  assert.deepEqual([...RETIRED_WORKSPACE_STATUSES], ["cancelled", "archived"]);
});

test("suspended is NOT terminal", () => {
  // Suspension is reversible from platform admin, so a suspended Free workspace
  // must keep occupying the owner's slot and keep holding its slug. Widening
  // the predicate to "not active" would hand a live tenant's name away.
  assert.equal(isRetiredWorkspaceStatus("suspended"), false);
  assert.equal(isRetiredWorkspaceStatus("past_due"), false);
  assert.equal(isRetiredWorkspaceStatus("restricted"), false);
});

test("an unknown, empty, or non-string status reads as still alive", () => {
  for (const value of [null, undefined, "", "  ", "something_new", 7, {}]) {
    assert.equal(isRetiredWorkspaceStatus(value), false, String(value));
  }
});

test("the tombstone keeps the name readable and stays slug-shaped", () => {
  const tombstone = retiredWorkspaceSlugTombstone("luna-studio", "a1b2c3");
  assert.ok(tombstone.startsWith("luna-studio-x"));
  assert.notEqual(tombstone, "luna-studio");
  for (const base of ["luna", "a".repeat(60), "trailing-dash-"]) {
    const out = retiredWorkspaceSlugTombstone(base, "a1b2c3");
    assert.ok(out.length <= 32, `${out} is ${out.length} chars`);
    assert.match(out, /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/, out);
  }
});

// ── the wiring ─────────────────────────────────────────────────────────────

test("the one-free-workspace read asks for the agency's status and skips retired ones", () => {
  const source = read("lib/saas/owned-free-workspace.ts");
  assert.match(
    source,
    /agencies:tenant_id \([^)]*\bstatus\b[^)]*\)/,
    "the joined agencies select must include `status` or the filter below reads undefined",
  );
  assert.match(
    source,
    /if \(isRetiredWorkspaceStatus\(agency\.status\)\) continue;/,
    "a cancelled workspace must not consume the owner's single Free slot",
  );
});

test("the /get-started slug check asks for the agency's status", () => {
  const source = read("app/(marketing)/get-started/actions.ts");
  assert.match(
    source,
    /\.from\("agencies"\)\.select\("id, status"\)\.eq\("slug", slug\)/,
    "the slug-taken read must select status",
  );
  assert.match(
    source,
    /const taken = Boolean\(existingDomain\) \|\| slugHeldByLiveWorkspace;/,
    "only a LIVE workspace may make a link report as taken",
  );
});

test("the provisioner can actually deliver a name the form called available", () => {
  // `agencies.slug` is UNIQUE and the delete is soft, so the retired row still
  // physically holds the name. Without the reclaim the funnel would promise
  // `luna` and silently provision `luna-2` — a worse bug than the one fixed.
  const source = read("lib/saas/workspace-signup-slug.server.ts");
  assert.match(source, /retiredWorkspaceSlugTombstone\(/);
  assert.match(
    source,
    /\.in\("status", \[\.\.\.RETIRED_WORKSPACE_STATUSES\]\)/,
    "the reclaim UPDATE must re-assert the terminal status, so a workspace restored between the read and the write is never renamed",
  );
});

test("the funnel and the provisioner draw the retired line in the same place", () => {
  // Three readers, one predicate. A second hand-rolled `status !== 'cancelled'`
  // anywhere here is how the two halves drift back apart.
  for (const rel of [
    "lib/saas/owned-free-workspace.ts",
    "app/(marketing)/get-started/actions.ts",
    "lib/saas/workspace-signup-slug.server.ts",
  ]) {
    assert.match(
      read(rel),
      /from "(\.|@\/lib\/saas)\/workspace-lifecycle"/,
      `${rel} must ask the shared predicate`,
    );
  }
});
