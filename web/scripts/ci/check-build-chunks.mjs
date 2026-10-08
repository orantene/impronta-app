#!/usr/bin/env node
/**
 * check-build-chunks.mjs - `npm run check:build-chunks`.
 *
 * Fails when a client-reference manifest in a built `.next` names a client chunk
 * that is not on disk under `.next/static/chunks`. A route whose HTML preloads a
 * chunk the deployment does not serve 404s that chunk in the browser (P0: two
 * phantom chunks per talent route). Runs right after `next build`; reads files
 * only, never builds.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LISTED = 25;
// "/_next/static/chunks/x.js" and the bare manifest form "static/chunks/x.js".
const CHUNK_RE = /(?:\/_next\/)?static\/chunks\/([^"'\s\\,)\]]+\.(?:js|css))/g;

/** Chunk paths (relative to static/chunks) a manifest text refers to. ssr/ is server-only. */
export function extractClientChunkRefs(text) {
  const out = new Set();
  for (const m of text.matchAll(CHUNK_RE)) {
    const ref = m[1];
    if (ref.startsWith("ssr/")) continue;
    out.add(ref);
  }
  return out;
}

/**
 * @param {{ manifests: Record<string, string>, staticChunks: Set<string> }} input
 *   staticChunks holds paths relative to static/chunks (e.g. "app/page-abc.js").
 * @returns {string[]} missing chunk paths, de-duplicated and sorted.
 */
export function findMissingClientChunks({ manifests, staticChunks }) {
  const missing = new Set();
  for (const text of Object.values(manifests)) {
    for (const ref of extractClientChunkRefs(text)) {
      if (!staticChunks.has(ref)) missing.add(ref);
    }
  }
  return [...missing].sort();
}

/**
 * Other manifest kinds that can name client chunks (build-manifest, app-build-manifest,
 * react-loadable-manifest, prerendered HTML preload links). Reported per kind and
 * NEVER fatal: the P0 phantom chunks survive the client-reference check above, so
 * this tells the next production build log which kind carries them.
 * @param {Record<string, string>} files path -> text
 * @param {Set<string>} staticChunks
 * @returns {Record<string, string[]>} kind -> missing chunk paths
 */
export function findMissingByKind({ files, staticChunks }) {
  const kindOf = (file) =>
    file.endsWith(".html") ? "prerendered-html" : (file.split("/").pop() ?? file).replace(/[-0-9a-f]{6,}/g, "");
  const byKind = {};
  for (const [file, text] of Object.entries(files)) {
    const missing = [...extractClientChunkRefs(text)].filter((ref) => !staticChunks.has(ref));
    if (missing.length === 0) continue;
    const kind = kindOf(file);
    byKind[kind] = [...new Set([...(byKind[kind] ?? []), ...missing])].sort();
  }
  return byKind;
}

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, visit);
    else visit(full);
  }
}

function reportOtherManifestKinds(nextDir, staticChunks) {
  const files = {};
  const take = (file) => {
    const base = file.split("/").pop() ?? "";
    const isManifest = /manifest/.test(base) && (base.endsWith(".json") || base.endsWith(".js"));
    if (isManifest && !base.endsWith("client-reference-manifest.js")) files[file] = readFileSync(file, "utf8");
    else if (file.endsWith(".html")) files[file] = readFileSync(file, "utf8");
  };
  for (const root of ["build-manifest.json", "app-build-manifest.json"]) {
    const f = join(nextDir, root);
    if (existsSync(f)) take(f);
  }
  walk(join(nextDir, "server"), take);
  const byKind = findMissingByKind({ files, staticChunks });
  const kinds = Object.keys(byKind);
  if (kinds.length === 0) {
    console.log(`check-build-chunks: other manifest kinds ok (${Object.keys(files).length} files)`);
    return;
  }
  for (const kind of kinds) {
    console.log(`check-build-chunks NOTE: ${byKind[kind].length} chunk(s) named by ${kind} are absent from static/chunks: ${byKind[kind].slice(0, 5).join(", ")}`);
  }
}

// `--warn` is for Vercel's own build (the `postbuild` hook): it reports the same
// findings but ALWAYS exits 0, so it can never fail a deploy. CI runs it strict.
const WARN = process.argv.includes("--warn");
const fail = () => process.exit(WARN ? 0 : 1);
const tag = WARN ? "check-build-chunks WARN" : "check-build-chunks";

function main() {
  const nextDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join(process.cwd(), ".next");
  const appDir = join(nextDir, "server", "app");
  const chunksDir = join(nextDir, "static", "chunks");
  if (!existsSync(appDir) || !existsSync(chunksDir)) {
    console.error(`${tag}: ${nextDir} is not a built .next (missing server/app or static/chunks)`);
    fail();
    return;
  }
  const manifests = {};
  walk(appDir, (file) => {
    if (file.endsWith("client-reference-manifest.js")) manifests[file] = readFileSync(file, "utf8");
  });
  const staticChunks = new Set();
  walk(chunksDir, (file) => staticChunks.add(relative(chunksDir, file).split("\\").join("/")));

  const manifestCount = Object.keys(manifests).length;
  if (manifestCount === 0) {
    console.error(`${tag}: found 0 client-reference manifests; the check would measure nothing`);
    fail();
    return;
  }
  const missing = findMissingClientChunks({ manifests, staticChunks });
  if (missing.length > 0) {
    console.error(
      `${tag}: ${missing.length} client chunk(s) are referenced by a manifest but absent from .next/static/chunks:`,
    );
    for (const m of missing.slice(0, MAX_LISTED)) console.error(`  ${m}`);
    if (missing.length > MAX_LISTED) console.error(`  ... and ${missing.length - MAX_LISTED} more`);
    fail();
    return;
  }
  console.log(`check-build-chunks: ok (${manifestCount} manifests, ${staticChunks.size} chunks on disk)`);
  reportOtherManifestKinds(nextDir, staticChunks);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    // Warn mode must never break the Vercel build, whatever goes wrong while scanning.
    console.error(`${tag}: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    fail();
  }
}
