import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-1270 #10: the legacy English-only services editor (TalentOfferingsManager)
 * is retired. Every entry point lands in the current Services editor.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("the legacy editor file is gone and nothing imports it", () => {
  assert.equal(existsSync(join(ROOT, "src/components/talent/services/TalentOfferingsManager.tsx")), false);
  const importers = walk(join(ROOT, "src")).filter((f) => /services\/TalentOfferingsManager["']/.test(readFileSync(f, "utf8")));
  assert.deepEqual(importers, []);
});

test("the profile drawer links to the current Services editor instead of mounting the legacy one", () => {
  const drawer = read("src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx");
  assert.doesNotMatch(drawer, /<TalentOfferingsManager/);
  assert.match(drawer, /<ServicesEditorLink isSelf=\{isSelf\} \/>/);
  const link = read("src/components/talent/services/ServicesEditorLink.tsx");
  assert.match(link, /href="\/talent\/services"/);
  assert.match(link, /import Link from "next\/link"/);
  assert.match(link, /Abrir Servicios/);
});

test("the legacy tenant-scoped Services route still redirects to the current editor", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/talent/services/page.tsx");
  assert.match(page, /redirectLegacyTalentPath\("services", searchParams\)/);
  const current = read("src/app/(workspace)/talent/services/page.tsx");
  assert.match(current, /<ServicesBootstrapSeed /);
});
