import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveWorkspaceAdminPage } from "@/app/(workspace)/[tenantSlug]/admin/workspace-page-routing";
import { CANONICAL_ROUTE_MATCHERS } from "@/components/admin/shell/canonical-routes";
import { join } from "node:path";
import { liveRouteSegment, resolveDestination } from "../workspace/destinations";

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
  // Asserted against the matchers rather than the source text: these entries
  // are now projected from the destination registry, so matching the spelling
  // would prove nothing about the routes.
  for (const segment of ["tables", "preparation"]) {
    assert.ok(
      CANONICAL_ROUTE_MATCHERS.some((matches) => matches(["admin", segment])),
      `/admin/${segment} must render its canonical page, not the single-page shell`,
    );
  }
});

test("layer 3 — tables and preparation are allowed workspace segments", () => {
  // Asserted by resolving the segment rather than by reading the list out
  // of the source: the list is now derived from the destination registry,
  // so its spelling proves nothing. What must hold is that the address
  // still opens its page.
  for (const segment of ["tables", "preparation"]) {
    assert.equal(
      resolveWorkspaceAdminPage(segment),
      segment,
      `/admin/${segment} must still resolve to its own page`,
    );
  }
});

test("layer 4 — the destination registry routes restaurant destinations to built pages", () => {
  // Repointed from the dead `lib/workspace/navigation-registry.ts` (deleted in
  // T2-A) to the one registry of workspace destinations. `spaces` is the
  // canonical name; /admin/tables is still the live route, and still resolves.
  const spaces = resolveDestination("tables");
  assert.equal(spaces?.id, "spaces");
  assert.equal(spaces && liveRouteSegment(spaces), "tables");
  const prep = resolveDestination("preparation");
  assert.equal(prep?.id, "preparation");
  assert.equal(prep && liveRouteSegment(prep), "preparation");
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
