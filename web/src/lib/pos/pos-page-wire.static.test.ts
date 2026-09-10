import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPosSegment,
  liveRouteSegment,
  resolveDestination,
} from "../workspace/destinations";

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

test("layer 4 — the destination registry routes New sale to the POS route", () => {
  // Repointed from the dead `lib/workspace/navigation-registry.ts` (deleted in
  // T2-A: nothing consumed it) to the one registry of workspace destinations.
  const pos = resolveDestination("pos");
  assert.ok(pos, "pos must resolve to a destination");
  assert.equal(pos.id, "pos");
  assert.equal(liveRouteSegment(pos), "pos");
  // POS owns the whole screen; it must never be reachable as a rail row.
  assert.equal(pos.chrome, "pos");
  assert.ok(isPosSegment("pos"));
});

test("POS actions require workspace staff and booking.payment.request", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/pos/actions.ts");
  assert.match(src, /requireWorkspaceStaffAction/);
  assert.match(src, /booking.payment.request/);
  assert.match(src, /userHasCapability\(capability/);
  assert.match(src, /staff\("booking.payment.mark_received"\)/);
  assert.doesNotMatch(src, /view_dashboard/);
});

test("shift cash-up lives on POS, not a new destination", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx");
  assert.match(page, /currentShift/);
  const client = read("src/app/(workspace)/[tenantSlug]/admin/pos/pos-client.tsx");
  assert.match(client, /posOpenShift/);
  assert.match(client, /posCloseShift/);
  assert.match(client, /amountCents/);
  assert.match(client, /posSubmitPrep/);
  assert.match(client, /promisedAt/);
  assert.match(client, /prepDestination/);
  assert.doesNotMatch(client, /useEffect/);
});

test("walk-in class places pick a tenant-scoped session", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx");
  assert.match(page, /from\("sessions"\)/);
  assert.match(page, /from\("sessions"\)[\s\S]{0,280}eq\("tenant_id", scope.tenantId\)/);
  assert.match(page, /eq\("status", "scheduled"\)/);
  const client = read("src/app/(workspace)/[tenantSlug]/admin/pos/pos-client.tsx");
  assert.match(client, /sessionId/);
  assert.match(client, /posAddLine/);
});
