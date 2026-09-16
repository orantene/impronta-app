/**
 * 2.13 Approval request + role limit (W56/W22, Settings › Roles & limits).
 * Ground truth: a `role_limits` row from the matrix; an `approval_requests`
 * row FILED BY THE APP (a real over-limit discount on the counter, through
 * `enforceRoleLimit` — D-139) and decided from the inbox. Refusal: decide
 * twice → the decided row's buttons are gone (disabled-by-design) and the
 * decision does not change.
 *
 * The unit lane (`lib/approvals/enforce.test.ts`) proves the same engine
 * call in isolation. This is the end-to-end half: `Manual discount · Owner`
 * (the signed-in fixture owner's own role) is set below a promo code's
 * value, the code is applied on the counter through the real UI door
 * (`DiscountSheet` → `posReprice`), and the request this test decides is
 * the one that write actually filed — nothing here inserts into
 * `approval_requests` directly.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
  openCounter,
  counterStartSale,
  counterAddItem,
  counterNameBuyer,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { openSettingsCard, latestOrderIdByUrl } from "./_wire";
import { QA_OWNER_USER } from "./_wire-seed";

skipUnlessFixture();

// House pizza, $18.00 flat (also used by WIRE-2.11). A fixed $15 promo code
// against it is $15 off a role limit of $10 — comfortably over, and not
// clamped by the subtotal.
const PROMO_VALUE_CENTS = 1500;
const ROLE_LIMIT_CENTS = 1000;

test("WIRE-2.13 an over-limit discount files a request the inbox decides once", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  await sb.from("role_limits").delete().eq("tenant_id", JOURNEYS_TENANT_ID).eq("role", "owner").eq("action", "discount");

  const promoCode = `WIRE213-${Date.now()}`;
  const { data: promo, error: promoErr } = await sb
    .from("tenant_promo_codes")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      code: promoCode,
      kind: "fixed",
      value: PROMO_VALUE_CENTS,
      currency: "USD",
      is_active: true,
    })
    .select("id")
    .single();
  expect(promoErr, promoErr?.message).toBeNull();
  const promoId = (promo as { id: string }).id;

  let customerId: string | null = null;
  let requestId: string | null = null;
  try {
    // ── Roles & limits: the matrix writes the limit for the ACTOR's own
    // role. The fixture owner (`signInJourneysStaff`'s default) is "owner",
    // so the cell that matters here is Owner, not Manager.
    await openSettingsCard(page, "Roles & limits", "roles-limits-card");
    const editor = page.getByTestId("role-limits-editor");
    await expect(editor).toBeVisible({ timeout: 20_000 });
    const cell = editor.getByLabel("Manual discount · Owner");
    await cell.fill("10");
    await cell.blur();
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("role_limits").select("limit_cents").eq("tenant_id", JOURNEYS_TENANT_ID).eq("role", "owner").eq("action", "discount").maybeSingle();
          return (data as { limit_cents: number } | null)?.limit_cents ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe(ROLE_LIMIT_CENTS);

    // ── The counter: a real sale, a named buyer (a code needs one —
    // `promo_needs_customer`), then the code on the Discount sheet. This is
    // `posReprice` → `repriceAndValidate` → `resolvePromo` →
    // `enforceRoleLimit`, the exact path `enforce.test.ts` exercises in
    // isolation.
    await openCounter(page);
    await counterStartSale(page);
    await counterAddItem(page, "House pizza");
    const marker = `wire-2.13+${Date.now()}@impronta.test`;
    await counterNameBuyer(page, marker);
    const orderId = await latestOrderIdByUrl(page);
    const { data: orderRow } = await sb.from("orders").select("customer_id").eq("id", orderId).maybeSingle();
    customerId = (orderRow as { customer_id: string | null } | null)?.customer_id ?? null;

    await page.locator("[data-pos-open-discount]").click();
    await expect(page.locator("[data-pos-sheet='discount']")).toBeVisible({ timeout: 20_000 });
    await page.locator("[data-pos-sheet='discount'] input").first().fill(promoCode);
    await page.locator("[data-pos-discount-apply]").click();
    await expect(page.locator("[data-pos-discount-refused='overLimit']")).toBeVisible({ timeout: 20_000 });

    // Ground truth: the app, not this test, filed the request.
    const findRequest = async () => {
      const { data } = await sb
        .from("approval_requests")
        .select("id, kind, subject_id, requested_by, reason, decision")
        .eq("tenant_id", JOURNEYS_TENANT_ID)
        .eq("kind", "discount")
        .eq("subject_id", orderId)
        .maybeSingle();
      return data as { id: string; kind: string; subject_id: string; requested_by: string; reason: string | null; decision: string | null } | null;
    };
    await expect.poll(async () => (await findRequest())?.id ?? null, { timeout: 20_000 }).not.toBeNull();
    const filed = await findRequest();
    requestId = (filed as { id: string }).id;
    expect(filed?.kind).toBe("discount");
    expect(filed?.subject_id).toBe(orderId);
    expect(filed?.requested_by).toBe(QA_OWNER_USER);
    expect(filed?.reason).toContain(`${PROMO_VALUE_CENTS} cents`);
    expect(filed?.decision).toBeNull();

    // ── The inbox: the request the counter just filed is open; Approve
    // decides it once.
    await openSettingsCard(page, "Roles & limits", "roles-limits-card");
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
    if (requestId) await sb.from("approval_requests").delete().eq("id", requestId);
    await sb.from("role_limits").delete().eq("tenant_id", JOURNEYS_TENANT_ID).eq("role", "owner").eq("action", "discount");
    await sb.from("tenant_promo_codes").delete().eq("id", promoId);
    if (customerId) await sb.from("customers").delete().eq("id", customerId);
  }
});
