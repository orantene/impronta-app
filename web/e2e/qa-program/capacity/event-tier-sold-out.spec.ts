import {
  latestTicketPickerNight,
  QA_NIGHT_DOOR_POOL_ID,
  QA_NIGHT_SLUG,
  releaseQaNightDoorSeat,
} from "../../cases/_isolated-db";
import {
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
 * Event ticket tier sold out (Round 2).
 * Door tier pool units_total=1: first guest holds → second sees sold out;
 * Messages Items Tickets row shows busy/sold out.
 */
test.describe("QA capacity — event tier sold out", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("door tier held → second guest sold out + Messages Tickets busy", async ({
    page,
    context,
  }) => {
    const { errors } = attachConsoleGuard(page);
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY required to release door tier before proof",
    );
    await releaseQaNightDoorSeat();

    await prepareJourneysPage(page);
    await page.goto(`/events/${QA_NIGHT_SLUG}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const picker = page.locator("[data-ticket-picker=root]");
    await expect(picker, "ticket picker missing on /events/qa-night").toBeVisible({
      timeout: 30_000,
    });
    await picker.locator("input[name=night]").first().check();
    await picker
      .locator("label")
      .filter({ hasText: /paid admission/i })
      .locator("input[name=tier]")
      .check();
    const marker = `qa-cap-door-${Date.now()}@impronta.test`;
    await picker.locator("input[type=email]").fill(marker);
    await picker.locator("input[autocomplete=name]").fill("QA door hold");
    await picker.locator("input[name=payHow]").last().check();
    await picker.getByRole("button", { name: /hold my seats, pay at the door/i }).click();
    await expect(picker.locator("[data-ticket-picker=held]")).toBeVisible({ timeout: 45_000 });
    const held = await latestTicketPickerNight(marker);
    expect(held, "door hold order missing").not.toBeNull();
    expect(held?.poolId).toBe(QA_NIGHT_DOOR_POOL_ID);
    await shot(page, "cap-event-door-held");

    const pageB = await context.newPage();
    const guardB = attachConsoleGuard(pageB);
    await prepareJourneysPage(pageB);
    await pageB.goto(`/events/${QA_NIGHT_SLUG}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const pickerB = pageB.locator("[data-ticket-picker=root]");
    await expect(pickerB).toBeVisible({ timeout: 30_000 });
    await pickerB.locator("input[name=night]").first().check();
    await pickerB
      .locator("label")
      .filter({ hasText: /paid admission/i })
      .locator("input[name=tier]")
      .check();
    await pickerB.locator("input[type=email]").fill(`qa-cap-door-b-${Date.now()}@impronta.test`);
    await pickerB.locator("input[autocomplete=name]").fill("QA door loser");
    await pickerB.locator("input[name=payHow]").last().check();
    await pickerB.getByRole("button", { name: /hold my seats, pay at the door/i }).click();
    await expect(
      pickerB.locator("[data-ticket-picker=refusal]"),
      "second door-tier guest must see sold-out refusal sentence",
    ).toContainText(/sold out/i, { timeout: 30_000 });
    await shot(pageB, "cap-event-door-sold-out");
    expect(guardB.errors, guardB.errors.join("\n")).toEqual([]);
    await pageB.close();

    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const items = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(items, "Items picker did not open").toBeVisible({ timeout: 20_000 });
    const ticketsChip = items.locator("[data-items-chips]").getByText(/^tickets$/i).first();
    await expect(ticketsChip, "Tickets category chip missing").toBeVisible({ timeout: 15_000 });
    await ticketsChip.click();
    const busy = items.locator("[data-items-row][data-availability='busy']").first();
    await expect(
      busy,
      "Messages Tickets row not busy after door tier sold out",
    ).toBeVisible({ timeout: 20_000 });
    const sub = ((await busy.innerText()) || "").replace(/\s+/g, " ");
    expect(sub, `expected sold out in Tickets busy row; got: ${sub}`).toMatch(/sold out|full/i);
    await shot(page, "cap-event-messages-tickets-busy");

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
