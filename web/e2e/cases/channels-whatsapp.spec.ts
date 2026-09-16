import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test("experimental WhatsApp chrome stays hidden when the flag is off", async ({ page }) => {
  await prepareJourneysPage(page);
  await signInJourneysStaff(page);
  await page.goto("/admin");
  await expect(page.locator("[data-tulala-whatsapp-button]")).toHaveCount(0);
  await expect(page.locator("[data-tulala-whatsapp-drawer]")).toHaveCount(0);
});
