/**
 * J8: "Where I appear" account-menu section (Phase 5).
 *
 * Journey on `t_multi_roster`: open the talent account menu, prove the
 * "Where I appear" rows are exactly the talent's seeded memberships, that
 * every row whose seeded state is live carries a link that actually returns
 * 200, and that pending / roster-only rows show their status and no link at
 * all. Also proves the menu never leaks a workspace it is not on, and that
 * "Workspace settings" is absent on the talent surface.
 *
 * Fixture identities this spec expects from `./fixtures` (Phase Q.3 seed):
 *   - `t_multi_roster`: a talent on the platform hub PLUS three agencies with
 *     mixed visibility, one of them pending. Needs:
 *       `profileCode`      the talent's public profile code
 *       `selfPageUrl`      absolute URL of `/t/<profileCode>` on the seeded
 *                          marketing host (the Tulala self page)
 *       `memberships`      one entry per SEEDED agency roster row (the hub row
 *                          is deliberately NOT listed here: `loadRepresentation`
 *                          folds it into the self entry, so it is asserted via
 *                          `selfPageUrl` instead), each:
 *                            slug         agency slug, the row's DOM key
 *                            displayName  agency display name as rendered
 *                            effective    expected chip state, one of
 *                                         live | pending | agency_hidden |
 *                                         you_hid | winding_down
 *                          The seed declares `effective` rather than the spec
 *                          re-deriving it, so this journey checks the product
 *                          against the fixture instead of against a second copy
 *                          of `resolveEffectiveVisibility`.
 *       `notAMemberSlug`   slug of a seeded agency this talent is NOT on
 *                          (e.g. `acme`), which must never appear in the menu
 *     and a signed-in `storageState` for that talent.
 *
 * Host note. The rendered links are absolute and point at whatever host
 * `agency_domains` resolves for each agency (custom domain, else branded
 * subdomain, else `tulala.digital/w/<slug>`). The hermetic harness seeds those
 * rows on hosts it can actually serve, so `harnessUrl()` below only swaps in
 * the harness protocol and port and otherwise leaves the hostname alone. A
 * link pointing at a host the harness does not serve is a seed bug and fails
 * here loudly rather than being silently rewritten to something that works.
 */
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

import { fixtures, storageStateFor } from "./fixtures";

const FLAGS_OFF = process.env.E2E_TALENT_FLAGS === "off";

const talent = fixtures.t_multi_roster;

/** Effective states whose public page resolves, so the row must carry a link. */
const LINKED = new Set(["live"]);

/**
 * Re-point an absolute production-shaped URL at the harness, preserving the
 * hostname. Only the scheme and port move, so a wrong HOST still fails.
 */
function harnessUrl(href: string, baseURL: string): string {
  const target = new URL(href);
  const base = new URL(baseURL);
  target.protocol = base.protocol;
  target.port = base.port;
  return target.toString();
}

async function expectResolves(request: APIRequestContext, href: string, baseURL: string) {
  const res = await request.get(harnessUrl(href, baseURL), { maxRedirects: 5 });
  expect(res.status(), `${href} must resolve for the public`).toBe(200);
}

async function openAccountMenu(page: Page) {
  await page.goto("/talent/today", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Open account menu|Abrir men./i }).click();
  await expect(page.locator("[data-tulala-talent-account-menu]")).toBeVisible();
}

