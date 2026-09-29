/**
 * Seeder behaviour against an in-memory database: what a new demo gets, what a
 * live demo must NOT get changed, that the password never leaves the auth call,
 * idempotent re-runs, and the read-only client. Run:
 *   npx tsx --test scripts/demo-talents/foundation-seed.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkDemoUser,
  loadAuthUsers,
  mergeStatus,
  readOnly,
  removeDemos,
  seedDemo,
  validateDemo,
} from "./foundation-seed-core";
import { verifyDemo } from "./foundation-verify";
import { buildFieldValuePlan } from "./foundation-plan";
import { resolveRunMode } from "./foundation-cli";
import { PW, addExistingLive, harness, makeDemo } from "./test-fixtures";
import { FakeDb, fakeClient } from "./test-fake-supabase";

const LIVE_ONLY_UNTOUCHED = ["talent_sites", "talent_pages", "agency_talent_roster", "talent_service_areas"];

test("new demo: auth user, profile, four offerings, taxonomy, field values, languages, hours, roster and a DRAFT site", async () => {
  const h = await harness();
  const d = makeDemo();
  const status = await seedDemo(h.ctx, d);

  const user = h.db.users.find((u) => u.email === d.email)!;
  assert.ok(user, "auth user created");
  assert.deepEqual(user.app_metadata, { demo: true, demo_batch: "demo-2026-09-28" });
  const create = h.db.authCalls.find((c) => c.method === "createUser")!.args as { email_confirm: boolean };
  assert.equal(create.email_confirm, true);

  const tp = h.db.table("talent_profiles")[0];
  assert.equal(tp.profile_code, "TAL-93103");
  assert.equal(tp.user_id, user.id);
  assert.equal(tp.is_demo, true);
  assert.equal(tp.public_slug_part, "itzel-canche");
  assert.equal(tp.height_cm, 162, "height mirrored to the column");
  assert.equal(tp.location_id, "loc-playa");
  assert.deepEqual(tp.booking_terms, { directBookingOptIn: true });

  const offers = h.db.table("talent_offerings");
  assert.equal(offers.length, 4);
  assert.deepEqual(offers.map((o) => o.booking_mode), ["instant", "request", "request", "request"]);
  assert.equal(offers[3].price_display, "quote");
  assert.equal(offers[3].amount_cents, 120000);

  assert.deepEqual(h.db.table("talent_profile_taxonomy").map((t) => [t.taxonomy_term_id, t.relationship_type]), [["term-nail", "primary_role"]]);

  const fvs = h.db.table("talent_profile_field_values");
  assert.ok(fvs.length > 15);
  assert.ok(fvs.every((r) => r.tenant_id === "hub-tenant-1" && r.workflow_state === "live" && r.talent_profile_id === tp.id));
  assert.equal(new Set(fvs.map((r) => r.field_definition_id)).size, fvs.length, "one row per talent x field");

  assert.equal(h.db.table("talent_languages").length, 2);
  assert.equal(h.db.rpcCalls[0].name, "replace_talent_languages");
  assert.equal(h.db.table("talent_booking_hours").length, 1);
  assert.equal(h.db.table("agency_talent_roster").length, 1);
  assert.deepEqual(h.db.table("talent_service_areas").map((a) => a.service_kind), ["home_base", "travel_to"]);
  assert.equal(h.db.table("talent_service_areas")[0].notes, "Centro");

  // The site exists and is a draft: nothing published.
  const site = h.db.table("talent_sites")[0];
  assert.equal(site.status, "draft");
  assert.equal(site.site_slug, "itzel-canche");
  assert.equal(site.site_published_at, undefined);
  assert.equal(site.published_at, undefined);
  assert.equal(site.shell_published, undefined);
  const page = h.db.table("talent_pages")[0];
  assert.equal(page.status, "draft");
  assert.equal(page.published_at, undefined);

  assert.equal(status.site_published, false);
  assert.equal(status.offerings, 4);
  assert.equal(status.completeness, "12/16");
  assert.equal(status.site_slug, "itzel-canche");
  assert.equal(h.statuses.length, 1);
  assert.equal(h.manifest.entries["TAL-93103"].offeringIds!.length, 4);
  assert.equal(h.manifest.entries["TAL-93103"].talentProfileId, tp.id);
});

test("password: the one shared password is set in its own auth call, and appears nowhere else", async () => {
  const h = await harness();
  const d = makeDemo();
  await seedDemo(h.ctx, d);
  const pwCalls = h.db.authCalls.filter((c) => JSON.stringify(c.args).includes(PW));
  assert.equal(pwCalls.length, 1);
  assert.equal(pwCalls[0].method, "updateUserById");
  assert.deepEqual(Object.keys(pwCalls[0].args as object).sort(), ["id", "password"]);
  assert.equal((pwCalls[0].args as { password: string }).password, PW);
  // Not in any table row, any log line, the manifest or the status entries.
  assert.ok(!JSON.stringify(h.db.tables).includes(PW));
  assert.ok(!h.logs.join("\n").includes(PW));
  assert.ok(!JSON.stringify(h.manifest).includes(PW));
  assert.ok(!JSON.stringify(h.statuses).includes(PW));
  assert.ok(!JSON.stringify(h.db.ops).includes(PW));
  const createArgs = JSON.stringify(h.db.authCalls.find((c) => c.method === "createUser")!.args);
  assert.ok(!createArgs.includes(PW), "createUser never carries the password");
});

test("password: an auth error message is redacted before it is thrown", async () => {
  const h = await harness();
  const real = h.admin.auth.admin.updateUserById.bind(h.admin.auth.admin);
  let calls = 0;
  h.admin.auth.admin.updateUserById = (async (id: string, attrs: Record<string, unknown>) => {
    calls += 1;
    if (attrs.password) return { data: { user: null }, error: { message: `weak password ${attrs.password as string}` } };
    return real(id, attrs);
  }) as typeof h.admin.auth.admin.updateUserById;
  await assert.rejects(
    () => seedDemo(h.ctx, makeDemo()),
    (e: Error) => {
      assert.ok(!e.message.includes(PW), e.message);
      assert.match(e.message, /redacted/);
      return true;
    },
  );
  assert.ok(calls >= 1);
});

test("a user that exists without the demo marker is refused, before anything is written", async () => {
  const h = await harness();
  const d = makeDemo();
  addExistingLive(h.db, d, { demoMarker: false });
  h.ctx.auth = await loadAuthUsers(h.admin);
  await assert.rejects(() => seedDemo(h.ctx, d), /REFUSE.*not a demo-2026-09-28 demo user/);
  assert.equal(h.db.ops.length, 0);
  assert.throws(() => checkDemoUser(h.ctx.auth, d.email), /REFUSE/);
});

test("a profile code owned by a real (non-demo) profile is refused", async () => {
  const h = await harness();
  const d = makeDemo();
  const { profileId } = addExistingLive(h.db, d);
  h.db.table("talent_profiles").find((r) => r.id === profileId)!.is_demo = false;
  h.ctx.auth = await loadAuthUsers(h.admin);
  await assert.rejects(() => seedDemo(h.ctx, d), /not a demo profile/);
});

test("a missing taxonomy term stops the seed and names the migration", async () => {
  const h = await harness({ withTerm: false });
  await assert.rejects(() => seedDemo(h.ctx, makeDemo()), /taxonomy term not found: nail-artist.*20261231298100/);
  assert.equal(h.db.ops.length, 0);
});

const liveDemo = () => makeDemo({ isLive: true, profileCode: "TAL-93003", email: "demo-camila-unas@impronta.test", siteSlug: "camila-nails", displayName: "Camila Rivas", firstName: "Camila", lastName: "Rivas", city: "Guadalajara" });

/** A live demo the way production has it: curated offering, menu, hours, site, photo, one field value already set. */
function curatedLive(h: Awaited<ReturnType<typeof harness>>, d = liveDemo()) {
  const ids = addExistingLive(h.db, d);
  h.db.table("talent_offerings").push({ id: "off-1", talent_profile_id: ids.profileId, title: "Designed rate card", currency: "MXN", amount_cents: 999, sort_order: 0 });
  h.db.table("talent_booking_hours").push({ talent_profile_id: ids.profileId, slot_minutes: 45 });
  h.db.table("media_assets").push({ id: "m1", owner_talent_profile_id: ids.profileId, variant_kind: "gallery" });
  const tp = h.db.table("talent_profiles").find((r) => r.id === ids.profileId)!;
  tp.services_menu = [{ name: "Designed" }];
  tp.bio_i18n = { es: "Bio curada" };
  const heightDef = [...h.ctx.fieldDefs.values()].find((f) => f.field_key === "physical.height_cm")!;
  h.db.table("talent_profile_field_values").push({ talent_profile_id: ids.profileId, field_definition_id: heightDef.id, value: 170, tenant_id: "hub-tenant-1" });
  return { ...ids, tp, heightDef };
}

