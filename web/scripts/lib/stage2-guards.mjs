/**
 * Pure guards for the Business Suite Stage 2 fixture seed (scripts/seed-stage2-fixtures.mts, TUL-1519 / TUL-1427
 * "Unified Stage 2 fixture set"). No I/O, no process.exit: every refusal is unit-testable.
 *
 * Rules (QA Conductor + PM, Oran-approved staging-only identities):
 *   - fxlankepwnvelxjrahwk ONLY (checkFcTarget from #4048); pluhda* anywhere is refused.
 *   - never a qa-1..qa-6 host or row, never TAL-93938, never a talent other than TAL-93900.
 *   - every row hangs off a fixture tenant created by this seed (or an explicitly allowed external tenant).
 *   - @example.test mailboxes only; every slug / host / link code / event slug starts with `s2-`.
 *   - ids are s2Id(key) = stableId("s2:" + key): a re-run lands on the same rows, --cleanup deletes only these.
 */
import { stableId } from "./group6-fixtures.mjs";
import { checkFcTarget } from "./failed-cards-guards.mjs";

export const S2_NS = "s2:";
export const S2_SLUG_PREFIX = "s2-";
export const s2Id = (key) => stableId(`${S2_NS}${key}`);

/** The only PRE-EXISTING talent the seed may touch, and only additively (new rows, never an update). */
export const ALLOWED_TALENT_CODES = ["TAL-93900"];
/** The seed's own fixture talents (like #4048's TAL-960xx): TAL-962xx. */
export const FIXTURE_TALENT_CODE = /^TAL-962\d\d$/i;
export const FORBIDDEN_TOKENS = ["pluhda", "TAL-93938", "TUL-52\""];
/** qa-1 .. qa-6 as a whole label (hosts, slugs, rows): qa-1.tulala.digital, "qa-3". */
export const QA_POOL_HOST = /(^|[^a-z0-9])qa-[1-6](?![0-9])/i;
export const TALENT_CODE = /TAL-\d{3,7}/gi;

export const EMAIL_DOMAIN = "@example.test";
export const isExampleTestEmail = (raw) => /^[a-z0-9][a-z0-9._+-]*@example\.test$/i.test(String(raw ?? "").trim());

/** Public-facing copy never says QA / test / E2E (public loaders hide those on test accounts). */
export const TEST_WORD = /qa|test|e2e/i;
/** Words that make an item alcoholic: none may appear in a deal / 2x1 / happy-hour item (PM rule O6). */
export const ALCOHOL_WORD = /margarita|cerveza|beer|mezcal|tequila|vino|wine|whisk|vodka|cocktail|michelada|\bron\b|\bgin\b|licor|sangr/i;

const EMAIL_COLS = new Set(["email", "contact_email", "payer_email", "holder_email", "notification_email", "recipient_email", "to_email", "email_normalized"]);
const SLUG_COLS = new Set(["slug", "site_slug", "tenant_slug", "hostname"]);

/** Tables whose title / name / label / description / category are shown to the public. */
export const PUBLIC_COPY_TABLES = new Set([
  "public.talent_offerings", "public.talent_offering_variants", "public.talent_offering_addons", "public.events", "public.venues",
  "public.spaces", "public.space_groups", "public.agencies", "public.agency_business_identity", "public.links", "public.prep_stations",
  "public.profiles", "public.talent_profiles", "public.cms_posts", "public.cms_post_categories",
]);
const COPY_COLS = ["title", "description", "category", "label", "name", "display_name", "public_name", "tagline", "excerpt", "meta_title", "meta_description"];

/**
 * Tables whose slug is unique PER SCOPE (service scope / tenant + locale), not across the platform, so they carry readable slugs instead of the
 * `s2-` prefix. They get stricter rules of their own in contentRowProblems: a fixture scope, a URL-safe shape, and no QA / test / E2E word.
 */
