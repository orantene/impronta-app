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
  assert.match(drawer, /<ServicesEditorLink isSelf=\{isSelf\} talentId=\{payload\.talentId\} \/>/);
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

test("review (1): the buyer-name requirement moved into the current editor (same fields, same validation)", () => {
  const editor = read("src/components/talent/services/EditorScreen.tsx");
  assert.match(editor, /<IdentityRequirementField item=\{item\} patch=\{patch\} \/>/);
  const field = read("src/components/talent/services/IdentityRequirementField.tsx");
  assert.match(field, /requiresIdentity: true, identityReason: item\.identityReason \?\? "attendee_names"/);
  assert.match(field, /requiresIdentity: false, identityReason: null/);
  assert.match(field, /IDENTITY_REASONS\.map/);
  assert.match(field, /Necesita el nombre del comprador/);
  // Validation is unchanged: validateOffering still refuses a missing reason.
  assert.match(read("src/lib/talent/offerings-types.ts"), /if \(o\.requiresIdentity && !isIdentityReason\(o\.identityReason\)\)/);
});

test("review (1): stock was never lost for talents; the legacy StockControl only rendered for a WORKSPACE owner", () => {
  // The drawer mounted the legacy manager with talentId only (no workspace owner), so its
  // workspace-only StockControl (setMenuItemStockAction) never rendered there. Talent product
  // stock is edited in ProductEditorCard and applied through the same pool RPC on save.
  assert.match(read("src/components/talent/services/ProductEditorCard.tsx"), /inventoryQty: e\.target\.value === "" \? null : Number\(e\.target\.value\)/);
  assert.match(read("src/lib/talent/offerings-actions.ts"), /stockChanged\(saved\.inventory_qty, offering\.inventoryQty\)/);
  assert.match(read("src/components/admin/shell/internal/page-modules/catalog/item-tab-availability.tsx"), /setMenuItemStockAction/);
});

test("review (2): staff with access to the talent get the current editor in the drawer (same permission check)", () => {
  const link = read("src/components/talent/services/ServicesEditorLink.tsx");
  assert.match(link, /<StaffServicesPanel talentId=\{talentId\} \/>/);
  const panel = read("src/components/talent/services/StaffServicesPanel.tsx");
  // authorizeForTalent (workspace staff + roster) gates the load and every save.
  assert.match(panel, /loadTalentOfferingsForEditor\(talentId\)/);
  assert.match(panel, /upsertTalentOffering\(talentId,/);
  assert.match(panel, /<EditorScreen/);
  assert.match(panel, /resolveOfferingEditorSaveStatus\(/);
  const drawer = read("src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx");
  assert.match(drawer, /<ServicesEditorLink isSelf=\{isSelf\} talentId=\{payload\.talentId\} \/>/);
});
