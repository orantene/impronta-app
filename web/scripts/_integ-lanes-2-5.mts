/**
 * Lanes 2–5 audit: settings bridge, Maison/Folio click + builder|live pairs,
 * cross-wire. Jor never Publish. Writes media under integ-designs-final/.
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const ROOT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final";
const RESULTS = path.join(ROOT, "lanes-2-5-results.json");

type Row = { id: string; ok: boolean; note: string; shot?: string; severity?: string };
const results: Row[] = [];

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
  vp = { width: 1440, height: 900 },
) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: auth, viewport: vp });
  const page = await ctx.newPage();
  try {
    await fn(page, ctx);
  } finally {
    await browser.close();
  }
}

async function step(id: string, fn: () => Promise<Omit<Row, "id">>) {
  try {
    const r = await fn();
    results.push({ id, ...r });
    console.log(r.ok ? "✓" : "✗", id, r.note.slice(0, 160));
  } catch (e) {
    results.push({ id, ok: false, note: String(e).slice(0, 400), severity: "P1" });
    console.log("✗", id, String(e).slice(0, 160));
  }
}

const ALBA = "/home/ubuntu/.claude/design-diff/.auth-alba-nail-artist.json";
const MATEO = "/home/ubuntu/.claude/design-diff/.auth-mateo-ferrer.json";
const JOR = "/home/ubuntu/.claude/design-diff/.auth-jor.json";
const ALBA_ID = "8a59afc1-6e2e-49cd-b78d-27f689cc80f5";
const MATEO_ID = "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc";

async function lane2SiteCard(who: "alba" | "mateo", auth: string, designRe: RegExp) {
  const dir = path.join(ROOT, "settings");
  await withAuth(auth, async (page) => {
    await step(`${who}-S1-site-card`, async () => {
      await page.goto(`${BASE}/talent/site`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page
        .waitForFunction(
          () => /Design:\s*/i.test(document.body?.innerText || ""),
          { timeout: 20000 },
        )
        .catch(() => {});
      await page.getByRole("button", { name: /^My website$|^Mi sitio$/i }).first().click().catch(() => {});
      await page.waitForTimeout(800);
      const body = await page.locator("body").innerText();
      const sp = await shot(page, dir, `lane2-${who}-site-card.png`);
      const design = designRe.test(body);
      const myColors = /My colors|Mis colores/i.test(body);
      const view = /View website|Ver sitio|View site/i.test(body);
      const edit = /Edit site|Editar sitio|Editar/i.test(body);
      const ok = design && !myColors && (view || edit);
      return {
        ok,
        note: `design=${design} myColors=${myColors} view=${view} edit=${edit}`,
        shot: sp,
        severity: ok ? undefined : "P0",
      };
    });
  });
}

async function lane2Gallery(who: "alba" | "mateo", auth: string) {
  const dir = path.join(ROOT, "settings");
  await withAuth(auth, async (page) => {
    await step(`${who}-S2-gallery`, async () => {
      await page.goto(`${BASE}/talent/site`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      // My website card → Change design → All (cross-profession designs)
      await page.getByRole("button", { name: /Change design|Cambiar diseño/i }).first().click({ timeout: 10000 });
      await page.waitForTimeout(2000);
      await page.getByRole("button", { name: /^All$|^Todos$/i }).first().click().catch(() => {});
      await page.waitForTimeout(2000);
      const body = await page.locator("body").innerText();
      const sp = await shot(page, dir, `lane2-${who}-gallery.png`);
      const hasMaison = /Maison/i.test(body);
      const hasFolio = /Folio/i.test(body);
      const demoMy = /Demo|My content|Your content|Mi contenido|Tu contenido/i.test(body);
      const ok = hasMaison && hasFolio;
      return {
        ok,
        note: `maison=${hasMaison} folio=${hasFolio} demoMy=${demoMy}`,
        shot: sp,
        severity: ok ? undefined : "P1",
      };
    });
  });
}

async function openThemeEditor(page: Page): Promise<boolean> {
  await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click({ timeout: 15000 });
  await page.waitForTimeout(600);
  const themeSeg = page.getByText(/^Theme$|^Tema$/i).first();
  if (await themeSeg.count()) await themeSeg.click().catch(() => {});
  await page.waitForTimeout(500);
  const openBtn = page.locator("[data-design-open-theme]").first();
  await openBtn.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click({ timeout: 8000 });
  } else {
    await page.getByText(/Open theme editor|Abrir editor de tema/i).first().click({ timeout: 8000 });
  }
  await page.waitForTimeout(1500);
  const drawer = page.locator('[data-edit-drawer="theme"]');
  return (await drawer.count()) > 0;
}

