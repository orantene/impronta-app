/**
 * 2.9 Milestone amount + file upload (W47, Project › Milestones).
 * Ground truth: `booking_deliverables.amount_cents` and `file_path`.
 * No refusal path is named on the board; a non-number is not accepted by
 * the field, and the row stays.
 *
 * SEEDED: one milestone on a confirmed project that has a conversation
 * (the upload path signs a URL under the conversation's bucket prefix).
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

test("WIRE-2.9 Milestones: the amount lands as cents and a file lands as file_path", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const { data: project } = await sb
    .from("agency_bookings")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "confirmed")
    .not("source_inquiry_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(project, "failed-fixture: a confirmed project with a conversation").toBeTruthy();
  const projectId = (project as { id: string }).id;
  const { data: seeded, error } = await sb
    .from("booking_deliverables")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, booking_id: projectId, title: `WIRE milestone ${Date.now()}` })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const deliverableId = (seeded as { id: string }).id;
  const read = async () => {
    const { data } = await sb.from("booking_deliverables").select("amount_cents, file_path").eq("id", deliverableId).maybeSingle();
    return data as { amount_cents: number | null; file_path: string | null } | null;
  };
  try {
    await signInJourneysStaff(page, `/admin/projects/${projectId}?tab=milestones`);
    const row = page.locator(`[data-milestone-row="${deliverableId}"], [data-milestone="${deliverableId}"]`).first();
    const scope = (await row.count()) > 0 ? row : page;
    await scope.locator("[data-milestone-amount]").first().click();
    const input = scope.locator("[data-milestone-amount-input]").first();
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill("120");
    await input.press("Enter");
    await expect(scope.locator("[data-milestone-amount]").first()).toContainText("120", { timeout: 20_000 });
    await expect.poll(async () => Number((await read())?.amount_cents ?? 0), { timeout: 20_000 }).toBe(12000);

    const upload = scope.locator("[data-milestone-upload]").first();
    await expect(upload).toBeEnabled();
    const fileInput = scope.locator('input[type="file"]').first();
    await fileInput.setInputFiles({ name: "wire-2-9.txt", mimeType: "text/plain", buffer: Buffer.from("WIRE-2.9 milestone file") });
    await expect(scope.getByText("wire-2-9.txt", { exact: false }).first()).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => (await read())?.file_path ?? null, { timeout: 30_000 }).toMatch(/wire-2-9/);
  } finally {
    await sb.from("booking_deliverables").delete().eq("id", deliverableId);
  }
});
