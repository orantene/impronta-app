/**
 * no-google-font-build-dependency.static.test.ts — keeps `next/font/google`
 * out of the build-time bundle.
 *
 * WHAT THIS GUARDS
 * ────────────────
 * `next/font/google` fetches CSS from fonts.googleapis.com AND the font
 * binary from fonts.gstatic.com during `next build`. When that fetch flakes
 * (observed twice on 2026-08-15/16 — once in CI on a commit that touched no
 * fonts, once locally with a 404 from gstatic while googleapis.com returned
 * 200), Turbopack dies with N copies of:
 *
 *   Module not found: Can't resolve
 *   '@vercel/turbopack-next/internal/font/google/font'
 *
 * There is no code-side fix for the flake itself — it's upstream and
 * intermittent — so the fix is removing the dependency: the seven build-time
 * faces (`Cinzel`, `Fraunces`, `Geist`, `Geist_Mono`, `Inter`,
 * `Playfair_Display`, `Raleway`) are self-hosted via `next/font/local` from
 * `src/app/fonts.ts` (see `src/app/fonts/NOTICE.md` for provenance and
 * licensing). This test asserts that stays true: nobody re-imports
 * `next/font/google` anywhere in `src/`.
 *
 * WHAT THIS DOES NOT GUARD
 * ────────────────────────
 * Runtime, tenant-selectable fonts (`GoogleFontsLink` in
 * `src/app/google-fonts-link.tsx`, driven by `GoogleFontPicker` and the
 * "google" source entries in `fonts-registry.ts`) load a
 * `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` tag at
 * REQUEST time, not build time. That is a deliberate, separate design (a
 * tenant can pick any Google font at runtime without a redeploy) and does
 * not touch `next build` at all, so it is explicitly out of scope here.
 *
 * HOW TO REACT WHEN THIS FAILS
 * ─────────────────────────────
 * Don't re-add `next/font/google`. Download the `.woff2` for the
 * weight/style/subset you need (see `src/app/fonts/NOTICE.md` "Provenance"
 * for the exact method — it uses Next's own URL-generation helpers so the
 * downloaded file matches what `next/font/google` would have fetched), add
 * it under `src/app/fonts/`, and declare it via `next/font/local` in
 * `src/app/fonts.ts`.
 *
 * Run: node_modules/.bin/tsx --test src/lib/quality/no-google-font-build-dependency.static.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const SRC_ROOT = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IMPORT_PATTERN = /(?:from\s+["']|require\(\s*["']|import\(\s*["'])next\/font\/google["']/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      yield* walk(full);
    } else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      yield full;
    }
  }
}

test("no source file imports next/font/google", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC_ROOT)) {
    // Don't flag this guard's own doc comment / pattern definition.
    if (file.endsWith("no-google-font-build-dependency.static.test.ts")) continue;
    const contents = readFileSync(file, "utf8");
    if (IMPORT_PATTERN.test(contents)) {
      offenders.push(relative(SRC_ROOT, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "next/font/google reintroduces a build-time network dependency on " +
      "fonts.googleapis.com / fonts.gstatic.com that has twice reddened " +
      "main this week (see this file's header). Self-host the face with " +
      "next/font/local instead — see src/app/fonts/NOTICE.md.",
  );
});
