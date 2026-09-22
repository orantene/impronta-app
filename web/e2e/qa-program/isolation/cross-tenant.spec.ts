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
 */
const B_INQUIRY =
  process.env.QA_B_INQUIRY_ID ?? "33330040-0000-4000-8000-0000000000b1";
const B_ONLY_LABEL = /cuticle oil/i;

test.describe("QA isolation — cross-tenant refusal", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("B fixture order exists (refusal cannot be absence)", async () => {
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
        !(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("fxlankepwnvelxjrahwk"),
      "QA service-role env required for workspaceBFixturePresent; B order was MCP-seeded as 33330031-…000b1",
    );
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
    // D-MSG-319: POS currently throws React #310 on a foreign order id even
    // while correctly hiding B's line — keep this required so the crash stays red.
    expect(
      errors.filter((e) => !/React error #310/i.test(e)),
      errors.join("\n"),
    ).toEqual([]);
    if (errors.some((e) => /React error #310/i.test(e))) {
      expect(
        false,
        "D-MSG-319: POS threw React #310 when A opened B's order id — isolation hid the line but crashed",
      ).toBeTruthy();
    }
  });

  test("A session + B inquiry id on Messages refuses content", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", B_INQUIRY);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/QA B Isolation|cuticle oil/i),
      "B inquiry content leaked into A's Messages",
    ).toHaveCount(0);
    const body = ((await page.locator("[data-messages-v5]").innerText()) || "").replace(/\s+/g, " ");
    const openedForeign =
      /QA B Isolation/i.test(body) ||
      (await page.locator(`[data-inbox-row][data-inquiry-id="${B_INQUIRY}"][data-active]`).count()) > 0;
    expect(openedForeign, "A session must not activate B's inquiry as the open thread").toBeFalsy();
    await shot(page, "iso-a-messages-b-inquiry");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("tampered client link shows expired/refused page — not content", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    const bad = "v1.eyJxdWFjdC1mYWtlLXRhbXBlciJ9.badsignatureXXXX";
    await page.goto(`/c/t/${bad}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1000);
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    const body = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ");
    expect(
      /expired|invalid|not (available|found)|couldn'?t find|no longer here|refused|link.*(no longer|ended)|could not/i.test(
        body,
      ),
      `tampered client link must show expired/refused/not-found page; got: ${body.slice(0, 300)}`,
    ).toBeTruthy();
    await expect(page.locator('[data-client-action="accept_offer"]')).toHaveCount(0);
    await expect(page.locator("[data-messages-v5]")).toHaveCount(0);
    await shot(page, "iso-tampered-client-link");
    expect(
      errors.filter((e) => !/Failed to load resource:.*404/i.test(e)),
      errors.join("\n"),
    ).toEqual([]);
  });

  test("foreign /pay/<code> refuses — no payment content", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await page.goto("/pay/qa-b-foreign-code-does-not-exist", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(1000);
    const body = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ");
    expect(
      /not found|expired|invalid|no longer|unavailable|couldn'?t find|could not|refused/i.test(body),
      `foreign pay code must refuse; got: ${body.slice(0, 300)}`,
    ).toBeTruthy();
    await expect(page.getByRole("link", { name: /^pay$/i })).toHaveCount(0);
    await shot(page, "iso-foreign-pay-code");
    // A 404 response for a missing pay code is the refusal — ignore console 404 noise.
    expect(
      errors.filter((e) => !/Failed to load resource:.*404/i.test(e)),
      errors.join("\n"),
    ).toEqual([]);
  });
});
