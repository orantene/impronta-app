import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DELETED_USER_LABEL } from "@/lib/account/anonymize";
import { planWithDeletedAccountPrefixes } from "./deleted-account-prefix-pass";
import {
  eligibleDeletedTalentIds,
  isPrefixReleasedForDeletedTalent,
  type DeletedTalentCandidate,
} from "./deleted-account-prefixes";
import type { ClassifyInput, MediaAssetRow, StorageObject } from "./reap-orphaned-media";

const NOW = new Date("2026-10-07T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const DEAD = "11111111-1111-4111-8111-111111111111";
const LIVE = "22222222-2222-4222-8222-222222222222";
const FRESH = "33333333-3333-4333-8333-333333333333";

const cand = (id: string, over: Partial<DeletedTalentCandidate> = {}): DeletedTalentCandidate => ({
  id,
  display_name: DELETED_USER_LABEL,
  deleted_at: daysAgo(40),
  ...over,
});

function obj(name: string, bucketId = "media-originals"): StorageObject {
  return { bucketId, name, sizeBytes: 100, createdAt: daysAgo(400) };
}
function row(id: string, storagePath: string, deletedAt: string | null): MediaAssetRow {
  return { id, bucketId: "media-originals", storagePath, deletedAt, sourceMediaAssetId: null, variantKind: "originals" };
}

/** Fake admin answering ONLY the talent_profiles id lookup. */
function fakeAdmin(rows: DeletedTalentCandidate[], fail = false) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    lt: () => chain,
    order: () => chain,
    range: () =>
      Promise.resolve(fail ? { data: null, error: { message: "boom" } } : { data: rows, error: null }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

function input(over: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    objects: [],
    assets: [],
    externalReferences: [],
    now: NOW,
    allowUnaccounted: true,
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

describe("isPrefixReleasedForDeletedTalent", () => {
  const ids = new Set([DEAD]);
  it("releases the deleted talent's own documents and originals only", () => {
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${DEAD}/documents/a.pdf`), true);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${DEAD}/originals/a.jpg`), true);
  });
  it("never releases another talent's prefix", () => {
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${LIVE}/documents/a.pdf`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${LIVE}/originals/a.jpg`), false);
  });
  it("never releases other protected prefixes, even under the deleted id", () => {
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `avatars/${DEAD}/avatar.jpg`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${DEAD}/staging/a.jpg`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-originals", `${DEAD}/originals/reel/a.mp4`), false);
    assert.equal(isPrefixReleasedForDeletedTalent(ids, "media-public", `talent-site-logos/${DEAD}/a.png`), false);
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
    const r = await planWithDeletedAccountPrefixes({ admin: fakeAdmin(profiles), input: input({ objects, assets }), enforce: false });
    assert.deepEqual(deletable(r), []);
    assert.equal(r.report.applied, false);
    assert.equal(r.report.eligibleDeletedTalents, 1);
    assert.equal(r.report.releasedCount, 2);
    assert.equal(r.report.releasedBytes, 200);
  });

  it("flag on: only the expired deleted talent's own prefix is released; live and within-grace stay", async () => {
    const r = await planWithDeletedAccountPrefixes({ admin: fakeAdmin(profiles), input: input({ objects, assets }), enforce: true });
    assert.deepEqual(deletable(r), [`${DEAD}/documents/d.pdf`, `${DEAD}/originals/o.jpg`]);
    assert.equal(r.report.applied, true);
  });

  it("a not-deleted or non-anonymised profile releases nothing even with the flag on", async () => {
    const bad = [cand(DEAD, { deleted_at: null }), cand(LIVE, { display_name: "Maria Lopez" })];
    const r = await planWithDeletedAccountPrefixes({ admin: fakeAdmin(bad), input: input({ objects, assets }), enforce: true });
    assert.deepEqual(deletable(r), []);
  });

  it("an object named by live data stays protected for a deleted talent's prefix", async () => {
    const externalReferences = [{ bucketId: "media-originals", storagePath: `${DEAD}/documents/d.pdf`, source: "talent_documents" }];
    const r = await planWithDeletedAccountPrefixes({ admin: fakeAdmin(profiles), input: input({ objects, assets, externalReferences }), enforce: true });
    assert.deepEqual(deletable(r), [`${DEAD}/originals/o.jpg`]);
  });

  it("a live row on the deleted talent's path still pins it", async () => {
    const live = [row("a1", `${DEAD}/originals/o.jpg`, null)];
    const r = await planWithDeletedAccountPrefixes({ admin: fakeAdmin(profiles), input: input({ objects, assets: live }), enforce: true });
    assert.deepEqual(deletable(r), [`${DEAD}/documents/d.pdf`]);
  });

  it("without the unaccounted opt-in, a row-less document is still kept and reported", async () => {
    const r = await planWithDeletedAccountPrefixes({ admin: fakeAdmin(profiles), input: input({ objects, assets, allowUnaccounted: false }), enforce: true });
    assert.deepEqual(deletable(r), [`${DEAD}/originals/o.jpg`]);
    assert.equal(r.report.stillUnaccountedCount, 1);
  });

  it("a failed id lookup releases nothing and reports the failure", async () => {
    const r = await planWithDeletedAccountPrefixes({ admin: fakeAdmin([], true), input: input({ objects, assets }), enforce: true });
    assert.deepEqual(deletable(r), []);
    assert.equal(r.report.ok, false);
    assert.equal(r.report.applied, false);
  });
});
