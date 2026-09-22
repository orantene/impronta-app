import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  requireClientLink,
  sendPricedOffer,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.3 client deep", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("send offer then client Accept; assert offer card effect", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await sendPricedOffer(page);

    const client = await requireClientLink(page, context);
    const guard = attachConsoleGuard(client);
    await expect(client.locator("body")).toBeVisible();
    const body = await client.locator("body").innerText();
    expect(body).not.toMatch(/Offer sent to client\.|All approvals are complete\./);

    const accept = client.getByRole("button", { name: /^accept/i }).first();
    await expect(
      accept,
      "client Accept missing — offer card actions are the point of this spec",
    ).toBeVisible({ timeout: 20_000 });
    await shot(client, "client-offer-actions");
    await accept.click();
    await client.waitForTimeout(1500);
    await shot(client, "client-offer-accepted");

    const after = await client.locator("body").innerText();
    expect(
      /accept|confirm|pay|paid|waiting/i.test(after),
      "client link shows no post-accept state",
    ).toBeTruthy();

    await assertNoRawI18nKeys(client, "body");
    expect(guard.errors, guard.errors.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("minted client link ES and FR have no raw keys", async ({ page, context }) => {
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await sendPricedOffer(page);
    const client = await requireClientLink(page, context);
    const base = client.url().split("?")[0];
    for (const loc of ["es", "fr"]) {
      await client.goto(`${base}?lang=${loc}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(800);
      await assertNoRawI18nKeys(client, "body");
      const body = await client.locator("body").innerText();
      expect(body).not.toMatch(/dashboard\.messagesV5\./);
      expect(body).not.toMatch(/\{[a-zA-Z_]+\}/);
      await shot(client, `client-locale-${loc}`);
    }
  });
});