const LIVE_UNTOUCHED = ["talent_offerings", "talent_booking_hours", "talent_sites", "talent_pages", "agency_talent_roster", "talent_service_areas", "media_assets", "talent_offering_media", "talent_profile_taxonomy", "talent_languages", "profiles"];

test("live demo, default: nothing curated is touched, no password, no auth change", async () => {
  const h = await harness();
  const d = liveDemo();
  const { profileId, tp } = curatedLive(h, d);
  h.ctx.auth = await loadAuthUsers(h.admin);
  const snapshot = JSON.stringify({ o: h.db.table("talent_offerings"), s: h.db.table("talent_sites"), hrs: h.db.table("talent_booking_hours"), m: h.db.table("media_assets"), menu: tp.services_menu, name: [tp.display_name, tp.home_city_text, tp.visibility, tp.booking_terms, tp.selling_defaults] });

  await seedDemo(h.ctx, d);

  for (const t of LIVE_UNTOUCHED) assert.equal(h.db.writesTo(t).length, 0, `${t} must not be written for a live demo`);
  assert.equal(h.db.authCalls.filter((c) => c.method !== "listUsers").length, 0, "no auth call at all: no password, no metadata");
  assert.equal(JSON.stringify({ o: h.db.table("talent_offerings"), s: h.db.table("talent_sites"), hrs: h.db.table("talent_booking_hours"), m: h.db.table("media_assets"), menu: tp.services_menu, name: [tp.display_name, tp.home_city_text, tp.visibility, tp.booking_terms, tp.selling_defaults] }), snapshot);
  assert.ok(!JSON.stringify(h.db.ops).includes(PW));
  // Only missing field values were added; the existing height value was not overwritten.
  const fvs = h.db.table("talent_profile_field_values").filter((r) => r.talent_profile_id === profileId);
  const heightDef = [...h.ctx.fieldDefs.values()].find((f) => f.field_key === "physical.height_cm")!;
  assert.equal(fvs.find((r) => r.field_definition_id === heightDef.id)!.value, 170, "existing value never overwritten");
  assert.ok(fvs.length > 15, "missing values were added");
  assert.equal(h.db.writesTo("talent_profile_field_values").every((o) => o.op === "insert"), true, "insert only, never upsert or delete");
  // The one profile write: English bio when missing, keeping the curated Spanish one.
  assert.deepEqual(tp.bio_i18n, { es: "Bio curada", en: d.bioEn });
  assert.equal(h.statuses[0].offerings, 1);
  assert.equal(h.statuses[0].photos, 1);
  assert.equal(h.statuses[0].site_published, true);
});

