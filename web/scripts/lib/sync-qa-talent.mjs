// Pure helpers for scripts/sync-qa-talent-from-real.mjs (TUL-135).
// No I/O here: the diff builder, the write planner and the ownership guard are
// unit-tested in sync-qa-talent.test.mjs. The source talent is NEVER written.

export const SOURCE_CODE = "TAL-93938"; // real Jorgelina (read-only)
export const TARGET_CODE = "TAL-93900"; // QA twin (the only writable talent)

// kind drives SQL literal rendering: text|int|bool|json|textarray|uuid
export const PROFILE_FIELDS = [
  { area: "profile", col: "display_name", kind: "text" },
  { area: "profile", col: "short_bio", kind: "text" },
  { area: "profile", col: "bio_i18n", path: ["en"], kind: "json" },
  { area: "profile", col: "bio_i18n", path: ["es"], kind: "json" },
  { area: "profile", col: "intro_italic", kind: "text" },
  { area: "profile", col: "service_category_slug", kind: "text" },
  { area: "profile", col: "languages", kind: "textarray" },
  { area: "profile", col: "location_id", kind: "uuid" },
  { area: "profile", col: "home_city_text", kind: "text" },
  { area: "profile", col: "home_country_text", kind: "text" },
  { area: "profile", col: "home_place_id", kind: "text" },
  { area: "profile", col: "residence_country_id", kind: "uuid" },
  { area: "profile", col: "residence_city_id", kind: "uuid" },
  { area: "profile", col: "travels_globally", kind: "bool" },
  { area: "profile", col: "remote_only", kind: "bool" },
  { area: "profile", col: "travel_radius_km", kind: "int" },
  { area: "profile", col: "booking_note", kind: "text" },
  { area: "profile", col: "booking_terms", kind: "json" },
  { area: "profile", col: "services_menu", kind: "json" },
  { area: "profile", col: "selling_defaults", kind: "json" },
  { area: "locale", col: "preferred_locale", kind: "text" },
  { area: "locale", col: "secondary_locales", kind: "textarray" },
  { area: "locale", col: "default_currency", kind: "text" },
];

export const OFFERING_FIELDS = [
  { col: "title", kind: "text" },
  { col: "title_i18n", path: ["en"], kind: "json" },
  { col: "title_i18n", path: ["es"], kind: "json" },
  { col: "description", kind: "text" },
  { col: "kind", kind: "text" },
  { col: "amount_cents", kind: "int" },
  { col: "currency", kind: "text" },
  { col: "price_type", kind: "text" },
  { col: "price_display", kind: "text" },
  { col: "booking_mode", kind: "text" },
  { col: "duration_minutes", kind: "int" },
  { col: "status", kind: "text" },
  { col: "sort_order", kind: "int" },
  { col: "attributes", kind: "json" },
  { col: "offering_defaults", kind: "json" },
];

// Buffers are booking-hours columns in this schema (no per-service buffer).
export const HOURS_FIELDS = [
  { area: "hours", col: "timezone", kind: "text" },
  { area: "hours", col: "weekly", kind: "json" },
  { area: "hours", col: "exceptions", kind: "json" },
  { area: "hours", col: "slot_minutes", kind: "int" },
  { area: "hours", col: "buffer_before_min", kind: "int" },
  { area: "hours", col: "buffer_after_min", kind: "int" },
  { area: "hours", col: "min_notice_min", kind: "int" },
  { area: "hours", col: "horizon_days", kind: "int" },
];

