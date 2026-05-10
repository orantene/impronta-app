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

import { test, expect, type Locator, type Page } from "@playwright/test";

const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";
const ADMIN_EMAIL =
  process.env.TEST_ADMIN_EMAIL ?? (USE_DEV_SIGNIN ? "orantene@gmail.com" : undefined);
const ADMIN_PASSWORD =
  process.env.TEST_ADMIN_PASSWORD ?? (USE_DEV_SIGNIN ? "12341234" : undefined);

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

async function waitForImprontaDraftSaved(page: Page) {
  await expect(page.locator("[data-edit-topbar]").first()).toContainText(
    /Draft up to date|Draft saved/i,
    { timeout: 180_000 },
  );
}

async function insertHeadingViaNavigatorFirstLayeredSection(page: Page) {
  const sectionRow = page
    .locator("[data-navigator-section-row]")
    .filter({ has: page.locator("[data-navigator-block-count]") })
    .first();
  await expect(sectionRow).toBeVisible({ timeout: 30_000 });
  await sectionRow.hover();
  const trigger = sectionRow.locator("[data-builder-node-add-trigger]").first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  await trigger.click();
  const menu = page.locator("[data-builder-node-insert-menu]").first();
  await expect(menu).toBeVisible({ timeout: 15_000 });
  await menu.locator('[data-builder-node-insert-kind="heading"]').first().click();
  await menu.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
}

async function closeBuilderDrawersIfPresent(page: Page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const closeButtons = page
      .getByRole("button", { name: "Close drawer", exact: true })
      .filter({ visible: true });
    const count = await closeButtons.count();
    if (count === 0) return;
    await closeButtons.first().dispatchEvent("click");
    await page.waitForTimeout(150);
  }
}

async function getFirstSectionBlockAddTrigger(page: Page) {
  const firstSectionRow = page.locator("[data-navigator-section-row]").first();
  await expect(firstSectionRow).toBeVisible({ timeout: 30_000 });
  await firstSectionRow.hover();
  const trigger = firstSectionRow.locator("[data-builder-node-add-trigger]").first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  return trigger;
}

async function getSectionBlockAddTriggerForType(page: Page, sectionTypeKey: string) {
  const row = page
    .locator(`[data-navigator-section-row][data-section-type-key="${sectionTypeKey}"]`)
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.hover();
  const trigger = row.locator("[data-builder-node-add-trigger]").first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  return trigger;
}

async function insertBuilderNodeFromFirstSection(
  page: Page,
  kindLabel: string,
  nodeSelector: string,
) {
  const blocks = page.locator(nodeSelector);
  const readNodeIds = async () => {
    try {
      return await blocks.evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-builder-node-id"))
        .filter((id): id is string => Boolean(id)),
      );
    } catch {
      return [];
    }
  };
  const beforeNodeIds = new Set(await readNodeIds());
  const addBlock = await getFirstSectionBlockAddTrigger(page);
  await addBlock.click();

  const insertMenu = page.locator("[data-builder-node-insert-menu]").first();
  await expect(insertMenu).toBeVisible({ timeout: 10_000 });
  await insertMenu.getByRole("button", { name: kindLabel, exact: true }).click();

  const nodeId = await expect
    .poll(
      async () => {
        const nextNodeIds = await readNodeIds();
        return nextNodeIds.find((id) => !beforeNodeIds.has(id)) ?? null;
      },
      { timeout: 90_000 },
    )
    .not.toBeNull()
    .then(async () => {
      const nextNodeIds = await readNodeIds();
      return nextNodeIds.find((id) => !beforeNodeIds.has(id));
    });
  if (!nodeId) throw new Error(`Inserted ${kindLabel} did not expose a builder node id.`);
  const inserted = page.locator(`${nodeSelector}[data-builder-node-id="${nodeId}"]`);
  await expect(inserted).toBeVisible({ timeout: 20_000 });
  return { inserted, nodeId };
}

async function openStylePanelForBuilderNode(
  page: Page,
  node: Locator,
  kind: string,
) {
  await node.scrollIntoViewIfNeeded();
  await node.click({ position: { x: 8, y: 8 } });
  const styleTab = page.getByRole("tab", { name: "Style", exact: true });
  await expect(styleTab).toBeVisible({ timeout: 20_000 });
  await styleTab.click();
  const stylePanel = page.locator(`[data-builder-node-style-panel="${kind}"]`);
  await expect(stylePanel).toBeVisible({ timeout: 20_000 });
  return { styleTab, stylePanel };
}

async function clickStyleControl(
  panel: Locator,
  control: string,
  option: string,
) {
  await panel
    .locator(`[data-builder-node-style-control="${control}"]`)
    .getByRole("radio", { name: option, exact: true })
    .click();
}

async function readBuilderNodeOrder(page: Page, nodeIds: string[]) {
  const selector = nodeIds
    .map(
      (nodeId) =>
        `.site-builder-node[data-builder-node-id="${nodeId
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')}"]`,
    )
    .join(", ");
  try {
    return await page
      .locator(selector)
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-builder-node-id")),
      );
  } catch {
    return [];
  }
}

async function openImprontaBuilder(page: Page) {
  await seedAnalyticsConsent(page);
  await signIn(page, "/impronta/admin/site");
  await page.waitForLoadState("domcontentloaded");

  const builderEntry = page.getByRole("link", { name: /open page builder/i });
  const builderEntryVisible = await builderEntry
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (builderEntryVisible) {
    const builderHref = await builderEntry.getAttribute("href");
    expect(builderHref).toContain("/impronta?edit=1");
  }
  await ensureBuilderEditMode(page, "/impronta?edit=1&panel=sections");
  await expect(page.getByRole("button", { name: /^publish$/i })).toBeVisible({
    timeout: 30_000,
  });
  const builderUrl = new URL(page.url());
  expect(builderUrl.pathname === "/impronta" || builderUrl.pathname === "/impronta/").toBe(
    true,
  );
  await closeBuilderDrawersIfPresent(page);
  await dismissBuilderTipIfPresent(page);
}

async function openImprontaBuilderDirect(page: Page) {
  await seedAnalyticsConsent(page);
  await signIn(page, "/impronta?edit=1");
  await page.waitForLoadState("domcontentloaded");

  const current = new URL(page.url());
  if (current.pathname !== "/impronta") {
    await gotoWithRetry(page, "/impronta?edit=1", 4);
  }
  await ensureBuilderEditMode(page, "/impronta?edit=1");

  await expect(page.getByRole("button", { name: /^publish$/i })).toBeVisible({
    timeout: 30_000,
  });
  await closeBuilderDrawersIfPresent(page);
  await dismissBuilderTipIfPresent(page);
}

async function ensureBuilderEditMode(
  page: Page,
  targetUrl: string,
  attempts = 3,
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await gotoWithRetry(page, targetUrl, 4);
      await page.waitForLoadState("domcontentloaded");
      await dismissAnalyticsIfPresent(page);

      const editTopbar = page.locator("[data-edit-topbar]");
      const enterEdit = page
        .getByRole("button", { name: /edit this page|^edit$/i })
        .first();

      const firstEditState = await Promise.race([
        editTopbar
          .waitFor({ state: "visible", timeout: 25_000 })
          .then(() => "topbar" as const),
        enterEdit
          .waitFor({ state: "visible", timeout: 25_000 })
          .then(() => "pill" as const),
      ]).catch(() => null);

      if (firstEditState === "pill") {
        await enterEdit.click({ timeout: 15_000 });
      } else if (firstEditState === null) {
        const builderLink = page
          .getByRole("link", { name: /open page builder/i })
          .first();
        if (await builderLink.isVisible().catch(() => false)) {
          await builderLink.click();
        }
      }

      await expect(editTopbar).toBeVisible({ timeout: 45_000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await page.waitForTimeout(750 * attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to enter builder edit mode after retries.");
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

async function gotoWithRetry(
  page: Page,
  url: string,
  attempts = 3,
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
      });
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await page.waitForTimeout(500 * attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Navigation failed after retries.");
}

async function signIn(page: Page, nextPath = "/admin") {
  if (USE_DEV_SIGNIN) {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "PLAYWRIGHT_USE_DEV_SIGNIN=1 requires TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD or local dev defaults.",
      );
    }
    const params = new URLSearchParams({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      next: nextPath,
    });
    const response = await gotoWithRetry(
      page,
      `/api/dev/signin?${params.toString()}`,
      4,
    );
    expect(response?.ok()).toBeTruthy();
    return;
  }

  await gotoWithRetry(
    page,
    `/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`,
    4,
  );
  await dismissAnalyticsIfPresent(page);
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL!);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
}

async function removeBuilderNodeFromNavigator(page: Page, nodeId: string) {
  const node = page.locator(`[data-builder-node-id="${nodeId}"]`);
  if ((await node.count()) === 0) return;

  await page
    .locator("[data-edit-topbar]")
    .getByText(/saved/i)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => undefined);

  const waitForRemoved = async (timeout = 15_000) =>
    node
      .waitFor({ state: "detached", timeout })
      .then(() => true)
      .catch(() => false);

  const navigatorRow = page.locator(
    `[data-navigator-child-node][data-builder-node-id="${nodeId}"]`,
  );
  const rowVisible = await navigatorRow
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (rowVisible) {
    await navigatorRow.hover().catch(() => undefined);
    const removeTrigger = navigatorRow.locator("[data-builder-node-remove-trigger]");
    await expect(removeTrigger).toBeVisible({ timeout: 10_000 });
    await removeTrigger.dispatchEvent("click");
    if (await waitForRemoved()) return;
  }

  const canvasNode = page.locator(`.site-builder-node[data-builder-node-id="${nodeId}"]`);
  if ((await canvasNode.count()) === 0) return;
  await canvasNode.click({ force: true });
  const removeAction = page.locator(
    '[data-selection-chip][data-selection-chip-scope="block"] [data-selection-block-action="remove"]',
  );
  const removeVisible = await removeAction
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (removeVisible) {
    await removeAction.click({ force: true });
    const confirmRemove = page
      .getByRole("button", { name: /remove block\?|remove\?/i })
      .first();
    const confirmVisible = await confirmRemove
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (confirmVisible) {
      await confirmRemove.click({ force: true });
    } else if (await removeAction.isVisible().catch(() => false)) {
      await removeAction.click({ force: true });
    }
    await waitForRemoved(45_000);
  }
}

