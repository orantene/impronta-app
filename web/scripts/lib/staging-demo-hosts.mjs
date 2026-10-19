/**
 * Pure helpers for scripts/seed-staging-demo-hosts.mts (TUL-890, TUL-537 GRK-089).
 * No I/O and no process.exit, so every guard is unit-testable.
 *
 * Why talent rows and not agency_domains rows: on staging a `<label>.staging.tulala.digital`
 * talent host is resolved by `talent_site_subdomain_lookup(label)`, which needs a PUBLISHED
 * `talent_sites` row whose `site_slug` is the label minus `-demo` (or a design alias), owned by a
 * `talent_profiles` row with `is_demo = true`, not hidden, not deleted. `agency_domains` is only
 * for agency/workspace hosts; adding a row there for a talent label would not make it resolve.
 *
 * Every row this seed creates has a deterministic id (`sdhId(key)`), so a re-run lands on the
 * same rows (idempotent) and `--cleanup` removes exactly what it created.
 */
import { createHash } from "node:crypto";

export const STAGING_ROOT = "staging.tulala.digital";
const ID_PREFIX = "staging-demo-hosts";

/** Deterministic UUIDv4-shaped id. */
export function sdhId(key) {
  const h = createHash("sha256").update(`${ID_PREFIX}:${key}`).digest("hex");
  const v = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

/**
 * Staging-only codes (PM GO 2026-10-19 via the consultant): the canonical production codes
 * TAL-93011 / TAL-93020 / TAL-93103 are taken on staging by unrelated QA talents, so Mateo,
 * Alba and Linh use TAL-97001 / TAL-97002 / TAL-97003 here (checked unused on fxlank).
 *
 * The demo hosts the cards list. `seed` rows are written by --apply; `held` rows are only
 * reported (their canonical profile code is taken on staging by an unrelated QA talent, so
 * a code has to be chosen by the PM before they can be seeded).
 * Codes, names and cities come from scripts/demo-talents (demos.ts, alba.ts, demo-theme-map.json)
 * and src/lib/talent-site/demos/gridline-demo-fixtures.ts.
 */
export const DEMO_HOSTS = [
  {
    key: "karla-beltran", labels: ["karla-beltran-demo"], baseSlug: "karla-beltran", code: "TAL-93209",
    display: "Karla Beltrán", tagline: "Reparación de electrodomésticos en Hermosillo", theme: "gridline", card: "TUL-890", status: "seed",
  },
  {
    key: "saul-tapia-ortega", labels: ["saul-tapia-ortega-demo"], baseSlug: "saul-tapia-ortega", code: "TAL-93208",
    display: "Saúl Tapia Ortega", tagline: "Carpintería a la medida en Morelia", theme: "gridline", card: "TUL-890", status: "seed",
  },
  {
    key: "mateo-ferrer", labels: ["mateo-ferrer-demo", "folio-demo"], baseSlug: "mateo-ferrer", code: "TAL-97001",
    display: "Mateo Ferrer", tagline: "Modelo de moda editorial y pasarela en CDMX", theme: "folio", card: "TUL-890", status: "seed",
  },
  {
    key: "alba-nail-artist", labels: ["alba-demo", "maison-v2-demo"], baseSlug: "alba-nail-artist", code: "TAL-97002",
    display: "Alba", tagline: "Uñas en Mérida", theme: "maison-v2", card: "TUL-537 GRK-089", status: "seed",
  },
  {
    key: "linh-tran", labels: ["linh-demo"], baseSlug: "linh-tran", code: "TAL-97003",
    display: "Linh Tran", tagline: "Uñas y manicura", theme: "maison-v2", card: "TUL-537 GRK-089", status: "seed",
  },
];

/** Hosts that already resolve on staging and are listed only for the diff (no write). */
export const CHECK_ONLY_LABELS = ["sofia-nails-demo", "alex-trevino-demo", "gridline-demo", "tomas-retratos-demo", "valeria-baila-demo", "diego-navarro-dj-demo"];

export function hostname(label) {
  return `${label}.${STAGING_ROOT}`;
}

export function parseArgs(argv) {
  const out = { apply: false, cleanup: false, selftest: false, backupFile: null, envFile: null, only: null, help: false, errors: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const val = () => {
      const v = argv[i + 1];
      i += 1;
      if (!v || v.startsWith("--")) out.errors.push(`${a} needs a value`);
      return v ?? null;
    };
    if (a === "--apply") out.apply = true;
    else if (a === "--cleanup") out.cleanup = true;
    else if (a === "--selftest") out.selftest = true;
    else if (a === "--backup-file") out.backupFile = val();
    else if (a === "--env-file") out.envFile = val();
    else if (a === "--only") out.only = String(val() ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--help" || a === "-h") out.help = true;
    else out.errors.push(`unknown argument ${a}`);
  }
  if (out.selftest && (out.apply || out.cleanup)) out.errors.push("--selftest cannot be combined with --apply or --cleanup");
  if (out.apply && !out.backupFile) out.errors.push("--apply needs --backup-file <new path> (the run records what it wrote there)");
  if (out.only) {
    const known = new Set(DEMO_HOSTS.map((h) => h.key));
    for (const k of out.only) if (!known.has(k)) out.errors.push(`--only: unknown host key ${k}`);
  }
  return out;
}

/** The hosts a run writes: `seed` rows only (held rows are never written), narrowed by --only. */
export function selectHosts(only) {
  return DEMO_HOSTS.filter((h) => h.status === "seed" && (!only || only.includes(h.key)));
}

function insert(table, key, row, conflict = ["id"]) {
  return { kind: "insert", table, key, id: row.id, row, conflict };
}

/**
 * Ops for one demo host: profile (is_demo), published site, published home page.
 * `trees` = { shell(displayName), home(displayName, tagline) } from default-max-site-trees.
 */
export function hostOps(host, { trees, now, themeVersion }) {
  const J = (v) => JSON.stringify(v);
  const at = now.toISOString();
  const tid = sdhId(`talent:${host.key}`);
  const shell = trees.shell(host.display);
  const home = trees.home(host.display, host.tagline);
  const theme = themeVersion ? { theme_design_slug: host.theme, theme_design_version: themeVersion } : {};
  return [
    insert("public.talent_profiles", `talent:${host.key}`, {
      id: tid, user_id: null, profile_code: host.code, public_slug_part: host.baseSlug, display_name: host.display,
      first_name: host.display.split(" ")[0], profile_kind: "person", short_bio: host.tagline, preferred_locale: "es",
      default_currency: "MXN", talent_plan_key: "talent_portfolio", workflow_status: "approved", visibility: "public",
      is_publicly_hidden: false, is_test_account: false, is_demo: true, updated_at: at,
    }),
    insert("public.talent_sites", `site:${host.key}`, {
      id: sdhId(`site:${host.key}`), talent_profile_id: tid, site_kind: "talent_personal", status: "published",
      site_slug: host.baseSlug, shell_tree: J(shell), shell_published: J(shell), published_at: at, site_published_at: at,
      version: 1, draft_updated_at: at, accepting_bookings: true, accepting_inquiries: true, ...theme,
    }),
    insert("public.talent_pages", `page:${host.key}:home`, {
      id: sdhId(`page:${host.key}:home`), talent_profile_id: tid, slug: "home", title: host.display, status: "published",
      blocks: J(home), blocks_published: J(home), theme: J({}), is_home: true, sort_order: 0, nav_label: "Home", published_at: at,
    }),
  ];
}

/** Plan guards: ids are sdhId(key), codes/slugs valid, only demo profiles, no duplicate slug/code. */
export function verifyOps(ops) {
  const problems = [];
  const seen = new Set();
  for (const op of ops) {
    if (op.id !== sdhId(op.key)) problems.push(`${op.table} ${op.key}: id is not sdhId(key)`);
    if (seen.has(op.id)) problems.push(`${op.key}: duplicate id`);
    seen.add(op.id);
    if (op.table === "public.talent_profiles") {
      if (!/^TAL-[0-9]+$/.test(op.row.profile_code)) problems.push(`${op.key}: bad profile code`);
      if (op.row.profile_code === "TAL-93938") problems.push(`${op.key}: TAL-93938 is a real talent, never written`);
      if (op.row.is_demo !== true) problems.push(`${op.key}: must be is_demo`);
    }
    if (op.table === "public.talent_sites" && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(op.row.site_slug)) problems.push(`${op.key}: site_slug is not a DNS label`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Turn the read-only observations into one line per host.
 * obs = { resolved: {label: slug|null}, codeOwner: {code: {demo, slug}|null}, slugTaken: {slug: bool}, ownRows: {key: n} }
 */
export function diffLines(obs) {
  const lines = [];
  for (const h of DEMO_HOSTS) {
    for (const label of h.labels) {
      const r = obs.resolved[label] ?? null;
      const owner = obs.codeOwner[h.code] ?? null;
      let action;
      if (r) action = "OK (already resolves)";
      else if (h.status === "held") action = `HELD: ${h.heldReason}`;
      else if (owner && !obs.ownRows[h.key]) action = `BLOCKED: ${h.code} already exists on staging and is not this seed's row`;
      else if (obs.slugTaken[h.baseSlug] && !obs.ownRows[h.key]) action = `BLOCKED: site_slug ${h.baseSlug} already taken`;
      else action = "MISSING -> --apply inserts talent_profiles + talent_sites + talent_pages (3 rows)";
      lines.push({ host: hostname(label), card: h.card, resolvesTo: r, action });
    }
  }
  for (const label of CHECK_ONLY_LABELS) {
    const r = obs.resolved[label] ?? null;
    lines.push({ host: hostname(label), card: "control", resolvesTo: r, action: r ? "OK (control)" : "MISSING (control, not seeded here)" });
  }
  return lines;
}
