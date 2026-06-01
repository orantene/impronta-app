import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "playwright";

import { fidelityDesigns } from "./designs";
import {
  buildFidelityHtml,
  FIDELITY_BREAKPOINTS,
  planFidelityFonts,
  type FidelityBreakpoint,
  type FidelityDesign,
} from "./html";
import {
  applyMotionState,
  fidelityMotionFrameKey,
  FIDELITY_MOTION_FRAMES,
  type FidelityMotionFrame,
} from "./motion";
import {
  fidelityHtmlUrl,
  startFidelityServer,
  type FidelityServer,
} from "./server";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = resolve(SCRIPT_DIR, "../../fidelity");
const PUBLIC_DIR = resolve(SCRIPT_DIR, "../../public");
const FONTS_DIR = resolve(SCRIPT_DIR, "fonts");

interface CaptureResult {
  design: string;
  breakpoint: string;
  state: string;
  htmlPath: string;
  pngPath: string;
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  // Serve web/public (real photos), the bundled fonts, and the generated HTML
  // over http so the renderer's image guard (http/root-relative only) accepts
  // the photo srcs and the page can load its woff2 + images. All localhost.
  const server = await startFidelityServer({
    publicDir: PUBLIC_DIR,
    outputDir: OUTPUT_ROOT,
    fontsDir: FONTS_DIR,
  });
  const browser = await chromium.launch();
  const results: CaptureResult[] = [];

