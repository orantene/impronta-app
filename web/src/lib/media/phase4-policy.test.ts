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
  checkTalentAssetCountAllowance,
  checkTalentStorageAllowance,
  checkWatermarkOnReleaseEntitlement,
  MEDIA_ENTITLEMENT_CONFIG,
  MEDIA_QUOTA_SOFT_WARN_RATIO,
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

// ─── Plan-tier hooks — the ACCEPTED pricing decisions ───────────────────────
//
// Still a tripwire, not a spec. It used to assert "no numbers yet"; it now
// asserts the exact numbers the owner accepted in
// `web/docs/media-pricing-pass-2026-08-15.md`. The spirit is unchanged: any
// later edit to a value in MEDIA_ENTITLEMENT_CONFIG turns this red, so the
// number cannot move without someone amending that doc on the way past.

test("talent asset caps are exactly the accepted numbers (pricing doc §3a)", () => {
  const { talentStorage } = MEDIA_ENTITLEMENT_CONFIG;
  assert.equal(talentStorage.talent_basic.maxAssets, 150);
  assert.equal(talentStorage.talent_pro.maxAssets, 600);
  assert.equal(talentStorage.talent_portfolio.maxAssets, null); // uncapped
  assert.equal(MEDIA_QUOTA_SOFT_WARN_RATIO, 0.8);
});

test("maxBytes stays null on EVERY tier until a storage reaper exists (§3a, §5d)", () => {
  // Not an oversight and not "we forgot to fill these in". 23% of the bucket
  // is unreferenced because soft delete does not free storage, so byte
  // accounting is currently wrong in both available directions. Landing a
  // byte cap before the reaper is the specific mistake this guards.
  for (const quota of Object.values(MEDIA_ENTITLEMENT_CONFIG.talentStorage)) {
    assert.equal(quota.maxBytes, null);
  }
});

test("watermark on release is FREE on every tier, and stays that way (§3b)", () => {
  // 0 releases have ever happened and only 4 of 32 workspaces are on a paid
  // tier. Gating this cannot earn revenue, only suppress the first use.
  for (const allowed of Object.values(MEDIA_ENTITLEMENT_CONFIG.watermarkOnRelease)) {
    assert.equal(allowed, true);
  }
});

test("release requests stay uncapped on every tier (§3c)", () => {
  // The cron counts them instead. Build the cap when a real number arrives.
  for (const cap of Object.values(MEDIA_ENTITLEMENT_CONFIG.releaseRequestsPerMonth)) {
    assert.equal(cap, null);
  }
});

test("the byte check allows everything, because maxBytes is null by decision", () => {
  const verdict = checkTalentStorageAllowance({
    planKey: "talent_basic",
    usedBytes: 10_000_000_000,
    incomingBytes: 5_000_000,
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.remainingBytes, null);
  assert.equal(verdict.message, "");
});

// ─── The count check — the cap that actually bites ──────────────────────────

test("REGRESSION: the biggest real portfolio today (108 photos) is NOT blocked on Basic", () => {
  // The whole point of a 150 cap. 108 is the largest live portfolio measured
  // in production on 2026-08-15. If this ever goes red, the cap has started
  // taxing real users and the number is wrong, not the test.
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_basic",
    usedAssets: 108,
    incomingAssets: 1,
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.remainingAssets, 41);
});

test("well under the cap: allowed, no warning, nothing to say", () => {
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_basic",
    usedAssets: 52, // the p90 real talent
    incomingAssets: 1,
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.warn, false);
  assert.equal(verdict.code, "ok");
  assert.equal(verdict.message, "");
});

test("at 80% of the cap: still allowed, but warns with the number remaining", () => {
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_basic",
    usedAssets: 119,
    incomingAssets: 1, // lands exactly on 120 = 80% of 150
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.warn, true);
  assert.equal(verdict.code, "approaching_limit");
  assert.equal(verdict.remainingAssets, 30);
  assert.match(verdict.message, /30 more photos/);
});

test("one photo below the warn line does not warn", () => {
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_basic",
    usedAssets: 118,
    incomingAssets: 1,
  });
  assert.equal(verdict.warn, false);
});

test("at 100% of the cap: blocked, in plain language, with both ways out", () => {
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_basic",
    usedAssets: 150,
    incomingAssets: 1,
  });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.code, "limit_reached");
  assert.equal(verdict.remainingAssets, 0);
  // Plain language: says the limit, and says the two things they can do.
  assert.match(verdict.message, /150 photos/);
  assert.match(verdict.message, /Remove/);
  assert.match(verdict.message, /upgrade/);
  // House style: no em dashes, and never the word "buyer".
  assert.equal(verdict.message.includes("—"), false);
  assert.equal(/buyer/i.test(verdict.message), false);
});

test("a batch that would straddle the cap is refused whole, not half-inserted", () => {
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_basic",
    usedAssets: 145,
    incomingAssets: 20,
  });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.remainingAssets, 5);
  assert.match(verdict.message, /room for 5 more/);
});

test("Portfolio is uncapped: never blocks, never warns, however many photos", () => {
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_portfolio",
    usedAssets: 100_000,
    incomingAssets: 500,
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.warn, false);
  assert.equal(verdict.remainingAssets, null);
  assert.equal(verdict.message, "");
});

test("Pro gets the bigger cap", () => {
  assert.equal(
    checkTalentAssetCountAllowance({
      planKey: "talent_pro",
      usedAssets: 300,
      incomingAssets: 1,
    }).allowed,
    true,
  );
  assert.equal(
    checkTalentAssetCountAllowance({
      planKey: "talent_pro",
      usedAssets: 600,
      incomingAssets: 1,
    }).allowed,
    false,
  );
});

test("an unknown plan key degrades to permissive, never to a block", () => {
  // Same property the rest of this module has: a plan-catalog rename must not
  // start refusing uploads from talents who are paying.
  for (const key of [null, undefined, "talent_brand_new", 42]) {
    const verdict = checkTalentAssetCountAllowance({
      planKey: key,
      usedAssets: 5_000,
      incomingAssets: 1,
    });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.remainingAssets, null);
  }
});

test("someone already over a cap keeps their photos and is only refused the ADD", () => {
  // Doc §3a step 4: never retro-delete, never retro-block. Refusing only the
  // add is what grandfathering looks like in code.
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_basic",
    usedAssets: 400, // hypothetical, over the 150 cap
    incomingAssets: 1,
  });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.remainingAssets, 0);
});

test("adding zero assets is never a block", () => {
  const verdict = checkTalentAssetCountAllowance({
    planKey: "talent_basic",
    usedAssets: 150,
    incomingAssets: 0,
  });
  assert.equal(verdict.allowed, true);
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
