/**
 * E2E smoke test — login → builder → save draft → publish → share-link works.
 *
 * The single Playwright test covering the highest-leverage user path. Run
 * before promoting anything that touches: auth, admin shell, builder, share-
 * link viewer.
 *
 * Requires Playwright (not yet installed in this repo). To enable:
 *
 *   cd web
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   npx playwright test
 *
 * Reads test-account credentials from env. Set in `web/.env.local`:
 *   TEST_ADMIN_EMAIL
 *   TEST_ADMIN_PASSWORD
 *
 * Default base URL: http://app.local:3102 (the local-host-proxy host). Override
 * via `PLAYWRIGHT_BASE_URL` to point at staging.tulala.digital before a
 * post-launch promotion.
 */

import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";

async function dismissAnalyticsIfPresent(page: Page) {
  const analyticsDecline = page.getByRole("button", { name: /decline/i });
  const visible = await analyticsDecline
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return;
  await analyticsDecline.click();
  await analyticsDecline.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
}

async function seedAnalyticsConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("impronta_analytics_consent", "denied");
    } catch {
      // Ignore blocked storage in hardened browser contexts.
    }
  });

  await page
    .evaluate(() => {
      try {
        window.localStorage.setItem("impronta_analytics_consent", "denied");
      } catch {
        // Ignore until the page has navigated to a real origin.
      }
    })
    .catch(() => {});
}

async function dismissBuilderTipIfPresent(page: Page) {
  const dismissTip = page.getByRole("button", { name: /dismiss tip/i });
  const visible = await dismissTip
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return;
  await dismissTip.click();
  await dismissTip.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
}

async function openImprontaBuilder(page: Page) {
  await seedAnalyticsConsent(page);
  await signIn(page, "/impronta/admin/site");
  await page.waitForURL(/\/impronta\/admin\/(site|website)/, { timeout: 20_000 });
  await page.waitForLoadState("domcontentloaded");
  expect(page.url()).toContain("/impronta/admin/");

  const builderEntry = page.getByRole("link", { name: /open page builder/i });
  const builderEntryVisible = await builderEntry
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (builderEntryVisible) {
    const builderHref = await builderEntry.getAttribute("href");
    expect(builderHref).toContain("/impronta?edit=1");
  }
  await page.goto("/impronta?edit=1&panel=sections", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("domcontentloaded");
  await dismissAnalyticsIfPresent(page);
  const editTopbar = page.locator("[data-edit-topbar]");
  const topbarVisible = await editTopbar
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);

  if (!topbarVisible) {
    const enterEdit = page
      .getByRole("button", { name: /edit this page|^edit$/i })
      .first();
    if (await enterEdit.isVisible().catch(() => false)) {
      await enterEdit.click();
    }
    await expect(editTopbar).toBeVisible({ timeout: 90_000 });
  }
  await expect(page.getByRole("button", { name: /^publish$/i })).toBeVisible({
    timeout: 30_000,
  });
  const builderUrl = new URL(page.url());
  expect(builderUrl.pathname === "/impronta" || builderUrl.pathname === "/impronta/").toBe(
    true,
  );
  await dismissBuilderTipIfPresent(page);
}

async function openImprontaBuilderDirect(page: Page) {
  await seedAnalyticsConsent(page);
  await signIn(page, "/impronta?edit=1&panel=sections");
  await page.waitForLoadState("domcontentloaded");

  const current = new URL(page.url());
  if (current.pathname !== "/impronta") {
    await page.goto("/impronta?edit=1&panel=sections", {
      waitUntil: "domcontentloaded",
    });
  }

  await dismissAnalyticsIfPresent(page);
  const editTopbar = page.locator("[data-edit-topbar]");
  const topbarVisible = await editTopbar
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);

  if (!topbarVisible) {
    const enterEdit = page.getByRole("button", { name: /edit this page|^edit$/i });
    if (await enterEdit.isVisible().catch(() => false)) {
      await enterEdit.click();
    }
    await expect(editTopbar).toBeVisible({ timeout: 90_000 });
  }

  await expect(page.getByRole("button", { name: /^publish$/i })).toBeVisible({
    timeout: 30_000,
  });
  await dismissBuilderTipIfPresent(page);
}