export const SCOPED_SLUG_TABLES = new Set(["public.offering_slugs", "public.cms_posts", "public.cms_post_categories", "public.talent_pages"]);
const URL_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SCOPE = /^(t|w):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Rules for the content tables (service slugs, blog posts, pre-made history bookings, reviews). Returns problem strings. */
export function contentRowProblems(op, { fixtureIds, tenantIds, existingTalentIds }) {
  const out = [];
  const r = op.row ?? {};
  const where = `${op.fx} ${op.table} ${op.key ?? op.id}`;
  if (SCOPED_SLUG_TABLES.has(op.table)) {
    const slug = String(r.slug ?? "");
    if (!URL_SLUG.test(slug) || slug.length > 96) out.push(`${where}: slug "${slug}" is not a readable URL slug`);
    if (TEST_WORD.test(slug)) out.push(`${where}: slug "${slug}" contains QA/test/E2E`);
    if (QA_POOL_HOST.test(slug)) out.push(`${where}: slug names a qa-1..qa-6 pool row`);
  }
  if (op.table === "public.offering_slugs") {
    const m = SCOPE.exec(String(r.owner_scope ?? ""));
    if (!m) out.push(`${where}: owner_scope is not t:<uuid> or w:<uuid>`);
    else if (m[1] === "t" ? !fixtureIds.has(m[2]) || existingTalentIds.has(m[2]) : !tenantIds.has(m[2])) out.push(`${where}: owner_scope ${r.owner_scope} is not a fixture ${m[1] === "t" ? "talent" : "workspace"}`);
    if (!fixtureIds.has(r.offering_id)) out.push(`${where}: offering_id is not a fixture offering`);
    if (typeof r.is_current !== "boolean") out.push(`${where}: is_current must be set`);
  }
  if (op.table === "public.cms_posts") {
    if (!tenantIds.has(r.tenant_id)) out.push(`${where}: a post must belong to a fixture workspace (a null-tenant post would show on the platform blog)`);
    if (r.talent_profile_id != null) out.push(`${where}: workspace-scope posts only (no talent_profile_id)`);
    if (!["en", "es"].includes(r.locale)) out.push(`${where}: locale must be en or es`);
    if (r.translation_of != null && !fixtureIds.has(r.translation_of)) out.push(`${where}: translation_of is not a fixture post`);
    if (r.taken_down_at != null) out.push(`${where}: a seeded post is never taken down (platform-admin field)`);
  }
  if (op.table === "public.talent_sites" || op.table === "public.talent_pages") {
    // A talent site is only ever created for one of the seed's OWN talents (never a pre-existing one), and its address is an s2- label.
    if (!fixtureIds.has(r.talent_profile_id) || existingTalentIds.has(r.talent_profile_id)) out.push(`${where}: talent_profile_id is not one of the seed's own talents`);
    if (op.table === "public.talent_sites" && !String(r.site_slug ?? "").startsWith(S2_SLUG_PREFIX)) out.push(`${where}: site_slug must start with ${S2_SLUG_PREFIX}`);
    if (op.table === "public.talent_sites" && TEST_WORD.test(String(r.site_slug ?? ""))) out.push(`${where}: site_slug contains QA/test/E2E`);
  }
  if (op.table === "public.agency_bookings") {
    if (!String(r.internal_notes ?? "").startsWith("Pre-made history")) out.push(`${where}: a seeded booking must be marked "Pre-made history" in internal_notes`);
    if (r.source_inquiry_id != null) out.push(`${where}: a history booking must have no source inquiry (an accepted offer would make the trigger write an order)`);
    if (!tenantIds.has(r.tenant_id)) out.push(`${where}: booking tenant is not a fixture workspace`);
  }
  if (op.table === "public.client_reviews") {
    for (const c of ["booking_id", "author_user_id", "client_user_id"]) if (!fixtureIds.has(r[c])) out.push(`${where}: ${c} is not a fixture row`);
    if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) out.push(`${where}: rating must be 1..5`);
    if (!["published", "hidden"].includes(r.status)) out.push(`${where}: status must be published or hidden`);
  }
  return out;
}

function* walk(v) {
  if (v == null) return;
  if (typeof v === "string") yield v;
  else if (Array.isArray(v)) for (const x of v) yield* walk(x);
  else if (typeof v === "object") for (const x of Object.values(v)) yield* walk(x);
}

/** Staging target, via the #4048 guard (pooler login postgres.fxlank..., no variable naming production). */
export const checkS2Target = (env) => checkFcTarget(env);

