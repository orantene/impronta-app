/**
 * Cross-workspace authorization, in a browser, against records that exist.
 *
 * WHY THIS SPEC EXISTS SEPARATELY FROM THE 48. The program's permissions
 * requirement is that "changing a record ID in a request does not bypass
 * authorization". That is not a property of one business type, so it is not
 * one of C01–C48; it is a claim about every workspace-scoped read.
 *
 * WHY IT COULD NOT BE WRITTEN BEFORE. Workspace B was an `agencies` row, a
 * domain and an owner membership — no spaces, offerings, customers or orders
 * (D-011). A test written against that can only substitute a UUID that exists
 * NOWHERE, and a refusal then proves nothing at all, because "not found" and
 * "forbidden" produce the same empty screen. It would have passed on day one
 * and gone on passing if authorization were deleted entirely.
 *
 * So the shape here is a PAIR, and the pair is the point:
 *
 *   1. the record is really there            (service role, not the browser)
 *   2. A's operator cannot reach it          (the refusal)
 *   3. B's own owner CAN reach it            (the positive control)
 *
 * Without 3, 2 is satisfied by a broken page. Without 1, both are satisfied by
 * an empty database. Only all three together say "authorization".
 */

import {
  test,
  expect,
  signInJourneysStaff,
  assertNotAuthWall,
  skipUnlessFixture,
} from "./_harness";
import {
  workspaceBFixturePresent,
  JOURNEYS_B_ORDER_ID,
  JOURNEYS_B_OWNER_EMAIL,
} from "./_isolated-db";

/**
 * B's host. The dev proxy pins one Host header per port, so B is served by a
 * second instance pointed at the same upstream:
 *
 *   node scripts/local-host-proxy.mjs 3104 qa-journeys-b.local 3008
 *
 * Overridable because the port is a local convention, not a fact.
 */
const B_ORIGIN = process.env.JOURNEYS_B_ORIGIN ?? "http://qa-journeys-b.local:3104";

/**
 * B's sale seen from two surfaces. The POS basket renders LINE LABELS, the
 * Sales table renders the order's amount and channel — so the same order is
 * identified differently depending on where it would leak.
 */
const B_ONLY_LABEL = /cuticle oil/i;
const B_ONLY_AMOUNT = "$9.00";

test.beforeEach(() => {
  skipUnlessFixture();
});

test("workspace B's records are really there, so a refusal cannot be absence", async () => {
  // Read with the service role rather than through a page, because the whole
  // question the browser tests below depend on is whether the row exists at
  // all. Asking the UI would be asking the thing under test.
  expect(
    await workspaceBFixturePresent(),
    "workspace B must hold its seeded $9.00 paid order — without it the two "
      + "tests below pass for the wrong reason (see D-011)",
  ).toBe(true);
});

test("A's operator pasting B's order id into POS does not get B's sale", async ({ page }) => {
  await signInJourneysStaff(page, `/admin/pos?order=${JOURNEYS_B_ORDER_ID}`);
  await assertNotAuthWall(page);

  // Not a crash: a 500 would also hide the row, and would not be
  // authorization. The POS surface has to still be a POS surface.
  await expect(page.getByText(/application error|something went wrong/i)).toHaveCount(0);

  await expect(
    page.getByText(B_ONLY_LABEL),
    "workspace B's line must not render inside workspace A's till",
  ).toHaveCount(0);
});

/** Sign in on B's origin. `signInJourneysStaff` mints against the base URL, which is A. */
async function signInAsBOwner(page: import("@playwright/test").Page, next: string): Promise<void> {
  const params = new URLSearchParams({ email: JOURNEYS_B_OWNER_EMAIL, next });
  const res = await page.request.get(`${B_ORIGIN}/api/dev/signin?${params.toString()}`, {
    maxRedirects: 0,
  });
  expect(res.status(), "dev sign-in must mint a session for B's owner").toBe(307);
}

test("the POS locator finds B's line when the viewer is allowed to see it", async ({ page }) => {
  // Control for the test above. `toHaveCount(0)` on a locator that could never
  // match anything is a test that passes whatever the code does — the exact
  // failure this spec exists to avoid. Loading the SAME order in the SAME
  // surface as someone entitled to it proves the locator can match.
  await signInAsBOwner(page, `/admin/pos?order=${JOURNEYS_B_ORDER_ID}`);
  await page.goto(`${B_ORIGIN}/admin/pos?order=${JOURNEYS_B_ORDER_ID}`);
  await assertNotAuthWall(page);
  await expect(
    page.getByText(B_ONLY_LABEL).first(),
    "B's own till must show B's line, or the refusal test proves nothing",
  ).toBeVisible({ timeout: 20_000 });
});

test("B's own owner reaches that same order, which is what makes the refusal authorization", async ({
  page,
}) => {
  await signInAsBOwner(page, "/admin/sales");
  await page.goto(`${B_ORIGIN}/admin/sales`);
  await assertNotAuthWall(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);

  await expect(
    page.getByText(B_ONLY_AMOUNT).first(),
    "B's owner must see B's own sale, or the refusal above is unreachability rather than a decision",
  ).toBeVisible({ timeout: 20_000 });
});

test("A's operator does not see B's sale in A's own Sales list either", async ({ page }) => {
  // The paste-the-id test proves one surface refuses. This proves the list
  // that legitimately shows every sale in the workspace is scoped, which is
  // the leak that would not need a crafted URL to happen.
  await signInJourneysStaff(page, "/admin/sales");
  await assertNotAuthWall(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(
    page.getByText(B_ONLY_AMOUNT),
    "B's $9.00 sale must not appear in A's Sales list",
  ).toHaveCount(0);
});
