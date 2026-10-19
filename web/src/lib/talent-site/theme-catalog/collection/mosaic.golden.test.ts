/** Mosaic golden / fidelity (TH32). Draft theme: pinned to what was read off the screenshot. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MOSAIC_HEADING_FONT, MOSAIC_PALETTE, MOSAIC_STYLE_TOKEN_DEFAULTS } from "./mosaic";
import { assertDraftTheme, assertItalicMarkersSeeded, find, payloadOf, type N } from "./tranche-test-kit";

describe("mosaic golden (TH32)", () => {
  it("draft registration, bands, tokens, fonts and palette", () => {
    assertDraftTheme("mosaic", MOSAIC_PALETTE, MOSAIC_STYLE_TOKEN_DEFAULTS, MOSAIC_HEADING_FONT);
  });
  it("one portfolio: masonry with the tag filter (W-12) and captions", () => {
    const p = find(payloadOf("mosaic").homeTree as unknown as N[], (n) => n.kind === "portfolio")!;
    assert.equal(p.props!.layout, "masonry");
    assert.equal(p.props!.tagFilter, true);
    assert.equal(p.props!.showCaptions, true);
  });
  it("services are image-led featured cards with category pills", () => {
    const s = find(payloadOf("mosaic").homeTree as unknown as N[], (n) => n.kind === "services_catalog")!;
    assert.equal(s.props!.layout, "featured");
    assert.equal(s.props!.categoryNav, "pills");
    assert.equal(s.props!.showPhoto, true);
  });
  it("side rail header; heavy display weight is an editable token, not a hard-coded font", () => {
    assert.match(JSON.stringify(payloadOf("mosaic").shellTree), /"navChrome":"side_rail"/);
    assert.equal(MOSAIC_STYLE_TOKEN_DEFAULTS["type.display-weight"], "800");
  });
  it("ES + EN: italic headings carry Spanish overlays", () => {
    assertItalicMarkersSeeded("mosaic");
    assert.match(JSON.stringify(payloadOf("mosaic").homeTree), /Fotos, sitio o las dos\./);
  });
});