export const SITE_FIELDS = [
  { area: "site-design", col: "theme_design_slug", kind: "text" },
  { area: "site-design", col: "theme_design_version", kind: "int" },
  { area: "site-design", col: "theme_look_slug", kind: "text" },
  { area: "site-design", col: "theme_demo_slug", kind: "text" },
  { area: "site-design", col: "theme_version", kind: "int" },
  { area: "site-design", col: "menu_style", kind: "text" },
  { area: "site-design", col: "custom_palette", kind: "json" },
  { area: "site-design", col: "design_tokens", kind: "json" },
  { area: "site-design", col: "design_tokens_draft", kind: "json" },
  { area: "site-design", col: "theme_token_origin", kind: "json" },
  { area: "site-design", col: "style_classes", kind: "json" },
  { area: "site-design", col: "style_presets", kind: "json" },
  { area: "site-design", col: "setup_choices", kind: "json" },
  { area: "site-design", col: "accepting_bookings", kind: "bool" },
  { area: "site-design", col: "accepting_inquiries", kind: "bool" },
  { area: "site-design", col: "chat_enabled", kind: "bool" },
  { area: "site-design", col: "chat_config", kind: "json" },
  { area: "site-sections", col: "shell_tree", kind: "json" },
  { area: "site-sections", col: "shell_published", kind: "json" },
];

// Reported but never copied (profile-owned media files).
export const MEDIA_FIELDS = [{ area: "media", col: "logo_url", kind: "text" }];

// ── generic helpers ─────────────────────────────────────────────────────────

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

export function getAtPath(row, col, path) {
  const base = row?.[col];
  if (!path) return base ?? null;
  let cur = base;
  for (const p of path) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[p];
  }
  return cur ?? null;
}

const fieldLabel = (f) => (f.path ? `${f.col}.${f.path.join(".")}` : f.col);

// A profile-owned storage object: .../talent/<profile-uuid>/...
const OWNED_MEDIA_RE = /\/talent\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;
export const isOwnedMediaUrl = (s) => typeof s === "string" && /^https?:\/\//.test(s) && OWNED_MEDIA_RE.test(s);

/** Collect profile-owned media URLs in a JSON value: [{path, url}]. */
export function collectOwnedMedia(value, path = "$", out = []) {
  if (typeof value === "string") {
    if (isOwnedMediaUrl(value)) out.push({ path, url: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectOwnedMedia(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectOwnedMedia(v, `${path}.${k}`, out);
  }
  return out;
}

/** Replace owned-media URLs with a token so media-only differences do not count. */
export function maskOwnedMedia(value) {
  if (typeof value === "string") return isOwnedMediaUrl(value) ? "<owned-media>" : value;
  if (Array.isArray(value)) return value.map(maskOwnedMedia);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskOwnedMedia(v)]));
  }
  return value;
}

/** Replace every string occurrence of `from` with `to` (profile-id rewrite). */
export function rewriteId(value, from, to) {
  if (typeof value === "string") return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((v) => rewriteId(v, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteId(v, from, to)]));
  }
  return value;
}

