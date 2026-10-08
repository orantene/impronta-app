/**
 * TUL-107 / TUL-117 — the front door: tulala.digital/start answers 200, opens in
 * Spanish for a Spanish browser, is READABLE (2026-10-07 P0: unscoped tokens
 * gave near-white text on a white page), and offers the three "¿Cómo trabajas?"
 * choices. Read-only: loads the page, clicks nothing.
 */
import { expect, test } from "@playwright/test";
import { evidence } from "./_live";

const START = "https://tulala.digital/start";

/** WCAG relative luminance of a computed `rgb(...)`/`rgba(...)` colour. */
function luminance(css: string): number {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

test.use({ locale: "es-MX", extraHTTPHeaders: { "accept-language": "es-MX,es;q=0.9" } });

test("/start is Spanish, readable and offers Para mí / Estudio / Ambos", async ({ page }, info) => {
  const res = await page.goto(START, { waitUntil: "domcontentloaded" });
  expect(res?.status(), "/start must answer 200").toBe(200);

  const flow = page.getByTestId("onb-page");
  await expect(flow).toBeVisible();
  // A fresh visitor lands on the choose step (no stale guest brief in a new context).
  await expect(flow).toHaveAttribute("data-onboarding-step", "choose");

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(/¿Cómo trabajas\?/);
  for (const label of [/Trabajo por mi cuenta/, /Tengo un estudio o equipo/, /Ambos/]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }

  // Readable: dark ink on a light page, contrast >= 4.5.
  const { color, bg } = await flow.evaluate((el) => {
    const h1 = el.querySelector("h1")!;
    return { color: getComputedStyle(h1).color, bg: getComputedStyle(el).backgroundColor };
  });
  expect(bg, "the flow must paint its own background").not.toBe("rgba(0, 0, 0, 0)");
  const [hi, lo] = [luminance(bg), luminance(color)].sort((a, b) => b - a);
  const ratio = (hi! + 0.05) / (lo! + 0.05);
  await info.attach("colours", { body: `h1 ${color} on ${bg}, contrast ${ratio.toFixed(2)}`, contentType: "text/plain" });
  expect(ratio, `h1 ${color} on ${bg}`).toBeGreaterThanOrEqual(4.5);

  await evidence(page, info, "tul-107-start");
});
