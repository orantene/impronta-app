import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "playwright";

import { fidelityDesigns } from "./designs";
import {
  buildFidelityHtml,
  FIDELITY_BREAKPOINTS,
  type FidelityBreakpoint,
  type FidelityDesign,
} from "./html";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = resolve(SCRIPT_DIR, "../../fidelity");

interface CaptureResult {
  design: string;
  breakpoint: string;
  htmlPath: string;
  pngPath: string;
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const browser = await chromium.launch();
  const results: CaptureResult[] = [];

  try {
    for (const design of fidelityDesigns) {
      results.push(...(await captureDesign(browser, design)));
    }
    const determinism = await proveDeterministic(browser);
    await writeFile(
      join(OUTPUT_ROOT, "capture-summary.json"),
      `${JSON.stringify({ results, determinism }, null, 2)}\n`,
      "utf8",
    );
    console.log(
      `Captured ${results.length} screenshots for ${fidelityDesigns.length} design(s) in ${OUTPUT_ROOT}`,
    );
    for (const d of determinism) {
      console.log(
        `Determinism self-test [${d.design}]: ${d.byteDifferences} byte difference(s) at ${d.breakpoint}`,
      );
    }
  } finally {
    await browser.close();
  }
}

async function captureDesign(
  browser: Browser,
  design: FidelityDesign,
): Promise<CaptureResult[]> {
  const page = await browser.newPage();
  const designDir = join(OUTPUT_ROOT, design.id);
  const html = buildFidelityHtml(design);
  const results: CaptureResult[] = [];

  try {
    await mkdir(designDir, { recursive: true });
    for (const breakpoint of FIDELITY_BREAKPOINTS) {
      const artifactBase = `${design.id}-${breakpoint.width}`;
      const htmlPath = join(designDir, `${artifactBase}.html`);
      const pngPath = join(designDir, `${artifactBase}.png`);
      await writeFile(htmlPath, html, "utf8");
      await preparePage(page, html, breakpoint);
      await page.screenshot({
        path: pngPath,
        fullPage: true,
        animations: "disabled",
      });
      results.push({
        design: design.id,
        breakpoint: breakpoint.name,
        htmlPath,
        pngPath,
      });
    }
  } finally {
    await page.close();
  }

  return results;
}

async function proveDeterministic(
  browser: Browser,
): Promise<Array<{ design: string; breakpoint: string; byteDifferences: number }>> {
  // Run the determinism check on ALL registered designs (not just trivial).
  // editorial uses scroll-driven animation-timeline and both editorial + saas
  // use backdrop-filter — the designs most likely to produce non-deterministic
  // screenshots. We only use the first breakpoint (desktop) to keep it fast.
  const breakpoint = FIDELITY_BREAKPOINTS[0];
  const results: Array<{ design: string; breakpoint: string; byteDifferences: number }> = [];

  for (const design of fidelityDesigns) {
    const html = buildFidelityHtml(design);
    const page = await browser.newPage();

    try {
      await preparePage(page, html, breakpoint);
      const first = await page.screenshot({
        fullPage: true,
        animations: "disabled",
      });
      await preparePage(page, html, breakpoint);
      const second = await page.screenshot({
        fullPage: true,
        animations: "disabled",
      });
      const byteDifferences = countByteDifferences(first, second);
      const designDir = join(OUTPUT_ROOT, design.id);
      await mkdir(designDir, { recursive: true });
      await writeFile(
        join(designDir, "determinism.json"),
        `${JSON.stringify(
          {
            design: design.id,
            breakpoint: breakpoint.name,
            width: breakpoint.width,
            byteDifferences,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      if (byteDifferences !== 0) {
        throw new Error(
          `Determinism self-test failed for "${design.id}": ${byteDifferences} screenshot byte difference(s).`,
        );
      }
      results.push({ design: design.id, breakpoint: breakpoint.name, byteDifferences });
    } finally {
      await page.close();
    }
  }

  return results;
}

async function preparePage(
  page: Page,
  html: string,
  breakpoint: FidelityBreakpoint,
): Promise<void> {
  await page.setViewportSize({
    width: breakpoint.width,
    height: breakpoint.height,
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

function countByteDifferences(first: Buffer, second: Buffer): number {
  const sharedLength = Math.min(first.length, second.length);
  let differenceCount = Math.abs(first.length - second.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (first[index] !== second[index]) differenceCount += 1;
  }
  return differenceCount;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