async function lane2Theme(who: "alba" | "mateo", auth: string) {
  const dir = path.join(ROOT, "settings");
  await withAuth(auth, async (page) => {
    await step(`${who}-S4-theme-tabs`, async () => {
      await page.goto(`${BASE}/talent/page-builder`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(4500);
      const brandShot = await shot(page, dir, `lane2-${who}-brand.png`);
      // Brand is under Design rail before theme opens
      await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      const hasBrand = (await page.getByText(/Brand|Marca|Accent|Acento/i).count()) > 0;
      results.push({
        id: `${who}-S3-brand`,
        ok: hasBrand,
        note: hasBrand ? "Brand panel visible" : "Brand miss",
        shot: brandShot,
        severity: hasBrand ? undefined : "P1",
      });
      console.log(hasBrand ? "✓" : "✗", `${who}-S3-brand`);

      const opened = await openThemeEditor(page);
      const drawer = page.locator('[data-edit-drawer="theme"]');
      const tabs = ["Colors", "Typography", "Layout", "Effects", "Components", "Style", "Code"];
      const found: string[] = [];
      for (const t of tabs) {
        const loc = drawer.getByRole("tab", { name: new RegExp(`^${t}$`, "i") });
        if (await loc.count()) {
          found.push(t);
          await loc.first().click().catch(() => {});
          await page.waitForTimeout(250);
        }
      }
      await drawer.getByRole("tab", { name: /Layout/i }).first().click().catch(() => {});
      await page.waitForTimeout(400);
      const body = drawer.locator("[data-edit-drawer-body]").first();
      const scrollTarget = (await body.count()) ? body : drawer;
      let hasChat = false;
      for (let i = 0; i < 14; i++) {
        await scrollTarget
          .evaluate((el) => {
            el.scrollTop += 420;
          })
          .catch(() => {});
        await page.waitForTimeout(100);
        if ((await drawer.getByText(/Chat style|Estilo de chat/i).count()) > 0) {
          hasChat = true;
          break;
        }
      }
      const sp = await shot(page, dir, `lane2-${who}-theme.png`);
      const ok = opened && found.length >= 5 && hasChat;
      return {
        ok,
        note: `opened=${opened} tabs=${found.join(",")} chat=${hasChat}`,
        shot: sp,
        severity: ok ? undefined : "P1",
      };
    });

    await step(`${who}-S7-website-settings`, async () => {
      const routes = ["/talent/settings", "/talent/settings/website", "/talent/site/settings"];
      let okRoute = "";
      for (const r of routes) {
        const res = await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
        await page.waitForTimeout(1200);
        if (res && res.status() < 400 && !/not found|404/i.test(await page.title())) {
          okRoute = r;
          break;
        }
      }
      const body = await page.locator("body").innerText();
      const sp = await shot(page, dir, `lane2-${who}-website-settings.png`);
      const content = /Settings|Ajustes|Website|Sitio|Language|Idioma/i.test(body);
      const blank = await page.locator("button:empty").count();
      const ok = !!okRoute && content && blank < 12;
      return {
        ok,
        note: `route=${okRoute || "none"} content=${content} blank=${blank}`,
        shot: sp,
        severity: ok ? undefined : "P1",
      };
    });
  });
}

async function builderLivePair(
  who: "alba" | "mateo",
  auth: string,
  talentId: string,
  dirName: string,
) {
  const dir = path.join(ROOT, dirName, "builder-live");
  ensure(dir);
  await withAuth(auth, async (page) => {
    await step(`${who}-M3-builder-live`, async () => {
      await page.goto(`${BASE}/talent/page-builder`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(5000);
      const builderMetrics = await page.evaluate(() => {
        const body = (document.body?.innerText || "").replace(/\s+/g, " ");
        const styles = Array.from(document.querySelectorAll("style"));
        const split = document.querySelector(".site-builder-node--split");
        const header = document.querySelector(
          "[data-talent-max-site-header], [data-talent-builder-shell='header']",
        );
        return {
          hasSplitCss: styles.some((s) => (s.textContent || "").includes("site-builder-node--split")),
          splitDisplay: split ? getComputedStyle(split as HTMLElement).display : null,
          header: !!header,
          headerText: header ? ((header as HTMLElement).innerText || "").replace(/\s+/g, " ").slice(0, 120) : "",
          hoy: /Hoy a las|Próximo horario/i.test(body),
          otono: /OTOÑO|Otoño/i.test(body),
          dock: /Ver servicios|See services|CONSULTAR/i.test(body),
          es: /\bES\b/.test(body),
        };
      });
      await shot(page, dir, `01-builder.png`);

      await page.goto(
        `${BASE}/template-preview/current?kind=live-site&talent=${talentId}&locale=es`,
        { waitUntil: "domcontentloaded", timeout: 90000 },
      );
      await page.waitForTimeout(4000);
      const liveMetrics = await page.evaluate(() => {
        const body = (document.body?.innerText || "").replace(/\s+/g, " ");
        const styles = Array.from(document.querySelectorAll("style"));
        const split = document.querySelector(".site-builder-node--split");
        const header = document.querySelector(
          "[data-talent-max-site-header], [data-talent-builder-shell='header'], header",
        );
        return {
          hasSplitCss: styles.some((s) => (s.textContent || "").includes("site-builder-node--split")),
          splitDisplay: split ? getComputedStyle(split as HTMLElement).display : null,
          header: !!header,
          headerText: header ? ((header as HTMLElement).innerText || "").replace(/\s+/g, " ").slice(0, 120) : "",
          hoy: /Hoy a las|Próximo horario/i.test(body),
          otono: /OTOÑO|Otoño/i.test(body),
          dock: /Ver servicios|See services|CONSULTAR/i.test(body),
          es: /\bES\b/.test(body),
        };
      });
      await shot(page, dir, `02-live.png`);

      let ok = builderMetrics.header && liveMetrics.header && builderMetrics.dock && liveMetrics.dock;
      if (who === "alba") {
        ok =
          ok &&
          builderMetrics.splitDisplay === "grid" &&
          liveMetrics.splitDisplay === "grid" &&
          builderMetrics.hoy &&
          liveMetrics.hoy;
      }
      if (who === "mateo") {
        ok = ok && builderMetrics.otono && liveMetrics.otono;
      }
      return {
        ok: !!ok,
        note: `builder=${JSON.stringify(builderMetrics)} live=${JSON.stringify(liveMetrics)}`,
        shot: path.join(dir, "01-builder.png"),
        severity: ok ? undefined : "P0",
      };
    });
  });
}

async function liveClick(
  who: "alba" | "mateo",
  auth: string,
  talentId: string,
  dirName: string,
  vp: number,
) {
  const dir = path.join(ROOT, dirName, `click-${vp}`);
  ensure(dir);
  await withAuth(
    auth,
    async (page) => {
      await step(`${who}-M2-click-${vp}`, async () => {
        await page.goto(
          `${BASE}/template-preview/current?kind=live-site&talent=${talentId}&locale=es`,
          { waitUntil: "domcontentloaded", timeout: 90000 },
        );
        await page.waitForTimeout(2500);
        await shot(page, dir, "00-top.png");
        const body = await page.locator("body").innerText();
        const header = /Trabajos|Menú|Editorial|Runway|Contratación/i.test(body);
        const cta = (await page.getByRole("link", { name: /Ver servicios|CONSULTAR|Reservar|Book/i }).count()) +
          (await page.getByRole("button", { name: /Ver servicios|CONSULTAR|Reservar|Book/i }).count());
        const dock = (await page.locator("[data-talent-dock], .talent-site-dock, [data-dock]").count()) > 0 ||
          /Ver servicios|CONSULTAR/i.test(body);
        let burgerOk = true;
        if (vp === 390) {
          const burger = await page.locator("[data-burger], button").filter({ hasText: /menu|menú/i }).count();
          burgerOk = burger === 0;
          await shot(page, dir, "01-phone.png");
        }
        // FAQ (Maison)
        const faq = page.locator("#faq, [data-builder-node-kind='faq']").first();
        if (await faq.count()) {
          await faq.scrollIntoViewIfNeeded().catch(() => {});
          await shot(page, dir, "05-faq.png");
        }
        const footer = page.locator("#site-footer, footer, [data-builder-node-kind='site_footer'], [data-builder-node-kind='statement_footer']").first();
        if (await footer.count()) {
          await footer.scrollIntoViewIfNeeded().catch(() => {});
          await shot(page, dir, "06-footer.png");
        }
        const ok = header && cta > 0 && dock && burgerOk;
        return {
          ok,
          note: `header=${header} cta=${cta} dock=${dock} burgerOk=${burgerOk}`,
          shot: path.join(dir, "00-top.png"),
          severity: ok ? undefined : "P1",
        };
      });
    },
    { width: vp, height: vp === 390 ? 844 : 900 },
  );
}

async function lane5CrossWire() {
  const dir = path.join(ROOT, "cross-wire");
  ensure(dir);

  // Alba Today → View website
  await withAuth(ALBA, async (page) => {
    await step("alba-F1-today-view-website", async () => {
      await page.goto(`${BASE}/talent/today`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      await shot(page, dir, "alba-01-today.png");
      const view = page.getByRole("link", { name: /View website|Ver sitio/i }).first();
      const btn = page.getByRole("button", { name: /View website|Ver sitio/i }).first();
      let landed = false;
      if (await view.count()) {
        const [popup] = await Promise.all([
          page.context().waitForEvent("page", { timeout: 8000 }).catch(() => null),
          view.click().catch(() => {}),
        ]);
        const target = popup || page;
        await target.waitForTimeout(2500);
        const url = target.url();
        const body = await target.locator("body").innerText();
        landed =
          /Manos que hablan|NAIL ARTIST|Hoy a las|Ver servicios/i.test(body) ||
          /live-site|template-preview|alba/i.test(url);
        await shot(target, dir, "alba-02-view-live.png");
        if (popup) await popup.close().catch(() => {});
      } else if (await btn.count()) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(2500);
        const body = await page.locator("body").innerText();
        landed = /Manos que hablan|NAIL ARTIST|Hoy a las/i.test(body);
        await shot(page, dir, "alba-02-view-live.png");
      }
      return {
        ok: landed,
        note: `landedMaison=${landed}`,
        shot: path.join(dir, "alba-02-view-live.png"),
        severity: landed ? undefined : "P0",
      };
    });

    await step("alba-F2-edit-site-builder", async () => {
      // Today "Edit site" opens My website (/talent/site). Card Link → page-builder.
      await page.goto(`${BASE}/talent/site`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      await page.getByTestId("maison-edit-site").or(page.getByRole("link", { name: /^Edit site$|^Editar sitio$/i })).first().click({ timeout: 10000 });
      await page.waitForTimeout(4500);
      const url = page.url();
      const body = await page.locator("body").innerText();
      const ok =
        /page-builder/i.test(url) &&
        /Manos que hablan|Hoy a las|Ver servicios/i.test(body);
      await shot(page, dir, "alba-03-edit-builder.png");
      return {
        ok,
        note: `url=${url.slice(0, 80)} maisonOnCanvas=${ok}`,
        shot: path.join(dir, "alba-03-edit-builder.png"),
        severity: ok ? undefined : "P0",
      };
    });

    // Demo / My content (UI: Demo | Your content) on gallery after Change design
    await step("alba-F3-demo-my-content", async () => {
      await page.goto(`${BASE}/talent/site`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      await page.getByRole("button", { name: /Change design|Cambiar diseño/i }).first().click({ timeout: 10000 });
      await page.waitForTimeout(2000);
      await page.getByRole("button", { name: /^All$|^Todos$/i }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      const demo = page.getByRole("button", { name: /^Demo$/i }).or(page.getByText(/^Demo$/i)).first();
      const mine = page
        .getByRole("button", { name: /My content|Your content|Mi contenido|Tu contenido/i })
        .or(page.getByText(/My content|Your content|Mi contenido|Tu contenido/i))
        .first();
      let toggled = false;
      if (await demo.count()) {
        await demo.click().catch(() => {});
        await page.waitForTimeout(800);
        toggled = true;
      }
      if (await mine.count()) {
        await mine.click().catch(() => {});
        await page.waitForTimeout(800);
        toggled = true;
      }
      await shot(page, dir, "alba-04-demo-my.png");
      const body = await page.locator("body").innerText();
      const ok = toggled || /Demo|My content|Your content|Mi contenido|Tu contenido/i.test(body);
      return {
        ok,
        note: `toggled=${toggled} labelsPresent=${/Demo|Your content|My content/i.test(body)}`,
        shot: path.join(dir, "alba-04-demo-my.png"),
        severity: ok ? undefined : "P1",
      };
    });
  });

  // Mateo Folio loop
  await withAuth(MATEO, async (page) => {
    await step("mateo-F4-today-view-folio", async () => {
      await page.goto(`${BASE}/talent/today`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      await shot(page, dir, "mateo-01-today.png");
      const view = page.getByRole("link", { name: /View website|Ver sitio/i }).first();
      let landed = false;
      if (await view.count()) {
        const [popup] = await Promise.all([
          page.context().waitForEvent("page", { timeout: 8000 }).catch(() => null),
          view.click().catch(() => {}),
        ]);
        const target = popup || page;
        await target.waitForTimeout(2500);
        const body = await target.locator("body").innerText();
        landed = /MATEO FERRER|OTOÑO|CONSULTAR|VER EL LIBRO/i.test(body);
        await shot(target, dir, "mateo-02-view-live.png");
        if (popup) await popup.close().catch(() => {});
      } else {
        await page.goto(
          `${BASE}/template-preview/current?kind=live-site&talent=${MATEO_ID}&locale=es`,
          { waitUntil: "domcontentloaded", timeout: 90000 },
        );
        await page.waitForTimeout(2500);
        const body = await page.locator("body").innerText();
        landed = /MATEO FERRER|OTOÑO/i.test(body);
        await shot(page, dir, "mateo-02-view-live.png");
      }
      return {
        ok: landed,
        note: `landedFolio=${landed}`,
        shot: path.join(dir, "mateo-02-view-live.png"),
        severity: landed ? undefined : "P0",
      };
    });

    await step("mateo-F4-edit-builder", async () => {
      await page.goto(`${BASE}/talent/page-builder`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(4500);
      const body = await page.locator("body").innerText();
      const ok = /OTOÑO|MATEO FERRER|CONSULTAR/i.test(body);
      await shot(page, dir, "mateo-03-builder.png");
      return {
        ok,
        note: `folioOnCanvas=${ok}`,
        shot: path.join(dir, "mateo-03-builder.png"),
        severity: ok ? undefined : "P0",
      };
    });
  });

  // Jor gallery stop at Publish
  await withAuth(JOR, async (page) => {
    await step("jor-F5-gallery-stop-publish", async () => {
      await page.goto(`${BASE}/talent/site`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
      await shot(page, dir, "jor-01-site.png");
      const designsBtn = page.getByRole("button", { name: /Designs|Diseños|Browse|Explorar|Change design/i }).first();
      if (await designsBtn.count()) await designsBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
      await shot(page, dir, "jor-02-gallery.png");
      const body = await page.locator("body").innerText();
      const hasDesigns = /Maison|Folio/i.test(body);
      // Try Use this design but STOP before confirming publish
      const useBtn = page.getByRole("button", { name: /Use this design|Usar este diseño|Apply|Aplicar/i }).first();
      let dialog = false;
      if (await useBtn.count()) {
        await useBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
        dialog =
          (await page.getByRole("dialog").count()) > 0 ||
          (await page.getByText(/Publish|Publicar|Cancel|Cancelar|Discard|Descartar/i).count()) > 0;
        await shot(page, dir, "jor-03-publish-stop.png");
        // Cancel / Escape — never confirm Publish
        const cancel = page.getByRole("button", { name: /Cancel|Cancelar|Discard|Descartar|Close|Cerrar/i }).first();
        if (await cancel.count()) await cancel.click().catch(() => {});
        else await page.keyboard.press("Escape").catch(() => {});
      }
      // Pass if gallery browsable; dialog optional if no apply affordance without selecting
      const ok = hasDesigns;
      return {
        ok,
        note: `hasDesigns=${hasDesigns} dialog=${dialog} stoppedWithoutPublish=true`,
        shot: path.join(dir, "jor-02-gallery.png"),
        severity: ok ? undefined : "P1",
      };
    });
  });
}

async function main() {
  ensure(ROOT);
  await lane2SiteCard("alba", ALBA, /Maison v2|Maison|Ros[eé]/i);
  await lane2SiteCard("mateo", MATEO, /Folio|Stone|Piedra/i);
  await lane2Gallery("alba", ALBA);
  await lane2Gallery("mateo", MATEO);
  await lane2Theme("alba", ALBA);
  await lane2Theme("mateo", MATEO);

  await builderLivePair("alba", ALBA, ALBA_ID, "maison-alba");
  await builderLivePair("mateo", MATEO, MATEO_ID, "folio-mateo");

  await liveClick("alba", ALBA, ALBA_ID, "maison-alba", 1440);
  await liveClick("alba", ALBA, ALBA_ID, "maison-alba", 390);
  await liveClick("mateo", MATEO, MATEO_ID, "folio-mateo", 1440);
  await liveClick("mateo", MATEO, MATEO_ID, "folio-mateo", 390);

  await lane5CrossWire();

  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log("PASS", pass, "FAIL", fail.length);
  console.log("FAILS", fail.map((r) => r.id).join(", ") || "(none)");
  console.log("wrote", RESULTS);
}

await main();
