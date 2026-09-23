import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  JOURNEYS_OWNER_EMAIL,
  openPlusTray,
  prepareJourneysPage,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";
import { JOURNEYS_B_OWNER_EMAIL } from "../../cases/_isolated-db";

/**
 * Items vocabulary — salon (Round 2).
 *
 * Workspace B is the nail-salon fixture on
 * `staging-qa-journeys-b.tulala.digital` with `industry_preset=salon_barber`.
 * Context panel Items must say "Services" (not Talent & services / Menu).
 */
const SALON_HOST =
  process.env.QA_SALON_HOST ?? "https://staging-qa-journeys-b.tulala.digital";
const SALON_OWNER = process.env.QA_SALON_OWNER_EMAIL ?? JOURNEYS_B_OWNER_EMAIL;
const SALON_INQUIRY =
  process.env.QA_SALON_INQUIRY_ID ?? "33330040-0000-4000-8000-0000000000b1";

test.describe("QA business vocabulary — salon", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    baseURL: SALON_HOST,
  });
  test.setTimeout(120_000);

  test("salon Messages Items label is Services (not Talent & services / Menu)", async ({
    page,
  }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/messages?inquiry=${SALON_INQUIRY}`, SALON_OWNER);
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });

    const itemsHeading = page
      .locator("[data-context-panel], [data-panel-items], [data-messages-v5]")
      .getByText(/^(Menu|Talent & services|Services|Order items|Items)$/i)
      .first();
    await expect(itemsHeading, "Items section heading missing in context panel").toBeVisible({
      timeout: 20_000,
    });
    const label = ((await itemsHeading.innerText()) || "").trim();
    expect(label, "salon fixture must not show Talent & services").not.toMatch(
      /Talent\s*&\s*services/i,
    );
    expect(label, "salon fixture must not show Menu").not.toMatch(/^Menu$/i);
    expect(label, `expected Services on salon; got: ${label}`).toMatch(/^Services$/i);
    await shot(page, "vocab-salon-panel");

    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const picker = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(picker, "Items picker did not open").toBeVisible({ timeout: 20_000 });
    const chips = ((await picker.locator("[data-items-chips]").innerText().catch(() => "")) || "")
      .replace(/\s+/g, " ");
    expect(chips, "salon picker must not show Talent category chips").not.toMatch(/Talent/i);
    await shot(page, "vocab-salon-picker");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
    void JOURNEYS_OWNER_EMAIL;
  });
});