  try {
    for (const design of fidelityDesigns) {
      results.push(...(await captureDesignStatic(browser, server, design)));
    }
    for (const frame of FIDELITY_MOTION_FRAMES) {
      const design = fidelityDesigns.find((d) => d.id === frame.design);
      if (!design) continue;
      results.push(await captureMotionFrame(browser, server, design, frame));
    }
    const determinism = await proveDeterministic(browser, server);
    await writeFile(
      join(OUTPUT_ROOT, "capture-summary.json"),
      `${JSON.stringify({ results, determinism }, null, 2)}\n`,
      "utf8",
    );
    console.log(
      `Captured ${results.length} screenshots (static + motion) for ${fidelityDesigns.length} design(s) in ${OUTPUT_ROOT}`,
    );
    for (const d of determinism) {
      console.log(
        `Determinism self-test [${d.design}]: ${d.byteDifferences} byte difference(s) at ${d.breakpoint}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

async function captureDesignStatic(
  browser: Browser,
  server: FidelityServer,
  design: FidelityDesign,
): Promise<CaptureResult[]> {
  const page = await browser.newPage();
  const designDir = join(OUTPUT_ROOT, design.id);
  const html = buildFidelityHtml(design, { fontsBaseUrl: server.fontsBaseUrl });
  const requiredFamilies = planFidelityFonts(design.tree).requiredFamilies;
  const results: CaptureResult[] = [];

  try {
    await mkdir(designDir, { recursive: true });
    for (const breakpoint of FIDELITY_BREAKPOINTS) {
      const artifactBase = `${design.id}-${breakpoint.width}`;
      const htmlPath = join(designDir, `${artifactBase}.html`);
      const pngPath = join(designDir, `${artifactBase}.png`);
      // Static frames: reduced-motion so entrance-animated nodes settle to their
      // final visible style via the renderer's reduce guard.
      await loadDesignPage(page, server, htmlPath, html, breakpoint, "reduce");
      await assertFontsLoaded(page, requiredFamilies, design.id);
      await page.screenshot({ path: pngPath, fullPage: true, animations: "disabled" });
      results.push({
        design: design.id,
        breakpoint: breakpoint.name,
        state: "static",
        htmlPath,
        pngPath,
      });
    }
  } finally {
    await page.close();
  }

  return results;
}

async function captureMotionFrame(
  browser: Browser,
  server: FidelityServer,
  design: FidelityDesign,
  frame: FidelityMotionFrame,
): Promise<CaptureResult> {
  const page = await browser.newPage();
  const designDir = join(OUTPUT_ROOT, design.id);
  const html = buildFidelityHtml(design, { fontsBaseUrl: server.fontsBaseUrl });
  const requiredFamilies = planFidelityFonts(design.tree).requiredFamilies;
  const breakpoint: FidelityBreakpoint = {
    name: "desktop",
    width: frame.width,
    height: frame.height,
  };
  const artifactBase = `${design.id}-${frame.width}-${fidelityMotionFrameKey(frame)}`;
  const htmlPath = join(designDir, `${artifactBase}.html`);
  const pngPath = join(designDir, `${artifactBase}.png`);

  try {
    await mkdir(designDir, { recursive: true });
    // Motion frames: reduced-motion OFF so the animation/transition exists to be
    // fast-forwarded; `animations:"disabled"` at screenshot time settles it.
    await loadDesignPage(page, server, htmlPath, html, breakpoint, "no-preference");
    await assertFontsLoaded(page, requiredFamilies, design.id);
    await applyMotionState(page, frame.state, { targetSelector: frame.targetSelector });
    await page.screenshot({
      path: pngPath,
      animations: "disabled",
      clip: { x: 0, y: 0, width: frame.width, height: frame.height },
    });
  } finally {
    await page.close();
  }

  return {
    design: design.id,
    breakpoint: breakpoint.name,
    state: fidelityMotionFrameKey(frame),
    htmlPath,
    pngPath,
  };
}

async function proveDeterministic(
  browser: Browser,
  server: FidelityServer,
): Promise<Array<{ design: string; breakpoint: string; byteDifferences: number }>> {
  // Re-render each design's desktop STATIC frame twice; it must be a 0-byte-diff
  // screenshot. editorial uses scroll-driven animation-timeline and both
  // editorial + saas use backdrop-filter — the nodes most likely to render
  // non-deterministically. Motion frames are exempt (documented pixel tolerance).
  const breakpoint = FIDELITY_BREAKPOINTS[0];
  const results: Array<{ design: string; breakpoint: string; byteDifferences: number }> = [];

  for (const design of fidelityDesigns) {
    const html = buildFidelityHtml(design, { fontsBaseUrl: server.fontsBaseUrl });
    const page = await browser.newPage();
    const htmlPath = join(OUTPUT_ROOT, design.id, `${design.id}-determinism.html`);

    try {
      await loadDesignPage(page, server, htmlPath, html, breakpoint, "reduce");
      const first = await page.screenshot({ fullPage: true, animations: "disabled" });
      await loadDesignPage(page, server, htmlPath, html, breakpoint, "reduce");
      const second = await page.screenshot({ fullPage: true, animations: "disabled" });
      const byteDifferences = countByteDifferences(first, second);
      await writeFile(
        join(OUTPUT_ROOT, design.id, "determinism.json"),
        `${JSON.stringify(
          { design: design.id, breakpoint: breakpoint.name, width: breakpoint.width, byteDifferences },
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

async function loadDesignPage(
  page: Page,
  server: FidelityServer,
  htmlPath: string,
  html: string,
  breakpoint: FidelityBreakpoint,
  reducedMotion: "reduce" | "no-preference",
): Promise<void> {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
  await mkdir(dirname(htmlPath), { recursive: true });
  // Write the HTML to disk (the static server serves it + it doubles as a
  // human-inspectable artifact), then navigate over http so root-relative photo
  // srcs and woff2 load. `networkidle` waits for those subresources.
  await writeFile(htmlPath, html, "utf8");
  await page.goto(fidelityHtmlUrl(server.origin, OUTPUT_ROOT, htmlPath), {
    waitUntil: "networkidle",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Trigger `loading="lazy"` images below the fold to fetch before we decode.
    // Without this, an off-screen lazy image never loads, and `img.decode()`
    // below blocks FOREVER (no timeout) — the hang that wedged tall (390px)
    // captures + the golden spec. Scroll the full height a viewport at a time,
    // then return to the top (motion frames re-apply their own scroll later).
    const fullHeight = document.documentElement.scrollHeight;
    for (let y = 0; y <= fullHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
    window.scrollTo(0, 0);
    // Decode every image, but race each decode against a 3s timeout so a still-
    // unfetched image degrades to a skip instead of hanging the whole capture.
    // (Inlined anonymously — a named `const fn = …` here trips tsx/esbuild's
    // `__name` helper, which is undefined in the page-evaluate browser context.)
    await Promise.all(
      Array.from(document.images).map((img) =>
        Promise.race([
          img.decode().catch(() => undefined),
          new Promise((resolve) => setTimeout(() => resolve(undefined), 3000)),
        ]),
      ),
    );
  });
}

async function assertFontsLoaded(
  page: Page,
  requiredFamilies: ReadonlyArray<string>,
  designId: string,
): Promise<void> {
  if (requiredFamilies.length === 0) return;
  const missing = await page.evaluate(async (families: string[]) => {
    // NOTE: `document.fonts.check()` is NOT usable here — it returns true even
    // when no @font-face matches (interpreting "nothing to load" as "ready"), so
    // it would pass on a silent system fallback, defeating the whole guard.
    // Instead, force-load each family then require an actually-LOADED FontFace
    // whose family matches. A system fallback registers no FontFace → flagged.
    for (const family of families) {
      try {
        await document.fonts.load(`16px "${family}"`);
      } catch {
        // an unmatched family resolves to [] — handled by the membership check
      }
    }
    const loaded = new Set<string>();
    document.fonts.forEach((face) => {
      if (face.status === "loaded") {
        loaded.add(face.family.replace(/^["']|["']$/g, "").toLowerCase());
      }
    });
    return families.filter((family) => !loaded.has(family.toLowerCase()));
  }, [...requiredFamilies]);
  if (missing.length > 0) {
    throw new Error(
      `Font self-check failed for "${designId}": declared registry families fell back to a system font: ${missing.join(", ")}. ` +
        `Typography would be scored on the wrong glyphs. Check the woff2 assets / Google href in the font bridge.`,
    );
  }
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
