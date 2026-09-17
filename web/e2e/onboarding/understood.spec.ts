/**
 * Phase 3 · the understood card, the questions and "Ready to build".
 *
 * No model and no KV on this stack: the AI path degrades to the short form
 * (asserted first), and the three fixtures are exercised by seeding their
 * facts onto a signed-in user's brief (isolated DB only).
 */
import { evidence, expect, openHome, test, answerBasics } from "./_module";
import { devSignIn, ensureUser, loadFacts, seedBrief } from "./_seed";

const openModule = async (page: Parameters<typeof openHome>[0]) => {
  await page.getByRole("button", { name: /Sell your work/ }).first().click();
  const cont = page.getByTestId("onb-resume-continue");
  await expect(cont).toBeVisible({ timeout: 15_000 });
  await cont.click();
};

test.describe("onboarding · understanding", () => {
  test("no model reachable: the card says so and the short form fills the essentials", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: /Sell your work/ }).first().click();
    await page.getByTestId("onb-sentence").fill("I clean houses in Playa del Carmen, Monday to Saturday.");
    await page.getByTestId("onb-send").click();
    await page.getByTestId("onb-confirm-send").click();
    await expect(page.getByTestId("onb-understood")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("onb-error")).toContainText(/couldn't read your words|short questions/);
    await expect(page.getByTestId("onb-path")).toContainText(/Your own page/);
    await expect(page.getByTestId("onb-accept")).toHaveText(/Looks right · 3 questions/);
    await page.getByTestId("onb-accept").click();
    await expect(page.getByTestId("onb-question-basics")).toBeVisible();
    await answerBasics(page, "House cleaner", "Playa del Carmen");
    await page.getByTestId("onb-next").click();
    await expect(page.getByTestId("onb-question-name")).toBeVisible();
    await page.getByTestId("onb-name-input").fill("Rosa");
    await page.getByTestId("onb-next").click();
    await expect(page.getByTestId("onb-question-services")).toBeVisible();
    await page.getByTestId("onb-service-0").fill("House cleaning");
    await page.getByTestId("onb-service-1").fill("Deep cleaning");
    await page.getByTestId("onb-next").click();
    await expect(page.getByTestId("onb-ready")).toBeVisible();
    await expect(page.getByTestId("onb-ready-facts")).toContainText("Rosa");
    await expect(page.getByTestId("onb-ready-facts")).toContainText("House cleaning · Deep cleaning");
    await expect(page.getByTestId("onb-build")).toHaveText(/Save my page/);
    await expect(page.getByTestId("onb-link-card")).toHaveCount(0);
    await evidence(page, "13-ready-talent");
  });

  test("Mariana: both, one question; inline edit; hours + WhatsApp; link available", async ({ page }) => {
    const userId = await ensureUser("qa-onb-mariana@impronta.test");
    const briefId = await seedBrief({ userId, fixture: "mariana" });
    await devSignIn(page, "qa-onb-mariana@impronta.test");
    await openHome(page);
    await openModule(page);
    await expect(page.getByTestId("onb-understood")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("onb-path")).toContainText(/The business and your own page/);
    await expect(page.getByTestId("onb-line-businessName")).toContainText("Uñas Mariana");
    await expect(page.getByTestId("onb-line-businessName")).toHaveAttribute("data-status", "assumed");
    await expect(page.getByTestId("onb-line-hours")).toHaveAttribute("data-status", "missing");
    await expect(page.getByTestId("onb-line-whatsapp")).toHaveAttribute("data-status", "missing");
    await expect(page.getByTestId("onb-line-logo")).toHaveAttribute("data-status", "later");
    await expect(page.getByTestId("onb-accept")).toHaveText(/Looks right · 1 question/);
    await evidence(page, "10-understood-mariana");

    await page.getByTestId("onb-line-city").getByRole("button").click();
    await page.getByTestId("onb-edit-input").fill("Tulum, Quintana Roo");
    await page.getByTestId("onb-edit-save").click();
    await expect(page.getByTestId("onb-line-city")).toHaveAttribute("data-status", "known");
    await expect(page.getByTestId("onb-line-city")).toContainText("Tulum, Quintana Roo");

    await page.getByTestId("onb-accept").click();
    await expect(page.getByTestId("onb-question-two_quick_things")).toBeVisible();
    await evidence(page, "11-two-quick-things");
    await page.getByTestId("onb-hours-mon_sat_9_7").click();
    await page.getByTestId("onb-whatsapp-input").fill("998 123 4567");
    await page.getByTestId("onb-next").click();
    await expect(page.getByTestId("onb-error")).toContainText(/country code/);
    await page.getByTestId("onb-whatsapp-input").fill("+52 998 123 4567");
    await page.getByTestId("onb-next").click();
    await expect(page.getByTestId("onb-ready")).toBeVisible();
    await expect(page.getByTestId("onb-link-value")).toContainText("unas-mariana.tulala.digital");
    // The check must return a verdict. On a branch where an earlier build run
    // already holds `unas-mariana`, the verdict is "taken" with alternatives;
    // taking the first one is the same path a person takes.
    await expect(page.getByTestId("onb-link-available").or(page.getByTestId("onb-link-taken"))).toBeVisible({ timeout: 15_000 });
    if (await page.getByTestId("onb-link-taken").isVisible()) {
      await page.getByTestId("onb-link-suggestion").first().click();
      await expect(page.getByTestId("onb-link-available")).toBeVisible({ timeout: 15_000 });
    }
    await expect(page.getByTestId("onb-build")).toBeEnabled();
    await evidence(page, "12-ready-business");

    const facts = await loadFacts(briefId);
    expect(facts["presence.whatsapp"]).toMatchObject({ fact_value: "+529981234567", source: "user_stated", status: "confirmed" });
    expect(facts["business.hours"]).toMatchObject({ fact_value: ["Mon-Sat 09:00-19:00"] });
    expect(facts["person.city"]).toMatchObject({ fact_value: "Tulum, Quintana Roo", source: "user_stated" });

    await page.getByTestId("onb-link-change").click();
    await page.getByTestId("onb-link-input").fill("qa-journeys");
    await page.getByTestId("onb-link-save").click();
    await expect(page.getByTestId("onb-link-taken")).toBeVisible();
    await expect(page.getByTestId("onb-link-suggestion").first()).toBeVisible();
    await expect(page.getByTestId("onb-build")).toBeDisabled();
  });

  test("El Paisa from a link: everything found, no questions, straight to Ready", async ({ page }) => {
    const userId = await ensureUser("qa-onb-paisa@impronta.test");
    await seedBrief({ userId, fixture: "el-paisa" });
    await devSignIn(page, "qa-onb-paisa@impronta.test");
    await openHome(page);
    await openModule(page);
    await expect(page.getByTestId("onb-understood")).toContainText(/Here is what I found/);
    await expect(page.getByTestId("onb-path")).toContainText(/A site for the business/);
    await expect(page.getByTestId("onb-accept")).toHaveText(/^Looks right$/);
    await page.getByTestId("onb-accept").click();
    await expect(page.getByTestId("onb-ready")).toBeVisible();
    await expect(page.getByTestId("onb-ready-facts")).toContainText("Parrilla El Paisa");
    await expect(page.getByTestId("onb-ready-facts")).toContainText("+529981234567");
    await expect(page.getByTestId("onb-link-value")).toContainText("parrilla-el-paisa.tulala.digital");
  });

  test("ambiguous words ask the fork; the choice re-plans the questions", async ({ page }) => {
    const userId = await ensureUser("qa-onb-fork@impronta.test");
    await seedBrief({
      userId,
      intent: "unknown",
      facts: [["person.name", "Dani", "ai_inference", "needs_approval"], ["person.city", "Cancún", "ai_inference", "needs_approval"]],
      input: { kind: "text", value: "I'm Dani in Cancún" },
    });
    await devSignIn(page, "qa-onb-fork@impronta.test");
    await openHome(page);
    await openModule(page);
    await expect(page.getByTestId("onb-understood")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("onb-accept").click();
    await expect(page.getByTestId("onb-fork")).toBeVisible();
    await evidence(page, "14-fork");
    await page.getByTestId("onb-fork-business").click();
    await expect(page.getByTestId("onb-question-kind_of_business")).toBeVisible();
    await page.getByTestId("onb-back").click();
    await expect(page.getByTestId("onb-understood")).toBeVisible();
    await expect(page.getByTestId("onb-path")).toContainText(/A site for the business/);
  });
});
