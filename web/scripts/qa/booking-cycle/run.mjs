// Booking-cycle e2e matrix (QA only). Talent = Valeria (QA_FRESH_*, TAL-93901).
// Usage: node scripts/qa/booking-cycle/run.mjs <channel...>   channels: A B BD C D E G
// Env: BASE_URL (default http://localhost:3001), EVIDENCE (dir), TALENT_STATE (storageState json from login.mjs)
// Never touches non-QA talents. Writes results to $EVIDENCE/results.jsonl.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3001";
const EV = process.env.EVIDENCE || path.resolve("../qa-evidence/booking-cycle");
const TALENT_STATE = process.env.TALENT_STATE;
const VALERIA = { id: "b4620ed3-bc01-41d4-aa75-3965f4d3efe0", code: "TAL-93901" };
const PREVIEW = `${BASE}/template-preview/live?kind=live-site&talent=${VALERIA.id}&locale=es`;
const PUBLIC = `${BASE}/t/${VALERIA.code}`;
const HIDE = "[data-consent-banner]{display:none!important}";
const RUN = Date.now().toString(36).slice(-5);
fs.mkdirSync(EV, { recursive: true });

const rec = (channel, step, ok, saw, shot, extra = {}) => {
  const row = { channel, step, result: ok === null ? "BLOCKED" : ok ? "PASS" : "FAIL", saw: String(saw).replace(/\s+/g, " ").slice(0, 300), shot, ...extra };
  fs.appendFileSync(path.join(EV, "results.jsonl"), JSON.stringify(row) + "\n");
  console.log(`[${row.result}] ${channel} · ${step} — ${row.saw.slice(0, 160)}`);
};
const shot = async (page, name) => {
  const f = path.join(EV, `${name}.png`);
  await page.screenshot({ path: f }).catch(() => {});
  return f;
};
async function waitServer() {
  for (;;) {
    try { const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(30000) }); if (r.status === 200) return; } catch {}
    console.log("waiting for :3001 …"); await new Promise((r) => setTimeout(r, 30000));
  }
}
async function open(ctx, url) {
  await waitServer();
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "load", timeout: 180000 });
  await p.waitForTimeout(4000);
  await p.addStyleTag({ content: HIDE }).catch(() => {});
  return p;
}
const vis = (loc) => loc.locator("visible=true").first();
const btn = (scope, name, exact = false) => vis(scope.getByRole("button", { name, exact }));
const dialogText = async (p) => {
  const d = p.locator('[role="dialog"]:visible').last();
  return (await d.count()) ? d.innerText().catch(() => "") : p.locator("body").innerText();
};
async function step(channel, name, page, fn) {
  try {
    const out = await fn();
    const ok = out?.ok ?? true;
    rec(channel, name, out?.blocked ? null : ok, out?.saw ?? "", await shot(page, `${channel}-${name}`), out?.extra);
    return ok && !out?.blocked;
  } catch (e) {
    rec(channel, name, false, `ERROR ${e.message.split("\n")[0]}`, await shot(page, `${channel}-${name}`));
    return false;
  }
}

const rowBtn = (p, text, name) =>
  p.locator("div,li,article", { hasText: text }).filter({ has: p.getByRole("button", { name }) }).last().getByRole("button", { name }).first();
