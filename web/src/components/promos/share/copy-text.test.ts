import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPromoLink } from "@/lib/promos/share/links";
import { copyText } from "./copy-text";
import { PROMO_SHARE_LAYER } from "./layers";

type G = Record<string, unknown>;
const g = globalThis as unknown as G;

function stubDom(execResult: boolean | "throw") {
  const appended: unknown[] = [];
  g.document = {
    createElement: () => ({ style: {}, setAttribute() {}, focus() {}, select() {}, setSelectionRange() {} }),
    body: { appendChild: (n: unknown) => appended.push(n), removeChild() {} },
    execCommand: () => { if (execResult === "throw") throw new Error("x"); return execResult; },
  };
  return appended;
}
function stubNav(writeText?: (t: string) => Promise<void>) {
  Object.defineProperty(globalThis, "navigator", { value: writeText ? { clipboard: { writeText } } : {}, configurable: true });
}

test("copyText uses the Clipboard API when available", async () => {
  let got = "";
  stubNav(async (t) => { got = t; });
  assert.equal(await copyText("https://a.b/p/x"), true);
  assert.equal(got, "https://a.b/p/x");
});

test("copyText falls back to execCommand when the API rejects or is missing", async () => {
  stubNav(async () => { throw new Error("denied"); });
  const a = stubDom(true);
  assert.equal(await copyText("hi"), true);
  assert.equal(a.length, 1);
  stubNav();
  stubDom(true);
  assert.equal(await copyText("hi"), true);
});

test("copyText returns false when everything fails or text is empty", async () => {
  stubNav();
  stubDom(false);
  assert.equal(await copyText("hi"), false);
  stubDom("throw");
  assert.equal(await copyText("hi"), false);
  assert.equal(await copyText(""), false);
});

test("buildPromoLink yields a full https URL, hub and talent-host", () => {
  assert.equal(buildPromoLink({ origin: "https://ana.example.com/", slug: "hot", via: "link" }), "https://ana.example.com/p/hot?via=link");
  assert.equal(buildPromoLink({ origin: "https://app.tulala.digital", slug: "hot", profileCode: "TAL-1", via: "link" }), "https://app.tulala.digital/t/TAL-1/p/hot?via=link");
});

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

test("share sheet layers above Radix sheets (z-50) and detail is closed while sharing", () => {
  assert.ok(Number(/\d+/.exec(PROMO_SHARE_LAYER)?.[0]) > 50);
  assert.match(read("share/promo-share-sheet.tsx"), /PROMO_SHARE_LAYER/);
  assert.match(read("talent/PromosPage.tsx"), /item=\{shareItem \? null : detail\}/);
});

test("preview pill has readable colour + aria-label; sheets use the dashboard heading", () => {
  const pv = read("talent/PromoPreview.tsx");
  assert.match(pv, /aria-label=\{copy\.t\("preview\.save"[^}]*\}\)\}[^>]*text-\[#1c1c1e\]/);
  for (const f of ["talent/QuickCreateDrawer.tsx", "talent/PromoDetailSheet.tsx", "talent/PromosPage.tsx"]) {
    assert.match(read(f), /UI\.title/, f);
  }
  assert.match(read("talent/ui.tsx"), /title:\s*"font-sans[^"]*normal-case/);
});
