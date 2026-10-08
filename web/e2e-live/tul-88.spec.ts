/**
 * TUL-88 — Jorgelina's booking site shows a primary "Reservar" action above the
 * fold on phone and desktop (header + hero). Look only. Fails until TUL-88 ships:
 * on 2026-10-07 the hero's primary button was "Ver servicios".
 */
import { expect, test } from "@playwright/test";
import { JORGELINA_SITE, evidence } from "./_live";

test("primary Reservar action is visible above the fold", async ({ page }, info) => {
  const res = await page.goto(JORGELINA_SITE, { waitUntil: "networkidle" });
  expect(res?.status()).toBeLessThan(400);
  const cta = page.getByRole("link", { name: /reservar/i }).or(page.getByRole("button", { name: /reservar/i }));
  await expect(cta.first()).toBeVisible();
  const vh = page.viewportSize()?.height ?? 800;
  const tops = await cta.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => r.top),
  );
  await info.attach("reservar-tops", { body: JSON.stringify({ vh, tops }), contentType: "application/json" });
  expect(tops.some((t) => t >= 0 && t < vh), "a Reservar action should be visible above the fold").toBeTruthy();
  await evidence(page, info, "home");
});
