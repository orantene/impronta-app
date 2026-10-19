import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SALES = join(process.cwd(), "src", "app", "(workspace)", "[tenantSlug]", "admin", "sales");
const BRIDGE = join(process.cwd(), "src", "app", "(workspace)", "[tenantSlug]", "_data-bridge");
const read = (p: string) => readFileSync(p, "utf8");

test("the CSV export is authorised per workspace, never by the global staff role", () => {
  const route = read(join(SALES, "export", "route.ts"));
  assert.match(route, /userHasCapability\("view_dashboard", scope\.tenantId\)/);
  assert.doesNotMatch(route, /requireStaff/);
  assert.match(route, /getTenantScopeBySlug\(tenantSlug\)/);
});

test("sales-by-item reads orders and order_lines only through the tenant-scoped helper", () => {
  const src = read(join(BRIDGE, "sales-by-item.ts"));
  assert.match(src, /tenantScopedQuery\(admin, "orders", tenantId\)/);
  assert.match(src, /tenantScopedQuery\(admin, "order_lines", tenantId\)/);
  assert.doesNotMatch(src, /\.from\("order(s|_lines)"\)/);
});

test("the sales-by-item path is read only: no write verb anywhere in it", () => {
  for (const f of [join(BRIDGE, "sales-by-item.ts"), join(BRIDGE, "sales-method.ts"), join(SALES, "export", "route.ts"), join(SALES, "items-view.tsx")]) {
    assert.doesNotMatch(read(f), /\.(insert|update|upsert|delete|rpc)\(/, f);
  }
});

test("the board wires period and method instead of drawing them disabled", () => {
  const page = read(join(SALES, "page.tsx"));
  assert.match(page, /parseSalesPeriod\(sp\.period\)/);
  assert.match(page, /parseSalesMethod\(sp\.method\)/);
  assert.doesNotMatch(page, /notWired\("period"\)|notWired\("payment"\)|notWired\("export"\)/);
});

test("the activity loader passes the period window and method to the orders read", () => {
  const src = read(join(BRIDGE, "sales-activity.ts"));
  assert.match(src, /createdFrom: range\.from/);
  assert.match(src, /orderIdsPaidWith\(/);
});
