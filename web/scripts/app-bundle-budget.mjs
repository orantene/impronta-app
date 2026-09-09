/**
 * ADMIN + POS JAVASCRIPT BUDGET.
 *
 * The plan's finding: "the perf budget covers seven static builder designs
 * only — not admin, not POS". Those two are the surfaces where weight actually
 * hurts. A marketing page is downloaded once on a laptop; the POS register is
 * downloaded by a tablet on venue wifi at the start of every shift, and the
 * admin shell is the thing an operator opens forty times a day. Neither had a
 * ceiling, and the admin shell is already the largest client graph in the repo.
 *
 * WHAT IT MEASURES, AND WHERE THE NUMBER COMES FROM. Next 16 builds with
 * Turbopack, which does NOT emit the `app-build-manifest.json` that the webpack
 * builds of this framework did — the first draft of this script read that file
 * and found nothing, which is precisely the failure mode a perf gate must not
 * have (a missing input read as a clean result). What Turbopack DOES emit, per
 * route, is `page_client-reference-manifest.js`: every client module the route
 * pulls in, each with the chunk list the browser needs for it. This walks those,
 * unions the chunks per budgeted route prefix, and sums their size on disk.
 *
 * UNIQUE CHUNKS, ONCE. The framework and shell chunks appear in nearly every
 * module's list; counting them per module would report a number no browser ever
 * downloads. The union is the honest set.
 *
 * WHY UNCOMPRESSED BYTES ON DISK AND NOT `next build`'s PRINTED TABLE. The
 * printed table is gzipped, rounded, and its format has changed twice in this
 * repo's lifetime — parsing it makes the gate depend on Next's console output.
 * Uncompressed bytes are also the right unit for a ratchet: gzip ratios move
 * when content changes character, so a gzipped ceiling can be met by adding
 * compressible boilerplate.
 *
 * WHY A RATCHET AND NOT A TARGET. These bundles are large today. A ceiling set
 * at "what good looks like" would be red on the commit that introduced it,
 * which means it would be skipped, which means it would gate nothing — the
 * exact history recorded in `fidelity/perf-budget.ts`. So each ceiling is the
 * measured size plus a NAMED headroom, and raising one requires saying what it
 * bought.
 *
 * REQUIRES A BUILD. There is no offline shortcut: the chunk graph is the
 * bundler's output. In CI this runs directly after the `next build` step. Run
 * locally with `npm run build && npm run perf:app-budget`.
 *
 * Usage:
 *   node scripts/app-bundle-budget.mjs             measure + enforce
 *   node scripts/app-bundle-budget.mjs --json      print the JSON report
 *   node scripts/app-bundle-budget.mjs --record    print a baseline to paste
 *   node scripts/app-bundle-budget.mjs --selftest  prove the gate rejects bloat
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, "..");
const NEXT_DIR = join(WEB_ROOT, ".next");
const APP_DIR = join(NEXT_DIR, "server", "app");
const BASELINE_PATH = join(SCRIPT_DIR, "app-bundle-budget.baseline.json");
const MANIFEST_FILE = "page_client-reference-manifest.js";

const KB = 1024;

/**
 * Each budget names a set of app-router routes by prefix.
 *
 * `match` is a prefix on the route path INCLUDING route groups, e.g.
 * `/(workspace)/[tenantSlug]/admin/pos`. Prefixes rather than globs, because a
 * glob invites `**` and a `**` budget silently absorbs whatever route somebody
 * adds under it next.
 */
const BUDGETS = [
  {
    id: "admin",
    label: "Admin workspace (all routes)",
    match: "/(workspace)/[tenantSlug]/admin",
  },
  {
    id: "pos",
    label: "POS register",
    match: "/(workspace)/[tenantSlug]/admin/pos",
  },
];

// ── Reading the build ────────────────────────────────────────────────────────

/** Every route under `.next/server/app` that emitted a client manifest. */
export function discoverRouteManifests(appDir, readDir) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readDir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === MANIFEST_FILE) {
        const route = `/${relative(appDir, dir).split(sep).join("/")}`;
        out.push({ route, file: full });
      }
    }
  };
  walk(appDir);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Pull the chunk list out of one route manifest.
 *
 * The file is a script that assigns to `globalThis.__RSC_MANIFEST`, so it is
 * evaluated in a throwaway VM context rather than regex-scraped: the chunk
 * names contain `~`, `.` and `-`, the structure is nested, and a regex over
 * half a megabyte of generated JSON is a guess. The context has no `require`,
 * no `process` and no timers — the file's only statement is an assignment.
 */
export function chunksFromManifestSource(source) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(source, sandbox, { timeout: 10_000 });
  const chunks = new Set();
  for (const entry of Object.values(sandbox.__RSC_MANIFEST ?? {})) {
    for (const mod of Object.values(entry?.clientModules ?? {})) {
      for (const chunk of mod?.chunks ?? []) chunks.add(chunk);
    }
  }
  return chunks;
}

// ── Measuring ────────────────────────────────────────────────────────────────

