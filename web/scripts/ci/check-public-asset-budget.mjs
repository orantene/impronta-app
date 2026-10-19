#!/usr/bin/env node
/**
 * check-public-asset-budget.mjs - `node scripts/ci/check-public-asset-budget.mjs`.
 *
 * F5 (TUL-1273 #8): a speed budget for the images committed under web/public.
 * A raster image over MAX_BYTES (300 KB: the WhatsApp preview ceiling and a
 * sane mobile hero ceiling) fails the build, unless it is already in the
 * baseline AND has not grown. So the existing heavy files are frozen (a ratchet,
 * not a target that would be red on day one) and no NEW heavy image gets in.
 * Reads files only; no build needed.
 *
 *   node scripts/ci/check-public-asset-budget.mjs            enforce
 *   node scripts/ci/check-public-asset-budget.mjs --record   print a fresh baseline
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_BYTES = 300 * 1024;
export const RASTER = /\.(png|jpe?g|webp|avif|gif)$/i;
/** Directories (under web/public) whose images ship on public pages. */
export const BUDGETED_DIRS = ["marketing", "brand", "talent-templates", "builder-previews", "apps"];

/**
 * @param {Array<{ path: string, bytes: number }>} files  path is relative to web/public, "/" separated
 * @param {Record<string, number>} baseline  path -> bytes already tolerated
 * @returns {{ path: string, bytes: number, reason: "new-heavy" | "grew" }[]}
 */
export function findBudgetViolations(files, baseline, maxBytes = MAX_BYTES) {
  const out = [];
  for (const f of files) {
    if (!RASTER.test(f.path) || f.bytes <= maxBytes) continue;
    const allowed = baseline[f.path];
    if (allowed === undefined) out.push({ ...f, reason: "new-heavy" });
    else if (f.bytes > allowed) out.push({ ...f, reason: "grew" });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function walk(dir, root, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, root, acc);
    else if (RASTER.test(e.name)) {
      // A file deleted between the listing and the stat is simply gone: skip it.
      try {
        acc.push({ path: relative(root, full).split(sep).join("/"), bytes: statSync(full).size });
      } catch {
        /* removed while scanning */
      }
    }
  }
}

export function scanPublic(webRoot) {
  const root = join(webRoot, "public");
  const acc = [];
  for (const d of BUDGETED_DIRS) walk(join(root, d), root, acc);
  return acc;
}

const SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const webRoot = resolve(dirname(SELF), "..", "..");
  const files = scanPublic(webRoot);
  if (process.argv.includes("--record")) {
    const heavy = Object.fromEntries(files.filter((f) => f.bytes > MAX_BYTES).sort((a, b) => a.path.localeCompare(b.path)).map((f) => [f.path, f.bytes]));
    console.log(JSON.stringify(heavy, null, 2));
  } else {
    const baseline = JSON.parse(readFileSync(join(dirname(SELF), "public-asset-budget.baseline.json"), "utf8"));
    const bad = findBudgetViolations(files, baseline);
    if (files.length === 0) {
      console.error("[public-asset-budget] FAIL: scanned 0 images; the gate stopped measuring.");
      process.exit(1);
    }
    if (bad.length > 0) {
      console.error(`[public-asset-budget] FAIL: ${bad.length} image(s) over ${MAX_BYTES / 1024} KB:`);
      for (const b of bad) console.error(`  - ${b.path} ${Math.round(b.bytes / 1024)} KB (${b.reason})`);
      console.error("Compress it (target under 300 KB) or serve it through next/image instead of committing the original.");
      process.exit(1);
    }
    console.log(`[public-asset-budget] OK: ${files.length} images scanned, none new over ${MAX_BYTES / 1024} KB.`);
  }
}
