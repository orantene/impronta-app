/**
 * TUL-1759: the `isomorphic-dompurify -> jsdom 26.1.0` override is load-bearing.
 *
 * jsdom 27+ depends on the ESM-only `@exodus/bytes`. Vercel runs Node 22 with
 * `--no-experimental-require-module`, so a CJS `require()` of that tree throws
 * ERR_REQUIRE_ESM and every server-rendered page 500s (the #4367 P0 hotfix).
 * Nothing but this file notices if a later `npm update`, a dompurify bump, or someone
 * deleting the override brings the ESM tree back, so it is pinned here, in the lock.
 *
 * Contract: (1) package.json still overrides isomorphic-dompurify's jsdom to a 26.x
 * version and carries the explanatory note; (2) package-lock.json installs jsdom 26.x
 * nested under isomorphic-dompurify; (3) no package in isomorphic-dompurify's runtime
 * dependency closure is `@exodus/bytes`. The closure walk has a synthetic self-test so
 * it cannot pass vacuously. The built-server half (curl / with require(esm) off) is the CI boot smoke,
 * web/scripts/ci/runtime-boot-smoke.mjs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { WEB_ROOT } from "./supabase-unchecked-read";

type LockPackage = {
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
type Lock = { packages: Record<string, LockPackage> };

const NESTED = "node_modules/isomorphic-dompurify/node_modules/jsdom";
const ROOT = "node_modules/isomorphic-dompurify";
const FORBIDDEN = "@exodus/bytes";

/** Node resolution inside a lockfile `packages` map: nearest node_modules up the path. */
export function resolveInLock(lock: Lock, fromPath: string, name: string): string | null {
  let base = fromPath;
  for (;;) {
    const candidate = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (lock.packages[candidate]) return candidate;
    if (!base) return null;
    const idx = base.lastIndexOf("/node_modules/");
    base = idx === -1 ? "" : base.slice(0, idx);
  }
}

/** Every lock path reachable from `rootPath` through dependencies + optionalDependencies. */
export function runtimeClosure(lock: Lock, rootPath: string): Set<string> {
  const seen = new Set<string>();
  const queue = [rootPath];
  while (queue.length > 0) {
    const cur = queue.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const pkg = lock.packages[cur];
    if (!pkg) continue;
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      const resolved = resolveInLock(lock, cur, dep);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

/** Problems with the lock (empty when it is safe). */
export function lockProblems(lock: Lock): string[] {
  const problems: string[] = [];
  const nested = lock.packages[NESTED];
  if (!nested) {
    problems.push(`${NESTED} is missing: isomorphic-dompurify is resolving the top-level jsdom (ESM tree)`);
  } else if (!/^26\./.test(nested.version ?? "")) {
    problems.push(`${NESTED} is ${nested.version}; it must stay on major 26 (CJS)`);
  }
  if (lock.packages[ROOT]) {
    const hit = [...runtimeClosure(lock, ROOT)].filter((p) => p === `node_modules/${FORBIDDEN}` || p.endsWith(`/node_modules/${FORBIDDEN}`));
    if (hit.length > 0) problems.push(`${FORBIDDEN} (ESM-only) is in isomorphic-dompurify's runtime tree: ${hit.join(", ")}`);
  } else {
    problems.push(`${ROOT} is missing from the lock`);
  }
  return problems;
}

const pkg = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")) as {
  overrides?: Record<string, { jsdom?: string }>;
  [k: string]: unknown;
};
const lock = JSON.parse(readFileSync(join(WEB_ROOT, "package-lock.json"), "utf8")) as Lock;

test("package.json keeps the isomorphic-dompurify -> jsdom 26 override, with its note", () => {
  const jsdom = pkg.overrides?.["isomorphic-dompurify"]?.jsdom ?? "";
  assert.match(jsdom, /^(?:[~^=]?)26\./, `override must pin jsdom 26.x, got "${jsdom}"`);
  const note = String(pkg["//overrides"] ?? "");
  assert.match(note, /load-bearing/, 'package.json needs the "//overrides" note explaining why the override exists');
  assert.match(note, /@exodus\/bytes/);
});

test("package-lock.json installs jsdom 26 under isomorphic-dompurify and no ESM-only tree", () => {
  assert.deepEqual(lockProblems(lock), []);
});

test("GUARD BITES: jsdom 27 nested under dompurify is reported", () => {
  const bad: Lock = JSON.parse(JSON.stringify(lock));
  bad.packages[NESTED] = { ...bad.packages[NESTED], version: "27.0.0" };
  assert.ok(lockProblems(bad).some((p) => p.includes("major 26")));
});

test("GUARD BITES: a missing nested jsdom (override dropped) is reported", () => {
  const bad: Lock = JSON.parse(JSON.stringify(lock));
  delete bad.packages[NESTED];
  assert.ok(lockProblems(bad).some((p) => p.includes("missing")));
});

test("GUARD BITES: @exodus/bytes reachable from the dompurify tree is reported", () => {
  const bad: Lock = JSON.parse(JSON.stringify(lock));
  bad.packages[NESTED] = { ...bad.packages[NESTED], dependencies: { ...bad.packages[NESTED].dependencies, [FORBIDDEN]: "^1.0.0" } };
  bad.packages[`node_modules/${FORBIDDEN}`] ??= { version: "1.16.0" };
  assert.ok(lockProblems(bad).some((p) => p.includes(FORBIDDEN)));
});