async function removeCmsSectionFromCanvas(page: Page, sectionId: string) {
  const section = page.locator(
    `[data-cms-section][data-section-id="${sectionId}"]`,
  );
  if ((await section.count()) === 0) return;

  const navigatorRow = page.locator(
    `[data-navigator-section-row][data-section-id="${sectionId}"]`,
  );
  const navigatorRowVisible = await navigatorRow
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (navigatorRowVisible) {
    await navigatorRow.click({ force: true });
  } else {
    await section.scrollIntoViewIfNeeded().catch(() => {});
    await section.click({ position: { x: 24, y: 24 }, force: true });
  }

  const selectionChip = page.locator(
    '[data-selection-chip][data-selection-chip-scope="section"]',
  );
  await expect(selectionChip).toBeVisible({ timeout: 20_000 });
  const removeButton = selectionChip.locator('button[aria-label="Remove section"]');
  await expect(removeButton).toBeVisible({ timeout: 10_000 });
  await removeButton.dispatchEvent("click");
  await selectionChip.getByText("Remove?", { exact: true }).dispatchEvent("click");
  await expect(section).toHaveCount(0, { timeout: 45_000 });
}

async function removeCmsSectionsByTypeAndText(
  page: Page,
  sectionTypeKey: string,
  text: string,
) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const section = page
      .locator(`[data-cms-section][data-section-type-key="${sectionTypeKey}"]`)
      .filter({ hasText: text })
      .first();
    const visible = await section
      .waitFor({ state: "visible", timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    if (!visible) return;
    const sectionId = await section.getAttribute("data-section-id");
    if (!sectionId) return;
    await removeCmsSectionFromCanvas(page, sectionId);
  }
}

