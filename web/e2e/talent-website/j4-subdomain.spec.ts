/**
 * J4 — Phase 2 subdomain routing + shared slug namespace, end to end.
 *
 * Per `web/docs/talent-website-execution-plan-2026-09-23.md` §"Phase 2":
 *
 *   1. a published site renders on Host `<slug>.lvh.me:3000` for the t_max
 *      and t_free_site fixtures
 *   2. inner-page nav works on the subdomain AND on a custom domain
 *   3. creating a workspace whose slug collides with a live talent site is
 *      refused
 *   4. setting a talent slug to an existing agency slug ('acme') is refused
 *
 * Requires `TALENT_SITE_SUBDOMAINS_ENABLED=true` on the server under test —
 * with the switch off (default), `resolveTalentSubdomainContext` is never
 * consulted and every `*.lvh.me` host in this file 404s as "host not
 * registered" by design (see `web/src/lib/access/talent-site-subdomains.ts`).
 *
 * CANNOT RUN IN THIS ENVIRONMENT (no server, no seeded DB). Written to be
 * correct and deterministic against the real fixtures and the real host
 * resolver; explicit waits throughout, no fixed sleeps. See `./fixtures.ts`
 * for a flagged assumption about the free-tier render gate that this file
 * exercises but did not get to verify.
 *
 * Gate: set `TALENT_SITE_E2E_FIXTURE_READY=1` after `seedTalentSiteE2EFixture()`
 * has run against the target server's DB (same convention as
 * `JOURNEYS_FIXTURE_READY` in `web/e2e/cases/_harness.ts`).
 */

import { test, expect, type Page } from "@playwright/test";

import { ACME_AGENCY_SLUG, TALENT_FIXTURES, talentFixture } from "./fixtures";
import { signInTalentFixture, TALENT_SITE_FIXTURE_READY } from "./helpers";

// The canonical fixture identities live in ./fixtures.ts, which is the
// companion to web/e2e/talent-website/seed.ts: the seed creates exactly these
// rows, and the harness runs it before Playwright starts. These aliases keep
// the assertions below readable without inventing a second source of truth.
const ACME_SLUG = ACME_AGENCY_SLUG;
const T_MAX = talentFixture("t_max");
const T_FREE_SITE = talentFixture("t_free_site");
const T_MAX_SLUG = T_MAX.siteSlug as string;
const T_MAX_CUSTOM_DOMAIN = T_MAX.customDomain as string;
const T_FREE_SITE_SLUG = T_FREE_SITE.siteSlug as string;

const FIXTURE_READY = TALENT_SITE_FIXTURE_READY;
/** Port the local dev server (or `local-host-proxy.mjs`) answers `*.lvh.me` on. */
const SUBDOMAIN_PORT = process.env.TALENT_SITE_E2E_SUBDOMAIN_PORT ?? "3000";

function subdomainOrigin(label: string): string {
  return `http://${label}.lvh.me:${SUBDOMAIN_PORT}`;
}

function customDomainOrigin(): string {
  return `http://${T_MAX_CUSTOM_DOMAIN}:${SUBDOMAIN_PORT}`;
}

// The harness seeds before Playwright starts (see the talent-website e2e
// workflow), so these specs never seed themselves: a spec that writes to the
// database it is asserting against cannot tell a real pass from a self-inflicted
// one.
test.beforeEach(() => {
  test.skip(!FIXTURE_READY, "set TALENT_SITE_E2E_FIXTURE_READY=1 after the harness has run seed.ts");
});

/**
 * Positive control (D-011 pattern): prove the fixture is really there before
 * trusting any refusal or render assertion below.
 */
test("the t_max / t_free_site / acme fixture is really seeded", async ({ request }) => {
  const res = await request.get(`${subdomainOrigin(T_MAX_SLUG)}/`);
  expect(
    res.status(),
    "seed.ts must have run against this server's database before Playwright. " +
      "Without it every test below passes or fails for the wrong reason.",
  ).toBe(200);
  expect(TALENT_FIXTURES.length).toBeGreaterThan(0);
});

