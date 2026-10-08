#!/usr/bin/env node
/**
 * prune-phantom-loadable-chunks.mjs - runs in `postbuild`, before check-build-chunks.
 *
 * Turbopack writes each `next/dynamic` import's chunk list into
 * `.next/server/app/<route>/react-loadable-manifest.json`, and some of those
 * names are never emitted (the chunk was merged away after the list was
 * recorded). Next turns every name in that list into a
 * `<link rel="preload" as="script">`, so the signed-in dashboard preloaded two
 * chunks per route that 404 (P0). This drops only the entries whose file is not
 * on disk, so the preload is never emitted; a name that exists is untouched.
 * Never fails a build: any error is logged and the exit code stays 0.
 *
 * TEMPORARY WORKAROUND for a Next.js 16.2.3 + Turbopack bug (pinned in
 * package.json). REMOVE this step (and its postbuild hook) once an upgraded Next
 * stops listing unemitted chunks: a build log line
 * `check-build-chunks NOTE: ... react-loadable-manifest.json are absent` with
 * this script disabled is the signal that the bug is gone.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** @returns {{ pruned: string[], manifest: Record<string, { id?: unknown, files?: string[] }> }} */
export function pruneLoadableManifest(manifest, onDisk) {
  const pruned = [];
  const next = {};
  for (const [key, entry] of Object.entries(manifest)) {
    const files = Array.isArray(entry?.files) ? entry.files : [];
    const kept = files.filter((f) => {
      const m = /^static\/chunks\/(.+)$/.exec(f);
      if (!m || onDisk.has(m[1])) return true;
      pruned.push(f);
      return false;
    });
    next[key] = { ...entry, files: kept };
  }
  return { pruned, manifest: next };
}

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, visit);
    else visit(full);
  }
}

function main() {
  const nextDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join(process.cwd(), ".next");
  const chunksDir = join(nextDir, "static", "chunks");
  const appDir = join(nextDir, "server", "app");
  if (!existsSync(chunksDir) || !existsSync(appDir)) {
    console.log(`prune-phantom-loadable-chunks: ${nextDir} is not a built .next, nothing to do`);
    return;
  }
  const onDisk = new Set();
  walk(chunksDir, (f) => onDisk.add(relative(chunksDir, f).split("\\").join("/")));
  const all = new Set();
  let manifests = 0;
  walk(appDir, (file) => {
    if (!file.endsWith("react-loadable-manifest.json")) return;
    manifests += 1;
    const { pruned, manifest } = pruneLoadableManifest(JSON.parse(readFileSync(file, "utf8")), onDisk);
    if (pruned.length === 0) return;
    for (const p of pruned) all.add(p);
    writeFileSync(file, JSON.stringify(manifest));
  });
  console.log(`prune-phantom-loadable-chunks: ${manifests} loadable manifests, ${all.size} phantom chunk name(s) removed`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    console.error(`prune-phantom-loadable-chunks: skipped (${err instanceof Error ? err.message : String(err)})`);
  }
}
