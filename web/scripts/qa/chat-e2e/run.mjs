#!/usr/bin/env node
/**
 * Guest chat end-to-end (visitor -> talent -> visitor -> pay -> talent) on a QA talent, headless.
 *   node scripts/qa/chat-e2e/run.mjs [--widths 390,1280] [--slug valeria-unas] [--base-url http://localhost:3001]
 *                                    [--service "Gel semipermanente en manos"] [--apex tulala.digital] [--stop-after N]
 * Writes web/qa-evidence/chat-e2e/<timestamp>/{report.html,summary.json,*.png}. WRITES to the target (QA talent only).
 * Credentials: QA_FRESH_EMAIL / QA_FRESH_PASSWORD from web/.env.local, never printed.
 * Public site reached by mapping <slug>.<apex> to 127.0.0.1 inside Chromium (same as mockup-parity).
 * crypto.randomUUID is polyfilled because plain http on a non-localhost host is an insecure context (test-env only).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadEnvLocal } from "../../load-env-local.mjs";
import { Blocked, makeRecorder, stripSecure } from "./lib.mjs";

loadEnvLocal();
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const WIDTHS = opt("widths", "390,1280").split(",").map(Number);
const SLUG = opt("slug", "valeria-unas");
const BASE = opt("base-url", "http://localhost:3001");
const SERVICE = opt("service", "Gel semipermanente en manos");
const APEX = opt("apex", "tulala.digital");
const PORT = new URL(BASE).port || "80";
const SITE = `http://${SLUG}.${APEX}:${PORT}/`;
if (!/^(localhost|127\.0\.0\.1)$/.test(new URL(BASE).hostname)) { console.error("local base-url only"); process.exit(2); }
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = join(HERE, "..", "..", "..", "qa-evidence", "chat-e2e", TS);
const rec = makeRecorder(OUT);
const T_EMAIL = process.env.QA_FRESH_EMAIL, T_PASS = process.env.QA_FRESH_PASSWORD;

const POLY = () => { if (!crypto.randomUUID) crypto.randomUUID = () => "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHAT = "[data-chat-variant]";

async function newCtx(browser, w, extra = {}) {
  const { __publicHost, ...rest } = extra;
  const ctx = await browser.newContext({ viewport: { width: w, height: w >= 1000 ? 900 : 844 }, locale: "es-MX", ...rest });
  await ctx.addInitScript(POLY);
  if (__publicHost !== false) await stripSecure(ctx, APEX, PORT);
  return ctx;
}
const vis = async (loc, t = 8000) => { await loc.first().waitFor({ state: "visible", timeout: t }); };
async function bodyText(page) { return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " "); }
async function chatText(page) { return (await page.locator(CHAT).first().innerText().catch(() => "")).replace(/\s+/g, " "); }

async function main() {
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.${APEX} 127.0.0.1`] });
  for (const w of WIDTHS) {
    const S = {}; // per-width shared state
    const email = `qa-visitor+${Date.now()}@impronta.test`;
    const msg = `Hola QA ${w}px ${Date.now() % 100000}`;
    const vctx = await newCtx(browser, w);
    const vp = await vctx.newPage();
    vp.on("response", async (r) => { if (r.request().method() === "POST" && process.env.DEBUG) console.log("POST", r.status(), r.url().slice(0, 90), (await r.text().catch(() => "")).slice(0, 200).replace(/\n/g, " ")); });
    vp.on("pageerror", (e) => console.log(`[${w}] pageerror`, String(e).slice(0, 200)));
    const ok = (name) => rec.rows.find((r) => r.width === w && r.name === name)?.status === "PASS";
    const need = (name) => { if (!ok(name)) throw new Blocked(`depends on step "${name}" which did not pass`); };

    await rec.step(w, "V1 open public site", vp, async ({ note }) => {
      const r = await vp.goto(SITE, { waitUntil: "networkidle" }).catch(() => vp.goto(SITE));
      if (!r || r.status() !== 200) throw new Error("status " + r?.status());
      await vis(vp.locator(".site-builder-node--services-catalog-row"));
    });
    await rec.step(w, "V2 pick service, dock shows chat icon + thumbnail", vp, async ({ note, warn }) => {
      need("V1 open public site");
      const cta = vp.locator(".site-builder-node--services-catalog-row", { has: vp.locator(`text="${SERVICE}"`) }).locator("button[data-offering-cta]").first();
      await cta.evaluate((e) => e.scrollIntoView({ block: "center" }));
      await sleep(400);
      await cta.click({ force: true });
      const dock = vp.locator(".cb-dock[data-show='true']");
      await vis(dock);
      const ask = dock.locator(".cb-dock-ask");
      if (!(await ask.count())) throw new Error("dock has no chat button (.cb-dock-ask)");
      if (await ask.locator("img").count()) throw new Error("dock chat button shows a photo, expected a chat icon");
      if (!(await ask.locator("svg").count())) warn("dock chat button has no svg icon");
      const thumb = await dock.locator("img").count();
      if (!thumb) throw new Error("dock has no service thumbnail");
      const t = (await dock.innerText()).replace(/\s+/g, " ");
      if (!t.includes(SERVICE.slice(0, 12))) throw new Error("dock does not name the service: " + t);
      note(`dock: "${t}"`);
    });
    await rec.step(w, "V3 open chat: header icons, Volver a mi reserva, one context card, empty composer", vp, async ({ note, warn }) => {
      need("V2 pick service, dock shows chat icon + thumbnail");
      await vp.locator(".cb-dock-ask").click();
      await vis(vp.locator(CHAT));
      await sleep(600);
      const c = vp.locator(CHAT).first();
      for (const l of ["Ver servicios", "Mis citas", "Cerrar"]) if (!(await c.locator(`button[aria-label="${l}"]`).count())) throw new Error(`header icon "${l}" missing`);
      if (!(await c.getByText("Volver a mi reserva").count())) throw new Error('"Volver a mi reserva" missing');
      const ctxCards = await c.locator("[data-card-chat-context]").count();
      if (ctxCards !== 1) throw new Error(`expected exactly 1 context card, found ${ctxCards}`);
      const val = await c.locator("textarea").inputValue();
      if (val !== "") throw new Error("composer not empty: " + val);
      note("header icons OK, 1 context card, composer empty");
    });
    await rec.step(w, "V4 chip fills composer", vp, async () => {
      need("V3 open chat: header icons, Volver a mi reserva, one context card, empty composer");
      const chip = vp.locator("[data-card-chat-chips] button").first();
      const label = (await chip.innerText()).trim();
      await chip.click();
      await sleep(300);
      const val = await vp.locator(`${CHAT} textarea`).inputValue();
      if (val.trim() !== label) throw new Error(`composer "${val}" != chip "${label}"`);
    });
    await rec.step(w, "V5 send message opens contact gate", vp, async ({ warn }) => {
      need("V4 chip fills composer");
      await vp.locator(`${CHAT} textarea`).fill(msg);
      await sleep(800);
      await vp.locator(`${CHAT} button[data-send-state]`).click();
      const gate = vp.locator(`${CHAT} input[type=email]`);
      try { await vis(gate, 9000); } catch {
        warn("first send tap showed no gate in 9s; tapped again");
        await vp.locator(`${CHAT} button[data-send-state]`).click();
        await vis(gate, 9000);
      }
    });
    await rec.step(w, "V6 contact gate: name + email + captcha", vp, async ({ note, warn }) => {
      need("V5 send message opens contact gate");
      const c = vp.locator(CHAT).first();
      await c.getByPlaceholder("Nombre", { exact: true }).fill("QA");
      await c.getByPlaceholder("Apellido", { exact: true }).fill("Visitor");
      await c.locator("input[type=email]").fill(email);
      S.email = email;
      note("email " + email);
      const cap = await vp.locator("iframe[src*='turnstile'], iframe[src*='hcaptcha'], iframe[src*='recaptcha'], .cf-turnstile, [data-captcha]").count();
      if (cap) note("captcha widget present: " + cap);
      await c.getByRole("button", { name: /enviar mensaje/i }).click();
      let t = "";
      const done = async (ms) => { const t1 = Date.now(); while (Date.now() - t1 < ms) { t = await chatText(vp); if (!/TU MENSAJE/.test(t)) return true; await sleep(400); } return false; };
      if (!(await done(4000))) {
        warn("first Enviar tap did nothing (gate still showing after 4s); tapped again");
        await c.getByRole("button", { name: /enviar mensaje/i }).click();
        if (!(await done(20000))) throw new Error("gate never closed after second tap: " + t.slice(0, 200));
      }
      if (/captcha|verifica que eres/i.test(t) && !/tu mensaje fue|enviado/i.test(t)) throw new Blocked("captcha blocks the send: " + t.slice(0, 200));
      note("after submit: " + t.slice(0, 160));
    });
    await rec.step(w, "V7 message sent: own bubble + sent state", vp, async ({ note, warn }) => {
      need("V6 contact gate: name + email + captcha");
      const t0 = Date.now(); let t = "";
      while (Date.now() - t0 < 90000) { t = await chatText(vp); if (!/Enviando…/.test(t) && t.includes(msg)) break; await sleep(1000); }
      note(`send settled after ${Math.round((Date.now() - t0) / 1000)}s`);
      if (!t.includes(msg)) throw new Error("own bubble not shown: " + t.slice(0, 200));
      if (/Enviando…/.test(t)) throw new Error("still 'Enviando…' after 90s");
      if (/No se pudo|no enviado|error/i.test(t)) throw new Error("error text: " + t.slice(0, 200));
      if (!/\d{1,2}:\d{2}\s?[ap]\.?\s?m\.?/i.test(t)) warn("no sent timestamp next to the bubble");
      if (/Requesting:/.test(t)) warn('English prefix "Requesting:" in the es bubble (the message body is stored with it)');
      if (/Sin enviar/.test(t)) warn('header still says "Sin enviar" with an "Enviar" button although the talent already receives the thread (stale until reload)');
      note("chat: " + t.slice(0, 220));
    });
    if (process.env.SAVE_STATE) await vctx.storageState({ path: process.env.SAVE_STATE });

    await rec.step(w, "V8 Servicios view: Agregar adds a service", vp, async ({ note, warn }) => {
      need("V7 message sent: own bubble + sent state");
      await vp.locator(`${CHAT} button[aria-label="Ver servicios"]`).click();
      await sleep(1200);
      const row = vp.locator(`${CHAT} button`, { hasText: "Agregar" });
      const n = await row.count();
      if (!n) throw new Error("no Agregar buttons in the Servicios view");
      const gelRow = vp.locator(`${CHAT} *:has(> button:text-is("Agregar"))`, { hasText: SERVICE }).first();
      if (await gelRow.count()) { const st = (await gelRow.innerText()).replace(/\s+/g, " "); if (/Agregar/.test(st)) warn(`"${SERVICE}" is already in the thread but still shows a plain "Agregar" (no added state)`); }
      const target = vp.locator(`${CHAT} *:has(> button:text-is("Agregar"))`, { hasText: "Acrílico" }).locator("button", { hasText: "Agregar" }).first();
      const before = await chatText(vp);
      await target.click();
      await sleep(2500);
      const dlg = vp.locator("[role=dialog]", { hasText: /TU RESERVA|Tu reserva/i });
      if (await dlg.count()) {
        note("this service has options: the booking sheet opened instead of adding directly");
        await vp.screenshot({ path: join(OUT, `${w}-v8-options-sheet.png`) });
        await dlg.first().locator("button[aria-label*='errar'], button:has-text('✕')").first().click().catch(() => {});
        await sleep(800);
      }
      const after = await chatText(vp);
      note("after Agregar: " + after.slice(0, 180));
      if (!(await vp.locator(CHAT).count())) note("adding a service closed the chat and moved the dock to the new selection: " + (await vp.locator(".cb-dock[data-show='true']").innerText().catch(() => "")).replace(/\s+/g, " "));
      else if (after === before && !(await dlg.count())) throw new Error("tapping Agregar changed nothing");
      await vp.getByText("Volver al chat").first().click().catch(() => {});
      await sleep(800);
    });
    await rec.step(w, "V9 Mis citas lists the new request (same session)", vp, async ({ note }) => {
      need("V7 message sent: own bubble + sent state");
      if (!(await vp.locator(CHAT).count())) {
        const opener = vp.locator(".cb-dock-ask, .cb-bar-chat, .tl-fab:not([data-gone='true'])").first();
        await opener.evaluate((e) => e.click());
        await vis(vp.locator(CHAT), 10000);
      }
      await vp.locator(`${CHAT} button[aria-label="Mis citas"]`).click();
      await sleep(2500);
      const t = await chatText(vp);
      note("Mis citas: " + t.slice(0, 200));
      if (/Aún no tienes citas/.test(t)) throw new Error('Mis citas says "Aún no tienes citas" right after the request was sent (the list is stale until reload)');
    });

    // ------------------------------------------------------------------ talent
    const tctx = await newCtx(browser, w, { __publicHost: false });
    const tp = await tctx.newPage();
    const tok = String(msg.match(/\d+$/)[0]);
    const openThread = async () => {
      await tp.goto(`${BASE}/talent/inbox`, { waitUntil: "domcontentloaded" });
      await tp.getByPlaceholder(/Buscar clientes/).fill(tok);
      await sleep(2500);
      await tp.locator("text=QA Visitor >> visible=true").first().click();
      await sleep(2500);
    };
    await rec.step(w, "T1 talent signs in and opens the new thread", tp, async ({ note }) => {
      need("V7 message sent: own bubble + sent state");
      if (!T_EMAIL || !T_PASS) throw new Blocked("QA_FRESH_EMAIL/QA_FRESH_PASSWORD missing in web/.env.local");
      await tp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await tp.getByLabel(/email/i).fill(T_EMAIL);
      await tp.getByLabel(/password/i).fill(T_PASS);
      await tp.getByRole("button", { name: /sign in|log in|iniciar/i }).click();
      await tp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 });
      await openThread();
      const t = await bodyText(tp);
      if (!t.includes(tok)) throw new Error("thread with the visitor message not found in the inbox");
      note("thread open");
    });
    await rec.step(w, "T2 talent replies with text", tp, async ({ note }) => {
      need("T1 talent signs in and opens the new thread");
      const reply = `Hola, claro que si. QA reply ${tok}`;
      S.reply = reply;
      await tp.getByPlaceholder("Escribe una respuesta").fill(reply);
      await tp.getByRole("button", { name: "Enviar", exact: true }).evaluate((e) => e.click());
      await tp.getByText(reply).first().waitFor({ timeout: 20000 });
    });
    await rec.step(w, "T3 talent sends an offer for the service (Agregar artículos > Crear propuesta > Enviar)", tp, async ({ note, warn }) => {
      need("T2 talent replies with text");
      const add = tp.getByRole("button", { name: "Agregar artículos" });
      await add.or(tp.getByRole("button", { name: "Crear propuesta" })).first().waitFor({ timeout: 20000 }).catch(() => {});
      if (await add.count()) {
        await add.click();
        const dlg = tp.locator("[role=dialog]");
        await dlg.getByText(SERVICE).first().waitFor({ timeout: 20000 });
        await sleep(1200);
        await dlg.getByText(SERVICE).first().click();
        await dlg.getByRole("button", { name: /Continuar a la oferta/ }).click();
      } else note("draft already has items; skipping Agregar artículos");
      const crear = tp.getByRole("button", { name: "Crear propuesta" });
      const send = tp.getByRole("button", { name: /^Enviar v\d+$/ });
      await crear.or(send).first().waitFor({ timeout: 45000 });
      if (!(await send.count())) { await crear.click(); await send.waitFor({ timeout: 45000 }); }
      for (let i = 0; i < 40 && (await tp.locator(".sk-row").count()); i++) await sleep(500);
      const d = (await tp.locator("[role=dialog]").first().innerText()).replace(/\s+/g, " ");
      note("offer drawer: " + d.slice(0, 260));
      if (/USD/.test(d)) warn("offer drawer shows USD amounts for a MXN service (the visitor sees MXN)");
      await sleep(1500);
      await send.click({ timeout: 15000 });
      await tp.getByText(/Enviada/).first().waitFor({ timeout: 30000 }).catch(() => { throw new Error('offer card "Enviada" never appeared in the thread after Enviar'); });
      S.offerSent = true;
    });

    // ------------------------------------------------------------ visitor again
    await vp.close();
    const vp2 = await vctx.newPage();
    await rec.step(w, "R1 visitor reloads the site: resume + unread state", vp2, async ({ note, warn }) => {
      need("T3 talent sends an offer for the service (Agregar artículos > Crear propuesta > Enviar)");
      await vp2.goto(SITE, { waitUntil: "networkidle" }).catch(() => {});
      await sleep(2500);
      const fab = await vp2.evaluate(() => [...document.querySelectorAll(".tl-fab, .cb-bar-chat")].map((e) => `${e.className}|${e.getAttribute("aria-label")}|${(e.innerText || "").trim()}|badge:${!!e.querySelector("[class*=badge],[data-unread],[data-count]")}`));
      note("launchers: " + fab.join(" ; "));
      const lbl = fab.join(" ");
      if (!/badge:true|nuevo|respuesta|mensaje/i.test(lbl)) warn("no unread/new-message cue on the launcher");
    });
    await rec.step(w, "R2 visitor opens chat: sees the talent reply and the offer card", vp2, async ({ note }) => {
      need("R1 visitor reloads the site: resume + unread state");
      await vp2.locator(".cb-bar-chat, .tl-fab:not([data-gone='true'])").first().evaluate((e) => e.click());
      await vis(vp2.locator(CHAT), 15000);
      let t = "";
      for (let i = 0; i < 20; i++) { t = await chatText(vp2); if (t.includes(S.reply) && /Oferta/.test(t)) break; await sleep(1000); }
      if (!t.includes(S.reply)) throw new Error("talent reply not visible after resume: " + t.slice(0, 200));
      if (!/Oferta/.test(t)) throw new Error("offer card not visible in the thread: " + t.slice(0, 300));
      note("thread: " + t.slice(0, 300));
    });
    await rec.step(w, 'R3 Mis citas shows the offer under "Te toca"', vp2, async ({ note }) => {
      need("R2 visitor opens chat: sees the talent reply and the offer card");
      await vp2.locator(`${CHAT} button[aria-label="Mis citas"]`).click();
      await sleep(2500);
      const t = await chatText(vp2);
      note("Mis citas: " + t.slice(0, 220));
      if (!/Te toca/.test(t)) throw new Error('no "Te toca" section');
      if (!/Oferta/i.test(t)) throw new Error('"Te toca" does not mention the offer');
      await vp2.getByText("Volver al chat").first().click().catch(() => {});
      await sleep(800);
    });
    await rec.step(w, "R4 visitor accepts the offer", vp2, async ({ note }) => {
      need("R2 visitor opens chat: sees the talent reply and the offer card");
      const btn = vp2.locator(CHAT).getByRole("button", { name: /^Aceptar oferta$|^Aceptar$/ }).first();
      await btn.click();
      const t0 = Date.now(); let t = "";
      while (Date.now() - t0 < 30000) {
        if (/\/pay\/|\/link\//.test(vp2.url())) { S.payUrl = vp2.url(); note("redirected to " + vp2.url()); return; }
        t = await chatText(vp2);
        if (/No puedes hacer eso|no se pudo|expir|conflict/i.test(t)) throw new Error("accept refused in the UI: " + (t.match(/No puedes hacer eso[^.]*\.|No se pudo[^.]*\./i) || [t.slice(0, 120)])[0] + " (code: messagingClientAcceptOffer -> acceptDirect refuses with not_allowed while the talent's own approval row is still pending; src/lib/server-actions/messaging-client.ts)");
        if (/Oferta aceptada|Aceptada|Acept\w+ la oferta|Pagar/i.test(t) && !/Aceptar oferta/.test(t)) { note("accepted: " + t.slice(0, 160)); return; }
        await sleep(1000);
      }
      throw new Error("no visible result 30s after tapping Aceptar: " + t.slice(0, 200));
    });
    S.payViaFallback = !ok("R4 visitor accepts the offer");
    if (S.payViaFallback) {
      await rec.step(w, "T4 (fallback) talent confirms identity and requests a payment link", tp, async ({ note }) => {
        const acc = async () => {
          await tp.getByRole("button", { name: "+ Acciones" }).click();
          await sleep(800);
          await tp.locator("button", { hasText: "Pedir un anticipo" }).click();
          await sleep(3000);
        };
        await openThread();
        await acc();
        const conf = tp.getByRole("button", { name: "Confirmar identidad" });
        if (await conf.count()) {
          await conf.last().click();
          await sleep(2500);
          await tp.locator("button", { hasText: /cliente existente/ }).first().click();
          await tp.getByRole("button", { name: "Guardar y vincular" }).click();
          await sleep(4500);
          await acc();
        }
        const dlg = tp.locator("[role=dialog]");
        await dlg.getByText("Monto total", { exact: true }).click();
        await dlg.getByRole("button", { name: "Enviar", exact: true }).click();
        await sleep(6000);
        note("payment link requested from the talent drawer");
      });
    }
    await rec.step(w, "P1 visitor opens the payment link and pays with the Stripe test card", vp2, async ({ note }) => {
      need(S.payViaFallback ? "T4 (fallback) talent confirms identity and requests a payment link" : "R4 visitor accepts the offer");
      if (!S.payUrl) {
        await vp2.reload({ waitUntil: "networkidle" }).catch(() => {});
        await sleep(2000);
        await vp2.locator(".cb-bar-chat, .tl-fab, .cb-dock-ask").first().evaluate((e) => e.click());
        await vis(vp2.locator(CHAT), 15000);
        let href = null;
        for (let i = 0; i < 20 && !href; i++) { href = await vp2.locator(`${CHAT} a[href*='/pay/'], ${CHAT} a[href*='/link/']`).first().getAttribute("href").catch(() => null); if (!href) await sleep(1000); }
        if (!href) throw new Error("no payment link in the visitor thread: " + (await chatText(vp2)).slice(0, 250));
        S.payUrl = new URL(href, SITE).toString();
      }
      await vp2.goto(S.payUrl, { waitUntil: "domcontentloaded" });
      const go = vp2.locator("a[href*='confirm=stripe']").first();
      await go.waitFor({ timeout: 20000 });
      await go.click();
      await vp2.waitForURL(/checkout\.stripe\.com/, { timeout: 45000 });
      await vp2.waitForLoadState("domcontentloaded");
      await sleep(4000);
      const fill = async (sel, v) => { const l = vp2.locator(sel).first(); await l.waitFor({ timeout: 20000 }); await l.fill(v); };
      const email = vp2.locator("#email"); if (await email.count()) await email.fill(S.email).catch(() => {});
      await fill("#cardNumber", "4242424242424242");
      await fill("#cardExpiry", "12 / 34");
      await fill("#cardCvc", "123");
      const nm = vp2.locator("#billingName"); if (await nm.count()) await nm.fill("QA Visitor");
      const zip = vp2.locator("#billingPostalCode"); if (await zip.count()) await zip.fill("77500").catch(() => {});
      await vp2.screenshot({ path: join(OUT, `${w}-p1-stripe-filled.png`) });
      await vp2.locator(".SubmitButton, button[type=submit]").first().click();
      await vp2.waitForURL((u) => /tulala\.digital|localhost/.test(u.hostname), { timeout: 90000 });
      await sleep(3000);
      note("returned to " + vp2.url());
    });
    await rec.step(w, 'P2 visitor sees the paid state in the thread and in Mis citas ("Pagada")', vp2, async ({ note }) => {
      need("P1 visitor opens the payment link and pays with the Stripe test card");
      await vp2.goto(SITE, { waitUntil: "networkidle" }).catch(() => {});
      await vp2.locator(".cb-bar-chat, .tl-fab:not([data-gone='true'])").first().evaluate((e) => e.click());
      await vis(vp2.locator(CHAT), 15000);
      await sleep(2500);
      const t = await chatText(vp2);
      note("thread: " + t.slice(0, 260));
      if (!/Pagad/i.test(t)) throw new Error('thread does not show a paid state ("Pagad…")');
      await vp2.locator(`${CHAT} button[aria-label="Mis citas"]`).click();
      await sleep(2500);
      const c = await chatText(vp2);
      note("Mis citas: " + c.slice(0, 200));
      if (!/Pagada/i.test(c)) throw new Error('Mis citas does not show "Pagada"');
    });
    await rec.step(w, "T5 talent sees the paid status (thread + Money)", tp, async ({ note }) => {
      need("P1 visitor opens the payment link and pays with the Stripe test card");
      await openThread();
      const t = await bodyText(tp);
      if (!/Pagad|Paid/i.test(t)) throw new Error("thread shows no paid state for the talent");
      await tp.goto(`${BASE}/talent/money`, { waitUntil: "domcontentloaded" });
      await sleep(3500);
      const m = await bodyText(tp);
      note("money: " + m.slice(0, 200));
      if (!/Pagad|Paid|QA Visitor/i.test(m)) throw new Error("Money page shows no paid sale");
    });

    // ------------------------------------------------------------ desktop modes
    if (w >= 1000) {
      await rec.step(w, "E1 expanded two-pane mode", vp2, async ({ note }) => {
        await vp2.goto(SITE, { waitUntil: "networkidle" }).catch(() => {});
        await vp2.locator(".cb-bar-chat, .tl-fab:not([data-gone='true'])").first().click({ force: true });
        await vis(vp2.locator(CHAT), 15000);
        const ex = vp2.locator("[data-card-dock-expand]");
        if (!(await ex.count())) throw new Error("no expand control ([data-card-dock-expand]) at desktop width");
        await ex.click();
        await sleep(1500);
        const info = await vp2.evaluate(() => { const c = document.querySelector("[data-chat-variant]"); const k = [...c.querySelectorAll("*")].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0]; const left = c.innerText.match(/TUS SOLICITUDES([\s\S]{0,120})/); return { expanded: c.getAttribute("data-chat-expanded"), w: Math.round(k.width), leftPane: left ? left[1].replace(/\s+/g, " ").trim().slice(0, 80) : null }; });
        note(JSON.stringify(info));
        if (info.expanded !== "true") throw new Error("data-chat-expanded is not true after the expand click");
        if (info.w < 700) throw new Error(`panel only ${info.w}px wide when expanded`);
        if (!info.leftPane) throw new Error("no left conversations pane");
        if (/Aún no tienes solicitudes/.test(info.leftPane)) throw new Error('left pane says "Aún no tienes solicitudes" although this visitor has a sent request (list fetch on cold resume returns empty; src/app/t/[profileCode]/_chat/use-guest-inquiries-list.ts)');
      });
      await rec.step(w, "E2 Esc closes the chat", vp2, async () => {
        await vp2.keyboard.press("Escape");
        await sleep(1200);
        if (await vp2.locator(CHAT).first().isVisible().catch(() => false)) throw new Error("chat still visible after Escape");
      });
    }
    await tctx.close();
    await vctx.close();
  }
  await browser.close();
  const c = rec.writeReport({ base: BASE, slug: SLUG, widths: WIDTHS, ts: TS });
  console.log(`\nreport: ${join(OUT, "report.html")}\n${c.PASS} PASS / ${c.FAIL} FAIL / ${c.BLOCKED} BLOCKED`);
  process.exit(c.FAIL || c.BLOCKED ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
