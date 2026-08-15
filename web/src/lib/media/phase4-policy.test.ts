import assert from "node:assert/strict";
import test from "node:test";

import {
  collectionNavLabel,
  normalizeShootDate,
  splitFolderCollections,
} from "./collections";
import { mayDownloadOriginal, resolveOriginalsAccess } from "./originals-policy";
import {
  applyWatermarkPath,
  isWatermarkServable,
  type WatermarkPolicy,
} from "./watermark-on-release";
import {
  checkTalentStorageAllowance,
  checkWatermarkOnReleaseEntitlement,
  MEDIA_ENTITLEMENT_CONFIG,
  workspaceReleaseRequestAllowance,
} from "@/lib/billing/media-entitlements";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const TALENT = "33333333-3333-4333-8333-333333333333";

// ─── Originals policy (plan §9 decision 2) ──────────────────────────────────

test("the owning workspace gets the original", () => {
  const verdict = resolveOriginalsAccess(
    { ownershipKind: "agency", ownerTenantId: TENANT_A, ownerTalentProfileId: TALENT },
    { tenantId: TENANT_A, talentProfileId: null },
  );
  assert.equal(verdict.level, "original");
  assert.equal(verdict.reason, "owner_workspace");
});

test("the subject of an agency-owned photo gets web-size, with a reason", () => {
  const verdict = resolveOriginalsAccess(
    { ownershipKind: "agency", ownerTenantId: TENANT_A, ownerTalentProfileId: TALENT },
    { tenantId: null, talentProfileId: TALENT },
  );
  assert.equal(verdict.level, "web");
  assert.equal(verdict.reason, "subject_not_owner");
  // Never a silent absence: every refusal explains itself.
  assert.ok(verdict.message.length > 0);
});

test("a hub the photo was released to still cannot pull the original", () => {
  const verdict = resolveOriginalsAccess(
    { ownershipKind: "agency", ownerTenantId: TENANT_A, ownerTalentProfileId: TALENT },
    { tenantId: TENANT_B, talentProfileId: null },
  );
  assert.equal(verdict.level, "web");
  assert.equal(verdict.reason, "released_not_owner");
});

test("a talent owns their own uploads and may download them", () => {
  assert.equal(
    mayDownloadOriginal(
      { ownershipKind: "talent", ownerTenantId: null, ownerTalentProfileId: TALENT },
      { tenantId: null, talentProfileId: TALENT },
    ),
    true,
  );
});

test("a workspace that merely rosters a talent does not own their uploads", () => {
  assert.equal(
    mayDownloadOriginal(
      { ownershipKind: "talent", ownerTenantId: null, ownerTalentProfileId: TALENT },
      { tenantId: TENANT_A, talentProfileId: null },
    ),
    false,
  );
});

test("platform starter imagery is downloadable by anyone who can see it", () => {
  assert.equal(
    mayDownloadOriginal(
      { ownershipKind: "platform", ownerTenantId: null, ownerTalentProfileId: null },
      { tenantId: TENANT_B, talentProfileId: null },
    ),
    true,
  );
});

test("an unknown ownership_kind degrades to talent-owned, not to open access", () => {
  assert.equal(
    mayDownloadOriginal(
      { ownershipKind: "something-new", ownerTenantId: TENANT_A, ownerTalentProfileId: TALENT },
      { tenantId: TENANT_A, talentProfileId: null },
    ),
    false,
  );
});

// ─── Watermark-on-release substitution ──────────────────────────────────────

function policy(subs: [string, string][], missing: string[]): WatermarkPolicy {
  return { substitutions: new Map(subs), unavailable: new Set(missing) };
}

test("an asset with no watermark condition serves its own path", () => {
  const p = policy([], []);
  assert.equal(applyWatermarkPath(p, "asset-1", "orig/1.jpg"), "orig/1.jpg");
  assert.equal(isWatermarkServable(p, "asset-1"), true);
});

test("a watermark-required asset serves the baked derivative instead", () => {
  const p = policy([["asset-1", "talent/wm/abc.jpg"]], []);
  assert.equal(applyWatermarkPath(p, "asset-1", "orig/1.jpg"), "talent/wm/abc.jpg");
});

