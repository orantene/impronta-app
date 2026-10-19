/** Clarity golden / fidelity (TH24). Draft theme: pinned to what was read off the screenshot. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CLARITY_HEADING_FONT, CLARITY_PALETTE, CLARITY_STYLE_TOKEN_DEFAULTS } from "./clarity";
import { assertDraftTheme, find, payloadOf, type N } from "./tranche-test-kit";

describe("clarity golden (TH24)", () => {
  it("draft registration, bands, tokens, fonts and palette", () => {
    assertDraftTheme("clarity", CLARITY_PALETTE, CLARITY_STYLE_TOKEN_DEFAULTS, CLARITY_HEADING_FONT);
  });
  it("request flow: task picker first, then bookable service rows", () => {
    const home = payloadOf("clarity").homeTree as unknown as N[];
    const json = JSON.stringify(home);
    assert.ok(json.indexOf("task_picker") > -1 && json.indexOf("task_picker") < json.indexOf("services_catalog"));
    assert.equal(find(home, (n) => n.kind === "services_catalog")!.props!.layout, "rows");
  });
  it("phone tab bar header, area card, filmstrip of the space", () => {
    assert.match(JSON.stringify(payloadOf("clarity").shellTree), /"navChrome":"bottom_tab"/);
    const home = payloadOf("clarity").homeTree as unknown as N[];
    assert.ok(find(home, (n) => n.kind === "visit"), "approximate area card");
    assert.equal(find(home, (n) => n.kind === "portfolio")!.props!.layout, "filmstrip");
  });
  it("never invents a price, hour or promise: no digits in seeded copy", () => {
    const text = JSON.stringify(payloadOf("clarity").homeTree).match(/"(?:text|title|heading|label)":"[^"]*"/g) ?? [];
    assert.deepEqual(text.filter((t) => /\d/.test(t) && !/\{\{/.test(t) && !/Step \d|Paso \d/.test(t)), []);
  });
  it("ES + EN: Spanish step titles ship in the seed", () => {
    assert.match(JSON.stringify(payloadOf("clarity").homeTree), /Tu solicitud en tres pasos/);
  });
});
