import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { isWorkspaceOfferingRow, workspaceOfferingOrFilter } from "../offerings/workspace-offering-scope";

/**
 * TUL-915 (QA Batch 7): /admin/menu Catalogo was EMPTY while "QA- Corte" was
 * bookable on the public site. The public site counts the workspace's house rows
 * AND the owner's own provider rows (owner_kind='talent', written by onboarding);
 * the Catalog loader read owner_kind='workspace' only.
 */
const SRC = resolve(process.cwd(), "src");
const actions = readFileSync(resolve(SRC, "lib/talent/menu-offerings-actions.ts"), "utf8");
const page = readFileSync(resolve(SRC, "components/admin/shell/internal/page-modules/catalog/CatalogPage.tsx"), "utf8");

test("the Catalog loader reads the same rows the public site counts (house + owner provider), tenant pinned", () => {
  const load = actions.slice(actions.indexOf("export async function loadWorkspaceMenuForEditor"), actions.indexOf("export async function upsertWorkspaceMenuItem"));
  assert.match(load, /\.eq\("tenant_id", tenantId\)/);
  assert.match(load, /\.or\(workspaceOfferingOrFilter\(ownerTalentIds\)\)/);
  assert.match(load, /fetchOwnerTalentIds\(admin, tenantId\)/);
  assert.doesNotMatch(load, /\.eq\("owner_kind", "workspace"\)/);
});

test("writes stay workspace-only: no write path accepts a talent-owned row", () => {
  const writes = actions.slice(actions.indexOf("export async function upsertWorkspaceMenuItem"));
  assert.doesNotMatch(writes, /workspaceOfferingOrFilter/);
  assert.ok((writes.match(/\.eq\("owner_kind", "workspace"\)/g) ?? []).length >= 4);
});

test("a provider-owned row opens a 'edit under Services' notice, never the workspace editor", () => {
  assert.match(page, /item\?\.ownerKind === "talent"/);
  assert.match(page, /dashboard\.catalog\.itemProviderOwned/);
});

test("scope: owner provider row counts, roster talent and other tenants do not", () => {
  const owners = new Set(["owner-talent"]);
  assert.equal(isWorkspaceOfferingRow({ tenant_id: "t1", owner_kind: "talent", talent_profile_id: "owner-talent" }, "t1", owners), true);
  assert.equal(isWorkspaceOfferingRow({ tenant_id: "t1", owner_kind: "talent", talent_profile_id: "roster-talent" }, "t1", owners), false);
  assert.equal(isWorkspaceOfferingRow({ tenant_id: "t2", owner_kind: "talent", talent_profile_id: "owner-talent" }, "t1", owners), false);
  assert.match(workspaceOfferingOrFilter(new Set(["0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b"])), /owner_kind\.eq\.talent/);
});
