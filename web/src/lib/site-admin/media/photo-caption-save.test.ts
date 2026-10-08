import assert from "node:assert/strict";
import { test } from "node:test";

import type { PhotoMetadata } from "./photo-caption-edit";
import { savePhotoCaption, type PhotoCaptionDeps } from "./photo-caption-save";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MINE_ASSET = "33333333-3333-4333-8333-333333333333";
const THEIRS_ASSET = "44444444-4444-4444-8444-444444444444";

function makeDeps(opts?: { signedInAs?: string }) {
  const rows = new Map<string, { owner: string; metadata: PhotoMetadata | null }>([
    [MINE_ASSET, { owner: ME, metadata: { caption: "Hola", alt_i18n: { en: "Beach" } } }],
    [THEIRS_ASSET, { owner: OTHER, metadata: { caption: "Secret" } }],
  ]);
  const writes: string[] = [];
  const deps: PhotoCaptionDeps = {
    requireSelf: async (id) =>
      (opts?.signedInAs ?? ME) === id
        ? { ok: true }
        : { ok: false, error: "Not your profile." },
    loadLocales: async () => ({ primary: "es", secondary: ["en"] }),
    readMetadata: async (profileId, assetId) => {
      const row = rows.get(assetId);
      return row && row.owner === profileId ? { metadata: row.metadata } : null;
    },
    writeMetadata: async (profileId, assetId, metadata) => {
      const row = rows.get(assetId);
      if (!row || row.owner !== profileId) return false;
      row.metadata = metadata;
      writes.push(assetId);
      return true;
    },
  };
  return { deps, rows, writes };
}

test("owner saves a second-language caption; other metadata survives", async () => {
  const { deps, rows } = makeDeps();
  const res = await savePhotoCaption(deps, {
    talentProfileId: ME,
    assetId: MINE_ASSET,
    locale: "en",
    text: " Beach day ",
  });
  assert.equal(res.ok, true);
  assert.deepEqual(rows.get(MINE_ASSET)?.metadata, {
    caption: "Hola",
    alt_i18n: { en: "Beach" },
    caption_i18n: { en: "Beach day" },
  });
});

test("a signed-in talent cannot write to another talent's profile id", async () => {
  const { deps, writes } = makeDeps();
  const res = await savePhotoCaption(deps, {
    talentProfileId: OTHER,
    assetId: THEIRS_ASSET,
    locale: "es",
    text: "pwned",
  });
  assert.equal(res.ok, false);
  assert.equal(writes.length, 0);
});

test("an asset owned by someone else reads as not found under my profile id", async () => {
  const { deps, rows, writes } = makeDeps();
  const res = await savePhotoCaption(deps, {
    talentProfileId: ME,
    assetId: THEIRS_ASSET,
    locale: "es",
    text: "pwned",
  });
  assert.deepEqual(res, { ok: false, error: "Photo not found for this profile." });
  assert.equal(writes.length, 0);
  assert.deepEqual(rows.get(THEIRS_ASSET)?.metadata, { caption: "Secret" });
});

test("a language the talent has not enabled is refused", async () => {
  const { deps, writes } = makeDeps();
  const res = await savePhotoCaption(deps, {
    talentProfileId: ME,
    assetId: MINE_ASSET,
    locale: "fr",
    text: "Plage",
  });
  assert.equal(res.ok, false);
  assert.equal(writes.length, 0);
});

test("malformed ids never reach the deps", async () => {
  const { deps, writes } = makeDeps();
  const res = await savePhotoCaption(deps, {
    talentProfileId: "nope",
    assetId: MINE_ASSET,
    locale: "es",
    text: "x",
  });
  assert.equal(res.ok, false);
  assert.equal(writes.length, 0);
});