test("live demo, default: a second run adds nothing, and an existing English bio is kept", async () => {
  const h = await harness();
  const d = liveDemo();
  const { tp } = curatedLive(h, d);
  tp.bio_i18n = { es: "x", en: "Curated English" };
  h.ctx.auth = await loadAuthUsers(h.admin);
  await seedDemo(h.ctx, d);
  const after = h.db.table("talent_profile_field_values").length;
  const opsBefore = h.db.ops.length;
  await seedDemo(h.ctx, d);
  assert.equal(h.db.table("talent_profile_field_values").length, after);
  assert.equal(h.db.ops.slice(opsBefore).filter((o) => o.op !== "update").length, 0);
  assert.equal((tp.bio_i18n as { en: string }).en, "Curated English");
});

test("live demo with --set-live-password: only the password call is added", async () => {
  const h = await harness();
  const d = liveDemo();
  const { uid } = curatedLive(h, d);
  h.ctx.auth = await loadAuthUsers(h.admin);
  h.ctx.setLivePassword = true;
  await seedDemo(h.ctx, d);
  const calls = h.db.authCalls.filter((c) => c.method !== "listUsers");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { id: uid, password: PW });
  assert.ok(!JSON.stringify(h.logs).includes(PW));
  assert.equal(h.db.writesTo("talent_offerings").length, 0);
});