test.describe("smoke: login → builder → publish → share", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !USE_DEV_SIGNIN && (!ADMIN_EMAIL || !ADMIN_PASSWORD),
    "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set",
  );

  test("admin can edit, publish, and view a share link", async ({ page }) => {
    const base = process.env.PLAYWRIGHT_BASE_URL ?? "";
    const forceLegacy =
      process.env.PLAYWRIGHT_LEGACY_ADMIN_SMOKE === "1";
    test.skip(
      USE_DEV_SIGNIN &&
        (base.includes("localhost") || base.includes("127.0.0.1")) &&
        !forceLegacy,
      "On localhost the legacy /admin smoke does not match slugged tenant routes (e.g. /impronta). Run Impronta tests or set PLAYWRIGHT_LEGACY_ADMIN_SMOKE=1 with a host-proxy base URL.",
    );

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
    const firstSectionRow = page.locator("[data-navigator-section-row]").first();
    await expect(firstSectionRow).toBeVisible({ timeout: 30_000 });
    await firstSectionRow.hover();
    const addTrigger = firstSectionRow.locator("[data-builder-node-add-trigger]").first();
    await expect(addTrigger).toBeVisible();
    await addTrigger.click();
    await expect(page.locator("[data-builder-node-insert-menu]").first()).toBeVisible();
  });

  test("impronta blank canvas can create the first hero section", async ({ page }) => {
    test.setTimeout(90_000);
    await openImprontaBuilder(page);

    const blankHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (!(await blankHeading.isVisible().catch(() => false))) {
      test.skip(
        true,
        "Homepage already has sections — use impronta-local-qa-homepage-baseline.sql reset or an empty tenant for this smoke.",
      );
    }

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

    const blankHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (!(await blankHeading.isVisible().catch(() => false))) {
      test.skip(
        true,
        "Requires blank homepage — reset draft composition or use an empty tenant.",
      );
    }

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

  test("impronta selection overlay uses sharp corners in edit mode", async ({ page }) => {
    test.setTimeout(90_000);
    await openImprontaBuilderDirect(page);

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

    const selectionRing = page.locator("[data-selection-ring]");
    const selectionChip = page.locator("[data-selection-chip]");
    await expect(selectionRing).toBeVisible({ timeout: 10_000 });
    await expect(selectionChip).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () => (await selectionRing.getAttribute("style")) ?? "", {
        timeout: 10_000,
      })
      .toMatch(/border-radius:\s*0(px)?/i);

    await expect
      .poll(async () => (await selectionChip.getAttribute("style")) ?? "", {
        timeout: 10_000,
      })
      .toMatch(/border-radius:\s*0(px)?/i);
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

  test("impronta renders inserted freeform builder nodes on the canvas", async ({ page }) => {
    test.setTimeout(300_000);
    await openImprontaBuilderDirect(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const beforeHeadingCount = await page
      .locator(".site-builder-node--heading[data-builder-node-id]")
      .filter({ hasText: "Heading" })
      .count();
    const addBlock = await getFirstSectionBlockAddTrigger(page);
    await addBlock.click();

    const insertMenu = page.locator("[data-builder-node-insert-menu]").first();
    await expect(insertMenu).toBeVisible({ timeout: 10_000 });
    await insertMenu.getByRole("button", { name: "Heading", exact: true }).click();

    const headingBlocks = page
      .locator(".site-builder-node--heading[data-builder-node-id]")
      .filter({ hasText: "Heading" });
    await expect
      .poll(async () => headingBlocks.count(), {
        timeout: 90_000,
      })
      .toBeGreaterThan(beforeHeadingCount);
    const headingCount = await headingBlocks.count();
    const insertedHeading = headingBlocks.nth(headingCount - 1);
    await expect(insertedHeading).toBeVisible({ timeout: 90_000 });
    const addedNodeId = await insertedHeading.getAttribute("data-builder-node-id");
    expect(addedNodeId).toBeTruthy();
    if (!addedNodeId) throw new Error("Inserted heading did not expose a builder node id.");
    const renderedHeading = page.locator(
      `.site-builder-node--heading[data-builder-node-id="${addedNodeId}"]`,
    );
    await expect(renderedHeading).toBeVisible({ timeout: 90_000 });
    await expect(
      page.locator(`[data-navigator-child-node][data-builder-node-id="${addedNodeId}"]`),
    ).toBeVisible({ timeout: 90_000 });
    const cleanupNodeIds = [addedNodeId];
    try {
      await renderedHeading.click({ position: { x: 6, y: 6 } });
      const breadcrumb = page.locator("[data-selection-breadcrumb]");
      const selectedFromPointer = await breadcrumb
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (!selectedFromPointer) {
        await page.evaluate((nodeId) => {
          const el = document.querySelector<HTMLElement>(
            `.site-builder-node--heading[data-builder-node-id="${CSS.escape(nodeId)}"]`,
          );
          el?.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
        }, addedNodeId);
      }
      await expect(breadcrumb).toContainText(
        "Heading",
        { timeout: 20_000 },
      );
      const blockChip = page.locator('[data-selection-chip][data-selection-chip-scope="block"]');
      await expect(blockChip).toBeVisible({ timeout: 20_000 });
      await expect(blockChip).toContainText("Heading");
      await expect(blockChip).toContainText("Block");
      await expect(
        blockChip.locator('[data-selection-block-action="edit"]'),
      ).toBeVisible();
      await expect(
        blockChip.locator('[data-selection-block-action="duplicate"]'),
      ).toBeVisible();
      await expect(
        blockChip.locator('[data-selection-block-action="move-up"]'),
      ).toBeVisible();
      await expect(
        blockChip.locator('[data-selection-block-action="move-down"]'),
      ).toBeVisible();
      await expect(
        blockChip.locator('[data-selection-block-action="remove"]'),
      ).toBeVisible();
      await expect(page.getByText("Heading node")).toBeVisible({ timeout: 20_000 });

      const paragraphBlocks = page.locator(
        ".site-builder-node--paragraph[data-builder-node-id]",
      );
      const beforeParagraphCount = await paragraphBlocks.count();
      await blockChip.locator('[data-selection-block-action="add-after"]').click();
      const canvasInsertMenu = page.locator("[data-builder-node-canvas-insert-menu]");
      await expect(canvasInsertMenu).toBeVisible({ timeout: 10_000 });
      await canvasInsertMenu
        .locator('[data-builder-node-canvas-insert-kind="paragraph"]')
        .click({ force: true, timeout: 10_000 });
      await expect(paragraphBlocks).toHaveCount(beforeParagraphCount + 1, {
        timeout: 90_000,
      });
      const afterParagraphCount = await paragraphBlocks.count();
      const insertedParagraph = paragraphBlocks.nth(afterParagraphCount - 1);
      const paragraphNodeId = await insertedParagraph.getAttribute(
        "data-builder-node-id",
      );
      if (paragraphNodeId) {
        cleanupNodeIds.unshift(paragraphNodeId);
        await insertedParagraph.click({ position: { x: 6, y: 6 } });
        const paragraphSelected = await blockChip
          .filter({ hasText: "Paragraph" })
          .waitFor({ state: "visible", timeout: 3_000 })
          .then(() => true)
          .catch(() => false);
        if (!paragraphSelected) {
          await page.evaluate((nodeId) => {
            const el = document.querySelector<HTMLElement>(
              `.site-builder-node--paragraph[data-builder-node-id="${CSS.escape(nodeId)}"]`,
            );
            el?.dispatchEvent(
              new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window,
              }),
            );
          }, paragraphNodeId);
        }
        await expect(blockChip).toContainText("Paragraph", { timeout: 20_000 });
        const moveUpAction = blockChip.locator(
          '[data-selection-block-action="move-up"]',
        );
        await expect(moveUpAction).toBeEnabled({ timeout: 90_000 });
        await moveUpAction.click({ timeout: 10_000 });
        await expect
          .poll(
            async () =>
              readBuilderNodeOrder(page, [paragraphNodeId, addedNodeId]),
            { timeout: 90_000 },
          )
          .toEqual([paragraphNodeId, addedNodeId]);
        const moveDownAction = blockChip.locator(
          '[data-selection-block-action="move-down"]',
        );
        await expect(moveDownAction).toBeEnabled({ timeout: 90_000 });
        await moveDownAction.click({ timeout: 10_000 });
        await expect
          .poll(
            async () =>
              readBuilderNodeOrder(page, [paragraphNodeId, addedNodeId]),
            { timeout: 90_000 },
          )
          .toEqual([addedNodeId, paragraphNodeId]);
      }
      await renderedHeading.click({ position: { x: 6, y: 6 } });
      await expect(blockChip).toBeVisible({ timeout: 20_000 });

      const beforeDuplicateCount = await headingBlocks.count();
      await blockChip.locator('[data-selection-block-action="duplicate"]').click();
      await expect(headingBlocks).toHaveCount(beforeDuplicateCount + 1, {
        timeout: 90_000,
      });
      const afterDuplicateCount = await headingBlocks.count();
      const duplicatedHeading = headingBlocks.nth(afterDuplicateCount - 1);
      const duplicatedNodeId = await duplicatedHeading.getAttribute(
        "data-builder-node-id",
      );
      if (duplicatedNodeId && duplicatedNodeId !== addedNodeId) {
        cleanupNodeIds.unshift(duplicatedNodeId);
      }
      await renderedHeading.click({ position: { x: 6, y: 6 } });

      await blockChip.locator('[data-selection-block-action="edit"]').click();
      const inlineEditor = page.getByLabel("Inline canvas editor");
      await expect(inlineEditor).toBeVisible({ timeout: 20_000 });
      await inlineEditor.click();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await page.keyboard.type("Canvas edited heading");
      await expect(inlineEditor).toContainText("Canvas edited heading");
      await page.getByRole("button", { name: "Apply inline edit" }).click();
      await expect(
        page
          .locator(".site-builder-node--heading[data-builder-node-id]")
          .filter({ hasText: "Canvas edited heading" })
        .first(),
    ).toBeVisible({ timeout: 90_000 });

      const carouselBlocks = page.locator(
        ".site-builder-node--carousel[data-builder-node-id]",
      );
      const beforeCarouselCount = await carouselBlocks.count();
      const secondAddBlock = await getFirstSectionBlockAddTrigger(page);
      await secondAddBlock.click();
      const secondInsertMenu = page.locator("[data-builder-node-insert-menu]").first();
      await expect(secondInsertMenu).toBeVisible({ timeout: 10_000 });
      await secondInsertMenu
        .getByRole("button", { name: "Carousel", exact: true })
        .click();
      await expect(carouselBlocks).toHaveCount(beforeCarouselCount + 1, {
        timeout: 90_000,
      });
      const carouselCount = await carouselBlocks.count();
      const insertedCarousel = carouselBlocks.nth(carouselCount - 1);
      const carouselNodeId = await insertedCarousel.getAttribute(
        "data-builder-node-id",
      );
      if (carouselNodeId) {
        cleanupNodeIds.unshift(carouselNodeId);
      }
      await expect(
        insertedCarousel.locator(".site-builder-node--carousel-track"),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        insertedCarousel.getByRole("link", { name: "Next slide" }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        insertedCarousel.getByRole("link", { name: "Go to slide 2" }),
      ).toBeVisible({ timeout: 20_000 });
      const track = insertedCarousel.locator(".site-builder-node--carousel-track");
      const beforeScrollLeft = await track.evaluate((el) => el.scrollLeft);
      await insertedCarousel.getByRole("link", { name: "Next slide" }).click();
      await expect
        .poll(() => track.evaluate((el) => el.scrollLeft), {
          timeout: 20_000,
        })
        .toBeGreaterThan(beforeScrollLeft);
    } finally {
      for (const nodeId of cleanupNodeIds) {
        await removeBuilderNodeFromNavigator(page, nodeId);
      }
    }
  });

  test("impronta blank_section composition inserts heading via navigator add block", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openImprontaBuilderDirect(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    await addSectionFromLibrary(page, "blank_section", "Blank section");

    const blankWrap = page
      .locator('[data-cms-section][data-section-type-key="blank_section"]')
      .first();
    await expect(blankWrap).toBeVisible({ timeout: 90_000 });

    const headingsInBlank = blankWrap.locator(
      ".site-builder-node--heading[data-builder-node-id]",
    );
    const beforeHeadingCount = await headingsInBlank.count();

    const addBlock = await getSectionBlockAddTriggerForType(page, "blank_section");
    await addBlock.click();

    const insertMenu = page.locator("[data-builder-node-insert-menu]").first();
    await expect(insertMenu).toBeVisible({ timeout: 10_000 });
    await insertMenu.getByRole("button", { name: "Heading", exact: true }).click();

    await expect
      .poll(async () => headingsInBlank.count(), { timeout: 90_000 })
      .toBeGreaterThan(beforeHeadingCount);
    await expect(headingsInBlank.first()).toBeVisible({ timeout: 90_000 });
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
    const homeCoreCard = gallery.locator('[data-template-card="home-core-4"]');
    const hasHomeCoreCard = (await homeCoreCard.count()) > 0;
    if (hasHomeCoreCard) {
      await expect(homeCoreCard).toContainText("Home Core 4");
    }

    const search = gallery.getByRole("textbox", {
      name: /search templates/i,
    });
    await expect(search).toBeVisible();
    await search.fill("hero");
    await expect(gallery.getByRole("button", { name: /^all/i })).toBeVisible();
    await expect(
      gallery.locator('[data-template-section-sequence="free-quickstart-5"]'),
    ).toContainText("Featured roster");
    const savedTemplateDetails = gallery
      .locator("details")
      .filter({ hasText: "Templates" });
    await expect(savedTemplateDetails).toBeVisible({ timeout: 30_000 });
    await savedTemplateDetails.locator("summary").click();
    const savedTemplateSavePanel = savedTemplateDetails.locator(
      "[data-workspace-template-save-panel]",
    );
    await expect(savedTemplateSavePanel).toBeVisible({ timeout: 20_000 });
    await expect(savedTemplateSavePanel).toContainText("Current draft");
    await expect(savedTemplateSavePanel).toContainText("Published live");
    await savedTemplateSavePanel.getByRole("button", { name: "Published live" }).click();
    await expect(savedTemplateSavePanel).toContainText("Published source selected");
    await gallery
      .locator('[data-template-preview-open="free-quickstart-5"]')
      .click();
    await expect(
      gallery.locator('[data-template-preview-panel="free-quickstart-5"]'),
    ).toContainText("Free One-Page");
    await expect(
      gallery.locator('[data-template-preview-sequence="free-quickstart-5"]'),
    ).toContainText("Featured roster");
    await gallery.locator("[data-template-home-core-toggle]").click();
    if (hasHomeCoreCard) {
      await expect(homeCoreCard).toBeVisible();
    }
    await expect(
      gallery.locator('[data-template-card="restaurant"]'),
    ).toHaveCount(0);
    await gallery.locator("[data-template-home-core-toggle]").click();
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
    const homeCoreLockToggle = review.locator("[data-template-lock-home-core-toggle]");
    await expect(homeCoreLockToggle).toContainText("Home core locked");
    const reviewRows = review
      .locator('[data-template-review-next-sections="free-quickstart-5"] li')
      .locator("input[type='checkbox']");
    await expect(reviewRows.first()).toBeDisabled();
    await homeCoreLockToggle.click();
    await expect(homeCoreLockToggle).toContainText("Home core unlocked");
    await expect(reviewRows.first()).toBeEnabled();
    await expect(
      review.getByRole("button", { name: /^apply /i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(review).toBeHidden();
    await expect(gallery).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(gallery).toBeHidden();
  });

  test("impronta section picker exposes starter templates", async ({ page }) => {
    test.setTimeout(120_000);
    await openImprontaBuilderDirect(page);

    const addSection = page.getByRole("button", { name: /^add a section$/i }).first();
    await expect(addSection).toBeVisible({ timeout: 20_000 });
    await addSection.click();

    const picker = page.locator('[data-edit-drawer="picker"]');
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await expect(picker).toContainText("Homepage kits");
    const directoryHomeKit = picker.locator(
      '[data-section-template-kit="directory-home-4"]',
    );
    await expect(directoryHomeKit).toContainText("Directory Home");
    await expect(directoryHomeKit).toHaveAttribute("draggable", "true");
    await expect(directoryHomeKit).toHaveAttribute(
      "data-section-template-kit-home-core-count",
      "4",
    );
    await expect(directoryHomeKit).toHaveAttribute(
      "data-section-template-kit-data-count",
      "3",
    );
    await expect(directoryHomeKit).toHaveAttribute(
      "data-section-template-compatible",
      "true",
    );
    const proofStackKit = picker.locator('[data-section-template-kit="proof-stack-4"]');
    await expect(proofStackKit).toContainText("Proof Stack");
    await expect(proofStackKit).toHaveAttribute(
      "data-section-template-kit-section-count",
      "4",
    );
    await directoryHomeKit.click();
    const kitReview = page.locator('[data-section-kit-review="directory-home-4"]');
    await expect(kitReview).toBeVisible();
    await expect(kitReview).toContainText("Directory Search Hero");
    await expect(kitReview).toContainText("Featured Talent Grid");
    await expect(kitReview).toContainText("Recipe:");
    await expect(
      kitReview.locator('[data-section-kit-review-row="featured-talent-live-grid"]'),
    ).toHaveAttribute(
      "data-section-kit-review-data-binding",
      "featured_talent_profiles",
    );
    await expect(
      kitReview.locator('[data-section-kit-review-row="featured-talent-live-grid"]'),
    ).toHaveAttribute("data-section-kit-review-edit-model", "live-data");
    await expect(
      kitReview.locator('[data-section-kit-review-row="featured-talent-live-grid"]'),
    ).toHaveAttribute("data-section-kit-review-capabilities", /data/);
    await expect(kitReview).toContainText("Starting style");
    await expect(kitReview).toContainText("Compact brief");
    await expect(kitReview.getByRole("button", { name: /add selected/i })).toBeVisible();
    await kitReview
      .locator('[data-section-kit-review-row="directory-search-hero"]')
      .getByRole("button", { name: /compact brief/i })
      .dispatchEvent("click");
    await expect(kitReview).toContainText("1 style override");
    await kitReview.getByRole("button", { name: /^clear$/i }).click();
    await expect(kitReview).toContainText("0 of 4 sections selected");
    await expect(kitReview.getByRole("button", { name: /add selected/i })).toBeDisabled();
    await kitReview.getByRole("button", { name: /^select all$/i }).click();
    await expect(kitReview).toContainText("4 of 4 sections selected");
    await expect(kitReview.getByRole("button", { name: /add selected/i })).toBeEnabled();
    await kitReview
      .locator('[data-section-kit-review-row="explore-by-location-map"] input')
      .uncheck();
    await expect(kitReview).toContainText("3 of 4 sections selected");
    await kitReview.getByRole("button", { name: /^reset$/i }).click();
    await expect(kitReview).toContainText("4 of 4 sections selected");
    await kitReview.getByRole("button", { name: /^cancel$/i }).click();
    await expect(kitReview).toBeHidden();
    await expect(picker).toContainText("Starter section templates");
    const featuredTalentStarter = picker.locator(
      '[data-section-template-starter="featured-talent-live-grid"]',
    );
    await expect(featuredTalentStarter).toContainText("Featured Talent Grid");
    await expect(featuredTalentStarter).toHaveAttribute("draggable", "true");
    await expect(featuredTalentStarter).toHaveAttribute(
      "data-section-template-home-core",
      "true",
    );
    await expect(featuredTalentStarter).toHaveAttribute(
      "data-section-template-section-type",
      "featured_talent",
    );
    await expect(featuredTalentStarter).toHaveAttribute(
      "data-section-template-style-count",
      "2",
    );
    await expect(featuredTalentStarter).toHaveAttribute(
      "data-section-template-data-binding",
      "featured_talent_profiles",
    );
    await expect(featuredTalentStarter).toHaveAttribute(
      "data-section-template-edit-model",
      "live-data",
    );
    await expect(featuredTalentStarter).toHaveAttribute(
      "data-section-template-capabilities",
      /content.*layout.*data/,
    );
    await expect(featuredTalentStarter).toHaveAttribute(
      "data-section-template-compatible",
      "true",
    );
    const facetFiltersDisclosure = picker.locator(
      "[data-section-template-filters-disclosure]",
    );
    if (await facetFiltersDisclosure.isVisible().catch(() => false)) {
      await facetFiltersDisclosure.click();
    }
    const capabilityFilter = picker.locator(
      "[data-section-template-capability-filter]",
    );
    await expect(capabilityFilter).toBeVisible();
    await capabilityFilter.selectOption("data");
    await expect(featuredTalentStarter).toBeVisible();
    await capabilityFilter.selectOption("media");
    await expect(featuredTalentStarter).toBeHidden();
    await capabilityFilter.selectOption("all");
    await expect(featuredTalentStarter).toBeVisible();
    await expect(featuredTalentStarter).toContainText("Roster talent");
    await expect(featuredTalentStarter).toContainText("Recipe");
    const headerSection = page
      .locator('[data-cms-section][data-slot-key="header"]')
      .first();
    if (await headerSection.isVisible().catch(() => false)) {
      const headerCountBefore = await page
        .locator('[data-cms-section][data-slot-key="header"]')
        .count();
      const headerBox = await headerSection.boundingBox();
      expect(headerBox).not.toBeNull();
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
      await featuredTalentStarter.dispatchEvent("dragstart", { dataTransfer });
      await page.waitForTimeout(100);
      await page.evaluate(
        ({ x, y, dt }) => {
          window.dispatchEvent(
            new DragEvent("dragover", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              dataTransfer: dt,
            }),
          );
          window.dispatchEvent(
            new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              dataTransfer: dt,
            }),
          );
        },
        {
          x: headerBox!.x + Math.min(24, headerBox!.width / 2),
          y: headerBox!.y + Math.min(24, headerBox!.height / 2),
          dt: dataTransfer,
        },
      );
      await featuredTalentStarter.dispatchEvent("dragend", { dataTransfer });
      await dataTransfer.dispose();
      await expect(picker).toContainText(/header.*(not available|only accepts)/i);
      await expect(
        page.locator('[data-cms-section][data-slot-key="header"]'),
      ).toHaveCount(headerCountBefore);
    }
    await featuredTalentStarter.click();
    const starterReview = page.locator(
      '[data-section-starter-review="featured-talent-live-grid"]',
    );
    await expect(starterReview).toBeVisible();
    await expect(starterReview).toContainText("Review section");
    await expect(starterReview).toContainText("Starting style");
    await expect(starterReview).toContainText("Editorial grid");
    await expect(starterReview).toContainText("Tight roster");
    await expect(starterReview).toContainText("Database: featured talent profiles.");
    await expect(starterReview).toContainText("Roster talent");
    await expect(starterReview).toContainText("Component recipe");
    await expect(starterReview).toContainText("live profile cards");
    await starterReview.getByRole("button", { name: "Tight roster" }).click();
    await expect(starterReview.getByRole("button", { name: /add section/i })).toBeVisible();
    await starterReview.getByRole("button", { name: /^cancel$/i }).click();
    await expect(starterReview).toBeHidden();
    await expect(
      picker.locator('[data-section-template-starter="explore-by-location-map"]'),
    ).toContainText("Explore by Location");

    const search = picker.locator("input").first();
    await search.fill("database");
    await expect(
      picker.locator('[data-section-template-starter="featured-talent-live-grid"]'),
    ).toBeVisible();
    await search.fill("live talent source controls");
    await expect(
      picker.locator('[data-section-template-starter="featured-talent-live-grid"]'),
    ).toBeVisible();
    await search.fill("");

    const kindFilter = picker.locator("[data-section-template-kind-filter]");
    const sourceFilter = picker.locator("[data-section-template-source-filter]");
    const readinessFilter = picker.locator("[data-section-template-readiness-filter]");
    const dataFilter = picker.locator("[data-section-template-data-filter]");
    const planFilter = picker.locator("[data-section-template-plan-filter]");
    await expect(kindFilter).toBeVisible();
    await expect(sourceFilter).toBeVisible();
    await expect(readinessFilter).toBeVisible();
    await expect(dataFilter).toBeVisible();
    await expect(planFilter).toBeVisible();

    await kindFilter.selectOption("data");
    await expect
      .poll(async () =>
        picker
          .locator("[data-section-template-starter]")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-section-template-kind")),
          ),
      )
      .toEqual(expect.arrayContaining(["data"]));
    await expect(
      picker.locator('[data-section-template-starter][data-section-template-kind="design"]'),
    ).toHaveCount(0);

    await sourceFilter.selectOption("live-data");
    await expect
      .poll(async () =>
        picker
          .locator("[data-section-template-starter]")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-section-template-source")),
          ),
      )
      .toEqual(expect.arrayContaining(["live-data"]));
    await expect(
      picker.locator(
        '[data-section-template-starter][data-section-template-source="navigation"]',
      ),
    ).toHaveCount(0);

    await readinessFilter.selectOption("needs-setup");
    await expect
      .poll(async () =>
        picker
          .locator("[data-section-template-starter]")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-section-template-readiness")),
          ),
      )
      .toEqual(expect.arrayContaining(["needs-setup"]));
    await expect(
      picker.locator(
        '[data-section-template-starter][data-section-template-readiness="ready-now"]',
      ),
    ).toHaveCount(0);

    await sourceFilter.selectOption("all");
    await readinessFilter.selectOption("all");
    await dataFilter.selectOption("featured_talent_profiles");
    await expect(
      picker.locator(
        '[data-section-template-starter][data-section-template-data-binding="featured_talent_profiles"]',
      ),
    ).toBeVisible();
    await expect(
      picker.locator(
        '[data-section-template-starter][data-section-template-data-binding="asset"]',
      ),
    ).toHaveCount(0);

    await picker.locator("[data-section-template-filters-reset]").click();
    await planFilter.selectOption("studio");
    await expect(
      picker.locator(
        '[data-section-template-starter][data-section-template-required-plan="studio"]',
      ),
    ).toHaveCount(3);
    await expect(
      picker.locator(
        '[data-section-template-starter][data-section-template-required-plan="free"]',
      ),
    ).toHaveCount(0);
    await picker.locator("[data-section-template-filters-reset]").click();
    await expect(
      picker.locator('[data-section-template-starter="editorial-photo-story"]'),
    ).toBeVisible();
    await search.fill("metrics proof");
    const metricsProofStarter = picker.locator(
      '[data-section-template-starter="agency-metrics-proof"]',
    );
    await expect(metricsProofStarter).toBeVisible();
    await metricsProofStarter.click();
    const metricsReview = page.locator(
      '[data-section-starter-review="agency-metrics-proof"]',
    );
    await expect(metricsReview).toBeVisible();
    await expect(metricsReview).toContainText("Agency Metrics Proof");
    await expect(metricsReview).toContainText("Split proof");
    await metricsReview.getByRole("button", { name: /^cancel$/i }).click();
    await expect(metricsReview).toBeHidden();
    await search.fill("");

    await picker.locator("[data-section-library-saved-templates]").click();
    await expect(page.locator("[data-empty-canvas-template-gallery]")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('[data-edit-drawer="picker"]')).toBeHidden();
  });

  test("impronta starter template inserts a real section and cleans up", async ({ page }) => {
    test.setTimeout(150_000);
    await openImprontaBuilderDirect(page);
    const metricsProofHeadline =
      "Proof points for high-touch casting and production briefs.";
    await removeCmsSectionsByTypeAndText(page, "stats", metricsProofHeadline);

    const statsSections = page.locator(
      '[data-cms-section][data-section-type-key="stats"]',
    );
    const beforeStatsIds = new Set(
      await statsSections.evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-section-id"))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    let insertedSectionId: string | null = null;

    try {
      const addSection = page.getByRole("button", { name: /^add a section$/i }).first();
      await expect(addSection).toBeVisible({ timeout: 20_000 });
      await addSection.click();

      const picker = page.locator('[data-edit-drawer="picker"]');
      await expect(picker).toBeVisible({ timeout: 10_000 });
      const search = picker.locator("input").first();
      await search.fill("metrics proof");

      const metricsProofStarter = picker.locator(
        '[data-section-template-starter="agency-metrics-proof"]',
      );
      await expect(metricsProofStarter).toBeVisible({ timeout: 15_000 });
      await metricsProofStarter.click();

      const metricsReview = page.locator(
        '[data-section-starter-review="agency-metrics-proof"]',
      );
      await expect(metricsReview).toBeVisible();
      await metricsReview.getByRole("button", { name: "Split proof" }).click();
      await metricsReview.getByRole("button", { name: /add section/i }).click();
      await expect(metricsReview).toBeHidden({ timeout: 45_000 });

      await expect
        .poll(async () => {
          const ids = await statsSections.evaluateAll((nodes) =>
            nodes
              .map((node) => node.getAttribute("data-section-id"))
              .filter((id): id is string => Boolean(id)),
          );
          return ids.find((id) => !beforeStatsIds.has(id)) ?? null;
        }, { timeout: 90_000 })
        .not.toBeNull();

      const currentStatsIds = await statsSections.evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-section-id"))
          .filter((id): id is string => Boolean(id)),
      );
      insertedSectionId =
        currentStatsIds.find((id) => !beforeStatsIds.has(id)) ?? null;

      expect(insertedSectionId).toBeTruthy();
      const insertedSection = page.locator(
        `[data-cms-section][data-section-id="${insertedSectionId}"]`,
      );
      await expect(insertedSection).toBeVisible({ timeout: 90_000 });
      await expect(insertedSection).toContainText(metricsProofHeadline);
      await expect(insertedSection).toContainText("24h");
      await expect(insertedSection).toContainText("shortlist window");
    } finally {
      if (insertedSectionId) {
        await removeCmsSectionFromCanvas(page, insertedSectionId);
      }
      await removeCmsSectionsByTypeAndText(page, "stats", metricsProofHeadline);
    }
  });

  test("impronta starter kit inserts a sequence and cleans up", async ({ page }) => {
    test.setTimeout(210_000);
    await openImprontaBuilderDirect(page);

    const proofHeroText = "A sharper way to shape the talent shortlist.";
    const proofStatsText = "Built for briefs that need speed, taste, and control.";
    const proofTestimonialsText =
      "Trusted for briefs where the shortlist has to feel exact.";
    await removeCmsSectionsByTypeAndText(page, "hero_split", proofHeroText);
    await removeCmsSectionsByTypeAndText(page, "stats", proofStatsText);
    await removeCmsSectionsByTypeAndText(
      page,
      "testimonials_trio",
      proofTestimonialsText,
    );

    const allCanvasSections = page.locator("[data-cms-section][data-section-id]");
    const beforeSectionIds = new Set(
      await allCanvasSections.evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-section-id"))
          .filter((id): id is string => Boolean(id) && !id.startsWith("__")),
      ),
    );
    const insertedSectionIds: string[] = [];

    try {
      const addSection = page.getByRole("button", { name: /^add a section$/i }).first();
      await expect(addSection).toBeVisible({ timeout: 20_000 });
      await addSection.click();

      const picker = page.locator('[data-edit-drawer="picker"]');
      await expect(picker).toBeVisible({ timeout: 10_000 });
      const search = picker.locator("input").first();
      await search.fill("proof stack");

      const proofStackKit = picker.locator('[data-section-template-kit="proof-stack-4"]');
      await expect(proofStackKit).toBeVisible({ timeout: 15_000 });
      await proofStackKit.click();

      const kitReview = page.locator('[data-section-kit-review="proof-stack-4"]');
      await expect(kitReview).toBeVisible();
      await expect(kitReview).toContainText("Visual Story Hero Split");
      await expect(kitReview).toContainText("Agency Metrics Proof");
      await expect(kitReview).toContainText("Client Testimonial Proof");
      await kitReview.getByRole("button", { name: /add selected/i }).click();
      await expect(kitReview).toBeHidden({ timeout: 90_000 });

      await expect
        .poll(async () => {
          const ids = await allCanvasSections.evaluateAll((nodes) =>
            nodes
              .map((node) => node.getAttribute("data-section-id"))
              .filter((id): id is string => Boolean(id) && !id.startsWith("__")),
          );
          return ids.filter((id) => !beforeSectionIds.has(id)).length;
        }, { timeout: 120_000 })
        .toBeGreaterThanOrEqual(4);

      const currentSectionIds = await allCanvasSections.evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-section-id"))
          .filter((id): id is string => Boolean(id) && !id.startsWith("__")),
      );
      insertedSectionIds.push(
        ...currentSectionIds.filter((id) => !beforeSectionIds.has(id)),
      );

      const insertedSections = insertedSectionIds.map((sectionId) =>
        page.locator(`[data-cms-section][data-section-id="${sectionId}"]`),
      );
      await expect(
        page
          .locator('[data-cms-section][data-section-type-key="hero_split"]')
          .filter({ hasText: proofHeroText }),
      ).toBeVisible({ timeout: 45_000 });
      await expect(
        page
          .locator('[data-cms-section][data-section-type-key="stats"]')
          .filter({ hasText: proofStatsText }),
      ).toBeVisible({ timeout: 45_000 });
      await expect(
        page
          .locator('[data-cms-section][data-section-type-key="testimonials_trio"]')
          .filter({ hasText: proofTestimonialsText }),
      ).toBeVisible({ timeout: 45_000 });
      for (const insertedSection of insertedSections) {
        await expect(insertedSection).toBeVisible({ timeout: 45_000 });
      }
    } finally {
      for (const sectionId of [...insertedSectionIds].reverse()) {
        await removeCmsSectionFromCanvas(page, sectionId);
      }
      await removeCmsSectionsByTypeAndText(page, "hero_split", proofHeroText);
      await removeCmsSectionsByTypeAndText(page, "stats", proofStatsText);
      await removeCmsSectionsByTypeAndText(
        page,
        "testimonials_trio",
        proofTestimonialsText,
      );
    }
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

  test("impronta pages menu opens from panel deep link", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAnalyticsConsent(page);
    await signIn(page, "/impronta?edit=1&panel=pages");
    await page.waitForLoadState("domcontentloaded");
    if (new URL(page.url()).pathname !== "/impronta") {
      await page.goto("/impronta?edit=1&panel=pages", {
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

    await expect(page).not.toHaveURL(/panel=pages/);

    const picker = page.locator("[data-page-picker]");
    await expect(picker.getByRole("menu")).toBeVisible({ timeout: 15_000 });
    await expect(
      picker.getByRole("menuitem", { name: /manage pages/i }),
    ).toBeVisible();
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

    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();
    const childRow = page
      .locator("[data-navigator-child-node][data-builder-node-kind]")
      .first();
    await expect(childRow).toBeVisible({ timeout: 20_000 });
    await expect(childRow.locator("[data-navigator-node-kind-pill]")).toBeVisible();
    const kind = await childRow.getAttribute("data-builder-node-kind");
    expect(kind).toBeTruthy();

    const sectionActions = firstLayeredSection
      .locator("[data-navigator-section-actions]")
      .last();
    await firstLayeredSection.focus();
    await expect
      .poll(
        async () =>
          await sectionActions.evaluate(
            (el) => window.getComputedStyle(el).pointerEvents,
          ),
        { timeout: 10_000 },
      )
      .toBe("auto");

    await childRow.focus();
    const childActions = childRow.locator("[data-navigator-child-actions]");
    await expect
      .poll(
        async () =>
          await childActions.evaluate(
            (el) => window.getComputedStyle(el).pointerEvents,
          ),
        { timeout: 10_000 },
      )
      .toBe("auto");
    await childRow.press("Enter");
    await expect(childRow).toHaveAttribute("data-selected", "true", {
      timeout: 10_000,
    });
  });

  test("impronta navigator layers collapse and search child nodes", async ({ page }) => {
    test.setTimeout(120_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    const sectionId = await firstLayeredSection.getAttribute("data-section-id");
    expect(sectionId).toBeTruthy();

    const childList = page.locator(
      `[data-navigator-child-list][data-section-id="${sectionId}"]`,
    );
    await expect(childList).toHaveCount(0);

    const allChildLists = page.locator("[data-navigator-child-list]");
    const expandAll = page.locator("[data-navigator-expand-all]");
    const collapseAll = page.locator("[data-navigator-collapse-all]");
    await expect(expandAll).toBeVisible({ timeout: 10_000 });
    await expect(collapseAll).toBeDisabled();
    await expandAll.click();
    await expect
      .poll(async () => await allChildLists.count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect(expandAll).toBeDisabled();
    await expect(collapseAll).toBeEnabled();
    await collapseAll.click();
    await expect(allChildLists).toHaveCount(0);

    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();
    await expect(childList).toBeVisible({ timeout: 10_000 });
    const firstChildKind = await childList
      .locator("[data-navigator-child-node]")
      .first()
      .getAttribute("data-builder-node-kind");
    expect(firstChildKind).toBeTruthy();

    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();
    await expect(childList).toHaveCount(0);

    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();
    await expect(childList).toBeVisible({ timeout: 10_000 });

    const searchInput = page.locator('input[placeholder^="Search sections"]');
    await searchInput.fill("zzzz-no-layer-match");
    await expect(page.getByText(/No sections match/i)).toBeVisible({
      timeout: 10_000,
    });

    await searchInput.fill(firstChildKind ?? "");
    await expect(
      page.locator(
        `[data-navigator-child-node][data-builder-node-kind="${firstChildKind}"]`,
      ).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("impronta navigator keyboard controls and tab-gated action chrome", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    const sectionId = await firstLayeredSection.getAttribute("data-section-id");
    expect(sectionId).toBeTruthy();

    const childList = page.locator(
      `[data-navigator-child-list][data-section-id="${sectionId}"]`,
    );
    await expect(childList).toHaveCount(0);

    await firstLayeredSection.focus();
    await firstLayeredSection.press("ArrowRight");
    await expect(childList).toBeVisible({ timeout: 10_000 });

    const firstChildRow = childList.locator("[data-navigator-child-node]").first();
    await expect(firstChildRow).toBeVisible({ timeout: 10_000 });
    await firstChildRow.click();
    await expect(firstChildRow).toHaveAttribute("data-selected", "true", {
      timeout: 10_000,
    });

    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const selectedActionButtons = Array.from(
              document.querySelectorAll(
                '[data-navigator-child-node][data-selected="true"] [data-navigator-child-actions] button',
              ),
            );
            const selectedHasReachableAction = selectedActionButtons.some(
              (button) => button.tabIndex >= 0,
            );
            const hiddenRows = Array.from(
              document.querySelectorAll(
                '[data-navigator-child-node]:not([data-selected="true"]) [data-navigator-child-actions]',
              ),
            );
            const hiddenRowsAreTabGated = hiddenRows.some((row) => {
              const buttons = Array.from(row.querySelectorAll("button"));
              return buttons.length > 0 && buttons.every((button) => button.tabIndex < 0);
            });
            return selectedHasReachableAction && hiddenRowsAreTabGated;
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    await firstLayeredSection.click({ force: true });
    await firstLayeredSection.press("ArrowLeft");
    await expect
      .poll(async () => await childList.count(), { timeout: 10_000 })
      .toBe(0);
  });

  test("impronta navigator child reorder works via action buttons and drag-drop", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    const sectionId = await firstLayeredSection.getAttribute("data-section-id");
    expect(sectionId).toBeTruthy();

    const childList = page.locator(
      `[data-navigator-child-list][data-section-id="${sectionId}"]`,
    );
    await firstLayeredSection.locator("[data-navigator-section-collapse-trigger]").click();
    await expect(childList).toBeVisible({ timeout: 10_000 });
    const childRows = childList.locator("[data-navigator-child-node]");
    const childCount = await childRows.count();
    expect(childCount).toBeGreaterThan(1);

    const childIdAt = async (index: number) =>
      await childRows.nth(index).getAttribute("data-builder-node-id");

    const topBefore = await childIdAt(0);
    const secondBefore = await childIdAt(1);
    expect(topBefore).toBeTruthy();
    expect(secondBefore).toBeTruthy();
    expect(topBefore).not.toEqual(secondBefore);

    await childRows.first().click();
    await childRows.first().getByRole("button", { name: /move .* down/i }).click();

    await expect
      .poll(async () => [await childIdAt(0), await childIdAt(1)])
      .toEqual([secondBefore, topBefore]);

    await childRows.first().click();
    await childRows.first().getByRole("button", { name: /move .* down/i }).click();

    await expect
      .poll(async () => [await childIdAt(0), await childIdAt(1)])
      .toEqual([topBefore, secondBefore]);

    const dragSource = childRows.first();
    const dragTarget = childRows.nth(1);
    const targetBox = await dragTarget.boundingBox();
    expect(targetBox).not.toBeNull();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await dragSource.dispatchEvent("dragstart", { dataTransfer });
    await dragTarget.dispatchEvent("dragover", {
      dataTransfer,
      clientX: targetBox!.x + Math.min(20, targetBox!.width / 2),
      clientY: targetBox!.y + targetBox!.height - 2,
    });
    await dragTarget.dispatchEvent("drop", {
      dataTransfer,
      clientX: targetBox!.x + Math.min(20, targetBox!.width / 2),
      clientY: targetBox!.y + targetBox!.height - 2,
    });
    await dragSource.dispatchEvent("dragend", { dataTransfer });
    await dataTransfer.dispose();

    await expect
      .poll(async () => [await childIdAt(0), await childIdAt(1)])
      .toEqual([secondBefore, topBefore]);
  });

  test("impronta Phase 0 edit loop: reorder draft reload publish reopen", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    let firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    const sectionId = await firstLayeredSection.getAttribute("data-section-id");
    expect(sectionId).toBeTruthy();

    let childList = page.locator(
      `[data-navigator-child-list][data-section-id="${sectionId}"]`,
    );
    await firstLayeredSection.locator("[data-navigator-section-collapse-trigger]").click();
    await expect(childList).toBeVisible({ timeout: 10_000 });
    let childRows = childList.locator("[data-navigator-child-node]");
    let childCount = await childRows.count();
    if (childCount < 2) {
      await insertHeadingViaNavigatorFirstLayeredSection(page);
      await waitForImprontaDraftSaved(page);
      childRows = childList.locator("[data-navigator-child-node]");
      await expect
        .poll(async () => await childRows.count(), { timeout: 60_000 })
        .toBeGreaterThan(1);
      childCount = await childRows.count();
    }
    expect(childCount).toBeGreaterThan(1);

    const childIdAt = async (index: number) =>
      await childRows.nth(index).getAttribute("data-builder-node-id");

    const topBefore = await childIdAt(0);
    const secondBefore = await childIdAt(1);
    expect(topBefore).toBeTruthy();
    expect(secondBefore).toBeTruthy();
    expect(topBefore).not.toEqual(secondBefore);

    await childRows.first().click();
    await childRows.first().getByRole("button", { name: /move .* down/i }).click();

    await expect
      .poll(async () => [await childIdAt(0), await childIdAt(1)])
      .toEqual([secondBefore, topBefore]);

    await waitForImprontaDraftSaved(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await ensureBuilderEditMode(page, "/impronta?edit=1");
    await closeBuilderDrawersIfPresent(page);
    await dismissBuilderTipIfPresent(page);

    firstLayeredSection = page.locator(
      `[data-navigator-section-row][data-section-id="${sectionId}"]`,
    );
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    childList = page.locator(
      `[data-navigator-child-list][data-section-id="${sectionId}"]`,
    );
    await firstLayeredSection.locator("[data-navigator-section-collapse-trigger]").click();
    await expect(childList).toBeVisible({ timeout: 10_000 });
    childRows = childList.locator("[data-navigator-child-node]");
    await expect
      .poll(async () => [
        await childRows.nth(0).getAttribute("data-builder-node-id"),
        await childRows.nth(1).getAttribute("data-builder-node-id"),
      ])
      .toEqual([secondBefore, topBefore]);

    await page.getByRole("button", { name: /^publish$/i }).click();
    const publishDrawer = page.locator('[data-edit-drawer="publish"]');
    await expect(publishDrawer).toBeVisible({ timeout: 15_000 });

    const publishNow = publishDrawer.getByRole("button", { name: /publish now/i });
    await expect(publishNow).toBeVisible({ timeout: 30_000 });
    await expect(publishNow).toBeEnabled({ timeout: 240_000 });

    await publishNow.click();
    await expect(publishDrawer.getByText(/^Published\b/i)).toBeVisible({
      timeout: 180_000,
    });

    await publishDrawer.getByRole("button", { name: /^close$/i }).click();
    await publishDrawer.waitFor({ state: "hidden", timeout: 15_000 }).catch(() =>
      closeBuilderDrawersIfPresent(page),
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await ensureBuilderEditMode(page, "/impronta?edit=1");
    await closeBuilderDrawersIfPresent(page);

    firstLayeredSection = page.locator(
      `[data-navigator-section-row][data-section-id="${sectionId}"]`,
    );
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    childList = page.locator(
      `[data-navigator-child-list][data-section-id="${sectionId}"]`,
    );
    await firstLayeredSection.locator("[data-navigator-section-collapse-trigger]").click();
    await expect(childList).toBeVisible({ timeout: 10_000 });
    childRows = childList.locator("[data-navigator-child-node]");
    await expect
      .poll(async () => [
        await childRows.nth(0).getAttribute("data-builder-node-id"),
        await childRows.nth(1).getAttribute("data-builder-node-id"),
      ])
      .toEqual([secondBefore, topBefore]);
  });

  test("impronta navigator supports keyboard resize controls", async ({ page }) => {
    test.setTimeout(120_000);
    await openImprontaBuilder(page);

    const panel = page.locator('[data-edit-overlay="navigator-panel"]');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    const separator = page.getByRole("separator", { name: "Resize navigator" });
    await expect(separator).toBeVisible({ timeout: 10_000 });

    const widthBefore = await panel.evaluate((el) =>
      Math.round(el.getBoundingClientRect().width),
    );

    await separator.focus();
    await separator.press("ArrowRight");
    const widthAfterExpand = await panel.evaluate((el) =>
      Math.round(el.getBoundingClientRect().width),
    );
    expect(widthAfterExpand).toBeGreaterThan(widthBefore);

    await separator.press("Home");
    await expect
      .poll(
        async () =>
          await panel.evaluate((el) => Math.round(el.getBoundingClientRect().width)),
        { timeout: 10_000 },
      )
      .toBe(280);

    await separator.dblclick();
    await expect
      .poll(
        async () =>
          await panel.evaluate((el) => Math.round(el.getBoundingClientRect().width)),
        { timeout: 10_000 },
      )
      .toBe(320);
  });

  test("impronta clears stale child selection after remove", async ({ page }) => {
    test.setTimeout(180_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();

    const firstChildRow = page.locator("[data-navigator-child-node]").first();
    await expect(firstChildRow).toBeVisible({ timeout: 20_000 });
    const nodeId = await firstChildRow.getAttribute("data-builder-node-id");
    expect(nodeId).toBeTruthy();
    if (!nodeId) {
      throw new Error("Expected navigator child row to expose a builder node id.");
    }

    await firstChildRow.click();
    await expect(firstChildRow).toHaveAttribute("data-selected", "true", {
      timeout: 10_000,
    });

    await removeBuilderNodeFromNavigator(page, nodeId);
    await expect(
      page.locator(`[data-navigator-child-node][data-builder-node-id="${nodeId}"]`),
    ).toHaveCount(0, { timeout: 45_000 });
    await expect(page.locator('[data-navigator-child-node][data-selected="true"]')).toHaveCount(0);

    await expect(
      page.locator('[data-selection-chip][data-selection-chip-scope="section"]'),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("impronta keyboard delete promotes child selection back to section", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();

    const firstChildRow = page.locator("[data-navigator-child-node]").first();
    await expect(firstChildRow).toBeVisible({ timeout: 20_000 });
    const nodeId = await firstChildRow.getAttribute("data-builder-node-id");
    expect(nodeId).toBeTruthy();
    if (!nodeId) {
      throw new Error("Expected navigator child row to expose a builder node id.");
    }

    await firstChildRow.click();
    await expect(firstChildRow).toHaveAttribute("data-selected", "true", {
      timeout: 10_000,
    });

    await page.keyboard.press("Backspace");
    await expect(
      page.locator(`[data-navigator-child-node][data-builder-node-id="${nodeId}"]`),
    ).toHaveCount(0, { timeout: 45_000 });
    await expect(
      page.locator('[data-navigator-child-node][data-selected="true"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-selection-chip][data-selection-chip-scope="section"]'),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("impronta backspace inside navigator search does not delete selected child", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();

    const firstChildRow = page.locator("[data-navigator-child-node]").first();
    await expect(firstChildRow).toBeVisible({ timeout: 20_000 });
    const nodeId = await firstChildRow.getAttribute("data-builder-node-id");
    expect(nodeId).toBeTruthy();
    if (!nodeId) {
      throw new Error("Expected navigator child row to expose a builder node id.");
    }

    await firstChildRow.click();
    await expect(firstChildRow).toHaveAttribute("data-selected", "true", {
      timeout: 10_000,
    });

    const searchInput = page.locator('input[placeholder^="Search sections"]');
    await searchInput.focus();
    await searchInput.fill("");
    await searchInput.press("Backspace");

    await expect(
      page.locator(`[data-navigator-child-node][data-builder-node-id="${nodeId}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(
        `[data-navigator-child-node][data-builder-node-id="${nodeId}"][data-selected="true"]`,
      ),
    ).toHaveCount(1);
  });

  test("impronta backspace inside rich editor does not delete selected child", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();

    const firstChildRow = page.locator("[data-navigator-child-node]").first();
    await expect(firstChildRow).toBeVisible({ timeout: 20_000 });
    const nodeId = await firstChildRow.getAttribute("data-builder-node-id");
    expect(nodeId).toBeTruthy();
    if (!nodeId) {
      throw new Error("Expected navigator child row to expose a builder node id.");
    }

    await firstChildRow.click();
    await expect(firstChildRow).toHaveAttribute("data-selected", "true", {
      timeout: 10_000,
    });

    const richEditable = page
      .locator('[data-edit-rich-field] [contenteditable="true"]')
      .first();
    await expect(richEditable).toBeVisible({ timeout: 20_000 });
    await richEditable.click();
    await page.keyboard.press("Backspace");

    await expect(
      page.locator(`[data-navigator-child-node][data-builder-node-id="${nodeId}"]`),
    ).toHaveCount(1);
  });

  test("impronta navigator layer actions copy paste and duplicate child nodes", async ({ page }) => {
    test.setTimeout(150_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const childRows = page.locator("[data-navigator-child-node]");
    const firstLayeredSection = page
      .locator("[data-navigator-section-row]")
      .filter({ has: page.locator("[data-navigator-block-count]") })
      .first();
    await expect(firstLayeredSection).toBeVisible({ timeout: 30_000 });
    await firstLayeredSection
      .locator("[data-navigator-section-collapse-trigger]")
      .click();
    await expect(childRows.first()).toBeVisible({ timeout: 30_000 });
    const beforeNodeIds = new Set(
      await childRows.evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-builder-node-id"))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const insertedNodeIds: string[] = [];

    try {
      const firstChild = childRows.first();
      const sourceNodeId = await firstChild.getAttribute("data-builder-node-id");
      expect(sourceNodeId).toBeTruthy();
      await firstChild.hover();
      await firstChild.locator("[data-builder-node-copy-trigger]").click();

      const pasteTrigger = firstChild.locator("[data-builder-node-paste-trigger]");
      await expect(pasteTrigger).toBeEnabled({ timeout: 10_000 });
      await pasteTrigger.click();

      await expect
        .poll(async () => {
          const ids = await childRows.evaluateAll((nodes) =>
            nodes
              .map((node) => node.getAttribute("data-builder-node-id"))
              .filter((id): id is string => Boolean(id)),
          );
          return ids.filter((id) => !beforeNodeIds.has(id)).length;
        }, { timeout: 45_000 })
        .toBeGreaterThanOrEqual(1);

      const duplicateTarget = page.locator(
        `[data-navigator-child-node][data-builder-node-id="${sourceNodeId}"]`,
      );
      await expect(duplicateTarget).toBeVisible({ timeout: 10_000 });
      await duplicateTarget.hover();
      const duplicateTrigger = duplicateTarget.locator(
        "[data-builder-node-duplicate-trigger]",
      );
      await expect(duplicateTrigger).toBeVisible({ timeout: 10_000 });
      await duplicateTrigger.dispatchEvent("click");

      await expect
        .poll(async () => {
          const ids = await childRows.evaluateAll((nodes) =>
            nodes
              .map((node) => node.getAttribute("data-builder-node-id"))
              .filter((id): id is string => Boolean(id)),
          );
          return ids.filter((id) => !beforeNodeIds.has(id)).length;
        }, { timeout: 45_000 })
        .toBeGreaterThanOrEqual(2);

      const afterNodeIds = await childRows.evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-builder-node-id"))
          .filter((id): id is string => Boolean(id)),
      );
      insertedNodeIds.push(
        ...afterNodeIds.filter((id) => !beforeNodeIds.has(id)),
      );
    } finally {
      for (const nodeId of [...insertedNodeIds].reverse()) {
        await removeBuilderNodeFromNavigator(page, nodeId);
      }
    }
  });

  test("impronta layout inspector exposes section spacing presets", async ({ page }) => {
    test.setTimeout(120_000);
    await openImprontaBuilder(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const firstSectionRow = page.locator("[data-navigator-section-row]").first();
    await expect(firstSectionRow).toBeVisible({ timeout: 30_000 });
    await firstSectionRow.click();
    const layoutTab = page.getByRole("tab", { name: "Layout", exact: true });
    await expect(layoutTab).toBeVisible({ timeout: 20_000 });
    await layoutTab.click();

    const presets = page.locator("[data-layout-spacing-preset]");
    await expect(presets).toHaveCount(5, { timeout: 10_000 });
    const compact = page.locator('[data-layout-spacing-preset="compact"]');
    await compact.click();
    await expect(compact).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    await expect(
      page.locator('[data-layout-spacing-preset="balanced"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-layout-spacing-preset="editorial"]'),
    ).toBeVisible();

    const mobileTarget = page.locator('[data-layout-responsive-target="mobile"]');
    await expect(mobileTarget).toBeVisible();
    await mobileTarget.click();
    const mobileCompact = page.locator(
      '[data-layout-responsive-spacing-preset="compact"]',
    );
    await expect(mobileCompact).toBeVisible();
    await mobileCompact.click();
    await expect(mobileCompact).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    const mobileContainer = page.locator(
      "[data-layout-responsive-container-control]",
    );
    await expect(mobileContainer).toBeVisible();
    await mobileContainer.getByRole("radio", { name: "Narrow" }).click();
    await expect(
      mobileContainer.getByRole("radio", { name: "Narrow" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page.locator("[data-layout-responsive-align-control]"),
    ).toBeVisible();
  });

  test("impronta layout inspector applies selected builder node presets", async ({ page }) => {
    test.setTimeout(180_000);
    await openImprontaBuilderDirect(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const containerBlocks = page.locator(
      ".site-builder-node--container[data-builder-node-id]",
    );
    const beforeContainerCount = await containerBlocks.count();
    const addBlock = await getFirstSectionBlockAddTrigger(page);
    await addBlock.click();

    const insertMenu = page.locator("[data-builder-node-insert-menu]").first();
    await expect(insertMenu).toBeVisible({ timeout: 10_000 });
    await insertMenu.getByRole("button", { name: "Container", exact: true }).click();

    await expect
      .poll(async () => containerBlocks.count(), { timeout: 90_000 })
      .toBeGreaterThan(beforeContainerCount);
    const insertedContainer = containerBlocks.nth(await containerBlocks.count() - 1);
    const containerNodeId = await insertedContainer.getAttribute("data-builder-node-id");
    expect(containerNodeId).toBeTruthy();
    if (!containerNodeId) {
      throw new Error("Inserted container did not expose a builder node id.");
    }

    try {
      await insertedContainer.scrollIntoViewIfNeeded();
      await insertedContainer.click({ position: { x: 8, y: 8 } });

      const layoutTab = page.getByRole("tab", { name: "Layout", exact: true });
      await expect(layoutTab).toBeVisible({ timeout: 20_000 });
      await layoutTab.click();

      const nodePanel = page.locator('[data-builder-node-layout-panel="container"]');
      await expect(nodePanel).toBeVisible({ timeout: 20_000 });
      await expect(
        nodePanel.locator("[data-builder-node-layout-preset]"),
      ).toHaveCount(4);

      await nodePanel.locator('[data-builder-node-layout-preset="card-grid"]').click();
      const renderedContainer = page.locator(
        `.site-builder-node--container[data-builder-node-id="${containerNodeId}"]`,
      );
      await expect(renderedContainer).toHaveAttribute("data-builder-layout", "grid", {
        timeout: 90_000,
      });
      await expect(renderedContainer).toHaveAttribute(
        "data-builder-mobile-layout",
        "stack",
        { timeout: 90_000 },
      );

      await expect(nodePanel.locator("[data-builder-node-responsive-reset]")).toBeVisible();
      await nodePanel.locator("[data-builder-node-responsive-reset]").click();
      await expect(renderedContainer).not.toHaveAttribute(
        "data-builder-mobile-layout",
        "stack",
        { timeout: 90_000 },
      );

      await nodePanel.locator("[data-builder-node-layout-reset]").click();
      await expect(renderedContainer).toHaveAttribute("data-builder-layout", "stack", {
        timeout: 90_000,
      });
    } finally {
      await removeBuilderNodeFromNavigator(page, containerNodeId);
    }
  });

  test("impronta data inspector applies selected builder node bindings", async ({ page }) => {
    test.setTimeout(180_000);
    await openImprontaBuilderDirect(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const { inserted: insertedContainer, nodeId: containerNodeId } =
      await insertBuilderNodeFromFirstSection(
        page,
        "Container",
        ".site-builder-node--container[data-builder-node-id]",
      );

    try {
      await insertedContainer.scrollIntoViewIfNeeded();
      await insertedContainer.click({ position: { x: 8, y: 8 } });
      const containerNavigatorRow = page.locator(
        `[data-navigator-child-node][data-builder-node-id="${containerNodeId}"]`,
      );
      await expect(containerNavigatorRow).toBeVisible({ timeout: 30_000 });
      await containerNavigatorRow.focus();
      await containerNavigatorRow.press("Enter");
      await expect(containerNavigatorRow).toHaveAttribute("data-selected", "true", {
        timeout: 20_000,
      });

      const dataTab = page.getByRole("tab", { name: "Data", exact: true });
      await expect(dataTab).toBeVisible({ timeout: 20_000 });
      await dataTab.click();

      const dataPanel = page.locator('[data-builder-data-panel="node"]');
      await expect(dataPanel).toBeVisible({ timeout: 20_000 });
      await expect(dataPanel).toHaveAttribute("data-builder-data-target-kind", "container");
      await expect(
        dataPanel.locator('[data-builder-data-finding="missing-binding"]'),
      ).toBeVisible();

      const sourceSelect = dataPanel.getByLabel("Choose builder data source");
      await dataPanel.locator('[data-builder-data-fix="missing-binding"]').click();
      await expect(sourceSelect).toHaveValue("featured_talent_profiles", {
        timeout: 20_000,
      });
      await expect(dataPanel.locator("header").filter({ hasText: "Roster talent" })).toBeVisible();
      await expect(
        dataPanel.getByRole("radio", { name: "Auto", exact: true }),
      ).toHaveAttribute("aria-checked", "true");

      const visibleLimit = dataPanel.getByLabel("Visible limit");
      await expect(visibleLimit).toBeVisible();
      await visibleLimit.fill("7");
      await expect(
        dataPanel.locator('[data-builder-data-finding="free-roster-limit"]'),
      ).toBeVisible({ timeout: 20_000 });
      await dataPanel.locator('[data-builder-data-fix="free-roster-limit"]').click();
      await expect(visibleLimit).toHaveValue("5", { timeout: 20_000 });
    } finally {
      await removeBuilderNodeFromNavigator(page, containerNodeId);
    }
  });

  test("impronta style inspector applies selected freeform block styles", async ({ page }) => {
    test.setTimeout(180_000);
    await openImprontaBuilderDirect(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const headingBlocks = page
      .locator(".site-builder-node--heading[data-builder-node-id]")
      .filter({ hasText: "Heading" });
    let headingCount = await headingBlocks.count();
    let shouldCleanupHeading = false;
    if (headingCount === 0) {
      const addBlock = await getFirstSectionBlockAddTrigger(page);
      await addBlock.click();

      const insertMenu = page.locator("[data-builder-node-insert-menu]").first();
      await expect(insertMenu).toBeVisible({ timeout: 10_000 });
      await insertMenu.getByRole("button", { name: "Heading", exact: true }).click();

      await expect(headingBlocks).toHaveCount(1, { timeout: 90_000 });
      headingCount = await headingBlocks.count();
      shouldCleanupHeading = true;
    }

    const insertedHeading = headingBlocks.nth(headingCount - 1);
    const headingNodeId = await insertedHeading.getAttribute("data-builder-node-id");
    expect(headingNodeId).toBeTruthy();
    if (!headingNodeId) {
      throw new Error("Inserted heading did not expose a builder node id.");
    }

    try {
      await insertedHeading.scrollIntoViewIfNeeded();
      await insertedHeading.click({ position: { x: 8, y: 8 } });

      const styleTab = page.getByRole("tab", { name: "Style", exact: true });
      await expect(styleTab).toBeVisible({ timeout: 20_000 });
      await styleTab.click();

      const stylePanel = page.locator('[data-builder-node-style-panel="heading"]');
      await expect(stylePanel).toBeVisible({ timeout: 20_000 });
      await stylePanel.getByRole("radio", { name: "Center" }).click();
      await stylePanel.getByRole("radio", { name: "XL" }).click();
      await stylePanel.getByRole("radio", { name: "Strong" }).click();
      await stylePanel.getByRole("radio", { name: "Read" }).click();

      const renderedHeading = page.locator(
        `.site-builder-node--heading[data-builder-node-id="${headingNodeId}"]`,
      );
      await expect(renderedHeading).toHaveAttribute("data-builder-style-align", "center", {
        timeout: 90_000,
      });
      await expect(renderedHeading).toHaveAttribute("data-builder-style-size", "xl", {
        timeout: 90_000,
      });
      await expect(renderedHeading).toHaveAttribute("data-builder-style-tone", "strong", {
        timeout: 90_000,
      });
      await expect(renderedHeading).toHaveAttribute("data-builder-style-width", "reading", {
        timeout: 90_000,
      });

      await styleTab.click();
      const refreshedStylePanel = page.locator('[data-builder-node-style-panel="heading"]');
      await expect(refreshedStylePanel).toBeVisible({ timeout: 20_000 });
      await refreshedStylePanel.locator("[data-builder-node-style-reset]").click();
      await expect(renderedHeading).not.toHaveAttribute(
        "data-builder-style-size",
        "xl",
        { timeout: 90_000 },
      );
    } finally {
      if (shouldCleanupHeading) {
        await removeBuilderNodeFromNavigator(page, headingNodeId);
      }
    }
  });

  test("impronta style inspector applies image and button block styles", async ({ page }) => {
    test.setTimeout(240_000);
    await openImprontaBuilderDirect(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const cleanupNodeIds: string[] = [];
    const { inserted: insertedImage, nodeId: imageNodeId } =
      await insertBuilderNodeFromFirstSection(
        page,
        "Image",
        ".site-builder-node--image[data-builder-node-id]",
      );
    cleanupNodeIds.push(imageNodeId);

    try {
      const imageStyle = await openStylePanelForBuilderNode(
        page,
        insertedImage,
        "image",
      );
      await expect(
        imageStyle.stylePanel.locator(
          '[data-builder-node-style-control="quick-presets"]',
        ),
      ).toBeVisible();
      await imageStyle.stylePanel
        .locator('[data-builder-node-style-preset="portrait-card"]')
        .click();

      const renderedImage = page.locator(
        `.site-builder-node--image[data-builder-node-id="${imageNodeId}"]`,
      );
      await expect(renderedImage).toHaveAttribute("data-builder-style-ratio", "3:4", {
        timeout: 90_000,
      });
      await expect(renderedImage).toHaveAttribute("data-builder-style-width", "narrow", {
        timeout: 90_000,
      });
      await clickStyleControl(imageStyle.stylePanel, "objectFit", "Contain");
      await clickStyleControl(imageStyle.stylePanel, "aspectRatio", "4:3");
      await clickStyleControl(imageStyle.stylePanel, "maxWidth", "Full");

      await expect(renderedImage).toHaveAttribute("data-builder-style-radius", "none", {
        timeout: 90_000,
      });
      await expect(renderedImage).toHaveAttribute("data-builder-style-fit", "contain", {
        timeout: 90_000,
      });
      await expect(renderedImage).toHaveAttribute("data-builder-style-ratio", "4:3", {
        timeout: 90_000,
      });
      await expect(renderedImage).toHaveAttribute("data-builder-style-width", "full", {
        timeout: 90_000,
      });
      await clickStyleControl(imageStyle.stylePanel, "viewport", "Mobile");
      await imageStyle.stylePanel
        .locator("[data-builder-node-style-copy-desktop]")
        .click();
      await expect(renderedImage).toHaveAttribute(
        "data-builder-style-mobile-ratio",
        "4:3",
        { timeout: 90_000 },
      );
      await expect(renderedImage).toHaveAttribute(
        "data-builder-style-mobile-width",
        "full",
        { timeout: 90_000 },
      );
      await clickStyleControl(imageStyle.stylePanel, "aspectRatio", "1:1");
      await clickStyleControl(imageStyle.stylePanel, "maxWidth", "Narrow");
      await expect(renderedImage).toHaveAttribute(
        "data-builder-style-mobile-ratio",
        "1:1",
        { timeout: 90_000 },
      );
      await expect(renderedImage).toHaveAttribute(
        "data-builder-style-mobile-width",
        "narrow",
        { timeout: 90_000 },
      );
      await clickStyleControl(imageStyle.stylePanel, "viewport", "Desktop");
      await imageStyle.stylePanel.locator("[data-builder-node-style-copy]").click();

      const { inserted: insertedSecondImage, nodeId: secondImageNodeId } =
        await insertBuilderNodeFromFirstSection(
          page,
          "Image",
          ".site-builder-node--image[data-builder-node-id]",
        );
      cleanupNodeIds.push(secondImageNodeId);

      const secondImageStyle = await openStylePanelForBuilderNode(
        page,
        insertedSecondImage,
        "image",
      );
      await expect(
        secondImageStyle.stylePanel.locator("[data-builder-node-style-paste]"),
      ).toBeEnabled();
      await secondImageStyle.stylePanel
        .locator("[data-builder-node-style-paste]")
        .click();
      const renderedSecondImage = page.locator(
        `.site-builder-node--image[data-builder-node-id="${secondImageNodeId}"]`,
      );
      await expect(renderedSecondImage).toHaveAttribute(
        "data-builder-style-radius",
        "none",
        { timeout: 90_000 },
      );
      await expect(renderedSecondImage).toHaveAttribute(
        "data-builder-style-fit",
        "contain",
        { timeout: 90_000 },
      );
      await expect(renderedSecondImage).toHaveAttribute(
        "data-builder-style-ratio",
        "4:3",
        { timeout: 90_000 },
      );
      await expect(renderedSecondImage).toHaveAttribute(
        "data-builder-style-width",
        "full",
        { timeout: 90_000 },
      );

      const { inserted: insertedButton, nodeId: buttonNodeId } =
        await insertBuilderNodeFromFirstSection(
          page,
          "Button",
          ".site-builder-node--button[data-builder-node-id]",
        );
      cleanupNodeIds.push(buttonNodeId);

      const buttonStyle = await openStylePanelForBuilderNode(
        page,
        insertedButton,
        "button",
      );
      await expect(
        buttonStyle.stylePanel.locator(
          '[data-builder-node-style-control="quick-presets"]',
        ),
      ).toBeVisible();
      await buttonStyle.stylePanel
        .locator('[data-builder-node-style-preset="primary-cta"]')
        .click();

      const renderedButton = page.locator(
        `.site-builder-node--button[data-builder-node-id="${buttonNodeId}"]`,
      );
      await expect(renderedButton).toHaveAttribute(
        "data-builder-button-tone",
        "primary",
        { timeout: 90_000 },
      );
      await clickStyleControl(buttonStyle.stylePanel, "align", "Right");
      await clickStyleControl(buttonStyle.stylePanel, "size", "L");
      await clickStyleControl(buttonStyle.stylePanel, "maxWidth", "Narrow");
      await clickStyleControl(buttonStyle.stylePanel, "radius", "Pill");
      await clickStyleControl(buttonStyle.stylePanel, "paddingX", "M");
      await clickStyleControl(buttonStyle.stylePanel, "button-tone", "Secondary");
      await clickStyleControl(buttonStyle.stylePanel, "button-hover", "Primary");

      await expect(renderedButton).toHaveAttribute("data-builder-style-align", "right", {
        timeout: 90_000,
      });
      await expect(renderedButton).toHaveAttribute("data-builder-style-size", "lg", {
        timeout: 90_000,
      });
      await expect(renderedButton).toHaveAttribute("data-builder-style-width", "narrow", {
        timeout: 90_000,
      });
      await expect(renderedButton).toHaveAttribute("data-builder-style-radius", "pill", {
        timeout: 90_000,
      });
      await expect(renderedButton).toHaveAttribute(
        "data-builder-button-tone",
        "secondary",
        { timeout: 90_000 },
      );
      await expect(renderedButton).toHaveAttribute(
        "data-builder-button-hover-tone",
        "primary",
        { timeout: 90_000 },
      );
    } finally {
      for (const nodeId of cleanupNodeIds.reverse()) {
        await removeBuilderNodeFromNavigator(page, nodeId);
      }
    }
  });

  test("impronta structure inspector inserts composition section packs", async ({ page }) => {
    test.setTimeout(240_000);
    await openImprontaBuilderDirect(page);

    const blankCanvasHeading = page.getByRole("heading", {
      name: /your homepage is a blank canvas/i,
    });
    if (await blankCanvasHeading.isVisible().catch(() => false)) {
      await addHeroFromBlankState(page);
    }

    const { inserted: insertedContainer, nodeId: containerNodeId } =
      await insertBuilderNodeFromFirstSection(
        page,
        "Container",
        ".site-builder-node--container[data-builder-node-id]",
      );

    try {
      await insertedContainer.scrollIntoViewIfNeeded();
      await insertedContainer.click({ position: { x: 8, y: 8 } });
      const containerNavigatorRow = page.locator(
        `[data-navigator-child-node][data-builder-node-id="${containerNodeId}"]`,
      );
      await expect(containerNavigatorRow).toBeVisible({ timeout: 30_000 });
      await containerNavigatorRow.focus();
      await containerNavigatorRow.press("Enter");
      await expect(containerNavigatorRow).toHaveAttribute("data-selected", "true", {
        timeout: 20_000,
      });
      const contentTab = page.getByRole("tab", { name: "Content", exact: true });
      await expect(contentTab).toBeVisible({ timeout: 20_000 });
      await contentTab.click();

      const packs = page.locator("[data-builder-node-composition-presets]").first();
      await expect(packs).toBeVisible({ timeout: 20_000 });
      await packs
        .locator("[data-builder-node-composition-category-filter]")
        .getByRole("button", { name: "data", exact: true })
        .click();
      await expect(
        packs.locator('[data-builder-node-composition-preset="featured-talent-grid"]'),
      ).toBeVisible();
      await expect(
        packs.locator('[data-builder-node-composition-preset="agency-search-hero"]'),
      ).toHaveCount(0);
      await packs
        .locator("[data-builder-node-composition-category-filter]")
        .getByRole("button", { name: "All", exact: true })
        .click();
      await packs.locator("[data-builder-node-composition-search]").fill("agency");
      await expect(
        packs.locator('[data-builder-node-composition-preset="agency-search-hero"]'),
      ).toBeVisible();
      await expect(
        packs.locator('[data-builder-node-composition-data-mode="data-ready"]'),
      ).toBeVisible();
      await expect(
        packs.locator('[data-builder-node-composition-preset="featured-talent-grid"]'),
      ).toHaveCount(0);
      await packs.locator("[data-builder-node-composition-search]").fill("");
      await packs
        .locator("[data-builder-node-composition-category-filter]")
        .getByRole("button", { name: "data", exact: true })
        .click();
      await packs
        .locator('[data-builder-node-composition-preset="featured-talent-grid"]')
        .click();

      const insertedPackHeading = page.getByRole("heading", {
        name: "Featured talent",
      });
      await expect(insertedPackHeading).toBeVisible({ timeout: 90_000 });
      await expect(
        page.locator(
          `.site-builder-node--container[data-builder-node-id="${containerNodeId}"] [data-builder-live-data-grid="featured_talent_profiles"]`,
        ),
      ).toBeVisible({ timeout: 90_000 });
      await expect(
        page.locator(
          `.site-builder-node--container[data-builder-node-id="${containerNodeId}"] [data-builder-data-source="featured_talent_profiles"]`,
        ),
      ).toBeVisible({ timeout: 90_000 });
    } finally {
      await removeBuilderNodeFromNavigator(page, containerNodeId);
    }
  });
});
