import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  requireClientLink,
  shot,
  test,
} from "../_harness";

const LADDER_HINTS = [
  /reply to the client/i,
  /add items/i,
  /send the offer|send offer/i,
  /follow up on the offer|follow up/i,
  /collect the deposit|deposit/i,
  /prepare the order|prepare/i,
  /collect the balance|balance/i,
  /confirm with talent|confirm/i,
  /hold expired/i,
  /payment issue/i,
  /nothing to do/i,
  /resolved|lost/i,
];

test.describe("QA 6.1 next-step ladder + realtime", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("sample inbox rows cover multiple next-step titles", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const seen = new Set<string>();
    for (const seg of ["needs action", "waiting", "all"]) {
      const tab = page
        .locator("[data-inbox-segments]")
        .getByRole("tab", { name: new RegExp(`^${seg}|${seg}`, "i") });
      if (await tab.count()) await tab.first().click();
      await page.waitForTimeout(600);
      const rows = page.locator("[data-inbox-row]");
      const n = Math.min(await rows.count(), 8);
      for (let i = 0; i < n; i++) {
        await rows.nth(i).click();
        await page.waitForSelector("[data-next-step]", { timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(500);
        const next = page.locator("[data-next-step]");
        if ((await next.count()) === 0) continue;
        const text = (await next.first().innerText()).replace(/\s+/g, " ").trim();
        if (text && text.toLowerCase() !== "next") seen.add(text);
      }
    }
    await shot(page, "admin-ladder-sample");
    expect(seen.size, `only saw: ${[...seen].join(" | ")}`).toBeGreaterThanOrEqual(2);

    let hits = 0;
    for (const hint of LADDER_HINTS) {
      if ([...seen].some((s) => hint.test(s))) hits += 1;
    }
    test.info().annotations.push({
      type: "ladder-hits",
      description: `${hits}/${LADDER_HINTS.length}: ${[...seen].slice(0, 8).join(" || ")}`,
    });

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("realtime: client reply appears on open admin thread within 15s", async ({
    page,
    context,
  }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const client = await requireClientLink(page, context);
    const body = `QA-RT ${Date.now()}`;
    const input = client.locator("[data-composer-input], textarea, [contenteditable='true']").first();
    await expect(input, "client composer missing on minted link").toBeVisible({ timeout: 20_000 });
    await input.fill(body);
    const send = client.locator("[data-composer-send], button").filter({ hasText: /send/i }).first();
    await expect(send, "client Send missing").toBeEnabled({ timeout: 10_000 });
    await send.click();
    await expect(
      page.getByText(body).first(),
      "admin thread did not receive client reply within 15s",
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, "admin-realtime-received");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
