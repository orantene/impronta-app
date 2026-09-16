/**
 * 2.2 Substitute instructor with this/future/series scope (W39 panel).
 * Ground truth: `sessions.instructor_user_id` changes on exactly the scoped
 * sessions. Refusal: the engine has no `past` (contract §2; the board lists
 * only sessions from now on), so the reachable refusal is a cancelled
 * session → `already_cancelled`, with no row changed.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService } from "./_isolated-db";
import { clickUntil } from "./_wire";
import { QA_OWNER_USER, QA_VIEWER_USER, seedSeries } from "./_wire-seed";

skipUnlessFixture();

async function openSessionPanel(page: import("@playwright/test").Page, sessionId: string) {
  const row = page.locator(`[data-session-row="${sessionId}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await clickUntil(row.getByRole("button").first(), page.getByTestId("session-panel"));
}

test("WIRE-2.2 substitute with scope Future changes exactly the later scheduled sessions; a cancelled one is refused", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const seed = await seedSeries({ title: `WIRE sub ${Date.now()}`, statuses: ["scheduled", "scheduled", "scheduled", "cancelled"], instructorUserId: QA_OWNER_USER });
  const [s1, s2, s3, s4] = seed.sessionIds;
  const readInstructors = async () => {
    const { data } = await sb.from("sessions").select("id, instructor_user_id").in("id", seed.sessionIds);
    return Object.fromEntries(((data ?? []) as { id: string; instructor_user_id: string | null }[]).map((r) => [r.id, r.instructor_user_id]));
  };
  try {
    await signInJourneysStaff(page, "/admin/appointments?view=sessions");
    await openSessionPanel(page, s2);
    await page.getByRole("button", { name: "Future sessions", exact: true }).click();
    await page.getByTestId("session-substitute").click();
    const form = page.getByTestId("session-substitute-form");
    await expect(form).toBeVisible({ timeout: 20_000 });
    await form.getByTestId("session-substitute-select").selectOption(QA_VIEWER_USER);
    await form.getByRole("button", { name: "Set instructor" }).click();
    await expect(page.getByTestId("session-substitute-message")).toHaveText("Instructor set on 2 session(s).", { timeout: 30_000 });
    const after = await readInstructors();
    expect(after[s1], "earlier session untouched").toBe(QA_OWNER_USER);
    expect(after[s2]).toBe(QA_VIEWER_USER);
    expect(after[s3]).toBe(QA_VIEWER_USER);
    expect(after[s4], "cancelled session untouched").toBe(QA_OWNER_USER);

    // Scope This on s1: only s1.
    await openSessionPanel(page, s1);
    await page.getByRole("button", { name: "This session", exact: true }).click();
    await page.getByTestId("session-substitute").click();
    await page.getByTestId("session-substitute-form").getByTestId("session-substitute-select").selectOption(QA_VIEWER_USER);
    await page.getByTestId("session-substitute-form").getByRole("button", { name: "Set instructor" }).click();
    await expect(page.getByTestId("session-substitute-message")).toHaveText("Instructor set on 1 session(s).", { timeout: 30_000 });
    expect((await readInstructors())[s1]).toBe(QA_VIEWER_USER);

    // Refusal: the cancelled session. Disabled-by-design at the door — the
    // panel switches Substitute off with its reason sentence, so the engine's
    // `already_cancelled` is unreachable from the screen. The row stays.
    await openSessionPanel(page, s4);
    const door = page.getByTestId("session-substitute");
    await expect(door).toBeDisabled();
    await expect(door).toHaveAttribute("title", "This session is no longer on sale, so its places cannot change.");
    await expect(page.getByTestId("session-substitute-form")).toHaveCount(0);
    expect((await readInstructors())[s4]).toBe(QA_OWNER_USER);
  } finally {
    await seed.cleanup();
  }
});
