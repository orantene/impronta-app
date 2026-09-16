/**
 * 2.3 Move participant (W39).
 * Refusal: full target → sold_out.
 *
 * SEEDED: a valid admission on a future session of the fixture series, and a
 * sibling whose pool is zeroed so it reads `full`. The move to the open
 * sibling lands on `admissions.session_id`; the move to the full one is
 * refused by the engine in words.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";
import { ensureHydrated, seedSeriesMove } from "./_wire-seed";

skipUnlessFixture();

async function openSession(page: import("@playwright/test").Page, sessionId: string): Promise<void> {
  const row = page.locator(`[data-session-row="${sessionId}"]`);
  // The table pages by week; walk forward until the seeded session is listed.
  for (let hop = 0; hop < 6 && (await row.count()) === 0; hop += 1) {
    await page.getByRole("button", { name: /later/i }).first().click();
    await page.waitForTimeout(400);
  }
  await expect(row, "the seeded session must be listed").toBeVisible({ timeout: 20_000 });
  await row.click();
}

test("WIRE-2.3 move a participant and refuse a full target", async ({ page }) => {
  test.setTimeout(240_000);
  const seeded = await seedSeriesMove();
  try {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/appointments?view=sessions");
    const startMove = async () => {
      await page.goto("/admin/appointments?view=sessions");
      await ensureHydrated(page, "[data-session-row]");
      await openSession(page, seeded.fromSessionId);
      await page.getByTestId("session-participant-move").first().click();
      const select = page.getByTestId("session-move-select");
      await expect(select).toBeVisible({ timeout: 20_000 });
      return select;
    };
    const sb = isolatedService();
    const sessionOf = async () => {
      const { data } = await sb.from("admissions").select("session_id").eq("id", seeded.admissionId).maybeSingle();
      return (data as { session_id: string } | null)?.session_id ?? null;
    };

    // The full target first: refused in words, nothing moves.
    let select = await startMove();
    await expect(select.locator(`[data-move-target="${seeded.openSessionId}"]`)).toHaveCount(1);
    const fullOption = select.locator(`[data-move-target="${seeded.fullSessionId}"]`);
    await expect(fullOption).toHaveAttribute("data-move-target-full", "");
    await select.selectOption(seeded.fullSessionId);
    await page.getByTestId("session-move-form").getByRole("button", { name: /move/i }).last().click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.soldOut);
    expect(await sessionOf()).toBe(seeded.fromSessionId);

    // Then the open target lands. A fresh form, so the refused state is not carried.
    select = await startMove();
    await select.selectOption(seeded.openSessionId);
    await page.getByTestId("session-move-form").getByRole("button", { name: /move/i }).last().click();
    await expect(page.getByTestId("session-move-message")).toBeVisible({ timeout: 20_000 });
    await expect.poll(sessionOf, { timeout: 20_000 }).toBe(seeded.openSessionId);
  } finally {
    await seeded.cleanup();
  }
});
