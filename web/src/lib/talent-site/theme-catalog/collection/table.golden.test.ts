/** Table golden / fidelity (TH14). Draft theme: pinned to what was read off the screenshot. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TABLE_HEADING_FONT, TABLE_PALETTE, TABLE_STYLE_TOKEN_DEFAULTS } from "./table";
import { assertDraftTheme, assertItalicMarkersSeeded, find, payloadOf, type N } from "./tranche-test-kit";

describe("table golden (TH14)", () => {
  it("draft registration, bands, tokens, fonts and palette", () => {
    assertDraftTheme("table", TABLE_PALETTE, TABLE_STYLE_TOKEN_DEFAULTS, TABLE_HEADING_FONT);
  });
  it("dark warm page with a gold accent (palette is dark)", () => {
    assert.equal(TABLE_PALETTE.page, "#17130E");
    assert.equal(TABLE_PALETTE.accent, "#E3BE7B");
  });
  it("menu is a ruled rate card, the work is a masonry with captions", () => {
    const home = payloadOf("table").homeTree as unknown as N[];
    assert.equal(find(home, (n) => n.kind === "services_catalog")!.props!.layout, "rate_card");
    const p = find(home, (n) => n.kind === "portfolio")!;
    assert.equal(p.props!.layout, "masonry");
    assert.equal(p.props!.showCaptions, true);
  });
  it("hero is a 60/40 split with the italic accent on the name", () => {
    const hero = (payloadOf("table").homeTree as unknown as N[])[0]!;
    assert.equal(hero.props!.ratio, "60-40");
  });
  it("ES + EN: every italic heading has its Spanish overlay; closing line is Spanish", () => {
    assertItalicMarkersSeeded("table");
    assert.match(JSON.stringify(payloadOf("table").homeTree), /Tu noche, tu mesa\./);
  });
  it("header keeps its links and the booking CTA", () => {
    const shell = JSON.stringify(payloadOf("table").shellTree);
    assert.match(shell, /The menu/);
    assert.match(shell, /Contact/);
  });
});