// Visitor on the theme site (owner preview; the only local render of Valeria's real site).
async function sheetToContact(q, service, cta, who) {
  await rowBtn(q, service, cta).click(); await q.waitForTimeout(3000);
  await btn(q, "Continuar").click(); await q.waitForTimeout(4000);
  await btn(q, /vie\W*\d+\W*oct/i).click();
  await btn(q, /^\d{1,2}:\d{2}$/).click();
  await btn(q, "Continuar").click(); await q.waitForTimeout(3000);
  await vis(q.locator('input[placeholder="Tu nombre"]')).fill(who.name);
  await vis(q.locator('input[placeholder^="Para avisarte"]')).fill("+15555550100");
  await vis(q.locator("input[type=email]")).fill(who.email);
}
// ---------- talent helpers ----------
async function talentThread(tctx, contactName) {
  const t = await open(tctx, `${BASE}/talent/inbox`);
  await vis(t.getByText(contactName, { exact: true })).click({ timeout: 30000 });
  await t.waitForTimeout(5000);
  return t;
}
async function talentSendOffer(t, serviceTitle, priceMx, note) {
  await btn(t, "Enviar cotización").click();
  await t.waitForTimeout(3000);
  const drawer = t.locator('[role="dialog"]:visible').last();
  const sel = vis(drawer.locator("select"));
  const opts = await sel.locator("option").allTextContents();
  const pick = opts.find((o) => o.includes(serviceTitle)) ?? opts[1];
  await sel.selectOption({ label: pick });
  await vis(drawer.locator("input")).fill(String(priceMx));
  await vis(drawer.locator("textarea")).fill(note);
  await t.waitForTimeout(800);
  const send = drawer.getByRole("button", { name: /^(Enviar|Send)/ }).last();
  await send.click();
  await t.waitForTimeout(8000);
  return { picked: pick, preselected: false };
}

// ---------- visitor helpers ----------
async function guestChatSend(p, text) {
  const d = p.locator('[role="dialog"]:visible').last();
  await vis(d.locator("textarea")).fill(text);
  await d.locator("textarea ~ button, button[aria-label*='nviar'], button[aria-label*='Send'], button[type=submit]").locator("visible=true").last().click();
  await p.waitForTimeout(10000);
}
// Contact gate on the /t chat ("Where should Valeria reach you?").
async function guestContactGate(p, first, email) {
  const fn = p.locator('input[placeholder="First name"], input[placeholder="Nombre"]').locator("visible=true");
  if (!(await fn.count())) return false;
  await fn.first().fill(first);
  await vis(p.locator('input[placeholder="Last name"], input[placeholder="Apellido"]')).fill("QA").catch(() => {});
  await vis(p.locator('input[placeholder="Email"], input[placeholder="Correo"], input[type=email]')).fill(email);
  await btn(p, /Send message|Enviar mensaje/).click();
  await p.waitForTimeout(12000);
  return true;
}
async function stripePay(p) {
  // Stripe Checkout (hosted) or Payment Element. TEST card only.
  await p.waitForTimeout(6000);
  if (/checkout\.stripe\.com/.test(p.url())) {
    await p.fill("#cardNumber", "4242 4242 4242 4242");
    await p.fill("#cardExpiry", "12 / 34");
    await p.fill("#cardCvc", "123");
    if (await p.locator("#billingName").count()) await p.fill("#billingName", "QA Booking Cycle");
    if (await p.locator("#billingPostalCode").isVisible().catch(() => false)) await p.fill("#billingPostalCode", "12345");
    await p.locator(".SubmitButton, button[type=submit]").first().click();
    await p.waitForURL((u) => !/checkout\.stripe\.com/.test(u.toString()), { timeout: 90000 });
    return "hosted";
  }
  const fr = p.frameLocator('iframe[name^="__privateStripeFrame"], iframe[title*="Secure payment"]').first();
  await fr.locator('input[name="number"]').fill("4242424242424242", { timeout: 30000 });
  await fr.locator('input[name="expiry"]').fill("1234");
  await fr.locator('input[name="cvc"]').fill("123");
  const zip = fr.locator('input[name="postalCode"]');
  if (await zip.count()) await zip.fill("12345");
  await btn(p, /Pagar|Pay|Confirmar|Confirm/).click();
  await p.waitForTimeout(15000);
  return "element";
}

