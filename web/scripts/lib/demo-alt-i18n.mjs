/**
 * Pure core of scripts/demo-talents/repair-demo-alt-i18n.mts (Refs TUL-1792). No I/O, no process.exit,
 * so every refusal and every plan decision is unit-testable.
 *
 * Problem: seeded demo photos keep only an English description in media_assets.alt and have no
 * per-language alt. The renderer (src/lib/site-admin/builder-node/portfolio-i18n.ts resolvePortfolioAlt)
 * reads `media_assets.metadata.alt_i18n` as a `{ es?: string, en?: string }` map, visitor locale first.
 * This core plans the additive write of exactly that shape. Nothing here is machine-translated: the
 * Spanish and English strings are built from stored facts (display name, city, taxonomy term name_i18n es /
 * en) with fixed templates, or the English string reuses the photo's own human `alt` column.
 *
 * Write surface (enforced by checkWritePlan): table media_assets, column metadata, rows whose owner is an
 * allow-listed demo talent. Merge is additive (`alt_i18n` locales only; every other metadata key kept).
 */
import { checkFcTarget } from "./failed-cards-guards.mjs";
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from "./group6-fixtures.mjs";

export const TARGET_REF = STAGING_PROJECT_REF;
export const DEMO_CODE_RE = /^TAL-93\d{3}$/;
/** TAL-93938 is a REAL talent (never touched); TAL-93940 (QAMAX) is observe-only. */
export const FORBIDDEN_PROFILE_CODES = ["TAL-93938", "TAL-93940"];
export const LOCALES = ["es", "en"];
export const ALT_MAX_CHARS = 125;
export const BACKUP_KIND = "demo-alt-i18n-repair";

// ------------------------------------------------------------------ args
export function parseArgs(argv) {
  const out = { apply: false, selftest: false, help: false, envFile: null, backupFile: null, restore: null, only: null, forceLocales: [], errors: [] };
  const val = (i, flag) => {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) out.errors.push(`${flag} needs a value`);
    return v && !v.startsWith("--") ? v : null;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--selftest") out.selftest = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--env-file") { out.envFile = val(i, a); i += 1; }
    else if (a === "--backup-file") { out.backupFile = val(i, a); i += 1; }
    else if (a === "--restore") { out.restore = val(i, a); i += 1; }
    else if (a === "--only") {
      const v = val(i, a);
      i += 1;
      if (v) out.only = v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else if (a === "--force-locale") {
      const v = val(i, a);
      i += 1;
      if (v) out.forceLocales = v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else out.errors.push(`unknown argument ${a}`);
  }
  for (const l of out.forceLocales) if (!LOCALES.includes(l)) out.errors.push(`--force-locale ${l}: only ${LOCALES.join(", ")}`);
  for (const c of out.only ?? []) {
    if (FORBIDDEN_PROFILE_CODES.includes(c)) out.errors.push(`${c} is forbidden`);
    else if (!DEMO_CODE_RE.test(c)) out.errors.push(`--only ${c}: not a demo profile code (TAL-93xxx)`);
  }
  if (out.selftest && (out.apply || out.restore)) out.errors.push("--selftest cannot be combined with --apply or --restore");
  if (out.apply && !out.backupFile) out.errors.push("--apply requires --backup-file <new path> (records the pre-image of every metadata it changes)");
  if (out.backupFile && !out.apply) out.errors.push("--backup-file only applies with --apply");
  if (out.restore && out.only) out.errors.push("--restore replays the backup file exactly; --only does not apply");
  if (out.restore && out.forceLocales.length) out.errors.push("--force-locale does not apply to --restore");
  return out;
}

// ------------------------------------------------------------------ guards
/** Staging only: fxlankepwnvelxjrahwk. Refuses pluhda* and every other ref. */
export function checkTarget(env) {
  const base = checkFcTarget(env);
  const reasons = [...base.reasons];
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && /DATABASE|POSTGRES|SUPABASE/.test(k) && v.toLowerCase().includes("pluhda")) reasons.push(`${k} mentions a pluhda* (production) ref`);
  }
  if (!String(env.DATABASE_URL ?? "").includes(TARGET_REF)) reasons.push(`DATABASE_URL must name project ref ${TARGET_REF}`);
  if (String(env.DATABASE_URL ?? "").toLowerCase().includes(PRODUCTION_PROJECT_REF)) reasons.push("DATABASE_URL names the PRODUCTION project");
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Build the allow-list from raw codes read out of code: valid demo shape, never forbidden. */
export function buildAllowList(rawCodes) {
  const allowed = new Set();
  const dropped = [];
  for (const c of rawCodes) {
    const code = String(c ?? "").trim().toUpperCase();
    if (FORBIDDEN_PROFILE_CODES.includes(code)) dropped.push(`${code}: forbidden`);
    else if (!DEMO_CODE_RE.test(code)) dropped.push(`${code}: not a demo code`);
    else allowed.add(code);
  }
  return { allowed, dropped };
}

