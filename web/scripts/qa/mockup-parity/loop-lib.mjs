/** Pure helpers for the parity fast loop (loop.mjs) and run.mjs: arg parsing, product URLs, auth cache. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const LOOP_WIDTHS = ["390", "360", "1440"];
export const LOOP_SOURCES = ["draft", "code", "live"];
export const DEFAULT_AUTH_CACHE = "qa-evidence/.parity-auth.json";

/** Returns { ok: true, opts } or { ok: false, error }. `--help` yields { help: true }. */
export function parseLoopArgs(argv) {
  const o = { design: "folio", demo: "mateo", section: null, width: "390", source: "code", baseUrl: "http://localhost:3005", pass: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--design") o.design = v();
    else if (a === "--demo") o.demo = v();
    else if (a === "--section") o.section = v();
    else if (a === "--width") o.width = v();
    else if (a === "--source") o.source = v();
    else if (a === "--base-url") o.baseUrl = v();
    else if (["--mockup-url", "--locale", "--storage-state"].includes(a)) o.pass.push(a, v());
    else if (a === "--help" || a === "-h") return { ok: true, help: true, opts: o };
    else return { ok: false, error: `unknown flag ${a}` };
  }
  if (!o.section) return { ok: false, error: "--section is required (a section key from the design's parity-map.json)" };
  if (!LOOP_WIDTHS.includes(String(o.width))) return { ok: false, error: `--width must be one of ${LOOP_WIDTHS.join(", ")}` };
  if (!LOOP_SOURCES.includes(o.source)) return { ok: false, error: `--source must be one of ${LOOP_SOURCES.join(", ")}` };
  if (!o.design || !o.demo) return { ok: false, error: "--design and --demo need a value" };
  return { ok: true, opts: o };
}

/** The argv for run.mjs: one section, one width, static state, compact table, cached auth. */
export function buildRunArgs(runPath, o, authCache = DEFAULT_AUTH_CACHE) {
  return [runPath, "--design", o.design, "--talents", o.demo, "--widths", String(o.width), "--sections", o.section, "--states", "static", "--source", o.source, "--base-url", o.baseUrl, "--compact", "--no-report", "--auth-cache", authCache, ...o.pass];
}

/**
 * The product URL per source.
 *   live  -> /template-preview/live?kind=live-site&talent=<id>
 *   code  -> in-code payload (dev or platform admin)
 *   draft -> the OPEN talent_theme_drafts payload (platform admin)
 * `t` is { id, demoKey }.
 */
export function productUrl({ baseUrl, design, locale = "es", source }, t) {
  if (source === "live") return `${baseUrl}/template-preview/live?kind=live-site&talent=${t.id}&locale=${locale}`;
  return `${baseUrl}/template-preview/${design}?kind=talent-theme&demo=${design}:${t.demoKey}&source=${source}&locale=${locale}`;
}

function readCache(file) {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}; } catch { return {}; }
}
const keyOf = (baseUrl, name) => `${baseUrl}|${name}`;
export function readAuthCache(file, baseUrl, name) {
  return readCache(file)[keyOf(baseUrl, name)] || null;
}
export function writeAuthCache(file, baseUrl, name, state) {
  try {
    const all = readCache(file);
    all[keyOf(baseUrl, name)] = state;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(all), { mode: 0o600 });
  } catch { /* cache is best effort */ }
}
export function dropAuthCache(file, baseUrl, name) {
  try {
    const all = readCache(file);
    delete all[keyOf(baseUrl, name)];
    writeFileSync(file, JSON.stringify(all), { mode: 0o600 });
  } catch { /* best effort */ }
}
