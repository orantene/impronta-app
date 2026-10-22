/**
 * TUL-1716: `loadVisiblePicksLink` is a read-only loader that runs on every Settings
 * open. It must decide show/hide for `agency.roster.edit` without ever writing a
 * "permission denied" audit row — that is exactly what `requireWorkspaceStaffAction({
 * capability })` (and `requireStaffTenantAction({ capability })`) do on a miss, which
 * would audit-spam every non-editor's Settings page.
 *
 * Behaviour is exercised through the `LoadVisiblePicksLinkDeps` injection seam (now on the plain
 * module `service-hub/load-visible-picks-link.ts`, TUL-1744, not on the exported server action) (same
 * pattern as `load-representation.test.ts`'s `LoadRepresentationDeps`): fakes for
 * `requireSession` / `getAdminWorkspaceScope` / `userHasCapability`. Production never
 * passes `deps`. The "never audits" guarantee itself is pinned at the source level in
 * `visible-picks-link.test.ts` (no import of `requireWorkspaceStaffAction` or
 * `auditFailure` anywhere in the file) — the only two functions in this codebase that
 * write a "permission denied" row, and this module imports neither.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { loadVisiblePicksLinkWith as loadVisiblePicksLink } from "@/lib/service-hub/load-visible-picks-link";

const TENANT_ID = "11111111-2222-3333-4444-555555555555";

function withFlagOn<T>(run: () => Promise<T>): Promise<T> {
  const prev = process.env.HUB_PLAN_CAP_PICKS_ENABLED;
  process.env.HUB_PLAN_CAP_PICKS_ENABLED = "1";
  return run().finally(() => {
    if (prev === undefined) delete process.env.HUB_PLAN_CAP_PICKS_ENABLED;
    else process.env.HUB_PLAN_CAP_PICKS_ENABLED = prev;
  });
}

const okSession = async () =>
  ({ ok: true, supabase: {} as never, user: { id: "u1" } as never, profile: null }) as const;
const failSession = async () => ({ ok: false, error: "You must be signed in." }) as const;
const scopeFor = (tenantId: string) =>
  async () => ({ tenantId, membership: {} as never });
const noScope = async () => null;

test("a user WITHOUT agency.roster.edit gets no link, and the loader never imports an audit writer", async () => {
  const result = await withFlagOn(() =>
    loadVisiblePicksLink({
      requireSession: okSession,
      getAdminWorkspaceScope: scopeFor(TENANT_ID),
      userHasCapability: async (capability, tenantId) => {
        assert.equal(capability, "agency.roster.edit");
        assert.equal(tenantId, TENANT_ID);
        return false; // not a roster editor
      },
    }),
  );
  assert.deepEqual(result, { show: false });
  // Source-level proof the capability miss above cannot reach an audit writer: this
  // module imports neither of the two functions in the codebase that write a
  // "permission denied" row.
  const src = readFileSync(path.join(process.cwd(), "src/lib/service-hub/load-visible-picks-link.ts"), "utf8");
  assert.doesNotMatch(src, /requireWorkspaceStaffAction/);
  assert.doesNotMatch(src, /auditFailure/);
});

test("a user WITH agency.roster.edit gets the link", async () => {
  const result = await withFlagOn(() =>
    loadVisiblePicksLink({
      requireSession: okSession,
      getAdminWorkspaceScope: scopeFor(TENANT_ID),
      userHasCapability: async () => true,
    }),
  );
  assert.deepEqual(result, { show: true });
});

test("the flag off hides the link even for a roster editor, and never resolves the session", async () => {
  const prev = process.env.HUB_PLAN_CAP_PICKS_ENABLED;
  process.env.HUB_PLAN_CAP_PICKS_ENABLED = "0";
  try {
    let sessionCalled = false;
    const result = await loadVisiblePicksLink({
      requireSession: async () => {
        sessionCalled = true;
        return okSession();
      },
      getAdminWorkspaceScope: scopeFor(TENANT_ID),
      userHasCapability: async () => true,
    });
    assert.deepEqual(result, { show: false });
    assert.equal(sessionCalled, false, "the flag check short-circuits before touching the session");
  } finally {
    if (prev === undefined) delete process.env.HUB_PLAN_CAP_PICKS_ENABLED;
    else process.env.HUB_PLAN_CAP_PICKS_ENABLED = prev;
  }
});

test("no signed-in session: no link, no throw", async () => {
  const result = await withFlagOn(() =>
    loadVisiblePicksLink({
      requireSession: failSession,
      getAdminWorkspaceScope: scopeFor(TENANT_ID),
      userHasCapability: async () => true,
    }),
  );
  assert.deepEqual(result, { show: false });
});

test("no workspace scope resolved (e.g. caller not a member of the surfaced workspace): no link", async () => {
  const result = await withFlagOn(() =>
    loadVisiblePicksLink({
      requireSession: okSession,
      getAdminWorkspaceScope: noScope,
      userHasCapability: async () => true,
    }),
  );
  assert.deepEqual(result, { show: false });
});

test("a thrown error from any dependency hides the link instead of propagating", async () => {
  const result = await withFlagOn(() =>
    loadVisiblePicksLink({
      requireSession: okSession,
      getAdminWorkspaceScope: scopeFor(TENANT_ID),
      userHasCapability: async () => {
        throw new Error("boom");
      },
    }),
  );
  assert.deepEqual(result, { show: false });
});