/** `--only` may narrow the allow-list, never widen it. */
export function narrowAllowList(allowed, only) {
  if (!only) return { allowed: new Set(allowed), errors: [] };
  const errors = [];
  const out = new Set();
  for (const c of only) {
    if (FORBIDDEN_PROFILE_CODES.includes(c)) errors.push(`${c} is forbidden`);
    else if (!allowed.has(c)) errors.push(`${c} is not in the demo allow-list`);
    else out.add(c);
  }
  return { allowed: out, errors };
}

/**
 * Refuse a write plan that could touch anything outside the contract. `changes` are the planned
 * updates (see planRow). `forbiddenIds` are the staging ids of the forbidden talents (resolved read-only).
 */
export function checkWritePlan(changes, { allowed, forbiddenIds = [] }) {
  const problems = [];
  const banned = new Set(forbiddenIds.map((s) => String(s).toLowerCase()));
  for (const c of changes) {
    const where = `media_assets ${c.id}`;
    if (c.table !== "media_assets") problems.push(`${where}: table must be media_assets`);
    if (c.column !== "metadata") problems.push(`${where}: column must be metadata`);
    if (FORBIDDEN_PROFILE_CODES.includes(c.profile_code)) problems.push(`${where}: owner ${c.profile_code} is forbidden`);
    else if (!allowed.has(c.profile_code)) problems.push(`${where}: owner ${c.profile_code} is not an allow-listed demo talent`);
    if (banned.has(String(c.owner_talent_profile_id).toLowerCase()) || banned.has(String(c.id).toLowerCase())) problems.push(`${where}: references a forbidden talent`);
    const extra = Object.keys(c.set ?? {}).filter((k) => !LOCALES.includes(k));
    if (extra.length) problems.push(`${where}: set may only carry ${LOCALES.join("/")}, got ${extra.join(",")}`);
    if (!Object.keys(c.set ?? {}).length) problems.push(`${where}: empty change`);
    // After must equal before plus alt_i18n locales only.
    if (!sameExceptAltI18n(c.before, c.after)) problems.push(`${where}: after differs from before outside alt_i18n`);
  }
  return { ok: problems.length === 0, problems };
}

// ------------------------------------------------------------------ json helpers
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
export const sameJson = (a, b) => canon(a) === canon(b);
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const txt = (v) => (typeof v === "string" ? v.trim() : "");

function sameExceptAltI18n(before, after) {
  const b = { ...(isObj(before) ? before : {}) };
  const a = { ...(isObj(after) ? after : {}) };
  delete b.alt_i18n;
  delete a.alt_i18n;
  return sameJson(b, a);
}

/** Additive merge, the JS twin of the SQL `metadata || jsonb_build_object('alt_i18n', alt_i18n || set)`. */
export function mergeAltI18n(metadata, set) {
  const base = isObj(metadata) ? metadata : {};
  const prev = isObj(base.alt_i18n) ? base.alt_i18n : {};
  return { ...base, alt_i18n: { ...prev, ...set } };
}

