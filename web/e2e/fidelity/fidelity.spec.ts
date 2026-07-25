import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { fidelityDesigns } from "../../scripts/fidelity/designs";
import { FIDELITY_BREAKPOINTS } from "../../scripts/fidelity/html";
import {
  applyMotionState,
  fidelityMotionFrameKey,
  FIDELITY_MOTION_FRAMES,
} from "../../scripts/fidelity/motion";
import {
  fidelityHtmlUrl,
  startFidelityServer,
  type FidelityServer,
} from "../../scripts/fidelity/server";

// FIX: no retries for fidelity tests — a flaky 1-pixel diff must be
// investigated, not silently retried to green. This overrides the global
// `retries:1` in playwright.config.ts for this suite only.
test.describe.configure({ retries: 0 });

// FIX: render with prefers-reduced-motion so entrance-animated elements
// settle to their final visible state instead of being captured at the
// animation `from` frame (opacity:0). The BUILDER_NODE_RENDERER_CSS guard
// (.site-builder-node[style*="animation"]{animation:none!important}) fires
// under this media query, which removes the animation entirely and leaves
// elements at their natural visible style. `animations:"disabled"` alone
// freezes CSS animations at their `from` keyframe (t=0), causing
// scroll-reveal sections to be captured invisible — the golden then
// baselines that invisible state and can never catch a regression.
test.use({ reducedMotion: "reduce" });

// The rebuilt designs reference REAL photos as root-relative `/marketing/…`
// srcs and self-hosted bundled woff2. NEITHER loads under `page.setContent`
// (origin `about:blank`): the renderer's image guard drops `data:`/`file:` (so
// a `data:` SVG renders nothing), and a relative font URL can't resolve. So,
// exactly like `capture.ts`, this suite serves `web/public` + the bundled fonts
// + the generated HTML over a localhost static server and navigates via http.
// Offline, deterministic, and the renderer guard is never loosened.
const SCRIPTS_DIR = resolve(process.cwd(), "scripts/fidelity");
const OUTPUT_ROOT = resolve(process.cwd(), "fidelity");
const PUBLIC_DIR = resolve(process.cwd(), "public");
const FONTS_DIR = join(SCRIPTS_DIR, "fonts");

let server: FidelityServer;

test.beforeAll(async () => {
  server = await startFidelityServer({
    publicDir: PUBLIC_DIR,
    outputDir: OUTPUT_ROOT,
    fontsDir: FONTS_DIR,
  });
});

test.afterAll(async () => {
  await server?.close();
});

/** Render a design's HTML in the renderer's own process (the bundled-font base
 * URL points at the running server so the woff2 load over http).
 *
 * BUILDER_IMAGE_OPT=off: the renderer's P4-IMAGEOPT adds a responsive `srcSet`
 * routing through the Next image optimizer (`/_next/image?url=…`). That endpoint
 * only exists under a running Next server — the fidelity static server can't
 * serve it, so the browser (which prefers a `srcSet` candidate) fails every
 * photo to a broken-image box and the goldens diff by exactly the image area.
 * The renderer ships this opt-out for precisely non-optimizer environments; with
 * it off the harness emits the plain `<img src>` that the static server resolves
 * from `public/`. The visual result is identical to production (same photo), so
 * the existing goldens still match — only the unservable optimizer URL is gone. */
function buildHtmlInRendererProcess(designId: string): string {
  return execFileSync(
    "npx",
    ["tsx", "scripts/fidelity/render-html.ts", designId, server.fontsBaseUrl],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, BUILDER_IMAGE_OPT: "off" },
    },
  );
}

/**
 * Make the harness actually offline, as the header above claims it is.
 *
 * `impronta` is a REAL product page-design (a tenant can pick it in the
 * builder), and it references remote photos on images.unsplash.com — the only
 * design that does. On a runner without egress to that host the requests never
 * settle, so `img.decode()` below hangs and all 5 impronta frames die on the
 * 30s test timeout instead of producing a diff. That is why reseeding the
 * goldens could never fix impronta: a timeout has no pixels to reseed.
 *
 * Fixing it in the design is not an option — that would change what tenants
 * see to suit a test. So the harness stubs external image requests instead.
 *
 * The stub is an SVG sized to the EXACT intrinsic dimensions the URL asks for
 * (unsplash carries `w=`/`h=` params). Intrinsic size drives layout for images
 * without explicit CSS dimensions, so matching it keeps geometry identical to
 * a real photo load — only the pixels inside the box become a flat fill. A
 * fixed-size placeholder would silently reflow the page and bake that reflow
 * into the goldens.
 *
 * Same-origin requests (the fidelity static server: HTML, /marketing photos,
 * bundled woff2) are never intercepted.
 */
const STUB_FILL = "#8a8a8a";
const DEFAULT_STUB_W = 1200;
const DEFAULT_STUB_H = 800;
/** Max wait for a single image to decode. Well under the 30s test timeout so a
 * stuck image surfaces as a pixel diff, never as a suite-killing hang. */
const IMAGE_DECODE_CAP_MS = 5_000;

