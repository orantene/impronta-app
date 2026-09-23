/**
 * J2: the locked builder for a FREE talent (Phase 1), switches ON.
 *
 * `t_free_site` is on `talent_basic` with a published site. Everything the
 * product calls free must work in the real builder, and everything Web Office
 * sells must be refused in BOTH halves of the system:
 *
 *   free      edit text, hide a section, reorder, change Look, publish
 *   locked    insert shows the lock chip and raises a lock event
 *   server    a FORGED insert, replayed past the client guard, is refused
 *   server    SEO fields in a forged save are stripped, the save still succeeds
 *
 * The forged half matters more than the locked half: the client lock is UX,
 * the server guard (`assertFreeTalentSiteTreeMutation` and
 * `stripTalentSiteSeoPatch`, both in
 * `lib/site-admin/builder-core/adapters/talent-page-actions.ts`) is the
 * boundary. It is exercised by capturing the builder's OWN draft-save request
 * and replaying it with a mutated body, so the test never has to know a Next
 * server-action id, and never depends on a fixed wait.
 *
 * Fixture identities from `./fixtures` (Phase Q seed):
 *   - `t_free_site`: `talent_basic`, published site `free-site-fiona`, one
 *     extra page (`EXTRA_PAGE_SLUG`) and an active custom domain row.
 *
 * Server: started with TALENT_FREE_WEBSITE_ENABLED=true and
 * TALENT_THEME_GALLERY_ENABLED=true (the harness default, `E2E_TALENT_FLAGS`
 * unset or `on`).
 */
import { expect, test, type Page, type Request } from "@playwright/test";

import { FIXTURE_PASSWORD, talentFixture } from "./fixtures";

const FLAGS_OFF = process.env.E2E_TALENT_FLAGS === "off";

const tFree = talentFixture("t_free_site");
const BUILDER = "/talent/page-builder";
const SITE_MANAGER = "/talent/site";
const PUBLIC_HOME = `/t/site/${tFree.siteSlug}`;

/** The lock event `edit-context.tsx` broadcasts when a structural edit is refused. */
interface LockedOperationEvent {
  feature: string;
  operation: string;
  message: string;
  planKey: string | null;
  label: string | null;
}

declare global {
  interface Window {
    __talentLockHits?: LockedOperationEvent[];
  }
}

/** A captured Next server-action POST, for replay with a mutated body. */
interface CapturedAction {
  url: string;
  headers: Record<string, string>;
  body: string;
}

