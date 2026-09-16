/**
 * 2.5 Cancel appointment (staff) with policy (W39 appointment panel).
 * Ground truth: `agency_bookings.status='cancelled'` with the reason, and the
 * refundable amount the policy answers. Refusal: a completed booking is
 * `not_cancellable` in the engine; the panel closes the door itself with its
 * reason sentence (disabled-by-design), and the row does not change.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { clickUntil } from "./_wire";

skipUnlessFixture();

async function seedAppointment(status: "confirmed" | "completed") {
  const sb = isolatedService();
  const startsAt = new Date(Date.now() + 2 * 86_400_000);
  startsAt.setUTCMinutes(0, 0, 0);
  const { data, error } = await sb
    .from("agency_bookings")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      title: `WIRE appt ${status} ${Date.now()}`,
      status,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 3600_000).toISOString(),
      currency_code: "USD",
      total_client_revenue: 80,
      contact_name: "WIRE client",
      contact_email: `wire-appt-${Date.now()}@impronta.test`,
      booking_sub_type: "service",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedAppointment: ${error?.message ?? "none"}`);
  return (data as { id: string }).id;
}

test("WIRE-2.5 staff cancels an appointment with a reason; a completed one is closed at the door", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const live = await seedAppointment("confirmed");
  const done = await seedAppointment("completed");
  try {
    await signInJourneysStaff(page, "/admin/appointments?view=list");
    const row = page.locator(`[data-appointment-row="${live}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await clickUntil(row.getByRole("button").first(), page.getByTestId("appointment-panel"));
    await page.getByTestId("appointment-cancel").click();
    const form = page.getByTestId("appointment-cancel-form");
    await expect(form).toBeVisible({ timeout: 20_000 });
    await form.getByRole("textbox").fill("WIRE-2.5 client asked");
    await form.getByRole("button", { name: "Cancel appointment", exact: true }).click();
    // Nothing was paid on this booking, so the policy answers nothing to refund.
    await expect(page.getByTestId("appointment-cancel-message")).toHaveText("Cancelled. Nothing to refund.", { timeout: 30_000 });
    const { data: after } = await sb.from("agency_bookings").select("status, cancelled_reason").eq("id", live).maybeSingle();
    expect((after as { status: string } | null)?.status).toBe("cancelled");
    expect((after as { cancelled_reason: string | null } | null)?.cancelled_reason).toContain("WIRE-2.5");

    const doneRow = page.locator(`[data-appointment-row="${done}"]`);
    await expect(doneRow).toBeVisible({ timeout: 30_000 });
    await clickUntil(doneRow.getByRole("button").first(), page.getByTestId("appointment-panel"));
    const door = page.getByTestId("appointment-cancel");
    await expect(door).toBeDisabled();
    await expect(door).toHaveAttribute("title", "This booking cannot be moved.");
    await expect(page.getByTestId("appointment-cancel-form")).toHaveCount(0);
    const { data: still } = await sb.from("agency_bookings").select("status").eq("id", done).maybeSingle();
    expect((still as { status: string } | null)?.status).toBe("completed");
  } finally {
    await sb.from("agency_bookings").delete().in("id", [live, done]);
  }
});
