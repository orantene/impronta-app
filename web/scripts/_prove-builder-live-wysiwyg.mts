/**
 * P0 prove: page-builder canvas vs kind=live-site for Alba (Maison) + Mateo (Folio).
 * Writes after-*.png under media/integ-designs-final/builder-vs-live/.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final/builder-vs-live";
fs.mkdirSync(OUT, { recursive: true });

type Probe = {
  label: string;
  who: string;
  surface: "builder" | "live";
  taggedStyles: number;
  hasSplitCss: boolean;
  splitDisplay: string | null;
  splitW: number;
  splitH: number;
  headerCount: number;
  headerText: string;
  hasHoyChip: boolean;
  hasDockVerServicios: boolean;
  hasPresenceChrome: boolean;
  bodySnippet: string;
};

async function probe(page: Page, label: string, who: string, surface: "builder" | "live"): Promise<Probe> {
  await page.waitForTimeout(5000);
  const metrics = await page.evaluate(() => {
    const styles = Array.from(document.querySelectorAll("style"));
    const tagged = document.querySelectorAll("[data-builder-node-renderer-styles]");
    const hasSplitCss = styles.some((s) => (s.textContent || "").includes("site-builder-node--split"));
    const split =
      document.querySelector(".site-builder-node--split") ||
      document.querySelector("[data-builder-node-kind='split']");
    let splitDisplay: string | null = null;
    let splitW = 0;
    let splitH = 0;
    if (split) {
      const cs = getComputedStyle(split as HTMLElement);
      splitDisplay = cs.display;
      const r = (split as HTMLElement).getBoundingClientRect();
      splitW = Math.round(r.width);
      splitH = Math.round(r.height);
    }
    const header = document.querySelector(
      "[data-talent-max-site-header], [data-talent-builder-shell='header'], [data-talent-shell-landmark='site_header']",
    );
    const headerText = header ? ((header as HTMLElement).innerText || "").replace(/\s+/g, " ").slice(0, 160) : "";
    const body = (document.body?.innerText || "").replace(/\s+/g, " ");
    return {
      taggedStyles: tagged.length,
      hasSplitCss,
      splitDisplay,
      splitW,
      splitH,
      headerCount: header ? 1 : 0,
      headerText,
      hasHoyChip: /Hoy a las|Próximo horario|Next available/i.test(body),
      hasDockVerServicios: /Ver servicios|See services/i.test(body),
      hasPresenceChrome: /also editing|está editando/i.test(body),
      bodySnippet: body.slice(0, 280),
    };
  });
  return { label, who, surface, ...metrics };
}

async function runWho(
  who: "alba" | "mateo",
  auth: string,
  talentId: string,
): Promise<Probe[]> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: auth,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const results: Probe[] = [];

  await page.goto(`${BASE}/talent/page-builder`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const builder = await probe(page, `${who}-builder`, who, "builder");
  results.push(builder);
  await page.screenshot({
    path: path.join(OUT, `after-${who}-builder.png`),
    fullPage: false,
  });
  // Crop-ish full canvas scroll top already; also a taller fullPage for archive
  await page.screenshot({
    path: path.join(OUT, `after-${who}-builder-full.png`),
    fullPage: true,
  });

  await page.goto(
    `${BASE}/template-preview/current?kind=live-site&talent=${talentId}&locale=es`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );
  const live = await probe(page, `${who}-live`, who, "live");
  results.push(live);
  await page.screenshot({
    path: path.join(OUT, `after-${who}-live.png`),
    fullPage: false,
  });
  await page.screenshot({
    path: path.join(OUT, `after-${who}-live-full.png`),
    fullPage: true,
  });

  await browser.close();
  return results;
}

function passPair(builder: Probe, live: Probe) {
  const notes: string[] = [];
  let ok = true;
  if (builder.splitDisplay !== "grid" && live.splitDisplay === "grid") {
    ok = false;
    notes.push(`splitDisplay builder=${builder.splitDisplay} live=${live.splitDisplay}`);
  }
  if (!builder.hasSplitCss && live.hasSplitCss) {
    ok = false;
    notes.push("builder missing split CSS sheet");
  }
  if (builder.headerCount === 0 && live.headerCount > 0) {
    ok = false;
    notes.push("builder missing shell header");
  }
  if (live.hasHoyChip && !builder.hasHoyChip) {
    ok = false;
    notes.push("builder missing next-free chip text");
  }
  if (live.hasDockVerServicios && !builder.hasDockVerServicios) {
    // dock may be outside body text on builder if presence chrome wins — flag soft
    notes.push("WARN builder missing Ver servicios (dock)");
  }
  return { ok, notes };
}

async function main() {
  const alba = await runWho(
    "alba",
    "/home/ubuntu/.claude/design-diff/.auth-alba-nail-artist.json",
    "8a59afc1-6e2e-49cd-b78d-27f689cc80f5",
  );
  const mateo = await runWho(
    "mateo",
    "/home/ubuntu/.claude/design-diff/.auth-mateo-ferrer.json",
    "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc",
  );
  const all = [...alba, ...mateo];
  // Compat names Oran plan asked for
  for (const [src, dst] of [
    ["after-alba-builder.png", "after-builder-canvas.png"],
    ["after-alba-builder-full.png", "after-builder-full.png"],
    ["after-alba-live-full.png", "after-live-full.png"],
  ] as const) {
    const a = path.join(OUT, src);
    const b = path.join(OUT, dst);
    if (fs.existsSync(a)) fs.copyFileSync(a, b);
  }

  const albaPair = passPair(alba[0]!, alba[1]!);
  const mateoPair = passPair(mateo[0]!, mateo[1]!);
  const summary = {
    albaPair,
    mateoPair,
    probes: all,
  };
  fs.writeFileSync(path.join(OUT, "prove-results.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    "ALBA",
    albaPair.ok ? "PASS" : "FAIL",
    albaPair.notes.join("; ") || "ok",
  );
  console.log(
    "MATEO",
    mateoPair.ok ? "PASS" : "FAIL",
    mateoPair.notes.join("; ") || "ok",
  );
}

await main();