// ------------------------------------------------------------------ text generation (pure, no AI)
const clean = (s) => String(s ?? "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

/** Slug or file-id style text (mirrors portfolio-alt-suggest.looksLikeSlugAlt). */
export function looksLikeSlug(text) {
  const t = clean(text);
  if (!t) return false;
  if (/\.(jpe?g|png|webp|gif|avif|heic)$/i.test(t)) return true;
  if (/\s/.test(t)) return false;
  return /^[a-z0-9]+([-_.][a-z0-9]+)+$/i.test(t) || /^[a-z]*\d{3,}[a-z0-9]*$/i.test(t);
}

const ES_MARKERS = /[¿¡ñ]|\b(de|del|con|para|una|los|las|el|la|en un|en una)\b/i;
/** Which language a stored description looks like. The seeds store English, so "en" is the default. */
export function guessLocale(text) {
  return ES_MARKERS.test(text) ? "es" : "en";
}

/** The photo's own `alt` column is reusable when it is real human copy of a sensible length. */
export function reusableAlt(alt) {
  const t = clean(alt);
  if (!t || looksLikeSlug(t) || !/\s/.test(t)) return null;
  if (t.length < 8 || t.length > ALT_MAX_CHARS) return null;
  return t;
}

function lcTrade(trade) {
  const t = clean(trade);
  if (!t) return "";
  const [first, ...rest] = t.split(" ");
  // Keep acronyms ("DJ", "MC") and lowercase a plain leading capital so the phrase reads naturally after a comma.
  const acronym = first.length > 1 && first[1] === first[1].toUpperCase() && /[A-Z]/.test(first[1]);
  return [acronym ? first : first.charAt(0).toLowerCase() + first.slice(1), ...rest].join(" ");
}

function fit(parts) {
  // parts: [{ text, droppable }] joined by the caller; try full, then drop city, then trade.
  for (let drop = 0; drop <= 2; drop += 1) {
    const s = parts(drop);
    if (s.length <= ALT_MAX_CHARS) return s;
  }
  return parts(2).slice(0, ALT_MAX_CHARS).trim();
}

/**
 * Deterministic EN + ES description for one photo.
 * facts: { name, city, tradeEn, tradeEs }; variant: card | hero | gallery | polaroid | other.
 */
export function generateAlt(facts, variant) {
  const name = clean(facts.name);
  const city = clean(facts.city);
  const tradeEn = lcTrade(facts.tradeEn);
  const tradeEs = lcTrade(facts.tradeEs);
  if (!name) return { en: "", es: "" };
  const portrait = variant === "card" || variant === "hero";
  const polaroid = variant === "polaroid";
  const build = (lead, trade, inWord) => (drop) => {
    const t = drop >= 2 ? "" : trade;
    const c = drop >= 1 ? "" : city;
    return `${lead} ${name}${t ? `, ${t}` : ""}${c ? `, ${inWord} ${c}` : ""}`;
  };
  const leadEn = polaroid ? "Polaroid of" : portrait ? "Portrait of" : "Work by";
  const leadEs = polaroid ? "Polaroid de" : portrait ? "Retrato de" : "Trabajo de";
  return { en: clean(fit(build(leadEn, tradeEn, "in"))), es: clean(fit(build(leadEs, tradeEs, "en"))) };
}

// ------------------------------------------------------------------ planning
/**
 * row: { id, owner_talent_profile_id, profile_code, display_name, city, trade_en, trade_es,
 *        variant_kind, sort_order, alt, metadata }
 * Returns { status: "will-set" | "already-set" | "skipped", reason, ... } with the full plan detail.
 */
export function planRow(row, { allowed, forceLocales = [] }) {
  const code = String(row.profile_code ?? "");
  const base = { id: row.id, profile_code: code, owner_talent_profile_id: row.owner_talent_profile_id, variant_kind: row.variant_kind, sort_order: row.sort_order, currentAlt: row.alt ?? null };
  const skip = (reason) => ({ ...base, status: "skipped", reason, current: {}, planned: {}, set: {} });
  if (FORBIDDEN_PROFILE_CODES.includes(code)) return skip("forbidden talent");
  if (!allowed.has(code)) return skip("owner is not an allow-listed demo talent");
  const metadata = row.metadata == null ? {} : row.metadata;
  if (!isObj(metadata)) return skip("metadata is not a json object");
  if (metadata.alt_i18n != null && !isObj(metadata.alt_i18n)) return skip("metadata.alt_i18n exists but is not an object");
  if (!clean(row.display_name)) return skip("talent has no display name");

  const current = {};
  for (const l of LOCALES) current[l] = txt(metadata.alt_i18n?.[l]);

  // taxonomy_terms.name_i18n ->> 'en' / 'es' (aliased trade_en / trade_es): each falls back to the other, then to no trade phrase.
  const tradeEn = txt(row.trade_en) || txt(row.trade_es);
  const tradeEs = txt(row.trade_es) || txt(row.trade_en);
  const gen = generateAlt({ name: row.display_name, city: row.city, tradeEn, tradeEs }, String(row.variant_kind ?? ""));
  const planned = { en: gen.en, es: gen.es };
  const reuse = reusableAlt(row.alt);
  if (reuse) planned[guessLocale(reuse)] = reuse;

  const force = new Set(forceLocales);
  const set = {};
  for (const l of LOCALES) {
    if (!planned[l]) continue;
    const have = current[l];
    if (have && !force.has(l)) continue;
    if (have && have === planned[l]) continue;
    set[l] = planned[l];
  }
  if (!Object.keys(set).length) {
    const missing = LOCALES.filter((l) => !current[l] && !planned[l]);
    return missing.length ? skip(`cannot generate ${missing.join("/")} (not enough data)`) : { ...base, status: "already-set", reason: "", current, planned, set: {} };
  }
  return { ...base, status: "will-set", reason: "", current, planned, set, before: metadata, after: mergeAltI18n(metadata, set) };
}

export function planAll(rows, opts) {
  return rows.map((r) => planRow(r, opts));
}

/** Changes the writer may execute (will-set only), in a stable order. */
export function changesOf(plans) {
  return plans
    .filter((p) => p.status === "will-set")
    .map((p) => ({ table: "media_assets", column: "metadata", id: p.id, profile_code: p.profile_code, owner_talent_profile_id: p.owner_talent_profile_id, set: p.set, before: p.before, after: p.after }))
    .sort((a, b) => (a.profile_code + a.id).localeCompare(b.profile_code + b.id));
}

export function summarise(plans) {
  const byTalent = {};
  for (const p of plans) {
    const t = (byTalent[p.profile_code] ??= { photos: 0, "will-set": 0, "already-set": 0, skipped: 0 });
    t.photos += 1;
    t[p.status] += 1;
  }
  const totals = { photos: plans.length, "will-set": 0, "already-set": 0, skipped: 0 };
  for (const p of plans) totals[p.status] += 1;
  return { byTalent, totals };
}

export function formatPlanLine(p) {
  const cur = `es=${JSON.stringify(p.current.es ?? "")} en=${JSON.stringify(p.current.en ?? "")}`;
  const head = `${p.profile_code} ${p.id} [${p.variant_kind}#${p.sort_order}] alt=${JSON.stringify(p.currentAlt)}`;
  if (p.status === "skipped") return `${head}\n    skipped: ${p.reason}`;
  if (p.status === "already-set") return `${head}\n    already set (${cur})`;
  return `${head}\n    will set: ${Object.entries(p.set).map(([l, v]) => `${l}=${JSON.stringify(v)}`).join(" ")}  (current ${cur})`;
}

// ------------------------------------------------------------------ backup + restore
export function buildBackup({ mode, at, forceLocales = [], changes }) {
  return {
    kind: BACKUP_KIND,
    version: 1,
    target: TARGET_REF,
    mode,
    at,
    force_locales: forceLocales,
    updated: changes.map((c) => ({ table: "media_assets", column: "metadata", id: c.id, profile_code: c.profile_code, owner_talent_profile_id: c.owner_talent_profile_id, before: c.before, after: c.after })),
  };
}

/** Validate a parsed backup file before --restore trusts it. */
export function checkBackup(b, { allowed }) {
  const problems = [];
  if (!isObj(b) || b.kind !== BACKUP_KIND || b.version !== 1) problems.push("not a demo-alt-i18n-repair v1 backup");
  if (isObj(b) && b.target !== TARGET_REF) problems.push(`backup target must be ${TARGET_REF}`);
  const rows = isObj(b) && Array.isArray(b.updated) ? b.updated : [];
  if (isObj(b) && !Array.isArray(b.updated)) problems.push("backup has no updated[]");
  rows.forEach((u, i) => {
    const at = `updated[${i}]`;
    if (u?.table !== "media_assets" || u?.column !== "metadata") problems.push(`${at}: only media_assets.metadata can be restored`);
    if (!u?.id || !isObj(u?.before) || !isObj(u?.after)) problems.push(`${at}: needs id, before and after objects`);
    if (FORBIDDEN_PROFILE_CODES.includes(u?.profile_code)) problems.push(`${at}: owner ${u.profile_code} is forbidden`);
    else if (!allowed.has(u?.profile_code)) problems.push(`${at}: owner ${u?.profile_code} is not an allow-listed demo talent`);
    if (isObj(u?.before) && isObj(u?.after) && !sameExceptAltI18n(u.before, u.after)) problems.push(`${at}: before/after differ outside alt_i18n`);
  });
  return { ok: problems.length === 0, problems };
}

/**
 * Restore plan: put `before` back only where the live metadata still equals the backup's `after`
 * (a row edited since is left alone and reported).
 */
export function planRestore(backup, liveById) {
  return backup.updated.map((u) => {
    const live = liveById.get(u.id);
    if (!live) return { id: u.id, profile_code: u.profile_code, status: "skipped", reason: "row not found or no longer owned by the recorded talent" };
    if (sameJson(live.metadata, u.before)) return { id: u.id, profile_code: u.profile_code, status: "already-restored", reason: "" };
    if (!sameJson(live.metadata, u.after)) return { id: u.id, profile_code: u.profile_code, status: "skipped", reason: "metadata changed since the repair (not equal to the recorded after)" };
    return { id: u.id, profile_code: u.profile_code, owner_talent_profile_id: u.owner_talent_profile_id, status: "will-restore", reason: "", before: u.before, after: u.after };
  });
}
