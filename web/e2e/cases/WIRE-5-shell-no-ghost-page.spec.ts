/**
 * 5.1 The shell keeps one page on screen (D-167).
 *
 * Projects is a canonical server page hosted inside the shell's `<main>`;
 * Messages and Catalog are SPA sections whose route file is a bare
 * `PageRouteSyncer`. A rail click from Projects to Messages must replace the
 * route content: before the fix the shell moved the URL with
 * `history.pushState` (no server round trip), `usePathname` followed it, the
 * Projects tree lost its canonical slot and was re-mounted inline BEFORE
 * `.tulala-shell` as a direct child of `<body>`, a ghost Projects list above
 * the header that survived every SPA-only rail click after it.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture, JOURNEYS_SLUG } from "./_harness";
import { ensureHydrated } from "./_wire-seed";

skipUnlessFixture();

const SIDEBAR = "[data-tulala-app-sidebar]";

/** Direct children of <body> that are not the shell: the ghost lives there. */
async function bodyGhosts(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll("body > div.flex.w-full").length);
}

async function mainsInShell(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll(".tulala-shell main#tulala-workspace-content").length);
}

async function clickRail(page: import("@playwright/test").Page, name: RegExp, urlTail: RegExp): Promise<void> {
  const row = page.locator(SIDEBAR).getByRole("button", { name }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(page).toHaveURL(urlTail, { timeout: 30_000 });
  await expect(row).toHaveAttribute("aria-current", "page", { timeout: 30_000 });
}

test("WIRE-5.1 Projects › rail › Messages leaves no ghost page above the shell", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const base = `/${JOURNEYS_SLUG}/admin`;
  await signInJourneysStaff(page, `${base}/projects`);
  await ensureHydrated(page, `${SIDEBAR} button`);

  // Fresh load: the Projects page sits inside the shell's <main>.
  await expect(page.locator(".tulala-shell main#tulala-workspace-content h1", { hasText: /projects/i })).toBeVisible({ timeout: 30_000 });
  expect(await bodyGhosts(page), "fresh load: nothing outside the shell").toBe(0);
  expect(await mainsInShell(page), "fresh load: one workspace main").toBe(1);

  // Rail → Messages (an SPA-only segment).
  await clickRail(page, /^Messages/, /\/admin\/messages(\?|$)/);
  await expect(page.locator(".tulala-shell main#tulala-workspace-content h1", { hasText: /^projects$/i })).toHaveCount(0, { timeout: 30_000 });
  expect(await bodyGhosts(page), "after Messages: no Projects root as a body child").toBe(0);
  expect(await mainsInShell(page), "after Messages: one workspace main").toBe(1);
  await expect(page.locator("body > div.flex.w-full h1", { hasText: /projects/i })).toHaveCount(0);

  // Rail → Catalog → Messages: the ghost used to survive every SPA-only hop.
  await clickRail(page, /^(Catalog|Menu)/, /\/admin\/(catalog|menu)(\?|$)/);
  expect(await bodyGhosts(page), "after Catalog: no ghost").toBe(0);
  await clickRail(page, /^Messages/, /\/admin\/messages(\?|$)/);
  expect(await bodyGhosts(page), "after Catalog → Messages: no ghost").toBe(0);
  expect(await mainsInShell(page), "still one workspace main").toBe(1);
});
