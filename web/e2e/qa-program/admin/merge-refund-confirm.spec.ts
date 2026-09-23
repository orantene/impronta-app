import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  shot,
  test,
} from "../_harness";
import { isolatedService } from "../../cases/_isolated-db";

/**
 * Merge / refund / confirm (Round 2) — required asserts (soft voids removed).
 *
 * Seeds (journeys isolated DB):
 * - Confirm: race-B inquiry with times Confirm door (D-MSG-310)
 * - Merge: two unpaid inquiries sharing email/phone + customers row
 * - Refund: paid conversation_records row
 */
const RACE_B = process.env.QA_DOUBLE_BOOK_B ?? "08f2a0b7-1312-4f17-9ec4-f154aaa2e502";
const MERGE_A = process.env.QA_MERGE_A ?? "17a9ee6b-97d6-43b1-a136-9f99741b9d37";
const MERGE_B = process.env.QA_MERGE_B ?? "89c70b9a-ca33-417e-b9ec-a26863e56a28";
const JOURNEYS_TENANT = "33333333-3333-4333-8333-333333333333";
/** Early fixture customer — stays inside messagingMatchCustomers' un-ordered limit(200). */
const MERGE_CUSTOMER_EMAIL = "qa-journeys-customer@impronta.test";
const MERGE_CUSTOMER_PHONE = "+525555019999";

async function ensureMergePairSeeded(): Promise<{ name: string; email: string }> {
  const sb = isolatedService();
  const now = new Date().toISOString();
  // Until D-MSG-336 ships on the QA host, matchCustomers only sees an
  // unordered limit(200). Prefer a customer already in that window.
  const { data: window } = await sb
    .from("customers")
    .select("id, email, phone_e164, display_name")
    .eq("tenant_id", JOURNEYS_TENANT)
    .limit(200);
  let cust =
    (window ?? []).find((c) => (c.email || "").toLowerCase() === MERGE_CUSTOMER_EMAIL) ??
    (window ?? []).find((c) => !!(c.email && String(c.email).includes("@"))) ??
    null;
  if (!cust) {
    const { data: early } = await sb
      .from("customers")
      .select("id, email, phone_e164, display_name")
      .eq("tenant_id", JOURNEYS_TENANT)
      .eq("email", MERGE_CUSTOMER_EMAIL)
      .maybeSingle();
    cust = early;
  }
  if (!cust?.email) throw new Error("no customers row available to seed merge pair");
  const email = String(cust.email);
  const phone = cust.phone_e164 || MERGE_CUSTOMER_PHONE;
  const name = (cust.display_name && String(cust.display_name).trim()) || "QA Merge Twin";
  if (!cust.phone_e164) {
    await sb.from("customers").update({ phone_e164: phone }).eq("id", cust.id);
  }
  for (const id of [MERGE_A, MERGE_B]) {
    await sb
      .from("inquiries")
      .update({
        contact_email: email,
        contact_phone: phone,
        contact_name: name,
        opportunity_state: null,
        conversation_state: "needs_reply",
        updated_at: now,
        last_customer_message_at: now,
      })
      .eq("id", id);
    await sb.from("conversation_identity").delete().eq("inquiry_id", id);
  }
  return { name, email };
}

test.describe("QA merge / refund / confirm — required", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("Confirm door opens Confirm sheet on race-B", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", RACE_B);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    const timesConfirm = page.locator('[data-times-action="confirm"]').first();
    await expect(
      timesConfirm,
      "Confirm door missing on race-B — seed picked professional_times (D-MSG-310)",
    ).toBeVisible({ timeout: 20_000 });
    await timesConfirm.click();
    await expect(page.locator("[data-confirm-sheet]").first(), "Confirm sheet did not open").toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "admin-confirm-required");
    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Merge card appears for seeded duplicate pair and Merge clears it", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY required to seed merge pair");
    const seeded = await ensureMergePairSeeded();

    await openAdminMessages(page);
    const allTab = page.locator("[data-inbox-segments]").getByRole("tab", { name: /all/i });
    if (await allTab.isVisible().catch(() => false)) await allTab.click();

    // Both twins must be in the loaded inbox BEFORE opening a thread —
    // MessagesV5Shell's duplicate effect does not re-run when rows arrive
    // after essentials (D-MSG-336).
    const twinA = page.locator(`[data-inbox-row="${MERGE_A}"]`);
    const twinB = page.locator(`[data-inbox-row="${MERGE_B}"]`);
    await expect(twinA, `merge twin A missing (${seeded.email})`).toBeVisible({ timeout: 30_000 });
    await expect(twinB, `merge twin B missing (${seeded.email})`).toBeVisible({ timeout: 30_000 });
    await twinA.click();
    await awaitHydrated(page);

    const mergeCard = page.locator('[data-card="merge"]').first();
    await expect(
      mergeCard,
      "Same person? merge card missing — need customer match + other open twin in inbox",
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "admin-merge-card-required");

    const mergeInto = mergeCard.getByText(/merge into/i).first();
    await expect(mergeInto, "Merge into option missing").toBeVisible({ timeout: 10_000 });
    await mergeInto.click();
    await expect(mergeCard, "merge card must clear after Merge into").toHaveCount(0, {
      timeout: 20_000,
    });
    await shot(page, "admin-merge-done-required");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Paid thread shows a Paid payment card (refund door seam D-MSG-335)", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY required to find paid inquiry");
    const sb = isolatedService();
    const { data: paidRec } = await sb
      .from("conversation_records")
      .select("inquiry_id")
      .eq("tenant_id", JOURNEYS_TENANT)
      .eq("payment_state", "paid")
      .not("inquiry_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const paidInquiry = (paidRec as { inquiry_id?: string } | null)?.inquiry_id;
    expect(paidInquiry, "no paid conversation_records on journeys").toBeTruthy();

    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", paidInquiry!);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    await expect(
      page.locator('[data-card="payment"]').filter({ hasText: /paid/i }).first(),
      "Paid payment card missing on paid thread",
    ).toBeVisible({ timeout: 20_000 });
    // D-MSG-335: CancelRefundSheet is registered, but NextStep still maps
    // refund/cancel_record to "coming" and the Plus tray has no cancel key —
    // no staff Refund button is wired on paid cards today. Money-perm covers
    // the permission gate when a door is shown.
    await shot(page, "admin-paid-card-required");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
