/**
 * Folio editability depth — mutate one Style/Layout (or content-layout) prop
 * per Builder-map row, observe inspector/canvas, Undo.
 *
 * Prefers direct `[data-builder-node-kind]` click once magazine leaves emit
 * node-id/kind (masthead/contents/comp/statement/portfolio tip).
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const AUTH = "/home/ubuntu/.claude/design-diff/.auth-mateo-ferrer.json";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/folio-mateo-dod";
const TMP = "/tmp/folio-edit-depth";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

type Row = { id: string; ok: boolean; note: string; control?: string; shot?: string };
const results: Row[] = [];

async function shot(page: Page, name: string) {
  const file = `06-edit-${name}.png`;
  const tmp = path.join(TMP, file);
  await page.screenshot({ path: tmp, fullPage: false });
  try {
    if (fs.statSync(tmp).size < 1_500_000) fs.copyFileSync(tmp, path.join(OUT, file));
  } catch {
    /* */
  }
  return path.join(OUT, file);
}

async function ensureDock(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
}

async function contentTab(page: Page) {
  await page
    .getByRole("tab", { name: /^Content$|^Contenido$/i })
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(350);
}

async function layoutTab(page: Page) {
  await page
    .getByRole("tab", { name: /^Layout$|^Disposición$/i })
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(350);
}

async function styleTab(page: Page) {
  await page
    .getByRole("tab", { name: /^Style$|^Estilo$/i })
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(350);
}

async function undo(page: Page) {
  await page.keyboard.press("Control+z").catch(() => {});
  await page.waitForTimeout(450);
}

async function dockVisible(page: Page) {
  return page.locator("[data-testid=inspector-dock]").isVisible().catch(() => false);
}

/** Click a leaf by kind (and optional CSS fallbacks). */
async function selectKind(
  page: Page,
  kind: string,
  fallbacks: string[] = [],
): Promise<boolean> {
  await ensureDock(page);
  const selectors = [
    `[data-builder-node-kind="${kind}"]`,
    `[data-builder-kind="${kind}"]`,
    ...fallbacks,
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) continue;
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 4000 });
      await loc.click({ force: true, timeout: 5000 });
      await page.waitForTimeout(700);
      if (await dockVisible(page)) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function mutateSelectNearLabel(
  page: Page,
  label: RegExp,
  option: string,
): Promise<string> {
  const dock = page.locator("[data-testid=inspector-dock]");
  if (!(await dock.isVisible().catch(() => false))) return "";
  const labels = dock.locator("label").filter({ hasText: label });
  if (await labels.count()) {
    const forId = await labels.first().getAttribute("for");
    if (forId) {
      const s = dock.locator(`#${CSS.escape(forId)}`);
      if (await s.count()) {
        await s.selectOption(option).catch(async () => {
          await s.selectOption({ label: option });
        });
        return `${label.source} → ${option}`;
      }
    }
    const sib = labels.first().locator("xpath=following::select[1]");
    if (await sib.count()) {
      await sib.selectOption(option).catch(async () => {
        await sib.selectOption({ label: option });
      });
      return `${label.source} → ${option}`;
    }
  }
  return "";
}

async function clickChip(page: Page, name: RegExp): Promise<string> {
  const dock = page.locator("[data-testid=inspector-dock]");
  const btn = dock.getByRole("button", { name });
  if (await btn.count()) {
    await btn.first().click({ force: true });
    const t = ((await btn.first().textContent()) || "").trim();
    await page.waitForTimeout(400);
    return t;
  }
  return "";
}