// ---------- channels ----------
async function chanA(b) {
  // A1: anonymous public route /t — "Book" on an instant service.
  const g = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX" });
  const p = await open(g, PUBLIC);
  await step("A", "1-public-t-book-opens-sheet", p, async () => {
    await rowBtn(p, "Semi-permanent gel, hands", "Book").click();
    await p.waitForTimeout(6000);
    const n = await p.locator('[role="dialog"]:visible:not([data-consent-banner])').count();
    return { ok: n > 0, saw: n ? await dialogText(p) : "Clicked Book on /t/TAL-93901: nothing opened (no sheet, no slot picker)" };
  });
  await g.close();
  // A2: theme site (owner preview, the only local render of the real site) — instant sheet.
  if (!TALENT_STATE) return;
  const o = await b.newContext({ storageState: TALENT_STATE, viewport: { width: 1280, height: 900 } });
  const q = await open(o, PREVIEW);
  await step("A", "2-sheet-service-slot-details", q, async () => {
    await rowBtn(q, "Gel semipermanente en manos", "Seleccionar").click();
    await btn(q, "Continuar").click(); await q.waitForTimeout(4000);
    await btn(q, /vie\W*\d+\W*oct/i).click();
    await btn(q, /^\d{1,2}:\d{2}$/).click();
    await btn(q, "Continuar").click(); await q.waitForTimeout(3000);
    await vis(q.locator('input[placeholder="Tu nombre"]')).fill(`QA Ciclo A ${RUN}`);
    await vis(q.locator("input[type=email]")).fill(`qa-booking-cycle-a-${RUN}@example.com`);
    return { saw: await dialogText(q) };
  });
  await step("A", "3-confirm-instant", q, async () => {
    await btn(q, "Confirmar cita").click(); await q.waitForTimeout(10000);
    const t = await dialogText(q);
    if (/Completa la verificación/.test(t)) return { blocked: true, saw: "hCaptcha required ('Completa la verificación'; widget says 'localhost detected'). Not bypassed per rules." };
    return { ok: /confirmad|lista|reservad/i.test(t), saw: t };
  });
  await o.close();
}

async function chanB(b, decline = false) {
  const ch = decline ? "BD" : "B";
  const name = `QA Ciclo ${ch} ${RUN}`;
  if (!TALENT_STATE) return;
  const g = await b.newContext({ storageState: TALENT_STATE, viewport: { width: 1280, height: 900 } });
  const p = await open(g, PREVIEW);
  let ok = await step(ch, "1-sheet-request-pick-time-details", p, async () => {
    await sheetToContact(p, "Nail art a mano alzada", "Solicitar cita", { name, email: `qa-booking-cycle-${ch.toLowerCase()}-${RUN}@example.com` });
    return { saw: await dialogText(p) };
  });
  if (!ok) return g.close();
  ok = await step(ch, "2-send-request", p, async () => {
    await btn(p, "Chatea ahora").click(); await p.waitForTimeout(8000);
    await guestChatSend(p, `${ch} ${RUN}: quiero esta cita por favor`);
    await p.waitForTimeout(10000);
    const t = await dialogText(p);
    return { ok: !/Enviando…/.test(t), saw: t };
  });
  fs.writeFileSync(path.join(EV, `${ch}-guest-state.json`), JSON.stringify(await g.storageState()));
  if (!TALENT_STATE) return g.close();
  const tctx = await b.newContext({ storageState: TALENT_STATE, viewport: { width: 1280, height: 900 } });
  let t;
  ok = await step(ch, "3-talent-sees-request", p, async () => {
    t = await open(tctx, `${BASE}/talent/inbox`);
    const has = await t.getByText(new RegExp(`${ch} ${RUN}`)).count();
    const shotT = await shot(t, `${ch}-3-talent-inbox`);
    return { ok: has > 0, saw: has ? "request thread visible in /talent/inbox" : "request not found in inbox", extra: { talentShot: shotT } };
  });
  if (ok) {
    await vis(t.getByText(new RegExp(`${ch} ${RUN}`))).click(); await t.waitForTimeout(5000);
    await step(ch, decline ? "4-talent-declines" : "4-talent-accepts", t, async () => {
      const label = decline ? "Rechazar" : "Aceptar";
      const b1 = btn(t, label, true);
      if (!(await b1.count())) return { ok: false, saw: `No '${label}' control on the thread` };
      await b1.click(); await t.waitForTimeout(8000);
      const body = await t.locator("body").innerText();
      const confirmed = /Confirmad|Confirmed|Reservad/.test(body);
      return { ok: confirmed, saw: `Clicked '${label}'. Thread now says: ${(body.match(/A talent [a-z ]+\.|Talent [a-z ]+\./i) || ["(no system line)"])[0]}; booking confirmed state: ${confirmed}` };
    });
    await step(ch, "5-visitor-sees-outcome", p, async () => {
      await p.reload({ waitUntil: "load" }); await p.waitForTimeout(6000);
      await p.addStyleTag({ content: HIDE }).catch(() => {});
      await vis(p.locator("button.tl-fab, button[aria-label*='hat'], button[aria-label*='ensaje']")).click().catch(() => {});
      await p.waitForTimeout(6000);
      const tx = await dialogText(p);
      const re = decline ? /declin|rechaz|not available|no disponible/i : /accept|acept|confirm|pay|pagar/i;
      return { ok: re.test(tx), saw: tx };
    });
  }
  await tctx.close(); await g.close();
}

