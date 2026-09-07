import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { normalizeWorkspaceType } from "@/lib/saas/workspace-type";

/**
 * A restaurant must not ship a talent shortlist — and an agency must not lose
 * one to a failed read.
 */

test("workspace_type decides, and only 'business' turns discovery off", () => {
  // The decision is `normalizeWorkspaceType(...) !== "business"`, so every
  // unknown value lands on `talent`. Pinned here because the asymmetry is the
  // whole safety argument: guessing "business" strips a working surface.
  assert.equal(normalizeWorkspaceType("business"), "business");
  for (const v of ["talent", "", null, undefined, "agency", "restaurant", 42]) {
    assert.equal(normalizeWorkspaceType(v), "talent", `${JSON.stringify(v)} must default to talent`);
  }
});

const SRC = blankComments(
  readFileSync(join(process.cwd(), "src/lib/saas/storefront-discovery.ts"), "utf8"),
);

test("every failure path returns TRUE — an outage must not strip an agency's shortlist", () => {
  // No tenant, no client, a query error, a missing row: all `return true`.
  // A missing shortlist on an agency is a regression in a working product; an
  // extra one on a restaurant is a visible bug. The two are not symmetric.
  assert.match(SRC, /if \(!tenantId\) return Promise\.resolve\(true\)/);
  assert.match(SRC, /if \(!supabase\) return true/);
  assert.match(SRC, /if \(error\) \{[\s\S]{0,120}return true/);
  assert.match(SRC, /if \(!data\) return true/);
});

test("the read is scoped to ONE tenant", () => {
  // The bug underneath the bug: `saved_talent` and `client_favorites` are keyed
  // on client_user_id with NO tenant column, which is how one person's list
  // crossed hosts. This read must not repeat that shape.
  assert.match(SRC, /\.eq\("id", tenantId\)/);
});

// ── The surfaces ────────────────────────────────────────────────────────────

const MOUNTS = [
  "src/app/(public)/layout.tsx",
  "src/components/directory/directory-discovery-header-actions.tsx",
];

test("both talent surfaces gate on the flag, not on tenant-ness", () => {
  // `ctx.kind === "agency" || "hub"` is "is this a tenant", which every El Paisa
  // page satisfies. The gate has to be what KIND of tenant.
  for (const f of MOUNTS) {
    const body = blankComments(readFileSync(join(process.cwd(), f), "utf8"));
    assert.match(body, /talentDiscoveryEnabled/, `${f} must consult the flag`);
  }
});

test("the header defaults to SHOWING when there is no provider", () => {
  // Freeform talent pages render the public shell WITHOUT the discovery
  // provider and still want their icons. A naive gate hides them there.
  const body = blankComments(
    readFileSync(join(process.cwd(), MOUNTS[1]!), "utf8"),
  );
  assert.match(body, /discovery\?\.talentDiscoveryEnabled \?\? true/);
});

test("a business storefront seeds no ids — the counts are what made it look real", () => {
  const body = blankComments(readFileSync(join(process.cwd(), MOUNTS[0]!), "utf8"));
  assert.match(body, /talentDiscoveryEnabled \? rawSavedIds : \[\]/);
  assert.match(body, /talentDiscoveryEnabled \? rawFavoriteIds : \[\]/);
});
