import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { HUB_TENANT_ID, G6 } from "./failed-cards-ops.mjs";
import { REPAIR_SCOPE, TEST_WORD, publicCopyProblems, triggerSideEffects, verifyS2Plan, s2Id } from "./stage2-guards.mjs";
import { POSTS_HOST, POST_TOPICS, REVIEW_BOOKINGS, SLUG_ROWS, planPosts, planReviews, planSlugs, postUrls } from "./stage2-plan-content.mjs";
import { buildStage2Plan, resolveStage2 } from "./stage2-plan.mjs";

const NOW = new Date("2026-10-21T12:00:00Z");
const HUB = { talentId: "5f0f0f0f-0000-4000-8000-000000009390", tenantId: HUB_TENANT_ID, hasPayout: false };
const GUARD = { externalTenantIds: new Set([HUB.tenantId]), existingTalentIds: new Set([HUB.talentId]) };
const build = (only = null, has = () => true) => buildStage2Plan(resolveStage2(only), { now: NOW, has, hub: HUB });
const ops = (only = null, has) => build(only, has).ops;
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const MIGRATIONS = [join(REPO, "supabase/migrations"), join(REPO, "supabase/migrations/_pending_pm")];
const sqlOf = (file) => {
  for (const dir of MIGRATIONS) {
    try { return readFileSync(join(dir, file), "utf8"); } catch { /* next dir */ }
  }
  throw new Error(`migration ${file} not found on this branch`);
};

