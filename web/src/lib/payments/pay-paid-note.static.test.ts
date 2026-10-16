import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const WEB = join(__dirname, "..", "..", "..");
const view = readFileSync(join(WEB, "src/app/(public)/pay/[code]/CheckoutView.tsx"), "utf8");

describe("paid return page copy (TUL-466)", () => {
  it("the paid view never shows the pre-payment 'nothing is charged' note", () => {
    const paid = view.slice(view.indexOf('phase === "paid"'), view.indexOf('phase === "refunded"'));
    assert.match(paid, /public\.thread\.paidNote/);
    assert.doesNotMatch(paid, /keepSlot/);
  });
  it("es 'back to conversation' carries its accent in every locale file", () => {
    const es = readFileSync(join(WEB, "messages/es.json"), "utf8");
    assert.doesNotMatch(es, /Volver a la conversacion"/);
    for (const l of ["en", "es", "fr"]) {
      assert.match(readFileSync(join(WEB, `messages/${l}.json`), "utf8"), /"paidNote":/);
    }
  });
});

describe("pay page language comes from the page, not the dashboard cookie (TUL-466)", () => {
  const page = readFileSync(join(WEB, "src/app/(public)/pay/[code]/pay-page.tsx"), "utf8");
  it("every CheckoutView on the pay page gets the page locale", () => {
    const views = page.split("<CheckoutView").slice(1).map((v) => v.slice(0, v.indexOf("/>")));
    assert.ok(views.length >= 9);
    for (const v of views) assert.match(v, /locale=\{uiLocale\}/);
    assert.ok(page.indexOf("const uiLocale") < page.indexOf("loadPaymentLinkByCode(admin"), "locale is known before the expired view");
  });
  it("CheckoutView translates with the passed locale", () => {
    assert.match(view, /const t = props\.locale \? translatorFor\(props\.locale\) : dashboardT;/);
  });
  it("es public.thread copy carries its accents", () => {
    const es = JSON.parse(readFileSync(join(WEB, "messages/es.json"), "utf8")).public.thread as Record<string, unknown>;
    const text = Object.values(es).filter((v): v is string => typeof v === "string").join("\n");
    assert.doesNotMatch(text, /\b(pagina|conversacion|sesion|codigo|envio)\b/);
    assert.doesNotMatch(text, /\besta (cerrada|llena|disponible|en camino)\b/);
    assert.match(es.expired as string, /^Esta página de pago está cerrada\./);
  });
});
