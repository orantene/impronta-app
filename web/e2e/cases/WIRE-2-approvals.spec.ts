/**
 * 2.13 Approval request + role limit (W56/W22, Settings › Roles & limits).
 * Ground truth: a `role_limits` row from the matrix; an `approval_requests`
 * row decided from the inbox. Refusal: decide twice → the decided row's
 * buttons are gone (disabled-by-design) and the decision does not change.
 *
 * The "discount over the limit creates a request" half has no door on the
 * host (D-139: `assertRoleLimit` has no caller, `requestApprovalAction` no
 * screen), so the request row is SEEDED the way the engine writes it.
 */
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { openSettingsCard } from "./_wire";
import { QA_OWNER_USER, QA_VIEWER_USER } from "./_wire-seed";

skipUnlessFixture();

test("WIRE-2.13 Roles & limits writes a role limit; the inbox decides a request once", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  await sb.from("role_limits").delete().eq("tenant_id", JOURNEYS_TENANT_ID).eq("role", "manager").eq("action", "discount");
  const { data: req, error } = await sb
    .from("approval_requests")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      kind: "discount",
      subject_id: "00000000-0000-4000-8000-00000000d15c",
      requested_by: QA_VIEWER_USER,
      reason: "WIRE-2.13 seeded request",
      operation_key: `wire-2.13:${Date.now()}`,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const requestId = (req as { id: string }).id;
  try {
    await openSettingsCard(page, "Roles & limits", "roles-limits-card");
    const editor = page.getByTestId("role-limits-editor");
    await expect(editor).toBeVisible({ timeout: 20_000 });

    // The matrix cell writes on blur: Manual discount · Manager = $10.
    const cell = editor.getByLabel("Manual discount · Manager");
    await cell.fill("10");
    await cell.blur();
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("role_limits").select("limit_cents").eq("tenant_id", JOURNEYS_TENANT_ID).eq("role", "manager").eq("action", "discount").maybeSingle();
          return (data as { limit_cents: number } | null)?.limit_cents ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe(1000);

    // The inbox: the seeded request is open; Approve decides it once.
    const row = page.locator(`[data-approval-request="${requestId}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toHaveAttribute("data-decision", "open");
    await row.locator("[data-approval-approve]").click();
    await expect(row).toHaveAttribute("data-decision", "approved", { timeout: 20_000 });
    const { data: decided } = await sb.from("approval_requests").select("decision, decided_by, decided_at").eq("id", requestId).maybeSingle();
    expect((decided as { decision: string } | null)?.decision).toBe("approved");
    expect((decided as { decided_by: string } | null)?.decided_by).toBe(QA_OWNER_USER);
    expect((decided as { decided_at: string } | null)?.decided_at).toBeTruthy();

    // Decide twice: the decided row offers no button (disabled-by-design);
    // the engine's `already_decided` is unreachable from the screen.
    await expect(row.locator("[data-approval-approve]")).toHaveCount(0);
    await expect(row.locator("[data-approval-deny]")).toHaveCount(0);
    await expect(row.getByText(/^Approved · /)).toBeVisible();
    const { data: again } = await sb.from("approval_requests").select("decision, decided_at").eq("id", requestId).maybeSingle();
    expect((again as { decided_at: string }).decided_at).toBe((decided as { decided_at: string }).decided_at);
  } finally {
    await sb.from("approval_requests").delete().eq("id", requestId);
    await sb.from("role_limits").delete().eq("tenant_id", JOURNEYS_TENANT_ID).eq("role", "manager").eq("action", "discount");
  }
});
