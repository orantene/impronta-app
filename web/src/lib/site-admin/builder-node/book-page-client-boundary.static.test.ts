/**
 * TUL-1221: BookPageClient must stay out of the admin client union.
 *
 * `builder-node/render.tsx` is reachable from every admin route. Any server
 * module that imports BookPageClient (statically or via `await import()`)
 * drags its client chunks into every admin entry. The only allowed importers
 * are the public /book page and the lazy client island.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("only /book/page.tsx and the lazy island import BookPageClient", () => {
  const importers = walk(SRC)
    .filter((f) => /BookPageClient"/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")))
    .filter((f) => /from\s+["'][^"']*BookPageClient["']|import\(\s*["'][^"']*BookPageClient["']/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(SRC.length + 1))
    .sort();
  assert.deepEqual(importers, [
    "app/(public)/book/page.tsx",
    "lib/site-admin/builder-node/LiveBookingClientIsland.tsx",
  ]);
});

test("the island is a client boundary that loads the booking client lazily", () => {
  const island = readFileSync(join(SRC, "lib/site-admin/builder-node/LiveBookingClientIsland.tsx"), "utf8");
  assert.match(island, /^"use client";/);
  assert.match(island, /dynamic\(\s*\(\)\s*=>\s*import\(/);
  // The only static reference is type-only (erased at build).
  assert.match(island, /import type \{ BookPageClient as BookPageClientType \}/);
});

test("live-booking-bands renders the island, never BookPageClient directly", () => {
  const bands = readFileSync(join(SRC, "lib/site-admin/builder-node/live-booking-bands.tsx"), "utf8");
  assert.doesNotMatch(bands, /BookPageClient"/);
  assert.match(bands, /<LiveBookingClientIsland/);
});