test("live demo with --include-live-content: content is replaced, but name, city, email, site and photos still are not", async () => {
  const h = await harness();
  const d = liveDemo();
  const { uid, profileId, tp } = curatedLive(h, d);
  h.ctx.auth = await loadAuthUsers(h.admin);
  h.ctx.includeLiveContent = true;
  const before = JSON.stringify(h.db.table("talent_sites"));

  await seedDemo(h.ctx, d);

  for (const t of ["talent_sites", "talent_pages", "agency_talent_roster", "talent_service_areas", "media_assets"]) assert.equal(h.db.writesTo(t).length, 0, `${t}`);
  assert.equal(JSON.stringify(h.db.table("talent_sites")), before);
  assert.equal(h.db.authCalls.filter((c) => c.method === "createUser").length, 0);
  assert.equal(h.db.authCalls.filter((c) => "password" in (c.args as object)).length, 0, "password still needs --set-live-password");
  assert.equal(tp.display_name, "Camila Rivas");
  assert.equal(tp.home_city_text, "Guadalajara");
  assert.equal(tp.visibility, "public");
  assert.equal(tp.user_id, uid);
  assert.equal((tp.bio_i18n as { es: string }).es, d.bio);
  const offers = h.db.table("talent_offerings").filter((o) => o.talent_profile_id === profileId);
  assert.equal(offers.length, 4, "curated offering replaced by the workbook's four");
  assert.deepEqual(tp.booking_terms, { depositPct: 10, directBookingOptIn: true });
  assert.equal(h.statuses[0].site_slug, "camila-nails");
});

test("live demo without an auth user is refused rather than created", async () => {
  const h = await harness();
  const d = makeDemo({ isLive: true, profileCode: "TAL-93003", email: "demo-camila-unas@impronta.test" });
  await assert.rejects(() => seedDemo(h.ctx, d), /live demo TAL-93003 has no auth user/);
});

test("re-running a new demo is idempotent: same rows, one site, no duplicates, existing site untouched", async () => {
  const h = await harness();
  const d = makeDemo();
  await seedDemo(h.ctx, d);
  const site = h.db.table("talent_sites")[0];
  // Someone applies a theme and publishes between runs.
  site.status = "published";
  site.site_published_at = "2026-10-01T00:00:00Z";
  site.shell_tree = [{ themed: true }];
  const siteBefore = JSON.stringify(site);
  const counts = () => ({
    offers: h.db.table("talent_offerings").length,
    fvs: h.db.table("talent_profile_field_values").length,
    langs: h.db.table("talent_languages").length,
    profiles: h.db.table("talent_profiles").length,
    users: h.db.users.length,
    sites: h.db.table("talent_sites").length,
    pages: h.db.table("talent_pages").length,
    roster: h.db.table("agency_talent_roster").length,
    areas: h.db.table("talent_service_areas").length,
    tax: h.db.table("talent_profile_taxonomy").length,
    hours: h.db.table("talent_booking_hours").length,
  });
  const first = counts();
  h.ctx.auth = await loadAuthUsers(h.admin);
  h.ctx.namespace.siteSlugs.add("itzel-canche");
  await seedDemo(h.ctx, d);
  assert.deepEqual(counts(), first);
  assert.equal(JSON.stringify(h.db.table("talent_sites")[0]), siteBefore, "published site never rewritten");
  assert.equal(h.statuses[1].site_published, true);
  assert.equal(h.statuses[1].site_slug, "itzel-canche");
});

test("re-run drops a field value the workbook no longer has, and leaves values it does not own", async () => {
  const h = await harness();
  const d = makeDemo();
  await seedDemo(h.ctx, d);
  const tp = h.db.table("talent_profiles")[0];
  // A value the person added on a key the seeder does not manage stays.
  h.db.table("talent_profile_field_values").push({ talent_profile_id: tp.id, field_definition_id: "foreign-def", value: "keep", tenant_id: "hub-tenant-1" });
  const d2 = makeDemo({ typeFields: { ...d.typeFields, "wellness.max_per_session": "" } });
  h.ctx.auth = await loadAuthUsers(h.admin);
  await seedDemo(h.ctx, d2);
  const ids = new Set(h.db.table("talent_profile_field_values").map((r) => r.field_definition_id));
  const maxId = [...h.ctx.fieldDefs.values()].find((f) => f.field_key === "wellness.max_per_session")!.id;
  assert.ok(!ids.has(maxId), "dropped");
  assert.ok(ids.has("foreign-def"), "foreign value kept");
});

