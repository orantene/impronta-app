/**
 * 3.6 Guest QR: the bill screen (Q05) and the closed-visit refusal.
 * Refusal: closed visit → visit_closed.
 *
 * SEEDED: an open visit. `/visit/<token>/bill` shows the bill; once the
 * floor closes the visit the same URL answers with the engine's sentence.
 * Browse/add/submit stays on `WIRE-3-guest-qr` ordering with the menu
 * fixture and is asserted in `C07-bar`.
 */
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";
import { isolatedService } from "./_isolated-db";
import { seedVisit } from "./_wire-seed";

skipUnlessFixture();

test("WIRE-3.6 guest QR: bill and the closed-visit refusal; then browse, add, submit, pay my share on the phone pages", async ({ page }) => {
  test.setTimeout(300_000);
  const visit = await seedVisit();
  const sb = isolatedService();
  try {
    await prepareJourneysPage(page);
    // The bill (Q05) on an open visit.
    await page.goto(`/visit/${visit.token}/bill`);
    await expect(page.locator("[data-visit-screen='bill'] [data-visit-bill]")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /pay my share/i })).toHaveAttribute("href", `/visit/${visit.token}/share`);

    // Browse and add on the phone menu (Q02–Q04), then submit.
    await page.goto(`/visit/${visit.token}/menu`);
    const add = page.locator('[data-testid^="guest-add-"]').first();
    await expect(add, "the guest menu must render (D-141: the page is a 500)").toBeVisible({ timeout: 30_000 });
    await add.click();
    await page.getByTestId("guest-submit").click();
    await expect(page.getByText("The team accepted your order. If something runs out we will suggest here before we change anything.", { exact: true })).toBeVisible({ timeout: 30_000 });
    let orderId = "";
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("orders").select("id, source_channel").eq("visit_id", visit.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          orderId = (data as { id: string } | null)?.id ?? "";
          return (data as { source_channel: string } | null)?.source_channel ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe("guest_qr");
    await expect.poll(async () => (await sb.from("preparation_tickets").select("id", { count: "exact", head: true }).eq("order_id", orderId)).count ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);

    // Pay my share by item (Q06): a payment link for the line; the last share
    // cannot be paid twice (one wins, the other reads the refusal).
    await page.goto(`/visit/${visit.token}/share`);
    const line = page.locator('[data-testid^="guest-line-"]').first();
    await expect(line).toBeVisible({ timeout: 30_000 });
    await line.click();
    await page.getByTestId("guest-pay-share").click();
    await expect(page).toHaveURL(/\/pay\//, { timeout: 30_000 });
    const { data: link } = await sb.from("payment_links").select("status, amount_cents").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    expect((link as { status: string } | null)?.status).toBe("open");
    await page.goto(`/visit/${visit.token}/share`);
    await expect(page.locator('[data-testid^="guest-line-"]').first()).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-testid^="guest-line-"]').first().click();
    await page.getByTestId("guest-pay-share").click();
    await expect(page.getByRole("alert")).toHaveText(/^(That share is already paid\.|That is more than what is still owed\.)$/, { timeout: 30_000 });
    const { count: links } = await sb.from("payment_links").select("id", { count: "exact", head: true }).eq("order_id", orderId).eq("status", "open");
    expect(links).toBe(1);
  } finally {
    await visit.cleanup();
  }
});

test("WIRE-3.6 a closed visit's bill answers with the engine's sentence", async ({ page }) => {
  test.setTimeout(120_000);
  const visit = await seedVisit();
  try {
    await prepareJourneysPage(page);
    await visit.close();
    await page.goto(`/visit/${visit.token}/bill`);
    await assertEnglishRefusal(page, WIRE_SENTENCE.visitClosed);
    await expect(page.locator("[data-visit-bill]")).toHaveCount(0);
  } finally {
    await visit.cleanup();
  }
});