test("a watermark-required asset with no derivative is NOT served", () => {
  // The one place this family fails closed. Serving the bare original would
  // break the promise the workspace made when it ticked the box.
  const p = policy([], ["asset-1"]);
  assert.equal(applyWatermarkPath(p, "asset-1", "orig/1.jpg"), null);
  assert.equal(isWatermarkServable(p, "asset-1"), false);
});

// ─── Collections sugar ──────────────────────────────────────────────────────

test("only an ISO day counts as a shoot date", () => {
  assert.equal(normalizeShootDate("2026-03-14"), "2026-03-14");
  assert.equal(normalizeShootDate(" 2026-03-14 "), "2026-03-14");
  assert.equal(normalizeShootDate("14/03/2026"), null);
  assert.equal(normalizeShootDate("2026-13-40"), null);
  assert.equal(normalizeShootDate(""), null);
  assert.equal(normalizeShootDate(null), null);
});

test("collections split out and sort newest shoot first", () => {
  const { collections, plainFolders } = splitFolderCollections([
    { id: "f1", name: "Contracts" },
    { id: "c1", name: "March editorial", isCollection: true, shootDate: "2026-03-14" },
    { id: "c2", name: "Undated shoot", isCollection: true, shootDate: null },
    { id: "c3", name: "June campaign", isCollection: true, shootDate: "2026-06-02" },
    { id: "f2", name: "Archive" },
  ]);
  assert.deepEqual(
    collections.map((c) => c.id),
    ["c3", "c1", "c2"],
  );
  // Ordinary folders keep the order they arrived in.
  assert.deepEqual(
    plainFolders.map((f) => f.id),
    ["f1", "f2"],
  );
});

test("a collection label carries the shoot month, and survives a missing date", () => {
  assert.equal(
    collectionNavLabel({ id: "c1", name: "March editorial", shootDate: "2026-03-14" }),
    "March editorial · Mar 2026",
  );
  assert.equal(
    collectionNavLabel({ id: "c2", name: "Undated shoot", shootDate: null }),
    "Undated shoot",
  );
  assert.equal(
    collectionNavLabel({ id: "c3", name: "Bad date", shootDate: "nonsense" }),
    "Bad date",
  );
});

// ─── Plan-tier hooks — SCAFFOLD, permissive by design ───────────────────────

test("media entitlements ship permissive: nothing is gated yet", () => {
  // This test is a tripwire, not a spec. It fails the day someone lands a
  // pricing number without the owner's pricing pass (plan §9 decision 5).
  for (const quota of Object.values(MEDIA_ENTITLEMENT_CONFIG.talentStorage)) {
    assert.equal(quota.maxBytes, null);
    assert.equal(quota.maxAssets, null);
  }
  for (const allowed of Object.values(MEDIA_ENTITLEMENT_CONFIG.watermarkOnRelease)) {
    assert.equal(allowed, true);
  }
  for (const cap of Object.values(MEDIA_ENTITLEMENT_CONFIG.releaseRequestsPerMonth)) {
    assert.equal(cap, null);
  }
});

test("an unmetered plan allows any upload and reports no remaining bytes", () => {
  const verdict = checkTalentStorageAllowance({
    planKey: "talent_basic",
    usedBytes: 10_000_000_000,
    incomingBytes: 5_000_000,
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.remainingBytes, null);
  assert.equal(verdict.message, "");
});

test("watermark-on-release is available on every tier today, including free", () => {
  assert.equal(checkWatermarkOnReleaseEntitlement("free").allowed, true);
  assert.equal(checkWatermarkOnReleaseEntitlement("studio").allowed, true);
  // An unknown / missing tier must never lock a paying workspace out.
  assert.equal(checkWatermarkOnReleaseEntitlement(null).allowed, true);
  assert.equal(checkWatermarkOnReleaseEntitlement("brand-new-tier").allowed, true);
});

test("release requests are unmetered on every tier", () => {
  assert.equal(workspaceReleaseRequestAllowance("free"), null);
  assert.equal(workspaceReleaseRequestAllowance(undefined), null);
});
