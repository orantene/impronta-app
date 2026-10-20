/**
 * TUL-1271 #8 / #2: Duplicate copies options and extras; the provider-owned
 * notice links to Services.
 *
 * Run: node_modules/.bin/tsx --test src/lib/talent/duplicate-children.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { childrenInputFromItem } from "./duplicate-children";

test("childrenInputFromItem carries labels, prices, translations and durations, never ids", () => {
  const input = childrenInputFromItem({
    variants: [{ id: "v1", label: "Large", amountCents: 800, labelI18n: { es: "Grande" } }],
    addOns: [{ id: "a1", label: "Oat milk", amountCents: 100, labelI18n: { es: "Leche de avena" }, durationMinutes: 5 }],
  });
  assert.deepEqual(input, {
    variants: [{ label: "Large", amountCents: 800, labelI18n: { es: "Grande" } }],
    addOns: [{ label: "Oat milk", amountCents: 100, labelI18n: { es: "Leche de avena" }, durationMinutes: 5 }],
  });
  assert.equal(childrenInputFromItem({}), null, "nothing to copy");
});

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the editor's duplicate writes the copy's children through the right owner action", () => {
  const hook = src("../../components/talent/services/use-offerings-editor.ts");
  const dup = hook.slice(hook.indexOf("const duplicate = useCallback"), hook.indexOf("const startAdd"));
  assert.match(dup, /childrenInputFromItem\(it\)/);
  assert.match(dup, /setWorkspaceMenuItemOptions\(workspaceTenantId/);
  assert.match(dup, /setOfferingOptions\(talentId/);
});

test("a provider-owned row's notice links to Services", () => {
  const page = src("../../components/admin/shell/internal/page-modules/catalog/CatalogPage.tsx");
  assert.match(page, /href="\/talent\/services"/);
  assert.match(page, /dashboard\.catalog\.itemProviderOwnedLink/);
});
