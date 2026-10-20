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

export const ALLOWED_TALENT_CODES = ["TAL-93900"];
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

const EMAIL_COLS = new Set(["email", "contact_email", "payer_email", "holder_email", "notification_email", "recipient_email", "to_email"]);
const SLUG_COLS = new Set(["slug", "site_slug", "tenant_slug", "hostname"]);

/** Tables whose title / name / label / description / category are shown to the public. */
export const PUBLIC_COPY_TABLES = new Set([
  "public.talent_offerings", "public.talent_offering_variants", "public.talent_offering_addons", "public.events", "public.venues",
  "public.spaces", "public.space_groups", "public.agencies", "public.agency_business_identity", "public.links", "public.prep_stations",
  "public.profiles",
]);
const COPY_COLS = ["title", "description", "category", "label", "name", "display_name", "public_name", "tagline"];

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
export function checkS2Plan(ops, { fixtureIds = new Set(), tenantIds = new Set(), externalTenantIds = new Set() } = {}) {
  const problems = [];
  const allowedTenant = (t) => tenantIds.has(t) || externalTenantIds.has(t);
  for (const op of ops) {
    const where = `${op.fx} ${op.table} ${op.key ?? op.id}`;
    if (op.kind === "update" || op.kind === "delete" || op.kind === "pin") {
      if (!fixtureIds.has(op.id)) problems.push(`${where}: ${op.kind} on a non-fixture row`);
    } else if (op.id && !fixtureIds.has(op.id)) problems.push(`${where}: insert id is not a deterministic fixture id`);
    else if (!op.id) {
      const refs = Object.values(op.row ?? {}).some((v) => typeof v === "string" && fixtureIds.has(v));
      if (!refs) problems.push(`${where}: row without an id does not reference a fixture row`);
    }
    if (op.id && op.kind !== "update" && op.kind !== "pin" && op.kind !== "authUser" && op.id !== s2Id(op.key)) problems.push(`${where}: id is not s2Id(key)`);
    const values = { ...(op.row ?? {}), ...(op.set ?? {}), ...(op.merge ?? {}) };
    const t = values.tenant_id;
    if (typeof t === "string" && !allowedTenant(t)) problems.push(`${where}: tenant_id ${t} is not a fixture tenant`);
    for (const s of walk(values)) {
      const low = s.toLowerCase();
      for (const b of FORBIDDEN_TOKENS) if (low.includes(b.toLowerCase())) problems.push(`${where}: names forbidden ${b}`);
      if (QA_POOL_HOST.test(s)) problems.push(`${where}: names a qa-1..qa-6 pool host/row (${s.slice(0, 40)})`);
      for (const m of s.match(TALENT_CODE) ?? []) if (!ALLOWED_TALENT_CODES.includes(m.toUpperCase())) problems.push(`${where}: names talent ${m}; only ${ALLOWED_TALENT_CODES.join(",")} is allowed`);
    }
    for (const [col, v] of Object.entries(values)) {
      if (EMAIL_COLS.has(col) && v != null && !isExampleTestEmail(v)) problems.push(`${where}: ${col} is not an ${EMAIL_DOMAIN} mailbox`);
      if (SLUG_COLS.has(col) && v != null && !String(v).startsWith(S2_SLUG_PREFIX)) problems.push(`${where}: ${col} must start with ${S2_SLUG_PREFIX}`);
    }
    if (op.table === "public.links" && !String(op.row?.code ?? "").startsWith(S2_SLUG_PREFIX)) problems.push(`${where}: link code must start with ${S2_SLUG_PREFIX}`);
    if (op.table === "public.talent_profiles" && !ALLOWED_TALENT_CODES.includes(String(op.row?.profile_code ?? ""))) problems.push(`${where}: a talent profile other than ${ALLOWED_TALENT_CODES.join(",")}`);
    if (op.table === "public.talent_profiles" && op.kind !== "update") problems.push(`${where}: this seed never inserts a talent profile`);
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
    if (op.table === "public.agency_domains" && r.kind === "subdomain") claim(String(r.hostname).split(".")[0], `ws:${r.tenant_id}`);
  }
  return clashes;
}

export function verifyS2Plan(ops, { externalTenantIds = new Set() } = {}) {
  const fixtureIds = new Set(ops.filter((o) => o.id).map((o) => o.id));
  const tenantIds = new Set(ops.filter((o) => o.table === "public.agencies" && o.kind !== "update").map((o) => o.id));
  const res = checkS2Plan(ops, { fixtureIds, tenantIds, externalTenantIds });
  const problems = [...res.problems, ...publicCopyProblems(ops), ...alcoholDealProblems(ops), ...labelCollisions(ops).map((l) => `DNS label ${l} is claimed twice`)];
  return { ok: problems.length === 0, problems, fixtureIds, tenantIds };
}

/** Plan summary: table -> inserts / updates (for the write list). */
export function summarise(ops) {
  const out = {};
  for (const op of ops) {
    const t = (out[op.table] ??= { insert: 0, update: 0 });
    if (op.kind === "update" || op.kind === "pin") t.update += 1;
    else t.insert += 1;
  }
  return out;
}
