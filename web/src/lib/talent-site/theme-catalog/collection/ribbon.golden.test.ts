/** Ribbon golden / fidelity (TH15). Draft theme: pinned to what was read off the screenshot. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RIBBON_HEADING_FONT, RIBBON_PALETTE, RIBBON_STYLE_TOKEN_DEFAULTS } from "./ribbon";
import { assertDraftTheme, assertItalicMarkersSeeded, find, payloadOf, type N } from "./tranche-test-kit";

describe("ribbon golden (TH15)", () => {
  it("draft registration, bands, tokens, fonts and palette", () => {
    assertDraftTheme("ribbon", RIBBON_PALETTE, RIBBON_STYLE_TOKEN_DEFAULTS, RIBBON_HEADING_FONT);
  });
  it("header is a quiet bar with chapter dots", () => {
    assert.match(JSON.stringify(payloadOf("ribbon").shellTree), /"navChrome":"chapter_dots"/);
  });
  it("centered cover, three-package comparison matrix, photo grid, single review quote", () => {
    const home = payloadOf("ribbon").homeTree as unknown as N[];
    assert.equal(find(home, (n) => n.kind === "services_catalog")!.props!.layout, "matrix");
    assert.equal(find(home, (n) => n.kind === "portfolio")!.props!.layout, "grid");
    assert.equal(find(home, (n) => n.kind === "reviews")!.props!.layout, "single");
    assert.match(JSON.stringify(home[0]), /"align":"center"/);
  });
  it("ES + EN: italic headings carry Spanish overlays (Tu fecha, primero.)", () => {
    assertItalicMarkersSeeded("ribbon");
    assert.match(JSON.stringify(payloadOf("ribbon").homeTree), /Tu fecha, \{i\}primero\{\/i\}\./);
  });
});
