import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("layer 1 — the POS page exists and is capability-gated", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx");
  assert.match(page, /userHasCapability\(/);
  assert.match(page, /PosClient/);
});

test("layer 2 — a canonical-route matcher claims /admin/pos", () => {
  const src = read("src/components/admin/shell/canonical-routes.ts");
  assert.match(src, /s\[0\] === "admin" && s\[1\] === "pos"/);
});

test("layer 3 — 'pos' is an allowed workspace segment", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/workspace-page-routing.ts");
  const list = src.slice(src.indexOf("WORKSPACE_PAGE_SEGMENTS"), src.indexOf("export function"));
  assert.ok(list.includes('"pos"'));
});

test("layer 4 — the nav registry routes New Sale to pos", () => {
  const src = read("src/lib/workspace/navigation-registry.ts");
  assert.match(src, /pos: \{ id: "pos", path: "pos"/);
});
