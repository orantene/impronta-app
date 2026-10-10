import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const WEB = join(__dirname, "..", "..", "..");
const view = readFileSync(join(WEB, "src/app/(public)/pay/[code]/CheckoutView.tsx"), "utf8");

describe("paid return page copy (TUL-466)", () => {
  it("the paid view never shows the pre-payment 'nothing is charged' note", () => {
    const start = view.indexOf('case "paid": {');
    assert.ok(start >= 0, "paid state block not found");
    const paid = view.slice(start, view.indexOf("case ", start + 1));
    assert.match(paid, /public\.payPage\.charged/);
    assert.doesNotMatch(paid, /keepSlot|nothingCharged|notCharged/);
  });
  it("es 'back to conversation' carries its accent in every locale file", () => {
    const es = readFileSync(join(WEB, "messages/es.json"), "utf8");
    assert.doesNotMatch(es, /Volver a la conversacion"/);
    for (const l of ["en", "es", "fr"]) {
      assert.match(readFileSync(join(WEB, `messages/${l}.json`), "utf8"), /"paidNote":/);
    }
  });
});
