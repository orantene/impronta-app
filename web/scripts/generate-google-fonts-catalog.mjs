#!/usr/bin/env node
/**
 * generate-google-fonts-catalog.mjs — regenerates the checked-in Google Fonts
 * catalogue at `src/lib/site-admin/builder-node/google-fonts-catalog.json`.
 *
 * WHY BUILD-TIME GENERATED, NOT A RUNTIME API CALL
 * ────────────────────────────────────────────────
 * The builder must never depend on fonts.google.com being reachable at render
 * time (see `no-google-font-build-dependency.static.test.ts` for the history
 * of that flake reddening main), and the Developer API needs a key. So the
 * catalogue is a data file: this script fetches Google's public metadata feed
 * ONCE, at developer time, and commits the result. `next build` and every
 * request read only the local JSON. Refreshing the catalogue is a re-run of
 * this script plus a normal PR diff review.
 *
 * Run:  node scripts/generate-google-fonts-catalog.mjs [path/to/metadata.json]
 *       (with no argument it fetches https://fonts.google.com/metadata/fonts)
 *
 * ENTRY FORMAT (compact, one string per family, sorted by popularity)
 * ───────────────────────────────────────────────────────────────────
 *   "Family|c|w1 w2 …|iw1 iw2 …|vfMin..vfMax"
 *     c        s=sans  r=serif  d=display  h=script(handwriting)  m=mono
 *     w…       upright static instance weights (numbers)
 *     iw…      italic static instance weights (numbers; empty = no italics)
 *     vf       the `wght` variable-axis range, empty when the family is static
 *
 * Families without a `latin` subset are dropped — the product ships EN/ES
 * storefronts and a family that cannot render either is picker noise.
 */

import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(
  __dirname,
  "..",
  "src/lib/site-admin/builder-node/google-fonts-catalog.json",
);
const SOURCE_URL = "https://fonts.google.com/metadata/fonts";

const CATEGORY_CODE = {
  "Sans Serif": "s",
  Serif: "r",
  Display: "d",
  Handwriting: "h",
  Monospace: "m",
};

async function loadMetadata() {
  const arg = process.argv[2];
  let raw;
  if (arg) {
    raw = await readFile(arg, "utf8");
  } else {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
    raw = await res.text();
  }
  // The feed historically starts with an XSSI guard line `)]}'`.
  if (raw.startsWith(")]}'")) raw = raw.slice(raw.indexOf("\n") + 1);
  return JSON.parse(raw);
}

const metadata = await loadMetadata();
const families = metadata.familyMetadataList;
if (!Array.isArray(families) || families.length < 500) {
  throw new Error(
    `familyMetadataList looks wrong (${families?.length ?? "missing"} entries) — refusing to overwrite the catalogue`,
  );
}

const entries = [];
for (const f of families) {
  const cat = CATEGORY_CODE[f.category];
  if (!cat) continue;
  if (!Array.isArray(f.subsets) || !f.subsets.includes("latin")) continue;
  if (typeof f.family !== "string" || f.family.includes("|")) continue;

  const upright = [];
  const italic = [];
  for (const key of Object.keys(f.fonts ?? {})) {
    const isItalic = key.endsWith("i");
    const weight = Number.parseInt(isItalic ? key.slice(0, -1) : key, 10);
    if (!Number.isFinite(weight)) continue;
    (isItalic ? italic : upright).push(weight);
  }
  upright.sort((a, b) => a - b);
  italic.sort((a, b) => a - b);
  if (upright.length === 0 && italic.length === 0) continue;

  const wght = (f.axes ?? []).find((a) => a.tag === "wght");
  const vf = wght ? `${Math.round(wght.min)}..${Math.round(wght.max)}` : "";

  entries.push({
    popularity: typeof f.popularity === "number" ? f.popularity : 1e9,
    line: [f.family, cat, upright.join(" "), italic.join(" "), vf].join("|"),
  });
}

entries.sort((a, b) => a.popularity - b.popularity);

const payload = {
  source: SOURCE_URL,
  generatedAt: new Date().toISOString().slice(0, 10),
  format: "family|category(s r d h m)|weights|italicWeights|wghtAxisRange",
  families: entries.map((e) => e.line),
};

writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);
console.log(`wrote ${entries.length} families to ${OUT}`);
