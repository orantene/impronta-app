// Walks the wired controls on the QA fixture and puts everything back.
import { chromium } from "playwright";
const BASE = "http://localhost:3191";
const S = "/private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/e30ce090-ce88-474f-861f-a6f78cb4f718/scratchpad/fid-catalog/shots";
const PIZZA = "33330012-0000-4000-8000-000000000002";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const fails = [];
const check = (cond, msg) => { console.log((cond ? "ok  " : "FAIL") + " " + msg); if (!cond) fails.push(msg); };
await p.goto(`${BASE}/api/dev/signin?email=qa-journeys-owner%40impronta.test&next=%2Fadmin`).catch(() => undefined);
await p.waitForTimeout(1500);
const hide = () => p.addStyleTag({ content: "[data-impronta-real-identity-banner]{display:none!important}" });
const open = async (path, sel) => { await p.goto(BASE + path, { waitUntil: "networkidle" }); await p.waitForSelector(sel, { timeout: 90000 }); await hide(); };

// 1. Availability: stock pool 5, then unlimited
await open(`/admin/catalog?item=${PIZZA}&tab=availability`, "[data-testid=catalog-item-editor]");
await p.click("[data-testid=catalog-mode-stock]");
await p.fill("[data-testid=catalog-field-stock]", "5");
await p.press("[data-testid=catalog-field-stock]", "Tab");
await p.waitForFunction(() => document.querySelector("[data-testid=catalog-side-pos]")?.textContent?.includes("5 left"), null, { timeout: 60000 }).catch(() => undefined);
check((await p.textContent("[data-testid=catalog-side-pos]")).includes("5 left"), "availability: side reads 5 left after the stock RPC");
await p.screenshot({ path: `${S}/W05_ProductAvailability.live.png` });
await open(`/admin/catalog`, "[data-testid=catalog-list]");
check((await p.textContent("[data-testid=catalog-list]")).includes("Stock pool · 5 left"), "list: House pizza reads Stock pool · 5 left");
await open(`/admin/catalog?item=${PIZZA}&tab=availability`, "[data-testid=catalog-item-editor]");
await p.click("[data-testid=catalog-mode-unlimited]");
await p.waitForFunction(() => document.querySelector("[data-testid=catalog-side-pos]")?.textContent?.includes("Unlimited"), null, { timeout: 60000 }).catch(() => undefined);
await open(`/admin/catalog`, "[data-testid=catalog-list]");
check(!(await p.textContent("[data-testid=catalog-list]")).includes("5 left"), "list: House pizza back to Unlimited");

// 1b. Options: an option added, then removed (the child-row writer)
await open(`/admin/catalog?item=${PIZZA}&tab=options`, "[data-testid=catalog-item-editor]");
await p.fill("[data-testid=catalog-options-variants] input[type=text]", "Large");
await p.fill("[data-testid=catalog-options-variants] input[type=number]", "21");
await p.click("[data-testid=catalog-options-variants-add]");
await p.waitForSelector("[data-testid=catalog-options-variants-row]", { timeout: 60000 }).catch(() => undefined);
check((await p.$$("[data-testid=catalog-options-variants-row]")).length === 1, "options: Large +$21 is a row after the writer answers");
check((await p.textContent("[data-testid=catalog-side-cashier]")).includes("Large"), "options: the cashier preview shows Large");
await p.screenshot({ path: `${S}/W04_ProductOptions.live.png` });
await p.click("[data-testid=catalog-options-variants-row] button[aria-label]");
await p.waitForFunction(() => document.querySelectorAll("[data-testid=catalog-options-variants-row]").length === 0, null, { timeout: 60000 }).catch(() => undefined);
check((await p.$$("[data-testid=catalog-options-variants-row]")).length === 0, "options: removed again");

// 2. Structure: favorite on, off
await open(`/admin/catalog?view=structure`, "[data-testid=catalog-structure]");
await p.selectOption("[data-testid=catalog-favorite-pick]", PIZZA);
await p.click("[data-testid=catalog-favorite-add]");
await p.waitForTimeout(4000);
check((await p.$$("[data-testid=catalog-favorite-row]")).length === 1, "structure: House pizza is a favorite");
await p.screenshot({ path: `${S}/W07_MenuStructure.live.png` });
await p.click("[data-testid=catalog-favorite-row] button");
await p.waitForTimeout(4000);
check((await p.$$("[data-testid=catalog-favorite-row]")).length === 0, "structure: favorite removed");

