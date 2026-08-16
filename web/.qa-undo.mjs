import { chromium } from "playwright";
const BASE="http://localhost:3309", PAGE="/w/qa-agency-244988/p/wave2-canvas?edit=1";
const SIGNIN=`${BASE}/api/dev/signin?email=qa-admin@impronta.test&password=${encodeURIComponent("Impronta-QA-Admin-2026!")}&next=${encodeURIComponent(PAGE)}`;
const run=async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1600,height:1000}});
p.setDefaultTimeout(90000);p.setDefaultNavigationTimeout(180000);
await p.goto(SIGNIN,{waitUntil:"domcontentloaded"});
await p.waitForSelector('[data-edit-topbar]',{timeout:120000});
await p.waitForTimeout(10000);
for(let i=0;i<6;i++){await p.getByRole('button',{name:/^Undo/}).click().catch(()=>{});await p.waitForTimeout(700)}
await p.waitForTimeout(6000);
console.log('undo x6 sent');
await b.close()};
run().catch(e=>{console.error('ERROR:',e.message);process.exit(1)});
