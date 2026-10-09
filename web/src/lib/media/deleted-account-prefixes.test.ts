import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DELETED_USER_LABEL } from "@/lib/account/anonymize";
import { planWithDeletedAccountPrefixes } from "./deleted-account-prefix-pass";
import {
  OWNER_DELETED_SUSPEND_REASON,
  eligibleDeletedTalentIds,
  eligibleDeletedTenantIds,
  isPrefixReleasedForDeletedTalent,
  type DeletedTalentCandidate,
  type DeletedTenantCandidate,
} from "./deleted-account-prefixes";
import type { ClassifyInput, MediaAssetRow, StorageObject } from "./reap-orphaned-media";

const NOW = new Date("2026-10-07T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const DEAD = "11111111-1111-4111-8111-111111111111";
const LIVE = "22222222-2222-4222-8222-222222222222";
const FRESH = "33333333-3333-4333-8333-333333333333";
const DEAD_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIVE_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FRESH_TENANT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const cand = (id: string, over: Partial<DeletedTalentCandidate> = {}): DeletedTalentCandidate => ({
  id,
  display_name: DELETED_USER_LABEL,
  deleted_at: daysAgo(40),
  ...over,
});

const tenant = (id: string, over: Partial<DeletedTenantCandidate> = {}): DeletedTenantCandidate => ({
  id,
  status: "suspended",
  suspended_reason: OWNER_DELETED_SUSPEND_REASON,
  suspended_at: daysAgo(40),
  ...over,
});

function obj(name: string, bucketId = "media-originals"): StorageObject {
  return { bucketId, name, sizeBytes: 100, createdAt: daysAgo(400) };
}
function row(id: string, storagePath: string, deletedAt: string | null): MediaAssetRow {
  return { id, bucketId: "media-originals", storagePath, deletedAt, sourceMediaAssetId: null, variantKind: "originals" };
}

/**
 * Fake admin answering the talent_profiles and agencies lookups used by
 * loadEligibleDeletedAccountIds.
 */
function fakeAdmin(
  talentRows: DeletedTalentCandidate[],
  tenantRows: DeletedTenantCandidate[] = [],
  fail: "none" | "talents" | "tenants" = "none",
) {
  return {
    from: (table: string) => {
      const rows = table === "agencies" ? tenantRows : talentRows;
      const shouldFail =
        (fail === "talents" && table === "talent_profiles") ||
        (fail === "tenants" && table === "agencies");
      const chain = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        lt: () => chain,
        order: () => chain,
        range: () =>
          Promise.resolve(
            shouldFail ? { data: null, error: { message: "boom" } } : { data: rows, error: null },
          ),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

function input(over: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    objects: [],
    assets: [],
    externalReferences: [],
    now: NOW,
    allowUnaccounted: false, // the global opt-in stays OFF in every test of this feature
    ...over,
  };
}

describe("eligibleDeletedTalentIds (the marker rule)", () => {
  it("accepts an anonymised profile whose deleted_at is past the grace", () => {
    assert.deepEqual([...eligibleDeletedTalentIds([cand(DEAD)], NOW)], [DEAD]);
  });
  it("keeps a deletion still inside the grace (29 days)", () => {
    assert.equal(eligibleDeletedTalentIds([cand(DEAD, { deleted_at: daysAgo(29) })], NOW).size, 0);
  });
  it("never accepts a live profile (no deleted_at)", () => {
    assert.equal(eligibleDeletedTalentIds([cand(LIVE, { deleted_at: null })], NOW).size, 0);
  });
  it("never accepts a deleted_at profile that is not anonymised", () => {
    assert.equal(eligibleDeletedTalentIds([cand(LIVE, { display_name: "Maria Lopez" })], NOW).size, 0);
    assert.equal(eligibleDeletedTalentIds([cand(LIVE, { display_name: null })], NOW).size, 0);
  });
  it("rejects an unparseable deleted_at", () => {
    assert.equal(eligibleDeletedTalentIds([cand(DEAD, { deleted_at: "garbage" })], NOW).size, 0);
  });
});

describe("eligibleDeletedTenantIds (solo-owner suspend marker)", () => {
  it("shares the suspend-reason string with the deletion executor", () => {
    // Keep in lockstep with OWNER_DELETED_SUSPEND_REASON in deletion.ts.
    assert.equal(OWNER_DELETED_SUSPEND_REASON, "owner_account_deleted");
    const deletionSrc = readFileSync(
      new URL("../account/deletion.ts", import.meta.url).pathname,
      "utf8",
    );
    assert.match(
      deletionSrc,
      /OWNER_DELETED_SUSPEND_REASON\s*=\s*"owner_account_deleted"/,
    );
  });
  it("accepts a workspace suspended for owner_account_deleted past the grace", () => {
    assert.deepEqual([...eligibleDeletedTenantIds([tenant(DEAD_TENANT)], NOW)], [DEAD_TENANT]);
  });
  it("keeps a suspend still inside the grace (29 days)", () => {
    assert.equal(
      eligibleDeletedTenantIds([tenant(DEAD_TENANT, { suspended_at: daysAgo(29) })], NOW).size,
      0,
    );
  });
  it("never accepts an active workspace or a different suspend reason", () => {
    assert.equal(eligibleDeletedTenantIds([tenant(LIVE_TENANT, { status: "active" })], NOW).size, 0);
    assert.equal(
      eligibleDeletedTenantIds([tenant(LIVE_TENANT, { suspended_reason: "billing" })], NOW).size,
      0,
    );
  });
});

describe("isPrefixReleasedForDeletedTalent", () => {
  const ids = new Set([DEAD]);
  const tenants = new Set([DEAD_TENANT]);
  it("releases the deleted talent's own documents and originals only", () => {
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${DEAD}/documents/a.pdf`), true);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${DEAD}/originals/a.jpg`), true);
  });
  it("never releases another talent's prefix", () => {
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${LIVE}/documents/a.pdf`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${LIVE}/originals/a.jpg`), false);
  });
  it("releases {tenantId}/staging only for an eligible deleted tenant", () => {
    assert.equal(
      isPrefixReleasedForDeletedTalent(ids, "media-public", `${DEAD_TENANT}/staging/a.jpg`, tenants),
      true,
    );
    assert.equal(
      isPrefixReleasedForDeletedTalent(ids, "media-originals", `${DEAD_TENANT}/staging/a.jpg`, tenants),
      true,
    );
    assert.equal(
      isPrefixReleasedForDeletedTalent(ids, "media-public", `${LIVE_TENANT}/staging/a.jpg`, tenants),
      false,
    );
    // Bare staging/ is not tenant-keyed.
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", "staging/a.jpg", tenants), false);
    // A talent id is not enough for staging — needs the tenant marker.
    assert.equal(
      isPrefixReleasedForDeletedTalent(ids, "media-public", `${DEAD}/staging/a.jpg`, new Set()),
      false,
    );
  });
  it("never releases other protected prefixes, even under the deleted id", () => {
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `avatars/${DEAD}/avatar.jpg`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${DEAD}/originals/reel/a.mp4`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `talent/${DEAD}/a.png`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `avatars/${DEAD}/a.png`), false);
  });
  it("releases nothing for an empty id set", () => {
    assert.equal(isPrefixReleasedForDeletedTalent(new Set(), "media-originals", `${DEAD}/documents/a.pdf`), false);
  });
});

describe("planWithDeletedAccountPrefixes", () => {
  const objects = [
    obj(`${DEAD}/documents/d.pdf`),
    obj(`${DEAD}/originals/o.jpg`),
    obj(`${LIVE}/documents/d.pdf`),
    obj(`${LIVE}/originals/o.jpg`),
    obj(`${FRESH}/documents/d.pdf`),
  ];
  const assets = [
    row("a1", `${DEAD}/originals/o.jpg`, daysAgo(60)),
    row("a2", `${LIVE}/originals/o.jpg`, null),
  ];
  const profiles = [cand(DEAD), cand(FRESH, { deleted_at: daysAgo(29) }), cand(LIVE, { deleted_at: null })];
  const deletable = (p: { plan: { deletable: { storagePath: string }[] } }) =>
    p.plan.deletable.map((d) => d.storagePath).sort();

  it("flag off: classification is identical to the normal plan, dry run counts what would be released", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets }),
      enforce: false,
    });
    assert.deepEqual(deletable(r), []);
    assert.equal(r.report.applied, false);
    assert.equal(r.report.eligibleDeletedTalents, 1);
    assert.equal(r.report.releasedCount, 1); // the originals file (has a soft-deleted row)
    assert.equal(r.report.ownerAccountedCount, 1); // the row-less document
    assert.equal(r.report.ownerAccountedBytes, 100);
    assert.equal(r.report.stillUnaccountedCount, 0);
  });

  it("flag on: only the expired deleted talent's own prefix is released; live and within-grace stay", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets }),
      enforce: true,
    });
    assert.deepEqual(deletable(r), [`${DEAD}/documents/d.pdf`, `${DEAD}/originals/o.jpg`]);
    assert.equal(r.report.applied, true);
  });

  it("a not-deleted or non-anonymised profile releases nothing even with the flag on", async () => {
    const bad = [cand(DEAD, { deleted_at: null }), cand(LIVE, { display_name: "Maria Lopez" })];
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(bad),
      input: input({ objects, assets }),
      enforce: true,
    });
    assert.deepEqual(deletable(r), []);
  });

  it("an object named by live data stays protected for a deleted talent's prefix", async () => {
    const externalReferences = [
      { bucketId: "media-originals", storagePath: `${DEAD}/documents/d.pdf`, source: "talent_documents" },
    ];
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets, externalReferences }),
      enforce: true,
    });
    assert.deepEqual(deletable(r), [`${DEAD}/originals/o.jpg`]);
  });

  it("a live row on the deleted talent's path still pins it", async () => {
    const live = [row("a1", `${DEAD}/originals/o.jpg`, null)];
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets: live }),
      enforce: true,
    });
    assert.deepEqual(deletable(r), [`${DEAD}/documents/d.pdf`]);
  });

  it("(a) a deleted owner's row-less document is planned for deletion with the global opt-in OFF", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets }),
      enforce: true,
    });
    assert.ok(deletable(r).includes(`${DEAD}/documents/d.pdf`));
    assert.equal(r.report.ownerAccountedCount, 1);
  });

  it("(b) a live talent's row-less document is not deleted", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets }),
      enforce: true,
    });
    assert.ok(!deletable(r).includes(`${LIVE}/documents/d.pdf`));
    assert.ok(!deletable(r).includes(`${FRESH}/documents/d.pdf`));
  });

  it("(c) flag off: the document is kept but counted as owner-accounted", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets }),
      enforce: false,
    });
    assert.ok(!deletable(r).includes(`${DEAD}/documents/d.pdf`));
    assert.equal(r.report.ownerAccountedCount, 1);
  });

  it("(e) the row-less object of a talent whose lookup failed is not deleted", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin([], [], "talents"),
      input: input({ objects, assets }),
      enforce: true,
    });
    assert.ok(!deletable(r).includes(`${DEAD}/documents/d.pdf`));
  });

  it("(g) a deleted owner inside the 29 day grace accounts for nothing", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets }),
      enforce: true,
    });
    assert.ok(!deletable(r).includes(`${FRESH}/documents/d.pdf`));
    assert.equal(r.report.ownerAccountedCount, 1);
  });

  it("(f) the global opt-in is never read or set by the new path", () => {
    const dir = new URL(".", import.meta.url).pathname;
    for (const f of [
      "deleted-account-prefixes.ts",
      "deleted-account-prefixes-io.ts",
      "deleted-account-prefix-pass.ts",
    ]) {
      const src = readFileSync(`${dir}${f}`, "utf8");
      assert.ok(!src.includes("ALLOW_UNACCOUNTED"), f);
      assert.ok(!src.includes("process.env"), f);
    }
  });

  it("a failed id lookup releases nothing and reports the failure", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin([], [], "talents"),
      input: input({ objects, assets }),
      enforce: true,
    });
    assert.deepEqual(deletable(r), []);
    assert.equal(r.report.ok, false);
    assert.equal(r.report.applied, false);
  });
});

describe("site logos and portfolio (media-public, keyed by talent id in the 2nd segment)", () => {
  const pub = (name: string) => obj(name, "media-public");
  const objects = [
    pub(`talent-site-logos/${DEAD}/l.png`),
    pub(`talent-portfolio/${DEAD}/p.jpg`),
    pub(`talent-site-logos/${LIVE}/l.png`),
    pub(`talent-portfolio/${LIVE}/p.jpg`),
    pub(`talent-portfolio/${FRESH}/p.jpg`),
    pub(`talent/${DEAD}/legacy.jpg`),
  ];
  const profiles = [cand(DEAD), cand(FRESH, { deleted_at: daysAgo(29) }), cand(LIVE, { deleted_at: null })];
  const del = (r: { plan: { deletable: { storagePath: string }[] } }) =>
    r.plan.deletable.map((d) => d.storagePath).sort();

  it("path check: only the deleted talent's own two prefixes", () => {
    const ids = new Set([DEAD]);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `talent-site-logos/${DEAD}/l.png`), true);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `talent-portfolio/${DEAD}/p.jpg`), true);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `talent-portfolio/${LIVE}/p.jpg`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `talent-portfolio/${DEAD}`), false);
  });

  it("flag on: the deleted talent's row-less logo and portfolio are deleted, nobody else's", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects }),
      enforce: true,
    });
    assert.deepEqual(del(r), [`talent-portfolio/${DEAD}/p.jpg`, `talent-site-logos/${DEAD}/l.png`]);
  });

  it("flag off: kept, but counted", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects }),
      enforce: false,
    });
    assert.deepEqual(del(r), []);
    assert.equal(r.report.siteAssetsCount, 2);
    assert.equal(r.report.siteAssetsBytes, 200);
    assert.equal(r.report.ownerAccountedCount, 2);
  });

  it("a live reference, a live row and a cross-bucket pin still win", async () => {
    const externalReferences = [
      { bucketId: "media-public", storagePath: `talent-site-logos/${DEAD}/l.png`, source: "talent_sites" },
    ];
    const assets: MediaAssetRow[] = [
      {
        id: "p1",
        bucketId: "media-public",
        storagePath: `talent-portfolio/${DEAD}/p.jpg`,
        deletedAt: null,
        sourceMediaAssetId: null,
        variantKind: "gallery",
      },
    ];
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, externalReferences, assets }),
      enforce: true,
    });
    assert.deepEqual(del(r), []);
    const pin: MediaAssetRow[] = [
      {
        id: "p2",
        bucketId: "media-originals",
        storagePath: `talent-portfolio/${DEAD}/p.jpg`,
        deletedAt: null,
        sourceMediaAssetId: null,
        variantKind: "gallery",
      },
    ];
    const r2 = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, assets: pin }),
      enforce: true,
    });
    assert.deepEqual(del(r2), [`talent-site-logos/${DEAD}/l.png`]);
  });

  it("a failed lookup deletes nothing", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin([], [], "talents"),
      input: input({ objects }),
      enforce: true,
    });
    assert.deepEqual(del(r), []);
  });

  it("the deletion cap applies", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin(profiles),
      input: input({ objects, maxDeletions: 1 }),
      enforce: true,
    });
    assert.equal(r.plan.deletable.length, 1);
    assert.equal(r.plan.cappedByLimit, true);
  });
});

describe("{tenantId}/staging (TUL-393, keyed by suspended solo-owner workspace)", () => {
  const pub = (name: string) => obj(name, "media-public");
  const objects = [
    pub(`${DEAD_TENANT}/staging/a.jpg`),
    pub(`${LIVE_TENANT}/staging/b.jpg`),
    pub(`${FRESH_TENANT}/staging/c.jpg`),
    pub("staging/orphan.jpg"),
  ];
  const tenants = [
    tenant(DEAD_TENANT),
    tenant(FRESH_TENANT, { suspended_at: daysAgo(29) }),
    tenant(LIVE_TENANT, { status: "active", suspended_reason: null, suspended_at: null }),
  ];
  const del = (r: { plan: { deletable: { storagePath: string }[] } }) =>
    r.plan.deletable.map((d) => d.storagePath).sort();

  it("flag on: only the expired owner-deleted tenant's staging is deleted", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin([], tenants),
      input: input({ objects }),
      enforce: true,
    });
    assert.deepEqual(del(r), [`${DEAD_TENANT}/staging/a.jpg`]);
    assert.equal(r.report.eligibleDeletedTenants, 1);
    assert.equal(r.report.stagingCount, 1);
    assert.equal(r.report.ownerAccountedCount, 1);
    assert.equal(r.report.stillUnaccountedCount, 0);
  });

  it("flag off: staging kept but counted as owner-accounted (no blanket unaccounted)", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin([], tenants),
      input: input({ objects }),
      enforce: false,
    });
    assert.deepEqual(del(r), []);
    assert.equal(r.report.stagingCount, 1);
    assert.equal(r.report.ownerAccountedCount, 1);
    assert.equal(r.report.applied, false);
  });

  it("a failed tenant lookup releases nothing", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin([], tenants, "tenants"),
      input: input({ objects }),
      enforce: true,
    });
    assert.deepEqual(del(r), []);
    assert.equal(r.report.ok, false);
  });

  it("allowUnaccounted stays false while staging becomes deletable under enforce", async () => {
    const r = await planWithDeletedAccountPrefixes({
      admin: fakeAdmin([], tenants),
      input: input({ objects, allowUnaccounted: false }),
      enforce: true,
    });
    assert.ok(del(r).includes(`${DEAD_TENANT}/staging/a.jpg`));
    assert.ok(!del(r).includes(`${LIVE_TENANT}/staging/b.jpg`));
    assert.ok(!del(r).includes("staging/orphan.jpg"));
  });
});
