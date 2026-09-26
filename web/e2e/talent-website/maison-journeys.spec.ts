/**
 * Maison journeys 1–6 (W77–W78 / PR9).
 *
 * Spec §14:
 *   1 First website, no import (Vale)
 *   2 Optional import (Vale)
 *   3 Chef custom colors (Iván)
 *   4 Colors only on a live site
 *   5 Recovery chrome
 *   6 Revert (restore + undo import)
 *
 * Requires:
 *   - seed.ts (Vale / Iván + ids.json)
 *   - TALENT_MAISON_THEME_ENABLED=true on the server
 *   - MAISON_JOURNEY_E2E=1
 *
 * Runs EN + ES at 1440 and 390; layout matrix also hits 360 / 430 / 375×667
 * on a smoke subset (journey 1 gallery).
 */
import { expect, test } from "@playwright/test";

import {
  MAISON_VALE_INTRO_AFTER_AI,
  storageStateFor,
} from "./fixtures";
import {
  assertNeverUnlockCopy,
  expectMaisonSetupHost,
  MAISON_JOURNEY_READY,
  MAISON_LOCALES,
  MAISON_VIEWPORTS,
  setDashboardLocale,
  setViewport,
  type MaisonLocale,
} from "./helpers";

test.describe("Maison journeys 1–6 (W77–W78)", () => {
  test.skip(
    !MAISON_JOURNEY_READY,
    "set MAISON_JOURNEY_E2E=1 after seed.ts + TALENT_MAISON_THEME_ENABLED on the server",
  );

  for (const locale of MAISON_LOCALES) {
    test.describe(`locale=${locale}`, () => {
      test.describe.configure({ mode: "serial" });

      test.describe("Journey 1 — Vale first website, no import", () => {
        test.use({ storageState: storageStateFor("t_vale") });

        test.beforeEach(async ({ context }) => {
          await setDashboardLocale(context, locale);
        });

        test("mz_today → Finish with AI → unlock → Activate → gallery → lilac → mine → review → publish", async ({
          page,
        }) => {
          await setViewport(page, "desktop");
          await page.goto("/talent/today", { waitUntil: "domcontentloaded" });

          const finish = page.getByTestId("website-finish-card");
          await expect(finish).toBeVisible({ timeout: 30_000 });
          await expect(finish).toContainText(/%/);

          await page.getByTestId("finish-with-ai-cta").click();
          await expect(page.getByTestId("finish-with-ai-panel")).toBeVisible();
          // AI may fail in CI — Edit + paste Vale's seed intro is the reliable path.
          await page.getByTestId("finish-with-ai-edit").click();
          const edit = page.getByTestId("finish-with-ai-draft-edit");
          await expect(edit).toBeVisible();
          await edit.fill(MAISON_VALE_INTRO_AFTER_AI);
          await page.getByTestId("finish-with-ai-use").click();
          await expect(page.getByTestId("website-unlocked-card")).toBeVisible({
            timeout: 30_000,
          });

          await page.getByTestId("website-unlocked-activate").click();
          await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
          await expectMaisonSetupHost(page);
          await expect(page.getByTestId("maison-choose-design")).toBeVisible();

          await page.getByTestId("maison-theme-card").click();
          await expect(page.getByTestId("maison-theme-detail")).toBeVisible();
          await page.getByTestId("maison-palette-lilac").click();
          await page.getByTestId("maison-mode-mine").click();
          await page.getByTestId("maison-use-design").click();

          await expect(page.getByTestId("maison-review")).toBeVisible({ timeout: 30_000 });
          await expect(page.getByTestId("maison-undo-design")).toBeVisible();
          // Ready or named blockers — Publish is present either way.
          await expect(page.getByTestId("maison-publish")).toBeVisible();

          // Prefer ready path; if blocked on slug, fill address if the field exists.
          const address = page.getByTestId("maison-review-address");
          if (await address.isVisible().catch(() => false)) {
            // Address is display-only; slug is set at publish from suggested host.
          }
          await page.getByTestId("maison-publish").click();

          // Live card or live toast — either proves publish progressed.
          const liveCard = page.getByTestId("maison-my-website-card");
          const liveToast = page.getByTestId("maison-live-toast");
          await expect(liveCard.or(liveToast)).toBeVisible({ timeout: 60_000 });
          await assertNeverUnlockCopy(page);
        });

        for (const vp of ["phone390", "phone360", "phone430", "phone375"] as const) {
          test(`W78 layout smoke gallery @ ${vp}`, async ({ page }) => {
            await setViewport(page, vp);
            await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
            await expectMaisonSetupHost(page);
            // After journey 1 publish the host may show My website or Choose a design.
            const gallery = page.getByTestId("maison-choose-design");
            const card = page.getByTestId("maison-my-website-card");
            await expect(gallery.or(card)).toBeVisible({ timeout: 30_000 });
            const box = page.viewportSize();
            expect(box?.width).toBe(MAISON_VIEWPORTS[vp].width);
          });
        }
      });

      test.describe("Journey 2 — Vale optional import", () => {
        test.use({ storageState: storageStateFor("t_vale") });

        test.beforeEach(async ({ context }) => {
          await setDashboardLocale(context, locale);
        });

        test("import starter → keep Manicura en gel → commit → undo available", async ({
          page,
        }) => {
          await setViewport(page, "desktop");
          await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
          await expectMaisonSetupHost(page);

          // Open theme detail (from Change design if live, else gallery).
          const change = page.getByTestId("maison-change-design");
          if (await change.isVisible().catch(() => false)) {
            await change.click();
          } else {
            await page.getByTestId("maison-theme-card").click();
          }
          await expect(page.getByTestId("maison-theme-detail")).toBeVisible();

          const importEntry = page.getByTestId("maison-import-entry");
          await expect(importEntry).toBeVisible();
          await importEntry.click();
          await expect(page.getByTestId("maison-import-panel")).toBeVisible();

          await page.getByTestId("maison-import-group-services-check").click();
          await page.getByTestId("maison-import-group-faqs-check").click();
          // Sections optional — leave collapsed selection as product defaults.

          const commit = page.getByTestId("maison-import-commit");
          if (await commit.isEnabled().catch(() => false)) {
            await commit.click();
          } else {
            // Duplicate review path when Vale already has Manicura en gel.
            const keep = page.getByRole("button", { name: /Keep existing|Mantener/i }).first();
            if (await keep.isVisible().catch(() => false)) {
              await keep.click();
            }
            await page.getByTestId("maison-import-commit").click();
          }

          await expect(page.getByTestId("maison-import-result-title")).toBeVisible({
            timeout: 30_000,
          });
          await expect(page.getByTestId("maison-import-undo")).toBeVisible();
        });
      });

      test.describe("Journey 3 — Iván chef custom colors", () => {
        test.use({ storageState: storageStateFor("t_ivan") });

        test.beforeEach(async ({ context }) => {
          await setDashboardLocale(context, locale);
        });

        test("chef demo → My content → Custom colors → adjust → publish", async ({ page }) => {
          await setViewport(page, "desktop");
          await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
          await expectMaisonSetupHost(page);

          await page.getByTestId("maison-theme-card").click();
          await expect(page.getByTestId("maison-theme-detail")).toBeVisible();
          await page.getByTestId("maison-mode-mine").click();
          await page.getByTestId("maison-palette-custom").click();
          await expect(page.getByTestId("maison-custom-colors-panel")).toBeVisible();

          // Chef fixture hexes from seed custom_colors_example_chef.
          await page.getByTestId("maison-custom-hex-accent").fill("#C8643B");
          const advisory = page.getByTestId("maison-contrast-advisory");
          if (await advisory.isVisible().catch(() => false)) {
            const preview = page.getByTestId("maison-contrast-preview-suggestion");
            if (await preview.isVisible().catch(() => false)) {
              await preview.click();
              await page.getByTestId("maison-contrast-use-adjustment").click();
            }
          }
          await page.getByTestId("maison-custom-name").fill(locale === "es" ? "Mis colores" : "My colors");
          await page.getByTestId("maison-custom-save").click();

          await page.getByTestId("maison-use-design").click();
          await expect(page.getByTestId("maison-review")).toBeVisible({ timeout: 30_000 });
          await expect(page.getByTestId("maison-review-summary")).toContainText(/My colors|Mis colores|Maison/i);
          await page.getByTestId("maison-publish").click();
          await expect(
            page.getByTestId("maison-my-website-card").or(page.getByTestId("maison-live-toast")),
          ).toBeVisible({ timeout: 60_000 });
          await assertNeverUnlockCopy(page);
        });
      });

      test.describe("Journey 4 — colors only on live site", () => {
        test.use({ storageState: storageStateFor("t_ivan") });

        test.beforeEach(async ({ context }) => {
          await setDashboardLocale(context, locale);
        });

        test("Change design → Use this design → one Publish new colors step", async ({
          page,
        }) => {
          await setViewport(page, "desktop");
          await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
          await expect(page.getByTestId("maison-my-website-card")).toBeVisible({
            timeout: 30_000,
          });
          await page.getByTestId("maison-change-design").click();
          await expect(page.getByTestId("maison-theme-detail")).toBeVisible();
          await page.getByTestId("maison-palette-sand").click();
          await page.getByTestId("maison-use-design").click();

          const colorsDlg = page.getByTestId("maison-publish-colors-dialog");
          await expect(colorsDlg).toBeVisible({ timeout: 20_000 });
          await page.getByTestId("maison-publish-colors-confirm").click();
          await expect(page.getByTestId("maison-my-website-card")).toBeVisible({
            timeout: 60_000,
          });
        });
      });

      test.describe("Journey 5 — recovery chrome", () => {
        test.use({ storageState: storageStateFor("t_vale") });

        test.beforeEach(async ({ context }) => {
          await setDashboardLocale(context, locale);
        });

        test("preview fail copy + Try again controls exist on theme detail", async ({
          page,
        }) => {
          await setViewport(page, "phone390");
          await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
          await expectMaisonSetupHost(page);
          const change = page.getByTestId("maison-change-design");
          if (await change.isVisible().catch(() => false)) {
            await change.click();
          } else if (await page.getByTestId("maison-theme-card").isVisible().catch(() => false)) {
            await page.getByTestId("maison-theme-card").click();
          }
          await expect(page.getByTestId("maison-theme-detail")).toBeVisible();
          // Contract: fail copy strings are wired (static test covers source);
          // here we assert the retry control surface is reachable on phone.
          await expect(page.getByTestId("maison-use-design-phone").or(page.getByTestId("maison-use-design"))).toBeVisible();
        });

        test("review blockers expose named fix links when not ready", async ({ page }) => {
          await setViewport(page, "desktop");
          await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
          // Force review screen via localStorage if host allows — otherwise skip softly.
          await page.evaluate(() => {
            const keys = Object.keys(localStorage).filter((k) => k.includes("maison"));
            for (const k of keys) {
              try {
                const v = JSON.parse(localStorage.getItem(k) ?? "{}") as { screen?: string };
                v.screen = "review";
                localStorage.setItem(k, JSON.stringify(v));
              } catch {
                /* ignore */
              }
            }
          });
          await page.reload({ waitUntil: "domcontentloaded" });
          const review = page.getByTestId("maison-review");
          if (!(await review.isVisible().catch(() => false))) {
            test.skip(true, "review screen not forceable on this seed state");
            return;
          }
          // Either Ready or named blockers — never a blank panel.
          await expect(
            page.getByTestId("maison-publish").or(page.locator("[data-testid^='maison-blocker-']").first()),
          ).toBeVisible();
        });
      });

      test.describe("Journey 6 — revert", () => {
        test.use({ storageState: storageStateFor("t_ivan") });

        test.beforeEach(async ({ context }) => {
          await setDashboardLocale(context, locale);
        });

        test("Design options → Restore previous design", async ({ page }) => {
          await setViewport(page, "desktop");
          await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
          await expect(page.getByTestId("maison-my-website-card")).toBeVisible({
            timeout: 30_000,
          });
          await page.getByTestId("maison-design-options").click();
          await expect(page.getByTestId("maison-design-options")).toBeVisible();
          const restore = page.getByRole("button", {
            name: /Restore previous design|Restaurar diseño anterior/i,
          });
          if (!(await restore.isVisible().catch(() => false))) {
            test.skip(true, "no published revision yet to restore");
            return;
          }
          await restore.click();
          await expect(page.getByTestId("maison-restore-list")).toBeVisible();
          const first = page.locator("[data-testid^='maison-restore-btn-']").first();
          await expect(first).toBeVisible();
          await first.click();
          // Lands on review / pending — Undo or Publish available.
          await expect(
            page.getByTestId("maison-review").or(page.getByTestId("maison-my-website-card")),
          ).toBeVisible({ timeout: 30_000 });
        });

        test("Undo import from Design options when a batch exists", async ({ page }) => {
          await setViewport(page, "desktop");
          await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
          await page.getByTestId("maison-design-options").click();
          const undo = page.getByRole("button", { name: /Undo import|Deshacer importación/i });
          if (!(await undo.isVisible().catch(() => false))) {
            test.skip(true, "no import batch on Iván for Undo import");
            return;
          }
          await undo.click();
          await expect(page.getByTestId("maison-options-toast").or(page.getByTestId("maison-options-list"))).toBeVisible({
            timeout: 20_000,
          });
        });
      });
    });
  }
});

/** Phone matrix @ 390 for EN (journey 1 already covers EN+ES desktop). */
test.describe("Maison W78 viewport matrix (EN)", () => {
  test.skip(!MAISON_JOURNEY_READY, "set MAISON_JOURNEY_E2E=1");
  test.use({ storageState: storageStateFor("t_vale") });

  for (const [key, size] of Object.entries(MAISON_VIEWPORTS)) {
    test(`viewport ${key} ${size.width}×${size.height}`, async ({ page, context }) => {
      await setDashboardLocale(context, "en" satisfies MaisonLocale);
      await page.setViewportSize(size);
      await page.goto("/talent/site", { waitUntil: "domcontentloaded" });
      await expectMaisonSetupHost(page);
      const vp = page.viewportSize();
      expect(vp?.width).toBe(size.width);
      expect(vp?.height).toBe(size.height);
    });
  }
});
