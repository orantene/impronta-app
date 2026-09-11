/**
 * POS — a keyboard-wedge scanner at the counter (design boards C23, C24;
 * ledger POS-2.8): "Scanner ready", a scanned code adds the item with a
 * toast, an unknown code says so, and a person typing is never a scan.
 *
 * WHAT A SCANNER IS TO A BROWSER. A wedge scanner is a keyboard that types
 * the code in a few milliseconds and presses Enter. Playwright's keyboard
 * does exactly that with no delay between keys, so `keyboard.type(code)`
 * followed by Enter IS the hardware, as far as the page can tell; and a
 * `delay` of 150 ms between keys is a person, which the counter must ignore.
 *
 * TWO CODES, ONE WRITE PATH. The first scan is a link code from the QR &
 * Links engine (a `links` row whose `context.offering_id` names the pizza,
 * the same row a printed `/q/<code>` card resolves), the second is the
 * offering's own id. Both go into the basket through `posAddLine`, so the
 * order rows are asserted the way any sale's are. The link row is this
 * spec's own fixture on the QA workspace, created before and removed after;
 * the scan itself is what is being proven, and nothing about it is seeded.
 */
import type { Page } from "@playwright/test";

import { test, expect, prepareJourneysPage, openCounter, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

const PIZZA = { title: "House pizza", cents: 1800 } as const;

/** Take focus off whatever has it, so the keystrokes belong to the document. */
async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

/** A scan: every key at once, then Enter. */
async function scan(page: Page, code: string): Promise<void> {
  // Nothing focused: a scanner fired at the counter, not into a field.
  await blurFocus(page);
  await page.keyboard.type(code);
  await page.keyboard.press("Enter");
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("POS-2.8 scanner: ready chip, link code adds the item, offering id adds again, unknown code refused, typing ignored", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const admin = isolatedService();

  const offering = await admin
    .from("talent_offerings")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("owner_kind", "workspace")
    .eq("status", "published")
    .eq("title", PIZZA.title)
    .maybeSingle();
  expect(offering.error).toBeNull();
  const pizzaId = offering.data?.id;
  expect(pizzaId, "the fixture must sell House pizza").toBeTruthy();

  const code = `qa-scan-${Date.now().toString(36)}`;
  const link = await admin
    .from("links")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      code,
      code_mode: "readable",
      name: "QA scanner card",
      kind: "menu",
      targets: [{ when: "always", to: { to: "/menu", label: "menu" } }],
      context: { offering_id: pizzaId },
    })
    .select("id")
    .single();
  expect(link.error).toBeNull();
  const linkId = String(link.data?.id);

  try {
    await openCounter(page);

    // C23 — the counter says it is listening.
    const chip = page.locator("[data-pos-scanner-ready]");
    await expect(chip, "the Sell screen must show Scanner ready").toBeVisible({ timeout: 30_000 });
    await expect(chip).toContainText(/scanner ready/i);
    await page.screenshot({ path: testInfo.outputPath("scan-01-ready.png"), fullPage: false });

    // The wedge listener is a client hook: keys typed before React has
    // hydrated the counter go nowhere, and a dev server under load can take
    // seconds to ship the chunk. Wait for the counter to be live (its search
    // box answers to typing only once it is), then scan.
    await page.waitForFunction(() => {
      const tile = document.querySelector("[data-pos-tile]");
      return Boolean(tile && Object.keys(tile).some((key) => key.startsWith("__react")));
    }, undefined, { timeout: 60_000 });

    // C24 — a link code, with no sale open: the scan opens one and adds the item.
    await scan(page, code);
    const toast = page.locator("[data-pos-scan-toast]");
    await expect(toast, "a scan must answer with a toast").toBeVisible({ timeout: 60_000 });
    await expect(toast).toHaveAttribute("data-pos-scan-toast", "added");
    await expect(toast).toContainText(new RegExp(`Added · ${PIZZA.title}`, "i"));
    await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
    const orderId = new URL(page.url()).searchParams.get("order")!;
    await expect(page.locator("[data-pos-charge]")).toContainText("$18.00", { timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath("scan-02-added-link-code.png"), fullPage: false });

    const afterFirst = await admin
      .from("order_lines")
      .select("offering_id, units, total_cents")
      .eq("order_id", orderId);
    expect(afterFirst.error).toBeNull();
    expect(afterFirst.data, "one line, the pizza, from the link code").toHaveLength(1);
    expect(afterFirst.data![0].offering_id).toBe(pizzaId);
    expect(Number(afterFirst.data![0].total_cents)).toBe(PIZZA.cents);

    // The toast clears itself so the next scan's sentence is never the last one's.
    await expect(toast, "the toast must clear on its own").toHaveCount(0, { timeout: 15_000 });

    // The offering's own id, scanned as a bare UUID, on the sale now open.
    await scan(page, pizzaId!);
    await expect(toast).toBeVisible({ timeout: 30_000 });
    await expect(toast).toHaveAttribute("data-pos-scan-toast", "added");
    await expect(page.locator("[data-pos-charge]")).toContainText("$36.00", { timeout: 30_000 });

    const afterSecond = await admin.from("orders").select("total_cents, status").eq("id", orderId).maybeSingle();
    expect(Number(afterSecond.data?.total_cents)).toBe(PIZZA.cents * 2);
    expect(afterSecond.data?.status).toBe("draft");

    // An unknown code: refused in a sentence, nothing written. The code is
    // chosen to carry the workspace shell's own single-key shortcuts (`c` =
    // compose, `g` then `o` = go to Overview): a scanner types them like any
    // other character, and the first run of this spec watched the New inquiry
    // drawer open over the register. Neither may fire under the till.
    await expect(toast).toHaveCount(0, { timeout: 15_000 });
    await scan(page, "go-check-zzzz");
    await expect(toast).toBeVisible({ timeout: 30_000 });
    await expect(toast).toHaveAttribute("data-pos-scan-toast", "no_match");
    await expect(toast).toContainText(/nothing matches go-check-zzzz/i);
    await expect(toast).not.toContainText(/\bno_match\b/);
    // The drawer panel is always in the DOM, slid off-screen when closed, so
    // "no drawer" is "the panel is still off-screen and untitled".
    await page.waitForTimeout(1_500);
    const drawer = page.locator("[data-tulala-drawer-panel]").first();
    await expect(drawer, "a scan must not open a workspace drawer").not.toHaveAttribute("aria-label", /.+/);
    const offscreen = await drawer.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.left >= window.innerWidth - 1;
    });
    expect(offscreen, "the drawer panel must still be slid off-screen after a scan").toBe(true);
    await expect(page, "a scan must not navigate the cashier away").toHaveURL(/\/admin\/pos\?mode=counter/);
    await page.screenshot({ path: testInfo.outputPath("scan-03-no-match.png"), fullPage: false });
    const afterUnknown = await admin.from("orders").select("total_cents").eq("id", orderId).maybeSingle();
    expect(Number(afterUnknown.data?.total_cents)).toBe(PIZZA.cents * 2);

    // A person typing the same code at human speed is not a scan. Dismiss is
    // the one tap a cashier has on the toast; it is used when the toast is
    // still up (it clears itself after a few seconds otherwise).
    // The toast carries `Undo` beside Dismiss now (`POSScanProduct`); Dismiss
    // is the one that leaves the sale as it is.
    if (await toast.isVisible()) await toast.getByRole("button", { name: /dismiss|descartar|ignorer/i }).click();
    await expect(toast).toHaveCount(0, { timeout: 15_000 });
    await blurFocus(page);
    await page.keyboard.type(code, { delay: 150 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2_500);
    await expect(toast, "human-speed typing must never fire the scanner").toHaveCount(0);
    const afterTyping = await admin.from("orders").select("total_cents").eq("id", orderId).maybeSingle();
    expect(Number(afterTyping.data?.total_cents)).toBe(PIZZA.cents * 2);

    // A scanner fired while the search box has focus types into the box.
    const search = page.locator("#pos-sell-search");
    await search.click();
    await page.keyboard.type(code);
    await page.keyboard.press("Enter");
    await expect(search).toHaveValue(code);
    await page.waitForTimeout(2_500);
    await expect(toast, "a focused text field owns its keystrokes").toHaveCount(0);
    const afterSearch = await admin.from("orders").select("total_cents").eq("id", orderId).maybeSingle();
    expect(Number(afterSearch.data?.total_cents)).toBe(PIZZA.cents * 2);

    await testInfo.attach("scanner-rows", {
      body: JSON.stringify({ orderId, code, linkId, pizzaId, lines: afterFirst.data }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await admin.from("links").delete().eq("id", linkId).eq("tenant_id", JOURNEYS_TENANT_ID);
  }
});
