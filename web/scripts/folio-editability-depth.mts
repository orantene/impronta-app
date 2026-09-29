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

/** Open the right inspector Content panel for the current selection. */
async function openContentInspector(page: Page) {
  // If Content is already the active rail tab, a no-op click leaves the dock
  // closed — bounce Style → Content to force remount.
  await page
    .getByRole("tab", { name: /^Style$|^Estilo$/i })
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(250);
  await page
    .getByRole("tab", { name: /^Content$|^Contenido$/i })
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(500);
  // Floating selection bar — force click even when Playwright reports hidden
  const edit = page.locator("button").filter({ hasText: /^Edit Content$|^Editar contenido$/i });
  if (await edit.count()) {
    await edit.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
  return (
    (await page.locator("[data-builder-node-content-panel]").count()) > 0 ||
    (await page.locator("[data-testid=inspector-dock]").count()) > 0
  );
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
      await page.waitForTimeout(600);
      const opened = await openContentInspector(page);
      const panel = page.locator(`[data-builder-node-content-panel="${kind}"]`);
      if ((await panel.count()) || opened) return true;
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
  // Prefer text filter — getByRole name matching is flaky on Segmented chips
  const scopes = [
    page.locator("[data-builder-node-content-panel]"),
    page.locator("[data-testid=inspector-dock]"),
    page.locator("[data-edit-drawer=dock]"),
    page.locator("body"),
  ];
  for (const scope of scopes) {
    if (!(await scope.count())) continue;
    const alt = scope.locator("button").filter({ hasText: name });
    const n = await alt.count();
    for (let i = 0; i < n; i++) {
      const btn = alt.nth(i);
      if (!(await btn.isVisible().catch(() => false)) && i < n - 1) continue;
      await btn.click({ force: true });
      const t = ((await btn.textContent()) || "").trim();
      await page.waitForTimeout(400);
      if (t) return t;
    }
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
    await ensureDock(page);
    await page.locator('[data-builder-node-kind="masthead"]').first().scrollIntoViewIfNeeded();
    await page.locator('[data-builder-node-kind="masthead"]').first().click({ force: true });
    await page.waitForTimeout(600);
    await openContentInspector(page);
    let control = "";
    const full = await clickChip(page, /Full color/i);
    if (full) control = `coverFilter → none (${full})`;
    if (!control) {
      const bw = await clickChip(page, /Black and white|B\s*&\s*W/i);
      if (bw) control = `coverFilter → bw (${bw})`;
    }
    if (!control) {
      const split = await clickChip(page, /Split|Divid/i);
      if (split) control = `splitWords (${split})`;
    }
    if (!control) control = await patchFirstText(page);
    const file = await shot(page, "cover");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || "masthead miss",
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
    await ensureDock(page);
    await page.locator('[data-builder-node-kind="contents"]').first().scrollIntoViewIfNeeded();
    await page.locator('[data-builder-node-kind="contents"]').first().click({ force: true });
    await page.waitForTimeout(600);
    await openContentInspector(page);
    let control = "";
    const dock = page.locator("[data-testid=inspector-dock]");
    if (await dock.count()) {
      await dock.evaluate((el) => {
        el.scrollTop = 240;
      }).catch(() => {});
    }
    const dec = await clickChip(page, /Decimal \(01|Decimal/i);
    if (dec) control = `numberStyle → decimal (${dec})`;
    if (!control) {
      const rom = await clickChip(page, /Roman \(I|Roman/i);
      if (rom) control = `numberStyle → roman (${rom})`;
    }
    if (!control) {
      const show = page.locator("label").filter({ hasText: /Show chapter numbers|Mostrar números/i });
      if (await show.count()) {
        await show.locator("input").first().click({ force: true }).catch(async () => {
          await show.click({ force: true });
        });
        control = "showNumbers toggled";
      }
    }
    if (!control) {
      const heading = page
        .locator("[data-builder-node-content-panel=contents] label")
        .filter({ hasText: /^Heading$|^Título$/i });
      if (await heading.count()) {
        const inp = heading.locator("xpath=following::input[1]");
        if (await inp.count()) {
          const v = await inp.inputValue();
          await inp.fill(`${v} ·E`.slice(0, 40));
          control = "contents heading patched";
        }
      }
    }
    if (!control) control = await patchFirstText(page);
    const file = await shot(page, "contents");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || "contents miss",
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
    await ensureDock(page);
    await page.locator('[data-builder-node-kind="portfolio"]').first().scrollIntoViewIfNeeded();
    await page.locator('[data-builder-node-kind="portfolio"]').first().click({ force: true });
    await page.waitForTimeout(600);
    await openContentInspector(page);
    let control = "";
    const layoutSel = page
      .locator("[data-testid=inspector-dock] select, [data-builder-node-content-panel=portfolio] select")
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
        .locator("[data-testid=inspector-dock] label, [data-builder-node-content-panel] label")
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
      note: control || "portfolio miss",
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
    await ensureDock(page);
    await page.locator('[data-builder-node-kind="comp_card"]').first().scrollIntoViewIfNeeded();
    await page.locator('[data-builder-node-kind="comp_card"]').first().click({ force: true });
    await page.waitForTimeout(600);
    await openContentInspector(page);
    let control = "";
    const panel = page.locator("[data-builder-node-content-panel=comp_card]");
    if (await panel.count()) {
      await panel
        .evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        })
        .catch(() => {});
    }
    const layout = page
      .locator(
        "[data-testid=inspector-dock] select, [data-builder-node-content-panel=comp_card] select",
      )
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
        .locator(
          "[data-testid=inspector-dock] label, [data-builder-node-content-panel=comp_card] label",
        )
        .filter({ hasText: /Show full comp|full details|detalles|Show details/i });
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
    if (!control) {
      const title = page
        .locator("[data-builder-node-content-panel=comp_card] label")
        .filter({ hasText: /^Title$|^Título$/i });
      if (await title.count()) {
        const inp = title.locator("xpath=following::input[1]");
        if (await inp.count()) {
          const v = await inp.inputValue();
          await inp.fill(`${v} ·E`.slice(0, 40));
          control = "comp title patched";
        }
      }
    }
    if (!control) control = await patchFirstText(page);
    const file = await shot(page, "comp-card");
    await undo(page);
    results.push({
      id,
      ok: Boolean(control),
      note: control || "comp miss",
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
    await page.waitForTimeout(700);
    // Design panel uses Segmented Brand|Theme (buttons), not role=tab
    const designPanel = page.locator("[data-testid=design-panel]");
    let opened = false;
    if (await designPanel.isVisible().catch(() => false)) {
      // Segmented Brand|Theme — not always exposed as named role=button
      const themeSeg = designPanel.locator("button").filter({ hasText: /^Theme$|^Tema$/i });
      if (await themeSeg.count()) {
        await themeSeg.first().click({ force: true });
        await page.waitForTimeout(500);
      }
      const openTheme = designPanel.locator("[data-design-open-theme]");
      if (await openTheme.count()) {
        await openTheme.first().click({ force: true });
        opened = true;
        await page.waitForTimeout(1200);
      }
    }
    if (!opened) {
      for (const re of [/Open theme editor/i, /Abrir editor de tema/i]) {
        const b = page.getByRole("button", { name: re });
        if (await b.count()) {
          await b.first().click({ force: true }).catch(() => {});
          opened = true;
          await page.waitForTimeout(1200);
          break;
        }
      }
    }
    await page.waitForTimeout(1500);
    const drawer = page.locator("[data-edit-drawer=theme]");
    let control = "";
    if (await drawer.isVisible().catch(() => false)) {
      await drawer.getByRole("tab", { name: /^Layout$/i }).click({ force: true });
      await page.waitForTimeout(500);
      const std = drawer.locator("button").filter({ hasText: /^Standard$/i });
      if (await std.count()) {
        await std.first().click({ force: true });
        control = "chat.variant → Standard";
        await page.waitForTimeout(300);
        const card = drawer.locator("button").filter({ hasText: /^Card$/i });
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