/**
 * Pure given its inputs: `routes` is `[{ route, chunks:Set }]` and `sizer` maps
 * a chunk reference to bytes (or null when it is not on disk). Injected so the
 * self-test can drive the whole pipeline with no build.
 */
export function measure(routes, budgets, sizer) {
  return budgets.map((budget) => {
    const matched = routes.filter((entry) => entry.route.startsWith(budget.match));
    const chunks = new Set();
    for (const entry of matched) for (const chunk of entry.chunks) chunks.add(chunk);
    let bytes = 0;
    const missing = [];
    for (const chunk of chunks) {
      const size = sizer(chunk);
      if (size === null) missing.push(chunk);
      else bytes += size;
    }
    return {
      id: budget.id,
      label: budget.label,
      routeCount: matched.length,
      chunkCount: chunks.size,
      bytes,
      missing,
    };
  });
}

export function evaluate(reports, baseline) {
  const violations = [];
  for (const report of reports) {
    const recorded = baseline?.budgets?.[report.id];
    if (!recorded) {
      violations.push({
        id: report.id,
        kind: "unrecorded",
        message:
          `No ceiling recorded for "${report.id}" (measured ${fmt(report.bytes)}). ` +
          `Record it in scripts/app-bundle-budget.baseline.json.`,
      });
      continue;
    }
    // A budget whose routes all vanished is a budget measuring nothing — that
    // is how a gate turns into a permanent green with nobody touching it.
    if (report.routeCount === 0) {
      violations.push({
        id: report.id,
        kind: "no-routes",
        message:
          `"${report.id}" matched ZERO routes. Either the route moved or the ` +
          `prefix is stale — this budget currently gates nothing.`,
      });
      continue;
    }
    if (report.missing.length > 0) {
      violations.push({
        id: report.id,
        kind: "missing-chunks",
        message:
          `${report.missing.length} chunk(s) named by the manifest are not on disk, ` +
          `so ${fmt(report.bytes)} is an UNDER-count: ${report.missing.slice(0, 3).join(", ")}`,
      });
      continue;
    }
    if (report.bytes > recorded.maxBytes) {
      violations.push({
        id: report.id,
        kind: "over",
        actual: report.bytes,
        max: recorded.maxBytes,
        message:
          `${report.label} is ${fmt(report.bytes)}, over the ${fmt(recorded.maxBytes)} ` +
          `ceiling by ${fmt(report.bytes - recorded.maxBytes)}.`,
      });
    }
  }
  return violations;
}

