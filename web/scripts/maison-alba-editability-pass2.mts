/**
 * Focused follow-up: open real theme Style/Layout tabs + re-prove weak rows
 * via floating "Edit Content" toolbar.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/alba-builder-pending";
const TMP = "/tmp/maison-alba-shots";
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

function cookies() {
  return fs
    .readFileSync("/tmp/alba-cookies.txt", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const p = l.split("\t");
      return p.length >= 7 ? { name: p[5], value: p[6], url: BASE } : null;
    })
    .filter(Boolean) as Array<{ name: string; value: string; url: string }>;
}

async function shot(page: Page, name: string) {
  const tmp = path.join(TMP, name);
  await page.screenshot({ path: tmp, fullPage: false });
  try {
    const buf = fs.readFileSync(tmp);
    if (buf.length < 900_000) fs.copyFileSync(tmp, path.join(OUT, name));
  } catch (e) {
    console.warn("copy", name, e);
  }
  return path.join(OUT, name);
}

async function waitReady(page: Page) {
  await page.waitForTimeout(4000);
  for (let i = 0; i < 15; i++) {
    if ((await page.getByText(/hablan|Ver servicios|Manos que/i).count()) > 0) return;
    await page.waitForTimeout(500);
  }
}

async function editContent(page: Page) {
  const btn = page.getByRole("button", { name: /Edit Content|Editar contenido/i });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

const results: Array<{ id: string; ok: boolean; note: string; shot?: string }> = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies());
const page = await ctx.newPage();

await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await waitReady(page);

// ── Theme via Design → Open theme editor OR Launch checklist Open Theme
async function openTheme(): Promise<boolean> {
  // Prefer Design panel button
  await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  const themeTab = page.getByRole("tab", { name: /^Theme$|^Tema$/i });
  if (await themeTab.count()) await themeTab.first().click().catch(() => {});
  await page.waitForTimeout(400);
  let open = page.locator("[data-design-open-theme], button").filter({ hasText: /Open theme editor|Abrir editor de tema/i });
  if (await open.count()) {
    await open.first().click();
    await page.waitForTimeout(1500);
    return true;
  }
  // Launch checklist
  open = page.getByRole("button", { name: /^Open Theme$|^Abrir tema$/i });
  if (await open.count()) {
    await open.first().click();
    await page.waitForTimeout(1500);
    return true;
  }
  // Any visible Open Theme
  open = page.getByText(/Open Theme|Open theme editor|Abrir editor/i);
  if (await open.count()) {
    await open.first().click();
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

{
  const ok = await openTheme();
  await shot(page, "09-theme-editor-open.png");
  if (ok) {
    // Style tab
    await page.getByRole("tab", { name: /Style|Estilo/i }).click().catch(() => {});
    await page.waitForTimeout(800);
    const styleShot = await shot(page, "09-theme-style-tab-real.png");
    const hasStyle =
      (await page.locator("[data-theme-control^='style-']").count()) > 0 ||
      (await page.getByText(/Type roles|Typography|Tipografía|Buttons|Shape|Reset to design/i).count()) > 0;
    results.push({ id: "style-tab", ok: hasStyle, note: hasStyle ? "Style tab tokens visible" : "Style tab empty", shot: styleShot });

    // Layout → chat.variant
    await page.getByRole("tab", { name: /Layout|Disposición/i }).click().catch(() => {});
    await page.waitForTimeout(700);
    const chatShot = await shot(page, "09-edit-chat.png");
    const hasChat = (await page.getByText(/Chat style|Estilo de chat/i).count()) > 0;
    if (hasChat) {
      await page.getByRole("button", { name: /^Standard$|^Estándar$/i }).first().click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, "09-edit-chat.png");
    }
    results.push({ id: "chat", ok: hasChat, note: hasChat ? "chat.variant control visible" : "chat.variant missing", shot: chatShot });

    // Close drawer if possible
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
  } else {
    results.push({ id: "style-tab", ok: false, note: "could not open theme editor" });
    results.push({ id: "chat", ok: false, note: "could not open theme editor" });
  }
}

// Fresh page builder for block audits
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await waitReady(page);

async function prove(id: string, selectors: string[], action: (p: Page) => Promise<string>) {
  try {
    let clicked = false;
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.count()) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click({ force: true, timeout: 5000 }).catch(() => {});
        clicked = true;
        break;
      }
    }
    await page.waitForTimeout(400);
    await editContent(page);
    const note = await action(page);
    const file = await shot(page, `09-edit-${id}.png`);
    await page.keyboard.press("Control+z").catch(() => {});
    results.push({ id, ok: !note.startsWith("FAIL"), note: `${clicked ? "sel" : "nosel"} · ${note}`, shot: file });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

await prove("ticker", [".site-builder-node--marquee", '[data-builder-node-kind="marquee"]'], async (p) => {
  // Content inspector Style dropdown for marquee variant
  const sel = p.locator("select").filter({ has: p.locator('option[value="serif"], option[value="text"], option:has-text("Serif"), option:has-text("Plain")') }).first();
  if (await sel.count()) {
    await sel.selectOption("text").catch(async () => {
      await sel.selectOption({ index: 0 });
    });
    return "marquee variant → text";
  }
  // Label "Style" near select
  const label = p.locator("label, div").filter({ hasText: /^Style$|^Estilo$/i }).first();
  if (await label.count()) {
    const s = label.locator("xpath=following::select[1]");
    if (await s.count()) {
      await s.selectOption({ index: 0 });
      return "marquee Style select changed";
    }
  }
  const has = await p.getByText(/Plain text|Serif|Separator|Speed|Direction/i).count();
  return has > 0 ? "marquee controls visible" : "FAIL no marquee controls";
});

await prove("menu", ['[data-builder-node-kind="services_catalog"]', "#services"], async (p) => {
  await p.getByRole("tab", { name: /Layout/i }).click().catch(() => {});
  await p.waitForTimeout(400);
  const nameLines = p.locator("select").filter({ has: p.locator('option[value="3"]') }).first();
  // Prefer labeled
  const lab = p.locator("label").filter({ hasText: /Service name lines/i });
  if (await lab.count()) {
    const s = lab.locator("xpath=following::select[1]");
    if (await s.count()) {
      await s.selectOption("2");
      return "nameLineClamp → 2";
    }
  }
  const cta = p.locator("label").filter({ hasText: /Row CTA style/i });
  if (await cta.count()) {
    const s = cta.locator("xpath=following::select[1]");
    if (await s.count()) {
      await s.selectOption("pill");
      return "rowCtaVariant → pill";
    }
  }
  const width = p.locator("label").filter({ hasText: /Content width/i });
  if (await width.count()) {
    const s = width.locator("xpath=following::select[1]");
    if (await s.count()) {
      await s.selectOption("full");
      return "contentWidth → full";
    }
  }
  const has = await p.getByText(/Row CTA|Service name lines|Content width|Ink pill/i).count();
  return has > 0 ? "menu layout controls visible" : "FAIL menu controls";
});

await prove("recent-work", [".sb-portfolio", '[data-builder-node-kind="portfolio"]'], async (p) => {
  await editContent(p);
  const layout = p.locator("select").filter({ has: p.locator('option[value="staggered"]') }).first();
  if (await layout.count()) {
    await layout.selectOption("filmstrip");
    return "portfolio layout → filmstrip";
  }
  const chip = p.getByRole("radio", { name: /Filmstrip|Grid|Staggered/i }).or(p.getByRole("button", { name: /Filmstrip|Grid|Staggered/i }));
  if (await chip.count()) {
    await chip.first().click();
    return "portfolio layout chip";
  }
  const has = await p.getByText(/Staggered strip|Filmstrip|Layout/i).count();
  return has > 0 ? "portfolio layout visible" : "FAIL portfolio layout";
});

await prove("about", ["#about", '[data-anchor-id="about"]'], async (p) => {
  // Click section chrome not inner image — structure layer
  await p.getByRole("button", { name: /Structure|Estructura/i }).first().click().catch(() => {});
  await p.waitForTimeout(300);
  const layer = p.locator("button, [role='treeitem'], li, div").filter({ hasText: /^About$|^Sobre/i }).first();
  if (await layer.count()) await layer.click().catch(() => {});
  await p.waitForTimeout(400);
  await editContent(p);
  await p.getByRole("tab", { name: /Content|Layout|Style/i }).first().click().catch(() => {});
  const has = await p.getByText(/About|Heading|Eyebrow|Photo|Split|Bio/i).count();
  return has > 0 ? "about inspector visible" : "FAIL about";
});

await prove("faq", ['[data-builder-node-kind="accordion"]', "#contact"], async (p) => {
  await editContent(p);
  const has = await p.getByText(/FAQ|Accordion|Question|Start closed|Items/i).count();
  return has > 0 ? "faq inspector visible" : "FAIL faq";
});

// Shell header/footer with Edit Content
await page.goto(`${BASE}/talent/page-builder?shell=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);
await prove("header", [".site-header"], async (p) => {
  await p.getByRole("button", { name: /Structure|Estructura/i }).first().click().catch(() => {});
  await p.waitForTimeout(300);
  await p.locator("text=/^Header$/i").first().click().catch(() => {});
  await p.waitForTimeout(400);
  await editContent(p);
  const has = await p.getByText(/Brand|Tagline|Nav|Language|CTA|Header/i).count();
  return has > 0 ? "header content inspector" : "FAIL header inspector";
});

await prove("footer", ["#site-footer"], async (p) => {
  await p.getByRole("button", { name: /Structure|Estructura/i }).first().click().catch(() => {});
  await p.waitForTimeout(300);
  await p.locator("text=/^Footer$/i").first().click().catch(() => {});
  await p.waitForTimeout(400);
  await editContent(p);
  const has = await p.getByText(/Footer|Stack|Hecho|Social|Credit|Layout/i).count();
  return has > 0 ? "footer inspector" : "FAIL footer";
});

fs.writeFileSync(path.join(OUT, "editability-results-pass2.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