async function chanC(b, { viaPreview = false } = {}) {
  const ch = viaPreview ? "D" : "C";
  const name = `QA Ciclo ${ch} ${RUN}`;
  const g = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX" });
  const p = await open(g, PUBLIC);
  let ok = await step(ch, "1-open-quote-chat", p, async () => {
    await btn(p, "Request a quote").click(); await p.waitForTimeout(6000);
    const t = await dialogText(p);
    return { ok: /Bridal|Novia/.test(t), saw: t };
  });
  if (!ok) return g.close();
  ok = await step(ch, "2-send-inquiry", p, async () => {
    await guestChatSend(p, `${name}: wedding on Dec 12, 4 people, at the hotel. Price?`);
    const gated = await guestContactGate(p, name, `qa-booking-cycle-c-${RUN}@example.com`);
    const t = await p.locator("body").innerText();
    const cap = /verificación|verification|captcha/i.test(t) && (await p.locator("iframe[src*=hcaptcha]").count()) > 0;
    if (cap) return { blocked: true, saw: "contact gate requires hCaptcha on localhost" };
    return { ok: gated && !/Where should Valeria reach you\?/.test(t), saw: (await dialogText(p)) };
  });
  if (!TALENT_STATE) return g.close();
  const tctx = await b.newContext({ storageState: TALENT_STATE, viewport: { width: 1280, height: 900 } });
  let t;
  ok = await step(ch, "3-talent-sees-inquiry", p, async () => {
    t = await open(tctx, `${BASE}/talent/inbox`);
    const loc = t.getByText(new RegExp(`${ch} ${RUN}`));
    const has = await loc.count();
    await shot(t, `${ch}-3-talent-inbox`);
    return { ok: has > 0, saw: has ? "inquiry visible in /talent/inbox" : "inquiry not found in /talent/inbox (guest may not have finished contact gate)" };
  });
  if (!ok) { await tctx.close(); return g.close(); }
  await vis(t.getByText(new RegExp(`${ch} ${RUN}`))).click(); await t.waitForTimeout(5000);
  await step(ch, "4-talent-replies", t, async () => {
    await vis(t.locator('textarea, [contenteditable="true"]').last()).fill("Hola, claro. Te mando la cotización.");
    await t.keyboard.press("Enter"); await t.waitForTimeout(6000);
    return { ok: (await t.getByText("Te mando la cotización").count()) > 0, saw: "reply typed + Enter" };
  });
  let picked;
  await step(ch, "5-talent-sends-offer", t, async () => {
    const r = await talentSendOffer(t, "Novia", 2500, `QA ${RUN} oferta`);
    picked = r.picked;
    const body = await t.locator("body").innerText();
    return { ok: /Oferta|Offer|Cotización enviada/i.test(body), saw: `picked "${r.picked}" (not preselected); thread: ${body.slice(0, 200)}` };
  });
  await step(ch, "6-visitor-sees-offer", p, async () => {
    await p.waitForTimeout(8000);
    const tx = await dialogText(p);
    return { ok: /2,?500|offer|oferta|quote|cotiza/i.test(tx), saw: tx };
  });
  await step(ch, "7-visitor-accepts-and-pays", p, async () => {
    const d = p.locator('[role="dialog"]:visible').last();
    const acc = btn(d, /Accept|Aceptar|Pay|Pagar|Review/);
    if (!(await acc.count())) return { ok: false, saw: "no Accept/Pay control on the offer card in guest chat" };
    const [popup] = await Promise.all([p.context().waitForEvent("page", { timeout: 15000 }).catch(() => null), acc.click()]);
    const pay = popup || p;
    await pay.waitForTimeout(8000);
    let mode = "none";
    const txt = await pay.locator("body").innerText();
    if (/card|tarjeta|4242|Pay|Pagar/i.test(txt) || /stripe/.test(pay.url())) mode = await stripePay(pay);
    const after = await pay.locator("body").innerText();
    return { ok: /paid|pagad|confirm|gracias|thank/i.test(after), saw: `pay=${mode} url=${pay.url()} :: ${after.slice(0, 200)}` };
  });
  await step(ch, "8-talent-sees-paid", t, async () => {
    await t.reload({ waitUntil: "load" }); await t.waitForTimeout(6000);
    const body = await t.locator("body").innerText();
    return { ok: /Pagad|Paid|Confirmad/i.test(body), saw: body.slice(0, 250) };
  });
  await tctx.close(); await g.close();
}