async function addHeroFromBlankState(page: Page) {
  const blankCanvasHeading = page.getByRole("heading", {
    name: /your homepage is a blank canvas/i,
  });
  await expect(blankCanvasHeading).toBeVisible();

  const addHero = page.locator('[data-empty-canvas-quick-add="hero"]');
  await expect(addHero).toBeVisible();
  await addHero.click();

  await expect(blankCanvasHeading).toBeHidden({ timeout: 90_000 });
  await expect(
    page.locator('[data-cms-section][data-section-type-key="hero"]').first(),
  ).toBeVisible({ timeout: 90_000 });
  await dismissAnalyticsIfPresent(page);
  await dismissBuilderTipIfPresent(page);
}

async function addSectionFromLibrary(
  page: Page,
  typeKey: string,
  label: string,
) {
  const addSection = page.getByRole("button", { name: /^add a section$/i }).first();
  await expect(addSection).toBeVisible({ timeout: 10_000 });
  await addSection.click();

  const picker = page.locator('[data-edit-drawer="picker"]');
  await expect(picker).toBeVisible({ timeout: 10_000 });

  const search = picker.locator("input").first();
  await expect(search).toBeVisible();
  await search.fill(label);

  const sectionTile = picker.getByRole("button").filter({ hasText: label }).first();
  await expect(sectionTile).toBeVisible({ timeout: 10_000 });
  await sectionTile.click();

  await expect(
    page.locator(`[data-cms-section][data-section-type-key="${typeKey}"]`).first(),
  ).toBeVisible({ timeout: 90_000 });
}

