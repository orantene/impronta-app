/**
 * Phase D QA — resilient: each step try/catch, never abort the suite.
 * Headless only. Does not touch Oran's headed Chrome windows.
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const ROOT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final";
const results: Array<{ id: string; ok: boolean; note: string; shot?: string }> = [];

function ensure(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function shot(page: Page, dir: string, name: string) {
  ensure(dir);
  const file = path.join(dir, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function withAuth(
  auth: string,
  fn: (page: Page, ctx: BrowserContext) => Promise<void>,
) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: auth,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  try {
    await fn(page, ctx);
  } finally {
    await browser.close();
  }
}

async function step(id: string, fn: () => Promise<{ ok: boolean; note: string; shot?: string }>) {
  try {
    const r = await fn();
    results.push({ id, ...r });
    console.log(r.ok ? "✓" : "✗", id, r.note.slice(0, 120));
  } catch (e) {
    results.push({ id, ok: false, note: String(e).slice(0, 300) });
    console.log("✗", id, String(e).slice(0, 120));
  }
}

async function openThemeEditor(page: Page) {
  await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click({ timeout: 15000 });
  await page.waitForTimeout(600);
  const themeSeg = page.getByText(/^Theme$|^Tema$/i).first();
  if (await themeSeg.count()) await themeSeg.click().catch(() => {});
  await page.waitForTimeout(400);
  const openBtn = page.locator("[data-design-open-theme]").first();
  if (await openBtn.count()) {
    await openBtn.click();
  } else {
    await page.getByRole("button", { name: /Open theme editor|Abrir editor/i }).first().click({ timeout: 8000 });
  }
  await page.waitForTimeout(1500);
  const drawer = page.locator('[data-edit-drawer="theme"]');
  return (await drawer.count()) > 0 || (await page.getByRole("tab", { name: /Colors|Colores/i }).count()) > 0;
}

/** Theme-drawer tabs only — never the inspector rail Layout tab. */
function themeDrawer(page: Page) {
  return page.locator('[data-edit-drawer="theme"]');
}

async function clickThemeTab(page: Page, re: RegExp) {
  const drawer = themeDrawer(page);
  const inDrawer = drawer.getByRole("tab", { name: re });
  if (await inDrawer.count()) {
    await inDrawer.first().click({ timeout: 8000 });
    return true;
  }
  // Fallback: any tab that is NOT the inspector rail.
  const tabs = page.getByRole("tab", { name: re });
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    const t = tabs.nth(i);
    const rail = await t.getAttribute("data-inspector-rail-tab");
    if (rail) continue;
    await t.click({ timeout: 8000 });
    return true;
  }
  return false;
}