/**
 * Refuse a plan that could touch anything outside this seed. `ctx.tenantIds` are the workspaces this plan creates;
 * `ctx.externalTenantIds` are the only other tenants rows may name (none in push 1).
 */
export function checkS2Plan(ops, { fixtureIds = new Set(), tenantIds = new Set(), externalTenantIds = new Set(), existingTalentIds = new Set() } = {}) {
  const problems = [];
  for (const op of ops) {
    const where = `${op.fx} ${op.table} ${op.key ?? op.id}`;
    if (op.kind === "update" || op.kind === "delete" || op.kind === "pin") {
      if (!fixtureIds.has(op.id)) problems.push(`${where}: ${op.kind} on a non-fixture row`);
    } else if (op.id && !fixtureIds.has(op.id)) problems.push(`${where}: insert id is not a deterministic fixture id`);
    else if (!op.id) {
      const refs = Object.values(op.row ?? {}).some((v) => typeof v === "string" && fixtureIds.has(v));
      const natural = op.natural && isExampleTestEmail(op.row?.[op.natural]);
      if (!refs && !natural) problems.push(`${where}: row without an id does not reference a fixture row (or name an @example.test natural key)`);
    }
    if (op.id && op.kind !== "update" && op.kind !== "pin" && op.kind !== "authUser" && op.id !== s2Id(op.key)) problems.push(`${where}: id is not s2Id(key)`);
    if (op.kind === "pin") {
      // The PIN goes through pos_set_staff_pin for a fixture manager, by a fixture actor, in a fixture workspace. Never a direct settings write.
      if (op.via !== "pos_set_staff_pin") problems.push(`${where}: a PIN must be set through pos_set_staff_pin`);
      if (!tenantIds.has(op.tenantId)) problems.push(`${where}: PIN workspace is not a fixture workspace`);
      for (const k of ["actorId", "userId"]) if (!fixtureIds.has(op[k])) problems.push(`${where}: PIN ${k} is not a fixture user`);
      if (op.table !== "public.staff_pin_hashes") problems.push(`${where}: a PIN op writes staff_pin_hashes only`);
    }
    if (JSON.stringify(op.set ?? {}).includes("pins") || JSON.stringify(op.merge ?? {}).includes("pins") || JSON.stringify(op.row ?? {}).includes('"pins"')) problems.push(`${where}: writes settings.people.pins directly (TUL-1516: use pos_set_staff_pin)`);
    const values = { ...(op.row ?? {}), ...(op.set ?? {}), ...(op.merge ?? {}) };
    const t = values.tenant_id;
    if (op.touchesExisting) {
      // Additive writes next to a pre-existing talent: new rows only, tenant exactly the resolved hub tenant.
      if (op.touchesExisting !== "TAL-93900") problems.push(`${where}: touches pre-existing ${op.touchesExisting}; only TAL-93900 is allowed`);
      if (op.kind !== "insert") problems.push(`${where}: a write to pre-existing ${op.touchesExisting} must be a new row (no updates)`);
      if (typeof t === "string" && !externalTenantIds.has(t)) problems.push(`${where}: tenant_id ${t} is not the resolved hub tenant`);
    } else {
      if (typeof t === "string" && !tenantIds.has(t)) problems.push(`${where}: tenant_id ${t} is not a fixture tenant`);
      for (const v of walk(values)) if (existingTalentIds.has(v)) problems.push(`${where}: references a pre-existing talent without the touchesExisting flag`);
    }
    for (const s of walk(values)) {
      const low = s.toLowerCase();
      for (const b of FORBIDDEN_TOKENS) if (low.includes(b.toLowerCase())) problems.push(`${where}: names forbidden ${b}`);
      if (QA_POOL_HOST.test(s)) problems.push(`${where}: names a qa-1..qa-6 pool host/row (${s.slice(0, 40)})`);
      for (const m of s.match(TALENT_CODE) ?? []) if (!ALLOWED_TALENT_CODES.includes(m.toUpperCase()) && !FIXTURE_TALENT_CODE.test(m)) problems.push(`${where}: names talent ${m}; only ${ALLOWED_TALENT_CODES.join(",")} and the seed's own TAL-962xx are allowed`);
    }
    for (const [col, v] of Object.entries(values)) {
      if (EMAIL_COLS.has(col) && v != null && !isExampleTestEmail(v)) problems.push(`${where}: ${col} is not an ${EMAIL_DOMAIN} mailbox`);
      if (SLUG_COLS.has(col) && v != null && !SCOPED_SLUG_TABLES.has(op.table) && !String(v).startsWith(S2_SLUG_PREFIX)) problems.push(`${where}: ${col} must start with ${S2_SLUG_PREFIX}`);
    }
    problems.push(...contentRowProblems(op, { fixtureIds, tenantIds, existingTalentIds }));
    if (op.table === "public.links" && !String(op.row?.code ?? "").startsWith(S2_SLUG_PREFIX)) problems.push(`${where}: link code must start with ${S2_SLUG_PREFIX}`);
    if (op.table === "public.talent_profiles" && !FIXTURE_TALENT_CODE.test(String(op.row?.profile_code ?? ""))) problems.push(`${where}: a talent profile that is not one of the seed's own TAL-962xx`);
  }
  return { ok: problems.length === 0, problems };
}