/** Up to `limit` JSON paths that differ: [{path, source, target}]. */
export function jsonDiffPaths(a, b, path = "$", out = [], limit = 12) {
  if (out.length >= limit) return out;
  const bothObj = a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b);
  if (!bothObj) {
    if (!deepEqual(a, b)) out.push({ path, source: a ?? null, target: b ?? null });
    return out;
  }
  const keys = Array.isArray(a)
    ? [...Array(Math.max(a.length, b.length)).keys()]
    : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    if (out.length >= limit) break;
    jsonDiffPaths(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`, out, limit);
  }
  return out;
}

// ── offerings matching ──────────────────────────────────────────────────────

const normTitle = (r) => String(r.title ?? "").trim().toLowerCase();

/**
 * Pair source and target offerings: exact title first, then unique sort_order
 * among the leftovers. Returns {pairs:[{source,target}], sourceOnly, targetOnly}.
 */
export function matchOfferings(sourceRows, targetRows) {
  const pairs = [];
  const tLeft = [...targetRows];
  const sLeft = [];
  for (const s of sourceRows) {
    const i = tLeft.findIndex((t) => normTitle(t) === normTitle(s));
    if (i >= 0) pairs.push({ source: s, target: tLeft.splice(i, 1)[0] });
    else sLeft.push(s);
  }
  const sourceOnly = [];
  for (const s of sLeft) {
    const cands = tLeft.filter((t) => t.sort_order === s.sort_order);
    const sameOrderSrc = sLeft.filter((x) => x.sort_order === s.sort_order);
    if (cands.length === 1 && sameOrderSrc.length === 1) {
      pairs.push({ source: s, target: tLeft.splice(tLeft.indexOf(cands[0]), 1)[0] });
    } else sourceOnly.push(s);
  }
  return { pairs, sourceOnly, targetOnly: tLeft };
}

const taxKey = (r) => `${r.kind}:${r.slug}|primary=${!!r.is_primary}|${r.relationship_type}`;

// ── exclusions (--exclude bookingPosture,inPersonMethods,qaOfferings) ──────

export const AUTO_EXCLUDE = ["bookingPosture", "inPersonMethods"];
// Exclusion tokens that live as keys inside talent_profiles.selling_defaults.
const SELLING_DEFAULT_KEYS = new Set(["bookingPosture", "inPersonMethods"]);

/** argv -> Set of exclusion tokens. Explicit --exclude wins; --auto alone uses the defaults. */
export function parseExclusions(argv) {
  const i = argv.findIndex((a) => a === "--exclude" || a.startsWith("--exclude="));
  if (i >= 0) {
    const raw = argv[i].includes("=") ? argv[i].split("=")[1] : (argv[i + 1] ?? "");
    return new Set(raw.split(",").map((x) => x.trim()).filter(Boolean));
  }
  return new Set(argv.includes("--auto") ? AUTO_EXCLUDE : []);
}

/** Copy of a profile row with excluded selling_defaults keys removed. */
export function stripExcluded(profile, exclude) {
  const sd = profile?.selling_defaults;
  if (!sd || typeof sd !== "object" || ![...exclude].some((k) => SELLING_DEFAULT_KEYS.has(k))) return profile;
  return { ...profile, selling_defaults: Object.fromEntries(Object.entries(sd).filter(([k]) => !exclude.has(k))) };
}

/** New selling_defaults = source minus excluded keys, plus the target's own excluded keys. */
export function mergeSellingDefaults(sourceValue, targetValue, exclude) {
  const keep = Object.fromEntries(Object.entries(targetValue ?? {}).filter(([k]) => exclude.has(k)));
  const src = Object.fromEntries(Object.entries(sourceValue ?? {}).filter(([k]) => !exclude.has(k)));
  return { ...src, ...keep };
}

// ── diff builder ────────────────────────────────────────────────────────────

function fieldDiffs(fields, src, tgt, mask = false) {
  const out = [];
  for (const f of fields) {
    let a = getAtPath(src, f.col, f.path);
    let b = getAtPath(tgt, f.col, f.path);
    if (mask) {
      a = maskOwnedMedia(a);
      b = maskOwnedMedia(b);
    }
    if (!deepEqual(a, b)) out.push({ area: f.area, field: fieldLabel(f), col: f.col, path: f.path, kind: f.kind, source: a, target: b });
  }
  return out;
}

/**
 * input: { source, target } each { profile, taxonomy:[{kind,slug,...}], offerings:[], hours, site }
 * returns { entries:[{area, field, source, target, ...}], offerings:{pairs,sourceOnly,targetOnly}, counts }
 */
export function buildDiff({ source, target, exclude = new Set() }) {
  const entries = [];
  entries.push(...fieldDiffs(PROFILE_FIELDS, stripExcluded(source.profile, exclude), stripExcluded(target.profile, exclude)));

  const sTax = new Set(source.taxonomy.map(taxKey));
  const tTax = new Set(target.taxonomy.map(taxKey));
  const taxDiffers = [...sTax].some((k) => !tTax.has(k)) || [...tTax].some((k) => !sTax.has(k));
  if (taxDiffers) {
    entries.push({
      area: "profile",
      field: "specialties (taxonomy)",
      col: "talent_profile_taxonomy",
      source: [...sTax].sort(),
      target: [...tTax].sort(),
    });
  }

  const off = matchOfferings(source.offerings, target.offerings);
  for (const { source: s, target: t } of off.pairs) {
    for (const d of fieldDiffs(OFFERING_FIELDS.map((f) => ({ ...f, area: "offerings" })), s, t)) {
      // Never clear a target description: copy only when the source has one.
      if (d.col === "description" && !String(d.source ?? "").trim()) continue;
      entries.push({ ...d, field: `[${s.title}] ${d.field}`, offeringId: t.id });
    }
  }
  for (const s of off.sourceOnly) {
    entries.push({ area: "offerings", field: `[${s.title}] (missing on target)`, source: "present", target: "absent", insert: s });
  }
  for (const t of exclude.has("qaOfferings") ? [] : off.targetOnly) {
    entries.push({ area: "offerings", field: `[${t.title}] (extra on target, left alone)`, source: "absent", target: `${t.status}`, extra: true });
  }

  if (source.hours && target.hours) entries.push(...fieldDiffs(HOURS_FIELDS, source.hours, target.hours));
  else if (source.hours && !target.hours) entries.push({ area: "hours", field: "(row)", source: "present", target: "absent", insertHours: true });

  if (source.site && target.site) {
    entries.push(...fieldDiffs(SITE_FIELDS, source.site, target.site, true));
    for (const d of fieldDiffs(MEDIA_FIELDS, source.site, target.site)) entries.push({ ...d, notCopied: true });
    const owned = collectOwnedMedia([source.site.shell_tree, source.site.shell_published]);
    for (const m of owned) entries.push({ area: "media", field: `source shell ${m.path}`, source: m.url, target: "(not copied)", notCopied: true });
  }

  const counts = {};
  for (const e of entries) {
    counts[e.area] ??= { total: 0, writable: 0 };
    counts[e.area].total += 1;
    if (!e.notCopied && !e.extra) counts[e.area].writable += 1;
  }
  return { entries, offerings: off, counts };
}

// ── SQL rendering ───────────────────────────────────────────────────────────

const q = (s) => `'${String(s).replace(/'/gu, "''")}'`;