async function main() {
  ensure(path.join(ROOT, "settings"));
  ensure(path.join(ROOT, "jor-gallery"));
  ensure(path.join(ROOT, "dashboard"));
  ensure(path.join(ROOT, "maison-alba"));

  const alba = "/home/ubuntu/.claude/design-diff/.auth-alba-127.json";
  const mateo = "/home/ubuntu/.claude/design-diff/.auth-mateo-ferrer.json";
  const jor = "/home/ubuntu/.claude/design-diff/.auth-jor.json";

  // --- Alba chat.variant ---
  await step("alba-chat-variant", async () => {
    let note = "";
    let shotPath = "";
    await withAuth(alba, async (page) => {
      await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(4500);
      const opened = await openThemeEditor(page);
      if (!opened) {
        note = "theme editor did not open";
        shotPath = await shot(page, path.join(ROOT, "maison-alba"), "09-edit-chat-reprove.png");
        return;
      }
      const laid = await clickThemeTab(page, /Layout|Disposición/i);
      if (!laid) {
        note = "theme Layout tab miss";
        shotPath = await shot(page, path.join(ROOT, "maison-alba"), "09-edit-chat-reprove.png");
        return;
      }
      await page.waitForTimeout(500);
      const drawer = themeDrawer(page);
      const body = drawer.locator("[data-edit-drawer-body]").first();
      const scrollTarget = (await body.count()) ? body : drawer;
      for (let i = 0; i < 14; i++) {
        await scrollTarget.evaluate((el) => {
          el.scrollTop += 420;
        }).catch(() => {});
        await page.waitForTimeout(120);
        if ((await drawer.getByText(/Chat style|Estilo de chat/i).count()) > 0) break;
      }
      const has = (await drawer.getByText(/Chat style|Estilo de chat/i).count()) > 0;
      if (has) {
        await drawer.getByText(/Chat style|Estilo de chat/i).first().scrollIntoViewIfNeeded();
        await drawer.getByRole("button", { name: /^Standard$|^Estándar$/i }).first().click().catch(() => {});
        await page.waitForTimeout(300);
        await drawer.getByRole("button", { name: /^Card$|^Tarjeta$/i }).first().click().catch(() => {});
      }
      shotPath = await shot(page, path.join(ROOT, "maison-alba"), "09-edit-chat-reprove.png");
      note = has ? "chat.variant found+toggled" : "chat.variant missing after scroll";
    });
    return { ok: /found/.test(note), note, shot: shotPath };
  });

  // --- Site cards ---
  for (const [who, auth, re] of [
    ["alba", alba, /Maison v2|Ros[eé]|Maison/i],
    ["mateo", mateo, /Folio|Stone|Piedra/i],
  ] as const) {
    await step(`${who}-site-card`, async () => {
      let body = "";
      let shotPath = "";
      await withAuth(auth, async (page) => {
        await page.goto(`${BASE}/talent/site`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(2500);
        body = await page.locator("body").innerText();
        shotPath = await shot(page, path.join(ROOT, "settings"), `01-${who}-site-card.png`);
      });
      const hasMyColors = /My colors|Mis colores/i.test(body);
      const hasDesign = re.test(body);
      return {
        ok: hasDesign && !hasMyColors,
        note: `designMatch=${hasDesign} myColors=${hasMyColors} snippet=${body.replace(/\s+/g, " ").slice(0, 220)}`,
        shot: shotPath,
      };
    });
  }

  // --- Theme drawer tabs ---
  for (const [who, auth] of [
    ["alba", alba],
    ["mateo", mateo],
  ] as const) {
    await step(`${who}-theme-tabs`, async () => {
        const found: string[] = [];
        let hasChat = false;
      let shotPath = "";
      await withAuth(auth, async (page) => {
        await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(4500);
        await shot(page, path.join(ROOT, "settings"), `02-${who}-brand.png`);
        const opened = await openThemeEditor(page);
        if (!opened) {
          shotPath = await shot(page, path.join(ROOT, "settings"), `03-${who}-theme-fail.png`);
          return;
        }
        const tabs = [
          ["Colors", /Colors|Colores/i],
          ["Typography", /Typography|Tipografía/i],
          ["Layout", /Layout|Disposición/i],
          ["Effects", /Effects|Efectos/i],
          ["Components", /Components|Componentes/i],
          ["Style", /Style|Estilo/i],
          ["Code", /Code|Código/i],
        ] as const;
        for (const [name, re] of tabs) {
          const clicked = await clickThemeTab(page, re);
          if (clicked) {
            found.push(name);
            await page.waitForTimeout(350);
            await shot(page, path.join(ROOT, "settings"), `03-${who}-theme-${name.toLowerCase()}.png`);
          }
        }
        await clickThemeTab(page, /Layout|Disposición/i);
        await page.waitForTimeout(400);
        const drawer = themeDrawer(page);
        const body = drawer.locator("[data-edit-drawer-body]").first();
        const scrollTarget = (await body.count()) ? body : drawer;
        for (let i = 0; i < 14; i++) {
          await scrollTarget.evaluate((el) => {
            el.scrollTop += 400;
          }).catch(() => {});
          await page.waitForTimeout(100);
          if ((await drawer.getByText(/Chat style|Estilo de chat/i).count()) > 0) break;
        }
        hasChat = (await drawer.getByText(/Chat style|Estilo de chat/i).count()) > 0;
        shotPath = await shot(page, path.join(ROOT, "settings"), `03-${who}-theme-chat.png`);
        await page.keyboard.press("Escape").catch(() => {});
      });
      return {
        ok: found.length >= 4 && hasChat,
        note: `tabs=${found.join(",")} chat=${hasChat}`,
        shot: shotPath,
      };
    });

    await step(`${who}-brand`, async () => {
      let ok = false;
      let shotPath = "";
      await withAuth(auth, async (page) => {
        await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(4000);
        await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click({ timeout: 15000 });
        await page.waitForTimeout(600);
        ok = (await page.getByText(/Brand|Marca|Accent|Acento|Colors|Colores/i).count()) > 0;
        shotPath = await shot(page, path.join(ROOT, "settings"), `02-${who}-brand-panel.png`);
      });
      return { ok, note: ok ? "Brand panel visible" : "Brand miss", shot: shotPath };
    });

    await step(`${who}-website-settings`, async () => {
      let okRoute = "";
      let shotPath = "";
      let blankHeavy = false;
      await withAuth(auth, async (page) => {
        for (const r of ["/talent/settings", "/talent/site", "/talent/settings/website"]) {
          const res = await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
          await page.waitForTimeout(1200);
          if (res && res.status() < 400 && !/\/login/.test(page.url())) {
            okRoute = r;
            break;
          }
        }
        blankHeavy = (await page.locator("button:empty").count()) > 8;
        shotPath = await shot(page, path.join(ROOT, "settings"), `04-${who}-website-settings.png`);
      });
      return {
        ok: !!okRoute && !blankHeavy,
        note: `route=${okRoute || "none"} blankEmptyButtons=${blankHeavy}`,
        shot: shotPath,
      };
    });
  }

  // --- Jor gallery stop at Publish ---
  await step("jor-gallery-stop-publish", async () => {
    let dialogVisible = false;
    let shotPath = "";
    let url = "";
    let noteExtra = "";
    await withAuth(jor, async (page) => {
      await page.goto(`${BASE}/talent/site`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
      await shot(page, path.join(ROOT, "jor-gallery"), "01-site-card.png");
      const change = page.getByTestId("maison-change-design").or(
        page.getByRole("button", { name: /Change design|Cambiar diseño|Designs|Diseños/i }),
      );
      if (await change.count()) await change.first().click();
      else await page.getByText(/Change design|Cambiar diseño|Designs/i).first().click({ timeout: 10000 });
      await page.waitForTimeout(2500);
      await shot(page, path.join(ROOT, "jor-gallery"), "02-gallery.png");

      // Open Folio detail via Explore theme (gallery cards are not the detail screen).
      const folioCard = page.getByTestId("design-card-folio").first();
      if (await folioCard.count()) {
        const exploreBtn = folioCard.getByRole("button", { name: /Explore|Explorar/i }).first();
        if (await exploreBtn.count()) await exploreBtn.click();
        else await folioCard.locator("button").first().click();
      } else {
        const explore = page.getByRole("button", { name: /Explore Folio|Explorar Folio/i }).first();
        if (await explore.count()) await explore.click();
        else {
          await page.getByText(/^Folio$/i).first().click().catch(() => {});
          await page.waitForTimeout(400);
          await page.getByRole("button", { name: /Explore theme|Explorar tema/i }).last().click().catch(() => {});
        }
      }
      await page.waitForTimeout(2000);
      await shot(page, path.join(ROOT, "jor-gallery"), "03-folio-detail.png");

      await page.getByRole("button", { name: /^Demo$/i }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      await shot(page, path.join(ROOT, "jor-gallery"), "03-folio-demo.png");
      await page.getByRole("button", { name: /My content|Mi contenido/i }).first().click().catch(() => {});
      await page.waitForTimeout(700);
      await shot(page, path.join(ROOT, "jor-gallery"), "03-folio-my.png");

      const use = page
        .getByTestId("maison-use-design")
        .or(page.getByTestId("maison-use-design-phone"))
        .or(page.getByRole("button", { name: /Use this design|Usar este diseño/i }))
        .first();
      noteExtra = `useCount=${await use.count()}`;
      if (await use.count()) {
        await use.click();
        await page.waitForTimeout(2500);
      }
      dialogVisible =
        (await page.locator("[data-testid='maison-publish-design-dialog']").count()) > 0 ||
        (await page.getByText(/Publish Folio\?|¿Publicar Folio\?/i).count()) > 0 ||
        (await page.getByRole("dialog").filter({ hasText: /Publish|Publicar/i }).count()) > 0;
      shotPath = await shot(page, path.join(ROOT, "jor-gallery"), "04-publish-dialog-stop.png");
      const cancel = page
        .getByTestId("maison-publish-design-close")
        .or(
          page.getByRole("button", {
            name: /Keep editing|Seguir editando|Cancel|Cancelar|Not now|No publicar|Close|Cerrar/i,
          }),
        )
        .first();
      if (await cancel.count()) await cancel.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
      await shot(page, path.join(ROOT, "jor-gallery"), "05-after-cancel.png");
      url = page.url();
    });
    return {
      ok: dialogVisible,
      note: `dialogVisible=${dialogVisible} ${noteExtra} url=${url}`,
      shot: shotPath,
    };
  });

  // --- Jor dashboard ---
  const routes: Array<[string, string, RegExp]> = [
    ["today", "/talent/today", /Today|Hoy|Agenda/i],
    ["calendar", "/talent/calendar", /Calendar|Calendario/i],
    ["messages", "/talent/messages", /Messages|Mensajes|Inbox|Hablar|conversation|Pick a conversation|0 conversations/i],
    ["money", "/talent/money", /Money|Dinero|Request payment|Pedir pago|Payments|Cobrar/i],
    ["services", "/talent/services", /Services|Servicios/i],
    ["profile", "/talent/profile", /Profile|Perfil/i],
    ["settings", "/talent/settings", /Settings|Ajustes|Config/i],
    ["site", "/talent/site", /Site|Sitio|Website|My website|Diseño|My presence|Mi presencia/i],
  ];
  await withAuth(jor, async (page) => {
    for (const [id, route, re] of routes) {
      await step(`jor-dash-${id}`, async () => {
        const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
        await page.waitForTimeout(2800);
        const body = await page.locator("body").innerText();
        const shotPath = await shot(page, path.join(ROOT, "dashboard"), `01-${id}.png`);
        const statusOk = !!res && res.status() < 400 && !/\/login/.test(page.url());
        const contentOk = re.test(body);
        const blankBtns = await page.locator("button:empty").count();
        if (id === "money") {
          const pay = (await page.getByText(/Request payment|Pedir pago|Cobrar/i).count()) > 0;
          results.push({ id: "jor-dash-money-request-payment", ok: pay, note: `requestPaymentVisible=${pay}` });
          console.log(pay ? "✓" : "✗", "jor-dash-money-request-payment");
        }
        return {
          ok: statusOk && contentOk && blankBtns < 10,
          note: `status=${res?.status()} content=${contentOk} blankBtns=${blankBtns}`,
          shot: shotPath,
        };
      });
    }
  });

  const out = path.join(ROOT, "phase-d-results.json");
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log("PASS", results.filter((r) => r.ok).length, "FAIL", results.filter((r) => !r.ok).length);
  console.log("wrote", out);
}

await main();
