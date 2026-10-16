/**
 * TUL-638: the useNextFreeSlot hook was orphaned by the GRK-042 sticky-bar change. It stays deleted,
 * and nothing may import it (the live next-free-slot logic is `talent-site/next-free-slot`).
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("the orphaned use-next-free-slot hook file is gone", () => {
  assert.equal(existsSync(join(SRC, "lib/site-admin/builder-node/use-next-free-slot.ts")), false);
});

test("nothing imports use-next-free-slot or calls useNextFreeSlot", () => {
  const self = __filename;
  const hits = walk(SRC)
    .filter((f) => f !== self)
    .filter((f) => /use-next-free-slot|useNextFreeSlot\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits, []);
});
