/**
 * The menu order action LOADS.
 *
 * Twice now a delete-shaped push has left a dangling import that every test
 * lane missed and only `tsc` caught — a 17-minute CI round trip to learn that a
 * module cannot resolve. The second time it was a TYPE-ONLY import, which is
 * the variety that survives a rewire: the runtime call had already moved to the
 * pipeline, so nothing executed the dead path and nothing went red.
 *
 * TWO GUARDS, because the obvious one is not enough and I proved that rather
 * than assumed it.
 *
 * The dynamic import below catches a dangling VALUE import in under a second,
 * with no 8 GB heap. But I broke the real bug on purpose to check, and it went
 * GREEN: a `import { type X } from "./deleted"` is ERASED at runtime, so the
 * module is never resolved and nothing fails. The exact variety that bit this
 * track twice is invisible to a runtime check.
 *
 * So the second test reads the imports as TEXT and asserts each local target
 * exists on disk. That one does catch a type-only import of a deleted file.
 *
 * Neither replaces the typecheck — they cannot see a type mismatch. They exist
 * so the compiler is not the FIRST thing to notice a file that is gone, because
 * `tsc` is a 17-minute CI round trip and, under the memory ceiling, often not
 * runnable locally at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

test("the menu order action and its dependencies all resolve", async () => {
  const mod = await import("@/app/(public)/_menu/menu-order-actions");
  assert.equal(typeof mod.submitMenuOrder, "function");
});

test("the purchase pipeline resolves", async () => {
  const mod = await import("@/lib/orders/purchase");
  assert.equal(typeof mod.createPurchase, "function");
});

/**
 * Every local import in the orders area points at a file that exists.
 *
 * This is the one that would have caught both incidents. `import { type X }
 * from "@/lib/inquiry/menu-order-engine"` survives a rewire — the runtime call
 * had already moved to the pipeline, so no code path executed the dead module
 * and every lane stayed green while the file was gone.
 *
 * Text-based, so it is a tripwire rather than a proof: a dynamically-built
 * specifier would evade it. It costs milliseconds and catches the case that has
 * actually happened, twice.
 */
test("every local import in the orders area resolves to a real file", () => {
  const roots = [
    "src/lib/orders",
    "src/app/(public)/_menu",
  ];
  const offenders: string[] = [];

  for (const root of roots) {
    const dir = path.join(process.cwd(), root);
    for (const entry of readdirSync(dir)) {
      if (!/\.tsx?$/.test(entry)) continue;
      // Skip tests, and strip comments before scanning. This guard flagged its
      // OWN doc comment on the first run — the third time today a guard has
      // fired on prose describing the thing it forbids. Pin behaviour, never
      // text that merely mentions it.
      if (/\.test\.tsx?$/.test(entry)) continue;
      const file = path.join(dir, entry);
      const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

      for (const m of body.matchAll(/from\s+"(@\/[^"]+)"/g)) {
        const spec = m[1].replace(/^@\//, "src/");
        const candidates = [
          `${spec}.ts`, `${spec}.tsx`,
          path.join(spec, "index.ts"), path.join(spec, "index.tsx"),
        ];
        const found = candidates.some((c) => existsSync(path.join(process.cwd(), c)));
        if (!found) offenders.push(`${root}/${entry} -> ${m[1]}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "these imports point at files that do not exist — a TYPE-ONLY one of these is "
      + "erased at runtime, so every lane stays green and only tsc notices",
  );
});

/**
 * The same tripwire, one directory over.
 *
 * The guard above walks `src/`. Deleting `instant-book-engine.ts` broke seven
 * `qa-*.mts` harnesses in `scripts/`, and nothing here noticed — my third
 * miscount of the same kind in one night, each one "I grepped the tree" where
 * the tree was smaller than the repo.
 *
 * `scripts/` reaches `src/` by RELATIVE path and its files are `.mts`, so the
 * `@/`-only scan above could never have seen them. This resolves both.
 */
test("every import in scripts/ resolves to a real file", () => {
  const dir = path.join(process.cwd(), "scripts");
  const offenders: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (!/\.(m?tsx?)$/.test(entry)) continue;
    if (/\.test\.[cm]?tsx?$/.test(entry)) continue;
    const body = readFileSync(path.join(dir, entry), "utf8")
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

    for (const m of body.matchAll(/from\s+"((?:\.\.?\/|@\/)[^"]+)"/g)) {
      const raw = m[1];
      const base = raw.startsWith("@/")
        ? path.join(process.cwd(), raw.replace(/^@\//, "src/"))
        : path.resolve(dir, raw);
      // An explicit extension is the whole specifier; otherwise try the
      // extensions this tree actually uses, plus a directory index.
      const candidates = /\.[cm]?tsx?$/.test(base)
        ? [base]
        : [
            `${base}.ts`, `${base}.tsx`, `${base}.mts`,
            path.join(base, "index.ts"), path.join(base, "index.tsx"),
          ];
      if (!candidates.some((c) => existsSync(c))) offenders.push(`scripts/${entry} -> ${raw}`);
    }
  }

  assert.deepEqual(offenders, [], "these script imports point at files that do not exist");
});
