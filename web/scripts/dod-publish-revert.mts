/**
 * DoD §3.5 draft → publish → live → revert + republish.
 * WHO=mateo|alba
 */
import { chromium, type Page, type Locator } from "playwright";
import fs from "node:fs";
import path from "node:path";

const WHO = (process.env.WHO ?? "mateo") as "mateo" | "alba";
const BASE = "http://127.0.0.1:3001";

const CFG = {
  mateo: {
    profile: "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc",
    auth: "/home/ubuntu/.claude/design-diff/.auth-mateo-ferrer.json",
    out: "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/folio-mateo-dod",
    prefix: "05-dod5",
    // Prefer heading block (known editable); fallback services title
    pick: "heading" as const,
    liveBaselineRe: /MATEO FERRER|Mateo Ferrer|MODELO/i,
  },
  alba: {
    profile: "8a59afc1-6e2e-49cd-b78d-27f689cc80f5",
    auth: "/home/ubuntu/.claude/design-diff/.auth-alba-nail-artist.json",
    out: "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/alba-builder-pending",
    prefix: "11-dod5",
    pick: "heading" as const,
    liveBaselineRe: /Manos que|Alba|Ver servicios/i,
  },
}[WHO];

const LIVE = `${BASE}/template-preview/current?kind=live-site&talent=${CFG.profile}&locale=es`;
const TMP = `/tmp/dod5-${WHO}`;
fs.mkdirSync(CFG.out, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const log: Record<string, unknown> = { who: WHO, steps: [] as string[] };
function step(m: string) {
  (log.steps as string[]).push(m);
  console.log(`[${WHO}]`, m);
}

async function shot(page: Page, name: string) {
  const file = `${CFG.prefix}-${name}.png`;
  const tmp = path.join(TMP, file);
  await page.screenshot({ path: tmp, fullPage: false });
  try {
    if (fs.statSync(tmp).size < 1_500_000) fs.copyFileSync(tmp, path.join(CFG.out, file));
  } catch {
    /* ignore */
  }
  return path.join(CFG.out, file);
}

async function publishNow(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  const pub = page.locator("[data-publish-split] button").filter({ hasText: /^Publish$/i });
  await pub.first().click({ force: true });
  await page.waitForTimeout(1500);
  await shot(page, "publish-drawer");

  const nowBtn = page.getByRole("button", { name: /Publish now|Publicar ahora/i });
  if ((await nowBtn.count()) === 0) {
    return { ok: false, note: "no Publish now button" };
  }
  for (let i = 0; i < 20; i++) {
    if (!(await nowBtn.first().isDisabled())) break;
    await page.waitForTimeout(500);
  }
  if (await nowBtn.first().isDisabled()) {
    const reason = (await nowBtn.first().getAttribute("aria-label")) ?? "disabled";
    return { ok: false, note: `Publish now disabled: ${reason}` };
  }
  await nowBtn.first().click({ force: true });
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(400);
    if ((await page.getByText(/^Publishing/i).count()) === 0 && i > 3) break;
  }
  await page.waitForTimeout(1500);
  await shot(page, "after-publish");
  // Close drawer
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  return { ok: true, note: "Publish now clicked" };
}

async function selectHeadingField(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  const node = page.locator("[data-builder-node-kind='heading']").first();
  if (!(await node.count())) throw new Error("no heading node");
  await node.scrollIntoViewIfNeeded();
  await node.click({ force: true });
  await page.waitForTimeout(900);
  await page
    .getByRole("tab", { name: /^Content$|^Contenido$/i })
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(500);
  const dock = page.locator("[data-testid=inspector-dock]");
  if (!(await dock.isVisible().catch(() => false))) {
    await node.click({ force: true });
    await page.waitForTimeout(800);
  }
  // Heading Text is a contenteditable role=textbox (not a plain <input>)
  const box = dock.locator("[role='textbox'][contenteditable='true'], [contenteditable='true']").first();
  if (await box.count()) {
    const value = ((await box.textContent()) || "").trim();
    step(`heading contenteditable value="${value.slice(0, 40)}"`);
    return { kind: "heading-ce", field: box, value };
  }
  const candidates = dock.locator(
    "input:not([type='checkbox']):not([type='radio']):not([type='hidden']):not([type='file']):not([type='search']), textarea",
  );
  const n = await candidates.count();
  step(`heading dock inputs=${n}`);
  for (let i = 0; i < n; i++) {
    const c = candidates.nth(i);
    if (!(await c.isVisible().catch(() => false))) continue;
    const val = (await c.inputValue().catch(() => "")) || "";
    if (val.length >= 2) return { kind: `heading#${i}`, field: c, value: val };
  }
  throw new Error("heading selected but no text input");
}