/** Public copy (titles, names, labels, descriptions, categories) never says QA / test / E2E. */
export function publicCopyProblems(ops) {
  const out = [];
  for (const op of ops) {
    if (!PUBLIC_COPY_TABLES.has(op.table)) continue;
    const r = { ...(op.row ?? {}), ...(op.set ?? {}) };
    const vals = [];
    for (const c of COPY_COLS) if (typeof r[c] === "string") vals.push([c, r[c]]);
    for (const c of ["title_i18n", "description_i18n", "label_i18n"]) {
      let o = r[c];
      try { if (typeof o === "string") o = JSON.parse(o); } catch { o = {}; }
      if (o && typeof o === "object") for (const v of Object.values(o)) if (typeof v === "string") vals.push([c, v]);
    }
    for (const [c, v] of vals) if (TEST_WORD.test(v)) out.push(`${op.fx} ${op.key}: ${c} "${v}" contains QA/test/E2E`);
  }
  return out;
}

/** PM rule O6: no alcohol in any deal / 2x1 / happy-hour item. Items flag themselves with attributes.deal = true. */
export function alcoholDealProblems(ops) {
  const out = [];
  for (const op of ops) {
    if (op.table !== "public.talent_offerings") continue;
    let a = op.row?.attributes;
    try { if (typeof a === "string") a = JSON.parse(a); } catch { a = {}; }
    if (a?.deal !== true) continue;
    const text = [op.row.title, op.row.description, op.row.category, op.row.title_i18n].filter(Boolean).join(" ");
    if (a.alcohol === true || ALCOHOL_WORD.test(text)) out.push(`${op.fx} ${op.key}: a deal item is alcoholic (${op.row.title})`);
  }
  return out;
}

/** Workspace slugs, subdomain labels share one DNS label space. */
export function labelCollisions(ops) {
  const owners = new Map();
  const clashes = [];
  const claim = (label, owner) => {
    const prev = owners.get(label);
    if (prev && prev !== owner) clashes.push(label);
    else owners.set(label, owner);
  };
  for (const op of ops) {
    const r = op.row ?? {};
    if (op.table === "public.agencies" && r.slug) claim(r.slug, `ws:${op.id}`);
    if (op.table === "public.talent_sites" && r.site_slug) claim(r.site_slug, `talent:${r.talent_profile_id}`);
    if (op.table === "public.agency_domains" && r.kind === "subdomain") claim(String(r.hostname).split(".")[0], `ws:${r.tenant_id}`);
  }
  return clashes;
}

export function verifyS2Plan(ops, { externalTenantIds = new Set(), existingTalentIds = new Set() } = {}) {
  const fixtureIds = new Set(ops.filter((o) => o.id).map((o) => o.id));
  const tenantIds = new Set(ops.filter((o) => o.table === "public.agencies" && o.kind !== "update").map((o) => o.id));
  const res = checkS2Plan(ops, { fixtureIds, tenantIds, externalTenantIds, existingTalentIds });
  const problems = [...res.problems, ...publicCopyProblems(ops), ...alcoholDealProblems(ops), ...labelCollisions(ops).map((l) => `DNS label ${l} is claimed twice`)];
  return { ok: problems.length === 0, problems, fixtureIds, tenantIds };
}

