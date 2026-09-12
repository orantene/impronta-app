/**
 * 2.1 New series + Generate sessions (W40/W10).
 * On this host the header actions still carry a reason (D-POS-18).
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";

skipUnlessFixture();

test("WIRE-2.1 series generate door shows its reason when disabled by design", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/appointments?view=series");
  await expect(page.getByTestId("appointments-tab-series")).toBeVisible({ timeout: 30_000 });
  const generate = page.getByRole("button", { name: /generate sessions/i });
  const create = page.getByRole("button", { name: /new series/i });
  await expect(generate.or(create).first()).toBeVisible();
  if (await generate.count()) {
    await expect(generate).toBeDisabled();
    await expect(generate).toHaveAttribute("title", /.+/);
  }
  if (await create.count()) {
    await expect(create).toBeDisabled();
    await expect(create).toHaveAttribute("title", /.+/);
  }
});