export function sqlLiteral(v, kind) {
  if (v === null || v === undefined) return "NULL";
  switch (kind) {
    case "int":
      return String(Number(v));
    case "bool":
      return v ? "true" : "false";
    case "json":
      return `${q(JSON.stringify(v))}::jsonb`;
    case "textarray":
      return v.length ? `ARRAY[${v.map(q).join(",")}]::text[]` : "'{}'::text[]";
    case "uuid":
      return `${q(v)}::uuid`;
    default:
      return q(v);
  }
}

// ── write planner + ownership guard ─────────────────────────────────────────

export const WRITE_TABLES = {
  talent_profiles: { ownerCol: "id" },
  talent_profile_taxonomy: { ownerCol: "talent_profile_id" },
  talent_offerings: { ownerCol: "talent_profile_id" },
  talent_booking_hours: { ownerCol: "talent_profile_id" },
  talent_sites: { ownerCol: "talent_profile_id" },
};

/**
 * Throws unless every write targets only rows owned by `targetProfileId`.
 * write: {table, op:'update'|'insert'|'delete', where:{col:val}, set?:{col:{v,kind}}, values?:{col:{v,kind}}}
 */
export function assertOwnedWrites(writes, { targetProfileId, sourceProfileId }) {
  if (!targetProfileId || !sourceProfileId || targetProfileId === sourceProfileId) {
    throw new Error("ownership guard: target and source profile ids must be set and different");
  }
  for (const w of writes) {
    const spec = WRITE_TABLES[w.table];
    if (!spec) throw new Error(`ownership guard: table not allowed: ${w.table}`);
    if (!["update", "insert", "delete"].includes(w.op)) throw new Error(`ownership guard: bad op ${w.op}`);
    if (w.op === "insert") {
      const owner = w.values?.[spec.ownerCol === "id" ? "id" : spec.ownerCol]?.v;
      if (w.table === "talent_profiles" || owner !== targetProfileId) {
        throw new Error(`ownership guard: insert into ${w.table} is not owned by ${targetProfileId}`);
      }
    } else if (w.where?.[spec.ownerCol] !== targetProfileId) {
      throw new Error(`ownership guard: ${w.op} on ${w.table} is not scoped to ${targetProfileId}`);
    }
    if (w.op === "update" && !Object.keys(w.set ?? {}).length) throw new Error("ownership guard: empty update");
    // The source must never appear as a key or as a value of an ownership column.
    const touched = JSON.stringify([w.where ?? {}, w.values ?? {}, w.set ?? {}]);
    for (const [col, val] of Object.entries({ ...(w.where ?? {}) })) {
      if (val === sourceProfileId) throw new Error(`ownership guard: ${w.table}.${col} targets the SOURCE profile`);
    }
    if (touched.includes(sourceProfileId)) throw new Error(`ownership guard: write to ${w.table} references the SOURCE profile id`);
  }
  return true;
}

