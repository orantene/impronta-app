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

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, visit);
    else visit(full);
  }
}

function main() {
  const nextDir = process.argv[2] ?? join(process.cwd(), ".next");
  const appDir = join(nextDir, "server", "app");
  const chunksDir = join(nextDir, "static", "chunks");
  if (!existsSync(appDir) || !existsSync(chunksDir)) {
    console.error(`check-build-chunks: ${nextDir} is not a built .next (missing server/app or static/chunks)`);
    process.exit(1);
  }
  const manifests = {};
  walk(appDir, (file) => {
    if (file.endsWith("client-reference-manifest.js")) manifests[file] = readFileSync(file, "utf8");
  });
  const staticChunks = new Set();
  walk(chunksDir, (file) => staticChunks.add(relative(chunksDir, file).split("\\").join("/")));

  const manifestCount = Object.keys(manifests).length;
  if (manifestCount === 0) {
    console.error("check-build-chunks: found 0 client-reference manifests; the check would measure nothing");
    process.exit(1);
  }
  const missing = findMissingClientChunks({ manifests, staticChunks });
  if (missing.length > 0) {
    console.error(
      `check-build-chunks: ${missing.length} client chunk(s) are referenced by a manifest but absent from .next/static/chunks:`,
    );
    for (const m of missing.slice(0, MAX_LISTED)) console.error(`  ${m}`);
    if (missing.length > MAX_LISTED) console.error(`  ... and ${missing.length - MAX_LISTED} more`);
    process.exit(1);
  }
  console.log(`check-build-chunks: ok (${manifestCount} manifests, ${staticChunks.size} chunks on disk)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