async function setField(page: Page, field: Locator, value: string) {
  const tag = await field.evaluate((el) => ({
    tag: el.tagName.toLowerCase(),
    ce: el.getAttribute("contenteditable"),
    role: el.getAttribute("role"),
  }));
  if (tag.tag === "input" || tag.tag === "textarea") {
    await field.fill(value);
    return;
  }
  // contenteditable
  await field.click({ force: true });
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+a");
  await page.keyboard.type(value.slice(0, 100));
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: CFG.auth,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

try {
  await page.goto(`${BASE}/talent/page-builder`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(4500);
  if (/\/login/.test(page.url())) throw new Error(`auth ${page.url()}`);
  await shot(page, "builder-baseline");

  const live0 = await ctx.newPage();
  await live0.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await live0.waitForTimeout(2500);
  await shot(live0, "live-baseline");
  log.liveBaselineOk = (await live0.getByText(CFG.liveBaselineRe).count()) > 0;
  await live0.close();

  const editable = await selectHeadingField(page);
  const field = editable.field;
  // Strip any leftover marker, then add a fresh one for the publish proof
  const clean = editable.value.replace(/\s*·QA/g, "").trimEnd();
  const original = clean;
  const marker = " ·QA";
  const next = `${original}${marker}`.slice(0, 120);
  await setField(page, field, next);
  await page.waitForTimeout(2500);
  await shot(page, "draft-edit");
  step(`mutated ${editable.kind}: "${original.slice(0, 40)}" → "${next.slice(0, 40)}"`);
  log.draft = { kind: editable.kind, original: original.slice(0, 80), next: next.slice(0, 80) };

  const pub1 = await publishNow(page);
  step(`publish1 ${pub1.note}`);
  log.publish1 = pub1;
  if (!pub1.ok) {
    log.dod5 = { ok: false, note: pub1.note };
    fs.writeFileSync(path.join(CFG.out, `${CFG.prefix}.json`), JSON.stringify(log, null, 2));
    process.exit(3);
  }

  const live1 = await ctx.newPage();
  await live1.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await live1.waitForTimeout(2500);
  await live1.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await live1.waitForTimeout(2000);
  await shot(live1, "live-after-publish");
  const liveHasMarker = (await live1.getByText(/·QA/).count()) > 0;
  log.liveHasMarker = liveHasMarker;
  step(`liveHasMarker=${liveHasMarker}`);
  await live1.close();

  // Restore — reload builder so inspector is fresh, then clear marker
  await page.goto(`${BASE}/talent/page-builder`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(4500);
  const editable2 = await selectHeadingField(page);
  await setField(page, editable2.field, original);
  await page.waitForTimeout(2500);
  await shot(page, "draft-restored");
  step(`restored field ${editable2.kind} → "${original.slice(0, 40)}"`);
  const pub2 = await publishNow(page);
  step(`publish2 ${pub2.note}`);
  log.publish2 = pub2;

  const live2 = await ctx.newPage();
  await live2.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await live2.waitForTimeout(2500);
  await live2.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await live2.waitForTimeout(2000);
  await shot(live2, "live-restored");
  const markerGone = (await live2.getByText(/·QA/).count()) === 0;
  const baselineBack = (await live2.getByText(CFG.liveBaselineRe).count()) > 0;
  log.liveRestored = markerGone && baselineBack;
  step(`restored markerGone=${markerGone} baseline=${baselineBack}`);
  await live2.close();

  log.dod5 = {
    ok: pub1.ok && liveHasMarker && pub2.ok && markerGone,
    liveHasMarker,
    liveRestored: markerGone && baselineBack,
    note: `pub1=${pub1.ok} marker=${liveHasMarker} pub2=${pub2.ok} restored=${markerGone}`,
  };
  fs.writeFileSync(path.join(CFG.out, `${CFG.prefix}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
  if (!(log.dod5 as { ok: boolean }).ok) process.exit(4);
} finally {
  await browser.close();
}