test("a different primary type is replaced, never duplicated", async () => {
  const h = await harness();
  const d = makeDemo();
  await seedDemo(h.ctx, d);
  const tp = h.db.table("talent_profiles")[0];
  h.db.table("talent_profile_taxonomy")[0].taxonomy_term_id = "term-model";
  h.ctx.auth = await loadAuthUsers(h.admin);
  await seedDemo(h.ctx, d);
  const rows = h.db.table("talent_profile_taxonomy").filter((r) => r.talent_profile_id === tp.id);
  assert.deepEqual(rows.map((r) => r.taxonomy_term_id), ["term-nail"]);
});

test("a demo without hours gets no booking-hours row and no opt-in", async () => {
  const h = await harness();
  const d = makeDemo({ hours: null, services: makeDemo().services.map((s) => ({ ...s, mode: s.mode === "instant" ? ("request" as const) : s.mode })) });
  await seedDemo(h.ctx, d);
  assert.equal(h.db.table("talent_booking_hours").length, 0);
  assert.equal(h.db.table("talent_profiles")[0].booking_terms, null);
  assert.equal(h.db.table("talent_profiles")[0].availability_data, undefined);
});

test("a city without a locations row skips the service areas but still seeds the profile", async () => {
  const h = await harness();
  await seedDemo(h.ctx, makeDemo({ city: "Ciudad Inventada" }));
  assert.equal(h.db.table("talent_service_areas").length, 0);
  assert.equal(h.db.table("talent_profiles")[0].home_city_text, "Ciudad Inventada");
  assert.ok(h.logs.some((l) => l.includes("no location for city")));
});

test("two new demos with the same name get different site slugs", async () => {
  const h = await harness();
  const a = makeDemo();
  const b = makeDemo({ demoId: "DEMO004", profileCode: "TAL-93104", email: "demo-nails-004@demo.tulala.digital" });
  await seedDemo(h.ctx, a);
  await seedDemo(h.ctx, b);
  assert.deepEqual(h.db.table("talent_sites").map((s) => s.site_slug), ["itzel-canche", "itzel-canche-2"]);
});

// ── Dry run / read-only ─────────────────────────────────────────────────────

test("readOnly client: reads pass, every write, rpc and storage call throws", async () => {
  const db = new FakeDb();
  db.table("agencies").push({ id: "a" });
  const ro = readOnly(fakeClient(db));
  const { data } = await ro.from("agencies").select("id");
  assert.equal((data as unknown[]).length, 1);
  assert.throws(() => ro.from("agencies").insert({ id: "b" }), /READ-ONLY/);
  assert.throws(() => ro.from("agencies").update({ id: "b" }), /READ-ONLY/);
  assert.throws(() => ro.from("agencies").upsert({ id: "b" }), /READ-ONLY/);
  assert.throws(() => ro.from("agencies").delete(), /READ-ONLY/);
  assert.throws(() => ro.rpc("replace_talent_languages"), /READ-ONLY/);
  assert.throws(() => ro.storage, /READ-ONLY/);
  assert.throws(() => ro.auth.admin.createUser({ email: "x" }), /READ-ONLY/);
  assert.throws(() => ro.auth.admin.updateUserById("x", { password: "y" }), /READ-ONLY/);
  assert.throws(() => ro.auth.admin.deleteUser("x"), /READ-ONLY/);
  assert.equal(db.ops.length, 0);
  assert.equal((await ro.auth.admin.listUsers({ page: 1, perPage: 10 })).data.users.length, 0);
});