/** Not a login page, not "host not registered", and not a blank document. */
async function assertRealSitePage(page: Page): Promise<void> {
  const url = page.url().toLowerCase();
  expect(url, "login URL cannot pass a journey").not.toMatch(/\/login|\/signin|\/auth\//);
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  await expect(page.locator("body")).toBeVisible();
}

/**
 * The Phase 2 nav model (`hydrateShellNav` with `hrefMode: "host-root"`)
 * emits "/" for the home page and "/<slug>" for an inner page — never
 * "/t/site/<siteSlug>/<slug>" (that prefix is the path-mode fallback used
 * only when the subdomain switch is off). Clicking "About" must therefore
 * land on the bare `/about` path on whichever host served the page, proving
 * `isTalentSiteHostPathAllowed` and the emitted href agree.
 */
async function clickInnerNavAndAssertHostRoot(page: Page, origin: string): Promise<void> {
  const about = page.getByRole("link", { name: /about/i }).first();
  await about.waitFor({ state: "visible" });
  await about.click();
  await page.waitForURL((url) => url.pathname === "/about", { timeout: 15_000 });
  expect(new URL(page.url()).origin).toBe(origin);
  await assertRealSitePage(page);
}

test("a published site renders on the host subdomain for t_max", async ({ page }) => {
  const origin = subdomainOrigin(T_MAX_SLUG);
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await assertRealSitePage(page);
  await expect(page.getByText(/subdomain routing fixture/i)).toBeVisible();
});

test("a published site renders on the host subdomain for t_free_site", async ({ page }) => {
  // Flagged in fixtures.ts: this is the target behaviour, not yet proven to
  // hold against `renderTalentMaxSite`'s current Max-only publish gate. If
  // this assertion is the one that fails, the fix belongs in the render gate
  // (admit any published site, defer plan-based feature limits to Phase 3's
  // readiness gate) — not in loosening this test.
  const origin = subdomainOrigin(T_FREE_SITE_SLUG);
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await assertRealSitePage(page);
});

test("inner-page nav works on the subdomain", async ({ page }) => {
  const origin = subdomainOrigin(T_MAX_SLUG);
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await assertRealSitePage(page);
  await clickInnerNavAndAssertHostRoot(page, origin);
  await expect(
    page.getByText(/the inner page the nav journey clicks through to/i),
  ).toBeVisible();
});

test("inner-page nav works on a custom domain", async ({ page }) => {
  const origin = customDomainOrigin();
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await assertRealSitePage(page);
  await clickInnerNavAndAssertHostRoot(page, origin);
  await expect(
    page.getByText(/the inner page the nav journey clicks through to/i),
  ).toBeVisible();
});

/**
 * `StartFreeWorkspaceDialog` (web/src/components/talent/start-free-workspace-dialog.tsx)
 * is opened by a global CustomEvent rather than a stable, always-visible
 * button (the CTA tile that fires it is conditionally rendered), so the
 * journey opens it directly the same way the real CTA does — no fragile
 * text-matching on marketing copy that can legitimately change.
 */
async function openStartWorkspaceDialog(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("tulala:open-start-workspace-dialog"));
  });
  await page.locator("#wsn-slug").waitFor({ state: "visible", timeout: 15_000 });
}

test("creating a workspace whose slug collides with a live talent site is refused", async ({
  page,
}) => {
  await signInTalentFixture(page, "t_max", "/talent/today");

  await openStartWorkspaceDialog(page);

  const slugInput = page.locator("#wsn-slug");
  await slugInput.fill("");
  await slugInput.fill(T_MAX_SLUG); // t_max's own LIVE talent-site slug

  await page.getByRole("button", { name: /create workspace/i }).click();

  // provisionFreeWorkspaceFromTalent → isPlatformSubdomainLabelTaken → the
  // shared copy.workspaceNameTaken (web/src/lib/saas/subdomain-namespace-copy.ts).
  await expect(page.getByText("That name is taken. Please choose a different one.")).toBeVisible();

  // Refused, not silently renamed: never navigates away to a workspace admin.
  expect(new URL(page.url()).pathname).not.toMatch(/\/admin(\/|$)/);
});

test("setting a talent slug to an existing agency slug ('acme') is refused", async ({ page }) => {
  await signInTalentFixture(page, "t_max", "/talent/page-builder");

  const slugField = page.getByPlaceholder("your-name");
  await slugField.waitFor({ state: "visible", timeout: 15_000 });
  await slugField.fill("");
  await slugField.fill(ACME_SLUG);

  await page.getByRole("button", { name: /save address/i }).click();

  // setMaxSiteSlugAction maps the trigger's 23505 to slug_taken → the same
  // shared copy.siteAddressTaken, and never persists the rejected value.
  await expect(page.getByText("That address is taken. Try another.")).toBeVisible();
  // Refused, not silently accepted: the "Saved" confirmation for the taken
  // value never appears (the input may still show what the talent typed).
  await expect(page.getByText(new RegExp(`saved . /t/site/${ACME_SLUG}`, "i"))).toHaveCount(0);
});