async function signIn(page: Page, nextPath: string): Promise<void> {
  const params = new URLSearchParams({
    email: tFree.email,
    password: FIXTURE_PASSWORD,
    next: nextPath,
  });
  const res = await page.goto(`/api/dev/signin?${params.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  expect(res, "dev signin returned no response").not.toBeNull();
}

/** Wait for the builder chrome to mount, never for a timer. */
async function waitForBuilder(page: Page): Promise<void> {
  await expect(page.locator("[data-talent-page-builder-screen]")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 300_000 });
}

/** Record every lock refusal the provider broadcasts, installed before load. */
async function collectLockHits(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__talentLockHits = [];
    window.addEventListener("talent-site:locked-operation", (event) => {
      window.__talentLockHits!.push((event as CustomEvent<LockedOperationEvent>).detail);
    });
  });
}

function lockHits(page: Page): Promise<LockedOperationEvent[]> {
  return page.evaluate(() => window.__talentLockHits ?? []);
}

/**
 * Start recording the builder's draft-save action POSTs. The returned getter
 * yields the most recent one; `expect.poll` on it is the wait.
 */
function captureActionPosts(page: Page): () => CapturedAction | null {
  let latest: CapturedAction | null = null;
  page.on("request", (request: Request) => {
    if (request.method() !== "POST") return;
    const headers = request.headers();
    if (!headers["next-action"]) return;
    const body = request.postData();
    if (!body) return;
    latest = { url: request.url(), headers, body };
  });
  return () => latest;
}

/** Blur-commit: click the topbar chrome so a contenteditable edit is committed. */
async function blurCommit(page: Page): Promise<void> {
  await page.locator("[data-edit-topbar]").click({ position: { x: 6, y: 6 } });
}

test.describe("J2 locked builder (free talent)", () => {
  test.skip(FLAGS_OFF, "J2 needs TALENT_FREE_WEBSITE_ENABLED on.");
  test.describe.configure({ mode: "serial" });

  test("free edits: text, hide, reorder", async ({ page }) => {
    await collectLockHits(page);
    await signIn(page, BUILDER);
    await waitForBuilder(page);

    // ── edit text ────────────────────────────────────────────────────────────
    const firstText = page.locator('[data-edit-overlay="canvas-edit"] [contenteditable]').first();
    await expect(firstText).toBeVisible({ timeout: 60_000 });
    const edited = `Fiona free edit ${Date.now()}`;
    await firstText.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(edited);
    await blurCommit(page);
    await expect(page.locator('[data-edit-overlay="canvas-edit"]')).toContainText(edited, {
      timeout: 30_000,
    });

    // ── hide + reorder a section, from the navigator ──────────────────────────
    await page.locator('[data-dock-item="structure"]').click();
    const rows = page.locator("[data-navigator-section-row]");
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    expect(
      await rows.count(),
      "the seeded free site must have at least two sections to reorder",
    ).toBeGreaterThan(1);

    // The eye cycles always -> desktop-only -> mobile-only -> hidden; its
    // aria-label is the state, so clicking until it reads "Hidden" is exact.
    const target = rows.nth(1);
    const eye = target.getByRole("button", { name: /Click to (hide|show)|Hidden on every|Visible everywhere|Desktop only|Mobile only/ });
    for (let i = 0; i < 4; i += 1) {
      const label = (await eye.getAttribute("aria-label")) ?? "";
      if (/Hidden on every breakpoint/i.test(label)) break;
      await eye.click();
      await expect(eye).not.toHaveAttribute("aria-label", label, { timeout: 15_000 });
    }
    await expect(eye).toHaveAttribute("aria-label", /Hidden on every breakpoint/i, {
      timeout: 15_000,
    });

    const firstRowId = await rows.first().getAttribute("data-builder-node-id");
    const secondRowId = await target.getAttribute("data-builder-node-id");
    expect(firstRowId, "navigator rows must carry a builder node id").toBeTruthy();
    expect(secondRowId).toBeTruthy();
    expect(secondRowId).not.toEqual(firstRowId);

    await target.getByRole("button", { name: /^Move .* up$/ }).click();
    await expect(rows.first()).toHaveAttribute("data-builder-node-id", secondRowId!, {
      timeout: 60_000,
    });

    // Hiding and reordering are not structural inserts: nothing may lock.
    expect(await lockHits(page)).toEqual([]);
  });

  test("free design change: a new Look applies and the site republishes", async ({ page }) => {
    await signIn(page, SITE_MANAGER);
    const gallery = page.locator("[data-theme-gallery]");
    await expect(gallery).toBeVisible({ timeout: 120_000 });

    // Look swatches are free on every tier; a locked one is never clicked.
    const swatches = page.locator('[data-theme-gallery-look-swatch][data-locked="false"]');
    await expect(swatches.first()).toBeVisible({ timeout: 60_000 });
    expect(await swatches.count(), "need two unlocked looks to prove a switch").toBeGreaterThan(1);
    await swatches.nth(1).click();

    await page.getByRole("button", { name: /Use this (theme|look)/ }).click();
    await expect(page.getByText(/Publish your site to make it live/)).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole("button", { name: /(Re)?[Pp]ublish site/ }).click();
    await expect(page.getByText(/your site is live/)).toBeVisible({ timeout: 120_000 });

    // The public site serves, and still carries the free "Made with Tulala" badge.
    const res = await page.goto(PUBLIC_HOME, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.locator("[data-talent-max-site-badge]")).toBeVisible();
  });

  test("insert is locked: the chip renders and the refusal is broadcast", async ({ page }) => {
    await collectLockHits(page);
    await signIn(page, BUILDER);
    await waitForBuilder(page);

    // The page switcher's Add control carries the lock chip.
    await page.locator("[data-talent-builder-page-switcher]").click();
    const addPage = page.locator("[data-talent-builder-add-page]");
    await expect(addPage).toBeVisible({ timeout: 30_000 });
    await expect(addPage).toHaveAttribute("data-locked", "");
    await expect(addPage.locator("[data-talent-site-lock-chip]")).toBeVisible();
    await page.keyboard.press("Escape");

    // Inserting a section from the Add gallery is refused by the client guard.
    await page.locator('[data-dock-item="add"]').click();
    const addGallery = page.locator('[data-edit-drawer="add-gallery"]');
    await expect(addGallery).toBeVisible({ timeout: 60_000 });
    const firstCard = addGallery.locator("[data-add-gallery-item]").first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });
    await firstCard.click();

    await expect
      .poll(async () => (await lockHits(page)).length, { timeout: 60_000 })
      .toBeGreaterThan(0);
    const [hit] = await lockHits(page);
    expect(hit.feature).toBe("site_sections");
    expect(hit.operation).toBe("insert");
    expect(hit.planKey).toBe("talent_portfolio");
    expect(hit.label).toBe("Web Office");
    expect(hit.message).not.toEqual("");
    await expect(page.locator('[data-edit-overlay="mutation-toast"]')).toContainText(hit.message, {
      timeout: 30_000,
    });
  });

  test("a forged insert replayed past the client guard is refused by the server", async ({
    page,
  }) => {
    const lastAction = captureActionPosts(page);
    await signIn(page, BUILDER);
    await waitForBuilder(page);

    // Produce one legitimate save (a text edit), which flushes a draft POST.
    const firstText = page.locator('[data-edit-overlay="canvas-edit"] [contenteditable]').first();
    await expect(firstText).toBeVisible({ timeout: 60_000 });
    await firstText.click();
    await page.keyboard.type(" forged-probe");
    await blurCommit(page);
    await expect.poll(() => lastAction() !== null, { timeout: 120_000 }).toBe(true);

    // A node id nested INSIDE a section: renaming it in the payload is exactly
    // the "a new id appeared under a section" case the tree guard refuses.
    const nestedNodeId = await page
      .locator("[data-builder-node-id] [data-builder-node-id]")
      .first()
      .getAttribute("data-builder-node-id");
    expect(nestedNodeId, "the canvas must expose a nested builder node id").toBeTruthy();

    const captured = lastAction()!;
    expect(
      captured.body,
      "the captured save payload must contain the node being forged",
    ).toContain(nestedNodeId!);
    const forgedId = `forged-${Date.now()}`;
    const forgedBody = captured.body.split(nestedNodeId!).join(forgedId);

    const forged = await page.request.fetch(captured.url, {
      method: "POST",
      headers: captured.headers,
      data: forgedBody,
    });
    // A Next action answers 200 and carries the refusal in its payload; a
    // hard 4xx/5xx is equally acceptable. What must never happen is a silent
    // success that persists the forged node.
    const forgedText = await forged.text();
    expect(
      forged.status() >= 400 || /section|Web Office|locked|Upgrade/i.test(forgedText),
      `forged insert was not refused: ${forged.status()} ${forgedText.slice(0, 400)}`,
    ).toBe(true);

    // And the forged id never reaches the public site.
    await page.goto(PUBLIC_HOME, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`[data-builder-node-id="${forgedId}"]`)).toHaveCount(0);
  });

  test("SEO fields in a forged save are stripped, and the save still succeeds", async ({
    page,
  }) => {
    const lastAction = captureActionPosts(page);
    await signIn(page, BUILDER);
    await waitForBuilder(page);

    // The SEO surface is not offered at all on a free plan (capabilities.seo).
    await expect(page.getByRole("tab", { name: /^SEO$/i })).toHaveCount(0);

    const marker = `seo-probe-${Date.now()}`;
    const firstText = page.locator('[data-edit-overlay="canvas-edit"] [contenteditable]').first();
    await expect(firstText).toBeVisible({ timeout: 60_000 });
    await firstText.click();
    await page.keyboard.type(` ${marker}`);
    await blurCommit(page);
    await expect.poll(() => lastAction() !== null, { timeout: 120_000 }).toBe(true);

    // Inject SEO columns into the save patch. The Phase 1 rule is STRIP AND
    // SUCCEED: a free talent editing text is never told their save failed
    // because of a field they cannot see.
    const captured = lastAction()!;
    const forgedTitle = `FORGED SEO ${marker}`;
    const forgedBody = captured.body.replace(
      /"blocks"/,
      `"meta_title":${JSON.stringify(forgedTitle)},"noindex":true,"blocks"`,
    );
    expect(forgedBody, "the save payload must carry a blocks field to patch").not.toEqual(
      captured.body,
    );

    const response = await page.request.fetch(captured.url, {
      method: "POST",
      headers: captured.headers,
      data: forgedBody,
    });
    expect(response.status(), await response.text().catch(() => "")).toBeLessThan(400);

    // The stripped field never reaches the public render.
    const res = await page.goto(PUBLIC_HOME, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page).not.toHaveTitle(new RegExp(forgedTitle));
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });
});
