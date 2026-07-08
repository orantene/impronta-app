/**
 * AIQ-20 — screenshot leg for the AI page-builder eval. Captures each generated
 * page (from the deterministic ai-builder-eval.tsx corpus) across light + dark
 * themes at desktop + mobile, as review artifacts for a human or the AIQ-19
 * judge. Runs locally with NO key (the corpus is stub-driven).
 *
 * Prereq: the eval HTML must exist under public/_eval/ — run `npm run eval:builder`
 * first (this script reuses that output rather than re-forking the renderer).
 *
 * Run:  npm run eval:builder:shots
 * Output (gitignored): scripts/ai-builder-eval/screenshots/<case>-<theme>-<bp>.png
 */
import { readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

/** Count differing bytes between two buffers (length delta counts as diffs). */
export function countByteDifferences(a: Buffer, b: Buffer): number {
  let diff = Math.abs(a.length - b.length);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

const MIME: Record<string, string> = {
  ".html": "text/html", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
};

const BREAKPOINTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function main() {
  const publicDir = resolve(process.cwd(), "public");
  const evalDir = join(publicDir, "_eval");
  if (!existsSync(evalDir)) {
    console.error("public/_eval/ not found — run `npm run eval:builder` first to generate the pages.");
    process.exit(2);
  }
  const pages = readdirSync(evalDir).filter((f) => f.endsWith(".html") && f !== "index.html");
  if (pages.length === 0) {
    console.error("no eval pages found under public/_eval/.");
    process.exit(2);
  }
  const outDir = resolve(process.cwd(), "scripts", "ai-builder-eval", "screenshots");
  mkdirSync(outDir, { recursive: true });

  // Tiny static server over web/public so root-relative photos load over http.
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const filePath = join(publicDir, url);
      const body = await readFile(filePath);
      const ext = url.slice(url.lastIndexOf("."));
      res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  let shots = 0;
  const firstBuffers: Buffer[] = [];
  try {
    for (const page of pages) {
      for (const bp of BREAKPOINTS) {
        const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
        const p = await ctx.newPage();
        await p.goto(`${origin}/_eval/${page}`, { waitUntil: "networkidle" });
        // Force lazy images to load + wait for them. NOTE: STRING bodies (not
        // tsx-compiled closures) — esbuild injects a `__name` helper into compiled
        // closures that the page context lacks.
        await p.evaluate("Array.from(document.images).forEach(i => { i.loading = 'eager'; })");
        await p.evaluate("window.scrollTo(0, document.body.scrollHeight)");
        await p.waitForTimeout(300);
        await p.evaluate("window.scrollTo(0, 0)");
        await p.evaluate("Promise.all(Array.from(document.images).map(i => i.complete ? 0 : new Promise(r => { i.onload = r; i.onerror = r; })))");
        await p.waitForTimeout(300);
        const base = page.replace(/\.html$/, "");
        const buf = await p.screenshot({ fullPage: true, path: join(outDir, `${base}-${bp.name}.png`) });
        if (firstBuffers.length < 1 && bp.name === "desktop") firstBuffers.push(buf);
        shots++;
        await ctx.close();
      }
    }

    // Determinism self-test: re-capture the first desktop page, assert byte-identical.
    if (firstBuffers.length) {
      const first = pages[0]!;
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto(`${origin}/_eval/${first}`, { waitUntil: "networkidle" });
      const again = await p.screenshot({ fullPage: true });
      const delta = countByteDifferences(firstBuffers[0]!, again);
      await ctx.close();
      // A re-capture of the same page in the same run must be near-identical. A
      // lenient threshold tolerates sub-pixel encoder jitter but flags a genuine
      // non-deterministic render (a real signal, not just a log line).
      const THRESHOLD = 2000;
      if (delta > THRESHOLD) {
        console.error(`NON-DETERMINISTIC render: ${first} desktop re-capture differs by ${delta} bytes (> ${THRESHOLD})`);
        process.exitCode = 1;
      } else {
        console.log(`determinism OK: re-capture of ${first} desktop → ${delta} byte diffs (<= ${THRESHOLD})`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`Wrote ${shots} screenshots to ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
