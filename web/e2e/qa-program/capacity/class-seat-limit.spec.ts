import {
  fillMorningClassToCapacity,
  LAST_PLACE_CLASS_SESSION_ID,
  releaseLastPlaceClassSeat,
  releaseMorningClassSeats,
} from "../../cases/_isolated-db";
import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  prepareJourneysPage,
  shot,
  test,
} from "../_harness";

/**
 * Class capacity refusals (Round 2).
 *
 * 1) Last-place (units=1): storefront takes the seat → second guest sees sold out;
 *    Messages Items picker shows the class row busy/sold out.
 * 2) Morning class (units=12): SQL fill to 12 → storefront 13th refused with a sentence.
 */
test.describe("QA capacity — class seat limit", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("last place taken → storefront sold out + Messages Items busy", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY required to release/fill Last place pool before proof",
    );
    await releaseLastPlaceClassSeat();

    await prepareJourneysPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const board = page.locator("[data-builder-node-kind='session_picker']");
    await expect(board, "storefront Classes session_picker missing").toBeVisible({
      timeout: 30_000,
    });
    const lastPlace = board.locator(`input[name=session][value="${LAST_PLACE_CLASS_SESSION_ID}"]`);
    await expect(lastPlace, "Last place class radio missing — seed sessions").toBeEnabled({
      timeout: 20_000,
    });
    await lastPlace.check();
    const marker = `qa-cap-class-${Date.now()}@impronta.test`;
    await board.getByLabel(/^email$/i).fill(marker);
    await board.getByLabel(/^name$/i).fill("QA capacity class");
    await board.getByRole("button", { name: /take a seat/i }).click();
    await expect(board.locator("[data-session-picker=done]")).toBeVisible({ timeout: 30_000 });
    await shot(page, "cap-class-last-taken");

    await page.reload({ waitUntil: "domcontentloaded" });
    const after = page.locator("[data-builder-node-kind='session_picker']");
    await expect(
      after.locator(`input[name=session][value="${LAST_PLACE_CLASS_SESSION_ID}"]`),
      "Last place should be disabled after the only seat is taken",
    ).toBeDisabled({ timeout: 20_000 });
    await expect(
      after.getByText(/sold out/i).first(),
      "storefront must show sold-out sentence after last seat taken",
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, "cap-class-storefront-sold-out");

    // Messages Items picker must surface the same busy/sold-out state.
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const picker = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(picker, "Items picker did not open").toBeVisible({ timeout: 20_000 });
    const classesChip = picker.locator("[data-items-chips]").getByText(/^classes$/i).first();
    await expect(classesChip, "Classes category chip missing on restaurant catalog").toBeVisible({
      timeout: 15_000,
    });
    await classesChip.click();
    const busy = picker.locator("[data-items-row][data-availability='busy']").first();
    await expect(
      busy,
      "Messages Items picker has no busy class row after last seat taken",
    ).toBeVisible({ timeout: 20_000 });
    const sub = ((await busy.innerText()) || "").replace(/\s+/g, " ");
    expect(sub, `expected sold out / full in busy row; got: ${sub}`).toMatch(
      /sold out|full|no longer free/i,
    );
    await shot(page, "cap-class-messages-busy");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("morning class filled to 12 → 13th storefront seat refused", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY required to fill Morning class to capacity",
    );
    await fillMorningClassToCapacity();

    await prepareJourneysPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const board = page.locator("[data-builder-node-kind='session_picker']");
    await expect(board, "session_picker missing").toBeVisible({ timeout: 30_000 });
    const morning = board.locator('input[name=session]').filter({ has: page.locator("..") });
    // Prefer the Morning class radio by sibling label text.
    const morningRadio = board
      .locator("label")
      .filter({ hasText: /morning class/i })
      .locator("input[name=session]")
      .first();
    if (await morningRadio.count()) {
      const enabled = await morningRadio.isEnabled().catch(() => false);
      if (enabled) {
        await morningRadio.check();
        await board.getByLabel(/^email$/i).fill(`qa-cap-13th-${Date.now()}@impronta.test`);
        await board.getByLabel(/^name$/i).fill("QA 13th refused");
        await board.getByRole("button", { name: /take a seat/i }).click();
        await expect(
          board.locator("[data-session-picker=refusal], [role='alert']").or(board.getByText(/sold out|just taken|no longer free|not available/i)).first(),
          "13th Morning seat must refuse with a sentence (not crash, not silent success)",
        ).toBeVisible({ timeout: 30_000 });
      } else {
        await expect(
          board.getByText(/sold out/i).first(),
          "Morning class full must show sold out when radio disabled",
        ).toBeVisible({ timeout: 15_000 });
      }
    } else {
      await expect(
        board.getByText(/sold out/i).first(),
        "Morning class sold-out affordance missing after fill to 12",
      ).toBeVisible({ timeout: 20_000 });
    }
    await shot(page, "cap-class-13th-refused");
    await releaseMorningClassSeats();
    void morning;
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
