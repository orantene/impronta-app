import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { offeringToRowPatch, blankOffering } from "./offerings-types";
import { normalizeWorkspaceLocale } from "./workspace-primary-locale";

const SRC = resolve(process.cwd(), "src");
const actions = readFileSync(resolve(SRC, "lib/talent/menu-offerings-actions.ts"), "utf8");
const optionsTab = readFileSync(resolve(SRC, "components/admin/shell/internal/page-modules/catalog/item-tab-options.tsx"), "utf8");

test("5d: the workspace locale is normalised, English when unset or junk", () => {
  assert.equal(normalizeWorkspaceLocale("es"), "es");
  assert.equal(normalizeWorkspaceLocale("es-MX"), "es");
  assert.equal(normalizeWorkspaceLocale(" ES_mx "), "es");
  assert.equal(normalizeWorkspaceLocale(null), "en");
  assert.equal(normalizeWorkspaceLocale(""), "en");
  assert.equal(normalizeWorkspaceLocale("???"), "en");
});

test("5d: a Spanish title is stored under `es` when the workspace primary is Spanish", () => {
  const o = { ...blankOffering({ kind: "workspace", tenantId: "t" }, "MXN", 0), title: "Corte de pelo" };
  const patch = offeringToRowPatch(o, normalizeWorkspaceLocale("es"));
  assert.deepEqual(patch.title_i18n, { es: "Corte de pelo" });
});

test("5d: menu actions no longer hard-code English for the workspace's own rows", () => {
  assert.doesNotMatch(actions, /offeringToRowPatch\([\s\S]{0,200}"en"\)/);
  assert.doesNotMatch(actions, /rowToOffering\([^)]*"en"/);
  assert.match(actions, /workspacePrimaryLocale\(admin, tenantId\)/);
  assert.match(actions, /replaceOfferingChildren\(admin, offeringId, input, "menu\.offerings", await workspacePrimaryLocale/);
});

test("5d/5e: the Catalog Options payload carries translations and extra minutes", () => {
  assert.match(optionsTab, /variants: nextVariants\.map\(\(v\) => \(\{[^}]*labelI18n: v\.labelI18n/);
  assert.match(optionsTab, /addOns: nextAddOns\.map\(\(a\) => \(\{[^}]*labelI18n: a\.labelI18n[^}]*durationMinutes/);
});