function fmt(bytes) {
  if (bytes >= KB * KB) return `${(bytes / (KB * KB)).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function diskSizer(chunk) {
  // Manifest chunk refs are browser paths ("/_next/static/chunks/x.js"); the
  // file lives at `.next/static/chunks/x.js`.
  const rel = chunk.replace(/^\/_next\//, "").replace(/^\//, "");
  try {
    return statSync(join(NEXT_DIR, rel)).size;
  } catch {
    return null;
  }
}

function readRoutes() {
  const manifests = discoverRouteManifests(APP_DIR, (dir) =>
    readdirSync(dir, { withFileTypes: true }),
  );
  return manifests.map(({ route, file }) => ({
    route,
    chunks: chunksFromManifestSource(readFileSync(file, "utf8")),
  }));
}

function runEnforce(mode) {
  let routes;
  try {
    routes = readRoutes();
  } catch (error) {
    console.error(`[perf:app-budget] Could not read the build under ${APP_DIR}: ${error}`);
    process.exitCode = 1;
    return;
  }
  if (routes.length === 0) {
    console.error(
      `[perf:app-budget] No route client manifests under ${APP_DIR}.\n` +
        `This lane measures the real bundler output, so it needs a build:\n` +
        `  npm run build && npm run perf:app-budget`,
    );
    process.exitCode = 1;
    return;
  }

  const reports = measure(routes, BUDGETS, diskSizer);

  if (mode === "record") {
    console.log(
      JSON.stringify(
        {
          budgets: Object.fromEntries(
            reports.map((report) => [
              report.id,
              { maxBytes: report.bytes, measuredBytes: report.bytes, why: "TODO" },
            ]),
          ),
        },
        null,
        2,
      ),
    );
    return;
  }

  let baseline = null;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    /* reported as `unrecorded` below */
  }
  const violations = evaluate(reports, baseline);

  if (mode === "json") {
    console.log(
      JSON.stringify({ reports, violations, passed: violations.length === 0 }, null, 2),
    );
  } else {
    console.log(`[perf:app-budget] ${routes.length} route(s) in the build.`);
    for (const report of reports) {
      const recorded = baseline?.budgets?.[report.id];
      const ok = !violations.some((violation) => violation.id === report.id);
      console.log(
        `${ok ? "✓" : "✗"} ${report.label.padEnd(30)} ${fmt(report.bytes).padStart(10)}` +
          `  (≤ ${recorded ? fmt(recorded.maxBytes) : "unrecorded"}; ` +
          `${report.routeCount} route(s), ${report.chunkCount} chunk(s))`,
      );
    }
    if (violations.length === 0) {
      console.log(`\n✓ App bundle budget OK.`);
    } else {
      console.error(`\n✗ App bundle budget FAILED — ${violations.length} finding(s):`);
      for (const violation of violations) console.error(`   · ${violation.message}`);
      console.error(
        `\nIf the growth is deliberate, raise the ceiling in ` +
          `scripts/app-bundle-budget.baseline.json IN THE SAME COMMIT that spends it, ` +
          `and say in the "why" field what it bought.`,
      );
    }
  }
  process.exitCode = violations.length === 0 ? 0 : 1;
}

/**
 * Prove the gate can fail, with no build on disk. Five checks:
 *   1. unique chunks are unioned across routes, not summed per route,
 *   2. a narrower prefix does not pick up its siblings,
 *   3. an over-ceiling measurement produces a violation,
 *   4. an at-ceiling measurement does not,
 *   5. a prefix matching no route is reported rather than passing,
 * plus the manifest parser against a synthetic manifest, because a parser that
 * silently returns an empty set turns every budget into 0 bytes and green.
 */
function runSelfTest() {
  const failures = [];

  const routes = [
    {
      route: "/(workspace)/[tenantSlug]/admin",
      chunks: new Set(["/_next/shared.js", "/_next/admin.js"]),
    },
    {
      route: "/(workspace)/[tenantSlug]/admin/pos",
      chunks: new Set(["/_next/shared.js", "/_next/pos.js"]),
    },
    { route: "/(marketing)", chunks: new Set(["/_next/shared.js", "/_next/marketing.js"]) },
  ];
  const sizes = {
    "/_next/shared.js": 100,
    "/_next/admin.js": 10,
    "/_next/pos.js": 1,
    "/_next/marketing.js": 1000,
  };
  const sizer = (chunk) => sizes[chunk] ?? null;
  const budgets = [
    { id: "admin", label: "admin", match: "/(workspace)/[tenantSlug]/admin" },
    { id: "pos", label: "pos", match: "/(workspace)/[tenantSlug]/admin/pos" },
    { id: "ghost", label: "ghost", match: "/nowhere" },
  ];
  const reports = measure(routes, budgets, sizer);

  const admin = reports.find((report) => report.id === "admin");
  if (admin.bytes !== 111) failures.push(`unioned chunk sum was ${admin.bytes}, expected 111`);
  if (admin.routeCount !== 2) failures.push(`admin matched ${admin.routeCount} routes, expected 2`);
  if (admin.chunkCount !== 3) failures.push(`admin saw ${admin.chunkCount} chunks, expected 3`);
  console.log(`[1/6] chunks unioned once → admin = ${admin.bytes} B over ${admin.chunkCount} chunk(s)`);

  const pos = reports.find((report) => report.id === "pos");
  if (pos.bytes !== 101) failures.push(`pos measured ${pos.bytes}, expected 101 (no admin.js leak)`);
  console.log(`[2/6] narrower prefix stays narrow → pos = ${pos.bytes} B`);

  const over = evaluate(reports, {
    budgets: { admin: { maxBytes: 100 }, pos: { maxBytes: 1000 }, ghost: { maxBytes: 1 } },
  });
  if (!over.some((violation) => violation.id === "admin" && violation.kind === "over")) {
    failures.push("an over-ceiling admin bundle did not fail");
  }
  console.log(`[3/6] over-ceiling → ${over.filter((v) => v.kind === "over").length} 'over' finding(s)`);

  const atLimit = evaluate(
    reports.filter((report) => report.id === "admin"),
    { budgets: { admin: { maxBytes: 111 } } },
  );
  if (atLimit.length !== 0) failures.push(`at-the-ceiling produced ${atLimit.length} false positive(s)`);
  console.log(`[4/6] at-the-ceiling → ${atLimit.length} false positive(s)`);

  if (!over.some((violation) => violation.id === "ghost" && violation.kind === "no-routes")) {
    failures.push("a budget matching zero routes passed silently");
  }
  console.log(`[5/6] stale prefix → reported`);

  const parsed = chunksFromManifestSource(
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};` +
      `globalThis.__RSC_MANIFEST["/x/page"] = {"clientModules":{` +
      `"a":{"chunks":["/_next/static/chunks/one.js","/_next/static/chunks/two.js"]},` +
      `"b":{"chunks":["/_next/static/chunks/one.js"]}}};`,
  );
  if (parsed.size !== 2) failures.push(`manifest parser returned ${parsed.size} chunk(s), expected 2`);
  console.log(`[6/6] manifest parser → ${parsed.size} unique chunk(s)`);

  if (failures.length > 0) {
    console.error(`\n✗ Self-test FAILED — this gate would not catch bundle growth:`);
    for (const failure of failures) console.error(`   · ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✓ Self-test passed.`);
  process.exitCode = 0;
}

const args = new Set(process.argv.slice(2));
if (args.has("--selftest")) runSelfTest();
else if (args.has("--record")) runEnforce("record");
else runEnforce(args.has("--json") ? "json" : "enforce");