// ------------------------------------------------------------------------------------------------ 1. service slugs
test("SL: every slug row is readable, scoped to the owner of its service, unique, with one current row per service + locale", () => {
  const list = ops(["SL"]);
  const slugs = list.filter((o) => o.table === "public.offering_slugs");
  assert.equal(slugs.length, SLUG_ROWS.length);
  assert.deepEqual(verifyS2Plan(list, GUARD).problems, []);
  const offerings = new Map(list.filter((o) => o.table === "public.talent_offerings").map((o) => [o.id, o.row]));
  const seen = new Set();
  const current = new Set();
  for (const s of slugs) {
    const r = s.row;
    assert.match(r.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(r.slug.length <= 96);
    assert.equal(TEST_WORD.test(r.slug), false, `${r.slug} must not say QA / test / E2E`);
    assert.match(r.locale, /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/);
    const o = offerings.get(r.offering_id);
    assert.ok(o, `${s.key}: its service is planned`);
    const want = o.owner_kind === "talent" ? `t:${o.talent_profile_id}` : `w:${o.tenant_id}`;
    assert.equal(r.owner_scope, want, `${s.key}: scope is the owner of the service`);
    const k = `${r.owner_scope}|${r.locale}|${r.slug}`;
    assert.equal(seen.has(k), false, `duplicate ${k}`);
    seen.add(k);
    if (r.is_current) {
      const c = `${r.offering_id}|${r.locale}`;
      assert.equal(current.has(c), false, `two current slugs for ${c}`);
      current.add(c);
    }
  }
  assert.equal(slugs.filter((s) => !s.row.is_current).length, 1, "one history row (the old address of a renamed service)");
  const old = slugs.find((s) => !s.row.is_current);
  assert.ok(slugs.some((s) => s.row.is_current && s.row.offering_id === old.row.offering_id && s.row.locale === old.row.locale), "the history row has a current slug to redirect to");
  assert.ok(new Set(slugs.map((s) => s.row.offering_id)).size >= 8, "slugs for services across T1, T3, T4, T5");
});

test("SL: without the held migration 20261231418800 the rows are not built and the plan names the exact version and file", () => {
  const p = build(["SL"], (c) => c !== "offering_slugs.slug");
  assert.equal(p.ops.filter((o) => o.table === "public.offering_slugs").length, 0);
  const b = p.blocked.find((x) => x.version === "20261231418800");
  assert.ok(b);
  assert.equal(b.file, "supabase/migrations/_pending_pm/20261231418800_offering_slugs_supersedes_415800_tul1324.sql");
  assert.ok(sqlOf("20261231418800_offering_slugs_supersedes_415800_tul1324.sql").includes("CREATE TABLE IF NOT EXISTS public.offering_slugs"));
});

test("SL guards: a scope outside the seed, a slug with a QA word and a non-fixture offering are refused", () => {
  const list = ops(["SL"]);
  const first = list.findIndex((o) => o.table === "public.offering_slugs");
  const mut = (patch) => list.map((o, i) => (i === first ? { ...o, row: { ...o.row, ...patch } } : o));
  assert.equal(verifyS2Plan(mut({}), GUARD).ok, true);
  assert.equal(verifyS2Plan(mut({ owner_scope: `t:${HUB.talentId}` }), GUARD).ok, false, "pre-existing talent scope");
  assert.equal(verifyS2Plan(mut({ owner_scope: `w:${G6.ws}` }), GUARD).ok, false, "a Group-6 workspace scope");
  assert.equal(verifyS2Plan(mut({ owner_scope: "x:nope" }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut({ slug: "qa-haircut" }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut({ slug: "Bad Slug" }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut({ offering_id: s2Id("offering:not-planned") }), GUARD).ok, false);
});

// ------------------------------------------------------------------------------------------------ 2. reviews
test("RV: three completed history bookings (marked pre-made, no inquiry, no order) with one talent-to-client review each", () => {
  const list = ops(["RV"]);
  assert.deepEqual(verifyS2Plan(list, GUARD).problems, []);
  const bookings = list.filter((o) => o.table === "public.agency_bookings");
  const lines = list.filter((o) => o.table === "public.booking_talent");
  const reviews = list.filter((o) => o.table === "public.client_reviews");
  assert.deepEqual([bookings.length, lines.length, reviews.length], [3, 3, 3]);
  assert.equal(REVIEW_BOOKINGS.length, 3);
  const users = new Map(list.filter((o) => o.kind === "authUser").map((o) => [o.id, o.row.email]));
  const seen = new Set();
  for (const b of bookings) {
    assert.equal(b.row.status, "completed");
    assert.equal(b.row.payment_status, "paid");
    assert.ok(new Date(b.row.starts_at) < NOW, "dated in the past");
    assert.match(b.row.internal_notes, /^Pre-made history/);
    assert.equal(b.row.source_inquiry_id, undefined, "no source inquiry: bookings_write_order returns early, no order is written");
    assert.equal(b.row.tenant_id, s2Id("workspace:t4"));
    assert.match(users.get(b.row.client_user_id), /@example\.test$/);
    assert.match(b.row.contact_email, /@example\.test$/);
  }
  for (const r of reviews) {
    assert.ok(Number.isInteger(r.row.rating) && r.row.rating >= 1 && r.row.rating <= 5);
    assert.ok(["published", "hidden"].includes(r.row.status));
    const k = `${r.row.booking_id}|${r.row.author_user_id}|${r.row.client_user_id}`;
    assert.equal(seen.has(k), false, "client_reviews_booking_author_client_unique");
    seen.add(k);
    const line = lines.find((l) => l.row.booking_id === r.row.booking_id);
    assert.equal(line.row.talent_profile_id, r.row.author_talent_profile_id, "the author reviews a booking they worked");
    assert.equal(line.row.tenant_id, bookings.find((b) => b.id === r.row.booking_id).row.tenant_id, "tenant_autofill_booking_talent: child tenant equals parent tenant");
    assert.equal(r.row.tenant_id, s2Id("workspace:t4"));
    assert.ok(users.has(r.row.author_user_id) && users.has(r.row.client_user_id) === true || r.row.author_user_id === s2Id("user:t4-stylist"));
  }
  for (const o of list) assert.ok(!["public.orders", "public.booking_transactions", "public.order_lines", "public.talent_reviews"].includes(o.table), `${o.table}: no sale and no public review is seeded`);
});

test("RV guards: a review needs fixture rows and a 1..5 rating; a history booking must be marked and inquiry-free", () => {
  const list = ops(["RV"]);
  const at = (table) => list.findIndex((o) => o.table === table);
  const mut = (table, patch) => list.map((o, i) => (i === at(table) ? { ...o, row: { ...o.row, ...patch } } : o));
  assert.equal(verifyS2Plan(mut("public.client_reviews", { rating: 6 }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut("public.client_reviews", { status: "spam" }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut("public.client_reviews", { client_user_id: s2Id("user:not-planned") }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut("public.agency_bookings", { internal_notes: "regular booking" }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut("public.agency_bookings", { source_inquiry_id: s2Id("inquiry:t1-catering") }), GUARD).ok, false);
});

test("RV side effects are listed: completed-bookings recompute on the stylist, NO order", () => {
  const rows = triggerSideEffects(ops(null));
  const recompute = rows.find((r) => r.table.includes("total_completed_bookings"));
  assert.equal(recompute.rows, 1);
  const orders = rows.find((r) => r.table === "public.orders");
  assert.equal(orders.rows, 0);
  assert.match(orders.note, /no source inquiry/);
});

// ------------------------------------------------------------------------------------------------ 3. posts
test("PO: eight published posts (4 ES + 4 EN) on T1, hreflang-linked, one FAQ pair, categories and tags, readable slugs", () => {
  const list = ops(["PO"]);
  assert.deepEqual(verifyS2Plan(list, GUARD).problems, []);
  const posts = list.filter((o) => o.table === "public.cms_posts");
  assert.equal(posts.length, 8);
  assert.equal(posts.filter((p) => p.row.locale === "es").length, 4);
  assert.equal(posts.filter((p) => p.row.locale === "en").length, 4);
  const byId = new Map(posts.map((p) => [p.id, p.row]));
  const cats = new Map(list.filter((o) => o.table === "public.cms_post_categories").map((o) => [o.id, o.row]));
  const seen = new Set();
  for (const p of posts) {
    const r = p.row;
    assert.equal(r.tenant_id, s2Id("workspace:t1"));
    assert.equal(r.talent_profile_id, null, "workspace scope");
    assert.equal(r.status, "published");
    assert.ok(new Date(r.published_at) < NOW);
    assert.equal(r.is_unlisted, false);
    assert.equal(r.taken_down_at, undefined);
    assert.equal(r.expires_at, undefined);
    assert.equal(TEST_WORD.test(`${r.slug} ${r.title} ${r.excerpt} ${r.meta_title} ${r.meta_description}`), false);
    assert.ok(Array.isArray(JSON.parse(r.body_blocks)) && JSON.parse(r.body_blocks).length >= 3);
    assert.ok(r.tags.length > 0 && r.tags.length <= 10);
    assert.equal(cats.get(r.category_id).locale, r.locale, "a post uses a category of its own locale");
    const k = `${r.tenant_id}|${r.locale}|${r.slug}`;
    assert.equal(seen.has(k), false);
    seen.add(k);
    if (r.locale === "en") assert.equal(byId.get(r.translation_of).locale, "es", "EN twin points at the ES original");
    else assert.equal(r.translation_of, undefined);
  }
  const faqPosts = posts.filter((p) => JSON.parse(p.row.body_blocks).some((b) => b.type === "faq"));
  assert.equal(faqPosts.length, 2, "an FAQ block in one topic, in both languages");
  const blocks = posts.flatMap((p) => JSON.parse(p.row.body_blocks));
  for (const b of blocks.filter((x) => x.type === "service")) assert.match(b.offering_id, /^[0-9a-f-]{36}$/);
  assert.equal(new Set(list.filter((o) => o.table === "public.cms_post_categories").map((o) => `${o.row.locale}|${o.row.slug}`)).size, cats.size);
});

test("PO route: the posts are on a FIXTURE tenant that has its own staging host; no Group-6 tenant, no qa-1..qa-6 row", () => {
  const full = ops(null);
  const t1 = s2Id("workspace:t1");
  const host = full.find((o) => o.table === "public.agency_domains" && o.row.tenant_id === t1);
  assert.equal(host.row.hostname, POSTS_HOST);
  assert.equal(host.row.status, "active");
  assert.equal(host.row.is_primary, true);
  assert.equal(full.filter((o) => o.table === "public.agency_domains" && /(^|[^a-z0-9])qa-[1-6]\./.test(o.row.hostname)).length, 0);
  const text = JSON.stringify(full.filter((o) => ["public.cms_posts", "public.cms_post_categories"].includes(o.table)));
  assert.equal(text.includes(G6.ws), false, "no post names the Group-6 workspace");
  assert.equal(postUrls().length, 8);
  assert.ok(postUrls().every((u) => u.startsWith(`https://${POSTS_HOST}/`)));
  // The host row is written by the workspace op of the SAME plan, ahead of the posts.
  assert.ok(full.indexOf(host) < full.findIndex((o) => o.table === "public.cms_posts"));
});

test("PO guards: a null-tenant, talent-scope, taken-down or Group-6 post is refused", () => {
  const list = ops(["PO"]);
  const first = list.findIndex((o) => o.table === "public.cms_posts");
  const mut = (patch) => list.map((o, i) => (i === first ? { ...o, row: { ...o.row, ...patch } } : o));
  assert.equal(verifyS2Plan(mut({}), GUARD).ok, true);
  assert.equal(verifyS2Plan(mut({ tenant_id: null }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut({ tenant_id: G6.ws }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut({ talent_profile_id: s2Id("talent:t4-maya") }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut({ taken_down_at: NOW.toISOString() }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut({ slug: "test-post" }), GUARD).ok, false);
  assert.equal(verifyS2Plan(mut({ title: "A QA post" }), GUARD).ok, false);
  assert.equal(publicCopyProblems(mut({ title: "E2E" })).length, 1);
});

test("PO: without Posts v1 (20261231400700) nothing is built and the exact version + file are named", () => {
  const p = build(["PO"], (c) => c !== "cms_posts.tags");
  assert.equal(p.ops.filter((o) => o.table === "public.cms_posts").length, 0);
  const b = p.blocked.find((x) => x.version === "20261231400700");
  assert.ok(b);
  assert.ok(sqlOf("20261231400700_posts_v1_blocks_categories_takedown.sql").includes("ADD COLUMN IF NOT EXISTS tags text[]"));
  assert.ok(planPosts(NOW).length === 8 + 4);
});

// ------------------------------------------------------------------------------------------------ 4. from-price
test("FP: exactly one 'Desde' (from-price) service, on T4, request-booked because a CHECK forbids instant for a non-exact price", () => {
  const list = ops(["T4"]);
  const offers = list.filter((o) => o.table === "public.talent_offerings");
  const from = offers.filter((o) => o.row.price_display === "from");
  assert.equal(from.length, 1);
  assert.equal(from[0].row.booking_mode, "request");
  assert.equal(from[0].row.amount_cents, 15000);
  assert.equal(from[0].row.currency, "USD");
  assert.equal(from[0].row.status, "published");
  assert.ok(offers.filter((o) => o.row.price_display === "exact").every((o) => o.row.booking_mode === "instant"), "the exact services are unchanged");
  assert.match(sqlOf("20260708161910_talent_offerings.sql"), /booking_mode <> 'instant'/);
});

// ------------------------------------------------------------------------------------------------ CHECK literals
/**
 * Every enum-ish literal the new rows write, with the migration that defines it. The literal must appear in that file, so a renamed value
 * fails here and not in a selftest. (Same idea as the #4048 enum-literal test; values below are read from the constraint text by hand.)
 */
const LITERALS = [
  { table: "public.talent_offerings", col: "price_display", values: ["from", "exact", "quote"], file: "20260708161910_talent_offerings.sql" },
  { table: "public.talent_offerings", col: "booking_mode", values: ["request", "instant"], file: "20260708161910_talent_offerings.sql" },
  { table: "public.client_reviews", col: "status", values: ["published"], file: "20260603234910_client_reviews_two_sided.sql" },
  { table: "public.agency_bookings", col: "status", values: ["completed"], file: "20250409140000_bookings_guest_rpcs.sql" },
  { table: "public.agency_bookings", col: "payment_status", values: ["paid"], file: "20260411120000_commercial_accounts_bookings.sql" },
  { table: "public.cms_posts", col: "status", values: ["published"], file: "20260416120000_cms_pages_and_redirects.sql" },
  { table: "public.cms_posts", col: "locale", values: ["en", "es"], file: "20260420190000_cms_posts_navigation.sql" },
  { table: "public.cms_post_categories", col: "locale", values: ["en", "es"], file: "20261231400700_posts_v1_blocks_categories_takedown.sql" },
];

test("every enum-ish literal the content rows write appears in the migration that defines it", () => {
  for (const l of LITERALS) {
    const sql = sqlOf(l.file);
    for (const v of l.values) assert.ok(sql.includes(`'${v}'`), `${l.table}.${l.col} = '${v}' is not in ${l.file}`);
  }
  const planned = ops(null, () => true);
  for (const l of LITERALS) {
    const used = planned.filter((o) => o.table === l.table && o.row && l.col in o.row).map((o) => o.row[l.col]);
    for (const v of used) assert.ok(l.values.includes(v), `${l.table}.${l.col}: the plan writes '${v}', the map allows ${l.values.join("/")}`);
  }
  // Regex CHECKs on offering_slugs, copied from the held migration: the plan must satisfy them.
  const slugSql = sqlOf("20261231418800_offering_slugs_supersedes_415800_tul1324.sql");
  assert.ok(slugSql.includes("'^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 96"));
  assert.ok(slugSql.includes("^(t|w):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"));
  for (const o of planSlugs()) assert.match(o.row.owner_scope, /^(t|w):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const rv = planReviews(NOW).filter((o) => o.table === "public.client_reviews");
  assert.ok(sqlOf("20260603234910_client_reviews_two_sided.sql").includes("CHECK (rating BETWEEN 1 AND 5)"));
  assert.ok(rv.every((o) => o.row.rating >= 1 && o.row.rating <= 5));
});

// ------------------------------------------------------------------------------------------------ trigger audit
test("trigger audit: every BEFORE INSERT trigger on the tables this addendum writes is known, and the rows satisfy it", () => {
  const TABLES = ["agency_bookings", "booking_talent", "client_reviews", "offering_slugs", "cms_posts", "cms_post_categories", "agency_domains"];
  // Expected BEFORE INSERT triggers (name -> what the plan does about it). A new trigger on any of these tables fails this test.
  const EXPECTED = {
    "public.agency_bookings": ["trg_tenant_autofill_agency_bookings"], // only acts with source_inquiry_id; history bookings set tenant_id and have none
    "public.booking_talent": ["trg_tenant_autofill_booking_talent"], // tenant_id set explicitly = parent's
    "public.client_reviews": ["trg_client_reviews_set_published"], // sets published_at on the row itself
    "public.offering_slugs": [], // RLS only; service-role writes
    "public.cms_posts": ["cms_posts_guard_talent_publish"], // returns at once for talent_profile_id IS NULL (workspace posts)
    "public.cms_post_categories": [],
    "public.agency_domains": [], // no domain row is added by this addendum (T1 already has its host from workspaceOps)
  };
  const found = Object.fromEntries(TABLES.map((t) => [`public.${t}`, new Set()]));
  for (const dir of MIGRATIONS) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, f), "utf8");
      for (const m of sql.matchAll(/CREATE TRIGGER\s+(\w+)\s+((?:BEFORE|AFTER)[^;]*?)\s+ON\s+(public\.\w+)/gi)) {
        if (/^BEFORE[^;]*\bINSERT\b/i.test(m[2]) && found[m[3]]) found[m[3]].add(m[1]);
      }
    }
  }
  for (const [t, want] of Object.entries(EXPECTED)) {
    // agency_domains has other BEFORE INSERT triggers that do not concern us because this addendum inserts no domain row.
    if (t === "public.agency_domains") continue;
    assert.deepEqual([...found[t]].sort(), [...want].sort(), `${t}: BEFORE INSERT triggers changed; read them and update this test and the PR body`);
  }
  const full = ops(null);
  assert.equal(full.filter((o) => o.table === "public.agency_domains" && o.key.startsWith("domain:") && !o.key.endsWith(":sub")).length, 0, "no extra domain row");
  // trg_tenant_autofill_agency_bookings: no source inquiry -> nothing derived; tenant_id is supplied.
  for (const b of full.filter((o) => o.table === "public.agency_bookings")) assert.ok(b.row.source_inquiry_id == null && b.row.tenant_id);
  // cms_posts_guard_talent_publish: talent_profile_id null -> early return.
  for (const p of full.filter((o) => o.table === "public.cms_posts")) assert.equal(p.row.talent_profile_id, null);
});

// ------------------------------------------------------------------------------------------------ repair
test("--repair is a no-op for everything this addendum adds: it can only undo the settings.people.pins key an earlier version wrote", () => {
  assert.deepEqual(Object.keys(REPAIR_SCOPE), ["public.agencies"]);
  const src = readFileSync(join(REPO, "web/scripts/seed-stage2-fixtures.mts"), "utf8");
  const repairBlock = src.slice(src.indexOf('if (mode === "repair-plan"'), src.indexOf('if (mode === "plan" || mode === "cleanup-plan")'));
  assert.ok(repairBlock.length > 200);
  for (const t of ["offering_slugs", "client_reviews", "agency_bookings", "booking_talent", "cms_posts", "cms_post_categories", "talent_offerings"]) {
    assert.equal(repairBlock.includes(t), false, `--repair must not touch ${t}`);
  }
});

test("cleanup and counts know the new tables; cleanup refuses when payments hang off a history booking", () => {
  const src = readFileSync(join(REPO, "web/scripts/seed-stage2-fixtures.mts"), "utf8");
  for (const t of ["public.offering_slugs", "public.agency_bookings", "public.booking_talent", "public.client_reviews", "public.cms_post_categories", "public.cms_posts"]) assert.ok(src.includes(`"${t}"`), t);
  assert.ok(src.includes("booking_transactions where booking_id = any"));
  assert.ok(src.includes('"offering_slugs.slug", "cms_posts.tags"'), "live-schema probes");
});