export function writeToSql(w) {
  const lit = (o) => ({ cols: Object.keys(o), vals: Object.values(o).map((x) => sqlLiteral(x.v, x.kind)) });
  const where = Object.entries(w.where ?? {}).map(([c, v]) => `${c} = ${q(v)}`).join(" AND ");
  if (w.op === "update") {
    const set = Object.entries(w.set).map(([c, x]) => `${c} = ${sqlLiteral(x.v, x.kind)}`).join(", ");
    return `UPDATE public.${w.table} SET ${set} WHERE ${where};`;
  }
  if (w.op === "delete") return `DELETE FROM public.${w.table} WHERE ${where};`;
  const { cols, vals } = lit(w.values);
  return `INSERT INTO public.${w.table} (${cols.join(", ")}) VALUES (${vals.join(", ")});`;
}

const OFFERING_INSERT_COLS = [
  ["kind", "text"], ["title", "text"], ["description", "text"], ["price_type", "text"], ["price_display", "text"],
  ["amount_cents", "int"], ["currency", "text"], ["booking_mode", "text"], ["duration_minutes", "int"], ["category", "text"],
  ["status", "text"], ["visibility", "text"], ["moderation_state", "text"], ["is_featured", "bool"], ["sort_order", "int"],
  ["attributes", "json"], ["title_i18n", "json"], ["description_i18n", "json"], ["offering_defaults", "json"], ["tenant_id", "uuid"],
];