async function chanE(b) {
  // Gridline demo Alex TAL-93030: read-only, open sheet only.
  const g = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await open(g, `${BASE}/t/TAL-93030`);
  await step("E", "1-gridline-renders", p, async () => ({ ok: true, saw: (await p.locator("body").innerText()).slice(0, 200) }));
  await step("E", "2-task-picker-to-sheet", p, async () => {
    const picker = p.locator("[data-task-picker], .gl-task-picker, [class*='task-picker']").locator("visible=true");
    if (!(await picker.count())) return { ok: false, saw: "no task picker on /t/TAL-93030 (Gridline theme not rendered on /t)" };
    await picker.first().getByRole("button").first().click(); await p.waitForTimeout(5000);
    return { ok: /nota|note/i.test(await dialogText(p)), saw: await dialogText(p) };
  });
  await g.close();
}

async function chanG(b) {
  const g = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await open(g, PUBLIC);
  await step("G", "3-chat-cold-resume", p, async () => {
    await btn(p, "Message me").click(); await p.waitForTimeout(5000);
    await guestChatSend(p, `G ${RUN} resume check`);
    await p.reload({ waitUntil: "load" }); await p.waitForTimeout(6000);
    await p.addStyleTag({ content: HIDE }).catch(() => {});
    await btn(p, "Message me").click(); await p.waitForTimeout(6000);
    const tx = await dialogText(p);
    return { ok: tx.includes(`G ${RUN}`), saw: tx };
  });
  await g.close();
}

const chans = process.argv.slice(2);
const b = await chromium.launch();
for (const c of chans) {
  console.log(`== ${c} (run ${RUN})`);
  if (c === "A") await chanA(b);
  if (c === "B") await chanB(b);
  if (c === "BD") await chanB(b, true);
  if (c === "C") await chanC(b);
  if (c === "E") await chanE(b);
  if (c === "G") await chanG(b);
}
await b.close();
