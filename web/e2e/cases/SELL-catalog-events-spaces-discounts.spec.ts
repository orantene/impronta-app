/**
 * SELL — the four Sell-rail admin surfaces are built but had never been
 * walked as one journey: Menu and catalog (`/admin/catalog`), Events
 * (`/admin/events`), Spaces (`/admin/spaces`, which redirects to the real
 * floor at `/admin/tables`) and Discounts (`/admin/discounts`).
 *
 * ONE STORY. Staff open each of the four pages in turn and see the
 * fixture's own real rows (no seeded-for-this-spec data, no empty state
 * standing in for content): the "House pizza" catalog item, the "QA Night"
 * event, table T2 on the floor. Then, on Discounts, a promo code is created
 * through the real form (`createTenantPromo`) and read back two ways: the
 * page's own table after a reload (the real server read, not the optimistic
 * client state a submit already shows) and a direct query against
 * `tenant_promo_codes` (nothing here is hand-inserted).
 *
 * Follows `_harness.ts`: the fixture prepares nothing this journey could
 * have created itself, the browser performs every business action, and a
 * login page or a branded 404 cannot pass.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  assertWorkspaceIdentity,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("SELL: catalog, events, spaces and discounts open with real rows; a discount code is created and read back", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const code = `SELL-${Date.now()}`;

  // ── 1. Menu and catalog — the fixture's own offering ─────────────────────
  await signInJourneysStaff(page, "/admin/catalog");
  await assertWorkspaceIdentity(page);
  await expect(page.getByText(/we could not load/i)).toHaveCount(0);
  await expect(page.getByText("House pizza").first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath("01-catalog.png"), fullPage: true });

  // ── 2. Events — the fixture's own event ───────────────────────────────────
  await signInJourneysStaff(page, "/admin/events");
  await assertWorkspaceIdentity(page);
  await expect(page.getByText(/we could not load/i)).toHaveCount(0);
  await expect(page.getByText(/qa night/i).first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath("02-events.png"), fullPage: true });

  // ── 3. Spaces — redirects to the real floor, the fixture's own table ─────
  await signInJourneysStaff(page, "/admin/spaces");
  await assertWorkspaceIdentity(page);
  await expect(page).toHaveURL(/\/admin\/tables$/);
  await expect(page.getByText(/we could not load the floor/i)).toHaveCount(0);
  await expect(page.getByText("T2", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath("03-spaces.png"), fullPage: true });

  // ── 4. Discounts — create a code through the real form, read it back ─────
  await signInJourneysStaff(page, "/admin/discounts");
  await assertWorkspaceIdentity(page);
  // W08: the page is titled as the board titles it; the Discounts rail row
  // is the door to it.
  await expect(page.getByRole("heading", { name: "Promotions & discount limits" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("04-discounts-before.png"), fullPage: true });

  // The form opens from `New promotion` (W08) and its inputs are addressed
  // by name inside the form's own scope: `getByLabel("Code")` also matches
  // the sidebar's nav buttons whose accessible names contain "code".
  await page.getByTestId("discounts-new").click();
  const form = page.getByTestId("discounts-form");
  await form.locator('input[name="code"]').fill(code);
  await form.locator('select[name="kind"]').selectOption("percent");
  await form.locator('input[name="value"]').fill("15");
  await form.getByRole("button", { name: "Add code" }).click();
  await expect(page.getByText("saved", { exact: true })).toBeVisible({ timeout: 20_000 });

  // The real server read, not the optimistic client state the submit call
  // already produced: reload and find the row in the table again.
  await page.reload();
  await expect(page.getByRole("cell", { name: code })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("row", { name: new RegExp(code) })).toContainText("15%");
  await page.screenshot({ path: testInfo.outputPath("05-discounts-after.png"), fullPage: true });

  // Ground truth: the row exists on the isolated database, not just on screen.
  const sb = isolatedService();
  const { data: promo, error } = await sb
    .from("tenant_promo_codes")
    .select("id, code, kind, value, is_active, tenant_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("code", code)
    .maybeSingle();
  expect(error, "tenant_promo_codes must be readable").toBeNull();
  expect(promo, "the created promo code must exist on qa-journeys").not.toBeNull();
  expect(promo?.kind).toBe("percent");
  expect(promo?.value).toBe(15);
  expect(promo?.is_active).toBe(true);
});