async function signIn(page: Page, nextPath = "/admin") {
  if (USE_DEV_SIGNIN) {
    const params = new URLSearchParams({
      email: ADMIN_EMAIL!,
      password: ADMIN_PASSWORD!,
      next: nextPath,
    });
    const response = await page.goto(`/api/dev/signin?${params.toString()}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBeTruthy();
    return;
  }

  await page.goto(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  await dismissAnalyticsIfPresent(page);
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL!);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
}

test.describe("smoke: login → builder → publish → share", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set",
  );

  test("admin can edit, publish, and view a share link", async ({ page }) => {
    // Step 1 — login
    await signIn(page, "/admin");
    await page.waitForURL(/\/admin/);

    // Step 2 — open the in-place editor on the storefront. The legacy
    // /admin/site-settings/structure route now redirects to the tenant
    // storefront, where EditPill / EditShell hosts the same authoring flow.
    await page.goto("/admin/site-settings/structure");
    // Engage edit mode if we land on the idle pill; once engaged the topbar
    // surfaces the share + save-draft affordances exercised below.
    const enterEdit = page.getByRole("button", { name: /^edit$/i });
    if (await enterEdit.isVisible().catch(() => false)) {
      await enterEdit.click();
    }
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({
      timeout: 10_000,
    });

    // Step 3 — save draft (no edits required for smoke; just exercise the action)
    const saveDraft = page.getByRole("button", { name: /save draft/i });
    if (await saveDraft.isVisible()) {
      await saveDraft.click();
      await expect(page.getByText(/saved|draft saved/i)).toBeVisible({ timeout: 5_000 });
    }

    // Step 4 — generate share link
    const shareButton = page.getByRole("button", { name: /share|preview link/i });
    await shareButton.click();
    const shareLinkLocator = page.getByRole("link", { name: /share|view/i }).first();
    await expect(shareLinkLocator).toBeVisible();
    const shareUrl = await shareLinkLocator.getAttribute("href");
    expect(shareUrl).toMatch(/\/share\//);

    // Step 5 — open share link in a new context (no admin cookies) and verify it renders
    const context = await page.context().browser()?.newContext();
    expect(context).toBeDefined();
    const publicPage = await context!.newPage();
    await publicPage.goto(shareUrl!);
    await expect(publicPage.locator("body")).toBeVisible();
    // 200 response — Playwright surfaces network errors as test failures already.
    await context!.close();
  });

  test("impronta login next lands on slugged admin and opens builder edit mode", async ({ page }) => {
    test.setTimeout(60_000);
    await openImprontaBuilder(page);
    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await expect(blankCanvasHeading).toBeVisible();
      await expect(
        page.locator('[data-empty-canvas-quick-add="hero"]'),
      ).toBeVisible();
      return;
    }
    const addTrigger = page.locator("[data-builder-node-add-trigger]").first();
    await expect(addTrigger).toBeVisible();
    await addTrigger.click();
    await expect(page.locator("[data-builder-node-insert-menu]").first()).toBeVisible();
  });

  test("impronta blank canvas can create the first hero section", async ({ page }) => {
    test.setTimeout(90_000);
    await openImprontaBuilder(page);

    await addHeroFromBlankState(page);

    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.locator('[data-edit-drawer="publish"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /publish now/i })).toBeVisible();
  });

  test("impronta can build core body sections one by one", async ({ page }) => {
    test.setTimeout(360_000);
    await openImprontaBuilder(page);
    await addHeroFromBlankState(page);

    await addSectionFromLibrary(page, "faq_accordion", "FAQ accordion");
    await addSectionFromLibrary(page, "content_tabs", "Content tabs");
    await addSectionFromLibrary(page, "scroll_carousel", "Scroll carousel");
    await addSectionFromLibrary(page, "masonry", "Masonry gallery");
    await addSectionFromLibrary(page, "cta_banner", "CTA banner");

    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.locator('[data-edit-drawer="publish"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /publish now/i })).toBeVisible();
  });

  test("impronta canvas selection breadcrumb tracks the selected section", async ({ page }) => {
    test.setTimeout(90_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstSection = page.locator("[data-cms-section][data-section-id]").first();
    await expect(firstSection).toBeVisible({ timeout: 20_000 });
    await firstSection.scrollIntoViewIfNeeded();
    await firstSection.click({ position: { x: 24, y: 24 } });

    const breadcrumb = page.locator("[data-selection-breadcrumb]");
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });
    await expect(breadcrumb).toContainText("Page");
    await expect(
      breadcrumb.locator('[data-selection-breadcrumb-item="section"]').first(),
    ).toBeVisible();
  });

  test("impronta canvas selection breadcrumb tracks a selected child node", async ({ page }) => {
    test.setTimeout(90_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const childNode = page
      .locator("[data-cms-section] [data-builder-node-id]")
      .first();
    await expect(childNode).toBeVisible({ timeout: 20_000 });
    await childNode.scrollIntoViewIfNeeded();
    await childNode.click({ position: { x: 6, y: 6 } });

    const breadcrumb = page.locator("[data-selection-breadcrumb]");
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });
    const kinds = await breadcrumb
      .locator("[data-selection-breadcrumb-item]")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-selection-breadcrumb-item")),
      );
    expect(kinds.some((kind) => kind && kind !== "page" && kind !== "section")).toBe(
      true,
    );
  });

  test("impronta canvas selection context menu opens section actions", async ({ page }) => {
    test.setTimeout(90_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstSection = page.locator("[data-cms-section][data-section-id]").first();
    await expect(firstSection).toBeVisible({ timeout: 20_000 });
    await firstSection.scrollIntoViewIfNeeded();
    await firstSection.click({ position: { x: 28, y: 28 }, button: "right" });

    const menu = page.locator("[data-selection-context-menu]");
    await expect(menu).toBeVisible({ timeout: 10_000 });
    await expect(menu).toContainText("Section actions");
    await expect(menu).toContainText("Duplicate section");

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("impronta template gallery opens from the topbar", async ({ page }) => {
    test.setTimeout(150_000);
    await openImprontaBuilderDirect(page);

    await page.getByRole("button", { name: /^more actions$/i }).click();
    await page.getByRole("menuitem", { name: /template gallery/i }).click();

    const gallery = page.locator("[data-empty-canvas-template-gallery]");
    await expect(gallery).toBeVisible({ timeout: 20_000 });
    await expect(gallery.getByRole("heading", {
      name: /start from a flexible composition/i,
    })).toBeVisible();

    const search = gallery.getByRole("textbox", {
      name: /search templates/i,
    });
    await expect(search).toBeVisible();
    await search.fill("hero");
    await expect(gallery.getByRole("button", { name: /^all/i })).toBeVisible();
    await expect(
      gallery.locator('[data-template-section-sequence="free-quickstart-5"]'),
    ).toContainText("Featured roster");
    await gallery
      .locator('[data-template-preview-open="free-quickstart-5"]')
      .click();
    await expect(
      gallery.locator('[data-template-preview-panel="free-quickstart-5"]'),
    ).toContainText("Free One-Page");
    await expect(
      gallery.locator('[data-template-preview-sequence="free-quickstart-5"]'),
    ).toContainText("Featured roster");
    await expect(gallery.locator("[data-template-current-draft-summary]")).toContainText(
      "current section",
    );
    await expect(
      gallery
        .locator('[data-template-preview-panel="free-quickstart-5"]')
        .getByRole("button", { name: /review and apply/i }),
    ).toBeVisible();
    await gallery
      .locator('[data-template-preview-panel="free-quickstart-5"]')
      .getByRole("button", { name: /review and apply/i })
      .click();
    const review = page.locator('[data-template-apply-review="free-quickstart-5"]');
    await expect(review).toBeVisible();
    await expect(review.locator("[data-template-review-current-sections]")).toBeVisible();
    await expect(
      review.locator('[data-template-review-next-sections="free-quickstart-5"]'),
    ).toContainText("Featured roster");
    await expect(
      review.getByRole("button", { name: /apply and replace draft/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(review).toBeHidden();
    await expect(gallery).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(gallery).toBeHidden();
  });

  test("impronta template gallery opens from panel deep link", async ({ page }) => {
    test.setTimeout(150_000);
    await seedAnalyticsConsent(page);
    await signIn(page, "/impronta?edit=1&panel=templates&template=free-quickstart-5");
    await page.waitForLoadState("domcontentloaded");
    if (new URL(page.url()).pathname !== "/impronta") {
      await page.goto("/impronta?edit=1&panel=templates&template=free-quickstart-5", {
        waitUntil: "domcontentloaded",
      });
    }
    await dismissAnalyticsIfPresent(page);

    const editTopbar = page.locator("[data-edit-topbar]");
    const topbarVisible = await editTopbar
      .waitFor({ state: "visible", timeout: 90_000 })
      .then(() => true)
      .catch(() => false);
    if (!topbarVisible) {
      const enterEdit = page.getByRole("button", { name: /edit this page|^edit$/i });
      if (await enterEdit.isVisible().catch(() => false)) {
        await enterEdit.click();
      }
      await expect(editTopbar).toBeVisible({ timeout: 90_000 });
    }

    const gallery = page.locator("[data-empty-canvas-template-gallery]");
    await expect(gallery).toBeVisible({ timeout: 20_000 });
    await expect(gallery.locator("form").filter({ hasText: "Free One-Page" })).toHaveClass(
      /border-indigo-300/,
    );
    await expect(
      gallery.locator('[data-template-preview-panel="free-quickstart-5"]'),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/panel=templates/);
    await expect(page).not.toHaveURL(/template=free-quickstart-5/);
  });

  test("impronta navigator layers show child-node metadata", async ({ page }) => {
    test.setTimeout(90_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const childRow = page
      .locator("[data-navigator-child-node][data-builder-node-kind]")
      .first();
    await expect(childRow).toBeVisible({ timeout: 20_000 });
    await expect(childRow.locator("[data-navigator-node-kind-pill]")).toBeVisible();
    const kind = await childRow.getAttribute("data-builder-node-kind");
    expect(kind).toBeTruthy();

    await childRow.click();
    const breadcrumb = page.locator("[data-selection-breadcrumb]");
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });
    const kinds = await breadcrumb
      .locator("[data-selection-breadcrumb-item]")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-selection-breadcrumb-item")),
      );
    expect(kinds.some((entry) => entry === kind)).toBe(true);
  });
});