async function patchFirstText(page: Page, suffix = " ·E"): Promise<string> {
  const dock = page.locator("[data-testid=inspector-dock]");
  const inp = dock.locator("input[type='text'], textarea").first();
  if (!(await inp.count())) return "";
  const v = await inp.inputValue().catch(async () => (await inp.textContent()) ?? "");
  await inp.fill(`${v}${suffix}`.slice(0, 72));
  await page.waitForTimeout(300);
  return "text patched";
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
await page.goto(`${BASE}/talent/page-builder`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(4500);
if (/\/login/.test(page.url())) throw new Error(page.url());

// Probe: how many magazine leaves are selectable now?
const kindCounts = await page.evaluate(() => {
  const kinds = [
    "masthead",
    "contents",
    "portfolio",
    "comp_card",
    "services_catalog",
    "statement_footer",
  ];
  const out: Record<string, { kind: number; id: number }> = {};
  for (const k of kinds) {
    out[k] = {
      kind: document.querySelectorAll(`[data-builder-node-kind="${k}"]`).length,
      id: document.querySelectorAll(
        `[data-builder-node-kind="${k}"][data-builder-node-id]`,
      ).length,
    };
  }
  return out;
});
fs.writeFileSync(
  path.join(OUT, "06-kind-probe.json"),
  JSON.stringify(kindCounts, null, 2),
);
console.log("KIND_PROBE", JSON.stringify(kindCounts));

// ── cover / masthead ──────────────────────────────────────────────────────
{
  const id = "cover";
  try {
    const selected = await selectKind(page, "masthead", [".sb-masthead", "#hero .sb-masthead"]);
    await contentTab(page);
    let control = "";
    // coverFilter: Full color / B&W chips
    const full = await clickChip(page, /Full color|A color|Color completo/i);
    if (full) control = `coverFilter → none (${full})`;
    if (!control) {
      const bw = await clickChip(page, /B\s*&\s*W|Blanco y negro|Black.?white/i);
      if (bw) control = `coverFilter → bw (${bw})`;
    }
    if (!control) {
      const split = await clickChip(page, /Split|Divid/i);
      if (split) control = `splitWords (${split})`;
    }
    if (!control) {
      control = await mutateSelectNearLabel(page, /filter|Filter|filtro/i, "none");
    }
    if (!control) control = await patchFirstText(page);
    const file = await shot(page, "cover");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || (selected ? "selected; no control" : "masthead miss"),
      control,
      shot: file,
    });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

// ── contents ──────────────────────────────────────────────────────────────
{
  const id = "contents";
  try {
    const selected = await selectKind(page, "contents", [".sb-mag-toc", "#contents"]);
    await contentTab(page);
    let control = "";
    const dec = await clickChip(page, /decimal|Decimal|1,\s*2|Arabic/i);
    if (dec) control = `numberStyle → decimal (${dec})`;
    if (!control) {
      const rom = await clickChip(page, /roman|Roman|i,\s*ii|Romano/i);
      if (rom) control = `numberStyle → roman (${rom})`;
    }
    if (!control) {
      control = await mutateSelectNearLabel(page, /number|Number|numer/i, "decimal");
    }
    if (!control) control = await patchFirstText(page);
    const file = await shot(page, "contents");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || (selected ? "selected; no control" : "contents miss"),
      control,
      shot: file,
    });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

// ── chapters / portfolio ──────────────────────────────────────────────────
{
  const id = "chapters";
  try {
    const selected = await selectKind(page, "portfolio", [
      ".sb-portfolio[data-edition='magazine']",
      "#chapter-1 .sb-portfolio",
      ".sb-portfolio",
    ]);
    await contentTab(page);
    let control = "";
    const layoutSel = page
      .locator("[data-testid=inspector-dock] select")
      .filter({
        has: page.locator(
          'option[value="filmstrip"], option[value="grid"], option[value="staggered"], option[value="chapters"], option[value="contact_sheet"], option[value="chapter"]',
        ),
      })
      .first();
    if (await layoutSel.count()) {
      const cur = await layoutSel.inputValue();
      const opts = await layoutSel.locator("option").evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
      const next = opts.find((o) => o !== cur) ?? opts[0];
      if (next) {
        await layoutSel.selectOption(next);
        control = `portfolio layout → ${next}`;
      }
    }
    if (!control) {
      const cap = page
        .locator("[data-testid=inspector-dock] label")
        .filter({ hasText: /caption|Caption|leyenda|Show captions/i });
      if (await cap.count()) {
        await cap
          .locator("input")
          .first()
          .click({ force: true })
          .catch(async () => {
            await cap.click({ force: true });
          });
        control = "showCaptions toggled";
      }
    }
    if (!control) control = await patchFirstText(page);
    const file = await shot(page, "chapters");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || (selected ? "selected; no control" : "portfolio miss"),
      control,
      shot: file,
    });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

// ── comp-card ─────────────────────────────────────────────────────────────
{
  const id = "comp-card";
  try {
    const selected = await selectKind(page, "comp_card", [".sb-comp-card", "#comp-card"]);
    await contentTab(page);
    let control = "";
    const layout = page
      .locator("[data-testid=inspector-dock] select")
      .filter({
        has: page.locator('option[value="strip"], option[value="strip_with_details"]'),
      })
      .first();
    if (await layout.count()) {
      const cur = await layout.inputValue();
      await layout.selectOption(cur === "strip" ? "strip_with_details" : "strip");
      control = `comp_card layout → ${cur === "strip" ? "strip_with_details" : "strip"}`;
    }
    if (!control) {
      const det = page
        .locator("[data-testid=inspector-dock] label")
        .filter({ hasText: /details|Details|detalles|full/i });
      if (await det.count()) {
        await det
          .locator("input")
          .first()
          .click({ force: true })
          .catch(async () => {
            await det.click({ force: true });
          });
        control = "showFullDetails toggled";
      }
    }
    if (!control) control = await patchFirstText(page);
    const file = await shot(page, "comp-card");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || (selected ? "selected; no control" : "comp miss"),
      control,
      shot: file,
    });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

// ── rate-card / services_catalog ──────────────────────────────────────────
{
  const id = "rate-card";
  try {
    const selected = await selectKind(page, "services_catalog", [
      ".site-builder-node--services-catalog",
      "#services",
    ]);
    await layoutTab(page);
    let control = "";
    const nameLines = page
      .locator("[data-testid=inspector-dock] label")
      .filter({ hasText: /Service name lines|Líneas del nombre/i });
    if (await nameLines.count()) {
      const s = nameLines.locator("xpath=following::select[1]");
      if (await s.count()) {
        await s.selectOption("2");
        control = "nameLineClamp → 2";
      }
    }
    if (!control) {
      await contentTab(page);
      const layout = page
        .locator("[data-testid=inspector-dock] select")
        .filter({
          has: page.locator(
            'option[value="rate_card"], option[value="editorial"], option[value="rows"]',
          ),
        })
        .first();
      if (await layout.count()) {
        const cur = await layout.inputValue();
        const opts = await layout.locator("option").evaluateAll((os) =>
          os.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
        );
        const next = opts.find((o) => o !== cur);
        if (next) {
          await layout.selectOption(next);
          control = `services layout → ${next}`;
        }
      }
    }
    if (!control) {
      await contentTab(page);
      control = await patchFirstText(page);
      if (control) control = `services ${control}`;
    }
    const file = await shot(page, "rate-card");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || (selected ? "selected; no control" : "services miss"),
      control,
      shot: file,
    });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

// ── statement-footer ──────────────────────────────────────────────────────
{
  const id = "statement-footer";
  try {
    const selected = await selectKind(page, "statement_footer", [
      ".sb-statement-footer",
      "[data-builder-kind='statement_footer']",
    ]);
    await contentTab(page);
    let control = "";
    const align = await clickChip(
      page,
      /^Left$|^Center$|^Right$|^Izquierda$|^Centro$|^Derecha$/i,
    );
    if (align) control = `align → ${align}`;
    if (!control) {
      await styleTab(page);
      const align2 = await clickChip(
        page,
        /^Left$|^Center$|^Right$|^Izquierda$|^Centro$|^Derecha$/i,
      );
      if (align2) control = `align → ${align2}`;
    }
    if (!control) {
      await contentTab(page);
      control = await patchFirstText(page);
      if (control) control = `statement ${control}`;
    }
    const file = await shot(page, "statement-footer");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || (selected ? "selected; no control" : "footer miss"),
      control,
      shot: file,
    });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

// ── header via shell=1 ────────────────────────────────────────────────────
{
  const id = "header";
  try {
    await page.goto(`${BASE}/talent/page-builder?shell=1`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(4000);
    await ensureDock(page);
    await page.getByRole("button", { name: /^Structure$/i }).first().click({ force: true });
    await page.waitForTimeout(600);
    const layers = page.locator('[aria-label="Page layers"]');
    const header = layers.getByText(/Header|Encabezado|Cabecera/i).first();
    let control = "";
    if (await header.count()) {
      await header.click({ force: true });
      await page.waitForTimeout(500);
      await contentTab(page);
      const patched = await patchFirstText(page, " ·H");
      control = patched ? "header field patched" : "structure header selected";
      if (patched) await undo(page);
    }
    const file = await shot(page, "header");
    results.push({
      id,
      ok: Boolean(control),
      note: control || "header miss",
      control,
      shot: file,
    });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

// ── chat theme Layout ─────────────────────────────────────────────────────
{
  const id = "chat";
  try {
    await page.goto(`${BASE}/talent/page-builder`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3500);
    await ensureDock(page);
    await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page
      .getByRole("tab", { name: /^Theme$|^Tema$/i })
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(400);
    let opened = false;
    for (const re of [
      /Open theme editor/i,
      /Open Theme/i,
      /Abrir editor de tema/i,
      /Theme editor/i,
    ]) {
      const b = page.getByRole("button", { name: re });
      const n = await b.count();
      for (let i = 0; i < n; i++) {
        if (await b.nth(i).isVisible().catch(() => false)) {
          await b.nth(i).click({ force: true, timeout: 5000 }).catch(() => {});
          opened = true;
          break;
        }
      }
      if (opened) break;
    }
    if (!opened) {
      const t = page
        .locator("button, a, [role='button']")
        .filter({ hasText: /Open theme|Abrir editor|Theme editor/i });
      if (await t.count()) {
        await t.first().click({ force: true, timeout: 5000 }).catch(() => {});
        opened = true;
      }
    }
    await page.waitForTimeout(1500);
    const drawer = page.locator("[data-edit-drawer=theme]");
    let control = "";
    if (await drawer.isVisible().catch(() => false)) {
      await drawer.getByRole("tab", { name: /^Layout$/i }).click({ force: true });
      await page.waitForTimeout(500);
      const std = drawer.getByRole("button", { name: /^Standard$/i });
      if (await std.count()) {
        await std.first().click({ force: true });
        control = "chat.variant → Standard";
        await page.waitForTimeout(300);
        const card = drawer.getByRole("button", { name: /^Card$/i });
        if (await card.count()) await card.first().click({ force: true });
      } else if (await drawer.getByText(/Chat style/i).count()) {
        control = "chat style visible";
      }
    }
    const file = await shot(page, "chat");
    const discard = drawer.getByRole("button", { name: /Discard/i });
    if (await discard.count()) await discard.first().click({ force: true }).catch(() => {});
    else await page.keyboard.press("Escape");
    results.push({
      id,
      ok: Boolean(control),
      note: control || (opened ? "theme opened; no chat" : "theme open miss"),
      control,
      shot: file,
    });
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

fs.writeFileSync(path.join(OUT, "06-editability-depth.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log(
  `PASS ${results.filter((r) => r.ok).length} FAIL ${results.filter((r) => !r.ok).length}`,
);
await browser.close();
