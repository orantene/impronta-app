/**
 * TUL-1221: BookPageClient.tsx (the PUBLIC booking page client) sits inside the admin client
 * bundle union. The cause is a static import chain: an admin route -> EditChrome -> edit-context
 * -> builder-node/index -> render.tsx -> live-booking-bands.tsx -> BookPageClient.
 *
 * Measured 2026-10-19: FIVE admin route entries reach it (admin/layout.tsx, so effectively every
 * admin route, plus messages/[inquiryId], people, print/[id] and website/posts/[id]). This is an
 * import-graph RATCHET on that fact: no other /admin route entry (page/layout/template/loading/
 * error/not-found) may reach BookPageClient, and the set may not grow. Each entry removed from
 * KNOWN_ROUTES_REACHING_TARGET is progress; at an empty set the test asserts the full goal.
 * It does NOT prove the goal today: the goal is not met.
 *
 * Not asserted: the measured admin union size (needs a real next build) and whether Next splits
 * the chunk out. The graph follows static imports, `export ... from` and dynamic import()
 * (dynamic chunks count in the union), skips `import type`, and resolves relative and "@/" paths.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";

const SRC = join(process.cwd(), "src");
const ADMIN = join(SRC, "app", "(workspace)", "[tenantSlug]", "admin");
const TARGET = join(SRC, "app", "(public)", "book", "BookPageClient.tsx");
const KNOWN_ROUTES_REACHING_TARGET = new Set([
  "app/(workspace)/[tenantSlug]/admin/layout.tsx",
  "app/(workspace)/[tenantSlug]/admin/messages/[inquiryId]/page.tsx",
  "app/(workspace)/[tenantSlug]/admin/people/page.tsx",
  "app/(workspace)/[tenantSlug]/admin/print/[id]/page.tsx",
  "app/(workspace)/[tenantSlug]/admin/website/posts/[id]/page.tsx",
]);

const SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;'"]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
const ROUTE_ENTRY = /^(page|layout|template|loading|error|not-found)\.tsx?$/;

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const s of SUFFIXES) {
    const p = base + s;
    if (existsSync(p) && statSync(p).isFile() && /\.tsx?$/.test(p)) return p;
  }
  return null;
}

const importCache = new Map<string, string[]>();
function importsOf(file: string): string[] {
  const hit = importCache.get(file);
  if (hit) return hit;
  const out: string[] = [];
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    const r = resolveSpec(file, m[1] ?? m[2] ?? m[3]);
    if (r && !/\.test\.tsx?$/.test(r)) out.push(r);
  }
  importCache.set(file, out);
  return out;
}

export function reaches(entry: string, target: string): boolean {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop() as string;
    if (f === target) return true;
    for (const next of importsOf(f)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

function routeEntries(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) routeEntries(p, out);
    else if (ROUTE_ENTRY.test(e.name)) out.push(p);
  }
  return out;
}

const norm = (p: string) => relative(SRC, p).split("\\").join("/");

test("TUL-1221: the graph walker finds the target and the admin route entries (not scanning nothing)", () => {
  assert.ok(existsSync(TARGET));
  const entries = routeEntries(ADMIN);
  assert.ok(entries.length > 50, `${entries.length} admin route entries`);
  assert.equal(reaches(join(SRC, "lib", "site-admin", "builder-node", "live-booking-bands.tsx"), TARGET), true);
  assert.equal(reaches(join(SRC, "lib", "storefront", "on-request-price-withheld.test.ts"), TARGET), false);
});

test("TUL-1221: only the known admin route reaches BookPageClient.tsx (ratchet to zero)", () => {
  const reaching = routeEntries(ADMIN)
    .filter((e) => reaches(e, TARGET))
    .map(norm)
    .sort();
  const added = reaching.filter((r) => !KNOWN_ROUTES_REACHING_TARGET.has(r));
  assert.deepEqual(
    added,
    [],
    `These /admin route entries pull the PUBLIC booking page client into the admin bundle:\n${added.join("\n")}`,
  );
  assert.ok(reaching.length <= KNOWN_ROUTES_REACHING_TARGET.size);
});
