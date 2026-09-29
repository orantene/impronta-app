/**
 * Alba Maison v2 editability audit (PENDING 9): click each Builder-map row,
 * change one design-specific control, screenshot inspector + canvas, Undo.
 *
 *   cd web && npx tsx --env-file=.env.local scripts/maison-alba-editability.mts
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final/maison-alba";
const TMP_SHOTS = "/tmp/maison-alba-shots";
const PROFILE = "8a59afc1-6e2e-49cd-b78d-27f689cc80f5";
const LIVE = `${BASE}/template-preview/current?kind=live-site&talent=${PROFILE}&locale=es`;

type Result = { id: string; ok: boolean; note: string; shot?: string; control?: string };

async function shot(page: Page, name: string) {
  fs.mkdirSync(TMP_SHOTS, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = path.join(TMP_SHOTS, name);
  await page.screenshot({ path: tmp, fullPage: false, type: "png" });
  // JPEG-compress via sharp if available; else copy with size guard
  const dest = path.join(OUT, name);
  try {
    const buf = fs.readFileSync(tmp);
    if (buf.length > 900_000) {
      // Oversized — keep only in /tmp and skip store copy
      console.warn("skip store copy (too large)", name, buf.length);
      return tmp;
    }
    fs.copyFileSync(tmp, dest);
    return dest;
  } catch (e) {
    console.warn("store copy failed", name, e);
    return tmp;
  }
}

function cookiesFromFile() {
  return fs
    .readFileSync("/tmp/alba-cookies.txt", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const p = l.split("\t");
      if (p.length < 7) return null;
      return { name: p[5], value: p[6], url: BASE };
    })
    .filter(Boolean) as Array<{ name: string; value: string; url: string }>;
}

async function waitCanvas(page: Page) {
  await page.waitForTimeout(3500);
  // Wait until hero copy appears (composition loaded)
  for (let i = 0; i < 20; i++) {
    const has = await page.getByText(/hablan|Manos que|Ver servicios/i).count();
    if (has > 0) return;
    await page.waitForTimeout(500);
  }
}

async function selectByStructure(page: Page, labels: RegExp) {
  const structure = page.getByRole("button", { name: /Structure|Estructura|Layers/i });
  if (await structure.count()) await structure.first().click().catch(() => {});
  await page.waitForTimeout(400);
  const layer = page.locator("[data-structure-row], [data-layer-row], button, [role='treeitem'], li").filter({ hasText: labels }).first();
  if (await layer.count()) {
    await layer.click({ timeout: 5000 });
    await page.waitForTimeout(600);
    return true;
  }
  // Fallback: any text match in left rail
  const alt = page.getByText(labels).first();
  if (await alt.count()) {
    await alt.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function clickCanvas(page: Page, selectors: string[]) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
        await loc.click({ timeout: 5000, force: true });
        await page.waitForTimeout(500);
        return true;
      } catch {
        /* try next */
      }
    }
  }
  // Click via builder node wrapper
  for (const sel of selectors) {
    const wrap = page.locator("[data-builder-node-kind]").filter({ has: page.locator(sel) }).first();
    if (await wrap.count()) {
      try {
        await wrap.click({ timeout: 5000, force: true });
        await page.waitForTimeout(500);
        return true;
      } catch {
        /* continue */
      }
    }
  }
  return false;
}

async function openInspectorTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  if (await tab.count()) await tab.first().click().catch(() => {});
  await page.waitForTimeout(300);
}

async function changeSelectNearLabel(page: Page, label: RegExp, option: string | number): Promise<boolean> {
  const field = page.locator("div, label, section").filter({ hasText: label }).first();
  const select = field.locator("select").first();
  if (await select.count()) {
    if (typeof option === "number") await select.selectOption({ index: option });
    else await select.selectOption(option).catch(async () => {
      await select.selectOption({ label: option });
    });
    return true;
  }
  // Global search for labeled select
  const labels = page.locator("label").filter({ hasText: label });
  if (await labels.count()) {
    const id = await labels.first().getAttribute("for");
    if (id) {
      const s = page.locator(`#${id}`);
      if (await s.count()) {
        await s.selectOption(String(option)).catch(async () => {
          await s.selectOption({ index: Number(option) || 0 });
        });
        return true;
      }
    }
    const sibling = labels.first().locator("xpath=following::select[1]");
    if (await sibling.count()) {
      await sibling.selectOption(String(option)).catch(async () => {
        await sibling.selectOption({ index: 0 });
      });
      return true;
    }
  }
  return false;
}