/** Turn a diff into guarded write descriptors (target-only). */
export function planWrites({ source, target, diff, targetProfileId, sourceProfileId, exclude = new Set() }) {
  const writes = [];
  const group = (entries, row) => {
    const set = {};
    for (const e of entries) {
      if (e.notCopied || e.extra || !e.col || e.insert || e.insertHours) continue;
      let v;
      if (e.path) {
        const base = structuredClone(set[e.col]?.v ?? row[e.col] ?? {});
        let cur = base;
        e.path.slice(0, -1).forEach((p) => (cur = cur[p] ??= {}));
        cur[e.path[e.path.length - 1]] = e.source;
        v = base;
      } else v = e.source;
      if (e.col === "selling_defaults" && exclude.size) v = mergeSellingDefaults(e.source, row.selling_defaults, exclude);
      set[e.col] = { v: rewriteId(v, sourceProfileId, targetProfileId), kind: e.kind };
    }
    return set;
  };

  const profileSet = group(diff.entries.filter((e) => (e.area === "profile" || e.area === "locale") && e.kind), target.profile);
  if (Object.keys(profileSet).length) writes.push({ table: "talent_profiles", op: "update", where: { id: targetProfileId }, set: profileSet });

  if (diff.entries.some((e) => e.col === "talent_profile_taxonomy")) {
    writes.push({ table: "talent_profile_taxonomy", op: "delete", where: { talent_profile_id: targetProfileId } });
    for (const t of source.taxonomy) {
      writes.push({
        table: "talent_profile_taxonomy", op: "insert",
        values: {
          talent_profile_id: { v: targetProfileId, kind: "uuid" }, taxonomy_term_id: { v: t.taxonomy_term_id, kind: "uuid" },
          is_primary: { v: !!t.is_primary, kind: "bool" }, relationship_type: { v: t.relationship_type, kind: "text" },
          display_order: { v: t.display_order ?? 0, kind: "int" }, tenant_id: { v: t.tenant_id, kind: "uuid" },
        },
      });
    }
  }

  for (const { source: s, target: t } of diff.offerings.pairs) {
    const set = group(diff.entries.filter((e) => e.offeringId === t.id), t);
    if (Object.keys(set).length) writes.push({ table: "talent_offerings", op: "update", where: { id: t.id, talent_profile_id: targetProfileId }, set });
  }
  for (const s of diff.offerings.sourceOnly) {
    const values = { talent_profile_id: { v: targetProfileId, kind: "uuid" } };
    for (const [c, kind] of OFFERING_INSERT_COLS) values[c] = { v: s[c] ?? null, kind };
    writes.push({ table: "talent_offerings", op: "insert", values });
  }

  const hoursSet = group(diff.entries.filter((e) => e.area === "hours" && e.kind), target.hours ?? {});
  if (target.hours && Object.keys(hoursSet).length) {
    writes.push({ table: "talent_booking_hours", op: "update", where: { talent_profile_id: targetProfileId }, set: hoursSet });
  } else if (!target.hours && source.hours) {
    const values = { talent_profile_id: { v: targetProfileId, kind: "uuid" }, tenant_id: { v: source.hours.tenant_id, kind: "uuid" } };
    for (const f of HOURS_FIELDS) values[f.col] = { v: source.hours[f.col], kind: f.kind };
    writes.push({ table: "talent_booking_hours", op: "insert", values });
  }

  const siteSet = group(diff.entries.filter((e) => e.area.startsWith("site-") && e.kind), target.site ?? {});
  // Source JSON that carries profile-owned media cannot be copied verbatim.
  for (const col of Object.keys(siteSet)) {
    if (collectOwnedMedia(siteSet[col].v).length) {
      throw new Error(`site column ${col} carries profile-owned media; refusing to copy (list it instead)`);
    }
  }
  if (Object.keys(siteSet).length) writes.push({ table: "talent_sites", op: "update", where: { talent_profile_id: targetProfileId }, set: siteSet });

  assertOwnedWrites(writes, { targetProfileId, sourceProfileId });
  return writes;
}

/** Read-only guard for the source side. */
export function assertSelectOnly(sql) {
  if (!/^\s*select\b/i.test(sql) || /;\s*\S/.test(sql.trim())) throw new Error("read-only guard: only a single SELECT is allowed");
  return sql;
}

// ── printing ────────────────────────────────────────────────────────────────

const short = (v, n = 80) => {
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? "null";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export function formatReport(diff) {
  const lines = [];
  const order = ["profile", "locale", "offerings", "hours", "site-design", "site-sections", "media"];
  for (const area of order) {
    const es = diff.entries.filter((e) => e.area === area);
    lines.push(`\n== ${area}: ${es.length} difference(s) ==`);
    for (const e of es) {
      const bothJson = e.kind === "json" && typeof e.source === "object" && typeof e.target === "object" && e.source && e.target;
      if (bothJson) {
        lines.push(`- ${e.field}`);
        for (const d of jsonDiffPaths(maskOwnedMedia(e.source), maskOwnedMedia(e.target))) {
          lines.push(`    ${d.path}: source=${short(d.source, 60)} target=${short(d.target, 60)}`);
        }
      } else lines.push(`- ${e.field}: source=${short(e.source)} target=${short(e.target)}`);
    }
  }
  return lines.join("\n");
}
