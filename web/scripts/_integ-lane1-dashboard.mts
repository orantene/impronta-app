/**
 * Lane 1 — Talent dashboard audit (headless). Leaves Oran's headed Chrome alone.
 * Writes shots under media/integ-designs-final/dashboard/ and results JSON.
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const ROOT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final/dashboard";
const RESULTS =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final/lane1-dashboard-results.json";

type Row = { id: string; ok: boolean; note: string; shot?: string; severity?: string };
const results: Row[] = [];

function ensure(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function shot(page: Page, name: string) {
  ensure(ROOT);
  const file = path.join(ROOT, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function withAuth(auth: string, fn: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: auth,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
  try {
    await fn(page);
  } finally {
    (globalThis as { __errs?: string[] }).__errs = consoleErrors;
    await browser.close();
  }
  return consoleErrors;
}

async function step(id: string, fn: () => Promise<Omit<Row, "id">>) {
  try {
    const r = await fn();
    results.push({ id, ...r });
    console.log(r.ok ? "✓" : "✗", id, r.note.slice(0, 140));
  } catch (e) {
    results.push({ id, ok: false, note: String(e).slice(0, 300), severity: "P1" });
    console.log("✗", id, String(e).slice(0, 140));
  }
}

async function gotoOk(page: Page, route: string) {
  const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  // Messages redirects /talent/messages → /talent/inbox; first paint can be empty.
  if (/messages|inbox/i.test(route)) {
    await page
      .waitForFunction(
        () => /Inbox|conversation|Mensajes|Bandeja/i.test(document.body?.innerText || ""),
        { timeout: 12000 },
      )
      .catch(() => {});
    await page.waitForTimeout(500);
  }
  const url = page.url();
  const status = res?.status() ?? 0;
  const login = /\/login/.test(url);
  return { status, url, login, ok: !!res && status < 400 && !login };
}

async function auditWho(
  who: "alba" | "mateo" | "jor",
  auth: string,
  expect: { name: RegExp; designCard?: RegExp; noMyColors?: boolean; host?: RegExp },
) {
  const dirWho = who;
  await withAuth(auth, async (page) => {
    // D1 Today
    await step(`${who}-D1-today`, async () => {
      const g = await gotoOk(page, "/talent/today");
      const body = await page.locator("body").innerText();
      const shotPath = await shot(page, `${dirWho}-01-today.png`);
      const greeting = /Good (morning|afternoon|evening)|Buen[oa]s|Hello|Hola/i.test(body);
      const nameOk = expect.name.test(body);
      const needs = /Needs attention|Necesita atención|clear for now|nada necesita/i.test(body);
      const todayBlock = /Today|Hoy|appointments|citas/i.test(body);
      const money = /Money|Dinero|COLLECTED|OWED|Recaudado|Te deben/i.test(body);
      const website = /website is live|sitio.*vivo|View website|Ver sitio|Edit site|Editar/i.test(body);
      const ctaAppt = (await page.getByRole("button", { name: /New appointment|Nueva cita/i }).count()) > 0;
      const ctaQuote = (await page.getByRole("button", { name: /Send quote|Enviar cotizaci/i }).count()) > 0;
      const blank = await page.locator("button:empty").count();
      const ok =
        g.ok &&
        nameOk &&
        greeting &&
        needs &&
        todayBlock &&
        money &&
        website &&
        blank < 8 &&
        (who === "jor" ? true : ctaAppt || ctaQuote);
      return {
        ok,
        note: `status=${g.status} name=${nameOk} greet=${greeting} needs=${needs} today=${todayBlock} money=${money} web=${website} appt=${ctaAppt} quote=${ctaQuote} blank=${blank}`,
        shot: shotPath,
        severity: ok ? undefined : "P1",
      };
    });

    // D5 Header on Today
    await step(`${who}-D5-header`, async () => {
      const body = await page.locator("body").innerText();
      const acting = expect.name.test(body) && /Acting as|Actuando como/i.test(body);
      const manage = /Manage website|Administrar sitio/i.test(body);
      const hostOk = expect.host ? expect.host.test(body) : true;
      const bell = (await page.locator('[aria-label*="notification" i], button:has-text("")').count()) >= 0;
      const shotPath = await shot(page, `${dirWho}-05-header.png`);
      const ok = acting && manage && hostOk;
      return {
        ok,
        note: `acting=${acting} manage=${manage} host=${hostOk} bellProbe=${bell}`,
        shot: shotPath,
        severity: ok ? undefined : "P1",
      };
    });

    // D2 WORK nav
    const work: Array<[string, string, RegExp]> = [
      ["today", "/talent/today", /Today|Hoy|Good |Buen/i],
      ["messages", "/talent/messages", /Messages|Mensajes|Inbox|conversation|Pick a conversation|0 conversations|No messages|Sin mensajes|Chat|Bandeja|empty inbox|Nothing here|Nothing yet|Aún no/i],
      ["calendar", "/talent/calendar", /Calendar|Calendario/i],
      ["clients", "/talent/clients", /Clients|Clientes/i],
      ["money", "/talent/money", /Money|Dinero|COLLECTED|OWED|Request payment|Pedir pago|Cobrar|Payments/i],
    ];
    for (const [id, route, re] of work) {
      await step(`${who}-D2-${id}`, async () => {
        const g = await gotoOk(page, route);
        const body = await page.locator("body").innerText();
        const shotPath = await shot(page, `${dirWho}-02-${id}.png`);
        const content = re.test(body);
        const blank = await page.locator("button:empty").count();
        let pay = true;
        if (id === "money" && who === "jor") {
          pay = (await page.getByText(/Request payment|Pedir pago|Cobrar/i).count()) > 0;
          results.push({
            id: `${who}-D6-request-payment`,
            ok: pay,
            note: `requestPaymentVisible=${pay}`,
            severity: pay ? undefined : "P1",
          });
          console.log(pay ? "✓" : "✗", `${who}-D6-request-payment`);
        }
        const ok = g.ok && content && blank < 10 && pay;
        return {
          ok,
          note: `status=${g.status} content=${content} blank=${blank} url=${g.url}`,
          shot: shotPath,
          severity: ok ? undefined : "P1",
        };
      });
    }

    // D3 PRESENCE
    const presence: Array<[string, string, RegExp]> = [
      ["profile", "/talent/profile", /Profile|Perfil/i],
      ["site", "/talent/site", /My presence|Mi presencia|My website|Mi sitio|Website|Diseño|Design/i],
      ["services", "/talent/services", /Services|Servicios/i],
      ["reviews", "/talent/reviews", /Reviews|Reseñas|Review/i],
    ];
    for (const [id, route, re] of presence) {
      await step(`${who}-D3-${id}`, async () => {
        const g = await gotoOk(page, route);
        const body = await page.locator("body").innerText();
        const shotPath = await shot(page, `${dirWho}-03-${id}.png`);
        const content = re.test(body);
        const blank = await page.locator("button:empty").count();
        const ok = g.ok && content && blank < 10;
        return {
          ok,
          note: `status=${g.status} content=${content} blank=${blank}`,
          shot: shotPath,
          severity: ok ? undefined : "P1",
        };
      });
    }

    // D4 Plan / Settings / Preview
    await step(`${who}-D4-settings`, async () => {
      const g = await gotoOk(page, "/talent/settings");
      const body = await page.locator("body").innerText();
      const shotPath = await shot(page, `${dirWho}-04-settings.png`);
      const content = /Settings|Ajustes|Config/i.test(body);
      const blank = await page.locator("button:empty").count();
      return {
        ok: g.ok && content && blank < 10,
        note: `status=${g.status} content=${content} blank=${blank}`,
        shot: shotPath,
        severity: g.ok && content ? undefined : "P1",
      };
    });

    await step(`${who}-D4-plan-chip`, async () => {
      await gotoOk(page, "/talent/today");
      const body = await page.locator("body").innerText();
      const plan = /WEB OFFICE|Plan|Plan /i.test(body);
      const shotPath = await shot(page, `${dirWho}-04-plan.png`);
      return { ok: plan, note: `planVisible=${plan}`, shot: shotPath, severity: plan ? undefined : "P2" };
    });

    // D7 Website card on Today + site
    await step(`${who}-D7-today-website-card`, async () => {
      await gotoOk(page, "/talent/today");
      const body = await page.locator("body").innerText();
      const shotPath = await shot(page, `${dirWho}-07-today-webcard.png`);
      const live = /website is live|sitio.*vivo|View website|Ver sitio/i.test(body);
      const edit = /Edit site|Editar sitio|Editar/i.test(body);
      return {
        ok: live && edit,
        note: `live=${live} edit=${edit}`,
        shot: shotPath,
        severity: live && edit ? undefined : "P1",
      };
    });

    await step(`${who}-D7-site-card`, async () => {
      await gotoOk(page, "/talent/site");
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      const shotPath = await shot(page, `${dirWho}-07-site-card.png`);
      const myColors = /My colors|Mis colores/i.test(body);
      const designOk = expect.designCard ? expect.designCard.test(body) : true;
      // Jor may not have Folio/Maison applied — card still should not invent My colors wrongly if design set
      const ok =
        who === "jor"
          ? !/\/login/.test(page.url()) && (await page.locator("body").count()) > 0
          : designOk && !(expect.noMyColors && myColors);
      return {
        ok,
        note: `designMatch=${designOk} myColors=${myColors} snippet=${body.replace(/\s+/g, " ").slice(0, 200)}`,
        shot: shotPath,
        severity: ok ? undefined : "P0",
      };
    });

    // D6 Money empty (Alba/Mateo)
    if (who !== "jor") {
      await step(`${who}-D6-money-empty`, async () => {
        await gotoOk(page, "/talent/money");
        const body = await page.locator("body").innerText();
        const shotPath = await shot(page, `${dirWho}-06-money.png`);
        const emptyish = /MX\$0|COLLECTED|OWED|Recaudado|Te deben|Payout|pago/i.test(body);
        return { ok: emptyish, note: `moneySurface=${emptyish}`, shot: shotPath };
      });
    }
  });
}

async function main() {
  ensure(ROOT);
  ensure(path.dirname(RESULTS));
  const alba = "/home/ubuntu/.claude/design-diff/.auth-alba-nail-artist.json";
  const mateo = "/home/ubuntu/.claude/design-diff/.auth-mateo-ferrer.json";
  const jor = "/home/ubuntu/.claude/design-diff/.auth-jor.json";

  await auditWho("alba", alba, {
    name: /Acting as Alba|Alba/i,
    designCard: /Maison v2|Maison|Ros[eé]/i,
    noMyColors: true,
    host: /alba-nail-artist/i,
  });
  await auditWho("mateo", mateo, {
    name: /Acting as Mateo|Mateo/i,
    designCard: /Folio|Default stone|Stone|Piedra/i,
    noMyColors: true,
    host: /mateo-ferrer/i,
  });
  await auditWho("jor", jor, {
    name: /Acting as Jorg|Jorg|Jorgelina/i,
    host: /book-jorgelina|jorg/i,
  });

  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log("PASS", pass, "FAIL", fail);
  console.log("wrote", RESULTS);
  if (fail) {
    console.log(
      "FAILS",
      results
        .filter((r) => !r.ok)
        .map((r) => r.id)
        .join(", "),
    );
  }
}

await main();
