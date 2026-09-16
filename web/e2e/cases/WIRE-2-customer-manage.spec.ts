/**
 * 2.6 Customer self-manage page (A07/A10/R04): `/manage/<token>` from the
 * staff panel's "Copy link" (a signed, single-action token). Cancel and
 * reschedule each land on the row. Reuse: once the booking is closed the
 * same link answers with the closed sentence and no live action — the token
 * cannot cancel twice (the engine answers `already`, nothing is written).
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { clickUntil } from "./_wire";

skipUnlessFixture();

async function seedAppointment(label: string) {
  const sb = isolatedService();
  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  startsAt.setUTCHours(15, 0, 0, 0);
  const { data, error } = await sb
    .from("agency_bookings")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      title: `WIRE manage ${label} ${Date.now()}`,
      status: "confirmed",
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 3600_000).toISOString(),
      currency_code: "USD",
      total_client_revenue: 60,
      contact_name: "WIRE client",
      contact_email: `wire-manage-${label}-${Date.now()}@impronta.test`,
      booking_sub_type: "service",
    })
    .select("id, starts_at")
    .single();
  if (error || !data) throw new Error(`seedAppointment: ${error?.message ?? "none"}`);
  return data as { id: string; starts_at: string };
}

/** Staff panel › "Copy link" › the signed `/manage/<token>` URL from the clipboard. */
async function copyManageLink(page: import("@playwright/test").Page, bookingId: string, action: "cancel" | "reschedule"): Promise<string> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const row = page.locator(`[data-appointment-row="${bookingId}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await clickUntil(row.getByRole("button").first(), page.getByTestId("appointment-panel"));
  await page.getByRole("button", { name: action === "cancel" ? "Link to cancel" : "Link to reschedule", exact: true }).click();
  await expect(page.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 20_000 });
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/manage\/[A-Za-z0-9_.-]+/);
  return url;
}

test("WIRE-2.6 /manage/<token> cancels once and reschedules once; a used link shows the closed booking", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const toCancel = await seedAppointment("cancel");
  const toMove = await seedAppointment("move");
  try {
    await signInJourneysStaff(page, "/admin/appointments?view=list");
    const cancelUrl = await copyManageLink(page, toCancel.id, "cancel");
    const moveUrl = await copyManageLink(page, toMove.id, "reschedule");

    // Cancel through the customer's page.
    await page.goto(cancelUrl);
    await expect(page.locator("[data-manage-state='open'][data-manage-action='cancel']")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-manage-reschedule]"), "the other action is off on a cancel link").toBeDisabled();
    await page.locator("[data-manage-cancel]").click();
    await page.locator("[data-manage-reason]").fill("WIRE-2.6 cannot make it");
    await page.locator("[data-manage-cancel-confirm]").click();
    await expect(page.locator("[data-manage-done='cancelled']")).toBeVisible({ timeout: 30_000 });
    const { data: cancelled } = await sb.from("agency_bookings").select("status, cancelled_reason").eq("id", toCancel.id).maybeSingle();
    expect((cancelled as { status: string } | null)?.status).toBe("cancelled");
    expect((cancelled as { cancelled_reason: string | null } | null)?.cancelled_reason).toContain("WIRE-2.6");

    // Reuse: the same link shows the closed booking, no live action, nothing written.
    await page.goto(cancelUrl);
    await expect(page.locator("[data-manage-status='closed']")).toHaveText("Closed", { timeout: 30_000 });
    await expect(page.locator("[data-manage-cancel]")).toBeDisabled();
    await expect(page.locator("[data-manage-cancel]")).toHaveAttribute("title", "This booking is closed.");
    await expect(page.locator("[data-manage-cancel-form]")).toHaveCount(0);
    const { data: again } = await sb.from("agency_bookings").select("status, updated_at").eq("id", toCancel.id).maybeSingle();
    expect((again as { status: string } | null)?.status).toBe("cancelled");

    // Reschedule through the customer's page.
    await page.goto(moveUrl);
    await expect(page.locator("[data-manage-state='open'][data-manage-action='reschedule']")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-manage-cancel]"), "the other action is off on a reschedule link").toBeDisabled();
    await page.locator("[data-manage-reschedule]").click();
    const newStart = new Date(new Date(toMove.starts_at).getTime() + 86_400_000);
    const local = `${newStart.toISOString().slice(0, 10)}T10:30`;
    await page.locator("[data-manage-new-time]").fill(local);
    await page.locator("[data-manage-reschedule-confirm]").click();
    await expect(page.locator("[data-manage-done='rescheduled']")).toBeVisible({ timeout: 30_000 });
    const { data: moved } = await sb.from("agency_bookings").select("starts_at").eq("id", toMove.id).maybeSingle();
    expect((moved as { starts_at: string } | null)?.starts_at).not.toBe(toMove.starts_at);
    expect(new Date((moved as { starts_at: string }).starts_at).toISOString().slice(0, 10)).toBe(newStart.toISOString().slice(0, 10));
  } finally {
    await sb.from("agency_bookings").delete().in("id", [toCancel.id, toMove.id]);
  }
});