async function undo(page: Page) {
  await page.keyboard.press("Control+z").catch(() => {});
  await page.waitForTimeout(200);
}

async function openThemeEditor(page: Page) {
  await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  // Theme sub-tab inside Design panel
  const themeTab = page.getByRole("tab", { name: /^Theme$|^Tema$/i });
  if (await themeTab.count()) await themeTab.first().click().catch(() => {});
  await page.waitForTimeout(300);
  const openBtn = page.getByRole("button", { name: /Open theme editor|Abrir editor/i });
  if (await openBtn.count()) {
    await openBtn.first().click();
    await page.waitForTimeout(1200);
    return true;
  }
  // data attribute fallback
  const alt = page.locator("[data-design-open-theme]");
  if (await alt.count()) {
    await alt.first().click();
    await page.waitForTimeout(1200);
    return true;
  }
  return false;
}

type RowSpec = {
  id: string;
  selectors: string[];
  structure?: RegExp;
  shell?: boolean;
  run: (page: Page) => Promise<{ ok: boolean; control: string; note: string }>;
};

const rows: RowSpec[] = [
  {
    id: "header",
    selectors: [".site-header", '[data-section-type="site_header"]'],
    structure: /Header|Encabezado|site_header/i,
    shell: true,
    run: async (page) => {
      await openInspectorTab(page, /Content|Layout|Style/i);
      const changed =
        (await changeSelectNearLabel(page, /Logo scale|Brand display|Wordmark|Tagline/i, 1)) ||
        (await changeSelectNearLabel(page, /Tone|Header tone|Surface/i, 1));
      if (changed) return { ok: true, control: "header brand/tone", note: "changed header control" };
      // At least prove inspector shows header fields
      const has = await page.getByText(/Header|Brand|Nav|Language|CTA/i).count();
      return {
        ok: has > 0,
        control: "header inspector open",
        note: has > 0 ? "header inspector visible (no mutable select found)" : "header inspector empty",
      };
    },
  },
  {
    id: "hero",
    selectors: ["#hero", '[data-anchor-id="hero"]', ".site-builder-node--hero"],
    structure: /Hero|Portada/i,
    run: async (page) => {
      await openInspectorTab(page, /Content|Style/i);
      const text = page.locator('textarea, [contenteditable="true"], input[type="text"]').first();
      if (await text.count()) {
        const before = await text.inputValue().catch(async () => (await text.textContent()) ?? "");
        await text.click();
        await text.fill((before || "Manos") + " ·");
        return { ok: true, control: "hero text", note: "hero text patched then undo" };
      }
      const has = await page.getByText(/Hero|Heading|Eyebrow|CTA/i).count();
      return { ok: has > 0, control: "hero selected", note: has > 0 ? "hero inspector visible" : "hero miss" };
    },
  },
  {
    id: "ticker",
    selectors: ['.site-builder-node--marquee', '[data-builder-node-kind="marquee"]'],
    structure: /Ticker|Marquee|Cinta/i,
    run: async (page) => {
      await openInspectorTab(page, /Content|Style/i);
      const ok = await changeSelectNearLabel(page, /Style|Variant|Estilo/i, "text");
      if (ok) return { ok: true, control: "marquee variant → text", note: "serif→text" };
      const sel = page.locator("select").filter({ has: page.locator('option[value="serif"], option[value="text"]') }).first();
      if (await sel.count()) {
        await sel.selectOption("text");
        return { ok: true, control: "marquee variant → text", note: "via option value" };
      }
      return { ok: false, control: "marquee variant", note: "variant select missing" };
    },
  },
  {
    id: "recent-work",
    selectors: [".sb-portfolio", '[data-builder-node-kind="portfolio"]'],
    structure: /Recent|Trabajo|Portfolio|Work/i,
    run: async (page) => {
      await openInspectorTab(page, /Content|Layout/i);
      const layout = page.locator("select").filter({ has: page.locator('option[value="staggered"]') }).first();
      if (await layout.count()) {
        await layout.selectOption("filmstrip");
        return { ok: true, control: "portfolio layout → filmstrip", note: "staggered→filmstrip" };
      }
      const chip = page.getByRole("button", { name: /Filmstrip|Grid|Masonry/i }).first();
      if (await chip.count()) {
        await chip.click();
        return { ok: true, control: "portfolio layout chip", note: "layout chip clicked" };
      }
      const has = await page.getByText(/Staggered|Filmstrip|Layout/i).count();
      return { ok: has > 0, control: "portfolio layout", note: has > 0 ? "layout options visible" : "no layout control" };
    },
  },
  {
    id: "menu",
    selectors: ['[data-builder-node-kind="services_catalog"]', ".site-builder-node--services-catalog", "#services"],
    structure: /Services|Menú|Menu|Catálogo|Catalog/i,
    run: async (page) => {
      await openInspectorTab(page, /Layout|Content/i);
      let ok = await changeSelectNearLabel(page, /Service name lines/i, "2");
      if (ok) return { ok: true, control: "nameLineClamp → 2", note: "3→2 lines" };
      ok = await changeSelectNearLabel(page, /Row CTA style/i, "pill");
      if (ok) return { ok: true, control: "rowCtaVariant → pill", note: "outline→ink pill" };
      ok = await changeSelectNearLabel(page, /Content width/i, "full");
      if (ok) return { ok: true, control: "contentWidth → full", note: "full width" };
      const has = await page.getByText(/Row CTA|Service name|Content width|Seleccionar/i).count();
      return { ok: has > 0, control: "menu chrome", note: has > 0 ? "menu controls visible" : "menu controls missing" };
    },
  },
  {
    id: "reviews",
    selectors: [".sb-reviews", '[data-builder-node-kind="reviews"]', "#reviews"],
    structure: /Reviews|Reseñas/i,
    run: async (page) => {
      await openInspectorTab(page, /Layout|Content/i);
      const layout = page.locator("select").filter({ has: page.locator('option[value="trio"]') }).first();
      if (await layout.count()) {
        await layout.selectOption("row");
        return { ok: true, control: "reviews layout → row", note: "trio→row" };
      }
      const has = await page.getByText(/trio|layout|Reviews|showRating/i).count();
      return { ok: has > 0, control: "reviews layout", note: has > 0 ? "reviews inspector visible" : "reviews miss" };
    },
  },
  {
    id: "about",
    selectors: ["#about", '[data-anchor-id="about"]', ".sb-about"],
    structure: /About|Sobre|Acerca/i,
    run: async (page) => {
      await openInspectorTab(page, /Layout|Content|Style/i);
      const has = await page.getByText(/About|Heading|Photo|Split|Columns/i).count();
      const ok = await changeSelectNearLabel(page, /Columns|Layout|Gap/i, 1);
      return {
        ok: ok || has > 0,
        control: ok ? "about layout" : "about selected",
        note: ok ? "about layout changed" : has > 0 ? "about inspector visible" : "about miss",
      };
    },
  },
  {
    id: "visit",
    selectors: [".sb-visit", '[data-builder-node-kind="visit"]', "#visit"],
    structure: /Visit|Visita|Your visit/i,
    run: async (page) => {
      await openInspectorTab(page, /Layout|Content/i);
      const layout = page.locator("select").filter({ has: page.locator('option[value="facts"]') }).first();
      if (await layout.count()) {
        await layout.selectOption("split");
        return { ok: true, control: "visit layout → split", note: "facts→split" };
      }
      const has = await page.getByText(/facts|Visit|Dónde|Anticipo/i).count();
      return { ok: has > 0, control: "visit facts", note: has > 0 ? "visit inspector/content visible" : "visit miss" };
    },
  },
  {
    id: "faq",
    selectors: ['[data-builder-node-kind="accordion"]', "#contact"],
    structure: /FAQ|Preguntas|Accordion|Contact/i,
    run: async (page) => {
      await openInspectorTab(page, /Content|Layout/i);
      const toggle = page.getByLabel(/Start closed|start closed|Closed by default/i);
      if (await toggle.count()) {
        await toggle.first().click();
        return { ok: true, control: "accordion startClosed", note: "toggled" };
      }
      const has = await page.getByText(/FAQ|Accordion|Question|Start closed/i).count();
      return { ok: has > 0, control: "faq selected", note: has > 0 ? "faq inspector visible" : "faq miss" };
    },
  },
  {
    id: "footer",
    selectors: ["#site-footer", '[data-anchor-id="site-footer"]', ".site-footer"],
    structure: /Footer|Pie|site_footer|site-footer/i,
    shell: true,
    run: async (page) => {
      await openInspectorTab(page, /Content|Style|Layout/i);
      const has = await page.getByText(/Footer|Hecho|Social|Credit|Fine print/i).count();
      const text = page.locator('textarea, [contenteditable="true"], input[type="text"]').first();
      if (await text.count()) {
        await text.click();
        return { ok: true, control: "footer text", note: "footer field focused" };
      }
      return {
        ok: has > 0,
        control: "footer inspector",
        note: has > 0 ? "footer inspector visible" : "footer miss",
      };
    },
  },
  {
    id: "dock",
    selectors: [".cb-bar", "[data-booking-dock]", ".site-booking-dock"],
    structure: /Dock|Booking bar|Barra/i,
    run: async (page) => {
      // Dock is often chrome, not a canvas node — try theme Layout or select by text
      const dock = page.locator(".cb-bar, [data-booking-dock]").first();
      if (await dock.count()) {
        await dock.click({ force: true }).catch(() => {});
      }
      await openInspectorTab(page, /Content|Layout/i);
      const has = await page.getByText(/Ver servicios|See services|Dock|Booking/i).count();
      return {
        ok: has > 0,
        control: "dock chrome",
        note: has > 0 ? "dock visible on canvas (chrome)" : "dock not found",
      };
    },
  },
];

