/**
 * 2.7 Replace talent on a project (W48).
 * Refusal: unavailable talent → `talent_unavailable`, rendered in words.
 *
 * SEEDED: a confirmed project tomorrow with talent A on it, and a confirmed
 * talent booking for talent B over the same hours. Picking B is refused by
 * the engine; picking C moves the `booking_talent` row.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";
import { QA_TALENT_A, QA_TALENT_B, ensureHydrated, seedProject, seedTalentConflict } from "./_wire-seed";

skipUnlessFixture();

test("WIRE-2.7 Project › Team › Replace swaps booking_talent and refuses a busy person", async ({ page }) => {
  test.setTimeout(240_000);
  const project = await seedProject({ title: "WIRE-2.7 replace", status: "confirmed", talentId: QA_TALENT_A });
  const conflict = await seedTalentConflict({ talentId: QA_TALENT_B, startsAt: project.startsAt, endsAt: project.endsAt });
  try {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/projects/${project.bookingId}?tab=team`);
    await ensureHydrated(page, "[data-team-replace]");
    const replace = page.locator("[data-team-replace]").first();
    await expect(replace, "the assignment row carries Replace").toBeVisible({ timeout: 30_000 });
    await replace.click();
    const picker = page.locator("[data-team-replacement]");
    await expect(picker).toBeVisible({ timeout: 20_000 });

    // The busy person: the engine, not the picker, says no.
    await picker.selectOption(QA_TALENT_B);
    await page.locator("[data-team-replace-confirm]").click();
    const busy = page.locator("[data-talent-unavailable]");
    await expect(busy).toBeVisible({ timeout: 20_000 });
    await assertEnglishRefusal(page, WIRE_SENTENCE.talentUnavailable);

    // A free person moves the row.
    const options = await picker.locator("option").evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
    const free = options.find((v) => v !== QA_TALENT_B && v !== QA_TALENT_A);
    expect(free, "the roster needs a third person for the swap").toBeTruthy();
    await picker.selectOption(free!);
    await page.locator("[data-team-replace-confirm]").click();
    const sb = isolatedService();
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("booking_talent").select("talent_profile_id").eq("booking_id", project.bookingId).maybeSingle();
          return (data as { talent_profile_id: string } | null)?.talent_profile_id ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe(free);
  } finally {
    await conflict.cleanup();
    await project.cleanup();
  }
});
