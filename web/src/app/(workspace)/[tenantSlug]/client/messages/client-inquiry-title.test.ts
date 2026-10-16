/** TUL-967: inquiry row titles come from company, then the lineup, then place. */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { clientInquiryTitle } from "./client-thread-adapter";

const FB = "Unnamed inquiry";
const base = { company: null, talentLineup: [], event_location: null };

describe("clientInquiryTitle", () => {
  it("prefers the company", () => {
    assert.equal(clientInquiryTitle({ ...base, company: " Acme ", talentLineup: [{ id: "1", name: "Ana" }] }, FB), "Acme");
  });
  it("uses the talent names when there is no company", () => {
    assert.equal(clientInquiryTitle({ ...base, talentLineup: [{ id: "1", name: "Ana" }] }, FB), "Ana");
    assert.equal(
      clientInquiryTitle({ ...base, talentLineup: [{ id: "1", name: "Ana" }, { id: "2", name: "Luis" }, { id: "3", name: "Eva" }] }, FB),
      "Ana, Luis +1",
    );
  });
  it("falls back to the place, then to the fallback", () => {
    assert.equal(clientInquiryTitle({ ...base, event_location: "Tulum" }, FB), "Tulum");
    assert.equal(clientInquiryTitle(base, FB), FB);
  });
});