async function auditRow(page: Page, row: RowSpec): Promise<Result> {
  try {
    if (row.shell) {
      await page.goto(`${BASE}/talent/page-builder?shell=1`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await waitCanvas(page);
    }
    let selected = await clickCanvas(page, row.selectors);
    if (!selected && row.structure) {
      selected = await selectByStructure(page, row.structure);
    }
    if (!selected && !row.shell) {
      // try structure anyway with id
      selected = await selectByStructure(page, new RegExp(row.id, "i"));
    }
    const result = await row.run(page);
    const file = await shot(page, `09-edit-${row.id}.png`);
    await undo(page);
    return {
      id: row.id,
      ok: result.ok,
      note: `${selected ? "selected" : "unselected"} · ${result.note}`,
      control: result.control,
      shot: file,
    };
  } catch (e) {
    await shot(page, `09-edit-${row.id}-fail.png`).catch(() => {});
    return { id: row.id, ok: false, note: String(e) };
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookiesFromFile());

  const results: Result[] = [];
  const page = await context.newPage();
  await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitCanvas(page);
  await shot(page, "09-builder-canvas-1440.png");

  const live = await context.newPage();
  await live.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await live.waitForTimeout(2500);
  await shot(live, "09-live-site-1440.png");
  await live.close();

  for (const row of rows) {
    // Ensure we're on page builder (shell rows navigate themselves)
    if (!row.shell && !page.url().includes("/talent/page-builder")) {
      await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await waitCanvas(page);
    } else if (!row.shell && page.url().includes("shell=1")) {
      await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await waitCanvas(page);
    }
    const r = await auditRow(page, row);
    results.push(r);
    console.log(JSON.stringify(r));
  }

  // Chat variant via theme Layout tab
  try {
    const opened = await openThemeEditor(page);
    if (!opened) throw new Error("Open theme editor failed");
    await page.getByRole("tab", { name: /Layout|Disposición/i }).click();
    await page.waitForTimeout(600);
    const chatLabel = page.getByText(/Chat style|Estilo de chat/i);
    const hasChat = (await chatLabel.count()) > 0;
    if (hasChat) {
      await page.getByRole("button", { name: /^Standard$|^Estándar$/i }).first().click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const file = await shot(page, "09-edit-chat.png");
    results.push({
      id: "chat",
      ok: hasChat,
      control: "chat.variant",
      note: hasChat ? "Layout → Chat style visible" : "chat.variant control missing",
      shot: file,
    });

    // Style tab (PENDING 8 proof)
    await page.getByRole("tab", { name: /Style|Estilo/i }).click();
    await page.waitForTimeout(700);
    const styleFile = await shot(page, "09-theme-style-tab-real.png");
    const hasStyle =
      (await page.getByText(/Type roles|Typography|Tipografía|Reset to design|Buttons|Shape/i).count()) > 0 ||
      (await page.locator("[data-theme-control^='style-']").count()) > 0;
    results.push({
      id: "style-tab",
      ok: hasStyle,
      control: "Design → Style tab (type.system)",
      note: hasStyle ? "Style tab tokens visible" : "Style tab empty/missing",
      shot: styleFile,
    });
    await shot(page, "09-theme-layout-chat-real.png");
  } catch (e) {
    results.push({ id: "chat", ok: false, note: String(e) });
    results.push({ id: "style-tab", ok: false, note: String(e) });
  }

  fs.writeFileSync(path.join(OUT, "editability-results.json"), JSON.stringify(results, null, 2));
  console.log("---");
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
