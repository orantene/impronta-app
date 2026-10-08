/**
 * Shared helpers for live checks (production, read-only). See
 * `playwright.live.config.ts` for the rules.
 */
import type { Page, TestInfo } from "@playwright/test";

/** Jorgelina's real booking site: LOOK ONLY. Never submit forms here. */
export const JORGELINA_SITE = "https://book-jorgelina.tulala.digital";
/** QA copy of a talent booking site: the only talent site a check may write on. */
export const QA_TALENT_SITE = "https://jorg-beauty-qa.tulala.digital";

/** Hosts that must always serve the same production deployment. */
export const PRODUCTION_HOSTS = [
  "https://tulala.digital",
  "https://app.tulala.digital",
  JORGELINA_SITE,
  QA_TALENT_SITE,
] as const;

/** Vercel deployment id stamped on <html data-dpl-id>, or null. */
export async function deploymentId(url: string): Promise<string | null> {
  const res = await fetch(url, { redirect: "follow" });
  const html = await res.text();
  return html.match(/data-dpl-id="([^"]+)"/)?.[1] ?? null;
}

/** Full-page screenshot attached to the report and saved as evidence. */
export async function evidence(page: Page, info: TestInfo, name: string): Promise<void> {
  const body = await page.screenshot({ fullPage: true });
  await info.attach(`${info.project.name}-${name}`, { body, contentType: "image/png" });
}