async function stubExternalRequests(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(server.origin) || url.startsWith("data:")) {
      return route.continue();
    }

    let width = DEFAULT_STUB_W;
    let height = DEFAULT_STUB_H;
    try {
      const params = new URL(url).searchParams;
      width = Number(params.get("w")) || DEFAULT_STUB_W;
      height = Number(params.get("h")) || DEFAULT_STUB_H;
    } catch {
      // Unparseable URL — fall back to the default box.
    }

    return route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<rect width="100%" height="100%" fill="${STUB_FILL}"/></svg>`,
    });
  });
}

/** Write the HTML under the served output dir and navigate to it over http so
 * root-relative photos + bundled woff2 resolve; then settle fonts + images. */
async function loadServedDesign(page: Page, designId: string, artifact: string): Promise<void> {
  await stubExternalRequests(page);
  const html = buildHtmlInRendererProcess(designId);
  const htmlPath = join(OUTPUT_ROOT, designId, `${designId}-${artifact}.html`);
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html, "utf8");
  await page.goto(fidelityHtmlUrl(server.origin, OUTPUT_ROOT, htmlPath), {
    waitUntil: "networkidle",
  });
  await page.evaluate(async (perImageCapMs) => {
    // The renderer emits `loading="lazy"` on every image. An image below the
    // fold is therefore NEVER REQUESTED while the viewport sits at the top —
    // and `img.decode()` on a never-requested lazy image never settles. It does
    // not reject, so the `.catch()` below cannot save us; the whole test hangs
    // until the 30s timeout.
    //
    // This is what killed all 5 impronta frames (its second photo sits far below
    // the fold). It is not impronta-specific — any design tall enough to push an
    // image out of the initial viewport hits it. And because it dies as a TIMEOUT
    // rather than a diff, reseeding the goldens could never have fixed it.
    //
    // Flipping to eager makes the browser fetch immediately, which is also what
    // we want before a `fullPage` screenshot: every image must be real pixels by
    // capture time, not a lazy placeholder.
    for (const img of Array.from(document.images)) {
      img.loading = "eager";
    }

    await document.fonts.ready;

    // Belt-and-braces: cap each decode. A single unreachable image now costs one
    // grey box in the diff instead of taking the entire suite down with it —
    // a visible, debuggable failure rather than an opaque timeout.
    await Promise.all(
      Array.from(document.images).map((img) =>
        Promise.race([
          img.decode().catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, perImageCapMs)),
        ]),
      ),
    );
  }, IMAGE_DECODE_CAP_MS);
}

for (const design of fidelityDesigns) {
  test.describe(`fidelity: ${design.id}`, () => {
    for (const breakpoint of FIDELITY_BREAKPOINTS) {
      test(`${breakpoint.name} ${breakpoint.width}px`, async ({ page }) => {
        await page.setViewportSize({
          width: breakpoint.width,
          height: breakpoint.height,
        });
        await loadServedDesign(page, design.id, String(breakpoint.width));

        await expect(page).toHaveScreenshot(
          `${design.id}-${breakpoint.name}.png`,
          {
            fullPage: true,
            animations: "disabled",
          },
        );
      });
    }
  });
}

// Motion-state goldens. These convert previously-unscoreable axes into measured
// ones: `scrolled` proves sticky headers + backdrop-filter glass OVER real
// scrolled content, `reveal` proves a scroll-driven entrance animation settles
// to its end state, and `hover` proves the hover/transition system produces a
// real state change. They run with reduced-motion OFF (so the animation exists
// to be fast-forwarded) and are clipped to the viewport at a scroll/hover state,
// unlike the full-page static frames. Sub-pixel AA drift across runs is
// absorbed by `maxDiffPixels`; a hard regression still fails.
//
// The budget is 2000 px, not the original 250: the `scrolled` frames composite
// `backdrop-filter` glass over scrolled content, and that compositing is not
// bit-deterministic run-to-run even on the SAME runner — an at-rest re-seed of
// `saas-scrolled` still drifted ~1014 px on the very next macOS-14 run (a single
// dashboard metric re-rasterized a sub-pixel over). 2000 absorbs that real
// non-determinism while still tripping on a genuine regression, which moves
// 10k–175k px (a shifted layout, a missing element, a broken photo). The static
// full-page frames stay EXACT (0 tolerance) — they use bundled woff2 and no
// glass, so they're deterministic.
test.describe("fidelity: motion", () => {
  test.use({ reducedMotion: "no-preference" });
  for (const frame of FIDELITY_MOTION_FRAMES) {
    const frameKey = fidelityMotionFrameKey(frame);
    test(`${frame.design} ${frameKey} ${frame.width}px`, async ({ page, browserName }) => {
      // Motion goldens are chromium-pinned. WebKit's backdrop-filter compositing
      // and scroll-timeline support diverge enough that a shared golden would be
      // noise, not signal; the cross-engine (webkit) project covers the static
      // frames instead. Seed a webkit motion golden intentionally before lifting.
      test.skip(browserName !== "chromium", "motion goldens are chromium-pinned");
      await page.setViewportSize({ width: frame.width, height: frame.height });
      await loadServedDesign(page, frame.design, `${frame.width}-${frameKey}`);
      await applyMotionState(page, frame.state, { targetSelector: frame.targetSelector });

      await expect(page).toHaveScreenshot(`${frame.design}-${frame.width}-${frameKey}.png`, {
        clip: { x: 0, y: 0, width: frame.width, height: frame.height },
        animations: "disabled",
        maxDiffPixels: 2000,
      });
    });
  }
});
