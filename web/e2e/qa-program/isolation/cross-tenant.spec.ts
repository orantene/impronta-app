import {
  assertNotAuthWall,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  prepareJourneysPage,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";
import { JOURNEYS_B_ORDER_ID, workspaceBFixturePresent } from "../../cases/_isolated-db";

/**
 * Cross-tenant isolation (Round 2) — with tenant A's session, open tenant B
 * resources and assert refusal (not a silent redirect you did not read).
 *
 * B fixture: paid order JOURNEYS_B_ORDER_ID (PERM-cross-workspace). Messages
 * inquiry / client-link / pay-code for B are seeded when present; otherwise
 * the order + fabricated UUID paths still run.
 */
const B_INQUIRY =
  process.env.QA_B_INQUIRY_ID ?? "33330040-0000-4000-8000-0000000000b1";
const B_ONLY_LABEL = /cuticle oil/i;

test.describe("QA isolation — cross-tenant refusal", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("B fixture order exists (refusal cannot be absence)", async () => {
    expect(
      await workspaceBFixturePresent(),
      "workspace B must hold its seeded $9 paid order — without it isolation proofs are meaningless",
    ).toBe(true);
  });

  test("A session + B order id on POS does not show B's sale", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/pos?order=${JOURNEYS_B_ORDER_ID}`);
    await assertNotAuthWall(page);
    await expect(page.getByText(/application error|something went wrong/i)).toHaveCount(0);
    await expect(
      page.getByText(B_ONLY_LABEL),
      "workspace B's line must not render inside workspace A's till",
    ).toHaveCount(0);
    await shot(page, "iso-a-pos-b-order");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("A session + B inquiry id on Messages refuses content", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", B_INQUIRY);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    // Must not open B's thread content. Either empty picker, not-found, or
    // a refusal sentence — never B's contact name as an open thread.
    await expect(
      page.getByText(/QA B Isolation|cuticle oil/i),
      "B inquiry content leaked into A's Messages",
    ).toHaveCount(0);
    const body = ((await page.locator("[data-messages-v5]").innerText()) || "").replace(/\s+/g, " ");
    // Deep-link to a foreign id should not leave a fully loaded foreign thread.
    const openedForeign =
      /QA B Isolation/i.test(body) ||
      (await page.locator(`[data-inbox-row][data-inquiry-id="${B_INQUIRY}"][data-active]`).count()) > 0;
    expect(openedForeign, "A session must not activate B's inquiry as the open thread").toBeFalsy();
    await shot(page, "iso-a-messages-b-inquiry");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("tampered client link shows expired/refused page — not content", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    // Flip a character in a well-formed-looking token path.
    const bad = "v1.eyJxdWFjdC1mYWtlLXRhbXBlciJ9.badsignatureXXXX";
    await page.goto(`/c/t/${bad}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1000);
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    const body = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ");
    expect(
      /expired|invalid|not (available|found)|refused|link.*(no longer|ended)|could not/i.test(body),
      `tampered client link must show expired/refused page; got: ${body.slice(0, 300)}`,
    ).toBeTruthy();
    // Must not render an offer Accept or Messages stream for a real thread.
    await expect(page.locator('[data-client-action="accept_offer"]')).toHaveCount(0);
    await expect(page.locator("[data-messages-v5]")).toHaveCount(0);
    await shot(page, "iso-tampered-client-link");
    void context;
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("foreign /pay/<code> refuses — no payment content", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    // Nonexistent / other-tenant-shaped code.
    await page.goto("/pay/qa-b-foreign-code-does-not-exist", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(1000);
    const body = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ");
    expect(
      /not found|expired|invalid|no longer|unavailable|could not|refused/i.test(body),
      `foreign pay code must refuse; got: ${body.slice(0, 300)}`,
    ).toBeTruthy();
    await expect(page.getByRole("link", { name: /^pay$/i })).toHaveCount(0);
    await shot(page, "iso-foreign-pay-code");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
