/**
 * Design-diff harness (Step 1 of the design-fidelity plan).
 *
 *   node --import tsx web/scripts/design-diff.mts --design <maison-v2|folio> [--viewport 1440|390]
 *
 * For every manifest row: screenshots the ARTIFACT section (standalone reviewer
 * HTML served from a throwaway static server) and the SAME section rendered on
 * localhost:3001 /template-preview with the real talent content, then a
 * per-pixel diff (computed in a headless canvas; no pixelmatch dependency).
 *
 * Output: ~/.claude/design-diff/<design>/<viewport>/<row>/{artifact,local,diff}.png
 *         + summary.json + index.html contact sheet.
 *
 * Localhost only. Credentials are read from the pm-apply worktree's .env.local
 * and never printed; the session is cached at ~/.claude/design-diff/.auth.json (0600).
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Sel = string | string[];
type Row = { id: string; label: string; artifactSelector: Sel; localSelector: Sel };
type Design = {
  artifactPath: string | null;
  artifactTodo?: string;
  templateSlug: string;
  /** Override manifest.localTalentId for this design (Folio = Mateo). */
  localTalentId?: string;
  rows: Row[];
};
type Manifest = { localTalentId: string; designs: Record<string, Design> };

function expandHome(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

const LOCAL_ORIGIN = "http://localhost:3001";
const ENV_FILE = "/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web/.env.local";
const OUT_ROOT = path.join(os.homedir(), ".claude", "design-diff");
const AUTH_FILE = path.join(OUT_ROOT, ".auth.json");
const SERVE_ROOT = path.join(os.homedir(), ".claude", "mockup-serve");
const here = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function assertLocal(url: string): void {
  const h = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(h)) throw new Error(`refusing non-localhost URL: ${h}`);
}

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function selList(s: Sel): string[] {
  return Array.isArray(s) ? s : [s];
}

async function startStatic(dir: string): Promise<{ origin: string; close: () => void }> {
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png" };
  const server = http.createServer((req, res) => {
    const p = path.normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    const file = path.join(dir, p === "/" ? "index.html" : p);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { origin: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function waitForLocal(tries = 10, delayMs = 30_000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${LOCAL_ORIGIN}/login`, { signal: AbortSignal.timeout(20_000) });
      if (r.status === 200) return;
    } catch {
      /* restarting */
    }
    console.log(`localhost:3001 not ready (attempt ${i + 1}/${tries})`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("localhost:3001 did not answer 200");
}

async function ensureAuth(browser: Browser): Promise<void> {
  if (fs.existsSync(AUTH_FILE)) {
    const ctx = await browser.newContext({ storageState: AUTH_FILE });
    const page = await ctx.newPage();
    await page.goto(`${LOCAL_ORIGIN}/talent`, { waitUntil: "domcontentloaded" });
    const ok = !/\/login/.test(page.url());
    await ctx.close();
    if (ok) return;
  }
  const env = readEnv(ENV_FILE);
  const email = env.QA_JOR_REAL_EMAIL;
  const password = env.QA_JOR_REAL_PASSWORD;
  if (!email || !password) throw new Error("QA_JOR_REAL_EMAIL / QA_JOR_REAL_PASSWORD missing in env file");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${LOCAL_ORIGIN}/login`, { waitUntil: "networkidle" });
  assertLocal(page.url());
  await page.locator("input[type=email], input[name=email]").first().fill(email);
  await page.locator("input[type=password]").first().fill(password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }),
    page.locator("form button[type=submit]").first().click(),
  ]);
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  await ctx.storageState({ path: AUTH_FILE });
  fs.chmodSync(AUTH_FILE, 0o600);
  await ctx.close();
}

async function shoot(page: Page, sels: string[], file: string): Promise<boolean> {
  for (const s of sels) {
    const loc = page.locator(s).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      await loc.screenshot({ path: file, animations: "disabled" });
      return true;
    }
  }
  return false;
}

