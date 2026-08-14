/**
 * ownership.test.ts — the invariants every media writer now depends on.
 *
 * Run: node_modules/.bin/tsx --test src/lib/media/ownership.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  derivedOwnershipStamp,
  describeMediaOwnership,
  normalizeOwnershipKind,
  platformOwnedStamp,
  talentOwnedStamp,
  uploadOwnershipStamp,
  workspaceOwnedStamp,
} from "./ownership";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

test("a talent stamp never claims a tenant", () => {
  const stamp = talentOwnedStamp(USER);
  assert.equal(stamp.ownership_kind, "talent");
  assert.equal(stamp.owner_tenant_id, null);
  assert.equal(stamp.uploaded_by_user_id, USER);
  assert.equal(stamp.created_by, USER);
});

test("a workspace stamp always carries its tenant", () => {
  const stamp = workspaceOwnedStamp(TENANT, USER);
  assert.equal(stamp.ownership_kind, "agency");
  assert.equal(stamp.owner_tenant_id, TENANT);
});

test("workspace stamp WITHOUT a tenant degrades instead of failing the check constraint", () => {
  // media_assets_agency_ownership_chk rejects agency rows with a null tenant.
  // An independent talent's upload has no tenant, so the stamp must not
  // produce an INSERT the database will bounce.
  const stamp = workspaceOwnedStamp(null, USER);
  assert.equal(stamp.ownership_kind, "talent");
  assert.equal(stamp.owner_tenant_id, null);
});

test("upload context, not caller input, decides the owner", () => {
  assert.equal(
    uploadOwnershipStamp({ actor: "workspace_staff", tenantId: TENANT, uploaderUserId: USER })
      .ownership_kind,
    "agency",
  );
  assert.equal(
    uploadOwnershipStamp({ actor: "talent_self", tenantId: TENANT, uploaderUserId: USER })
      .ownership_kind,
    "talent",
  );
  assert.equal(
    uploadOwnershipStamp({ actor: "platform", tenantId: TENANT, uploaderUserId: USER })
      .ownership_kind,
    "platform",
  );
});

test("a derivative inherits the source owner, never the operator's context", () => {
  // Staff cropping a talent-owned photo must not transfer it to the workspace.
  const cropped = derivedOwnershipStamp(
    { ownership_kind: "talent", owner_tenant_id: null },
    USER,
  );
  assert.equal(cropped.ownership_kind, "talent");
  assert.equal(cropped.owner_tenant_id, null);
  assert.equal(cropped.uploaded_by_user_id, USER);

  const fromAgency = derivedOwnershipStamp(
    { ownership_kind: "agency", owner_tenant_id: TENANT },
    USER,
  );
  assert.equal(fromAgency.ownership_kind, "agency");
  assert.equal(fromAgency.owner_tenant_id, TENANT);

  assert.equal(derivedOwnershipStamp(null, USER).ownership_kind, "talent");
});

test("platform stamp claims no tenant", () => {
  const stamp = platformOwnedStamp(null);
  assert.equal(stamp.ownership_kind, "platform");
  assert.equal(stamp.owner_tenant_id, null);
  assert.equal(stamp.uploaded_by_user_id, null);
});

test("unknown kinds read as talent-owned, matching the column default", () => {
  assert.equal(normalizeOwnershipKind(null), "talent");
  assert.equal(normalizeOwnershipKind("nonsense"), "talent");
  assert.equal(normalizeOwnershipKind("agency"), "agency");
});

test("the chip distinguishes MY workspace from ANOTHER workspace", () => {
  const mine = describeMediaOwnership({
    ownershipKind: "agency",
    ownedByThisWorkspace: true,
    workspaceName: "Impronta",
  });
  assert.equal(mine.tone, "workspace");
  assert.match(mine.label, /Impronta/);

  const theirs = describeMediaOwnership({
    ownershipKind: "agency",
    ownedByThisWorkspace: false,
  });
  assert.equal(theirs.tone, "external");
  assert.notEqual(theirs.label, mine.label);
});

test("every chip explains itself — a tile is never a silent absence", () => {
  for (const kind of ["talent", "agency", "platform", null]) {
    for (const ownedByThisWorkspace of [true, false]) {
      const chip = describeMediaOwnership({ ownershipKind: kind, ownedByThisWorkspace });
      assert.ok(chip.label.length > 0, `empty label for ${String(kind)}`);
      assert.ok(chip.hint.length > 20, `weak hint for ${String(kind)}`);
    }
  }
});
