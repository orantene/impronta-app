/**
 * 2.10 Archive / reopen project (W50).
 * Refusal: reopen a live project.
 *
 * SEEDED: one completed project (archivable) and one confirmed project (live).
 * The archive reason travels to `project_archive` and lands on the record;
 * the live project's Reopen option is refused in words on the close sheet.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService } from "./_isolated-db";
import { ensureHydrated, seedProject } from "./_wire-seed";

skipUnlessFixture();

/** The close sheet opens from More › Close this project… (the primary is the agreement on most records). */
async function openCloseSheet(page: import("@playwright/test").Page): Promise<void> {
  await ensureHydrated(page, "[data-project-more]");
  await page.locator("[data-project-more]").click();
  await page.locator("[data-project-menu-close]").click();
}

const REOPEN_ONLY_CLOSED = "Only for closed projects";

test("WIRE-2.10 Project › Close archives with a reason and refuses a live reopen", async ({ page }) => {
  test.setTimeout(240_000);
  const done = await seedProject({ title: "WIRE-2.10 archive", status: "completed", talentId: null });
  const live = await seedProject({ title: "WIRE-2.10 live", status: "confirmed", talentId: null });
  try {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/projects/${done.bookingId}`);
    await openCloseSheet(page);
    await page.locator("[data-project-close-option='archive']").click();
    const reason = page.locator("[data-archive-reason]");
    await expect(reason).toBeVisible({ timeout: 20_000 });
    await reason.fill("WIRE-2.10");
    await page.locator("[data-project-close-confirm='archive']").click();

    const sb = isolatedService();
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("agency_bookings").select("status, cancelled_reason").eq("id", done.bookingId).maybeSingle();
          const row = data as { status: string; cancelled_reason: string | null } | null;
          return row ? `${row.status}:${row.cancelled_reason ?? ""}` : null;
        },
        { timeout: 20_000 },
      )
      .toBe("archived:WIRE-2.10");

    // Reopen the archived one: status transitions back to confirmed (project_reopen).
    await page.goto(`/admin/projects/${done.bookingId}`);
    await openCloseSheet(page);
    const reopenDone = page.locator("[data-project-close-option='reopen']");
    await expect(reopenDone).toBeVisible({ timeout: 20_000 });
    await expect(reopenDone).toBeEnabled();
    await reopenDone.click();
    const reopenReason = page.locator("textarea").first();
    if (await reopenReason.isVisible().catch(() => false)) await reopenReason.fill("WIRE-2.10 reopened");
    await page.locator("[data-project-close-confirm='reopen']").click();
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("agency_bookings").select("status").eq("id", done.bookingId).maybeSingle();
          return (data as { status: string } | null)?.status ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe("confirmed");

    // A live project cannot be reopened: the option is refused, in words.
    await page.goto(`/admin/projects/${live.bookingId}`);
    await openCloseSheet(page);
    const reopen = page.locator("[data-project-close-option='reopen']");
    await expect(reopen).toBeVisible({ timeout: 20_000 });
    await expect(reopen).toBeDisabled();
    await expect(reopen).toContainText(REOPEN_ONLY_CLOSED);
  } finally {
    await done.cleanup();
    await live.cleanup();
  }
});