/** Canvas-based diff: both images scaled to the narrower width, padded to the taller height. */
async function diff(ctx: BrowserContext, a: string, b: string, out: string): Promise<number> {
  const page = await ctx.newPage();
  // tsx/esbuild keepNames wraps inner functions in __name(); define it in the page.
  await page.evaluate("globalThis.__name = (f) => f");
  const res = await page.evaluate(
    async ([da, db]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((ok, bad) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = bad;
          i.src = src;
        });
      const [ia, ib] = await Promise.all([load(da), load(db)]);
      const w = Math.min(ia.width, ib.width);
      const ha = Math.round((ia.height * w) / ia.width);
      const hb = Math.round((ib.height * w) / ib.width);
      const h = Math.max(ha, hb);
      const draw = (img: HTMLImageElement, ih: number) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d")!;
        g.fillStyle = "#fff";
        g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, ih);
        return g.getImageData(0, 0, w, h).data;
      };
      const pa = draw(ia, ha);
      const pb = draw(ib, hb);
      const oc = document.createElement("canvas");
      oc.width = w;
      oc.height = h;
      const og = oc.getContext("2d")!;
      const od = og.createImageData(w, h);
      let bad = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
        const grey = (pa[i] + pa[i + 1] + pa[i + 2]) / 3;
        if (d > 48) {
          bad++;
          od.data.set([255, 0, 64, 255], i);
        } else {
          od.data.set([grey, grey, grey, 70], i);
        }
      }
      og.putImageData(od, 0, 0);
      return { score: 100 * (1 - bad / (w * h)), png: oc.toDataURL("image/png") };
    },
    [a, b].map((f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`),
  );
  await page.close();
  fs.writeFileSync(out, Buffer.from(res.png.split(",")[1], "base64"));
  return Math.round(res.score * 10) / 10;
}

async function main(): Promise<void> {
  const designKey = arg("design");
  const viewport = Number(arg("viewport", "1440"));
  const manifest = JSON.parse(fs.readFileSync(path.join(here, "design-diff.manifest.json"), "utf8")) as Manifest;
  const design = designKey ? manifest.designs[designKey] : undefined;
  if (!designKey || !design) throw new Error(`--design must be one of: ${Object.keys(manifest.designs).join(", ")}`);
  if (![1440, 390].includes(viewport)) throw new Error("--viewport must be 1440 or 390");
  const artifactPath = design.artifactPath ? expandHome(design.artifactPath) : null;
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    throw new Error(design.artifactTodo ?? `artifact HTML not found: ${design.artifactPath}`);
  }

  // Serve the artifact's own folder (index.html + kit.js + img/) so photos load.
  // Fixtures live in the repo (scripts/design-diff-fixtures/<design>/) so
  // cloud agents can run this too. Also accept a folder path.
  let serveDir: string;
  if (fs.statSync(artifactPath).isDirectory()) {
    serveDir = artifactPath;
  } else {
    serveDir = path.dirname(path.resolve(artifactPath));
  }
  void SERVE_ROOT;
  const stat = await startStatic(serveDir);

  const outDir = path.join(OUT_ROOT, designKey, String(viewport));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    await waitForLocal();
    await ensureAuth(browser);

    // Artifact side: reviewer page; pick Experience view + device width.
    const actx = await browser.newContext({ viewport: { width: 1800, height: 1200 } });
    const ap = await actx.newPage();
    await ap.goto(`${stat.origin}/index.html`, { waitUntil: "load" });
    await ap.locator("[data-v='exp']").first().click().catch(() => {});
    await ap.locator(`#devseg button[data-d="${viewport}"]`).click().catch(() => {});
    await ap.waitForTimeout(800);

    // Local side.
    const lctx = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: viewport, height: 900 } });
    const lp = await lctx.newPage();
    const t = design.localTalentId ?? manifest.localTalentId;
    const demoKey = arg("demo");
    const localUrl =
      `${LOCAL_ORIGIN}/template-preview/${design.templateSlug}?kind=talent-theme&talent=${t}&talentProfileId=${t}` +
      (demoKey ? `&demo=${encodeURIComponent(`${design.templateSlug}:${demoKey}`)}` : "");
    assertLocal(localUrl);
    await lp.goto(localUrl, { waitUntil: "networkidle", timeout: 120_000 });

    const summary: { row: string; label: string; score: number | null; missing: boolean; missingSide?: string }[] = [];
    for (const row of design.rows) {
      const dir = path.join(outDir, row.id);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of ["artifact.png", "local.png", "diff.png"]) fs.rmSync(path.join(dir, f), { force: true });
      const aOk = await shoot(ap, selList(row.artifactSelector), path.join(dir, "artifact.png"));
      const lOk = await shoot(lp, selList(row.localSelector), path.join(dir, "local.png"));
      let score: number | null = null;
      if (aOk && lOk) score = await diff(actx, path.join(dir, "artifact.png"), path.join(dir, "local.png"), path.join(dir, "diff.png"));
      const missingSide = !aOk && !lOk ? "both" : !aOk ? "artifact" : !lOk ? "local" : undefined;
      summary.push({ row: row.id, label: row.label, score, missing: !(aOk && lOk), ...(missingSide ? { missingSide } : {}) });
      console.log(`${row.id.padEnd(18)} ${score === null ? `MISSING (${missingSide})` : score.toFixed(1)}`);
    }
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ design: designKey, viewport, localUrl, generatedAt: new Date().toISOString(), rows: summary }, null, 2));

    const cell = (r: string, f: string) =>
      fs.existsSync(path.join(outDir, r, f)) ? `<img src="${r}/${f}" loading="lazy">` : `<div class="miss">missing</div>`;
    const html = `<!doctype html><meta charset="utf-8"><title>Design diff ${designKey} ${viewport}</title>
<style>body{font:14px system-ui;margin:16px;background:#f6f5f2}h2{margin:24px 0 8px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.g img{width:100%;border:1px solid #ccc;background:#fff}.miss{padding:40px;text-align:center;color:#a00;border:1px dashed #a00}
.hd{font-weight:600;color:#666}</style>
<h1>${designKey} @ ${viewport}px</h1><p>Artifact photos are absent (relative img/ assets not local): compare layout, type and colour only.</p>
${summary
  .map(
    (s) => `<h2>${s.label} <small>${s.score === null ? "MISSING " + (s.missingSide ?? "") : s.score.toFixed(1) + " / 100"}</small></h2>
<div class="g"><div class="hd">Artifact</div><div class="hd">Local</div><div class="hd">Diff</div>${cell(s.row, "artifact.png")}${cell(s.row, "local.png")}${cell(s.row, "diff.png")}</div>`,
  )
  .join("\n")}`;
    fs.writeFileSync(path.join(outDir, "index.html"), html);
    console.log(`\n${path.join(outDir, "index.html")}`);
  } finally {
    await browser.close();
    stat.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
