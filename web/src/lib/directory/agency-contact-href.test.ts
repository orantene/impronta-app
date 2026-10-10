import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { agencyContactHref } from "./agency-contact-href";

describe("agencyContactHref", () => {
  it("points at /contact, not the inquiry chat launcher", () => {
    assert.equal(agencyContactHref("/t/TAL-00031"), "/contact");
    assert.equal(agencyContactHref("/es/t/TAL-00031"), "/es/contact");
  });

  it("attaches hub-profile + code for support context", () => {
    const href = agencyContactHref("/t/TAL-00031", { profileCode: "TAL-00031" });
    assert.match(href, /^\/contact\?/);
    assert.match(href, /source=hub-profile/);
    assert.match(href, /code=TAL-00031/);
  });
});

describe("ProfileDiscoveryCta footer (GRK-050)", () => {
  it("Contact the agency is a /contact link, not ContactTalentButton/chat", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/components/directory/profile-discovery-cta.tsx",
      ),
      "utf8",
    );
    assert.match(src, /agencyContactHref/);
    assert.match(src, /contactImpronta/);
    // Footer must not wire the agency-contact label through the inquiry button.
    const footerBlock = src.slice(src.lastIndexOf("return ("));
    assert.doesNotMatch(
      footerBlock,
      /ContactTalentButton[\s\S]*contactImpronta|contactImpronta[\s\S]*ContactTalentButton/,
    );
  });
});