test("dry run: validateDemo reports counts and problems and writes nothing", async () => {
  const h = await harness();
  const ro = readOnly(h.admin);
  const ctx = { ...h.ctx, admin: ro };
  const good = await validateDemo(ctx, makeDemo());
  assert.deepEqual(good.problems, []);
  assert.equal(good.counts.talent_offerings, 4);
  assert.equal(good.counts.talent_sites, 1);
  assert.equal(good.counts.talent_booking_hours, 1);
  assert.equal(good.slug, "itzel-canche");
  assert.equal(good.fieldValues, good.counts.talent_profile_field_values);

  const bad = await validateDemo({ ...ctx, termIds: new Map() }, makeDemo({ typeFields: { "made.up": "x" } }));
  assert.ok(bad.problems.some((p) => /taxonomy slug "nail-artist" not found.*20261231298100/.test(p)));
  assert.ok(bad.problems.some((p) => p.includes("no field definition for made.up")));
  assert.equal(h.db.ops.length, 0, "nothing written");
  assert.equal(h.db.authCalls.filter((c) => c.method !== "listUsers").length, 0);
});

test("dry run flags a non-demo auth user and a live demo without a profile", async () => {
  const h = await harness();
  const d = makeDemo();
  addExistingLive(h.db, d, { demoMarker: false });
  h.ctx.auth = await loadAuthUsers(h.admin);
  const r = await validateDemo({ ...h.ctx, admin: readOnly(h.admin) }, d);
  assert.ok(r.problems.some((p) => /REFUSE/.test(p)));
  const live = await validateDemo({ ...h.ctx, admin: readOnly(h.admin) }, makeDemo({ isLive: true, profileCode: "TAL-93009", email: "z@impronta.test" }));
  assert.ok(live.problems.some((p) => /no auth user/.test(p)));
  assert.ok(live.problems.some((p) => /no profile row/.test(p)));
});

// ── Verify ──────────────────────────────────────────────────────────────────

function verifyCtx(h: Awaited<ReturnType<typeof harness>>) {
  return {
    admin: readOnly(h.admin),
    hubTenantId: h.ctx.hubTenantId,
    termIds: h.ctx.termIds,
    fieldDefs: h.ctx.fieldDefs,
    authByEmail: new Map(h.db.users.map((u) => [u.email.toLowerCase(), u as never])),
    locations: h.ctx.locations,
    now: h.ctx.now,
  };
}

test("verify: a freshly seeded demo passes; sign-in is attempted with the shared password and the error is redacted", async () => {
  const h = await harness();
  const d = makeDemo();
  await seedDemo(h.ctx, d);
  const attempts: string[] = [];
  const bad = await verifyDemo(
    {
      ...verifyCtx(h),
      password: PW,
      signIn: async (email, password) => {
        attempts.push(email);
        assert.equal(password, PW);
        return null;
      },
    },
    d,
  );
  assert.deepEqual(bad, []);
  assert.deepEqual(attempts, [d.email]);

  const failing = await verifyDemo({ ...verifyCtx(h), password: PW, signIn: async (_e, p) => `Invalid login for ${p}` }, d);
  assert.equal(failing.length, 1);
  assert.match(failing[0], /sign-in failed/);
  assert.ok(!failing[0].includes(PW));
});

test("verify: catches a missing offering, wrong hours, a published draft, missing taxonomy and a missing marker", async () => {
  const h = await harness();
  const d = makeDemo();
  await seedDemo(h.ctx, d);

  h.db.tables.talent_offerings = h.db.table("talent_offerings").slice(1);
  h.db.table("talent_booking_hours")[0].slot_minutes = 15;
  h.db.table("talent_sites")[0].status = "published";
  h.db.tables.talent_profile_taxonomy = [];
  h.db.table("talent_profile_field_values").pop();
  h.db.users[0].app_metadata = {};
  const bad = await verifyDemo(verifyCtx(h), d);
  const text = bad.join("\n");
  assert.match(text, /3 offerings, expected 4/);
  assert.match(text, /booking hours slot_minutes/);
  assert.match(text, /site is published/);
  assert.match(text, /primary_role is not nail-artist/);
  assert.match(text, /field values, expected/);
  assert.match(text, /no demo marker/);
});

test("verify: booking hours must not exist when the workbook has none", async () => {
  const h = await harness();
  const d = makeDemo({ hours: null, services: makeDemo().services.map((s) => ({ ...s, mode: s.mode === "instant" ? ("request" as const) : s.mode })) });
  await seedDemo(h.ctx, d);
  assert.deepEqual(await verifyDemo(verifyCtx(h), d), []);
  h.db.table("talent_booking_hours").push({ talent_profile_id: h.db.table("talent_profiles")[0].id });
  assert.match((await verifyDemo(verifyCtx(h), d)).join("\n"), /booking hours exist but the workbook has none/);
});

