import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("layer 1 — tables and preparation pages exist and are capability-gated", () => {
  const tables = read("src/app/(workspace)/[tenantSlug]/admin/tables/page.tsx");
  const prep = read("src/app/(workspace)/[tenantSlug]/admin/preparation/page.tsx");
  assert.match(tables, /userHasCapability\(/);
  assert.match(prep, /userHasCapability\(/);
  assert.match(tables, /TablesClient/);
  assert.match(prep, /PreparationClient/);
});

test("layer 2 — canonical-route matchers claim /admin/tables and /admin/preparation", () => {
  const src = read("src/components/admin/shell/canonical-routes.ts");
  assert.match(src, /s\[0\] === "admin" && s\[1\] === "tables"/);
  assert.match(src, /s\[0\] === "admin" && s\[1\] === "preparation"/);
});

test("layer 3 — tables and preparation are allowed workspace segments", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/workspace-page-routing.ts");
  const list = src.slice(src.indexOf("WORKSPACE_PAGE_SEGMENTS"), src.indexOf("export function"));
  assert.ok(list.includes('"tables"'));
  assert.ok(list.includes('"preparation"'));
});

test("layer 4 — nav registry routes restaurant destinations to built pages", () => {
  const src = read("src/lib/workspace/navigation-registry.ts");
  assert.match(src, /tables: \{ id: "tables", path: "tables"/);
  assert.match(src, /preparation: \{ id: "preparation", path: "preparation"/);
});

test("tables and preparation actions require workspace staff and view_dashboard", () => {
  const tables = read("src/app/(workspace)/[tenantSlug]/admin/tables/actions.ts");
  const prep = read("src/app/(workspace)/[tenantSlug]/admin/preparation/actions.ts");
  for (const src of [tables, prep]) {
    assert.match(src, /requireWorkspaceStaffAction/);
    assert.match(src, /userHasCapability\("view_dashboard"/);
  }
});

test("table QR handler redirects through visit identity", () => {
  const src = read("src/app/q/[code]/route.ts");
  assert.match(src, /resolveOpenVisitForSpace/);
  assert.match(src, /tableNotSeated/);
  assert.doesNotMatch(src, /\/visit\/\$\{spaceId\}/);
});
