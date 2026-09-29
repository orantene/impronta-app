import { chromium } from "playwright";
import fs from "node:fs";
const BASE="http://127.0.0.1:3001";
const cookies=fs.readFileSync("/tmp/alba-cookies.txt","utf8").split("\n").filter(l=>l&&!l.startsWith("#")).map(l=>{const p=l.split("\t");return p.length>=7?{name:p[5],value:p[6],url:BASE}:null}).filter(Boolean) as Array<{name:string;value:string;url:string}>;
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
await ctx.addCookies(cookies);
const page=await ctx.newPage();
await page.goto(BASE+"/talent/page-builder",{waitUntil:"domcontentloaded",timeout:60000});
await page.waitForTimeout(4000);
await page.getByRole("button",{name:/^Design$/i}).first().click();
await page.waitForTimeout(400);
await page.locator("[data-testid='design-panel']").getByText(/^Theme$/i).first().click().catch(()=>{});
await page.waitForTimeout(300);
await page.locator("[data-design-open-theme]").first().click().catch(async()=>{await page.keyboard.press("Control+k");await page.waitForTimeout(300);await page.keyboard.type("Open Theme");await page.keyboard.press("Enter");});
await page.waitForTimeout(1200);
const drawer=page.locator('[data-edit-drawer="theme"]');
if(await drawer.count()){
  const discard=drawer.getByRole("button",{name:/Discard changes|Descartar/i});
  if(await discard.count()){await discard.first().click();await page.waitForTimeout(800);console.log("discarded");}
  else {await page.keyboard.press("Escape");console.log("no discard btn");}
}
await browser.close();