// ── Remove, status file ─────────────────────────────────────────────────────

test("remove: refuses live demos and takes a seeded demo out including the new tables", async () => {
  const h = await harness();
  const d = makeDemo();
  await seedDemo(h.ctx, d);
  await assert.rejects(() => removeDemos(h.ctx, ["TAL-93003"], new Set(["TAL-93003"])), /live demo/);
  await removeDemos(h.ctx, ["TAL-93103"], new Set(["TAL-93003"]));
  for (const t of ["talent_profiles", "talent_offerings", "talent_profile_field_values", "talent_languages", "talent_service_areas", "talent_sites", "talent_pages", "talent_booking_hours", "agency_talent_roster", "talent_profile_taxonomy"]) {
    assert.equal(h.db.table(t).length, 0, `${t} emptied`);
  }
  assert.equal(h.db.users.length, 0);
  assert.equal(h.manifest.entries["TAL-93103"], undefined);
});

test("remove: refuses an entry whose auth user is not a demo user", async () => {
  const h = await harness();
  await seedDemo(h.ctx, makeDemo());
  h.db.users[0].app_metadata = {};
  await assert.rejects(() => removeDemos(h.ctx, ["TAL-93103"], new Set()), /REFUSE.*not a demo user/);
});

test("status.json: merged per demo id, no secrets, overwritten on re-run", async () => {
  const h = await harness();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "status-"));
  const file = path.join(dir, "status.json");
  const d = makeDemo();
  const e = await seedDemo(h.ctx, d);
  mergeStatus(file, e);
  mergeStatus(file, { ...e, demo_id: "DEMO009", code: "TAL-93109", photos: 5 });
  mergeStatus(file, { ...e, offerings: 3 });
  const s = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(s).sort(), ["DEMO003", "DEMO009"]);
  assert.equal(s.DEMO003.offerings, 3);
  assert.deepEqual(Object.keys(s.DEMO003).sort(), ["code", "completeness", "default_locale", "demo_id", "email", "offerings", "photos", "profile_id", "seeded_at", "site_published", "site_slug", "supported_locales"]);
  assert.ok(!fs.readFileSync(file, "utf8").includes(PW));
});

test("dry run, live demo default: counts show only missing field values; nothing else planned", async () => {
  const h = await harness();
  const d = liveDemo();
  curatedLive(h, d);
  h.ctx.auth = await loadAuthUsers(h.admin);
  const ctx = { ...h.ctx, admin: readOnly(h.admin) };
  const r = await validateDemo(ctx, d);
  assert.deepEqual(r.problems, []);
  const total = buildFieldValuePlan(d, h.ctx.fieldDefs).values.length;
  assert.equal(r.counts.talent_profile_field_values, total - 1, "the value that already exists is not planned");
  assert.equal(r.fieldValues, total - 1);
  assert.equal(r.counts.talent_profiles, 1, "English bio missing");
  for (const k of ["talent_offerings", "talent_booking_hours", "talent_sites", "talent_pages", "agency_talent_roster", "talent_service_areas", "talent_profile_taxonomy", "talent_languages", "profiles"]) {
    assert.equal(r.counts[k], 0, k);
  }
  assert.equal(r.counts["auth.users (create/update + password)"], 0);
  assert.ok(r.warnings.some((w) => /live demo: content untouched/.test(w)));
  const withPw = await validateDemo({ ...ctx, setLivePassword: true }, d);
  assert.equal(withPw.counts["auth.users (create/update + password)"], 1);
  const full = await validateDemo({ ...ctx, includeLiveContent: true }, d);
  assert.equal(full.counts.talent_offerings, 4);
  assert.equal(full.counts.talent_sites, 0);
});

