// Usage: node explore.mjs <url> <outprefix> <json steps>  steps: [{click:"text"}|{sel:"css"}|{fill:[css,val]}|{wait:ms}]
import { chromium } from "playwright";
const [url, out, stepsJson] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX", ...(process.env.STATE ? { storageState: process.env.STATE } : {}) });
await ctx.addCookies([{name:"locale",value:process.env.LOC||"es",url:"http://localhost:3001"}]);
const p = await ctx.newPage();
p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,200))}); p.on('pageerror',e=>console.log('PAGEERR',e.message.slice(0,200)));
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await p.waitForLoadState('networkidle',{timeout:60000}).catch(()=>{}); await p.waitForTimeout(3000);
await p.addStyleTag({ content: "[data-consent-banner]{display:none!important}" });
let i = 0;
for (const s of JSON.parse(stepsJson || "[]")) {
  try {
    if (s.click) await p.getByRole("button", { name: s.click, exact: !!s.exact }).first().click({ timeout: 15000 });
    if (s.text) await p.getByText(s.text, { exact: !!s.exact }).locator('visible=true').first().click({ timeout: 15000 });
    if (s.row) await p.locator("div,li,article", { hasText: s.row }).filter({ has: p.getByRole("button", { name: s.btn }) }).last().getByRole("button", { name: s.btn }).click({ timeout: 15000 });
    if (s.re) await p.locator('[role="dialog"]:visible, body').last().getByRole("button", { name: new RegExp(s.re, "i") }).first().click({ timeout: 15000 });
    if (s.press) await p.keyboard.press(s.press);
    if (s.sel) await p.locator(s.sel).first().click({ timeout: 15000 });
    if (s.fill) await p.locator(s.fill[0]).first().fill(s.fill[1], { timeout: 15000 });
    await p.waitForTimeout(s.wait ?? 1500);
  } catch (e) { console.log("STEP FAIL", JSON.stringify(s), e.message.split("\n").slice(0,12).join(" | ")); break; }
  i++;
}
await p.screenshot({ path: `${out}.png`, fullPage: false });
const dlg = p.locator('[role="dialog"]:not([data-consent-banner]):visible').last();
const scope = (await dlg.count()) ? dlg : p.locator("body");
console.log("URL", p.url(), "dialog?", await dlg.count()); if (process.env.DLG) console.log((await dlg.evaluate(e=>e.outerHTML).catch(()=>"")).slice(0,600));
console.log((await scope.innerText()).slice(0, 2500));
const ctl = await scope.locator("button,input,textarea,select").evaluateAll(els => els.filter(e=>e.offsetParent).map(e => `${e.tagName}[${e.getAttribute("type")||""}${e.getAttribute("name")?" name="+e.getAttribute("name"):""}${e.getAttribute("placeholder")?" ph="+e.getAttribute("placeholder"):""}] ${e.textContent.trim().slice(0,40)}`));
console.log(ctl.slice(0,60).join("\n"));
await b.close();
