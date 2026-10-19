/** Prism golden / fidelity (TH19). Draft theme: pinned to what was read off the screenshot. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRISM_HEADING_FONT, PRISM_LABEL_FONT, PRISM_PALETTE, PRISM_STYLE_TOKEN_DEFAULTS } from "./prism";
import { designTokenDefaults } from "./design-token-defaults";
import { assertDraftTheme, find, payloadOf, type N } from "./tranche-test-kit";

describe("prism golden (TH19)", () => {
  it("draft registration, bands, tokens, fonts and palette", () => {
    assertDraftTheme("prism", PRISM_PALETTE, PRISM_STYLE_TOKEN_DEFAULTS, PRISM_HEADING_FONT);
  });
  it("offers are a comparison matrix with discipline pills", () => {
    const s = find(payloadOf("prism").homeTree as unknown as N[], (n) => n.kind === "services_catalog")!;
    assert.equal(s.props!.layout, "matrix");
    assert.equal(s.props!.categoryNav, "pills");
  });
  it("filter bar header (the discipline filter) and a filterable portfolio", () => {
    assert.match(JSON.stringify(payloadOf("prism").shellTree), /"navChrome":"filter_bar"/);
    assert.equal(find(payloadOf("prism").homeTree as unknown as N[], (n) => n.kind === "portfolio")!.props!.tagFilter, true);
  });
  it("mono labels are the header nav font token (editable), body stays Inter", () => {
    assert.equal(designTokenDefaults("prism")["shell.header-nav-font"], PRISM_LABEL_FONT);
  });
  it("ES + EN: Spanish headings ship in the seed", () => {
    const json = JSON.stringify(payloadOf("prism").homeTree);
    assert.match(json, /Elige una disciplina, mira lo que encaja\./);
    assert.match(json, /¿Tienes un proyecto en mente\?/);
  });
});