// 3. Channels: website off, on
await open(`/admin/catalog?item=${PIZZA}&tab=channels`, "[data-testid=catalog-item-editor]");
await p.click("[data-testid=catalog-channel-website] [role=switch]");
await p.waitForTimeout(4000);
check((await p.getAttribute("[data-testid=catalog-channel-website] [role=switch]", "aria-checked")) === "false", "channels: website switched off (agency_only)");
check((await p.textContent("[data-testid=catalog-side-visible]")).includes("Hidden"), "channels: side reads Hidden for the website");
await open(`/admin/catalog`, "[data-testid=catalog-list]");
const pizzaRow = p.locator("[data-testid=catalog-row]", { hasText: "House pizza" });
check(!(await pizzaRow.textContent()).includes("Website"), "list: House pizza has no Website chip while agency_only");
await open(`/admin/catalog?item=${PIZZA}&tab=channels`, "[data-testid=catalog-item-editor]");
await p.click("[data-testid=catalog-channel-website] [role=switch]");
await p.waitForTimeout(4000);
check((await p.getAttribute("[data-testid=catalog-channel-website] [role=switch]", "aria-checked")) === "true", "channels: website back on");
await p.screenshot({ path: `${S}/W06_ProductChannels.live.png` });

// 4. Create: product draft, save, delete
await open(`/admin/catalog?create=1`, "[data-testid=catalog-create-type]");
await p.screenshot({ path: `${S}/W02_CreateItemType.live.png` });
await p.click("[data-testid=catalog-create-pass]");
check(await p.isVisible("[data-testid=catalog-create-blocked]"), "create: pass card shows the product-decision sentence");
check(await p.isDisabled("[data-testid=catalog-create-continue]"), "create: Continue disabled for a pass");
await p.click("[data-testid=catalog-create-product]");
await p.click("[data-testid=catalog-create-continue]");
await p.waitForSelector("[data-testid=catalog-item-editor]");
check(p.url().includes("item=new"), "create: continue opens the draft editor");
check(await p.isDisabled("[data-testid=catalog-publish]"), "draft: Publish disabled while the draft is incomplete");
await p.screenshot({ path: `${S}/W03_ProductPricing.draft.live.png` });
await p.fill("[data-testid=catalog-field-title]", "QA fidelity draft");
await p.press("[data-testid=catalog-field-title]", "Tab");
await p.click("a:has-text('Pricing')");
await p.waitForSelector("[data-testid=catalog-field-price]", { timeout: 90000 });
await p.fill("[data-testid=catalog-field-price]", "3");
await p.press("[data-testid=catalog-field-price]", "Tab");
await p.waitForTimeout(500);
check(!(await p.isDisabled("[data-testid=catalog-publish]")), "draft: Publish enabled once named and priced");
await p.click("[data-testid=catalog-save-draft]");
await p.waitForURL((u) => !u.searchParams.get("item")?.includes("new"), { timeout: 30000 }).catch(() => undefined);
check(!p.url().includes("item=new"), "draft: saved and the URL carries the new id");
check(await p.isVisible("[data-testid=catalog-item-editor]"), "draft: the editor stays open on the saved row");
const newId = new URL(p.url()).searchParams.get("item");
await open(`/admin/catalog`, "[data-testid=catalog-list]");
const draftRow = p.locator("[data-testid=catalog-row]", { hasText: "QA fidelity draft" });
check((await draftRow.count()) >= 1, "list: the draft is listed");
check((await draftRow.first().locator("[data-testid=catalog-row-status]").getAttribute("data-state")) === "draft", "list: it wears the Draft pill");
// Delete every QA draft this or an earlier run left, so the fixture is as found.
while ((await p.locator("[data-testid=catalog-row]", { hasText: "QA fidelity draft" }).count()) > 0) {
  await p.locator("[data-testid=catalog-row]", { hasText: "QA fidelity draft" }).first().locator("[data-testid=catalog-row-menu]").click();
  await p.click("[role=menuitem]:has-text('Delete')");
  await p.waitForTimeout(4000);
  await open(`/admin/catalog`, "[data-testid=catalog-list]");
}
check((await p.locator("[data-testid=catalog-row]", { hasText: "QA fidelity draft" }).count()) === 0, "list: the draft is deleted (" + newId + ")");

// 5. Spanish and French frames
for (const loc of ["es", "fr"]) {
  await ctx.addCookies([{ name: "locale", value: loc, url: BASE }]);
  await open(`/admin/catalog`, "[data-testid=catalog-list]");
  await p.screenshot({ path: `${S}/W01_CatalogItems.${loc}.live.png` });
  await open(`/admin/catalog?item=${PIZZA}&tab=pricing`, "[data-testid=catalog-item-editor]");
  await p.screenshot({ path: `${S}/W03_ProductPricing.${loc}.live.png` });
}
console.log(fails.length ? `FAILURES: ${fails.length}` : "ALL OK");
await b.close();
process.exit(fails.length ? 1 : 0);
