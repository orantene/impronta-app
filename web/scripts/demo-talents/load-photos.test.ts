/**
 * Photos-only loader against the in-memory fake client. Run:
 *   npx tsx --test scripts/demo-talents/load-photos.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readOnly, type Manifest } from "./foundation-seed-core";
import { FakeDb, fakeClient } from "./test-fake-supabase";
import { HUB } from "./test-fixtures";
import { isLiveDemoCode, loadAllPhotos, loadDemoPhotos, validatePhotos, type PackPhoto, type PhotoCtx } from "./load-photos-core";

const CODE = "TAL-93103";
const ALBUMS_DEF = "def-albums";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-photos-"));
const file = (name: string) => {
  const f = path.join(dir, name);
  if (!fs.existsSync(f)) fs.writeFileSync(f, Buffer.from(`img-${name}`));
  return f;
};

function photoSet(over: Partial<Record<string, PackPhoto>> = {}): PackPhoto[] {
  const base: PackPhoto[] = [
    { file: file("card.jpg"), variant: "card", alt: "Retrato", tag: "headshot", source: "https://unsplash.com/photos/a", photographer: "Ana" },
    { file: file("hero.png"), variant: "hero", alt: "Portada", source: "ai-generated:model:p1" },
    { file: file("g1.jpg"), variant: "gallery", alt: "g1", tag: "portfolio", source: "s1" },
    { file: file("g2.webp"), variant: "gallery", alt: "g2", source: "s2" },
    { file: file("g3.jpeg"), variant: "gallery", alt: "g3", source: "s3" },
  ];
  return base.concat(Object.values(over).filter((x): x is PackPhoto => !!x));
}

type Env = {
  db: FakeDb;
  ctx: PhotoCtx;
  uploads: { path: string; contentType?: string; size: number }[];
  removed: string[];
  manifest: Manifest;
};

function setup(over: { code?: string; demoMarker?: boolean; email?: string; isDemo?: boolean; offerings?: number; noManifest?: boolean; write?: boolean } = {}): Env {
  const code = over.code ?? CODE;
  const db = new FakeDb();
  const uid = `user-${code}`;
  const pid = `tp-${code}`;
  db.users.push({
    id: uid,
    email: over.email ?? "demo-x@demo.tulala.digital",
    app_metadata: over.demoMarker === false ? {} : { demo: true, demo_batch: "demo-2026-09-28" },
    user_metadata: {},
  });
  db.table("talent_profiles").push({ id: pid, profile_code: code, user_id: uid, is_demo: over.isDemo ?? true, services_menu: [{ keep: 1 }], bio_i18n: { es: "bio" } });
  for (let i = 0; i < (over.offerings ?? 4); i += 1) db.table("talent_offerings").push({ id: `off-${i}`, talent_profile_id: pid, sort_order: i, title: `S${i}` });
  db.table("talent_profile_field_values"); // ensure exists
  const manifest: Manifest = {
    batch: "demo-2026-09-28",
    targetRef: "ref",
    entries: over.noManifest
      ? {}
      : { [code]: { profileCode: code, email: "demo-x@demo.tulala.digital", userId: uid, talentProfileId: pid, siteSlug: "", mediaAssetIds: [], storagePaths: [], photoSources: [], createdAt: "x" } },
  };
  const uploads: Env["uploads"] = [];
  const removed: string[] = [];
  const base = fakeClient(db);
  const client = {
    from: base.from.bind(base),
    rpc: base.rpc.bind(base),
    auth: base.auth,
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "media-public");
        return {
          upload: async (p: string, body: Buffer, o: { contentType?: string }) => {
            uploads.push({ path: p, contentType: o.contentType, size: body.length });
            return { data: { path: p }, error: null };
          },
          remove: async (paths: string[]) => {
            removed.push(...paths);
            return { data: null, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  const write = over.write ?? true;
  const ctx: PhotoCtx = {
    admin: write ? client : readOnly(client),
    hubTenantId: HUB,
    albumsFieldId: ALBUMS_DEF,
    manifest,
    saveManifest: () => {},
    log: () => {},
    write,
  };
  return { db, ctx, uploads, removed, manifest };
}

const mutating = (db: FakeDb) => db.ops;

test("dry run writes nothing (read-only client) and plans every upload", async () => {
  const e = setup({ write: false });
  const r = await loadDemoPhotos(e.ctx, CODE, photoSet());
  assert.equal(r.planned.length, 5);
  assert.ok(r.planned.every((p) => p.action === "upload"));
  assert.equal(mutating(e.db).length, 0);
  assert.equal(e.uploads.length, 0);
  assert.equal(e.manifest.entries[CODE].storagePaths.length, 0);
});

test("upload + row shape, storage path, manifest entry and untouched profile", async () => {
  const e = setup();
  const r = await loadDemoPhotos(e.ctx, CODE, photoSet());
  assert.equal(r.uploaded, 5);
  assert.equal(e.uploads.length, 5);
  const re = new RegExp(`^tenant/${HUB}/talent/tp-${CODE}/[0-9a-f-]{36}\\.(jpg|png|webp|jpeg)$`);
  for (const u of e.uploads) assert.match(u.path, re);
  assert.deepEqual(e.uploads.map((u) => u.contentType), ["image/jpeg", "image/png", "image/jpeg", "image/webp", "image/jpeg"]);

  const rows = e.db.table("media_assets");
  assert.equal(rows.length, 5);
  const card = rows.find((x) => x.variant_kind === "card")!;
  assert.equal(card.tenant_id, HUB);
  assert.equal(card.owner_talent_profile_id, `tp-${CODE}`);
  assert.equal(card.bucket_id, "media-public");
  assert.equal(card.approval_state, "approved");
  assert.equal(card.purpose, "talent");
  assert.equal(card.ownership_kind, "talent");
  assert.equal(card.owner_tenant_id, null);
  assert.equal(card.uploaded_by_user_id, `user-${CODE}`);
  assert.equal(card.created_by, `user-${CODE}`);
  assert.equal(card.mime_type, "image/jpeg");
  assert.equal(card.file_size, Buffer.byteLength("img-card.jpg"));
  assert.deepEqual(card.tags, ["headshot"]);
  assert.equal(card.attribution_note, "Ana · https://unsplash.com/photos/a");
  assert.deepEqual(card.metadata, { source: "https://unsplash.com/photos/a", photographer: "Ana", demo_batch: "demo-2026-09-28" });
  const hero = rows.find((x) => x.variant_kind === "hero")!;
  assert.equal(hero.mime_type, "image/png");
  assert.equal(hero.attribution_note, "ai-generated:model:p1");
  assert.deepEqual(hero.tags, []);
  const gallery = rows.filter((x) => x.variant_kind === "gallery");
  assert.deepEqual(gallery.map((g) => g.sort_order), [0, 1, 2]);
  assert.ok(gallery.every((g) => (g.metadata as Record<string, unknown>).albumId === "main"));

  const entry = e.manifest.entries[CODE];
  assert.equal(entry.storagePaths.length, 5);
  assert.deepEqual(entry.mediaAssetIds.sort(), rows.map((x) => x.id as string).sort());
  assert.equal(entry.photoSources.length, 5);

  // Only these tables were written.
  const tables = new Set(e.db.ops.map((o) => o.table));
  assert.deepEqual([...tables].sort(), ["media_assets", "talent_offering_media", "talent_profile_field_values"]);
  assert.deepEqual(e.db.table("talent_profiles")[0].services_menu, [{ keep: 1 }]);
  assert.deepEqual(e.db.authCalls, [], "no auth writes");
});

test("polaroid rows carry polaroidSlot", async () => {
  const e = setup();
  await loadDemoPhotos(e.ctx, CODE, [...photoSet(), { file: file("p1.jpg"), variant: "polaroid", alt: "front", source: "s", polaroidSlot: "p-front" }]);
  const p = e.db.table("media_assets").find((x) => x.variant_kind === "polaroid")!;
  assert.equal((p.metadata as Record<string, unknown>).polaroidSlot, "p-front");
});

test("albums.list is written only when the demo has none", async () => {
  const e = setup();
  await loadDemoPhotos(e.ctx, CODE, photoSet());
  const v = e.db.table("talent_profile_field_values");
  assert.equal(v.length, 1);
  assert.deepEqual(v[0], { tenant_id: HUB, talent_profile_id: `tp-${CODE}`, field_definition_id: ALBUMS_DEF, value: [{ id: "main", name: "Main", sortOrder: 0 }], workflow_state: "live", last_edited_role: "platform", id: v[0].id });

  const e2 = setup();
  const custom = [{ id: "a", name: "Mine", sortOrder: 0 }];
  e2.db.table("talent_profile_field_values").push({ id: "fv", talent_profile_id: `tp-${CODE}`, field_definition_id: ALBUMS_DEF, value: custom });
  await loadDemoPhotos(e2.ctx, CODE, photoSet());
  assert.deepEqual(e2.db.table("talent_profile_field_values")[0].value, custom);
  assert.equal(e2.db.writesTo("talent_profile_field_values").length, 0);
});

test("offering links: one per offering, round robin, existing links skipped", async () => {
  const e = setup({ offerings: 4 });
  e.db.table("talent_offering_media").push({ offering_id: "off-1", media_asset_id: "other", sort_order: 0 });
  const r = await loadDemoPhotos(e.ctx, CODE, photoSet());
  assert.equal(r.linksWritten, 3);
  const links = e.db.table("talent_offering_media");
  assert.equal(links.length, 4);
  assert.equal(links.filter((l) => l.offering_id === "off-1").length, 1, "existing link kept, none added");
  const galleryIds = e.db.table("media_assets").filter((x) => x.variant_kind === "gallery").map((x) => x.id);
  assert.equal(links.find((l) => l.offering_id === "off-0")!.media_asset_id, galleryIds[0]);
  assert.equal(links.find((l) => l.offering_id === "off-3")!.media_asset_id, galleryIds[0], "wraps round robin");
  assert.ok(links.every((l) => l.sort_order === 0));
  assert.equal(e.db.table("talent_offerings").length, 4);
  assert.equal(e.db.writesTo("talent_offerings").length, 0);
});

test("second run is idempotent: everything skipped, nothing written", async () => {
  const e = setup();
  await loadDemoPhotos(e.ctx, CODE, photoSet());
  const opsBefore = e.db.ops.length;
  const r = await loadDemoPhotos(e.ctx, CODE, photoSet());
  assert.ok(r.planned.every((p) => p.action === "skip"));
  assert.equal(r.uploaded, 0);
  assert.equal(e.uploads.length, 5);
  assert.equal(e.db.table("media_assets").length, 5);
  assert.equal(e.db.ops.slice(opsBefore).filter((o) => o.table === "media_assets").length, 0);
  assert.equal(e.db.table("talent_offering_media").length, 4);
});

test("a variant already loaded is skipped while a new variant still loads", async () => {
  const e = setup();
  await loadDemoPhotos(e.ctx, CODE, photoSet());
  const r = await loadDemoPhotos(e.ctx, CODE, [...photoSet(), { file: file("p2.jpg"), variant: "polaroid", alt: "side", source: "s", polaroidSlot: "p-side" }]);
  assert.equal(r.uploaded, 1);
  assert.equal(e.db.table("media_assets").length, 6);
});

test("--replace soft-deletes the previous demo-batch rows, removes storage, loads the new set", async () => {
  const e = setup();
  await loadDemoPhotos(e.ctx, CODE, photoSet());
  const oldRows = e.db.table("media_assets").map((x) => ({ id: x.id as string, path: x.storage_path as string }));
  const oldLinks = e.db.table("talent_offering_media").length;
  const rr = await loadDemoPhotos({ ...e.ctx, replace: true }, CODE, photoSet());
  assert.equal(rr.replacedIds.length, 5);
  assert.deepEqual(e.removed.sort(), oldRows.map((o) => o.path).sort());
  const all = e.db.table("media_assets");
  assert.equal(all.length, 10);
  const soft = all.filter((x) => x.deleted_at);
  assert.deepEqual(soft.map((x) => x.id).sort(), oldRows.map((o) => o.id).sort());
  assert.equal(all.filter((x) => !x.deleted_at).length, 5);
  const entry = e.manifest.entries[CODE];
  assert.equal(entry.storagePaths.length, 5);
  assert.ok(entry.storagePaths.every((p) => !oldRows.some((o) => o.path === p)));
  assert.equal(entry.mediaAssetIds.length, 5);
  // links re-point to live media
  const links = e.db.table("talent_offering_media");
  assert.equal(links.length, oldLinks);
  const liveIds = new Set(all.filter((x) => !x.deleted_at).map((x) => x.id));
  assert.ok(links.every((l) => liveIds.has(l.media_asset_id)));
});

test("--replace leaves photos that were not demo-batch alone", async () => {
  const e = setup();
  e.db.table("media_assets").push({ id: "manual", owner_talent_profile_id: `tp-${CODE}`, variant_kind: "card", approval_state: "approved", storage_path: "x/y.jpg", metadata: {}, deleted_at: null });
  const r = await loadDemoPhotos({ ...e.ctx, replace: true }, CODE, photoSet());
  assert.equal(r.replacedIds.length, 0);
  assert.ok(e.db.table("media_assets").find((x) => x.id === "manual" && !x.deleted_at));
  assert.equal(e.removed.length, 0);
});

test("guards: non-demo profile, missing demo marker, bad email, missing manifest entry, live codes", async () => {
  await assert.rejects(loadDemoPhotos(setup({ isDemo: false }).ctx, CODE, photoSet()), /REFUSE.*not the demo/);
  await assert.rejects(loadDemoPhotos(setup({ demoMarker: false }).ctx, CODE, photoSet()), /demo_batch/);
  await assert.rejects(loadDemoPhotos(setup({ email: "real@gmail.com" }).ctx, CODE, photoSet()), /demo domain/);
  await assert.rejects(loadDemoPhotos(setup({ noManifest: true }).ctx, CODE, photoSet()), /not in the manifest/);
  await assert.rejects(loadDemoPhotos(setup({ code: "TAL-12345" }).ctx, "TAL-12345", photoSet()), /not a demo code/);
  for (const live of ["TAL-93001", "TAL-93010", "TAL-93900"]) {
    const e = setup({ code: live });
    await assert.rejects(loadDemoPhotos(e.ctx, live, photoSet()), /live demo/);
    assert.equal(e.uploads.length, 0);
    assert.equal(e.db.ops.length, 0);
  }
  const ok = setup({ code: "TAL-93003" });
  const r = await loadDemoPhotos({ ...ok.ctx, includeLive: true }, "TAL-93003", photoSet());
  assert.equal(r.uploaded, 5);
  assert.equal(isLiveDemoCode("TAL-93011"), false);
  assert.equal(isLiveDemoCode("TAL-93900"), true);
});

test("a refusal writes nothing, even after earlier demos in the run passed", async () => {
  const e = setup();
  // Second demo (not a demo profile) added to the same db to build a two-demo run.
  e.db.table("talent_profiles").push({ id: "tp-TAL-93104", profile_code: "TAL-93104", user_id: "u2", is_demo: false });
  e.db.users.push({ id: "u2", email: "b@demo.tulala.digital", app_metadata: { demo_batch: "demo-2026-09-28" }, user_metadata: {} });
  e.manifest.entries["TAL-93104"] = { ...e.manifest.entries[CODE], profileCode: "TAL-93104", userId: "u2", talentProfileId: "tp-TAL-93104", storagePaths: [], mediaAssetIds: [], photoSources: [] };
  await assert.rejects(loadAllPhotos(e.ctx, { [CODE]: { photos: photoSet() }, "TAL-93104": { photos: photoSet() } }), /TAL-93104/);
  assert.equal(e.uploads.length, 0);
  assert.equal(e.db.ops.length, 0);
});

test("--only selects codes and rejects unknown ones", async () => {
  const e = setup();
  await assert.rejects(loadAllPhotos(e.ctx, { [CODE]: { photos: photoSet() } }, ["TAL-93199"]), /not in the pack/);
  const r = await loadAllPhotos(e.ctx, { [CODE]: { photos: photoSet() } }, [CODE]);
  assert.equal(r.length, 1);
});

test("validation: missing file, extension, source, variant counts, gallery minimum, polaroid slot", () => {
  const ok = photoSet();
  assert.deepEqual(validatePhotos(CODE, ok), { problems: [], warnings: [] });
  const bad = (ph: PackPhoto[], strict = false) => validatePhotos(CODE, ph, { strict });
  assert.match(bad([{ ...ok[0], file: path.join(dir, "nope.jpg") }, ...ok.slice(1)]).problems[0], /does not exist/);
  assert.match(bad([{ ...ok[0], file: path.join(dir, "x.gif") }, ...ok.slice(1)]).problems[0], /extension/);
  assert.match(bad([{ ...ok[0], source: " " }, ...ok.slice(1)]).problems[0], /source is required/);
  assert.match(bad([...ok, { ...ok[0] }]).problems.join(), /at most 1 card/);
  assert.match(bad([...ok, { ...ok[1] }]).problems.join(), /at most 1 hero/);
  assert.match(bad([{ ...ok[0], variant: "banner" as never }, ...ok.slice(1)]).problems.join(), /variant must be/);
  assert.match(bad([...ok, { ...ok[2], variant: "polaroid" }]).problems.join(), /polaroidSlot/);
  const few = ok.slice(0, 4);
  assert.equal(bad(few).problems.length, 0);
  assert.match(bad(few).warnings[0], /gallery/);
  assert.match(bad(few, true).problems[0], /gallery/);
  assert.match(validatePhotos("TAL-1", ok).problems[0], /not a demo code/);
  assert.match(validatePhotos(CODE, []).problems[0], /no photos/);
});

test("validation errors refuse before any write", async () => {
  const e = setup();
  await assert.rejects(loadDemoPhotos(e.ctx, CODE, [{ ...photoSet()[0], source: "" }]), /REFUSE/);
  await assert.rejects(loadDemoPhotos({ ...e.ctx, strict: true }, CODE, photoSet().slice(0, 4)), /gallery/);
  assert.equal(e.db.ops.length, 0);
  assert.equal(e.uploads.length, 0);
});