test.describe("J8 where I appear", () => {
  test.skip(FLAGS_OFF, "J8 covers the Phase 5 account-menu section, which ships with the switches on.");
  test.use({ storageState: storageStateFor("t_multi_roster") });

  test("the rows are exactly the seeded memberships, and nothing else", async ({ page }) => {
    await openAccountMenu(page);

    const rows = page.locator("[data-talent-appearance-row]");
    const rendered = await rows.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.talentAppearanceRow ?? ""),
    );

    expect(rendered.slice().sort()).toEqual(
      talent.memberships.map((m) => m.slug).slice().sort(),
    );

    // No agency the talent is not on, under any selector in this menu.
    expect(rendered).not.toContain(talent.notAMemberSlug);
    await expect(
      page.locator("[data-tulala-talent-account-menu]").getByText(talent.notAMemberSlug, { exact: false }),
    ).toHaveCount(0);

    // The platform hub is folded into the self entry, never a row of its own.
    await expect(page.locator('[data-talent-appearance-row][data-kind="hub"]')).toHaveCount(0);
    await expect(page.locator('[data-talent-menu-row="self-profile"]')).toHaveCount(1);
  });

  test("each row shows the seeded visibility and the right agency name", async ({ page }) => {
    await openAccountMenu(page);

    for (const membership of talent.memberships) {
      const row = page.locator(`[data-talent-appearance-row="${membership.slug}"]`);
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-effective", membership.effective);
      await expect(row).toContainText(membership.displayName);
      // Every row states its status in words, not only as a colour dot.
      await expect(row.locator("[data-talent-appearance-status]")).not.toBeEmpty();
      // Every row can be managed, whether or not it can be viewed.
      await expect(row.locator(`[data-talent-appearance-manage="${membership.slug}"]`)).toHaveCount(1);
    }
  });

  test("visible rows link to a page that returns 200", async ({ page, request, baseURL }) => {
    expect(baseURL, "J8 needs a base URL to re-point the absolute links at").toBeTruthy();
    await openAccountMenu(page);

    const visible = talent.memberships.filter((m) => LINKED.has(m.effective));
    expect(visible.length, "the t_multi_roster seed must include at least one live membership")
      .toBeGreaterThan(0);

    for (const membership of visible) {
      const view = page.locator(`[data-talent-appearance-view="${membership.slug}"]`);
      await expect(view).toHaveCount(1);
      const href = await view.getAttribute("href");
      expect(href, `${membership.slug} is live and must carry a link`).toBeTruthy();
      // Never the retired flat `/<slug>/t/<code>` form, which only reaches the
      // profile through a redirect, and never a half-built path.
      expect(href!).not.toMatch(new RegExp(`//[^/]+/${membership.slug}/t/`));
      expect(href!).not.toContain("/w//");
      expect(href!).toContain(`/t/${talent.profileCode}`);
      await expectResolves(request, href!, baseURL!);
    }
  });

  test("pending and roster-only rows show status and carry no link", async ({ page }) => {
    await openAccountMenu(page);

    const hidden = talent.memberships.filter((m) => !LINKED.has(m.effective));
    expect(hidden.length, "the t_multi_roster seed must include a pending and a roster-only membership")
      .toBeGreaterThan(0);
    expect(hidden.map((m) => m.effective)).toContain("pending");

    for (const membership of hidden) {
      const row = page.locator(`[data-talent-appearance-row="${membership.slug}"]`);
      await expect(row.locator(`[data-talent-appearance-view="${membership.slug}"]`)).toHaveCount(0);
      await expect(row.locator("a[href]")).toHaveCount(0);
      await expect(row.locator("[data-talent-appearance-status]")).not.toBeEmpty();
    }
  });

  test("the Tulala self page link resolves, and Workspace settings is not offered", async ({
    page,
    request,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();
    await openAccountMenu(page);

    const self = page.locator('[data-talent-menu-row="self-profile"]');
    await expect(self).toHaveCount(1);
    const href = await self.getAttribute("href");
    expect(href).toBe(talent.selfPageUrl);
    await expectResolves(request, href!, baseURL!);

    // A talent has no workspace to configure; that row belongs to the
    // workspace surface only. Both locales, since the harness may run either.
    await expect(
      page.getByRole("menuitem", { name: /Workspace settings|Ajustes del espacio/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("menu")).not.toContainText(/Workspace settings|Ajustes del espacio/i);
  });

  test("Manage opens the representation drawer focused on that membership", async ({ page }) => {
    await openAccountMenu(page);

    const first = talent.memberships[0];
    await page.locator(`[data-talent-appearance-manage="${first.slug}"]`).click();

    // The menu closes and the drawer takes over.
    await expect(page.locator("[data-tulala-talent-account-menu]")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(first.displayName);
  });
});
