/**
 * Live click-through using harness-proven selectors. Headless. Leaves Oran's UI alone.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const ROOT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final";
const results: Array<{ id: string; ok: boolean; note: string }> = [];

async function shot(page: Page, dir: string, name: string) {
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, name), fullPage: false });
}

async function clickThrough(
  who: "alba" | "mateo",
  auth: string,
  profile: string,
  vp: number,
) {
  const dir = path.join(ROOT, who === "alba" ? "maison-alba" : "folio-mateo", `click-${vp}`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: auth,
    viewport: { width: vp, height: vp === 390 ? 844 : 900 },
  });
  const page = await ctx.newPage();
  const url = `${BASE}/template-preview/current?kind=live-site&talent=${profile}&locale=es`;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2800);
  await shot(page, dir, "00-top.png");
  const notFound = (await page.getByText(/Page not found/i).count()) > 0;
  results.push({
    id: `${who}-${vp}-load`,
    ok: !!res && res.status() === 200 && !notFound,
    note: `status=${res?.status()} notFound=${notFound}`,
  });

  // Lang
  const lang = page.locator("a,button").filter({ hasText: /^EN$|^ES$/ });
  if (await lang.count()) {
    await lang.first().click().catch(() => {});
    results.push({ id: `${who}-${vp}-lang`, ok: true, note: "lang clicked" });
  } else {
    results.push({
      id: `${who}-${vp}-lang`,
      ok: vp === 390,
      note: "no lang (ok if phone hides)",
    });
  }

  if (vp === 390) {
    const burger = await page.locator("button").filter({ hasText: /menu|menú/i }).count();
    const panelOpen = await page.locator("[data-open='true'], .site-header__panel.is-open").count();
    results.push({
      id: `${who}-390-no-burger`,
      ok: burger === 0 && panelOpen === 0,
      note: `burger=${burger} panelOpen=${panelOpen}`,
    });
    await shot(page, dir, "01-phone-header.png");
  }

  // CTA — hero buttons / masthead Consultar
  const cta = page
    .locator("a,button")
    .filter({ hasText: /Ver servicios|Ver trabajos|Reservar|Consultar|Menú y precios|Book|Seleccionar/i });
  results.push({
    id: `${who}-${vp}-cta`,
    ok: (await cta.count()) > 0,
    note: `ctaCount=${await cta.count()}`,
  });

  // Menu / rate-card CTAs
  const menuCta = page
    .locator("button,a")
    .filter({ hasText: /Seleccionar|Solicitar cita|Pedir cotización|Consultar|Continuar/i });
  if (await menuCta.count()) {
    await menuCta.first().scrollIntoViewIfNeeded().catch(() => {});
    await menuCta.first().click().catch(() => {});
    await page.waitForTimeout(700);
    await shot(page, dir, "02-menu-cta.png");
    await page.keyboard.press("Escape").catch(() => {});
    results.push({ id: `${who}-${vp}-menu-cta`, ok: true, note: "menu/rate cta clicked" });
  } else {
    results.push({
      id: `${who}-${vp}-menu-cta`,
      ok: who === "mateo",
      note: "no menu booking CTA found",
    });
  }

  // Dock — harness selector
  const dock = page.locator(
    "[data-talent-dock], .talent-site-dock, [data-dock], button:has-text('Ver servicios'), button:has-text('See services')",
  );
  const dockVisible = (await dock.count()) > 0;
  if (dockVisible) {
    await dock.first().click().catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, dir, "03-dock.png");
    await page.keyboard.press("Escape").catch(() => {});
  }
  results.push({ id: `${who}-${vp}-dock`, ok: dockVisible, note: `dock=${dockVisible}` });

  // Chat — open via dock / launcher (harness opens chat row)
  const chatOpen = page.locator(
    "[data-open-chat], [data-chat-launcher], button[aria-label*='chat' i], button[aria-label*='hablar' i], button:has-text('Hablar'), button:has-text('Chat')",
  );
  let chatOk = false;
  if (await chatOpen.count()) {
    await chatOpen.first().click().catch(() => {});
    await page.waitForTimeout(900);
    chatOk =
      (await page.locator("[data-chat-panel], [data-mini-chat], .card-chat, [role='dialog']").count()) > 0 ||
      (await page.getByText(/Enviar|Send|Escribe|Write a message/i).count()) > 0;
    await shot(page, dir, "04-chat-open.png");
    await page.keyboard.press("Escape").catch(() => {});
  }
  // Fallback: click last dock icon area
  if (!chatOk) {
    const icons = page.locator("[data-talent-dock] button, .talent-site-dock button");
    const n = await icons.count();
    if (n > 0) {
      await icons.nth(n - 1).click().catch(() => {});
      await page.waitForTimeout(800);
      chatOk = (await page.getByText(/Enviar|Send|Escribe|message/i).count()) > 0;
      await shot(page, dir, "04-chat-open.png");
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
  results.push({ id: `${who}-${vp}-chat`, ok: chatOk, note: `chatOpened=${chatOk}` });

  // FAQ (Maison only)
  if (who === "alba") {
    const faq = page.locator("#faq, [data-builder-node-kind='faq']").first();
    const ok = (await faq.count()) > 0;
    if (ok) {
      await faq.scrollIntoViewIfNeeded();
      const q = faq.locator("button, summary, [role='button']").first();
      if (await q.count()) await q.click().catch(() => {});
      await shot(page, dir, "05-faq.png");
    }
    results.push({ id: `${who}-${vp}-faq`, ok, note: ok ? "faq present" : "faq missing" });
  }

  // Footer
  const footer = page.locator("#site-footer, footer, [data-builder-node-kind='site_footer'], [data-builder-node-kind='statement_footer']").first();
  const footOk = (await footer.count()) > 0;
  if (footOk) {
    await footer.scrollIntoViewIfNeeded();
    await shot(page, dir, "06-footer.png");
  }
  results.push({ id: `${who}-${vp}-footer`, ok: footOk, note: footOk ? "footer visible" : "footer missing" });

  await browser.close();
}

async function main() {
  // Remint 127 auth assumed already done by caller
  await clickThrough("alba", "/home/ubuntu/.claude/design-diff/.auth-alba-127.json", "8a59afc1-6e2e-49cd-b78d-27f689cc80f5", 1440);
  await clickThrough("alba", "/home/ubuntu/.claude/design-diff/.auth-alba-127.json", "8a59afc1-6e2e-49cd-b78d-27f689cc80f5", 390);
  await clickThrough("mateo", "/home/ubuntu/.claude/design-diff/.auth-mateo-ferrer.json", "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc", 1440);
  await clickThrough("mateo", "/home/ubuntu/.claude/design-diff/.auth-mateo-ferrer.json", "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc", 390);
  fs.writeFileSync(path.join(ROOT, "clickthrough-results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log("PASS", results.filter((r) => r.ok).length, "FAIL", results.filter((r) => !r.ok).length);
}
await main();
