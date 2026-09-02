import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The `@/lib/access` barrel must stay importable from a pure test lane.
 *
 * `lib/scheduling/exclusive-release-gate.ts` imports `roleGrantsCapability`
 * from the barrel, and `test:scheduling` runs as a bare `tsx --test` with NO
 * `register-server-only-test.cjs` shim. So any module the barrel reaches at
 * IMPORT time must not pull `server-only`, or that lane dies at load with
 * "Cannot find module 'server-only'" — which is what happened on the first push
 * of the entitlements change, when `has-capability.ts` gained a static import
 * of the (correctly) server-only entitlement store.
 *
 * The fix was a dynamic import inside the function body. This guard pins it:
 * modules in the barrel's static graph may reference a server-only module only
 * behind `await import(...)`.
 */

const ACCESS_DIR = join(process.cwd(), "src", "lib", "access");

function read(file: string): string {
  return readFileSync(join(ACCESS_DIR, file), "utf8");
}

/** Files the barrel re-exports from, resolved one level (enough in practice). */
function barrelStaticDeps(): string[] {
  const barrel = read("index.ts");
  return [...barrel.matchAll(/from "\.\/([\w-]+)"/g)].map((m) => `${m[1]}.ts`);
}

test("no module in the access barrel's static graph imports server-only", () => {
  const available = new Set(readdirSync(ACCESS_DIR));
  const offenders: string[] = [];

  const queue = barrelStaticDeps();
  const seen = new Set<string>();

  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file) || !available.has(file)) continue;
    seen.add(file);

    const src = read(file);

    // A STATIC `import "server-only"` in the graph is the failure. A dynamic
    // `await import("./x")` is fine — it is not evaluated at load.
    if (/^\s*import\s+["']server-only["']/m.test(src)) {
      offenders.push(file);
    }

    for (const m of src.matchAll(/^\s*import[^;]*?from "\.\/([\w-]+)"/gm)) {
      queue.push(`${m[1]}.ts`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "These modules are reachable from the @/lib/access barrel by STATIC import " +
      "and pull in `server-only`, which breaks every tsx test lane without the " +
      "shim (test:scheduling, test:access, ...). Move the dependency behind a " +
      "dynamic `await import(...)` inside the function that needs it.",
  );
});

test("has-capability reaches the entitlement store only dynamically", () => {
  const src = read("has-capability.ts");
  assert.ok(
    !/^\s*import\s+\{[^}]*\}\s+from\s+["']\.\/plan-entitlements-store["']/m.test(src),
    "has-capability.ts must not statically import plan-entitlements-store",
  );
  assert.ok(
    src.includes('await import("./plan-entitlements-store")'),
    "has-capability.ts must load the entitlement store via dynamic import",
  );
});
