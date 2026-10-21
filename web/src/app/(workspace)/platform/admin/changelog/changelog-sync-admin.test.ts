import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { changelogSyncStatusLine } from "./sync-status";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(HERE, f), "utf8");

test("TUL-1391: result lines are bilingual and unknown codes show nothing", () => {
  const ok = { result: "ok" as const, synced: 3, removed: 1, errors: 0 };
  assert.equal(changelogSyncStatusLine(ok, "en")?.text, "Done. 3 updated, 1 removed.");
  assert.equal(changelogSyncStatusLine(ok, "es")?.text, "Listo. 3 actualizadas, 1 quitadas.");
  assert.equal(changelogSyncStatusLine({ ...ok, result: "failed" }, "en")?.ok, false);
  assert.equal(changelogSyncStatusLine({ ...ok, result: null }, "en"), null);
  assert.equal(changelogSyncStatusLine({ ...ok, result: "<script>" as never }, "en"), null);
  assert.match(changelogSyncStatusLine({ result: "ok", synced: NaN, removed: NaN, errors: 0 }, "en")!.text, /0 updated/);
});

test("TUL-1391: the action is super_admin only, not while impersonating, and runs the shared sync", () => {
  const a = read("actions.ts");
  assert.match(a, /^"use server";/);
  assert.match(a, /getPlatformRole\(session\.profile\) !== "super_admin"/);
  assert.match(a, /requireNotImpersonating\(\)/);
  assert.match(a, /syncChangelog\(/);
});

test("TUL-1391: the sync secret never reaches the page, a client file or a NEXT_PUBLIC var", () => {
  for (const f of readdirSync(HERE).filter((n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts"))) {
    const src = read(f);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /CHANGELOG_SYNC_SECRET/, `${f} must not read the secret`);
    assert.doesNotMatch(code, /NEXT_PUBLIC_[A-Z_]*SECRET/, f);
    assert.doesNotMatch(code, /^"use client"/m, `${f} must stay a server module`);
  }
});

test("TUL-1391: the page offers the button in both languages and no em dashes", () => {
  const p = read("page.tsx");
  assert.match(p, /Sync changelog now/);
  assert.match(p, /Sincronizar ahora/);
  assert.ok(!p.includes("—") && !read("sync-status.ts").includes("—"));
});
