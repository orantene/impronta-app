import test from "node:test";
import assert from "node:assert/strict";
import { MAGAZINE_BUTTON_CSS } from "./magazine-edition";
import { COMP_CARD_MAGAZINE_CSS } from "./comp-card-block";
import { STATEMENT_FOOTER_MAGAZINE_CSS } from "./statement-footer-block";
import { MAGAZINE_INDEX_CSS } from "./contents-block";

test("K1/K8 button text uses surface token, .2em tracking default", () => {
    assert.ok(MAGAZINE_BUTTON_CSS.includes("color:var(--token-color-surface-raised,var(--sb-mag-bg))"));
    assert.ok(MAGAZINE_BUTTON_CSS.includes("letter-spacing:var(--sb-mag-btn-tracking,.2em)"));
});
test("K2 statement copy 14px/21px", () => {
    assert.ok(STATEMENT_FOOTER_MAGAZINE_CSS.includes("font:400 14px/21px"));
});
test("K3 numeral keeps normal line-height", () => {
    assert.ok(MAGAZINE_INDEX_CSS.includes(".sb-mag-toc i{font:italic 400 22px var("));
});
test("K4/K5 comp card width:auto, label margin 0", () => {
    assert.ok(COMP_CARD_MAGAZINE_CSS.includes("{width:auto;margin:52px 16px 0"));
    assert.ok(COMP_CARD_MAGAZINE_CSS.includes("9.5px/21px"));
});