/** Plan summary: table -> inserts / updates (for the write list). */
export function summarise(ops) {
  const out = {};
  for (const op of ops) {
    const t = (out[op.table] ??= { insert: 0, update: 0 });
    if (op.kind === "update") t.update += 1;
    else t.insert += 1;
  }
  return out;
}

/**
 * --repair guard: only the seed's own workspaces (id = s2Id("workspace:*") of this plan, slug s2-*) may be touched.
 * `rows` = [{ id, slug }] as read from the database; returns the reasons to refuse (empty = ok).
 */
export function repairTargetProblems(rows, fixtureWorkspaceIds) {
  const out = [];
  for (const r of rows) {
    if (!fixtureWorkspaceIds.has(r.id)) out.push(`workspace ${r.id} is not one of this seed's fixture workspaces`);
    if (!String(r.slug ?? "").startsWith(S2_SLUG_PREFIX)) out.push(`workspace ${r.id} (${r.slug}) does not have an ${S2_SLUG_PREFIX} slug`);
  }
  return out;
}

/**
 * Rows the DATABASE writes by itself when this plan runs (triggers), counted from the plan so PM's shared-row note and the cleanup accounting
 * cover them. The roster figure is inferred from the Conductor's selftest delta (+6 roster rows for 3 new talents = 3 explicit + 3 trigger).
 * Cleanup removes them: roster rows hang off the talent (FK descent) and profiles go with their login.
 */
export function triggerSideEffects(ops) {
  const users = ops.filter((o) => o.kind === "authUser").length;
  const talents = ops.filter((o) => o.table === "public.talent_profiles" && o.kind === "insert").length;
  const reservationTenants = new Set(ops.filter((o) => o.table === "public.venue_service_rules" && o.row?.is_active).map((o) => o.row.tenant_id)).size;
  const completed = new Set(ops.filter((o) => o.table === "public.agency_bookings" && o.row?.status === "completed").map((o) => o.id));
  const completedTalents = new Set(ops.filter((o) => o.table === "public.booking_talent" && completed.has(o.row?.booking_id)).map((o) => o.row.talent_profile_id)).size;
  const historyBookings = completed.size;
  return [
    { table: "auth.identities", rows: users, note: "written explicitly by the seed with each login" },
    { table: "public.profiles", rows: users, note: "made by the signup trigger; the seed then UPDATES these rows (its own)" },
    { table: "public.staff_pin_hashes", rows: ops.filter((o) => o.kind === "pin").length, note: "FUNCTION-made: rpc pos_set_staff_pin writes the manager's PIN hash (only when the table exists; idempotent)" },
    { table: "public.agency_talent_roster", rows: talents, note: "hub roster auto-enroll, one per new talent (the selftest delta of +6 for 3 talents = 3 explicit roster rows + 3 trigger rows); cleanup removes them through the talent" },
    { table: "public.talent_profiles (total_completed_bookings)", rows: completedTalents, note: "UPDATE of the seed's own stylist TAL-96202 by AFTER INSERT triggers when a completed history booking and its booking_talent line are inserted; no new row" },
    { table: "public.orders", rows: 0, note: `NONE: bookings_write_order returns early because the ${historyBookings} history bookings have no source inquiry (so no order, no payment, no ledger row)` },
    { table: "public.client_reviews (published_at)", rows: 0, note: "BEFORE INSERT trigger sets published_at on the review row itself; no extra row" },
    { table: "public.agencies (takes_reservations flag)", rows: reservationTenants, note: "trigger on venue_service_rules flips the flag on the seed's own workspace" },
  ];
}

/**
 * What --repair may touch. It undoes ONLY what an earlier version of this seed wrote and later learned was wrong (the direct settings.people.pins
 * key, TUL-1516). Content added after that (service slugs, history bookings, reviews, posts, the from-price service) was never written by an
 * earlier version, so there is nothing to undo: --repair leaves those tables alone and is a no-op for them.
 */
export const REPAIR_SCOPE = Object.freeze({ "public.agencies": "settings #- '{people,pins}'" });