test("verify, live demo: checks user, is_demo and taxonomy only; never asserts four offerings", async () => {
  const h = await harness();
  const d = liveDemo();
  const { profileId } = curatedLive(h, d);
  h.db.table("talent_profile_taxonomy").push({ talent_profile_id: profileId, taxonomy_term_id: "term-nail", relationship_type: "primary_role" });
  const ctx = {
    admin: readOnly(h.admin), hubTenantId: h.ctx.hubTenantId, termIds: h.ctx.termIds, fieldDefs: h.ctx.fieldDefs,
    authByEmail: new Map(h.db.users.map((u) => [u.email.toLowerCase(), u as never])), locations: h.ctx.locations, now: h.ctx.now,
  };
  assert.deepEqual(await verifyDemo(ctx, d), [], "one curated offering, custom hours and no field values still pass");
  h.db.table("talent_profiles").find((r) => r.id === profileId)!.is_demo = false;
  h.db.tables.talent_profile_taxonomy = [];
  const bad = (await verifyDemo(ctx, d)).join("\n");
  assert.match(bad, /is_demo is not true/);
  assert.match(bad, /primary_role is not nail-artist/);
  // Sign-in is checked for live demos only when asked (they keep their own password by default).
  const seen: string[] = [];
  const signIn = async (e: string) => { seen.push(e); return null; };
  await verifyDemo({ ...ctx, password: PW, signIn }, d);
  assert.deepEqual(seen, []);
  await verifyDemo({ ...ctx, password: PW, signIn, signInLive: true }, d);
  assert.deepEqual(seen, [d.email]);
});

// ── Write guard ─────────────────────────────────────────────────────────────

test("write guard: without --yes-write everything is a dry run and says so", () => {
  const none = resolveRunMode(["--from-foundation", "--only", "TAL-93103", "--manifest", "m.json"]);
  assert.equal(none.write, false);
  assert.match(none.notice ?? "", /no --yes-write: running as a dry run/);
  const dry = resolveRunMode(["--dry-run"]);
  assert.equal(dry.write, false);
  assert.equal(dry.notice, null);
  const yes = resolveRunMode(["--yes-write", "--only", "TAL-93103"]);
  assert.deepEqual(yes, { write: true, explicitDryRun: false, notice: null });
  assert.throws(() => resolveRunMode(["--yes-write", "--dry-run"]), /contradict/);
  // --remove and a live code are not writes either without the flag.
  assert.equal(resolveRunMode(["--remove", "--only", "TAL-93004"]).write, false);
});

test("write guard: the CLIs are wired to it and verify stays read-only", () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");
  for (const f of ["seed-foundation.mts", "login-links.mts"]) {
    const src = read(f);
    assert.match(src, /resolveRunMode\(args\)/, f);
    assert.match(src, /--yes-write/, f);
  }
  const seed = read("seed-foundation.mts");
  assert.match(seed, /const admin = mode\.write \? raw : readOnly\(raw\)/, "no write handle without --yes-write");
  assert.match(seed, /if \(!mode\.write\) \{[\s\S]*?nothing removed[\s\S]*?return;/, "--remove without --yes-write removes nothing");
  const links = read("login-links.mts");
  assert.ok(links.indexOf("if (!mode.write)") < links.indexOf("buildLoginLinks("), "no link is generated before the guard");
  assert.ok(links.indexOf("if (!mode.write)") < links.indexOf("writeLoginLinksCsv("), "no CSV before the guard");
  const verify = read("verify.mts");
  assert.match(verify, /admin = readOnly\(/);
  assert.ok(!verify.includes("--yes-write"));
});

test("write guard: a read-only client cannot write even if a script forgot the flag", async () => {
  const h = await harness();
  const ro = readOnly(h.admin);
  await assert.rejects(async () => seedDemo({ ...h.ctx, admin: ro }, makeDemo()), /READ-ONLY/);
  assert.equal(h.db.ops.length, 0);
  assert.equal(h.db.authCalls.filter((c) => c.method !== "listUsers").length, 0);
});

test("verify comparison ignores jsonb key order", async () => {
  const { same } = await import("./foundation-verify");
  assert.equal(same({ "1": [{ startMin: 540, endMin: 1080 }] }, { "1": [{ endMin: 1080, startMin: 540 }] }), true);
  assert.equal(same([{ locale: "en", text: "a" }], [{ text: "a", locale: "en" }]), true);
  assert.equal(same([{ locale: "en", text: "a" }], [{ text: "b", locale: "en" }]), false);
  assert.equal(same([1, 2], [2, 1]), false);
});
